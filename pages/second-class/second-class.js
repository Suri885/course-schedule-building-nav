// pages/second-class/second-class.js - 第二课堂五大板块列表
// 满分按办法规定：总分 600 = 各板块满分之和（180/120/100/100/100），超出部分封顶
const { SECTIONS } = require('../../utils/secondClass')
const scStore = require('../../utils/scStore')

Page({
  data: { list: [], totalGot: 0, totalTarget: 0, totalRemain: 0, totalPending: 0 },

  onShow() {
    const list = SECTIONS.map(s => {
      const t = scStore.getSectionTotals(s)
      const pct = t.target ? Math.round((t.got / t.target) * 100) : 0
      const taskCount = s.basic.length + s.ext.length
      return {
        key: s.key, name: s.name, short: s.short, color: s.color, desc: s.desc,
        got: t.got, max: t.target, remain: t.remain, pending: t.pending,
        pct: Math.min(100, pct), taskCount: taskCount,
        officialMax: s.totalMax
      }
    })
    this.setData({
      list: list,
      totalGot: scStore.getTotalScore(),
      totalTarget: scStore.getTotalTarget(),
      totalRemain: scStore.getTotalRemain(),
      totalPending: scStore.getTotalPending()
    })
  },

  goDetail(e) {
    const key = e.currentTarget.dataset.key
    wx.navigateTo({ url: '/pages/section-detail/section-detail?key=' + key })
  }
})
