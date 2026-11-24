// pages/scene/scene.js
// 三维第一人称场景：类 MC 操控（左下半屏摇杆前后 + 其余区域滑动转视角），
// 从所选入口进入，渲染教室查询得到的 3D 路线（含电梯/楼梯垂直段）。
const B = require('../../utils/buildingData')
const N = require('../../utils/navGraph')
const app = getApp()

const EYE = 1.6        // 视线高度
const SPEED = 4.0      // 移动速度（单位/秒）
const PITCH_LIMIT = 1.3

Page({
  data: {
    webglReady: true,
    hasLocation: false,
    locLabel: '',
    routeText: '',
    goalText: '',
    joyX: 75,
    joyY: 75
  },

  onLoad() {
    const g = app.globalData
    this.setData({
      hasLocation: !!g.currentEntranceNodeId,
      locLabel: g.currentLocationLabel || ''
    })
  },

  onReady() {
    if (!app.globalData.currentEntranceNodeId) {
      wx.showModal({
        title: '尚未选择入口',
        content: '请先返回外部地图选择你的入口，再进入三维场景。',
        showCancel: false,
        success: () => wx.redirectTo({ url: '/pages/extmap/extmap' })
      })
      return
    }
    this.initThree()
  },

  onShow() {
    // 从查询页返回时，若已规划路线则渲染
    if (this.THREE && app.globalData.route) this.renderRoute(app.globalData.route)
    this.updateRouteHUD()
  },

  // ---------- 初始化 Three.js ----------
  initThree() {
    const self = this
    let createScoped = null
    try { createScoped = require('threejs-miniprogram').createScopedThreejs } catch (e) { createScoped = null }
    if (!createScoped) {
      // 未构建 npm 依赖时的降级提示，避免白屏
      this.setData({ webglReady: false })
      return
    }

    wx.createSelectorQuery().select('#gl').fields({ node: true, size: true }).exec((res) => {
      if (!res || !res[0]) return
      const canvas = res[0].node
      const w = res[0].width, h = res[0].height
      const THREE = createScoped(canvas)
      self.THREE = THREE
      self.canvas = canvas

      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
      renderer.setSize(w, h)
      renderer.setClearColor(0x0f172a, 1)
      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(72, w / h, 0.1, 1000)
      camera.rotation.order = 'YXZ'

      scene.add(new THREE.AmbientLight(0xffffff, 0.75))
      const dir = new THREE.DirectionalLight(0xffffff, 0.6)
      dir.position.set(30, 60, 20)
      scene.add(dir)

      self.buildBuilding(scene, THREE)
      self.scene = scene
      self.camera = camera
      self.renderer = renderer

      // 起始位置 = 所选入口节点
      const node = N.getNode(app.globalData.currentEntranceNodeId)
      const startY = (node ? node.y : 0) + EYE
      camera.position.set(node ? node.x : 30, startY, node ? node.z : 20)
      self.yaw = 0
      self.pitch = 0
      self.move = { x: 0, y: 0 } // 摇杆向量（x=平移, y=前后）
      self.touches = {}

      // 路线
      if (app.globalData.route) self.renderRoute(app.globalData.route)
      self.updateRouteHUD()

      let last = Date.now()
      const loop = () => {
        const now = Date.now()
        const dt = Math.min((now - last) / 1000, 0.05)
        last = now
        self.applyMovement(dt)
        camera.rotation.y = self.yaw
        camera.rotation.x = self.pitch
        renderer.render(scene, camera)
        canvas.requestAnimationFrame(loop)
      }
      canvas.requestAnimationFrame(loop)
    })
  },

  // ---------- 用程序化数据搭建楼壳 ----------
  buildBuilding(scene, THREE) {
    const addBox = (sw, sh, sd, x, y, z, color, opacity) => {
      const g = new THREE.BoxGeometry(sw, sh, sd)
      const m = new THREE.MeshStandardMaterial({
        color, transparent: opacity < 1, opacity: opacity,
        roughness: 0.9, metalness: 0.0
      })
      const mesh = new THREE.Mesh(g, m)
      mesh.position.set(x, y, z)
      scene.add(mesh)
      return mesh
    }

    for (let f = 1; f <= B.FLOORS; f++) {
      const y0 = B.floorY(f)
      // 楼板
      addBox(B.FOOTPRINT.w, 0.2, B.FOOTPRINT.d, B.FOOTPRINT.w / 2, y0 - 0.1, B.FOOTPRINT.d / 2, 0x334155, 1)
      // 半透明外墙（看得见内部）
      const hw = 0.3, hh = B.FLOOR_H
      addBox(B.FOOTPRINT.w, hh, hw, B.FOOTPRINT.w / 2, y0 + hh / 2, 0, 0x64748b, 0.12)
      addBox(B.FOOTPRINT.w, hh, hw, B.FOOTPRINT.w / 2, y0 + hh / 2, B.FOOTPRINT.d, 0x64748b, 0.12)
      addBox(hw, hh, B.FOOTPRINT.d, 0, y0 + hh / 2, B.FOOTPRINT.d / 2, 0x64748b, 0.12)
      addBox(hw, hh, B.FOOTPRINT.d, B.FOOTPRINT.w, y0 + hh / 2, B.FOOTPRINT.d / 2, 0x64748b, 0.12)
      // 走廊地面高亮
      const cz0 = B.CORRIDOR.z - B.CORRIDOR.halfWidth
      const cz1 = B.CORRIDOR.z + B.CORRIDOR.halfWidth
      addBox(B.CORRIDOR.x1 - B.CORRIDOR.x0, 0.05, cz1 - cz0,
        (B.CORRIDOR.x0 + B.CORRIDOR.x1) / 2, y0 + 0.04, B.CORRIDOR.z, 0x475569, 1)
      // 房间地贴（按楼层着色，便于辨识）
      const floorColor = [0x3b82f6, 0x8b5cf6, 0x06b6d4, 0xf59e0b, 0x10b981][(f - 1) % 5]
      B.ROOMS.filter((r) => r.floor === f).forEach((r) => {
        const z0 = r.side === 'left' ? 3 : 23
        const z1 = r.side === 'left' ? 17 : 37
        addBox(10, 0.05, (z1 - z0), r.cx, y0 + 0.03, (z0 + z1) / 2, floorColor, 0.55)
      })
    }

    // 电梯井（贯穿全楼，半透明）
    const topY = B.floorY(B.FLOORS)
    addBox(3, topY + 1, 3, B.ELEVATORS[0].x, (topY + 1) / 2, B.ELEVATORS[0].z, 0xf59e0b, 0.18)
    // 楼梯井
    B.STAIRS.forEach((s) => {
      addBox(3, topY + 1, 3, s.x, (topY + 1) / 2, s.z, 0x10b981, 0.18)
    })
  },

  // ---------- 渲染路线 ----------
  renderRoute(route) {
    const THREE = this.THREE
    if (!THREE || !this.scene) return
    // 清掉旧路线
    if (this.routeGroup) { this.scene.remove(this.routeGroup); this.routeGroup = null }
    if (this.beacon) { this.scene.remove(this.beacon); this.beacon = null }

    const group = new THREE.Group()
    const pts = route.waypoints.map((w) => new THREE.Vector3(w.x, B.floorY(w.floor) + 0.3, w.z))
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts.map((p) => [p.x, p.y, p.z]).flat(), 3))
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x22d3ee }))
    group.add(line)

    // 途经点小球
    pts.forEach((p) => {
      const s = new THREE.Mesh(
        new THREE.SphereGeometry(0.5, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0x22d3ee })
      )
      s.position.copy(p)
      group.add(s)
    })

    // 目标信标
    const goal = route.goalRoom
    if (goal) {
      const beacon = new THREE.Mesh(
        new THREE.CylinderGeometry(0.6, 0.6, 6, 16),
        new THREE.MeshBasicMaterial({ color: 0xef4444 })
      )
      beacon.position.set(goal.cx, B.floorY(goal.floor) + 3, goal.cz)
      group.add(beacon)
      this.beacon = beacon
    }
    this.scene.add(group)
    this.routeGroup = group
  },

  updateRouteHUD() {
    const r = app.globalData.route
    if (!r) { this.setData({ routeText: '', goalText: '' }); return }
    const floors = []
    r.waypoints.forEach((w) => { if (!floors.includes(w.floor)) floors.push(w.floor) })
    const changes = r.waypoints.filter((w) => w.vertical).length
    this.setData({
      goalText: '目标 ' + r.goalRoom.number + ' · ' + r.goalRoom.floor + '层',
      routeText: '途经 ' + floors.join('/') + ' 层' + (changes ? ' · 换层 ' + changes + ' 次' : '') + ' · 约 ' + Math.round(r.cost) + 'm'
    })
  },

  // ---------- 移动与视角 ----------
  applyMovement(dt) {
    if (!this.camera) return
    const forward = new this.THREE.Vector3()
    this.camera.getWorldDirection(forward)
    forward.y = 0
    if (forward.lengthSq() > 0) forward.normalize()
    const right = new this.THREE.Vector3(forward.z, 0, -forward.x) // 水平右向量
    const step = SPEED * dt
    this.camera.position.addScaledVector(forward, this.move.y * step)
    this.camera.position.addScaledVector(right, this.move.x * step)
    // 限制在楼内
    this.camera.position.x = Math.max(0.5, Math.min(B.FOOTPRINT.w - 0.5, this.camera.position.x))
    this.camera.position.z = Math.max(0.5, Math.min(B.FOOTPRINT.d - 0.5, this.camera.position.z))
  },

  // 触控：左下区域=摇杆（前后/平移），其余=滑动转视角
  onTouchStart(e) {
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    const sh = info.screenHeight || info.windowHeight
    e.touches.forEach((t) => {
      const isJoy = t.clientX < 170 && (sh - t.clientY) < 240
      this.touches[t.identifier] = {
        mode: isJoy ? 'move' : 'rotate',
        ox: t.clientX, oy: t.clientY, lx: t.clientX, ly: t.clientY
      }
    })
  },

  onTouchMove(e) {
    if (!this.touches) return
    e.touches.forEach((t) => {
      const rec = this.touches[t.identifier]
      if (!rec) return
      if (rec.mode === 'move') {
        const dx = t.clientX - rec.ox
        const dy = t.clientY - rec.oy
        const len = Math.min(Math.hypot(dx, dy), 60)
        const ang = Math.atan2(dy, dx)
        const kx = Math.cos(ang) * len / 60
        const ky = Math.sin(ang) * len / 60
        this.move = { x: kx, y: -ky } // 上推=前进
        this.updateJoystickUI(kx, ky)
      } else {
        const ddx = t.clientX - rec.lx
        const ddy = t.clientY - rec.ly
        this.yaw -= ddx * 0.005
        this.pitch -= ddy * 0.005
        this.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.pitch))
      }
      rec.lx = t.clientX; rec.ly = t.clientY
    })
  },

  onTouchEnd(e) {
    if (!this.touches) return
    e.changedTouches.forEach((t) => { delete this.touches[t.identifier] })
    // 若无摇杆触控，则停止移动
    const anyMove = Object.values(this.touches).some((r) => r.mode === 'move')
    if (!anyMove) { this.move = { x: 0, y: 0 }; this.updateJoystickUI(0, 0) }
  },

  updateJoystickUI(kx, ky) {
    this.setData({ joyX: 75 + kx * 50, joyY: 75 + ky * 50 })
  },

  // ---------- 顶部按钮 ----------
  onSearch() {
    wx.navigateTo({ url: '/pages/search/search' })
  },
  onClearRoute() {
    app.clearRoute()
    if (this.routeGroup && this.scene) { this.scene.remove(this.routeGroup); this.routeGroup = null }
    if (this.beacon && this.scene) { this.scene.remove(this.beacon); this.beacon = null }
    this.updateRouteHUD()
    wx.showToast({ title: '已清除路线', icon: 'none' })
  },
  onExit() {
    wx.redirectTo({ url: '/pages/extmap/extmap' })
  }
})
