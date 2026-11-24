// pages/module-tasks/module-tasks.js - 某一模块（基础/拓展）下的任务列表
// 模块满分按办法规定封顶（基础 80% / 拓展 20%），各任务细则上限累计超出部分不重复计入
const { getSection } = require('../../utils/secondClass')
const scStore = require('../../utils/scStore')

Page({
  data: {
    section: null,
    type: 'basic',
    typeLabel: '基础评定',
    tasks: [],          // 每条含 got / cap / remain
    moduleGot: 0,
    moduleMax: 0,       // 模块满分（办法规定，逐项 cap 之和超出时按上限封顶）
    moduleRemain: 0,    // 模块还差多少分
    modulePending: 0,   // 待确认加分
    officialMax: 0      // 办法里的模块上限
  },

  onLoad(q) {
    this.key = q.key
    this.type = (q.type === 'ext') ? 'ext' : 'basic'
    this.load()
  },

  onShow() {
    this.load()   // 从任务详情返回时刷新进度
  },

  load() {
    const s = getSection(this.key)
    if (!s) return
    const isBasic = this.type === 'basic'
    const raw = isBasic ? s.basic : s.ext
    const officialMax = isBasic ? s.basicMax : s.extMax
    const tasks = raw.map(t => Object.assign({}, t, {
      got: scStore.getTaskScore(t.id),
      remain: scStore.getTaskRemain(t),
      pending: scStore.getTaskPendingScore(t.id)
    }))
    this.setData({
      section: s,
      type: this.type,
      typeLabel: isBasic ? '基础评定' : '拓展评定',
      tasks: tasks,
      moduleGot: scStore.getModuleGot(raw, officialMax),
      moduleMax: scStore.getModuleTarget(raw, officialMax),
      moduleRemain: scStore.getModuleRemain(raw, officialMax),
      modulePending: scStore.getModulePending(raw),
      officialMax: officialMax
    })
  },

  goDetail(e) {
    const taskId = e.currentTarget.dataset.task
    wx.navigateTo({ url: '/pages/task-record/task-record?task=' + taskId })
  },

  goBack() {
    wx.navigateBack()
  }
})
