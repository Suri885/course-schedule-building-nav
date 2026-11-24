// pages/add-course/add-course.js - 添加课程页面
const { getSlots, toMinutes, courseColors } = require('../../utils/courses')
const smart = require('../../utils/smart')

const TOTAL_WEEKS = 16
const colorKeys = Object.keys(courseColors)

Page({
  data: {
    // 表单数据
    name: '',
    teacher: '',
    location: '',

    // 星期选择器
    dayIndex: 0,
    dayLabels: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],

    // 时段选择器（从本地存储读取，含自定义时段）
    slotLabels: [],
    startPeriodIndex: 0,
    endPeriodIndex: 0,

    // 周次模式：全部周 / 单周 / 双周 / 自定义
    weekModeOptions: ['全部周 (1-16周)', '仅单周', '仅双周', '自定义范围'],
    weekModeIndex: 0,
    isCustomWeeks: false,
    weekNumbers: Array.from({ length: TOTAL_WEEKS }, (_, i) => i + 1),
    customStartIndex: 0,   // 默认第1周
    customEndIndex: 15,    // 默认第16周

    // 颜色选择（7色）
    colorList: colorKeys.map(key => ({
      key: key,
      swatch: courseColors[key].bg
    })),
    selectedColor: '',  // 空字符串 = 自动分配

    // 实时冲突提示（时间 / 教师 / 教室）
    conflicts: [],

    // 批量添加模式（从日程表总加号进入）：保存后不退出，可连续录入
    batch: false,
    addedCount: 0
  },

  onLoad(options) {
    this.setData({ batch: !!(options && options.batch === '1') })
  },

  onShow() {
    // 每次进入都重新读时段（用户可能在课表页加了自定义时段）
    const slots = getSlots()
    this.slots = slots
    const slotLabels = slots.map(s => s.label + ' ' + s.start)
    const patch = { slotLabels }
    // 选择下标不能超出范围
    if (this.data.startPeriodIndex >= slots.length) patch.startPeriodIndex = 0
    if (this.data.endPeriodIndex >= slots.length) patch.endPeriodIndex = 0
    this.setData(patch)
    this.recomputeConflicts()
  },

  // 根据当前选择，实时检测与已有课程/活动的冲突
  recomputeConflicts() {
    const slots = this.slots || getSlots()
    const dayOfWeek = this.data.dayIndex + 1
    const startSlot = slots[this.data.startPeriodIndex]
    const endSlot = slots[this.data.endPeriodIndex]
    if (!startSlot || !endSlot) { this.setData({ conflicts: [] }); return }
    const candidate = {
      id: '__new__',
      day: dayOfWeek,
      weeks: this.buildWeeks(),
      startMin: toMinutes(startSlot.start),
      endMin: toMinutes(endSlot.end),
      teacher: (this.data.teacher || '').trim(),
      location: (this.data.location || '').trim()
    }
    const existing = smart.collectItems(
      wx.getStorageSync('courses') || [],
      wx.getStorageSync('events') || [],
      slots
    )
    const clashes = smart.checkCandidate(candidate, existing, { teacher: true, room: true })
    this.setData({ conflicts: clashes })
  },

  // ===== 输入框事件 =====
  onNameInput(e) { this.setData({ name: e.detail.value }) },
  onTeacherInput(e) {
    this.setData({ teacher: e.detail.value })
    this.recomputeConflicts()
  },
  onLocationInput(e) {
    this.setData({ location: e.detail.value })
    this.recomputeConflicts()
  },

  // ===== 选择器事件 =====
  onDayChange(e) {
    this.setData({ dayIndex: Number(e.detail.value) })
    this.recomputeConflicts()
  },

  onStartPeriodChange(e) {
    const idx = Number(e.detail.value)
    const patch = { startPeriodIndex: idx }
    // 结束节次不能早于开始节次，自动修正
    if (this.data.endPeriodIndex < idx) {
      patch.endPeriodIndex = idx
    }
    this.setData(patch)
    this.recomputeConflicts()
  },

  onEndPeriodChange(e) {
    const idx = Number(e.detail.value)
    if (idx < this.data.startPeriodIndex) {
      return wx.showToast({ title: '结束时段不能早于开始', icon: 'none' })
    }
    this.setData({ endPeriodIndex: idx })
    this.recomputeConflicts()
  },

  onWeekModeChange(e) {
    const idx = Number(e.detail.value)
    this.setData({
      weekModeIndex: idx,
      isCustomWeeks: idx === 3
    })
    this.recomputeConflicts()
  },

  onCustomStartChange(e) {
    const idx = Number(e.detail.value)
    const patch = { customStartIndex: idx }
    if (this.data.customEndIndex < idx) {
      patch.customEndIndex = idx
    }
    this.setData(patch)
    this.recomputeConflicts()
  },

  onCustomEndChange(e) {
    const idx = Number(e.detail.value)
    if (idx < this.data.customStartIndex) {
      return wx.showToast({ title: '结束周不能早于开始周', icon: 'none' })
    }
    this.setData({ customEndIndex: idx })
    this.recomputeConflicts()
  },

  // ===== 颜色选择 =====
  onColorTap(e) {
    const key = e.currentTarget.dataset.key
    // 再点一次取消选择，回到自动分配
    if (this.data.selectedColor === key) {
      this.setData({ selectedColor: '' })
    } else {
      this.setData({ selectedColor: key })
    }
  },

  // ===== 保存 =====
  onSave() {
    const { name, teacher, location } = this.data

    // 1. 校验必填项
    if (!name.trim()) {
      return wx.showToast({ title: '请填写课程名称', icon: 'none' })
    }

    // 2. 构造课程对象（时段用时段ID标识，支持自定义时段）
    const dayOfWeek = this.data.dayIndex + 1
    const slots = this.slots || getSlots()
    const startPeriod = slots[this.data.startPeriodIndex].period
    const endPeriod = slots[this.data.endPeriodIndex].period
    const weeks = this.buildWeeks()

    const newCourse = {
      id: Date.now().toString(),   // 用时间戳当唯一ID
      name: name.trim(),
      teacher: teacher.trim(),
      location: location.trim(),
      color: this.data.selectedColor || this.autoPickColor(),
      weeks: weeks,
      dayOfWeek: dayOfWeek,
      startPeriod: startPeriod,
      endPeriod: endPeriod
    }

    // 3. 冲突检测（实时结果，覆盖 时间/教师/教室）
    const courses = wx.getStorageSync('courses') || []
    const conflicts = this.data.conflicts

    if (conflicts.length) {
      const detail = conflicts.map(c => '· ' + c.detail).join('\n')
      wx.showModal({
        title: '检测到冲突',
        content: '仍要添加吗？\n' + detail,
        confirmText: '仍要添加',
        cancelText: '再想想',
        success: (res) => {
          if (res.confirm) this.saveCourse(newCourse, courses)
        }
      })
    } else {
      this.saveCourse(newCourse, courses)
    }
  },

  // 根据选择生成周次数组
  buildWeeks() {
    const mode = this.data.weekModeIndex
    const all = this.data.weekNumbers
    if (mode === 0) return all.slice()                       // 全部周
    if (mode === 1) return all.filter(w => w % 2 === 1)      // 单周
    if (mode === 2) return all.filter(w => w % 2 === 0)      // 双周
    // 自定义范围
    const start = this.data.weekNumbers[this.data.customStartIndex]
    const end = this.data.weekNumbers[this.data.customEndIndex]
    return all.filter(w => w >= start && w <= end)
  },

  // 自动分配当前用得最少的颜色
  autoPickColor() {
    const courses = wx.getStorageSync('courses') || []
    const usage = {}
    colorKeys.forEach(k => { usage[k] = 0 })
    courses.forEach(c => {
      if (usage[c.color] !== undefined) usage[c.color]++
    })
    return colorKeys.reduce((min, k) => usage[k] < usage[min] ? k : min, colorKeys[0])
  },

  // 实际写入存储并返回
  saveCourse(newCourse, courses) {
    courses.push(newCourse)
    wx.setStorageSync('courses', courses)

    // 批量模式：留在本页继续加下一门，只清名称/教师/教室，保留星期、节次、周次
    if (this.data.batch) {
      const n = this.data.addedCount + 1
      this.setData({ addedCount: n, name: '', teacher: '', location: '', selectedColor: '' })
      this.recomputeConflicts()
      wx.showToast({ title: '已添加 ' + n + ' 门', icon: 'success' })
      return
    }

    wx.showToast({ title: '添加成功', icon: 'success' })
    // 延迟一点让用户看到提示，然后返回课表页
    setTimeout(() => wx.navigateBack(), 600)
  },

  finishBatch() {
    wx.navigateBack()
  }
})
