// pages/index/index.js - 课表主页逻辑
const { getSlots, saveSlots, slotsOverlap, weekDays, courseColors, toMinutes } = require('../../utils/courses')
const smart = require('../../utils/smart')

// 当天事项的类型图标
const EVENT_KINDS = {
  course: { icon: '📚', label: '课程' },
  meeting: { icon: '👥', label: '会议' },
  lecture: { icon: '🎤', label: '讲座' },
  other: { icon: '📌', label: '事项' }
}

Page({
  data: {
    currentWeek: 1,
    totalWeeks: 20,
    weekDays: weekDays,
    todayDay: 0,
    week1MondayMs: 0,
    dayList: [],           // 7天卡片数据（每天含 items 数组）
    weekAllEmpty: false,   // 本周全空时显示大提示
    weekIsThis: true,      // 当前查看的是否为「本周」（决定是否置顶今日）
    conflictCount: 0,      // 本周冲突总数（智能按钮角标用）

    // 智能面板（空闲分析 + 个性化推荐）
    smartOpen: false,
    smartDays: [],         // 7天各自的空闲时段
    smartRecs: [],         // 推荐文案

    // 本周空闲时间（周视图顶栏那一行，针对当前查看的这一周）
    freeOpen: false,
    freeDays: [],          // 当前周的 7 天空闲时段
    freeSummary: '',       // 一句话汇总：共 X 小时可用 · 最长 周三 18:00-22:00

    // 添加活动面板的实时冲突提示
    evConflicts: [],

    // 时段管理面板
    showSlotPanel: false,
    slotList: [],
    newSlotLabel: '',
    newSlotStart: '12:00',
    newSlotEnd: '13:20',
    dayToggleList: [
      { day: 1, label: '一', on: true },
      { day: 2, label: '二', on: true },
      { day: 3, label: '三', on: true },
      { day: 4, label: '四', on: true },
      { day: 5, label: '五', on: true },
      { day: 6, label: '六', on: true },
      { day: 7, label: '日', on: true }
    ],
    weekOptions: Array.from({ length: 20 }, function (_, i) { return String(i + 1) }),
    newSlotWeekStart: 0,
    newSlotWeekEnd: 15,

    // 添加当天事项面板
    showEventPanel: false,
    evName: '',
    evKind: 'course',        // course 课程 / meeting 会议 / lecture 讲座 / other 其他
    evTimeMode: 'slot',      // slot 按节次 / time 按时间
    evStartPeriodIdx: 0,
    evEndPeriodIdx: 1,
    evSlotLabels: [],
    evStart: '14:00',
    evEnd: '15:30',
    evPlace: '',
    evNote: '',
    evDay: 1,
    evWeek: 1,
    evDayFixed: false,
    evDayText: '',
    dayOptions: ['一', '二', '三', '四', '五', '六', '日']
  },

  onLoad() {
    const today = new Date().getDay()
    const todayDay = today === 0 ? 7 : today

    const semesterStart = wx.getStorageSync('semesterStart')
    let week1MondayMs
    if (semesterStart) {
      week1MondayMs = new Date(semesterStart).getTime()
      const d = new Date(week1MondayMs)
      d.setHours(0, 0, 0, 0)
      week1MondayMs = d.getTime()
      const dow = d.getDay() || 7
      if (dow !== 1) {
        d.setDate(d.getDate() - (dow - 1))
        week1MondayMs = d.getTime()
      }
    } else {
      const todayDate = new Date()
      todayDate.setHours(0, 0, 0, 0)
      week1MondayMs = todayDate.getTime() - (todayDay - 1) * 86400000
    }

    // 一打开就定位到「今天」所在的周，不用从第1周滑过来
    const currentWeek = this.computeCurrentWeek(week1MondayMs)

    this.setData({ todayDay: todayDay, week1MondayMs: week1MondayMs, currentWeek: currentWeek })
    this.loadSchedule()
  },

  // 根据学期起始（第1周周一）与今天，算出当前应显示第几周（夹在 1 ~ totalWeeks 之间）
  computeCurrentWeek(week1MondayMs) {
    const totalWeeks = this.data.totalWeeks
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    const dayDiff = Math.floor((now.getTime() - week1MondayMs) / 86400000)
    let week = Math.floor(dayDiff / 7) + 1
    if (week < 1) week = 1
    if (week > totalWeeks) week = totalWeeks
    return week
  },

  onShow() {
    this.loadSchedule()
  },

  loadSchedule() {
    const slots = getSlots()
    this.migrateEvents(slots)
    const courses = wx.getStorageSync('courses') || []
    const week = this.data.currentWeek
    // 只有当前显示的正是「本周」时，才把今天置顶并打「今天」标记
    const isThisWeek = week === this.computeCurrentWeek(this.data.week1MondayMs)
    const dayList = this.buildDayList(courses, slots, week, isThisWeek)

    // 计算本周冲突，给每个事项打标记（时间/教师/教室三类）
    const conflicts = this.computeWeekConflicts(courses, slots, week)
    const conflictCount = conflicts.list.length
    dayList.forEach(day => {
      day.items.forEach(it => {
        const c = conflicts.byItem[it.key]
        if (c) {
          it.conflict = true
          it.conflictTypes = c.types
          it.conflictText = c.types.map(t => smart.TYPE_LABEL[t]).join('、')
        }
      })
    })

    const weekAllEmpty = dayList.every(d => d.empty)

    // 当前这一周的空闲时段（8:00-22:00，只算 ≥45 分钟的整段）
    const free = this.computeWeekFree(courses, slots, week)

    this.setData({
      dayList: dayList,
      weekAllEmpty: weekAllEmpty,
      conflictCount: conflictCount,
      weekIsThis: isThisWeek,
      freeDays: free.days,
      freeSummary: free.summary
    })
  },

  // 求某一周 7 天的空闲时段：课程 + 当天事项都算占用
  computeWeekFree(courses, slots, week) {
    const events = wx.getStorageSync('events') || []
    const items = smart.collectItems(courses, events, slots).filter(it => it.weeks.includes(week))
    const byDay = {}
    items.forEach(it => { (byDay[it.day] = byDay[it.day] || []).push({ startMin: it.startMin, endMin: it.endMin }) })

    let totalMin = 0
    let longest = null
    const days = weekDays.map(d => {
      const gaps = smart.findFreeSlots(byDay[d.day] || [], 8 * 60, 22 * 60, 45)
      const dayMin = gaps.reduce((sum, g) => sum + g.dur, 0)
      totalMin += dayMin
      gaps.forEach(g => {
        if (!longest || g.dur > longest.dur) {
          longest = { label: d.label, start: g.startStr, end: g.endStr, dur: g.dur }
        }
      })
      return {
        day: d.day,
        label: d.label,
        gaps: gaps,
        totalStr: dayMin > 0 ? smart.fmtDur(dayMin) : '无整段空闲',
        empty: gaps.length === 0
      }
    })

    let summary = ''
    if (totalMin <= 0) {
      summary = '整周已排满，没有 45 分钟以上的整段空闲'
    } else {
      summary = '共 ' + smart.fmtDur(totalMin) + ' 可用'
      if (longest) summary += ' · 最长 周' + longest.label + ' ' + longest.start + '-' + longest.end
    }

    return { days: days, summary: summary }
  },

  toggleFree() {
    this.setData({ freeOpen: !this.data.freeOpen })
  },

  // 点本周空闲时段：带日期和时间直接打开「添加当天事项」
  onFreeGapTap(e) {
    const day = e.currentTarget.dataset.day
    const start = e.currentTarget.dataset.start
    const end = e.currentTarget.dataset.end
    this.openEventPanel(day)
    this.setData({ evTimeMode: 'time', evStart: start, evEnd: end })
    this.recomputeEvConflicts()
  },

  // 计算某周的冲突（返回 { list, byItem }）
  computeWeekConflicts(courses, slots, week) {
    const items = smart.collectItems(courses, wx.getStorageSync('events') || [], slots)
      .filter(it => it.weeks.includes(week))
    const byDay = {}
    items.forEach(it => { (byDay[it.day] = byDay[it.day] || []).push(it) })
    const list = []
    const byItem = {}
    Object.keys(byDay).forEach(d => {
      smart.detectConflicts(byDay[d]).forEach(c => {
        list.push(c)
        ;[c.aId, c.bId].forEach(id => {
          byItem[id] = byItem[id] || { types: [] }
          if (byItem[id].types.indexOf(c.type) < 0) byItem[id].types.push(c.type)
        })
      })
    })
    return { list, byItem }
  },

  migrateEvents(slots) {
    const events = wx.getStorageSync('events') || []
    let changed = false
    events.forEach(ev => {
      if (!ev.startTime && ev.period != null) {
        const s = slots.find(x => x.period === ev.period)
        if (s) {
          ev.startTime = s.start
          ev.endTime = s.end
          changed = true
        }
      }
    })
    if (changed) wx.setStorageSync('events', events)
  },

  // 构建7天卡片数据：每天含排序后的课程+活动+便签
  buildDayList(courses, slots, week, isThisWeek) {
    const order = id => slots.findIndex(s => s.period === id)
    const allEvents = (wx.getStorageSync('events') || []).filter(ev => ev.week === week && ev.startTime)
    const linkedMemos = (wx.getStorageSync('memos') || []).filter(m => m.link && !m.done)

    const week1Mon = this.data.week1MondayMs || 0
    const thisWeekMonMs = week1Mon + (week - 1) * 7 * 86400000

    const cards = weekDays.map((d, dayIdx) => {
      const items = []

      // 课程
      courses.filter(c => c.dayOfWeek === d.day && c.weeks.includes(week)).forEach(c => {
        const sIdx = order(c.startPeriod)
        const eIdx = order(c.endPeriod)
        if (sIdx < 0 || eIdx < 0 || eIdx < sIdx) return
        const s = slots[sIdx]
        const e = slots[eIdx]
        items.push({
          key: 'c' + c.id,
          type: 'course',
          id: c.id,
          name: c.name,
          teacher: c.teacher || '',
          location: c.location || '',
          color: c.color || 'blue',
          note: c.note || '',
          startTime: s.start,
          endTime: e.end,
          timeLabel: s.start + ' - ' + e.end,
          periodLabel: eIdx > sIdx ? s.label + '~' + e.label : s.label,
          sortTime: toMinutes(s.start)
        })
      })

      // 当天事项（课程 / 会议 / 讲座 / 其他）
      allEvents.filter(ev => ev.day === d.day).forEach(ev => {
        const kind = EVENT_KINDS[ev.kind] || EVENT_KINDS.other
        items.push({
          key: ev.id,
          type: 'event',
          id: ev.id,
          name: ev.name,
          place: ev.place || '',
          note: ev.note || '',
          kind: ev.kind || 'other',
          kindIcon: kind.icon,
          kindLabel: kind.label,
          startTime: ev.startTime,
          endTime: ev.endTime,
          timeLabel: ev.startTime + ' - ' + ev.endTime,
          week: ev.week,
          day: ev.day,
          sortTime: toMinutes(ev.startTime)
        })
      })

      // 便签
      linkedMemos.filter(m => m.link.day === d.day).forEach(m => {
        const slot = slots.find(s => s.period === m.link.slotId)
        items.push({
          key: m.id,
          type: 'memo',
          id: m.id,
          content: m.content,
          startTime: slot ? slot.start : '',
          endTime: slot ? slot.end : '',
          timeLabel: slot ? slot.start + ' - ' + slot.end : '',
          periodLabel: slot ? slot.label : '',
          sortTime: slot ? toMinutes(slot.start) : 1440
        })
      })

      items.sort((a, b) => a.sortTime - b.sortTime)

      let dateLabel = ''
      let todayFlag = false
      if (week1Mon > 0) {
        const dt = new Date(thisWeekMonMs + dayIdx * 86400000)
        dateLabel = (dt.getMonth() + 1) + '月' + dt.getDate() + '日'
        todayFlag = isThisWeek && d.day === this.data.todayDay
      }

      return {
        day: d.day,
        label: d.label,
        date: dateLabel,
        today: todayFlag,
        items: items,
        empty: items.length === 0
      }
    })

    // 本周视图：今日任务置顶，其余依旧按周一 → 周日的自然顺序排列
    if (isThisWeek) {
      const todayIdx = cards.findIndex(c => c.today)
      if (todayIdx > 0) {
        const todayCard = cards.splice(todayIdx, 1)[0]
        cards.unshift(todayCard)
      }
    }
    return cards
  },

  // 统一的块点击：课程看详情、活动看详情、便签看详情
  onBlockTap(e) {
    const item = e.currentTarget.dataset.item
    if (!item) return
    if (item.type === 'event') {
      this.showEventDetail(item)
    } else if (item.type === 'course') {
      const courses = wx.getStorageSync('courses') || []
      const c = courses.find(x => String(x.id) === String(item.id))
      if (c) this.showCourseDetail(c)
    } else if (item.type === 'memo') {
      const memos = wx.getStorageSync('memos') || []
      const m = memos.find(mm => mm.id === item.id)
      if (!m) return
      const slots = getSlots()
      const slot = slots.find(s => s.period === m.link.slotId)
      const dayLabel = '周' + '一二三四五六日'[m.link.day - 1]
      const where = dayLabel + ' ' + (slot ? slot.label + ' ' + slot.start + '-' + slot.end : '')
      wx.showModal({
        title: '便签',
        content: m.content + '\n位置：' + where + '（每周显示）',
        cancelText: '关闭',
        confirmText: '取消关联',
        success: (res) => {
          if (res.confirm) {
            const target = memos.find(mm => mm.id === m.id)
            if (target) {
              delete target.link
              wx.setStorageSync('memos', memos)
              this.loadSchedule()
              wx.showToast({ title: '已从课表移除', icon: 'success' })
            }
          }
        }
      })
    }
  },

  // 统一的块长按：课程确认删除、活动确认删除
  onBlockLongPress(e) {
    const item = e.currentTarget.dataset.item
    if (!item) return
    if (item.type === 'event') {
      this.deleteEvent(item)
    } else if (item.type === 'course') {
      const courses = wx.getStorageSync('courses') || []
      const c = courses.find(x => String(x.id) === String(item.id))
      if (c) this.confirmDelete(c)
    }
  },

  // 上一周
  prevWeek() {
    if (this.data.currentWeek > 1) {
      this.setData({ currentWeek: this.data.currentWeek - 1 })
      this.loadSchedule()
    } else {
      wx.showToast({ title: '已是第1周', icon: 'none' })
    }
  },

  nextWeek() {
    if (this.data.currentWeek < this.data.totalWeeks) {
      this.setData({ currentWeek: this.data.currentWeek + 1 })
      this.loadSchedule()
    } else {
      wx.showToast({ title: '已是第' + this.data.totalWeeks + '周', icon: 'none' })
    }
  },

  // 屏幕左右滑动手势：横向滑动超过阈值且以横向为主时切换周
  onTouchStart(e) {
    const t = (e.touches && e.touches[0]) || null
    this._sx = t ? t.clientX : null
    this._sy = t ? t.clientY : null
  },

  onTouchEnd(e) {
    if (this._sx == null) return
    const t = (e.changedTouches && e.changedTouches[0]) || null
    const dx = (t ? t.clientX : this._sx) - this._sx
    const dy = (t ? t.clientY : this._sy) - this._sy
    this._sx = this._sy = null
    if (Math.abs(dx) >= 50 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) this.nextWeek()   // 向左滑 → 下一周
      else this.prevWeek()          // 向右滑 → 上一周
    }
  },

  // 总加号：专注于「批量添加课程」场景（单天零散事项请用每天卡片上的加号）
  onFabTap() {
    wx.showActionSheet({
      itemList: ['批量添加课程', '智能统一导入', '🗑 清空全部课表'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.goAddCourse(true)
        } else if (res.tapIndex === 1) {
          this.goImport()
        } else if (res.tapIndex === 2) {
          this.resetAllData()
        }
      }
    })
  },

  // 某一天卡片上的快捷加号：把日期带进面板，直接记当天的事项
  onDayAdd(e) {
    const day = Number(e.currentTarget.dataset.day)
    this.openEventPanel(day)
  },

  goImport() {
    wx.navigateTo({ url: '/pages/import/import' })
  },

  // ===== 当天事项面板（每日快捷加号 / 智能空闲格） =====
  openEventPanel(day) {
    const defaultDay = day || (this.data.todayDay || 1)
    const slots = getSlots()
    this.setData({
      showEventPanel: true,
      evName: '',
      evPlace: '',
      evNote: '',
      evKind: 'course',
      evTimeMode: 'slot',
      evStartPeriodIdx: 0,
      evEndPeriodIdx: 1,
      evStart: '14:00',
      evEnd: '15:30',
      evDay: defaultDay,
      evWeek: this.data.currentWeek,
      evSlotLabels: slots.map(s => s.label + ' ' + s.start),
      evDayFixed: !!day,
      evDayText: this.dayDateText(defaultDay),
      evConflicts: []
    })
    this.recomputeEvConflicts()
  },

  // 「周X · 11月11日」这样的日期文案
  dayDateText(day, week) {
    const base = '周' + '一二三四五六日'[day - 1]
    const mon = this.data.week1MondayMs
    if (!mon) return base
    const wk = week || this.data.currentWeek
    const dt = new Date(mon + (wk - 1) * 7 * 86400000 + (day - 1) * 86400000)
    return base + ' · ' + (dt.getMonth() + 1) + '月' + dt.getDate() + '日'
  },

  // 当前面板对应的起止时间（按节次 或 按时间）
  eventTimes() {
    const slots = getSlots()
    if (this.data.evTimeMode === 'slot') {
      const s = slots[this.data.evStartPeriodIdx] || slots[0]
      const e = slots[this.data.evEndPeriodIdx] || s
      if (!s) return { startTime: '08:00', endTime: '09:35' }
      return { startTime: s.start, endTime: e.end }
    }
    return { startTime: this.data.evStart, endTime: this.data.evEnd }
  },

  // 活动面板：根据当前选择的时间/星期/周次/地点，实时检测与已有事项的冲突
  recomputeEvConflicts() {
    const { evDay, evWeek, evPlace } = this.data
    const times = this.eventTimes()
    if (times.startTime >= times.endTime) { this.setData({ evConflicts: [] }); return }
    const slots = getSlots()
    const candidate = {
      id: '__new__',
      day: evDay,
      weeks: [evWeek],
      startMin: toMinutes(times.startTime),
      endMin: toMinutes(times.endTime),
      teacher: '',
      location: (evPlace || '').trim()
    }
    const existing = smart.collectItems(
      wx.getStorageSync('courses') || [],
      wx.getStorageSync('events') || [],
      slots
    )
    const clashes = smart.checkCandidate(candidate, existing, { teacher: true, room: true })
    this.setData({ evConflicts: clashes })
  },

  closeEventPanel() {
    this.setData({ showEventPanel: false })
    this.loadSchedule()
  },

  inputEvName() {
    wx.showModal({
      title: '活动名称',
      editable: true,
      placeholderText: '如：班会 / 社团例会 / 讲座',
      content: this.data.evName,
      success: (res) => {
        if (res.confirm) this.setData({ evName: (res.content || '').trim() })
      }
    })
  },

  inputEvPlace() {
    wx.showModal({
      title: '地点（可不填）',
      editable: true,
      placeholderText: '如：主教楼302 / 线上腾讯会议',
      content: this.data.evPlace,
      success: (res) => {
        if (res.confirm) {
          this.setData({ evPlace: (res.content || '').trim() })
          this.recomputeEvConflicts()
        }
      }
    })
  },

  inputEvNote() {
    wx.showModal({
      title: '备注（可不填）',
      editable: true,
      placeholderText: '如：带笔记本 / 提前10分钟到',
      content: this.data.evNote,
      success: (res) => {
        if (res.confirm) this.setData({ evNote: (res.content || '').trim() })
      }
    })
  },

  onEvKind(e) {
    const kind = e.currentTarget.dataset.kind
    // 课程默认按节次填；会议/讲座/其他默认按时间填
    const patch = { evKind: kind }
    if (kind === 'course') patch.evTimeMode = 'slot'
    else patch.evTimeMode = 'time'
    this.setData(patch)
    this.recomputeEvConflicts()
  },

  onEvTimeMode(e) {
    this.setData({ evTimeMode: e.currentTarget.dataset.mode })
    this.recomputeEvConflicts()
  },

  onEvStartSlot(e) {
    const idx = Number(e.detail.value)
    const patch = { evStartPeriodIdx: idx }
    if (this.data.evEndPeriodIdx < idx) patch.evEndPeriodIdx = idx
    this.setData(patch)
    this.recomputeEvConflicts()
  },

  onEvEndSlot(e) {
    const idx = Number(e.detail.value)
    if (idx < this.data.evStartPeriodIdx) {
      return wx.showToast({ title: '结束节次不能早于开始', icon: 'none' })
    }
    this.setData({ evEndPeriodIdx: idx })
    this.recomputeEvConflicts()
  },

  onEvStart(e) { this.setData({ evStart: e.detail.value }); this.recomputeEvConflicts() },
  onEvEnd(e) { this.setData({ evEnd: e.detail.value }); this.recomputeEvConflicts() },
  onEvDay(e) {
    const day = parseInt(e.detail.value) + 1
    this.setData({ evDay: day, evDayText: this.dayDateText(day, this.data.evWeek) })
    this.recomputeEvConflicts()
  },
  onEvWeek(e) {
    const week = parseInt(e.detail.value) + 1
    this.setData({ evWeek: week, evDayText: this.dayDateText(this.data.evDay, week) })
    this.recomputeEvConflicts()
  },

  addEvent() {
    const { evName, evPlace, evNote, evDay, evWeek, evKind } = this.data
    const name = (evName || '').trim()
    if (!name) return wx.showToast({ title: '先填写事项名称', icon: 'none' })
    const times = this.eventTimes()
    if (times.startTime >= times.endTime) return wx.showToast({ title: '结束要晚于开始', icon: 'none' })

    const slots = getSlots()
    const that = this

    const doSave = () => {
      const events = wx.getStorageSync('events') || []
      const newEv = {
        id: 'e' + Date.now() + Math.floor(Math.random() * 1000),
        name: name,
        place: evPlace,
        note: evNote,
        kind: evKind || 'other',
        week: evWeek,
        day: evDay,
        startTime: times.startTime,
        endTime: times.endTime,
        createdAt: Date.now()
      }
      events.push(newEv)
      wx.setStorageSync('events', events)
      // 记录使用习惯，用于个性化推荐
      smart.recordEventUsage(evDay, toMinutes(times.startTime))
      that.setData({ showEventPanel: false })
      that.loadSchedule()
      wx.showToast({ title: '已加入当天', icon: 'success' })
    }

    // 统一冲突检测：时间 / 教师 / 教室
    const candidate = {
      id: '__new__',
      day: evDay,
      weeks: [evWeek],
      startMin: toMinutes(times.startTime),
      endMin: toMinutes(times.endTime),
      teacher: '',
      location: (evPlace || '').trim()
    }
    const existing = smart.collectItems(
      wx.getStorageSync('courses') || [],
      wx.getStorageSync('events') || [],
      slots
    )
    const clashes = smart.checkCandidate(candidate, existing, { teacher: true, room: true })

    if (clashes.length) {
      const detail = clashes.map(c => '· ' + c.detail).join('\n')
      wx.showModal({
        title: '检测到冲突',
        content: '仍要添加吗？\n' + detail,
        confirmText: '仍要添加',
        cancelText: '再想想',
        success: (res) => { if (res.confirm) doSave() }
      })
    } else {
      doSave()
    }
  },

  showEventDetail(event) {
    if (!event) return
    const dayLabel = '周' + '一二三四五六日'[event.day - 1]
    const time = event.startTime
      ? event.startTime + ' - ' + event.endTime
      : ''
    let content = '时间：第' + event.week + '周 ' + dayLabel + ' ' + time + '（仅此一次）'
    if (event.place) content += '\n地点：' + event.place
    if (event.note) content += '\n备注：' + event.note
    wx.showModal({
      title: '📅 ' + event.name,
      content: content,
      cancelText: '关闭',
      confirmText: '删除',
      confirmColor: '#e64340',
      success: (res) => {
        if (res.confirm) this.deleteEvent(event)
      }
    })
  },

  deleteEvent(event) {
    wx.showModal({
      title: '删除活动',
      content: '确定删除「' + event.name + '」吗？',
      confirmText: '删除',
      confirmColor: '#e64340',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          const events = wx.getStorageSync('events') || []
          wx.setStorageSync('events', events.filter(ev => ev.id !== event.id))
          this.loadSchedule()
          wx.showToast({ title: '已删除', icon: 'success' })
        }
      }
    })
  },

  showCourseDetail(course) {
    const noteLine = course.note ? '\n备注：' + course.note : ''
    const slots = getSlots()
    const s = slots.find(x => x.period === course.startPeriod)
    const t = slots.find(x => x.period === course.endPeriod)
    const timeLine = (s && t) ? s.label + ' ' + s.start + '-' + t.end : '第' + course.startPeriod + '-' + course.endPeriod + '节'
    wx.showModal({
      title: course.name,
      content: '教师：' + (course.teacher || '未填写') + '\n教室：' + (course.location || '未填写') + '\n时间：' + timeLine + noteLine,
      cancelText: '关闭',
      confirmText: '管理',
      success: (res) => {
        if (res.confirm) {
          this.showCourseManage(course)
        }
      }
    })
  },

  // 课程管理入口：编辑备注 / 仅删除本周 / 删除整门
  showCourseManage(course) {
    const w = this.data.currentWeek
    const inThisWeek = (course.weeks || []).indexOf(w) >= 0
    const itemList = ['编辑备注']
    if (inThisWeek) itemList.push('仅删除本周（第' + w + '周）')
    itemList.push('删除整门课程')
    const that = this
    wx.showActionSheet({
      itemList: itemList,
      success: (res) => {
        const idx = res.tapIndex
        if (idx === 0) {
          that.editCourseNote(course)
        } else if (inThisWeek && idx === 1) {
          that.deleteCourseWeek(course)
        } else {
          that.confirmDelete(course)   // 删除整门课程（带二次确认）
        }
      }
    })
  },

  // 仅删除该课程在当前周的这一节（其余周次保留），用于单周冲突调整
  deleteCourseWeek(course) {
    const w = this.data.currentWeek
    const courses = wx.getStorageSync('courses') || []
    const target = courses.find(c => c.id === course.id)
    if (!target) return
    const remainWeeks = (target.weeks || []).filter(x => x !== w)
    if (remainWeeks.length === 0) {
      // 当前周是它唯一出现的周，移出即等于整门删除
      wx.showModal({
        title: '删除课程',
        content: '「' + target.name + '」只在第' + w + '周出现，移除后这门课将彻底删除，确定吗？',
        confirmText: '删除',
        confirmColor: '#e64340',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            wx.setStorageSync('courses', courses.filter(c => c.id !== course.id))
            this.loadSchedule()
            wx.showToast({ title: '已删除', icon: 'success' })
          }
        }
      })
      return
    }
    target.weeks = remainWeeks
    wx.setStorageSync('courses', courses)
    this.loadSchedule()
    wx.showToast({ title: '已移出第' + w + '周', icon: 'success' })
  },

  editCourseNote(course) {
    wx.showModal({
      title: '备注 - ' + course.name,
      editable: true,
      placeholderText: '如：下节课小测 / 带实验报告 / 交作业',
      content: course.note || '',
      success: (res) => {
        if (res.confirm) {
          const note = (res.content || '').trim()
          const courses = wx.getStorageSync('courses') || []
          const target = courses.find(c => c.id === course.id)
          if (target) {
            if (note) {
              target.note = note
            } else {
              delete target.note
            }
            wx.setStorageSync('courses', courses)
            this.loadSchedule()
            wx.showToast({ title: note ? '备注已保存' : '备注已清除', icon: 'success' })
          }
        }
      }
    })
  },

  confirmDelete(course) {
    const dayLabel = '周' + '一二三四五六日'[course.dayOfWeek - 1]
    wx.showModal({
      title: '删除课程',
      content: '确定删除「' + course.name + '」(' + dayLabel + ') 吗？',
      confirmText: '删除',
      confirmColor: '#e64340',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          const courses = wx.getStorageSync('courses') || []
          const remain = courses.filter(c => c.id !== course.id)
          wx.setStorageSync('courses', remain)
          this.loadSchedule()
          wx.showToast({ title: '已删除', icon: 'success' })
        }
      }
    })
  },

  // ===== 时段管理面板 =====
  openSlotPanel() {
    this.setData({
      showSlotPanel: true,
      slotList: getSlots(),
      newSlotLabel: '',
      newSlotStart: '12:00',
      newSlotEnd: '13:20',
      dayToggleList: [
        { day: 1, label: '一', on: true },
        { day: 2, label: '二', on: true },
        { day: 3, label: '三', on: true },
        { day: 4, label: '四', on: true },
        { day: 5, label: '五', on: true },
        { day: 6, label: '六', on: true },
        { day: 7, label: '日', on: true }
      ],
      newSlotWeekStart: 0,
      newSlotWeekEnd: 15
    })
  },

  closeSlotPanel() {
    this.setData({ showSlotPanel: false })
    this.loadSchedule()
  },

  noop() {},

  inputNewSlotLabel() {
    wx.showModal({
      title: '时段名称',
      editable: true,
      placeholderText: '如：午间答疑 / 社团活动',
      content: this.data.newSlotLabel,
      success: (res) => {
        if (res.confirm) {
          this.setData({ newSlotLabel: (res.content || '').trim() })
        }
      }
    })
  },

  toggleNewSlotDay(e) {
    const day = e.currentTarget.dataset.day
    const list = this.data.dayToggleList.map(function (d) {
      if (d.day === day) return { day: d.day, label: d.label, on: !d.on }
      return d
    })
    this.setData({ dayToggleList: list })
  },

  onNewSlotStart(e) { this.setData({ newSlotStart: e.detail.value }) },
  onNewSlotEnd(e) { this.setData({ newSlotEnd: e.detail.value }) },
  onNewSlotWeekStart(e) { this.setData({ newSlotWeekStart: parseInt(e.detail.value) }) },
  onNewSlotWeekEnd(e) { this.setData({ newSlotWeekEnd: parseInt(e.detail.value) }) },

  editSlotLabel(e) {
    const period = e.currentTarget.dataset.period
    const slots = getSlots()
    const slot = slots.find(s => s.period === period)
    if (!slot) return
    wx.showModal({
      title: '修改时段名称',
      editable: true,
      content: slot.label,
      placeholderText: '如：第1节 / 午间答疑',
      success: (res) => {
        if (!res.confirm) return
        const label = (res.content || '').trim()
        if (!label) return wx.showToast({ title: '名称不能为空', icon: 'none' })
        slot.label = label
        saveSlots(slots)
        this.setData({ slotList: getSlots() })
        this.loadSchedule()
      }
    })
  },

  onSlotStartChange(e) {
    const period = e.currentTarget.dataset.period
    const newStart = e.detail.value
    const slots = getSlots()
    const slot = slots.find(s => s.period === period)
    if (!slot) return
    if (newStart >= slot.end) {
      return wx.showToast({ title: '开始要早于结束', icon: 'none' })
    }
    slot.start = newStart
    saveSlots(slots)
    this.setData({ slotList: getSlots() })
    this.loadSchedule()
  },

  onSlotEndChange(e) {
    const period = e.currentTarget.dataset.period
    const newEnd = e.detail.value
    const slots = getSlots()
    const slot = slots.find(s => s.period === period)
    if (!slot) return
    if (slot.start >= newEnd) {
      return wx.showToast({ title: '结束要晚于开始', icon: 'none' })
    }
    slot.end = newEnd
    saveSlots(slots)
    this.setData({ slotList: getSlots() })
    this.loadSchedule()
  },

  addCustomSlot() {
    var label = (this.data.newSlotLabel || '').trim()
    if (!label) return wx.showToast({ title: '点击上方输入名称', icon: 'none' })
    if (this.data.newSlotStart >= this.data.newSlotEnd) return wx.showToast({ title: '结束要晚于开始', icon: 'none' })

    var days = this.data.dayToggleList.filter(function (d) { return d.on }).map(function (d) { return d.day })
    if (days.length === 0) return wx.showToast({ title: '至少选一天', icon: 'none' })

    var weekStart = parseInt(this.data.weekOptions[this.data.newSlotWeekStart])
    var weekEnd = parseInt(this.data.weekOptions[this.data.newSlotWeekEnd])
    if (weekStart > weekEnd) return wx.showToast({ title: '起始周不能晚于结束周', icon: 'none' })

    var slots = getSlots()
    var isAllDays = days.length === 7
    var isAllWeeks = weekStart === 1 && weekEnd === 16

    var newSlot = {
      period: 101 + slots.length,
      label: label,
      start: this.data.newSlotStart,
      end: this.data.newSlotEnd,
      custom: true,
      days: isAllDays ? null : days,
      weekStart: isAllWeeks ? null : weekStart,
      weekEnd: isAllWeeks ? null : weekEnd
    }

    var overlap = slots.find(s => slotsOverlap(s, newSlot))
    var that = this
    var doAdd = function () {
      slots.push(newSlot)
      saveSlots(slots)
      that.setData({
        slotList: getSlots(),
        newSlotLabel: '',
        newSlotWeekStart: 0,
        newSlotWeekEnd: 15,
        dayToggleList: [
          { day: 1, label: '一', on: true },
          { day: 2, label: '二', on: true },
          { day: 3, label: '三', on: true },
          { day: 4, label: '四', on: true },
          { day: 5, label: '五', on: true },
          { day: 6, label: '六', on: true },
          { day: 7, label: '日', on: true }
        ]
      })
      that.loadSchedule()
      wx.showToast({ title: '已添加', icon: 'success' })
    }
    if (overlap) {
      wx.showModal({
        title: '时段重叠',
        content: '和「' + overlap.label + '」(' + overlap.start + '-' + overlap.end + ') 有重叠，仍要添加吗？',
        confirmText: '仍要添加',
        cancelText: '再想想',
        success: (res) => { if (res.confirm) doAdd() }
      })
    } else {
      doAdd()
    }
  },

  removeCustomSlot(e) {
    const period = e.currentTarget.dataset.period
    const slots = getSlots()
    const slot = slots.find(s => s.period === period)
    if (!slot || !slot.custom) return

    const courses = wx.getStorageSync('courses') || []
    const used = courses.some(c => c.startPeriod === period || c.endPeriod === period)
    if (used) {
      return wx.showToast({ title: '有课程在这个时段，先删课程', icon: 'none' })
    }
    const memos = wx.getStorageSync('memos') || []
    let memoChanged = false
    memos.forEach(m => {
      if (m.link && m.link.slotId === period) {
        delete m.link
        memoChanged = true
      }
    })
    if (memoChanged) wx.setStorageSync('memos', memos)
    const events = wx.getStorageSync('events') || []
    if (events.some(ev => ev.period === period)) {
      wx.setStorageSync('events', events.filter(ev => ev.period !== period))
    }

    wx.showModal({
      title: '删除时段',
      content: '删除自定义时段「' + slot.label + '」？',
      confirmText: '删除',
      confirmColor: '#e64340',
      success: (res) => {
        if (res.confirm) {
          saveSlots(slots.filter(s => s.period !== period))
          this.setData({ slotList: getSlots() })
          this.loadSchedule()
          wx.showToast({ title: '已删除', icon: 'success' })
        }
      }
    })
  },

  resetDefaultSlots() {
    wx.showModal({
      title: '恢复北化大默认时段？',
      content: '将清掉本地时段缓存，重新加载 12 个北化大标准节次。如果之前自定义过时段会被覆盖。建议先用此功能后再调整时段。',
      confirmText: '恢复',
      confirmColor: '#185FA5',
      cancelText: '再想想',
      success: (res) => {
        if (!res.confirm) return
        try { wx.removeStorageSync('slots') } catch (e) {}
        this.setData({ slotList: getSlots() })
        this.loadSchedule()
        wx.showToast({ title: '已恢复', icon: 'success' })
      }
    })
  },

  goAddCourse(batch) {
    const url = batch ? '/pages/add-course/add-course?batch=1' : '/pages/add-course/add-course'
    wx.navigateTo({ url: url })
  },

  // ===== 智能面板：整周空闲分析 + 个性化推荐 =====
  openSmartPanel() {
    const slots = getSlots()
    const courses = wx.getStorageSync('courses') || []
    const events = wx.getStorageSync('events') || []
    const week = this.data.currentWeek

    // 收集每天已占用时段
    const dayItemsMap = {}
    weekDays.forEach(d => { dayItemsMap[d.day] = [] })
    const items = smart.collectItems(courses, events, slots).filter(it => it.weeks.includes(week))
    items.forEach(it => { (dayItemsMap[it.day] = dayItemsMap[it.day] || []).push({ startMin: it.startMin, endMin: it.endMin }) })

    // 每天求空闲时段（窗口 8:00-22:00，最小可用 45 分钟）
    const smartDays = weekDays.map(d => {
      const gaps = smart.findFreeSlots(dayItemsMap[d.day] || [], 8 * 60, 22 * 60, 45)
      return { day: d.day, label: d.label, gaps: gaps.slice(0, 6) }
    })

    // 个性化推荐（最大空闲 + 使用习惯）
    const smartRecs = smart.buildRecommendations(smartDays, smart.getUsageStats())

    this.setData({ smartOpen: true, smartDays: smartDays, smartRecs: smartRecs })
  },

  closeSmartPanel() {
    this.setData({ smartOpen: false })
  },

  // 清空全部课表数据：与开发者工具（电脑端）空白状态一致
  // 删除手机本地保存的课程/活动/便签/推荐记录，恢复空白课表
  resetAllData() {
    wx.showModal({
      title: '清空全部课表数据？',
      content: '将删除手机上保存的所有课程、活动、便签与推荐记录，恢复成空白课表。此操作不可恢复，确定吗？',
      confirmText: '清空',
      confirmColor: '#e64340',
      cancelText: '取消',
      success: (res) => {
        if (!res.confirm) return
        try {
          wx.removeStorageSync('courses')
          wx.removeStorageSync('events')
          wx.removeStorageSync('memos')
          wx.removeStorageSync('smart_usage')
        } catch (e) {}
        this.setData({ currentWeek: this.computeCurrentWeek(this.data.week1MondayMs || 0) })
        this.loadSchedule()
        wx.showToast({ title: '已清空', icon: 'success' })
      }
    })
  },

  // 点某个空闲时段：直接带入「添加活动」面板，预填时间
  onSmartGapTap(e) {
    const day = e.currentTarget.dataset.day
    const start = e.currentTarget.dataset.start
    const end = e.currentTarget.dataset.end
    this.setData({ smartOpen: false })
    this.openEventPanel(day)
    // 空闲格给的是具体时间点，切到「按时间」
    this.setData({ evTimeMode: 'time', evStart: start, evEnd: end })
    this.recomputeEvConflicts()
  },

  goMemo() {
    wx.navigateTo({ url: '/pages/memo/memo' })
  }
})
