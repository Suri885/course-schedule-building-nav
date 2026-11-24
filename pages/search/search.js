// pages/search/search.js
// 教室查询：输入教室号 → 从当前入口自动规划跨层 3D 路线 → 写入全局供场景页渲染。
const B = require('../../utils/buildingData')
const N = require('../../utils/navGraph')
const app = getApp()

Page({
  data: {
    input: '',
    result: '',
    err: '',
    hasLoc: false
  },

  onLoad() {
    this.setData({ hasLoc: !!app.globalData.currentEntranceNodeId })
  },

  onInput(e) {
    this.setData({ input: e.detail.value })
  },

  onQuery() {
    const num = parseInt(this.data.input, 10)
    if (!num) {
      this.setData({ err: '请输入教室号，例如 305', result: '' })
      return
    }
    const room = B.findRoom(num)
    if (!room) {
      this.setData({ err: '未找到教室 ' + num + '，编号范围 101~510', result: '' })
      return
    }
    const start = app.globalData.currentEntranceNodeId
    if (!start) {
      this.setData({ err: '请先返回外部地图选择你的入口', result: '' })
      return
    }
    const route = N.findRoute(start, N.roomDoorNodeId(room.id))
    if (!route) {
      this.setData({ err: '该教室当前不可达（图未连通）', result: '' })
      return
    }
    app.setRoute({
      waypoints: route.waypoints,
      cost: route.cost,
      goalRoom: { number: room.number, floor: room.floor, name: room.name, cx: room.cx, cz: room.cz }
    })
    const floors = []
    route.waypoints.forEach((w) => { if (!floors.includes(w.floor)) floors.push(w.floor) })
    this.setData({
      err: '',
      result: '已规划：' + room.number + '（' + room.floor + '层）\n途经 ' + floors.join('/') + ' 层 · 约 ' + Math.round(route.cost) + 'm\n正在进入三维场景查看路线…'
    })
    setTimeout(() => { wx.redirectTo({ url: '/pages/scene/scene' }) }, 700)
  },

  onBack() {
    wx.navigateBack()
  }
})
