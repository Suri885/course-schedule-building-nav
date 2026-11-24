// utils/extract.js - 从粘贴的课表文字中解析出课程候选（本地、无需后端）
// 设计目标：把教务系统 / 同学发的课表文字，尽量自动抽取出
//   课程名、星期、节次(或时间段)、教师、教室
// 解析是启发式的——结果在导入页都可逐项编辑，识别不准也能手动改。
//
// 支持的常见格式：
//   周一 1-2节 高等数学 张明华 教学楼A301
//   周三 08:00-09:35 大学物理 陈志强 物理楼D302
//   周一 5节 军事理论                          （单节次）
//   周一 1-2节 高等数学b(1) @ 北区 一教B阶-203  （@ 分隔课程名与教室）
//   周一 1-2节 新时代实践教育 @ 北区 一教A-214  （@ 之后可多词）

const { toMinutes } = require('./courses')

const DAY_MAP = {
  '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 7, '天': 7,
  'mon': 1, 'tue': 2, 'wed': 3, 'thu': 4, 'fri': 5, 'sat': 6, 'sun': 7
}

// 根据时间段反查默认节次下标 [startIdx, endIdx]，匹配不上返回 [-1,-1]
function resolveByTime(startMin, endMin, slots) {
  if (startMin == null || endMin == null) return [-1, -1]
  const sIdx = slots.findIndex(s => toMinutes(s.start) === startMin)
  const eIdx = slots.findIndex(s => toMinutes(s.end) === endMin)
  if (sIdx >= 0 && eIdx >= 0 && eIdx >= sIdx) return [sIdx, eIdx]
  return [-1, -1]
}

// 根据节次号(1..12)反查下标
function resolveByPeriod(pStart, pEnd, slots) {
  const sIdx = slots.findIndex(s => s.period === pStart)
  const eIdx = slots.findIndex(s => s.period === pEnd)
  if (sIdx >= 0 && eIdx >= 0 && eIdx >= sIdx) return [sIdx, eIdx]
  return [-1, -1]
}

// 把「7-16」/「5,7,9,11,13,15,17,19」/「5-9,11-16」这样的周次说明展开成数字数组
function expandWeekSpec(spec) {
  const out = []
  spec.split(/[,，、]/).forEach(chunk => {
    const r = chunk.match(/(\d{1,2})\s*[-~到至]\s*(\d{1,2})/)
    if (r) {
      for (let w = +r[1]; w <= +r[2]; w++) out.push(w)
    } else {
      const n = chunk.match(/\d{1,2}/)
      if (n) out.push(+n[0])
    }
  })
  return out
}

// 从文字中提取授课周次（如 (第7-16周) / （第11周） / (第5,7,9周)），返回去重升序数组
// 同时把这些周次标注从句名里剥离（返回 { weeks, name }）
function extractWeeks(text) {
  const WEEK_RE = /[（(]?\s*第\s*\d{1,2}(?:\s*[-,，、]\s*\d{1,2})*\s*周\s*[）)]?/g
  const matches = (text.match(WEEK_RE) || [])
  if (!matches.length) return { weeks: null, name: text }
  const weeks = []
  matches.forEach(seg => {
    const inner = seg.replace(/[（）()第周\s]/g, '')
    expandWeekSpec(inner).forEach(w => weeks.push(w))
  })
  const uniq = [...new Set(weeks)].sort((a, b) => a - b)
  const name = text.replace(WEEK_RE, '').replace(/\s+/g, ' ').trim()
  return { weeks: uniq.length ? uniq : null, name: name }
}

// 解析单行文字为一条课程候选
function extractLine(line, slots) {
  const result = { raw: line, day: 0, name: '', teacher: '', location: '', startPeriodIndex: -1, endPeriodIndex: -1, timeDesc: '', weeks: null }

  // 0. 先抽取授课周次（如 (第7-16周)）并从文字中剥离。
  //    必须在分词之前做：周次里含逗号(第5,7,9周)，否则后续按逗号分词会截断课名。
  const wk0 = extractWeeks(line)
  result.weeks = wk0.weeks
  let work = wk0.name

  // 1. 星期：周X / 星期X / 礼拜X
  const dayM = work.match(/周[一二三四五六日天]|星期[一二三四五六日天]|礼拜[一二三四五六日天]/)
  if (dayM) result.day = DAY_MAP[dayM[0].slice(-1)]

  // 2. "@" 分隔符：把 @ 之后整段当作教室（兼容"北区 一教A-214"等多词教室）
  //    注意：只在第一个 @ 处切；之后只剩课程名 / 教师 / 节次 信息
  let beforeAt = work
  let atMatched = false
  const atIdx = work.indexOf('@')
  if (atIdx >= 0) {
    result.location = work.substring(atIdx + 1).trim()
    beforeAt = work.substring(0, atIdx)
    atMatched = true
  }

  // 3. 节次范围：第1-2节 / 1-2节
  let pStart = null, pEnd = null
  const perM = beforeAt.match(/第?\s*(\d{1,2})\s*[-~到至]\s*(\d{1,2})\s*节/)
  if (perM) { pStart = parseInt(perM[1], 10); pEnd = parseInt(perM[2], 10) }

  // 3b. 单节次：第5节 / 5节（非范围的一部分）
  let singleM = null
  if (pStart == null) {
    singleM = beforeAt.match(/第?\s*(\d{1,2})\s*节(?![\-~到至\d])/)
    if (singleM) { pStart = parseInt(singleM[1], 10); pEnd = pStart }
  }

  // 4. 时钟时间段：08:00-09:35 / 8:00~9:35
  let startMin = null, endMin = null, clockText = ''
  const clockM = beforeAt.match(/(\d{1,2})[:：](\d{2})\s*[-~到至]\s*(\d{1,2})[:：](\d{2})/)
  if (clockM) {
    startMin = parseInt(clockM[1], 10) * 60 + parseInt(clockM[2], 10)
    endMin = parseInt(clockM[3], 10) * 60 + parseInt(clockM[4], 10)
    clockText = clockM[0]
  }

  // 5. 教室（仅当没有 @ 时用正则）
  if (!atMatched) {
    const locM = beforeAt.match(/(?:[\u4e00-\u9fa5]{0,6}(?:楼|室|馆|厅|场|房|教|栋)[A-Za-z]?\d{1,4})|[A-Za-z]\d{2,4}\s*室?|(?:线上|网课|腾讯会议|Zoom|钉钉|课堂)/i)
    if (locM) result.location = locM[0].trim()
  }

  // 6. 教师（优先「教师/老师/任课: XXX」关键字）
  let teacher = ''
  const tM = beforeAt.match(/(?:教师|老师|任课|授课|讲师|教授)[::：\s]*([\u4e00-\u9fa5]{2,4})/)
  if (tM) teacher = tM[1]

  // 7. 分词：第一非元信息词=课程名；后续 2-3 字汉字=教师。
  //    注意：只按空白与分号切词，不按逗号（周次已先行剥离，避免误伤课名）。
  const tokens = beforeAt.split(/[\s;；]+/).map(t => t.trim()).filter(Boolean)
  const metaSet = new Set()
  if (dayM) metaSet.add(dayM[0].trim())
  if (perM) metaSet.add(perM[0].trim())
  if (singleM) metaSet.add(singleM[0].trim())   // 单节次也加入 metaSet，避免"5节"混入课程名
  if (clockM) metaSet.add(clockM[0].trim())
  if (result.location && !atMatched) metaSet.add(result.location)  // 正则匹配的教室才回填
  if (tM) metaSet.add(tM[0].trim())

  const nameParts = []
  let foundName = false
  tokens.forEach((tok) => {
    if (metaSet.has(tok)) return
    if (/^第?\d{1,2}周$/.test(tok)) return       // 第3周 之类
    if (/^\d+$/.test(tok)) return                // 纯数字
    // 第一个非元信息的词当作课程名（课程名可能排在最前）
    if (!foundName) {
      nameParts.push(tok)
      foundName = true
      return
    }
    // 已有课程名后：后续2-3个汉字（可带 老师/教授）当作教师
    // 限制2-3字，避免把4字课程名(如 高等数学)误判成教师
    if (!teacher && /^[\u4e00-\u9fa5]{2,3}(?:老师|教授|讲师|博士)?$/.test(tok)) {
      teacher = tok.replace(/(老师|教授|讲师|博士)$/, '')
      return
    }
    nameParts.push(tok)
  })
  result.name = nameParts.join(' ').replace(/(必修|选修|公选|限选|任选)$/, '').trim()
  result.teacher = teacher

  // 8. 节次/时间 -> 默认节次下标
  let sIdx = -1, eIdx = -1
  if (pStart != null) {
    const r = resolveByPeriod(pStart, pEnd || pStart, slots)
    sIdx = r[0]; eIdx = r[1]
    result.timeDesc = '第' + pStart + (pEnd && pEnd !== pStart ? ('-' + pEnd) : '') + '节'
  }
  if (sIdx < 0 && startMin != null) {
    const r = resolveByTime(startMin, endMin, slots)
    if (r[0] >= 0) { sIdx = r[0]; eIdx = r[1]; result.timeDesc = clockText }
  }
  result.startPeriodIndex = sIdx
  result.endPeriodIndex = eIdx
  // 只有含星期(且尽量含时间)才当作课程；其余行(如标题)会被上层过滤
  return result
}

// 解析整段文字，返回课程候选数组（已含星期、节次下标等）
// 上层(导入页)负责把 startPeriodIndex<0 标记为「需手动调整」
function extractCourses(text, slots) {
  if (!text) return []
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const out = []
  lines.forEach(line => {
    const c = extractLine(line, slots)
    if (c.day > 0) out.push(c)   // 必须有星期才能落位
  })
  return out
}

module.exports = { extractCourses, extractLine, resolveByTime, resolveByPeriod, extractWeeks, expandWeekSpec }