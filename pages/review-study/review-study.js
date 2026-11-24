// pages/review-study/review-study.js - 单条复习：先看遮盖图 / 题目，再对答案
const review = require('../../utils/reviewStore')

Page({
  data: {
    item: null,
    showAnswer: false,
    showOriginal: false,
    currentImage: '',
    hasMask: false,
    indexText: '',
    stageText: '',
    answerEmpty: false,
    mastered: false
  },

  onLoad(q) {
    this.id = q && q.id
    this.load()
  },

  onShow() {
    if (this.id) this.load()
  },

  load() {
    const t = review.getItem(this.id)
    if (!t) {
      wx.showToast({ title: '资料不存在', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 600)
      return
    }
    const due = review.getDueItems()
    const idx = due.findIndex(x => x.id === this.id)
    const images = t.images || []
    const masks = t.masks || []
    const hasMask = !!masks[0]
    this.setData({
      item: t,
      showAnswer: false,
      showOriginal: false,
      hasMask: hasMask,
      currentImage: hasMask ? masks[0] : (images[0] || ''),
      images: images,
      indexText: idx >= 0 ? (idx + 1) + ' / ' + due.length : '',
      stageText: t.mastered ? '已完全学会' : '第 ' + ((Number(t.stage) || 0) + 1) + ' 轮',
      answerEmpty: !(t.answer || '').trim(),
      mastered: !!t.mastered
    })
  },

  // 已完全学会 / 取消掌握
  toggleMastered() {
    const t = this.data.item
    if (!t) return

    if (t.mastered) {
      review.setMastered(this.id, false)
      this.load()
      wx.showToast({ title: '已取消，回到复习队列', icon: 'none' })
      return
    }

    wx.showModal({
      title: '标记为已完全学会',
      content: '标记后这条资料不再出现在每日复习里，可以在「总资料库」里取消标记。',
      confirmText: '标记',
      cancelText: '再想想',
      success: (res) => {
        if (!res.confirm) return
        review.setMastered(this.id, true)
        wx.showToast({ title: '已移出复习队列', icon: 'none' })
        setTimeout(() => wx.navigateBack(), 500)
      }
    })
  },

  // 遮盖图 ↔ 原图切换
  toggleOriginal() {
    if (!this.data.hasMask) return
    const t = this.data.item
    const showOriginal = !this.data.showOriginal
    this.setData({
      showOriginal: showOriginal,
      currentImage: showOriginal ? ((t.images || [])[0] || '') : (t.masks[0] || '')
    })
  },

  showAnswerTap() {
    this.setData({ showAnswer: true })
  },

  // 记住了 / 没记住
  mark(e) {
    const ok = String(e.currentTarget.dataset.ok) === '1'
    const res = review.markReviewed(this.id, ok)
    const nextText = res ? review.nextText(res) : ''
    const due = review.getDueItems()
    const next = due[0]

    // 还有下一份：直接接着复习
    if (next && next.id !== this.id) {
      this.id = next.id
      this.load()
      wx.showToast({ title: ok ? '记住了，下一份' : '没记住，明天再来', icon: 'none' })
      return
    }

    wx.showModal({
      title: '今天复习完成啦',
      content: ok
        ? '这条资料下次复习：' + nextText
        : '没记住没关系，已安排明天再复习一次。',
      showCancel: false,
      confirmText: '好的',
      success: () => wx.navigateBack()
    })
  },

  goEdit() {
    wx.navigateTo({ url: '/pages/review-edit/review-edit?id=' + this.id })
  },

  goBack() {
    wx.navigateBack()
  }
})
