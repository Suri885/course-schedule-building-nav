// pages/extmap/extmap.js
// 外部俯视示意：展示楼栋平面 + 入口簇（同区多个近入口），点簇进入精选入口页。
const B = require('../../utils/buildingData')
const app = getApp()

Page({
  data: {
    markers: [],          // 入口簇标记（百分比定位）
    hasLast: false,       // 是否已有上次入口
    lastLabel: ''
  },

  onLoad() {
    const g = app.globalData
    this.setData({
      hasLast: !!g.currentEntranceNodeId,
      lastLabel: g.currentLocationLabel
    })
  },

  onReady() {
    this.draw()
  },

  clusterLabel(key, arr) {
    const map = { south: '南门区', west: '西门区', east: '东门区', north: '北门区' }
    return (map[key] || key) + '（' + arr.length + '个入口）'
  },

  draw() {
    wx.createSelectorQuery().select('#map').fields({ node: true, size: true }).exec((res) => {
      if (!res || !res[0]) return
      const canvas = res[0].node
      const w = res[0].width, h = res[0].height
      const dpr = (wx.getWindowInfo && wx.getWindowInfo().pixelRatio) || 2
      canvas.width = w * dpr
      canvas.height = h * dpr
      const ctx = canvas.getContext('2d')
      ctx.scale(dpr, dpr)

      const pad = 26
      const scale = Math.min((w - 2 * pad) / B.FOOTPRINT.w, (h - 2 * pad) / B.FOOTPRINT.d)
      const ox = (w - B.FOOTPRINT.w * scale) / 2
      const oy = (h - B.FOOTPRINT.d * scale) / 2
      this.scaleInfo = { w, h, scale, ox, oy }

      // 背景
      ctx.fillStyle = '#0f172a'
      ctx.fillRect(0, 0, w, h)

      // 楼栋外框
      ctx.fillStyle = '#1e293b'
      ctx.fillRect(ox, oy, B.FOOTPRINT.w * scale, B.FOOTPRINT.d * scale)
      ctx.strokeStyle = '#475569'
      ctx.lineWidth = 2
      ctx.strokeRect(ox, oy, B.FOOTPRINT.w * scale, B.FOOTPRINT.d * scale)

      // 走廊（中轴 z=20）
      const cz0 = B.CORRIDOR.z - B.CORRIDOR.halfWidth
      const cz1 = B.CORRIDOR.z + B.CORRIDOR.halfWidth
      ctx.fillStyle = '#334155'
      ctx.fillRect(ox + B.CORRIDOR.x0 * scale, oy + cz0 * scale,
        (B.CORRIDOR.x1 - B.CORRIDOR.x0) * scale, (cz1 - cz0) * scale)

      // 房间
      ctx.font = '9px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      B.ROOMS.forEach((r) => {
        const z0 = r.side === 'left' ? 3 : 23
        const z1 = r.side === 'left' ? 17 : 37
        const rx = ox + (r.cx - 5) * scale
        const ry = oy + z0 * scale
        const rw = 10 * scale, rh = (z1 - z0) * scale
        ctx.fillStyle = (r.floor % 2 === 0) ? '#243042' : '#2a374a'
        ctx.fillRect(rx, ry, rw, rh)
        ctx.strokeStyle = '#3b4a60'
        ctx.lineWidth = 1
        ctx.strokeRect(rx, ry, rw, rh)
        ctx.fillStyle = '#94a3b8'
        ctx.fillText(String(r.number), rx + rw / 2, ry + rh / 2)
      })

      // 电梯 / 楼梯
      const drawV = (v, color) => {
        ctx.fillStyle = color
        ctx.fillRect(ox + (v.x - 1.5) * scale, oy + (v.z - 1.5) * scale, 3 * scale, 3 * scale)
      }
      B.ELEVATORS.forEach((v) => drawV(v, '#f59e0b'))
      B.STAIRS.forEach((v) => drawV(v, '#10b981'))

      // 入口簇标记坐标
      const clusters = B.entranceClusters()
      const markers = []
      Object.keys(clusters).forEach((key) => {
        const arr = clusters[key]
        const ax = arr.reduce((s, e) => s + e.x, 0) / arr.length
        const az = arr.reduce((s, e) => s + e.z, 0) / arr.length
        const sx = ox + ax * scale
        const sy = oy + az * scale
        // 入口点画小红点
        arr.forEach((e) => {
          ctx.fillStyle = '#ef4444'
          ctx.beginPath()
          ctx.arc(ox + e.x * scale, oy + e.z * scale, 3, 0, Math.PI * 2)
          ctx.fill()
        })
        markers.push({
          key,
          label: this.clusterLabel(key, arr),
          left: sx / w * 100,
          top: sy / h * 100,
          count: arr.length
        })
      })
      this.setData({ markers })
    })
  },

  onTapCluster(e) {
    const key = e.currentTarget.dataset.key
    wx.navigateTo({ url: '/pages/entrance/entrance?cl=' + key })
  },

  onUseLast() {
    wx.navigateTo({ url: '/pages/scene/scene' })
  },

  onOpenSearch() {
    wx.navigateTo({ url: '/pages/search/search' })
  }
})
