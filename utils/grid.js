// utils/grid.js - 把 OCR 识别出的「带坐标文字块」重建成按 星期/节次 的课表行
// 适用于最常见的 7 列星期网格（周一到周日，左列或顶行有节次标注）。
// 这是尽力而为的启发式：重建不出来的，导入页仍可用「原始文字」手动补。
//
// 输入 detections: [{ text, poly: [[x,y],[x,y],[x,y],[x,y]] }]
// 输出: ['周一 第1-2节 高等数学b(1) @ 北区 一教B阶-203', ...]

const DAY_CHAR = ['一', '二', '三', '四', '五', '六', '日']
const DAY_RE = /周[一二三四五六日天]|星期[一二三四五六日天]/
const PERIOD_RE = /第?\s*\d{1,2}\s*[-~到至、—]\s*\d{1,2}\s*节/
const SINGLE_PERIOD_RE = /第?\s*\d{1,2}\s*节/
// 教室识别（与 extract.js 保持一致的宽松规则）
const LOC_RE = /([\u4e00-\u9fa5]{0,6}(?:楼|室|馆|厅|场|房|教|栋)[A-Za-z]?\d{1,4}(?:[-_A-Za-z0-9]*\d)?)|([A-Za-z]\d{2,4}\s*室?)|(线上|网课|腾讯会议|Zoom|钉钉|课堂)/i

// 把一格内的文字拆成「多门课」：同一格可能排了多门课（不同周次轮流上）。
// 课程之间通常以换行分隔；若挤在一行，则按「(第X周)」的结束位置切分。
function splitCell(cellText) {
  const norm = cellText.replace(/（/g, '(').replace(/）/g, ')')
  const out = []
  norm.split(/\r?\n/).forEach(line => {
    // 在每个「周)」之后断开（课程名紧接其周次标注，下一门课从其后开始）
    line.split(/(?<=周\))/).forEach(seg => {
      const s = seg.replace(/\s+/g, ' ').trim()
      if (s) out.push(s)
    })
  })
  return out
}

function centerOf(poly) {
  let sx = 0, sy = 0
  for (const p of poly) { sx += p[0]; sy += p[1] }
  return [sx / poly.length, sy / poly.length]
}
function boxOf(poly) {
  const xs = poly.map(p => p[0]), ys = poly.map(p => p[1])
  return { minX: Math.min.apply(null, xs), maxX: Math.max.apply(null, xs), minY: Math.min.apply(null, ys), maxY: Math.max.apply(null, ys) }
}
function detectDay(text) {
  if (!DAY_RE.test(text)) return 0
  const ch = text.match(/[一二三四五六日天]/)[0]
  return { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 7, '天': 7 }[ch]
}

function reconstructSchedule(detections) {
  if (!detections || !detections.length) return []

  // 1. 计算每个块的中心与包围盒
  const items = detections.map(d => {
    const poly = d.poly || []
    const c = centerOf(poly)
    const b = boxOf(poly)
    return { text: (d.text || '').trim(), cx: c[0], cy: c[1], minX: b.minX, maxX: b.maxX, minY: b.minY, maxY: b.maxY }
  }).filter(it => it.text)

  // 2. 按 cy 聚成行（自适应行间距）
  const heights = items.map(it => it.maxY - it.minY).filter(h => h > 0)
  const medianH = heights.length ? heights.sort((a, b) => a - b)[Math.floor(heights.length / 2)] : 20
  const rowGap = Math.max(12, medianH * 0.6)
  const sorted = items.slice().sort((a, b) => a.cy - b.cy || a.cx - b.cx)
  const rows = []
  let cur = null
  for (const it of sorted) {
    if (!cur || it.cy - cur.lastCy > rowGap) {
      cur = { items: [], lastCy: it.cy }
      rows.push(cur)
    }
    cur.items.push(it)
    cur.lastCy = Math.max(cur.lastCy, it.cy)
  }
  rows.forEach(r => r.items.sort((a, b) => a.cx - b.cx))

  // 3. 找表头行（含星期）并建立星期列
  let headerRow = null
  for (const r of rows) {
    if (r.items.some(it => DAY_RE.test(it.text))) { headerRow = r; break }
  }
  const dayCols = []
  if (headerRow) {
    headerRow.items.forEach(it => {
      const d = detectDay(it.text)
      if (d) dayCols.push({ day: d, cx: it.cx })
    })
    dayCols.sort((a, b) => a.cx - b.cx)
  }
  if (dayCols.length < 2) return [] // 没有足够星期列，退化给原始文字解析

  const firstDayX = dayCols[0].cx
  const avgGap = dayCols.length > 1
    ? (dayCols[dayCols.length - 1].cx - dayCols[0].cx) / (dayCols.length - 1)
    : 100
  const colBounds = [firstDayX - avgGap / 2]
  dayCols.forEach((dc, idx) => {
    const next = dayCols[idx + 1]
    colBounds.push(next ? (dc.cx + next.cx) / 2 : dc.cx + avgGap / 2)
  })

  // 4. 收集左侧节次标签（带 y 范围）。节次块往往纵向较高，覆盖整组课程，
  //    因此用单元格的垂直中心去匹配节次标签区间，能正确覆盖同一格里上下排列的多门课。
  const periodLabels = []
  rows.forEach(r => r.items.forEach(it => {
    if (it.cx < firstDayX - 2 && (PERIOD_RE.test(it.text) || SINGLE_PERIOD_RE.test(it.text))) {
      periodLabels.push({ text: it.text.replace(/\s+/g, ''), minY: it.minY, maxY: it.maxY })
    }
  }))
  function periodForCell(cy) {
    let best = ''
    let bestDist = Infinity
    periodLabels.forEach(p => {
      if (cy >= p.minY - 10 && cy <= p.maxY + 10) {
        best = p.text            // 中心落在节次标签区间内，直接采用
      } else {
        const d = Math.min(Math.abs(cy - p.minY), Math.abs(cy - p.maxY))
        if (d < bestDist) { bestDist = d; best = p.text }   // 否则取最近的节次标签
      }
    })
    return best
  }

  // 5. 遍历数据行，按星期列取出单元格文字 -> 候选行（支持一格多门课）
  const lines = []
  const seen = new Set()
  rows.forEach(r => {
    if (r === headerRow) return
    dayCols.forEach((dc, ci) => {
      const start = colBounds[ci], end = colBounds[ci + 1]
      const cell = r.items.filter(it => it.cx >= start && it.cx < end && it.cx >= firstDayX - 2)
      if (!cell.length) return
      cell.sort((a, b) => a.cy - b.cy || a.cx - b.cx)
      const cellCy = cell.reduce((s, it) => s + it.cy, 0) / cell.length
      const period = periodForCell(cellCy)
      let cellText = cell.map(it => it.text).join(' ')
      // 去掉单元格里混入的星期/节次噪声
      cellText = cellText
        .replace(/周[一二三四五六日天]/g, '')
        .replace(new RegExp(PERIOD_RE.source, 'g'), '')
        .replace(new RegExp(SINGLE_PERIOD_RE.source, 'g'), '')
        .trim()
      if (!cellText) return

      // 同一格可能有多门课（不同周次），逐门拆出
      splitCell(cellText).forEach(seg => {
        let line
        const atIdx = seg.indexOf('@')
        if (atIdx >= 0) {
          line = `周${DAY_CHAR[dc.day - 1]} ${period} ${seg}`.trim()
        } else {
          const lm = seg.match(LOC_RE)
          if (lm) {
            const loc = lm[0]
            const name = seg.replace(loc, '').replace(/\s+/g, ' ').trim()
            line = `周${DAY_CHAR[dc.day - 1]} ${period} ${name} @ ${loc}`.trim()
          } else {
            line = `周${DAY_CHAR[dc.day - 1]} ${period} ${seg}`.trim()
          }
        }
        if (line.length < 4) return
        if (seen.has(line)) return
        seen.add(line)
        lines.push(line)
      })
    })
  })
  return lines
}

module.exports = { reconstructSchedule }
