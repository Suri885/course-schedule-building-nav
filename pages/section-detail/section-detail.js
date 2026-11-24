// pages/section-detail/section-detail.js - 板块详情：先呈现「基础」「拓展」两个模块
// 分数一律按任务细则逐项核算，模块卡与任务列表完全对得上
const { getSection } = require('../../utils/secondClass')
const scStore = require('../../utils/scStore')

Page({
  data: {
    section: null,
    basicGot: 0, basicMax: 0, basicRemain: 0,
    extGot: 0, extMax: 0, extRemain: 0,
    totalGot: 0, totalMax: 0, totalRemain: 0, totalPending: 0,
    officialTotal: 0
  },

  onLoad(q) {
    this.key = q.key
    this.load()
  },

  onShow() {
    this.load()   // 从下级页面返回时刷新进度
  },

  load() {
    const s = getSection(this.key)
    if (!s) return
    const t = scStore.getSectionTotals(s)
    this.setData({
      section: s,
      basicGot: t.basicGot, basicMax: t.basicTarget, basicRemain: t.basicRemain,
      extGot: t.extGot, extMax: t.extTarget, extRemain: t.extRemain,
      totalGot: t.got, totalMax: t.target, totalRemain: t.remain, totalPending: t.pending,
      officialTotal: s.totalMax
    })
  },

  goModule(e) {
    const type = e.currentTarget.dataset.type   // 'basic' | 'ext'
    wx.navigateTo({ url: '/pages/module-tasks/module-tasks?key=' + this.key + '&type=' + type })
  },

  goBack() {
    wx.navigateBack()
  }
})
