// pages/review/review.js - 错题与背诵：今日复习 + 总资料库
const review = require('../../utils/reviewStore')

Page({
  data: {
    tab: 'due',              // due 今日复习 / library 资料库
    todayLabel: '',
    dueList: [],
    allList: [],
    keyword: '',
    stats: { total: 0, due: 0, mastered: 0, unscheduled: 0 },
    unscheduledCount: 0,
    planTip: ''
  },

  onShow() {
    this.refresh()
  },

  refresh() {
    const now = Date.now()
    const d = new Date()
    const due = review.getDueItems(now).map(t => this.decorate(t, true))
    const all = review.searchItems(this.data.keyword).map(t => this.decorate(t, false))
    const st = review.stats(now)
    this.setData({
      todayLabel: (d.getMonth() + 1) + '月' + d.getDate() + '日 周' + '日一二三四五六'[d.getDay()],
      dueList: due,
      allList: all,
      stats: st,
      unscheduledCount: st.unscheduled || 0,
      planTip: review.planText()
    })
  },

  decorate(t, isDue) {
    const images = t.images || []
    const masks = t.masks || []
    const stage = Number(t.stage) || 0
    const scheduled = review.isScheduled(t)
    return Object.assign({}, t, {
      cover: masks[0] || images[0] || '',
      hasMask: !!masks[0],
      mastered: !!t.mastered,
      scheduled: scheduled,
      stageText: !scheduled ? '未加入计划' : (t.mastered ? '已完全学会' : '第 ' + (stage + 1) + ' 轮'),
      nextText: review.nextText(t),
      overdue: isDue && (Number(t.nextAt) || 0) < review.dayStart(),
      typeText: images.length || masks.length ? '图片' : (t.video ? '视频' : '文字')
    })
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (tab === this.data.tab) return
    this.setData({ tab: tab })
    this.refresh()
  },

  onSearch(e) {
    this.setData({ keyword: e.detail.value })
    this.setData({ allList: review.searchItems(e.detail.value).map(t => this.decorate(t, false)) })
  },

  clearSearch() {
    this.setData({ keyword: '' })
    this.setData({ allList: review.searchItems('').map(t => this.decorate(t, false)) })
  },

  goStudy(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: '/pages/review-study/review-study?id=' + id })
  },

  // 资料库右侧按钮：加入 / 移出复习计划
  toggleScheduled(e) {
    const id = e.currentTarget.dataset.id
    const on = String(e.currentTarget.dataset.on) === '1'
    review.setScheduled(id, on)
    this.refresh()
    wx.showToast({ title: on ? '已加入，今天开始复习' : '已移出复习计划', icon: 'none' })
  },

  goEdit(e) {
    const id = e.currentTarget.dataset.id
    const url = id ? '/pages/review-edit/review-edit?id=' + id : '/pages/review-edit/review-edit'
    wx.navigateTo({ url: url })
  },

  deleteItem(e) {
    const id = e.currentTarget.dataset.id
    const t = review.getItem(id)
    wx.showModal({
      title: '删除资料',
      content: '确定删除「' + (t ? t.title : '该资料') + '」吗？复习记录也会一起删除。',
      confirmText: '删除',
      confirmColor: '#e64340',
      success: (res) => {
        if (!res.confirm) return
        review.removeItem(id)
        this.refresh()
        wx.showToast({ title: '已删除', icon: 'none' })
      }
    })
  },

  goBack() {
    wx.navigateBack()
  }
})
