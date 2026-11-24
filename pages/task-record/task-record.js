// pages/task-record/task-record.js - 任务详情：评分标注 + 记账式加分记录
// 记录分两种状态：待确认（仅本人登记，不计分）/ 已确认（学校系统通过，计入得分）
const { findTask } = require('../../utils/secondClass')
const scStore = require('../../utils/scStore')

Page({
  data: {
    task: null,
    section: null,
    got: 0,           // 已确认得分（封顶 cap）
    pending: 0,       // 待确认加分
    cap: 0,           // 该项上限
    remain: 0,        // 还差多少
    records: [],      // 每条含 ok（是否已确认）
    newText: '',
    newImages: [],
    newScore: ''      // 加分记录填写
  },

  onLoad(q) {
    this.taskId = q.task
    this.load()
  },

  onShow() {
    this.load()   // 返回时刷新
  },

  load() {
    const r = findTask(this.taskId)
    if (!r) {
      wx.showToast({ title: '未找到该任务', icon: 'none' })
      return
    }
    const records = scStore.getTaskRecords(this.taskId).map(rec =>
      Object.assign({}, rec, { ok: scStore.isConfirmedRecord(rec) })
    )
    this.setData({
      task: r.task,
      section: r.section,
      got: scStore.getTaskScore(this.taskId),
      pending: scStore.getTaskPendingScore(this.taskId),
      cap: r.task.cap,
      remain: scStore.getTaskRemain(r.task),
      records: records,
      newText: '',
      newImages: [],
      newScore: ''
    })
  },

  // 只刷新记录与分数，不清空正在填的表单
  refreshList() {
    const records = scStore.getTaskRecords(this.taskId).map(rec =>
      Object.assign({}, rec, { ok: scStore.isConfirmedRecord(rec) })
    )
    this.setData({
      records: records,
      got: scStore.getTaskScore(this.taskId),
      pending: scStore.getTaskPendingScore(this.taskId),
      remain: scStore.getTaskRemain(findTask(this.taskId).task)
    })
  },

  onTextInput(e) {
    this.setData({ newText: e.detail.value })
  },

  onScoreInput(e) {
    this.setData({ newScore: e.detail.value })
  },

  // 选择图片并持久化保存到本地（USER_DATA_PATH 长期有效）
  chooseImage() {
    wx.chooseMedia({
      count: 9,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: (res) => {
        const fs = wx.getFileSystemManager()
        const saved = (this.data.newImages || []).slice()
        res.tempFiles.forEach(f => {
          const ext = ((f.tempFilePath.split('.').pop() || 'jpg').split('?')[0]) || 'jpg'
          const dest = wx.env.USER_DATA_PATH + '/sc_' + Date.now() + '_' + Math.floor(Math.random() * 1e4) + '.' + ext
          try {
            fs.saveFileSync(f.tempFilePath, dest)
            saved.push(dest)
          } catch (e) {
            saved.push(f.tempFilePath) // 失败则退回临时路径
          }
        })
        this.setData({ newImages: saved })
      }
    })
  },

  removeImage(e) {
    const i = e.currentTarget.dataset.index
    const arr = (this.data.newImages || []).slice()
    arr.splice(i, 1)
    this.setData({ newImages: arr })
  },

  // 保存一条加分记录：默认「待确认」，学校系统通过后再手动确认
  saveRecord() {
    const text = (this.data.newText || '').trim()
    const imgs = this.data.newImages || []
    if (!text && imgs.length === 0) {
      return wx.showToast({ title: '写点内容或加张图', icon: 'none' })
    }
    let score = Number(this.data.newScore)
    if (!score || score <= 0) score = 0

    const rec = {
      id: 'r' + Date.now() + Math.floor(Math.random() * 1000),
      text: text,
      images: imgs,
      score: score,
      time: this.fmtTime(new Date()),
      confirmed: false
    }
    scStore.addRecord(this.taskId, rec)
    this.setData({ newText: '', newImages: [], newScore: '' })
    this.refreshList()
    wx.showToast({ title: score > 0 ? '已登记 +' + score + '分（待确认）' : '已登记', icon: 'none' })
  },

  // 确认 / 撤销确认加分
  toggleConfirm(e) {
    const id = e.currentTarget.dataset.id
    const rec = (this.data.records || []).find(r => r.id === id)
    if (!rec) return

    if (rec.ok) {
      wx.showModal({
        title: '撤销确认',
        content: '撤销后这 ' + (rec.score || 0) + ' 分将不再计入得分。',
        confirmText: '撤销',
        cancelText: '取消',
        success: (res) => {
          if (!res.confirm) return
          scStore.setRecordConfirmed(this.taskId, id, false)
          this.refreshList()
          wx.showToast({ title: '已撤销确认', icon: 'none' })
        }
      })
      return
    }

    scStore.setRecordConfirmed(this.taskId, id, true)
    this.refreshList()
    const over = this.data.got >= this.data.cap
    wx.showToast({ title: over ? '已确认（该项已满分封顶）' : '已确认，计入得分', icon: 'none' })
  },

  previewImage(e) {
    const url = e.currentTarget.dataset.url
    const images = e.currentTarget.dataset.images || []
    wx.previewImage({ current: url, urls: images })
  },

  deleteRecord(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '删除记录',
      content: '确定删除这条记录吗？对应加分也会撤销。',
      confirmText: '删除',
      confirmColor: '#e64340',
      success: (res) => {
        if (res.confirm) {
          scStore.deleteRecord(this.taskId, id)
          this.refreshList()
        }
      }
    })
  },

  fmtTime(d) {
    const p = n => (n < 10 ? '0' + n : '' + n)
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes())
  }
})
