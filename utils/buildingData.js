// utils/buildingData.js
// 多楼栋（C座 / D座）教学楼数据模型，支持阶梯教室两层通高与走廊不连通。
// 坐标：x 向东，z 向南，y 向上（楼板面）。每层高 FLOOR_H。
// ★ 真实数据（你拍的平面图）到图后，替换 BLOCKS 数组即可，导航与 3D 自动适配，无需改引擎。
// 不含 wx 依赖，可在 Node 中直接 require 测试。

const FLOOR_H = 3.5

// 程序化生成某栋某层房间（走廊两侧）。真实数据到图后整段替换。
function buildRoomsFor(blockKey, floorFrom, floorTo, opt) {
  const rooms = []
  const sideZ = opt.sideZ // [{side, z0, z1, doorZ}]
  const ROOM_STEP = opt.step
  const ROOM_X0 = opt.x0
  const numberFn = opt.numberFn // (floor, kf) => 显示号
  for (let f = floorFrom; f <= floorTo; f++) {
    let kf = 0
    sideZ.forEach((s) => {
      const cz = (s.z0 + s.z1) / 2
      for (let i = 0; i < opt.count; i++) {
        const cx = ROOM_X0 + i * ROOM_STEP
        kf += 1
        rooms.push({
          id: 'room_' + blockKey + '_' + f + '_' + kf,
          number: numberFn(f, kf),
          blockKey: blockKey,
          floor: f,
          name: '教室 ' + numberFn(f, kf),
          cx: cx,
          cz: cz,
          doorX: cx,
          doorZ: s.doorZ,
          side: s.side
        })
      }
    })
  }
  return rooms
}

// ============ ★ 真实数据替换区：BLOCKS ============
// corridorGaps：某层某 x 区间无走廊（物理隔断，非阶梯教室造成）。
// atria（阶梯教室）：占 baseFloor..baseFloor+span-1 层，其 xStart..xEnd 区间在那些层自动断开走廊（挑空）。
const BLOCKS = [
  {
    key: 'C', name: 'C座',
    footprint: { x0: 0, x1: 60, z0: 0, z1: 40 },
    floors: 5,
    corridors: [{ z: 20, x0: 5, x1: 55 }],
    // 演示：1-2 层一个两层通高的阶梯教室（左侧 x17~28），导致 1、2 层该段走廊被挑空断开
    atria: [
      { number: 101, baseFloor: 1, span: 2, side: 'left', xStart: 17, xEnd: 28 }
    ],
    // 演示：3 层 x30~40 一段走廊因布局不连通（物理隔断）
    corridorGaps: [
      { floor: 3, xStart: 30, xEnd: 40 }
    ],
    stairs: [
      { x: 8, z: 20, label: 'C楼梯A' },
      { x: 52, z: 20, label: 'C楼梯B' }
    ],
    elevators: [{ x: 30, z: 20, label: 'C客梯' }],
    entrances: [
      { id: 'C_en_s1', label: 'C座南门-西', x: 24, z: 39.8, cluster: 'C_south' },
      { id: 'C_en_s2', label: 'C座南门-中', x: 30, z: 39.8, cluster: 'C_south' },
      { id: 'C_en_s3', label: 'C座南门-东', x: 36, z: 39.8, cluster: 'C_south' },
      { id: 'C_en_w', label: 'C座西门', x: 0.4, z: 20, cluster: 'C_west' }
    ],
    rooms: buildRoomsFor('C', 1, 5, {
      sideZ: [
        { side: 'left', z0: 3, z1: 17, doorZ: 17.8 },
        { side: 'right', z0: 23, z1: 37, doorZ: 22.2 }
      ],
      step: 11, x0: 6, count: 5,
      numberFn: (f, kf) => f * 100 + kf
    })
  },
  {
    key: 'D', name: 'D座',
    footprint: { x0: 70, x1: 130, z0: 0, z1: 40 }, // 与 C 座在 x 上拉开（演示两栋独立）
    floors: 5,
    corridors: [{ z: 20, x0: 75, x1: 125 }],
    atria: [],
    corridorGaps: [],
    stairs: [
      { x: 78, z: 20, label: 'D楼梯A' },
      { x: 122, z: 20, label: 'D楼梯B' }
    ],
    elevators: [{ x: 100, z: 20, label: 'D客梯' }],
    entrances: [
      { id: 'D_en_s1', label: 'D座南门-西', x: 94, z: 39.8, cluster: 'D_south' },
      { id: 'D_en_s2', label: 'D座南门-中', x: 100, z: 39.8, cluster: 'D_south' },
      { id: 'D_en_e', label: 'D座东门', x: 129.6, z: 20, cluster: 'D_east' }
    ],
    rooms: buildRoomsFor('D', 1, 5, {
      sideZ: [
        { side: 'left', z0: 3, z1: 17, doorZ: 17.8 },
        { side: 'right', z0: 23, z1: 37, doorZ: 22.2 }
      ],
      step: 11, x0: 76, count: 5,
      numberFn: (f, kf) => (f + 5) * 100 + kf // D 座 601.. 避免与 C 冲突（demo）
    })
  }
]

// 跨栋连接：用户确认 C/D 仅 3/4/5 层有连廊互通（1/2 层独立）。
// 引擎据此在指定楼层建连廊边；坐标为 demo 占位，平面图到后替换为真实连廊端点。
const BLOCK_LINKS = [
  { fromBlock: 'C', toBlock: 'D', floors: [3, 4, 5], w: 14 }
]

// ============ 聚合导出（保持旧页面兼容） ============
const ROOMS = BLOCKS.reduce((acc, b) => acc.concat(b.rooms), [])
const ENTRANCES = BLOCKS.reduce((acc, b) => acc.concat(b.entrances.map(e => ({ ...e, blockKey: b.key }))), [])
const STAIRS = BLOCKS.reduce((acc, b) => acc.concat(b.stairs.map(s => ({ ...s, blockKey: b.key }))), [])
const ELEVATORS = BLOCKS.reduce((acc, b) => acc.concat(b.elevators.map(e => ({ ...e, blockKey: b.key }))), [])
const FLOORS = Math.max.apply(null, BLOCKS.map(b => b.floors))

function globalFootprint() {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
  BLOCKS.forEach(b => {
    x0 = Math.min(x0, b.footprint.x0); x1 = Math.max(x1, b.footprint.x1)
    z0 = Math.min(z0, b.footprint.z0); z1 = Math.max(z1, b.footprint.z1)
  })
  return { x0, x1, z0, z1, w: x1 - x0, d: z1 - z0 }
}
const FOOTPRINT = globalFootprint()
// 兼容旧场景：取第一个 block 主走廊（多 block 3D 在给图后精修）
const CORRIDOR = BLOCKS[0].corridors[0]

function floorY(floor) {
  return (floor - 1) * FLOOR_H
}

module.exports = {
  FLOOR_H,
  FLOORS,
  FOOTPRINT,
  CORRIDOR,
  BLOCKS,
  BLOCK_LINKS,
  ELEVATORS,
  STAIRS,
  ENTRANCES,
  ROOMS,
  floorY,
  // 按教室号找（可指定楼栋）；返回数组，调用方决定唯一/多选
  findRooms(number) {
    return ROOMS.filter((r) => r.number === Number(number))
  },
  findRoom(number, blockKey) {
    const list = this.findRooms(number)
    if (blockKey) return list.find((r) => r.blockKey === blockKey) || null
    return list[0] || null
  },
  findEntrance(id) {
    return ENTRANCES.find((e) => e.id === id) || null
  },
  entranceClusters() {
    const map = {}
    ENTRANCES.forEach((e) => {
      if (!map[e.cluster]) map[e.cluster] = []
      map[e.cluster].push(e)
    })
    return map
  },
  // 楼梯/电梯按楼栋取（场景渲染用）
  vertsByBlock() {
    const out = {}
    BLOCKS.forEach(b => {
      out[b.key] = { stairs: b.stairs, elevators: b.elevators, corridors: b.corridors, floors: b.floors, atria: b.atria || [], gaps: b.corridorGaps || [] }
    })
    return out
  }
}
