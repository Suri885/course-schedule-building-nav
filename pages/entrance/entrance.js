// pages/entrance/entrance.js
// 第二阶段：在选定的入口簇里，用立面视角精确选择具体入口。
const B = require('../../utils/buildingData')
const app = getApp()

Page({
  data: {
    cluster: '',
    clusterLabel: '',
    entrances: []
  },

  onLoad(query) {
    const cl = query.cl || 'south'
    const arr = B.entranceClusters()[cl] || []
    const labelMap = { south: '南门区', west: '西门区', east: '东门区', north: '北门区' }
    this.setData({
      cluster: cl,
      clusterLabel: labelMap[cl] || cl,
      entrances: arr.map((e) => ({ id: e.id, label: e.label }))
    })
  },

  onPick(e) {
    const id = e.currentTarget.dataset.id
    const ent = B.findEntrance(id)
    if (!ent) return
    app.setEntrance('ent_' + id, ent.label)
    // 进入三维场景（replace，避免返回堆叠）
    wx.redirectTo({ url: '/pages/scene/scene' })
  },

  onBack() {
    wx.navigateBack()
  }
})
