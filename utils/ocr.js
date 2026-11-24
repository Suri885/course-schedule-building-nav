// utils/ocr.js - 图片选图与识别
// 设计：选图统一用 wx.chooseMedia；识别默认回退「手动输入」通道（离线可用），
// 当 config.OCR_ENABLED 为 true 时，上传到云存储后调用云函数 ocr 完成识别。

const { OCR_ENABLED, CLOUD_ENV } = require('../config')

// 选择一张图片，返回临时路径
function chooseImage() {
  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const file = (res.tempFiles && res.tempFiles[0]) || {}
        if (file.tempFilePath) resolve(file.tempFilePath)
        else reject(new Error('未获取到图片'))
      },
      fail: reject
    })
  })
}

// 识别图片为文字
// 返回 { text, detections, source }
//   text:       拼接后的原始文字（阅读顺序，作为手动校正/回退用）
//   detections: [{text, poly:[[x,y]...]}] 带坐标的文字块（用于网格重建）
//   source: 'cloud'（云端OCR）| 'manual'（需手动输入）
async function recognizeImage(tempPath) {
  if (!OCR_ENABLED || !wx.cloud) {
    // 离线版：识别文字需手动输入/粘贴
    return { text: '', detections: [], source: 'manual' }
  }
  try {
    if (CLOUD_ENV) wx.cloud.init({ env: CLOUD_ENV })
    // 云函数无法直接读取客户端本地临时路径，需先上传到云存储
    const ext = (tempPath.split('.').pop() || 'jpg').split('?')[0]
    const up = await wx.cloud.uploadFile({
      cloudPath: 'ocr/' + Date.now() + '.' + ext,
      filePath: tempPath
    })
    // 云函数 ocr 内部下载图片并调用 OCR，返回 { text, detections }
    const res = await wx.cloud.callFunction({ name: 'ocr', data: { fileID: up.fileID } })
    const result = (res && res.result) || {}
    const text = result.text || ''
    const detections = result.detections || []
    return { text, detections, source: text ? 'cloud' : 'manual' }
  } catch (e) {
    // 任何失败都安全回退到手动输入，不影响主流程
    return { text: '', detections: [], source: 'manual' }
  }
}

module.exports = { chooseImage, recognizeImage }
