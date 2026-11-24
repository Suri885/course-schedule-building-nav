// pages/review-mask/review-mask.js - 图片涂抹遮盖（支持双指缩放后再细涂）
const MIN_ZOOM = 1
const MAX_ZOOM = 6

Page({
  data: {
    cw: 0,
    ch: 0,
    loaded: false,
    brush: 8,
    zoomText: '1.0x',
    brushList: [
      { size: 4, label: '特细' },
      { size: 8, label: '细' },
      { size: 14, label: '中' },
      { size: 22, label: '粗' }
    ]
  },

  onLoad() {
    const src = wx.getStorageSync('review_mask_src') || {}
    if (!src.path) {
      wx.showToast({ title: '图片丢失了', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 700)
      return
    }
    this.imagePath = src.path
    this.imageIndex = Number(src.index) || 0
    this.strokes = []
    this.current = null
    this.pinch = null
    this.view = { z: 1, x: 0, y: 0 }
    this.initCanvas()
  },

  initCanvas() {
    wx.getImageInfo({
      src: this.imagePath,
      success: (info) => {
        const sys = wx.getSystemInfoSync()
        const availW = sys.windowWidth - 32
        const availH = sys.windowHeight * 0.56
        const scale = Math.min(availW / info.width, availH / info.height)
        const cw = Math.max(120, Math.round(info.width * scale))
        const ch = Math.max(120, Math.round(info.height * scale))
        this.imgW = info.width
        this.imgH = info.height
        this.baseW = cw
        this.baseH = ch
        this.setData({ cw: cw, ch: ch, loaded: true }, () => this.redraw())
      },
      fail: () => {
        wx.showToast({ title: '图片读取失败', icon: 'none' })
      }
    })
  },

  // ===== 视图变换 =====
  applyView(ctx) {
    ctx.save()
    ctx.translate(this.view.x, this.view.y)
    ctx.scale(this.view.z, this.view.z)
  },

  // 屏幕坐标 → 图片基准坐标
  screenToBase(x, y) {
    return {
      x: (x - this.view.x) / this.view.z,
      y: (y - this.view.y) / this.view.z
    }
  },

  clampView() {
    const w = this.baseW * this.view.z
    const h = this.baseH * this.view.z
    if (w <= this.data.cw) this.view.x = (this.data.cw - w) / 2
    else this.view.x = Math.min(0, Math.max(this.data.cw - w, this.view.x))
    if (h <= this.data.ch) this.view.y = (this.data.ch - h) / 2
    else this.view.y = Math.min(0, Math.max(this.data.ch - h, this.view.y))
  },

  redraw() {
    const ctx = wx.createCanvasContext('maskCanvas', this)
    this.applyView(ctx)
    ctx.drawImage(this.imagePath, 0, 0, this.baseW, this.baseH)
    this.strokes.forEach(s => this.paintStroke(ctx, s))
    ctx.restore()
    ctx.draw()
  },

  paintStroke(ctx, stroke) {
    const pts = stroke.points || []
    if (!pts.length) return
    ctx.setStrokeStyle('#ffffff')
    ctx.setFillStyle('#ffffff')
    ctx.setLineWidth(stroke.w)
    ctx.setLineCap('round')
    ctx.setLineJoin('round')
    if (pts.length === 1) {
      ctx.beginPath()
      ctx.arc(pts[0].x, pts[0].y, stroke.w / 2, 0, Math.PI * 2)
      ctx.fill()
      return
    }
    ctx.beginPath()
    pts.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y)
      else ctx.lineTo(p.x, p.y)
    })
    ctx.stroke()
  },

  // ===== 手势 =====
  distance(a, b) {
    const dx = a.x - b.x
    const dy = a.y - b.y
    return Math.sqrt(dx * dx + dy * dy) || 1
  },

  onTouchStart(e) {
    if (!this.data.loaded) return
    const ts = e.touches || []
    if (ts.length >= 2) {
      this.pinch = {
        dist: this.distance(ts[0], ts[1]),
        mid: { x: (ts[0].x + ts[1].x) / 2, y: (ts[0].y + ts[1].y) / 2 },
        view: { z: this.view.z, x: this.view.x, y: this.view.y }
      }
      this.current = null
      return
    }
    const t = ts[0]
    if (!t) return
    this.pinch = null
    this.current = {
      w: this.data.brush / this.view.z,   // 笔刷按图片坐标存，缩放后视觉粗细不变
      points: [this.screenToBase(t.x, t.y)]
    }
    this.strokes.push(this.current)
    this.redraw()
  },

  onTouchMove(e) {
    const ts = e.touches || []

    // 双指：缩放 + 平移
    if (this.pinch && ts.length >= 2) {
      const p = this.pinch
      const d = this.distance(ts[0], ts[1])
      const mid = { x: (ts[0].x + ts[1].x) / 2, y: (ts[0].y + ts[1].y) / 2 }
      let z = p.view.z * (d / p.dist)
      z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))
      const bx = (p.mid.x - p.view.x) / p.view.z
      const by = (p.mid.y - p.view.y) / p.view.z
      this.view = { z: z, x: mid.x - bx * z, y: mid.y - by * z }
      this.clampView()
      this.setData({ zoomText: z.toFixed(1) + 'x' })
      this.redraw()
      return
    }

    // 单指：继续画
    if (!this.current) return
    const t = ts[0]
    if (!t) return
    const pts = this.current.points
    const prev = pts[pts.length - 1]
    const p2 = this.screenToBase(t.x, t.y)
    pts.push(p2)

    const ctx = wx.createCanvasContext('maskCanvas', this)
    this.applyView(ctx)
    ctx.setStrokeStyle('#ffffff')
    ctx.setLineWidth(this.current.w)
    ctx.setLineCap('round')
    ctx.setLineJoin('round')
    ctx.beginPath()
    ctx.moveTo(prev.x, prev.y)
    ctx.lineTo(p2.x, p2.y)
    ctx.stroke()
    ctx.restore()
    ctx.draw(true)
  },

  onTouchEnd() {
    this.current = null
    this.pinch = null
  },

  // ===== 缩放按钮 =====
  zoomBy(f) {
    const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.view.z * f))
    const cx = this.data.cw / 2
    const cy = this.data.ch / 2
    const bx = (cx - this.view.x) / this.view.z
    const by = (cy - this.view.y) / this.view.z
    this.view = { z: z, x: cx - bx * z, y: cy - by * z }
    this.clampView()
    this.setData({ zoomText: z.toFixed(1) + 'x' })
    this.redraw()
  },

  zoomIn() { this.zoomBy(1.5) },
  zoomOut() { this.zoomBy(1 / 1.5) },

  resetZoom() {
    this.view = { z: 1, x: 0, y: 0 }
    this.clampView()
    this.setData({ zoomText: '1.0x' })
    this.redraw()
  },

  changeBrush(e) {
    this.setData({ brush: Number(e.currentTarget.dataset.size) || 8 })
  },

  undo() {
    if (!this.strokes.length) return
    this.strokes.pop()
    this.redraw()
  },

  clearAll() {
    this.strokes = []
    this.redraw()
  },

  save() {
    if (!this.strokes.length) {
      return wx.showToast({ title: '还没有涂抹', icon: 'none' })
    }
    wx.showLoading({ title: '生成中' })

    // 导出前把视图复位，保证存下来的是整张图
    const savedView = { z: this.view.z, x: this.view.x, y: this.view.y }
    this.view = { z: 1, x: 0, y: 0 }
    this.redraw()

    setTimeout(() => {
      wx.canvasToTempFilePath({
        canvasId: 'maskCanvas',
        x: 0,
        y: 0,
        width: this.data.cw,
        height: this.data.ch,
        destWidth: this.imgW || this.data.cw,
        destHeight: this.imgH || this.data.ch,
        success: (res) => {
          const fs = wx.getFileSystemManager()
          const dest = wx.env.USER_DATA_PATH + '/mask_' + Date.now() + '.jpg'
          try {
            fs.saveFileSync(res.tempFilePath, dest)
            wx.setStorageSync('review_mask_result', { index: this.imageIndex, path: dest })
            wx.removeStorageSync('review_mask_src')
            wx.hideLoading()
            wx.navigateBack()
          } catch (err) {
            this.view = savedView
            this.redraw()
            wx.hideLoading()
            wx.showToast({ title: '保存失败', icon: 'none' })
          }
        },
        fail: () => {
          this.view = savedView
          this.redraw()
          wx.hideLoading()
          wx.showToast({ title: '生成失败', icon: 'none' })
        }
      }, this)
    }, 150)
  }
})
