// 云函数 ocr - 通用印刷体文字识别（带坐标）
// 流程：客户端上传图片到云存储 -> 调用本云函数(传 fileID)
//       -> 云函数下载图片 -> 调用腾讯云 OCR -> 返回文字与每个文字块的坐标
//
// 依赖（在微信开发者工具右键本目录「上传并部署：云端安装依赖」会自动安装）：
//   wx-server-sdk                微信云开发服务端 SDK
//   tencentcloud-sdk-nodejs-ocr  腾讯云 OCR Node SDK（仅 OCR，体积小）
//
// 密钥通过云函数「配置 -> 环境变量」注入（不要硬编码在代码里）：
//   TENCENT_SECRET_ID
//   TENCENT_SECRET_KEY

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const tencentcloud = require('tencentcloud-sdk-nodejs-ocr')
const OcrClient = tencentcloud.ocr.v20181119.Client
const Models = tencentcloud.ocr.v20181119.Models

const client = new OcrClient({
  credential: {
    secretId: process.env.TENCENT_SECRET_ID,
    secretKey: process.env.TENCENT_SECRET_KEY
  },
  region: 'ap-guangzhou',
  profile: {
    httpProfile: { endpoint: 'ocr.tencentcloudapi.com' }
  }
})

exports.main = async (event) => {
  const { fileID } = event || {}
  if (!fileID) return { text: '', detections: [] }

  // 1. 从云存储下载图片
  const dl = await cloud.downloadFile({ fileID })
  const imageBase64 = dl.fileContent.toString('base64')

  // 2. 调用腾讯云通用印刷体识别（返回每个文字块 + 坐标 Polygon）
  const req = new Models.GeneralBasicOCRRequest()
  req.from_json_string(JSON.stringify({ ImageBase64: imageBase64 }))
  const resp = await client.GeneralBasicOCR(req)

  const detections = (resp.TextDetections || []).map(t => ({
    text: t.DetectedText || '',
    // Polygon: [{X,Y}, ...] -> 归一化为 [[x,y], ...]
    poly: (t.Polygon || []).map(p => [p.X || 0, p.Y || 0])
  }))

  // 3. 逐行拼接（阅读顺序，作为原始文字回退用）
  const text = detections.map(t => t.text).join('\n')

  return { text, detections }
}
