// utils/navGraph.js
// 把每栋楼每层抽象为导航图，跨层用"电梯/楼梯"垂直边连接，A* 求最短路。
// 支持：多楼栋（C/D）、阶梯教室两层通高（atria 自动断开对应层走廊）、
//       显式走廊不连通（corridorGaps）、跨栋连接（BLOCK_LINKS）。
// 不含 wx 依赖，可在 Node 中直接 require 测试。

const B = require('./buildingData')

// ---------- 建图 ----------
function buildGraph() {
  const nodes = {}      // id -> {id, floor, x, z, y, type, label, blockKey}
  const adj = {}        // id -> [{to, w}]

  function addNode(n) {
    nodes[n.id] = n
    adj[n.id] = []
  }
  function addEdge(a, b, w) {
    if (!nodes[a] || !nodes[b]) return
    adj[a].push({ to: b, w: w })
    adj[b].push({ to: a, w: w })
  }
  function dist3(a, b) {
    const dx = a.x - b.x, dz = a.z - b.z, dy = (a.y || 0) - (b.y || 0)
    return Math.sqrt(dx * dx + dz * dz + dy * dy)
  }
  // 走廊采样 X（含楼梯/电梯 x，保证连通）
  function corridorXsOf(cor, block) {
    const xs = []
    for (let x = cor.x0; x <= cor.x1 + 0.001; x += 5) xs.push(Math.round(x))
    const special = [].concat(block.stairs || [], block.elevators || []).map(v => v.x)
    special.forEach(x => { if (!xs.includes(x)) xs.push(x) })
    xs.sort((a, b) => a - b)
    return xs
  }
  // 某 block 某层的"走廊断开区间"（合并 corridorGaps + atria 推导）
  function gapsOf(block, floor) {
    const gs = []
    ;(block.corridorGaps || []).forEach(g => { if (g.floor === floor) gs.push([g.xStart, g.xEnd]) })
    ;(block.atria || []).forEach(a => {
      if (floor >= a.baseFloor && floor < a.baseFloor + a.span) gs.push([a.xStart, a.xEnd])
    })
    return gs
  }
  function inGap(gs, x) {
    return gs.some(([s, e]) => x >= s && x <= e)
  }

  B.BLOCKS.forEach(block => {
    const bk = block.key
    block.corridors.forEach(cor => {
      const xs = corridorXsOf(cor, block)
      for (let f = 1; f <= block.floors; f++) {
        const y = B.floorY(f)
        const gs = gapsOf(block, f)
        const valid = xs.filter(x => !inGap(gs, x))
        // 走廊节点
        valid.forEach(x => {
          addNode({ id: bk + '_corr_' + f + '_' + x, floor: f, x, z: cor.z, y, type: 'corridor', blockKey: bk })
        })
        // 走廊相邻相连（两点 x 间距超过采样步长 ⇒ 中间被 gap 隔开，不连）
        for (let i = 0; i < valid.length - 1; i++) {
          if (Math.abs(valid[i + 1] - valid[i]) > 5.5) continue
          const a = nodes[bk + '_corr_' + f + '_' + valid[i]]
          const b = nodes[bk + '_corr_' + f + '_' + valid[i + 1]]
          addEdge(a.id, b.id, dist3(a, b))
        }
      }
    })

    // 房间门节点 + 连最近走廊节点（同 block 同层）
    block.rooms.forEach(r => {
      const y = B.floorY(r.floor)
      const id = 'door_' + r.id
      addNode({ id, floor: r.floor, x: r.doorX, z: r.doorZ, y, type: 'door', label: r.name, blockKey: bk })
      let best = null, bestD = Infinity
      Object.values(nodes).forEach(n => {
        if (n.blockKey === bk && n.type === 'corridor' && n.floor === r.floor) {
          const d = Math.abs(n.x - r.doorX)
          if (d < bestD) { bestD = d; best = n }
        }
      })
      if (best) addEdge(id, best.id, dist3(nodes[id], best))
    })

    // 垂直交通：电梯/楼梯 每层节点 + 跨层垂直边
    function vert(list, key) {
      ;(list || []).forEach(v => {
        for (let f = 1; f <= block.floors; f++) {
          const y = B.floorY(f)
          const id = bk + '_' + key + '_' + v.x + '_' + f
          addNode({ id, floor: f, x: v.x, z: v.z, y, type: key === 'elev' ? 'elevator' : 'stair', label: v.label + '·' + f + 'F', blockKey: bk })
          let best = null, bestD = Infinity
          Object.values(nodes).forEach(n => {
            if (n.blockKey === bk && n.type === 'corridor' && n.floor === f) {
              const d = Math.abs(n.x - v.x)
              if (d < bestD) { bestD = d; best = n }
            }
          })
          if (best) addEdge(id, best.id, dist3(nodes[id], best))
        }
        for (let f = 1; f < block.floors; f++) {
          const a = nodes[bk + '_' + key + '_' + v.x + '_' + f]
          const b = nodes[bk + '_' + key + '_' + v.x + '_' + (f + 1)]
          addEdge(a.id, b.id, B.FLOOR_H)
        }
      })
    }
    vert(block.elevators, 'elev')
    vert(block.stairs, 'stair')

    // 入口节点（仅 1 层）+ 连最近走廊节点
    ;(block.entrances || []).forEach(e => {
      const id = 'ent_' + e.id
      addNode({ id, floor: 1, x: e.x, z: e.z, y: B.floorY(1), type: 'entrance', label: e.label, blockKey: bk })
      let best = null, bestD = Infinity
      Object.values(nodes).forEach(n => {
        if (n.blockKey === bk && n.type === 'corridor' && n.floor === 1) {
          const d = Math.abs(n.x - e.x)
          if (d < bestD) { bestD = d; best = n }
        }
      })
      if (best) addEdge(id, best.id, dist3(nodes[id], best))
    })
  })

  // 跨栋连接：按 BLOCK_LINKS 在指定楼层建连廊边（部分连通场景）
  if (B.BLOCK_LINKS) {
    B.BLOCK_LINKS.forEach(l => {
      l.floors.forEach(f => {
        // fromBlock 该层最东走廊节点
        let cNode = null, cMax = -Infinity
        Object.values(nodes).forEach(n => {
          if (n.blockKey === l.fromBlock && n.type === 'corridor' && n.floor === f) {
            if (n.x > cMax) { cMax = n.x; cNode = n }
          }
        })
        // toBlock 该层最西走廊节点
        let dNode = null, dMin = Infinity
        Object.values(nodes).forEach(n => {
          if (n.blockKey === l.toBlock && n.type === 'corridor' && n.floor === f) {
            if (n.x < dMin) { dMin = n.x; dNode = n }
          }
        })
        if (cNode && dNode) addEdge(cNode.id, dNode.id, l.w || 14)
      })
    })
  }

  return { nodes, adj }
}

const GRAPH = buildGraph()

// ---------- A* ----------
function heuristic(a, b) {
  const dx = a.x - b.x, dz = a.z - b.z, dy = (a.y || 0) - (b.y || 0)
  return Math.sqrt(dx * dx + dz * dz + dy * dy)
}

function findRoute(startId, goalId) {
  if (!GRAPH.nodes[startId] || !GRAPH.nodes[goalId]) return null
  const start = GRAPH.nodes[startId]
  const goal = GRAPH.nodes[goalId]
  // 跨栋保护：起点与终点不在同一 block 且无 BLOCK_LINKS → 不可直达
  if (start.blockKey !== goal.blockKey && !B.BLOCK_LINKS) {
    return { waypoints: [], cost: 0, unreachable: 'cross-block', note: 'C/D 两栋独立，需先从外部到达目标楼栋入口' }
  }

  const open = new Map()
  const came = {}
  const g = {}
  g[startId] = 0
  open.set(startId, heuristic(start, goal))
  while (open.size) {
    let cur = null, bestF = Infinity
    open.forEach((f, id) => { if (f < bestF) { bestF = f; cur = id } })
    if (cur === goalId) break
    open.delete(cur)
    const cu = GRAPH.nodes[cur]
    GRAPH.adj[cur].forEach(({ to, w }) => {
      const ng = g[cur] + w
      if (g[to] === undefined || ng < g[to]) {
        g[to] = ng
        came[to] = cur
        open.set(to, ng + heuristic(GRAPH.nodes[to], goal))
      }
    })
  }
  if (g[goalId] === undefined) return null

  const ids = []
  let c = goalId
  while (c !== undefined) { ids.unshift(c); c = came[c] }
  const wps = ids.map(id => {
    const n = GRAPH.nodes[id]
    return { id, floor: n.floor, x: n.x, z: n.z, y: n.y, type: n.type, label: n.label || '', blockKey: n.blockKey }
  })
  for (let i = 1; i < wps.length; i++) wps[i].vertical = wps[i].floor !== wps[i - 1].floor
  return { waypoints: wps, cost: g[goalId] }
}

module.exports = {
  GRAPH,
  findRoute,
  getNode: (id) => GRAPH.nodes[id] || null,
  entranceNodeId: (entranceId) => 'ent_' + entranceId,
  roomDoorNodeId: (roomId) => 'door_' + roomId
}
