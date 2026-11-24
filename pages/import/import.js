// pages/import/import.js - 智能统一导入课表
// 流程：进入本页 -> 上传课表照片 -> 自动识别(网格重建)/手动输入 -> 可编辑预览 -> 生成课表
const { getSlots, courseColors } = require('../../utils/courses')
const { extractCourses } = require('../../utils/extract')
const { chooseImage, recognizeImage } = require('../../utils/ocr')
const { reconstructSchedule } = require('../../utils/grid')
const { OCR_ENABLED } = require('../../config')
const smart = require('../../utils/smart')

const colorKeys = Object.keys(courseColors)
const TOTAL_WEEKS = 20
const weekNumbers = Array.from({ length: TOTAL_WEEKS }, (_, i) => i + 1)

// 一键填入的示例课表（与「北化实践教学综合服务平台-学期课表」格式一致）
// 格式：周X 第起-止节 课程名(第X-Y周)
// —— 其中 (第X-Y周) 为授课周次，会自动识别并仅在该周显示；不写则整学期。
const SAMPLE_TEXT = `周四 第01-02节 军事理论(第7-16周)
周五 第01-02节 新时代中华优秀传统文化传承(第12-17周)
周五 第01-02节 新时代实践教育(第11周)
周一 第03-05节 高等数学B(Ⅱ)(第13-19周)
周一 第03-05节 高等数学B(Ⅰ)(第5-12周)
周二 第03-05节 无机化学原理(第5-18周)
周三 第03-05节 高等数学B(Ⅱ)(第13-19周)
周三 第03-05节 高等数学B(Ⅰ)(第5-12周)
周四 第03-05节 体育（Ⅰ）(第6-19周)
周五 第03-05节 高等数学B(Ⅱ)(第12-18周)
周五 第03-05节 高等数学B(Ⅰ)(第5-11周)
周一 第06-07节 新时代实践教育(第11周)
周二 第06-07节 英语读写1(第5,7,9,11,13,15,17,19周)
周二 第06-07节 英语听说（Ⅰ）(第6,8,10,12,14,16,18周)
周三 第06-07节 无机化学实验(B)(第7-13周)
周四 第06-07节 习近平新时代中国特色社会主义思想概论(第5-18周)
周一 第08-09节 无机化学原理(第7,9-11,13周)
周二 第08-09节 英语读写1(第5,7,9,11,13,15,17,19周)
周三 第08-09节 无机化学实验(B)(第7-13周)
周三 第08-09节 无机化学实验(B)(第7-14周)
周四 第08-09节 习近平新时代中国特色社会主义思想概论(第5-18周)
周一 第10-12节 化工强国(第12-18周)
周二 第10-12节 新能源材料与器件概论(第5-9,11-16周)
周三 第10-12节 大学生心理健康教育(第7-13周)
周三 第10-12节 化工强国(第15-18周)
周四 第10-12节 大学生健康教育(第6-13周)`

// 把周次数组转成简短文本（如 第7-16周 / 第11周 / 第5,7,9周）
function weeksToText(weeks) {
  if (!weeks || !weeks.length) return '整学期'
  const sorted = weeks.slice().sort((a, b) => a - b)
  const ranges = []
  let s = sorted[0], prev = sorted[0]
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === prev + 1) { prev = sorted[i] }
    else { ranges.push([s, prev]); s = sorted[i]; prev = sorted[i] }
  }
  ranges.push([s, prev])
  return ranges.map(r => r[0] === r[1] ? ('第' + r[0] + '周') : ('第' + r[0] + '-' + r[1] + '周')).join('、')
}

Page({
  data: {
    ocrEnabled: OCR_ENABLED,

    // 选中的照片
    imagePath: '',
    imageHint: '',

    // 文字输入（识别后校正 / 离线手动输入）
    showText: !OCR_ENABLED,   // 离线默认显示；云端识别成功前也可手动
    manualMode: false,        // 是否处于「手动输入」状态（云端识别不准时切换）
    textValue: '',

    // 解析结果预览
    parsed: false,
    candidates: [],
    checkedCount: 0,

    // 选择器数据源
    dayLabels: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
    slotLabels: [],

    // 默认整学期
    allWeeks: weekNumbers
  },

  onShow() {
    this.slots = getSlots()
    this.setData({ slotLabels: this.slots.map(s => s.label + ' ' + s.start) })
  },

  onTextInput(e) {
    this.setData({ textValue: e.detail.value })
  },

  // 解析一段文字为候选课程（含星期/节次下标/周次）
  parseText(rawText) {
    const slots = this.slots || getSlots()
    const list = extractCourses(rawText, slots).map((c, i) => {
      const weeks = (c.weeks && c.weeks.length) ? c.weeks : weekNumbers
      return {
        idx: i,
        raw: c.raw,
        name: c.name || '',
        teacher: c.teacher || '',
        location: c.location || '',
        dayIndex: (c.day || 1) - 1,
        startPeriodIndex: c.startPeriodIndex >= 0 ? c.startPeriodIndex : 0,
        endPeriodIndex: c.endPeriodIndex >= 0 ? c.endPeriodIndex : (c.startPeriodIndex >= 0 ? c.startPeriodIndex : 0),
        weeks: weeks,
        weeksText: weeksToText(c.weeks),
        checked: true,
        needAdjust: c.startPeriodIndex < 0
      }
    })
    const checkedCount = list.filter(c => c.checked).length
    this.setData({ candidates: list, parsed: true, checkedCount: checkedCount })
    if (!list.length) {
      wx.showToast({ title: '没识别出课程，换种格式试试', icon: 'none' })
    }
  },

  onParseTap() {
    const t = (this.data.textValue || '').trim()
    if (!t) return wx.showToast({ title: '先粘贴或输入课表文字', icon: 'none' })
    this.parseText(t)
  },

  // 一键填入示例课表（与北化平台学期课表一致，方便快速验证）
  onFillSample() {
    this.setData({ textValue: SAMPLE_TEXT })
    wx.showToast({ title: '已填入示例，可直接点解析', icon: 'none' })
  },

  // 选图（拍照 / 相册）—— 统一入口
  async onChooseImage() {
    try {
      const path = await chooseImage()
      this.setData({ imagePath: path, rawText: '', fromPhoto: false, textValue: '' })
      if (OCR_ENABLED) {
        this.setData({ manualMode: false, showText: false, imageHint: '正在识别…' })
        wx.showLoading({ title: '识别中', mask: true })
        const { text, detections } = await recognizeImage(path)
        wx.hideLoading()
        if (text || (detections && detections.length)) {
          // 优先用网格重建：把带坐标的文字块重排成「周X 第N节 课程 @ 教室 (第X周)」
          let lines = []
          if (detections && detections.length) {
            lines = reconstructSchedule(detections)
          }
          const useText = lines.length ? lines.join('\n') : text
          this.setData({
            textValue: useText,
            rawText: text,
            fromPhoto: true,
            imageHint: lines.length
              ? '📷 已从图片识别出 ' + lines.length + ' 门，核对后生成课表'
              : '📷 图片已识别，但未能自动排版，请点「手动输入」核对',
            showText: !lines.length,
            manualMode: !lines.length
          })
          if (useText) this.parseText(useText)
          else this.setData({ parsed: false, candidates: [] })
        } else {
          this.setData({ manualMode: true, showText: true, imageHint: '未能识别，请在下方粘贴/输入课表文字' })
        }
      } else {
        // 离线版：选图后展示文字输入框，由用户粘贴/输入（或点示例）
        this.setData({ manualMode: true, showText: true, imageHint: '本机未开启云端识别，请在下方粘贴/输入课表文字（或点「示例」）' })
      }
    } catch (e) {
      // 用户取消选择，不做处理
    }
  },

  // 云端识别不准时，切换到手动输入；或手动输入后切回预览
  onToggleManual() {
    const manualMode = !this.data.manualMode
    this.setData({ manualMode: manualMode, showText: manualMode || !OCR_ENABLED })
  },

  // ===== 候选行编辑 =====
  onCandName(e) { this.patchCand(e.currentTarget.dataset.i, { name: e.detail.value }) },
  onCandTeacher(e) { this.patchCand(e.currentTarget.dataset.i, { teacher: e.detail.value }) },
  onCandLocation(e) { this.patchCand(e.currentTarget.dataset.i, { location: e.detail.value }) },

  onCandDay(e) { this.patchCand(e.currentTarget.dataset.i, { dayIndex: Number(e.detail.value) }) },

  onCandStart(e) {
    const i = Number(e.currentTarget.dataset.i)
    const v = Number(e.detail.value)
    const patch = { startPeriodIndex: v }
    const cs = this.data.candidates.slice()
    if (cs[i].endPeriodIndex < v) patch.endPeriodIndex = v
    this.patchCand(i, patch)
  },

  onCandEnd(e) {
    const i = Number(e.currentTarget.dataset.i)
    const v = Number(e.detail.value)
    const cs = this.data.candidates
    if (v < cs[i].startPeriodIndex) return wx.showToast({ title: '结束不能早于开始', icon: 'none' })
    this.patchCand(i, { endPeriodIndex: v })
  },

  toggleCand(e) {
    const i = Number(e.currentTarget.dataset.i)
    const cs = this.data.candidates.slice()
    cs[i].checked = !cs[i].checked
    const checkedCount = cs.filter(c => c.checked).length
    this.setData({ candidates: cs, checkedCount: checkedCount })
  },

  // 局部更新某个候选并刷新选中数
  patchCand(i, patch) {
    const cs = this.data.candidates.slice()
    Object.assign(cs[i], patch)
    this.setData({ candidates: cs })
  },

  // 自动分配当前用得最少的颜色（含待写入的新课）
  autoPickColor(courses) {
    const usage = {}
    colorKeys.forEach(k => { usage[k] = 0 })
    courses.forEach(c => { if (usage[c.color] !== undefined) usage[c.color]++ })
    return colorKeys.reduce((min, k) => usage[k] < usage[min] ? k : min, colorKeys[0])
  },

  // 确认导入 -> 生成课表
  onImport() {
    const slots = this.slots || getSlots()
    const selected = this.data.candidates.filter(c => c.checked && (c.name || '').trim())
    if (!selected.length) return wx.showToast({ title: '没有可导入的课程', icon: 'none' })

    const courses = wx.getStorageSync('courses') || []
    const newOnes = []
    selected.forEach(c => {
      const startSlot = slots[c.startPeriodIndex]
      const endSlot = slots[c.endPeriodIndex]
      if (!startSlot || !endSlot) return
      newOnes.push({
        id: Date.now().toString() + Math.floor(Math.random() * 1000),
        name: (c.name || '').trim(),
        teacher: (c.teacher || '').trim(),
        location: (c.location || '').trim(),
        color: this.autoPickColor(courses.concat(newOnes)),
        weeks: (c.weeks && c.weeks.length ? c.weeks : weekNumbers).slice(),
        dayOfWeek: c.dayIndex + 1,
        startPeriod: startSlot.period,
        endPeriod: endSlot.period
      })
    })

    if (!newOnes.length) return wx.showToast({ title: '请先为课程选择节次', icon: 'none' })

    courses.push.apply(courses, newOnes)
    wx.setStorageSync('courses', courses)
    wx.showToast({ title: '已生成 ' + newOnes.length + ' 门', icon: 'success' })
    setTimeout(() => wx.navigateBack(), 600)
  }
})
