// pages/remind/remind.js - 提醒板块：事务确认 / 三色紧急度 / 长周期倒计时
const remind = require('../../utils/remindStore')

const REFRESH_MS = 60000

Page({
  data: {
    todayLabel: '',
    weekText: '',
    tab: 'confirmed',          // confirmed | unconfirmed

    pinnedList: [],            // 已确认 · 手动置顶
    pending: [],               // 已确认 · 待完成（有截止日期）
    fixedList: [],             // 已确认 · 固定项目（无截止日期）
    doneList: [],              // 已确认 · 已完成
    unconfirmed: [],           // 未确认

    pinCollapsed: false,       // 置顶区折叠状态
    fixedCollapsed: false,     // 固定项目折叠状态

    confirmedCount: 0,
    doneCount: 0,
    unconfirmedCount: 0,
    urgentCount: 0,

    levels: Object.assign({}, remind.DEFAULT_LEVELS),
    levelsText: '',

    // 新增 / 编辑面板
    showForm: false,
    editingId: '',
    fTitle: '',
    fNote: '',
    fDate: '',
    fTime: '23:59',
    fConfirm: false,
    fFixed: false,

    // 三色阈值设置面板
    showLevelPanel: false,
    lvRed: 7,
    lvYellow: 14,
    lvGreen: 30,
    lvPreview: '',

    quickDates: []
  },

  onLoad() {
    this.refresh()
  },

  onShow() {
    this.refresh()
    this.startTimer()
  },

  onHide() {
    this.stopTimer()
  },

  onUnload() {
    this.stopTimer()
  },

  startTimer() {
    this.stopTimer()
    this._timer = setInterval(() => { this.refresh(true) }, REFRESH_MS)
  },

  stopTimer() {
    if (this._timer) {
      clearInterval(this._timer)
      this._timer = null
    }
  },

  // ===== 工具 =====
  pad(n) { return n < 10 ? '0' + n : '' + n },

  dateStr(d) {
    return d.getFullYear() + '-' + this.pad(d.getMonth() + 1) + '-' + this.pad(d.getDate())
  },

  addDays(days) {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() + days)
    return this.dateStr(d)
  },

  // 当前周次（依赖开学日期 semesterStart）
  computeWeekText() {
    const start = wx.getStorageSync('semesterStart') || ''
    if (!start) return ''
    const p = String(start).split('-').map(Number)
    const startMs = new Date(p[0], p[1] - 1, p[2]).getTime()
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    const diff = Math.floor((now.getTime() - startMs) / remind.DAY_MS)
    if (diff < 0) return '未开学'
    const week = Math.floor(diff / 7) + 1
    return '第 ' + week + ' 周'
  },

  levelsSummary(lv) {
    return '剩余 ≤' + lv.red + ' 天红色 · ≤' + lv.yellow + ' 天黄色 · ≤' + lv.green + ' 天绿色'
  },

  lvPreviewText(red, yellow, green) {
    return '剩余 ≤' + red + ' 天红 · ' + red + '~' + yellow + ' 天黄 · ' + yellow + '~' + green + ' 天绿 · 超过 ' + green + ' 天为远期'
  },

  // ===== 主刷新 =====
  refresh(silent) {
    const now = Date.now()
    const levels = remind.getLevels()
    const all = remind.getReminders()

    const openConfirmed = remind.decorate(all.filter(t => t.confirmed && !t.done), now, levels)
    const pinnedList = openConfirmed.filter(t => t.pinned)
    const rest = openConfirmed.filter(t => !t.pinned)
    const pending = rest.filter(t => !t.fixed)
    const fixedList = rest.filter(t => t.fixed)
    const doneList = remind.decorate(all.filter(t => t.confirmed && t.done), now, levels)
    const unconfirmed = remind.decorate(all.filter(t => !t.confirmed), now, levels)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))

    const nowDate = new Date()
    const todayLabel = (nowDate.getMonth() + 1) + '月' + nowDate.getDate() + '日 周' + '日一二三四五六'[nowDate.getDay()]

    this.setData({
      todayLabel: todayLabel,
      weekText: this.computeWeekText(),
      pinnedList: pinnedList,
      pending: pending,
      fixedList: fixedList,
      doneList: doneList,
      unconfirmed: unconfirmed,
      confirmedCount: pinnedList.length + pending.length + fixedList.length,
      doneCount: doneList.length,
      unconfirmedCount: unconfirmed.length,
      urgentCount: pending.filter(t => t.level === 'red').length,
      levels: levels,
      levelsText: this.levelsSummary(levels)
    })
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (tab === this.data.tab) return
    this.setData({ tab: tab })
  },

  // ===== 事务操作 =====
  toggleDone(e) {
    const id = e.currentTarget.dataset.id
    const now = remind.getReminders().find(t => t.id === id)
    if (!now) return
    remind.updateReminder(id, { done: !now.done })
    this.refresh()
    wx.showToast({ title: now.done ? '已恢复待完成' : '已完成', icon: 'success' })
  },

  setConfirmed(e) {
    const id = e.currentTarget.dataset.id
    const val = String(e.currentTarget.dataset.val) === '1'
    remind.updateReminder(id, { confirmed: val })
    this.refresh()
    wx.showToast({ title: val ? '已确认，进入倒计时' : '已撤回为未确认', icon: 'none' })
  },

  // 置顶 / 取消置顶：置顶后同时出现在工作台首页
  togglePin(e) {
    const id = e.currentTarget.dataset.id
    const t = remind.getReminders().find(x => x.id === id)
    if (!t) return
    const pinned = !t.pinned
    remind.updateReminder(id, { pinned: pinned })
    this.refresh()
    wx.showToast({ title: pinned ? '已置顶，首页也会显示' : '已取消置顶', icon: 'none' })
  },

  // 折叠 / 展开置顶区、固定项目区
  toggleSection(e) {
    const key = e.currentTarget.dataset.key
    if (key === 'pin') this.setData({ pinCollapsed: !this.data.pinCollapsed })
    else this.setData({ fixedCollapsed: !this.data.fixedCollapsed })
  },

  deleteTask(id, title) {
    wx.showModal({
      title: '删除事务',
      content: '确定删除「' + (title || '该事务') + '」吗？',
      confirmText: '删除',
      confirmColor: '#e64340',
      cancelText: '取消',
      success: (res) => {
        if (!res.confirm) return
        remind.removeReminder(id)
        this.setData({ showForm: false, editingId: '' })
        this.refresh()
        wx.showToast({ title: '已删除', icon: 'none' })
      }
    })
  },

  onDeleteFromCard(e) {
    const id = e.currentTarget.dataset.id
    const t = this.data.pending
      .concat(this.data.fixedList || [], this.data.doneList || [], this.data.unconfirmed)
      .find(x => x.id === id)
    this.deleteTask(id, t ? t.title : '')
  },

  onDeleteFromForm() {
    if (!this.data.editingId) return
    this.deleteTask(this.data.editingId, this.data.fTitle)
  },

  // ===== 新增 / 编辑面板 =====
  // 新增时的状态由当前页签决定，用户不用再手动选
  openForm() {
    const confirmed = this.data.tab === 'confirmed'
    this.setData({
      showForm: true,
      editingId: '',
      fTitle: '',
      fNote: '',
      fDate: this.addDays(7),
      fTime: '23:59',
      fConfirm: confirmed,
      fFixed: false,
      quickDates: [
        { label: '一周后', date: this.addDays(7) },
        { label: '两周后', date: this.addDays(14) },
        { label: '一个月后', date: this.addDays(30) },
        { label: '三个月后', date: this.addDays(90) }
      ]
    })
  },

  openEdit(e) {
    const id = e.currentTarget.dataset.id
    const t = remind.getReminders().find(x => x.id === id)
    if (!t) return
    this.setData({
      showForm: true,
      editingId: t.id,
      fTitle: t.title || '',
      fNote: t.note || '',
      fDate: t.date || '',
      fTime: t.time || '23:59',
      fConfirm: !!t.confirmed,
      fFixed: !!t.fixed,
      quickDates: [
        { label: '一周后', date: this.addDays(7) },
        { label: '两周后', date: this.addDays(14) },
        { label: '一个月后', date: this.addDays(30) },
        { label: '三个月后', date: this.addDays(90) }
      ]
    })
  },

  closeForm() {
    this.setData({ showForm: false, editingId: '' })
  },

  onTitleInput(e) { this.setData({ fTitle: e.detail.value }) },
  onNoteInput(e) { this.setData({ fNote: e.detail.value }) },
  onDateChange(e) { this.setData({ fDate: e.detail.value }) },
  onTimeChange(e) { this.setData({ fTime: e.detail.value }) },
  onQuickDate(e) { this.setData({ fDate: e.currentTarget.dataset.date }) },
  onClearDate() { this.setData({ fDate: '' }) },

  // 固定项目：勾上后不设截止日期，长期有效
  onToggleFixed() {
    const fixed = !this.data.fFixed
    this.setData({
      fFixed: fixed,
      fDate: fixed ? '' : (this.data.fDate || this.addDays(7))
    })
  },

  saveTask() {
    const title = (this.data.fTitle || '').trim()
    if (!title) return wx.showToast({ title: '先写事务名称', icon: 'none' })

    const fixed = !!this.data.fFixed
    const payload = {
      title: title,
      note: (this.data.fNote || '').trim(),
      date: fixed ? '' : (this.data.fDate || ''),
      time: fixed ? '' : (this.data.fDate ? (this.data.fTime || '23:59') : ''),
      confirmed: !!this.data.fConfirm,
      fixed: fixed
    }

    if (this.data.editingId) {
      remind.updateReminder(this.data.editingId, payload)
      wx.showToast({ title: '已保存', icon: 'success' })
    } else {
      remind.addReminder(payload)
      wx.showToast({ title: payload.confirmed ? '已确认' : '已存为未确认', icon: 'success' })
    }
    this.setData({ showForm: false, editingId: '' })
    this.refresh()
  },

  // ===== 三色阈值设置 =====
  openLevelPanel() {
    const lv = remind.getLevels()
    this.setData({
      showLevelPanel: true,
      lvRed: lv.red,
      lvYellow: lv.yellow,
      lvGreen: lv.green,
      lvPreview: this.lvPreviewText(lv.red, lv.yellow, lv.green)
    })
  },

  closeLevelPanel() {
    this.setData({ showLevelPanel: false })
  },

  onLevelStep(e) {
    const key = e.currentTarget.dataset.key
    const delta = Number(e.currentTarget.dataset.delta)
    let red = this.data.lvRed
    let yellow = this.data.lvYellow
    let green = this.data.lvGreen

    if (key === 'red') red = Math.max(0, red + delta)
    if (key === 'yellow') yellow = Math.max(1, yellow + delta)
    if (key === 'green') green = Math.max(2, green + delta)

    // 保持 红 < 黄 < 绿
    if (key === 'red' && red >= yellow) yellow = red + 1
    if (key === 'yellow') {
      if (yellow <= red) { yellow = red + 1; }
      if (yellow >= green) green = yellow + 1
    }
    if (key === 'green' && green <= yellow) green = yellow + 1

    this.setData({
      lvRed: red,
      lvYellow: yellow,
      lvGreen: green,
      lvPreview: this.lvPreviewText(red, yellow, green)
    })
  },

  onLevelPreset(e) {
    const preset = String(e.currentTarget.dataset.preset).split(',')
    const red = Number(preset[0])
    const yellow = Number(preset[1])
    const green = Number(preset[2])
    this.setData({
      lvRed: red,
      lvYellow: yellow,
      lvGreen: green,
      lvPreview: this.lvPreviewText(red, yellow, green)
    })
  },

  saveLevels() {
    const lv = remind.saveLevels({ red: this.data.lvRed, yellow: this.data.lvYellow, green: this.data.lvGreen })
    this.setData({ showLevelPanel: false, lvRed: lv.red, lvYellow: lv.yellow, lvGreen: lv.green })
    this.refresh()
    wx.showToast({ title: '颜色规则已保存', icon: 'success' })
  },

  resetLevels() {
    const lv = remind.resetLevels()
    this.setData({
      lvRed: lv.red,
      lvYellow: lv.yellow,
      lvGreen: lv.green,
      lvPreview: this.lvPreviewText(lv.red, lv.yellow, lv.green)
    })
    this.refresh()
    wx.showToast({ title: '已恢复默认', icon: 'none' })
  },

  noop() {}
})
