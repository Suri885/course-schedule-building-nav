// utils/remindStore.js - 提醒事务数据层
// 事务模型：{ id, title, note, date, time, confirmed, done, createdAt, source }
//   date: 'YYYY-MM-DD' 截止日期（可空 = 不设截止）
//   time: 'HH:mm'      截止时刻，精度到时分
//   confirmed: 是否已确认（未确认 = 待确认的草稿事务）
//   done:      是否已完成
//
// 紧急度分级（按剩余自然天数，可自定义）：
//   默认 红色 ≤ 7 天、黄色 ≤ 14 天、绿色 ≤ 30 天，更远为「远期」

const STORE_KEY = 'reminders'
const LEVEL_KEY = 'remindLevels'
const MIGRATE_FLAG = 'reminders_migrated_v1'

const DAY_MS = 86400000

// 默认阈值：一周红、两周黄、一个月绿
const DEFAULT_LEVELS = { red: 7, yellow: 14, green: 30 }

const LEVEL_TEXT = {
  red: '紧急',
  yellow: '临近',
  green: '从容',
  far: '远期',
  fixed: '固定项目',
  none: '无截止'
}

const LEVEL_ORDER = { red: 0, yellow: 1, green: 2, far: 3, fixed: 4, none: 5 }

function pad2(n) {
  return n < 10 ? '0' + n : '' + n
}

function uid(prefix) {
  return (prefix || 'r') + Date.now().toString(36) + Math.floor(Math.random() * 1000)
}

function todayStr(now) {
  const d = now || new Date()
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate())
}

// 'YYYY-MM-DD' + 'HH:mm' -> 时间戳（无日期返回 null）
function toTs(date, time) {
  if (!date) return null
  const dp = String(date).split('-').map(Number)
  const tp = String(time || '00:00').split(':').map(Number)
  if (!dp[0] || !dp[1] || !dp[2]) return null
  return new Date(dp[0], dp[1] - 1, dp[2], tp[0] || 0, tp[1] || 0, 0, 0).getTime()
}

// ===== 阈值读写 =====
function getLevels() {
  const raw = wx.getStorageSync(LEVEL_KEY)
  if (!raw || typeof raw !== 'object') return Object.assign({}, DEFAULT_LEVELS)
  let red = Number(raw.red)
  let yellow = Number(raw.yellow)
  let green = Number(raw.green)
  if (!(red >= 0)) red = DEFAULT_LEVELS.red
  if (!(yellow >= 0)) yellow = DEFAULT_LEVELS.yellow
  if (!(green >= 0)) green = DEFAULT_LEVELS.green
  // 保证 红 < 黄 < 绿
  if (yellow <= red) yellow = red + 1
  if (green <= yellow) green = yellow + 1
  return { red: red, yellow: yellow, green: green }
}

function saveLevels(levels) {
  const red = Math.max(0, Math.round(Number(levels.red) || 0))
  const yellow = Math.max(red + 1, Math.round(Number(levels.yellow) || 0))
  const green = Math.max(yellow + 1, Math.round(Number(levels.green) || 0))
  const fixed = { red: red, yellow: yellow, green: green }
  wx.setStorageSync(LEVEL_KEY, fixed)
  return fixed
}

function resetLevels() {
  wx.setStorageSync(LEVEL_KEY, Object.assign({}, DEFAULT_LEVELS))
  return Object.assign({}, DEFAULT_LEVELS)
}

// ===== 读写事务 =====
function rawList() {
  const list = wx.getStorageSync(STORE_KEY)
  return Array.isArray(list) ? list : []
}

function saveReminders(list) {
  wx.setStorageSync(STORE_KEY, Array.isArray(list) ? list : [])
}

// 首次使用时把旧的「备忘待办」和「考试倒计时」迁移成事务，只迁移一次。
// 注意：不删除原来的 memos / exams，备忘页与日程表便签功能不受影响。
function migrateIfNeeded() {
  if (wx.getStorageSync(MIGRATE_FLAG)) return
  const list = rawList()
  const exists = {}
  list.forEach(t => { if (t.source) exists[t.source] = true })

  const memos = wx.getStorageSync('memos') || []
  memos.forEach(m => {
    // 考试自动生成的复习备忘由 exams 迁移，避免重复
    if (m.tag && String(m.tag).indexOf('exam:') === 0) return
    const src = 'memo:' + (m.id || '')
    if (exists[src]) return
    list.push({
      id: uid('rm'),
      title: m.content || '未命名事务',
      note: '',
      date: '',
      time: '',
      confirmed: false,
      done: !!m.done,
      createdAt: m.createdAt || Date.now(),
      source: src
    })
  })

  const exams = wx.getStorageSync('exams') || []
  exams.forEach(e => {
    const src = 'exam:' + (e.id || '')
    if (exists[src]) return
    list.push({
      id: uid('rx'),
      title: (e.course || '考试') + ' 考试',
      note: e.content || '',
      date: e.date || '',
      time: e.time || '',
      confirmed: true,
      done: false,
      createdAt: Date.now(),
      source: src
    })
  })

  saveReminders(list)
  wx.setStorageSync(MIGRATE_FLAG, true)
}

function getReminders() {
  migrateIfNeeded()
  return rawList().map(t => Object.assign({}, t))
}

function addReminder(task) {
  const list = rawList()
  const item = {
    id: uid('r'),
    title: String(task.title || '').trim() || '未命名事务',
    note: task.note || '',
    date: task.date || '',
    time: task.time || '',
    confirmed: !!task.confirmed,
    fixed: !!task.fixed,
    pinned: !!task.pinned,
    done: false,
    createdAt: Date.now(),
    source: 'manual'
  }
  list.unshift(item)
  saveReminders(list)
  return item
}

function updateReminder(id, patch) {
  const list = rawList()
  const t = list.find(x => x.id === id)
  if (!t) return null
  Object.keys(patch || {}).forEach(k => { t[k] = patch[k] })
  saveReminders(list)
  return t
}

function removeReminder(id) {
  saveReminders(rawList().filter(x => x.id !== id))
}

// ===== 评分级 =====
function levelOfTask(task, nowMs, levels) {
  const lv = levels || getLevels()
  const now = nowMs || Date.now()
  const ts = toTs(task.date, task.time)
  const base = {
    ts: ts,
    hasDeadline: ts != null,
    deadlineText: '',
    leftText: '未设截止',
    daysLeft: null,
    level: 'none',
    levelText: LEVEL_TEXT.none
  }

  // 固定项目：不设截止日期，长期有效，不参与红黄绿倒计时
  if (task.fixed) {
    base.level = 'fixed'
    base.levelText = LEVEL_TEXT.fixed
    base.leftText = '长期'
    base.urgent = false
    return base
  }

  if (ts == null) return base

  const d = new Date(ts)
  base.deadlineText = (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes())

  const msLeft = ts - now
  const abs = Math.abs(msLeft)
  const days = Math.floor(abs / DAY_MS)
  const hours = Math.floor((abs % DAY_MS) / 3600000)
  const mins = Math.floor((abs % 3600000) / 60000)

  let level
  let leftText
  if (msLeft <= 0) {
    level = 'red'
    leftText = days > 0
      ? '已逾期 ' + days + ' 天' + (hours > 0 ? ' ' + hours + ' 小时' : '')
      : (hours > 0 ? '已逾期 ' + hours + ' 小时' : '已逾期 ' + Math.max(1, mins) + ' 分钟')
  } else {
    const levelDays = Math.ceil(msLeft / DAY_MS)
    if (levelDays <= lv.red) level = 'red'
    else if (levelDays <= lv.yellow) level = 'yellow'
    else if (levelDays <= lv.green) level = 'green'
    else level = 'far'

    if (days >= 1) leftText = '还有 ' + days + ' 天' + (hours > 0 ? ' ' + hours + ' 小时' : '')
    else if (hours >= 1) leftText = '还有 ' + hours + ' 小时 ' + mins + ' 分'
    else leftText = '还有 ' + Math.max(1, mins) + ' 分钟'
  }

  base.level = level
  base.levelText = LEVEL_TEXT[level]
  base.leftText = leftText
  base.daysLeft = msLeft > 0 ? Math.ceil(msLeft / DAY_MS) : 0
  base.urgent = level === 'red'
  return base
}

// 给列表统一补上分级字段并排序：未完成在前 → 剩余时间近的在前 → 无截止的排后
function decorate(list, nowMs, levels) {
  const lv = levels || getLevels()
  const now = nowMs || Date.now()
  const out = list.map(t => Object.assign({}, t, levelOfTask(t, now, lv)))
  out.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1
    if (a.hasDeadline !== b.hasDeadline) return a.hasDeadline ? -1 : 1
    if (a.ts !== b.ts) return (a.ts || 0) - (b.ts || 0)
    return (b.createdAt || 0) - (a.createdAt || 0)
  })
  return out
}

// 已确认的待完成事务（打开提醒页的默认视图）
function getConfirmedPending(nowMs, levels) {
  return decorate(getReminders().filter(t => t.confirmed && !t.done), nowMs, levels)
}

// 首页置顶用：已确认 + 未完成 + 已进入红色（自动）
function getUrgentTasks(nowMs, levels) {
  return getConfirmedPending(nowMs, levels).filter(t => t.level === 'red')
}

// 手动置顶：已确认 + 未完成 + 用户点了置顶
function getPinnedTasks(nowMs, levels) {
  return getConfirmedPending(nowMs, levels).filter(t => t.pinned)
}

module.exports = {
  STORE_KEY,
  LEVEL_KEY,
  DEFAULT_LEVELS,
  LEVEL_TEXT,
  LEVEL_ORDER,
  DAY_MS,
  pad2,
  uid,
  todayStr,
  toTs,
  getLevels,
  saveLevels,
  resetLevels,
  getReminders,
  saveReminders,
  migrateIfNeeded,
  addReminder,
  updateReminder,
  removeReminder,
  levelOfTask,
  decorate,
  getConfirmedPending,
  getUrgentTasks,
  getPinnedTasks
}
