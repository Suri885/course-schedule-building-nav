// pages/review-edit/review-edit.js - 新建 / 编辑复习资料
const review = require('../../utils/reviewStore')
const ocr = require('../../utils/ocr')
const config = require('../../config')

const MAX_IMAGES = 9

Page({
  data: {
    id: '',
    title: '',
    text: '',
    answer: '',
    images: [],
    masks: [],
    video: '',
    ocrOn: !!config.OCR_ENABLED,
    filtering: false
  },

  onLoad(q) {
    if (!q || !q.id) return
    const t = review.getItem(q.id)
    if (!t) return
    this.setData({
      id: t.id,
      title: t.title || '',
      text: t.text || '',
      answer: t.answer || '',
      images: t.images || [],
      masks: t.masks || [],
      video: t.video || ''
    })
  },

  onShow() {
    // 从涂抹页返回：接住遮盖图
    const r = wx.getStorageSync('review_mask_result')
    if (r && r.path) {
      wx.removeStorageSync('review_mask_result')
      const images = this.data.images || []
      const masks = (this.data.masks || []).slice()
      while (masks.length < images.length) masks.push('')
      const idx = Number(r.index)
      if (idx >= 0 && idx < images.length) masks[idx] = r.path
      this.setData({ masks: masks })
      wx.showToast({ title: '遮盖已生成', icon: 'success' })
    }
  },

  // ===== 输入 =====
  onTitleInput(e) { this.setData({ title: e.detail.value }) },
  onTextInput(e) { this.setData({ text: e.detail.value }) },
  onAnswerInput(e) { this.setData({ answer: e.detail.value }) },

  // ===== 图片 =====
  chooseImages() {
    const remain = MAX_IMAGES - (this.data.images || []).length
    if (remain <= 0) return wx.showToast({ title: '最多 ' + MAX_IMAGES + ' 张', icon: 'none' })
    wx.chooseMedia({
      count: remain,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: (res) => {
        const files = (res.tempFiles || []).map(f => f.tempFilePath)
        if (!files.length) return
        wx.showLoading({ title: '处理中' })
        this.persistFiles(files, (saved) => {
          wx.hideLoading()
          const images = (this.data.images || []).concat(saved)
          const masks = (this.data.masks || []).slice()
          while (masks.length < images.length) masks.push('')
          this.setData({ images: images, masks: masks })
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
    const images = (this.data.images || []).slice()
    const masks = (this.data.masks || []).slice()
    const maskPath = masks[idx]
    images.splice(idx, 1)
    masks.splice(idx, 1)
    this.setData({ images: images, masks: masks })
    this.dropFile(maskPath)
  },

  dropFile(path) {
    if (!path) return
    try { wx.getFileSystemManager().unlink({ filePath: path, fail: () => {} }) } catch (e) {}
  },

  previewImage(e) {
    const url = e.currentTarget.dataset.url
    if (!url) return
    wx.previewImage({ current: url, urls: [url] })
  },

  // 进入涂抹页：把原图路径放本地存储，避免 URL 过长
  openMask(e) {
    const idx = Number(e.currentTarget.dataset.index)
    const path = (this.data.images || [])[idx]
    if (!path) return
    wx.setStorageSync('review_mask_src', { index: idx, path: path })
    wx.navigateTo({ url: '/pages/review-mask/review-mask' })
  },

  clearMask(e) {
    const idx = Number(e.currentTarget.dataset.index)
    const masks = (this.data.masks || []).slice()
    if (!masks[idx]) return
    this.dropFile(masks[idx])
    masks[idx] = ''
    this.setData({ masks: masks })
    wx.showToast({ title: '已恢复原图', icon: 'none' })
  },

  // ===== 图片文字识别 =====
  recognize(e) {
    const idx = Number(e.currentTarget.dataset.index)
    const path = (this.data.images || [])[idx]
    if (!path) return
    if (!this.data.ocrOn) {
      wx.showModal({
        title: '图片识别未开启',
        content: '图片文字自动识别需要开通微信云开发并部署 ocr 云函数（见 config.js 顶部说明）。\n\n没开通也不影响使用：你可以直接在下面「答案 / 原文」里手动输入或粘贴要背的内容，遮盖图照样能做填空背诵。',
        showCancel: false,
        confirmText: '知道了'
      })
      return
    }
    wx.showLoading({ title: '识别中' })
    ocr.recognizeImage(path).then((res) => {
      wx.hideLoading()
      if (!res || !res.text) {
        wx.showModal({
          title: '没识别出文字',
          content: '可以换一张更清晰的图，或直接在「答案 / 原文」里手动补充。',
          showCancel: false,
          confirmText: '知道了'
        })
        return
      }
      const answer = (this.data.answer || '').trim()
      this.setData({ answer: answer ? answer + '\n' + res.text : res.text })
      wx.showToast({ title: '已提取文字', icon: 'success' })
    }).catch(() => {
      wx.hideLoading()
      wx.showToast({ title: '识别失败，可手动输入', icon: 'none' })
    })
  },

  // ===== 视频 =====
  chooseVideo() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['video'],
      sourceType: ['album', 'camera'],
      maxDuration: 300,
      success: (res) => {
        const f = (res.tempFiles || [])[0]
        if (!f) return
        wx.showLoading({ title: '处理中' })
        this.persistFiles([f.tempFilePath], (saved) => {
          wx.hideLoading()
          this.setData({ video: saved[0] || '' })
        })
      }
    })
  },

  removeVideo() {
    const v = this.data.video
    this.setData({ video: '' })
    this.dropFile(v)
  },

  // ===== 保存 =====
  save() {
    const title = (this.data.title || '').trim()
    const text = (this.data.text || '').trim()
    const answer = (this.data.answer || '').trim()
    const images = this.data.images || []
    const video = this.data.video || ''

    if (!text && !answer && images.length === 0 && !video) {
      return wx.showToast({ title: '先写点内容或加张图', icon: 'none' })
    }

    const payload = {
      title: title || (text ? text.slice(0, 12) : '未命名资料'),
      text: text,
      answer: answer,
      images: images,
      masks: this.data.masks || [],
      video: video
    }

    if (this.data.id) {
      review.updateItem(this.data.id, payload)
      wx.showToast({ title: '已保存', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 400)
      return
    }

    const item = review.addItem(payload)
    // 新建只存进资料库：要不要复习由用户在资料库里点「加入复习计划」决定
    wx.showModal({
      title: '已保存到资料库',
      content: '它暂时不会出现在每日复习里。\n\n需要复习时，在「总资料库」里点这条右侧的「加入复习计划」，从今天开始按艾宾浩斯曲线排期。',
      cancelText: '稍后再说',
      confirmText: '加入复习计划',
      success: (res) => {
        if (res.confirm) review.setScheduled(item.id, true)
        wx.navigateBack()
      }
    })
  },

  deleteItem() {
    if (!this.data.id) return
    wx.showModal({
      title: '删除资料',
      content: '确定删除「' + (this.data.title || '该资料') + '」吗？',
      confirmText: '删除',
      confirmColor: '#e64340',
      success: (res) => {
        if (!res.confirm) return
        review.removeItem(this.data.id)
        wx.showToast({ title: '已删除', icon: 'none' })
        setTimeout(() => wx.navigateBack(), 300)
      }
    })
  }
})
