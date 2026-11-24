// utils/reviewStore.js - 错题与背诵：艾宾浩斯遗忘曲线排期 + 资料库检索
//
// 复习间隔（天）：0 / 1 / 2 / 4 / 7 / 15 / 30
//   stage = 已经通过了几轮，nextAt = 今天零点 + INTERVALS[stage] 天
//   「记住了」→ stage + 1，往后推
//   「没记住」→ 回到第 1 档（明天再来）
//
// 资料结构：
//   {
//     id, title, text, answer,
//     images: [原图路径], masks: [遮盖图路径]（下标与 images 对应，空字符串表示未涂抹）,
//     video, createdAt, stage, nextAt,
//     total, correct, history: [{ ts, ok }]
//   }

const STORE_KEY = 'review_items'
const DAY = 86400000

// 艾宾浩斯复习节点（天）：从当天一路拉到半年，覆盖一个学期的期末
const INTERVALS = [0, 1, 2, 4, 7, 15, 30, 60, 90, 120, 180]
const INTERVAL_LABELS = [
  '当天', '1 天后', '2 天后', '4 天后', '7 天后', '15 天后',
  '30 天后', '2 个月后', '3 个月后', '4 个月后', '半年后'
]

function uid() {
  return 'rv' + Date.now().toString(36) + Math.floor(Math.random() * 1000)
}

function dayStart(ts) {
  const d = new Date(ts || Date.now())
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function pad2(n) { return n < 10 ? '0' + n : '' + n }

function dateText(ts) {
  const d = new Date(ts)
  return (d.getMonth() + 1) + '月' + d.getDate() + '日'
}

function getItems() {
  const list = wx.getStorageSync(STORE_KEY)
  return Array.isArray(list) ? list : []
}

function saveItems(list) {
  wx.setStorageSync(STORE_KEY, Array.isArray(list) ? list : [])
}

function addItem(data) {
  const list = getItems()
  const now = Date.now()
  const item = {
    id: uid(),
    title: (data.title || '').trim() || '未命名资料',
    text: data.text || '',
    answer: data.answer || '',
    images: data.images || [],
    masks: data.masks || [],
    video: data.video || '',
    createdAt: now,
    stage: 0,
    scheduled: false,        // 新建只进资料库，用户点「加入复习计划」才开始排期
    nextAt: 0,
    mastered: false,         // 已完全学会：不再进入每日复习队列
    total: 0,
    correct: 0,
    history: []
  }
  list.unshift(item)
  saveItems(list)
  return item
}

function updateItem(id, patch) {
  const list = getItems()
  const t = list.find(x => x.id === id)
  if (!t) return null
  Object.keys(patch || {}).forEach(k => { t[k] = patch[k] })
  saveItems(list)
  return t
}

function removeItem(id) {
  saveItems(getItems().filter(x => x.id !== id))
}

function getItem(id) {
  return getItems().find(x => x.id === id) || null
}

// 复习一次：ok=true 进入下一档，ok=false 回到第 1 档
function markReviewed(id, ok) {
  const list = getItems()
  const t = list.find(x => x.id === id)
  if (!t) return null
  const stage = Number(t.stage) || 0
  let nextStage
  if (ok) nextStage = Math.min(stage + 1, INTERVALS.length - 1)
  else nextStage = 1
  t.stage = nextStage
  t.nextAt = dayStart() + INTERVALS[nextStage] * DAY
  t.total = (t.total || 0) + 1
  t.correct = (t.correct || 0) + (ok ? 1 : 0)
  t.history = (t.history || []).concat([{ ts: Date.now(), ok: !!ok }])
  t.lastAt = Date.now()
  saveItems(list)
  return t
}

// 是否已加入复习计划（老数据没有 scheduled 字段，视为已加入，避免突然消失）
function isScheduled(t) {
  return !!t && t.scheduled !== false
}

// 今天（含逾期）需要复习的：未加入计划、已完全学会的都不出现
function getDueItems(now) {
  const end = dayStart(now) + DAY - 1
  return getItems()
    .filter(t => isScheduled(t) && !t.mastered && (Number(t.nextAt) || 0) <= end)
    .sort((a, b) => (a.nextAt || 0) - (b.nextAt || 0))
}

// 加入 / 移出复习计划
//   加入：归档到第 1 轮，当天就要复习第一遍
//   移出：清掉排期，回到「未加入计划」状态
function setScheduled(id, scheduled) {
  const list = getItems()
  const t = list.find(x => x.id === id)
  if (!t) return null
  if (scheduled) {
    const wasScheduled = isScheduled(t)
    t.scheduled = true
    // 原本未加入计划（或没有排期）时，从第 1 轮、今天开始
    if (!wasScheduled || !t.nextAt) {
      t.stage = 0
      t.nextAt = dayStart()
    }
    t.mastered = false           // 重新加入计划时不再视为「已学会」
    delete t.masteredAt
  } else {
    t.scheduled = false
    t.nextAt = 0
  }
  saveItems(list)
  return t
}

// 标记 / 取消「已完全学会」：标记后不再进入每日复习，取消后立刻回到队列
function setMastered(id, mastered) {
  const list = getItems()
  const t = list.find(x => x.id === id)
  if (!t) return null
  t.mastered = !!mastered
  if (mastered) {
    t.masteredAt = Date.now()
  } else {
    delete t.masteredAt
    t.nextAt = dayStart()   // 回到今天的复习队列
  }
  saveItems(list)
  return t
}

// 全部资料，按创建时间倒序
function getAllItems() {
  return getItems().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
}

// 按关键字检索：标题 / 内容 / 答案，空格分词后需全部命中
function searchItems(keyword) {
  const kw = String(keyword || '').trim().toLowerCase()
  if (!kw) return getAllItems()
  const words = kw.split(/\s+/).filter(Boolean)
  return getAllItems().filter(t => {
    const hay = ((t.title || '') + '\n' + (t.text || '') + '\n' + (t.answer || '')).toLowerCase()
    return words.every(w => hay.indexOf(w) >= 0)
  })
}

// 下次复习的文案
function nextText(item) {
  if (!item) return ''
  if (!isScheduled(item)) return '未加入复习计划'
  if (item.mastered) return '已完全学会'
  const stage = Number(item.stage) || 0
  if (stage >= INTERVALS.length - 1) {
    return dateText(item.nextAt) + '（最后一轮 · 半年后）'
  }
  return dateText(item.nextAt) + '（第 ' + (stage + 1) + ' 轮复习）'
}

// 复习计划文案：今天、1天后、2天后…
function planText() {
  return INTERVAL_LABELS.join(' → ')
}

// 计划的具体日期（用于保存后的提示弹窗）
function planDates(now) {
  const base = dayStart(now)
  return INTERVALS.map((d, i) => ({
    label: INTERVAL_LABELS[i],
    date: dateText(base + d * DAY)
  }))
}

function stats(now) {
  const all = getItems()
  const due = getDueItems(now)
  const mastered = all.filter(t => t.mastered || (Number(t.stage) || 0) >= INTERVALS.length - 1).length
  const flagged = all.filter(t => t.mastered).length
  const unscheduled = all.filter(t => !isScheduled(t)).length
  return { total: all.length, due: due.length, mastered: mastered, flagged: flagged, unscheduled: unscheduled }
}

module.exports = {
  STORE_KEY,
  DAY,
  INTERVALS,
  INTERVAL_LABELS,
  uid,
  dayStart,
  dateText,
  getItems,
  saveItems,
  addItem,
  updateItem,
  getItem,
  removeItem,
  markReviewed,
  setMastered,
  isScheduled,
  setScheduled,
  getDueItems,
  getAllItems,
  searchItems,
  nextText,
  planText,
  planDates,
  stats
}
