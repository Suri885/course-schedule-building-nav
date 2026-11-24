// utils/smart.js - 课表智能核心库（冲突检测 / 空闲分析 / 个性化推荐）
// 全部基于本地数据（courses + events + slots），无后端依赖，与现有架构完全兼容

const { getSlots, toMinutes, weekDays } = require('./courses')

const TYPE_LABEL = { time: '时间', teacher: '教师', room: '教室' }

// 'HH:MM' -> 'HH:MM'
function fmtMin(min) {
  const h = Math.floor(min / 60)
  const m = min % 60
  return (h < 10 ? '0' + h : '' + h) + ':' + (m < 10 ? '0' + m : '' + m)
}

// 分钟数 -> 时长描述
function fmtDur(min) {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h <= 0) return m + '分钟'
  if (m <= 0) return h + '小时'
  return h + '小时' + m + '分钟'
}

// 把课程 + 活动归一化成可直接比较的记录
// 课程：跨多周（weeks 数组），时间来自起止时段；活动：单周，时间来自 startTime/endTime
function collectItems(courses, events, slots) {
  const items = []
  ;(courses || []).forEach(c => {
    const s = slots.find(x => x.period === c.startPeriod)
    const e = slots.find(x => x.period === c.endPeriod)
    if (!s || !e) return
    items.push({
      id: 'c' + c.id,
      kind: 'course',
      name: c.name,
      day: c.dayOfWeek,
      weeks: c.weeks || [],
      startMin: toMinutes(s.start),
      endMin: toMinutes(e.end),
      teacher: (c.teacher || '').trim(),
      location: (c.location || '').trim(),
      raw: c
    })
  })
  ;(events || []).forEach(ev => {
    if (!ev.startTime) return
    items.push({
      id: ev.id,
      kind: 'event',
      name: ev.name,
      day: ev.day,
      weeks: [ev.week],
      startMin: toMinutes(ev.startTime),
      endMin: toMinutes(ev.endTime),
      teacher: '',
      location: (ev.place || '').trim(),
      raw: ev
    })
  })
  return items
}

// 时间是否重叠
function overlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd
}

// 检测一组（同一天）事项之间的冲突
// opts: { teacher: true, room: true } 可关闭某项
// 返回冲突数组，每项 { type, aId, bId, aName, bName, day, detail }
function detectConflicts(items, opts) {
  opts = opts || {}
  const checkTeacher = opts.teacher !== false
  const checkRoom = opts.room !== false
  const out = []
  const n = items.length
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = items[i]
      const b = items[j]
      if (a.day !== b.day) continue
      if (!a.weeks.some(w => b.weeks.includes(w))) continue
      if (!overlap(a.startMin, a.endMin, b.startMin, b.endMin)) continue

      out.push({
        type: 'time',
        aId: a.id, bId: b.id,
        aName: a.name, bName: b.name,
        day: a.day,
        detail: '「' + a.name + '」与「' + b.name + '」时间重叠'
      })
      if (checkTeacher && a.teacher && b.teacher && a.teacher === b.teacher) {
        out.push({
          type: 'teacher',
          aId: a.id, bId: b.id,
          aName: a.name, bName: b.name,
          day: a.day,
          detail: '教师「' + a.teacher + '」同时被「' + a.name + '」和「' + b.name + '」占用'
        })
      }
      if (checkRoom && a.location && b.location && a.location === b.location) {
        out.push({
          type: 'room',
          aId: a.id, bId: b.id,
          aName: a.name, bName: b.name,
          day: a.day,
          detail: '教室「' + a.location + '」同时被「' + a.name + '」和「' + b.name + '」占用'
        })
      }
    }
  }
  return out
}

// 新加/编辑一项时，与现有事项实时比对，返回冲突列表
// candidate: { id?, day, weeks, startMin, endMin, teacher, location }
function checkCandidate(candidate, existingItems, opts) {
  opts = opts || {}
  const clashes = []
  existingItems.forEach(b => {
    if (candidate.id && b.id === candidate.id) return
    if (candidate.day !== b.day) return
    if (!candidate.weeks.some(w => b.weeks.includes(w))) return
    if (!overlap(candidate.startMin, candidate.endMin, b.startMin, b.endMin)) return

    const types = ['time']
    if (opts.teacher !== false && candidate.teacher && b.teacher && candidate.teacher === b.teacher) types.push('teacher')
    if (opts.room !== false && candidate.location && b.location && candidate.location === b.location) types.push('room')
    if (!types.length) return

    clashes.push({
      key: b.id + '|' + types.join(','),
      types: types,
      otherId: b.id,
      otherName: b.name,
      detail: '与「' + b.name + '」冲突（' + types.map(t => TYPE_LABEL[t]).join('、') + '）'
    })
  })
  return clashes
}

// 方便页直接调用的整周冲突（读存储）
function getWeekConflicts(week) {
  const slots = getSlots()
  const courses = wx.getStorageSync('courses') || []
  const events = wx.getStorageSync('events') || []
  const items = collectItems(courses, events, slots).filter(it => it.weeks.includes(week))
  const byDay = {}
  items.forEach(it => { (byDay[it.day] = byDay[it.day] || []).push(it) })
  const list = []
  Object.keys(byDay).forEach(d => detectConflicts(byDay[d]).forEach(c => list.push(c)))
  return list
}

// 在 [winStart, winEnd] 时间窗内，根据已有事项求空闲时段
// dayItems: [{ startMin, endMin }]；minDur：最小可用时长（分钟）
// 返回 [{ start, end, dur, startStr, endStr, durStr }]
function findFreeSlots(dayItems, winStart, winEnd, minDur) {
  winStart = winStart == null ? 8 * 60 : winStart
  winEnd = winEnd == null ? 22 * 60 : winEnd
  minDur = minDur || 45
  const sorted = (dayItems || []).slice().sort((a, b) => a.startMin - b.startMin)
  const gaps = []
  let cursor = winStart
  sorted.forEach(it => {
    if (it.startMin > cursor) {
      const gapStart = cursor
      const gapEnd = Math.min(it.startMin, winEnd)
      if (gapEnd - gapStart >= minDur) gaps.push({ start: gapStart, end: gapEnd, dur: gapEnd - gapStart })
    }
    cursor = Math.max(cursor, it.endMin)
  })
  if (winEnd > cursor) {
    const gapStart = cursor
    const gapEnd = winEnd
    if (gapEnd - gapStart >= minDur) gaps.push({ start: gapStart, end: gapEnd, dur: gapEnd - gapStart })
  }
  gaps.forEach(g => {
    g.startStr = fmtMin(g.start)
    g.endStr = fmtMin(g.end)
    g.durStr = fmtDur(g.dur)
  })
  return gaps
}

// ===== 个性化推荐：基于使用习惯的轻量统计 =====
function getUsageStats() {
  return wx.getStorageSync('usageStats') || { eventsByDay: {}, eventsByHour: {} }
}

function recordEventUsage(day, startMin) {
  const stats = getUsageStats()
  stats.eventsByDay[day] = (stats.eventsByDay[day] || 0) + 1
  const h = Math.floor(startMin / 60)
  stats.eventsByHour[h] = (stats.eventsByHour[h] || 0) + 1
  wx.setStorageSync('usageStats', stats)
  return stats
}

// 根据整周空闲 + 使用习惯生成推荐文案
// smartDays: [{ day, label, gaps: [{startStr,endStr,dur,durStr}] }]
function buildRecommendations(smartDays, usage) {
  const recs = []
  let best = null
  ;(smartDays || []).forEach(d => {
    ;(d.gaps || []).forEach(g => {
      if (!best || g.dur > best.dur) best = { label: d.label, start: g.startStr, end: g.endStr, dur: g.dur, durStr: g.durStr }
    })
  })
  if (best) {
    recs.push({
      icon: '💡',
      text: '本周最大空闲：周' + best.label + ' ' + best.start + '-' + best.end + '（' + best.durStr + '），适合安排自习或会议'
    })
  }
  const byDay = (usage && usage.eventsByDay) || {}
  let favDay = null
  let max = 0
  Object.keys(byDay).forEach(k => { if (byDay[k] > max) { max = byDay[k]; favDay = k } })
  if (favDay && max >= 2) {
    const label = '一二三四五六日'[favDay - 1] || favDay
    recs.push({
      icon: '📊',
      text: '你的习惯：常在周' + label + '安排活动（已' + max + '次），可优先考虑这一侧'
    })
  }
  return recs
}

module.exports = {
  collectItems,
  detectConflicts,
  checkCandidate,
  getWeekConflicts,
  findFreeSlots,
  buildRecommendations,
  getUsageStats,
  recordEventUsage,
  fmtMin,
  fmtDur,
  TYPE_LABEL
}
