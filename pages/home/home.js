// pages/home/home.js - 工作台：置顶/紧急提醒 + 日程表 / 提醒 / 第二课堂 / 错题与背诵
const scStore = require('../../utils/scStore')
const remind = require('../../utils/remindStore')
const reviewStore = require('../../utils/reviewStore')

const URGENT_SHOW_MAX = 3
const PINNED_SHOW_MAX = 3

Page({
  data: {
    totalGot: 0,
    totalMax: 600,
    totalRemain: 0,

    urgentTasks: [],      // 已确认 + 未完成 + 已进入红色（自动置顶，红框）
    urgentMore: 0,
    pinnedTasks: [],      // 手动置顶（非红色，另用靛蓝框）
    pinnedMore: 0,

    remindPending: 0,     // 已确认待完成总数
    remindUnconfirmed: 0, // 未确认总数

    reviewDue: 0,         // 今天要复习的条数
    reviewTotal: 0
  },

  onShow() {
    // 满分按办法规定封顶：总分 600 = 各板块满分之和，与「第二课堂」明细页保持一致
    this.setData({
      totalGot: scStore.getTotalScore(),
      totalMax: scStore.getTotalTarget(),
      totalRemain: scStore.getTotalRemain()
    })
    this.refreshRemind()
    this.refreshReview()
  },

  refreshRemind() {
    const now = Date.now()
    const urgent = remind.getUrgentTasks(now)
    // 红色事项已经在紧急区，置顶区只放非红色的，避免重复
    const pinned = remind.getPinnedTasks(now).filter(t => t.level !== 'red')
    const all = remind.getReminders()

    this.setData({
      urgentTasks: urgent.slice(0, URGENT_SHOW_MAX),
      urgentMore: Math.max(0, urgent.length - URGENT_SHOW_MAX),
      pinnedTasks: pinned.slice(0, PINNED_SHOW_MAX),
      pinnedMore: Math.max(0, pinned.length - PINNED_SHOW_MAX),
      remindPending: all.filter(t => t.confirmed && !t.done).length,
      remindUnconfirmed: all.filter(t => !t.confirmed).length
    })
  },

  refreshReview() {
    const st = reviewStore.stats(Date.now())
    this.setData({ reviewDue: st.due, reviewTotal: st.total })
  },

  goSchedule() {
    wx.navigateTo({ url: '/pages/index/index' })
  },

  goSecondClass() {
    wx.navigateTo({ url: '/pages/second-class/second-class' })
  },

  goRemind() {
    wx.navigateTo({ url: '/pages/remind/remind' })
  },

  goReview() {
    wx.navigateTo({ url: '/pages/review/review' })
  },

  goBuildingNav() {
    wx.navigateTo({ url: '/pages/extmap/extmap' })
  }
})
