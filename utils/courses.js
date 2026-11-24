// utils/courses.js - 课程数据模型与工具函数

// 默认时间段（北京化工大学 2026-2027 学年作息，每节 45 分钟）
// 上 午：1-5 节（08:00-12:15）  下 午：6-9 节（13:30-16:50）  晚 上：10-12 节（18:00-20:25）
// period 同时是该时段的稳定ID：默认时段1-12，自定义时段从101开始
const defaultSlots = [
  { period: 1,  label: '第1节',  start: '08:00', end: '08:45', custom: false },
  { period: 2,  label: '第2节',  start: '08:50', end: '09:35', custom: false },
  { period: 3,  label: '第3节',  start: '09:45', end: '10:30', custom: false },
  { period: 4,  label: '第4节',  start: '10:40', end: '11:25', custom: false },
  { period: 5,  label: '第5节',  start: '11:30', end: '12:15', custom: false },
  { period: 6,  label: '第6节',  start: '13:30', end: '14:15', custom: false },
  { period: 7,  label: '第7节',  start: '14:20', end: '15:05', custom: false },
  { period: 8,  label: '第8节',  start: '15:15', end: '16:00', custom: false },
  { period: 9,  label: '第9节',  start: '16:05', end: '16:50', custom: false },
  { period: 10, label: '第10节', start: '18:00', end: '18:45', custom: false },
  { period: 11, label: '第11节', start: '18:50', end: '19:35', custom: false },
  { period: 12, label: '第12节', start: '19:40', end: '20:25', custom: false }
]

// 'HH:mm' -> 分钟数
function toMinutes(str) {
  const p = String(str).split(':').map(Number)
  return p[0] * 60 + p[1]
}

// 读取时段列表：本地存储优先，否则用默认；始终按开始时间排序
function getSlots() {
  let slots = wx.getStorageSync('slots')
  if (!slots || !slots.length) {
    slots = defaultSlots.map(s => Object.assign({}, s))
  }
  slots.sort((a, b) => toMinutes(a.start) - toMinutes(b.start))
  return slots
}

// 保存时段列表
function saveSlots(slots) {
  wx.setStorageSync('slots', slots)
}

// 时段时间是否与另一时段重叠（按分钟比较）
function slotsOverlap(s1, s2) {
  return toMinutes(s1.start) < toMinutes(s2.end) && toMinutes(s2.start) < toMinutes(s1.end)
}

// 星期定义
const weekDays = [
  { day: 1, label: '一' },
  { day: 2, label: '二' },
  { day: 3, label: '三' },
  { day: 4, label: '四' },
  { day: 5, label: '五' },
  { day: 6, label: '六' },
  { day: 7, label: '日' }
]

// 课程颜色主题（7种，简约清新配色）
const courseColors = {
  blue:   { bg: '#E6F1FB', name: '#0C447C', location: '#185FA5' },
  teal:   { bg: '#E1F5EE', name: '#085041', location: '#0F6E56' },
  purple: { bg: '#EEEDFE', name: '#3C3489', location: '#534AB7' },
  amber:  { bg: '#FAEEDA', name: '#633806', location: '#854F0B' },
  coral:  { bg: '#FAECE7', name: '#712B13', location: '#993C1D' },
  green:  { bg: '#EAF3DE', name: '#27500A', location: '#3B6D11' },
  pink:   { bg: '#FBEAF0', name: '#72243E', location: '#993556' }
}

// 生成1-20周的数组（北化大最长学期约19周，预留余量）
const allWeeks = Array.from({ length: 20 }, (_, i) => i + 1)
// 单周
const oddWeeks = allWeeks.filter(w => w % 2 === 1)
// 双周
const evenWeeks = allWeeks.filter(w => w % 2 === 0)

module.exports = {
  timeSlots: defaultSlots,
  defaultSlots,
  getSlots,
  saveSlots,
  slotsOverlap,
  toMinutes,
  weekDays,
  courseColors,
  allWeeks,
  oddWeeks,
  evenWeeks
}
