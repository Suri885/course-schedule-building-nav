// pages/memo/memo.js - 备忘录：纯记录，大输入框 + 图片，不做待办勾选
const { getSlots } = require('../../utils/courses')

const MAX_IMAGES = 9

Page({
  data: {
    // 编辑区
    content: '',
    images: [],
    editingId: '',        // 非空 = 正在编辑某条备忘

    // 列表
    memos: [],
    memoCount: 0,

    // 关联课表弹层
    showLinkPanel: false,
    linkingId: '',
    linkingPreview: '',
    dayLabels: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
    slotLabels: [],
    linkDayIndex: 0,
    linkSlotIndex: 0
  },

  onShow() {
    this.loadMemos()
    this.setData({ slotLabels: getSlots().map(s => s.label + ' ' + s.start) })
  },

  // ===== 列表 =====
  loadMemos() {
    const slots = getSlots()
    const memos = wx.getStorageSync('memos') || []
    // 新的在前
    memos.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    memos.forEach(m => {
      m.images = Array.isArray(m.images) ? m.images : []
      m.timeText = this.timeText(m.createdAt)
      if (m.link) {
        const slot = slots.find(s => s.period === m.link.slotId)
        m.linkText = '周' + '一二三四五六日'[m.link.day - 1] + ' · ' + (slot ? slot.label : '未知时段')
      } else {
        m.linkText = ''
      }
    })
    this.setData({ memos: memos, memoCount: memos.length })
  },

  timeText(ts) {
    if (!ts) return ''
    const d = new Date(ts)
    const now = new Date()
    const pad = n => (n < 10 ? '0' + n : '' + n)
    const hm = pad(d.getHours()) + ':' + pad(d.getMinutes())
    const day0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const that0 = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
    const diffDay = Math.round((day0 - that0) / 86400000)
    if (diffDay === 0) return '今天 ' + hm
    if (diffDay === 1) return '昨天 ' + hm
    if (d.getFullYear() === now.getFullYear()) return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + hm
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日'
  },

  // ===== 编辑区 =====
  onContentInput(e) {
    this.setData({ content: e.detail.value })
  },

  // 插入图片：选图后落到本地持久目录，避免临时路径失效
  chooseImages() {
    const remain = MAX_IMAGES - this.data.images.length
    if (remain <= 0) return wx.showToast({ title: '最多 ' + MAX_IMAGES + ' 张', icon: 'none' })
    wx.chooseMedia({
      count: remain,
      mediaType: ['image'],
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const files = (res.tempFiles || []).map(f => f.tempFilePath)
        if (!files.length) return
        wx.showLoading({ title: '处理中' })
        this.persistFiles(files, (saved) => {
          wx.hideLoading()
          this.setData({ images: this.data.images.concat(saved) })
        })
      }
    })
  },

  persistFiles(files, cb) {
    const fs = wx.getFileSystemManager()
    const out = []
    let i = 0
    const next = () => {
      if (i >= files.length) return cb(out)
      const temp = files[i++]
      try {
        fs.saveFile({
          tempFilePath: temp,
          success: (res) => { out.push(res.savedFilePath); next() },
          fail: () => { out.push(temp); next() }
        })
      } catch (e) {
        out.push(temp)
        next()
      }
    }
    next()
  },

  removeImage(e) {
    const idx = Number(e.currentTarget.dataset.index)
    const images = this.data.images.slice()
    const target = images[idx]
    images.splice(idx, 1)
    this.setData({ images: images })
    this.dropFile(target)
  },

  // 删除本地已保存的图片文件（失败忽略）
  dropFile(path) {
    if (!path || path.indexOf('usr') < 0) return
    try { wx.getFileSystemManager().unlink({ filePath: path, fail: () => {} }) } catch (e) {}
  },

  previewImage(e) {
    const src = e.currentTarget.dataset.src
    if (!src) return
    wx.previewImage({ current: src, urls: [src] })
  },

  // 保存（新增或修改）
  saveMemo() {
    const content = (this.data.content || '').trim()
    const images = this.data.images || []
    if (!content && images.length === 0) {
      return wx.showToast({ title: '写点文字或插张图吧', icon: 'none' })
    }
    const memos = wx.getStorageSync('memos') || []

    if (this.data.editingId) {
      const target = memos.find(m => m.id === this.data.editingId)
      if (target) {
        target.content = content
        target.images = images
        target.updatedAt = Date.now()
      }
      wx.setStorageSync('memos', memos)
      wx.showToast({ title: '已保存', icon: 'success' })
    } else {
      memos.unshift({
        id: 'm' + Date.now() + Math.floor(Math.random() * 1000),
        content: content,
        images: images,
        createdAt: Date.now(),
        tag: '',
        link: null
      })
      wx.setStorageSync('memos', memos)
      wx.showToast({ title: '已记下', icon: 'success' })
    }
    this.setData({ content: '', images: [], editingId: '' })
    this.loadMemos()
  },

  // 点击备忘 → 载入编辑区
  startEdit(e) {
    const id = e.currentTarget.dataset.id
    const memo = (wx.getStorageSync('memos') || []).find(m => m.id === id)
    if (!memo) return
    this.setData({
      editingId: id,
      content: memo.content || '',
      images: Array.isArray(memo.images) ? memo.images.slice() : []
    })
    wx.pageScrollTo({ scrollTop: 0, duration: 200 })
  },

  cancelEdit() {
    this.setData({ editingId: '', content: '', images: [] })
  },

  // 长按删除
  deleteMemo(e) {
    const id = e.currentTarget.dataset.id
    const memo = (wx.getStorageSync('memos') || []).find(m => m.id === id)
    if (!memo) return
    const brief = (memo.content || '').slice(0, 20) || '这条备忘'
    wx.showModal({
      title: '删除备忘',
      content: '确定删除「' + brief + '」吗？',
      confirmText: '删除',
      confirmColor: '#e64340',
      success: (res) => {
        if (!res.confirm) return
        const images = Array.isArray(memo.images) ? memo.images : []
        images.forEach(p => this.dropFile(p))
        const memos = (wx.getStorageSync('memos') || []).filter(m => m.id !== id)
        wx.setStorageSync('memos', memos)
        if (this.data.editingId === id) this.cancelEdit()
        this.loadMemos()
      }
    })
  },

  // ===== 贴到课表时段 =====
  openLinkPanel(e) {
    const id = e.currentTarget.dataset.id
    const memo = (wx.getStorageSync('memos') || []).find(m => m.id === id)
    if (!memo) return
    this.setData({
      showLinkPanel: true,
      linkingId: id,
      linkingPreview: memo.content || '（图片备忘）',
      linkDayIndex: memo.link ? memo.link.day - 1 : 0,
      linkSlotIndex: memo.link ? Math.max(0, getSlots().findIndex(s => s.period === memo.link.slotId)) : 0
    })
  },

  closeLinkPanel() {
    this.setData({ showLinkPanel: false, linkingId: '' })
  },

  noop() {},

  onLinkDayChange(e) { this.setData({ linkDayIndex: Number(e.detail.value) }) },
  onLinkSlotChange(e) { this.setData({ linkSlotIndex: Number(e.detail.value) }) },

  saveLink() {
    const { linkingId, linkDayIndex, linkSlotIndex } = this.data
    const slots = getSlots()
    const slot = slots[linkSlotIndex]
    if (!slot) return
    const memos = wx.getStorageSync('memos') || []
    const memo = memos.find(m => m.id === linkingId)
    if (!memo) return this.closeLinkPanel()
    memo.link = { day: linkDayIndex + 1, slotId: slot.period }
    wx.setStorageSync('memos', memos)
    wx.showToast({ title: '已贴到课表', icon: 'success' })
    this.closeLinkPanel()
    this.loadMemos()
  },

  unlinkMemo() {
    const memos = wx.getStorageSync('memos') || []
    const memo = memos.find(m => m.id === this.data.linkingId)
    if (memo && memo.link) {
      delete memo.link
      wx.setStorageSync('memos', memos)
      wx.showToast({ title: '已从课表移除', icon: 'success' })
    }
    this.closeLinkPanel()
    this.loadMemos()
  }
})
