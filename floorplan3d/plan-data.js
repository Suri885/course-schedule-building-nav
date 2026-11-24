/* =============================================================================
 * 北京化工大学昌平校区第二教学楼 3 层 · C / D 座共用平面数据
 *
 * 【坐标来源】按用户提供的《C座3层疏散平面图》《D座3层疏散平面图》照片
 * （4096×3072）逐道墙量取：先把照片做透视矫正，再按 1 m ≈ 33.6 px 换算出米。
 *
 * x 向东、z 向北，单位 m；俯视图上为北。
 * 矩形房间：[名称, x, z, 宽, 深, 类型, 门所在边(S/N/W/E), 小地图简称]
 *           门所在边 = null 表示无门（电井、机房内部空间）
 * 多边形房间（斜边里的出口楼梯）：[名称, [[x,z],...], [[..]], 类型, 门边序号, 简称]
 * 空地（原图无标签、无门、走不进去的空白区）：VOIDS
 * ========================================================================== */
(function (global) {
  'use strict';

  /* C 座整体位置：往东让开 D 座、往南错开一截（实景里 C 座比 D 座更靠南），
     这样两条连廊才走得成"斜的"。改这一个数就是整栋搬，其余全部按局部坐标派生。 */
  var CX = 84, CZ = -32.8;              // C 座局部原点
  var D_BASE = 0, C_BASE = 0.9;
  var D_BOX = { x0: 0, x1: 81.5, z0: 0, z1: 42.7 };
  var C_BOX = { x0: CX, x1: CX + 52.2, z0: CZ, z1: CZ + 61.9 };

  /* ---------------------------------------------------------------------------
   * D 座 —— "锯齿台阶状"的长条，不是方正矩形：
   *   · 北边：3 部楼梯 ＋ 东端空调机房/2 部电梯向北凸出 1.4 m，形成 5 个锯齿
   *   · 南边：D阶-202、D阶-201 与东段逐级错落，东南出口楼梯再向南凸出 1.4 m
   *   · 东墙留连廊洞口，接 C 座北廊
   * 其余按原图：北排、北横廊、中排、西列、中部空地、D-312 小间、西南卫生间
   * ------------------------------------------------------------------------ */
  var D_ROOMS = [
    /* 北排 z 35.8 起。3 部楼梯与东端 2 部电梯按原图向北凸出 0.9 m，
       所以 D 座北边不是一条直线，而是带 5 个凸块的锯齿。 */
    ['D-307',    0.0, 35.8,  7.6, 5.4, 'class', 'S', 'D-307'],
    ['楼梯①',   7.6, 35.8,  3.1, 6.8, 'stair', 'S', '出口'],
    ['D-306',   10.7, 35.8, 10.4, 5.4, 'class', 'S', 'D-306'],
    ['D-305',   21.1, 35.8,  7.4, 5.4, 'class', 'S', 'D-305'],
    ['楼梯②',  28.5, 35.8,  3.1, 6.8, 'stair', 'S', '出口'],
    ['D-304',   31.6, 35.8, 11.2, 5.4, 'class', 'S', 'D-304'],
    ['D-303',   42.8, 35.8,  5.5, 5.4, 'class', 'S', 'D-303'],
    ['楼梯③',  48.3, 35.8,  3.0, 6.8, 'stair', 'S', '出口'],
    ['D-302',   51.3, 35.8, 11.2, 5.4, 'class', 'S', 'D-302'],
    ['D-301',   62.5, 35.8,  8.3, 5.4, 'class', 'S', 'D-301'],
    /* 东端：强弱电间贴走廊北墙一排（原图上就是两格小竖井），门朝南 */
    ['强电间',  70.8, 35.8,  1.7, 1.4, 'aux',   'S', '强'],
    ['弱电间',  72.5, 35.8,  1.5, 1.4, 'aux',   'S', '弱'],
    ['空调机房', 74.0, 35.8,  3.0, 6.8, 'aux',   'S', '机房'],
    /* 两部电梯并排贴北端，门朝南 → 电梯前面那片大理石空地 */
    ['电梯①',   77.0, 39.4,  2.25, 3.2, 'lift',  'S', '电梯①'],
    ['电梯②',   79.25,39.4,  2.25, 3.2, 'lift',  'S', '电梯②'],

    /* 西列 x 0~7.6，自北向南：D-308 / D-309 / D-310 / 西南出口楼梯 */
    ['D-308',     0.0, 26.4, 7.6, 7.0, 'class', 'E', 'D-308'],
    ['D-309',     0.0, 19.2, 7.6, 7.2, 'class', 'E', 'D-309'],
    ['D-310',     0.0, 11.7, 7.6, 7.5, 'class', 'E', 'D-310'],
    ['楼梯④',    0.0,  4.3, 7.6, 7.4, 'stair', 'E', '出口'],

    /* 中排：D-311 及其东侧的水房（空调机房 + 男女卫 + 中间前室）
     * 洗手间不是三间并排！按原图/实景：中间是一条进深较大的前室（小空地），
     * 女卫 / 男卫 的门开在前室的东西两侧、两门相对；前室尽端还有一间残卫（门朝北）。
     * 女卫、男卫仍然各占前后整个进深，只是被前室从中间劈开。 */
    /* 中间只有一条贯通到顶的前室，没有残卫（残卫单独在三小间那排，见 D-314 西侧） */
    ['D-311',    10.1, 26.5, 10.0, 6.9, 'class', 'N', 'D-311'],
    ['空调机房', 20.1, 26.5,  1.75, 6.9, 'aux',  'N', '机房'],
    ['女卫',     21.85,26.5,  2.35, 6.9, 'wc',   'E', '女'],
    ['男卫',     26.30,26.5,  2.20, 6.9, 'wc',   'W', '男'],

    /* 中排东段：D-313 + 卫生间组（同款前室布局）
     * D-314 西侧不是房间，是一条南北向走廊（北接北横廊、南端出安全出口通 C 座），
     * 走廊西侧并排三小间：开水间 / 残卫 / 强电间，门一律朝东开向这条走廊 ——
     * 按实景照片，它们是从走廊拐进去的，不是排着面朝教室。 */
    ['D-313',    31.7, 27.7, 11.2, 5.7, 'class', 'N', 'D-313'],
    ['女卫',     42.9, 27.7,  2.3, 5.7, 'wc',    'E', '女'],
    ['男卫',     47.5, 27.7,  2.0, 5.7, 'wc',    'W', '男'],
    ['开水间',   49.5, 31.5,  2.3, 1.9, 'aux',   'E', '开水'],
    ['残卫',     49.5, 29.6,  2.3, 1.9, 'wc',    'E', '残'],
    ['强电间',   49.5, 27.7,  2.3, 1.9, 'aux',   'E', '强'],
    ['D-314',    54.2, 27.7, 10.4, 5.7, 'class', 'N', 'D-314'],
    ['女卫',     64.6, 27.7,  2.0, 5.7, 'wc',    'E', '女'],
    ['男卫',     68.65, 27.7, 2.05, 5.7, 'wc',   'W', '男'],
    ['楼梯⑥',  70.7, 26.3,  3.3, 7.1, 'stair', 'N', '出口'],
    /* 楼梯⑥ 以东原图是一片空白（楼外/连廊侧），不再塞房间 */

    /* 中部：D-311 下方是空地；空地东南是第二个空调机房 + 弱电间 */
    ['空调机房', 20.9, 23.0,  5.1, 3.5, 'aux',   null, '机房'],
    ['弱电间',   26.0, 23.0,  2.5, 3.5, 'aux',   null, '弱'],

    /* D-312：按图是一间小教室（约 5.3 x 6.7 m），东侧紧邻出口楼梯 */
    ['D-312',    20.9, 13.3,  5.3, 6.7, 'class', 'S', 'D-312'],
    ['出口楼梯', 26.2, 13.3,  2.3, 6.7, 'stair', 'S', '出口'],

    /* 西南：男卫（西）| 前室 | 女卫（东）—— 前室从南横廊北上，两门相对，
       和其余几组完全一样的做法（原先是并排、门各朝一边，是错的） */
    ['男卫',     10.1,  7.5, 2.2, 4.2, 'wc', 'E', '男'],
    ['女卫',     14.5,  7.5, 2.1, 4.2, 'wc', 'W', '女'],

    /* 两间阶梯教室：按图斜错开约 14 m，不是上下对齐 */
    ['D阶-202',  20.2, -1.5, 14.4,  6.1, 'class', 'N', 'D阶-202'],
    ['D阶-201',  34.6,  6.0, 17.2, 14.4, 'class', 'N', 'D阶-201'],

    /* D3 教师休息室：D-313 东南、D阶-201 北侧 */
    ['D3教师休息室', 42.3, 22.2, 7.4, 5.5, 'aux', 'S', '教师休息室']
  ];

  var D_CORR = [
    [0.0, 33.4, 81.5, 2.4],    // 北横廊：贯通整栋，楼梯口不封墙
    /* 电梯厅：两部电梯正前方的一大块空地（实景里那片大理石地面），南接北横廊 */
    [77.0, 35.8, 4.5, 3.6],
    [7.6,  4.3,  2.5, 29.1],   // 西纵廊：D-308 / D-309 / D-310 门口，南端接南横廊
    [10.1, 4.6, 24.5, 2.9],    // 南横廊：沿 D阶-202 北侧，接男/女卫门口
    [16.6,  7.5, 11.9, 5.8],   // D-312 南侧、男女卫东侧这一段（原来只铺了 1.6 m 一条，
                               //   剩下 4 m 是空白 —— 于是被当成"外墙"围出一个假房间，已补满）
    [28.5,  6.0, 3.2, 27.4],   // 东纵廊：D-312 东侧楼梯上下贯通
    [31.7, 13.3,  2.9, 8.9],   // D阶-201 西廊
    [34.6, 20.4, 17.2, 1.8],   // D阶-201 北廊（东接安全出口）
    /* 四处卫生间前室（小空地）：两侧是男女卫的门，彼此相对；前室一通到底，中间没有残卫 */
    [24.20, 26.5, 2.10, 6.9],  // 中排（D-311 东侧）
    [45.20, 27.7, 2.30, 5.7],  // 中排东段（D-313 东侧）
    [66.60, 27.7, 2.05, 5.7],  // D-314 东侧（D-301 下方）
    [12.30,  7.5, 2.20, 4.2],  // 西南（D-310 东南、D阶-202 西北）
    /* D-312 出口楼梯正南、D阶-202 东北角这一块：
       楼梯那个安全出口就开在这条廊上；向东走到 D阶-201 西墙，再北上接 D阶-201 西廊。
       —— 就是"从男女卫走过来，经过 D阶-202，再进 D阶-201"那一条路，原先被填成了空地。 */
    [26.2, 7.5, 8.4, 5.8],
    /* D-314 西侧的南北走廊：北端接北横廊，一路南下到 D阶-201 东侧，
       南端（z 3.6）是安全出口，出门向东接往 C 座的第二条连廊 */
    [51.8,  3.6,  2.4, 29.8]
  ];

  /* 原图上无标签、也未画门的空白区：按"空地/上空"处理，不可走 */
  var D_VOIDS = [
    [10.1, 19.2, 10.8, 6.8],   // D-311 正下方的空地（用户指出的空位）
    [20.9, 20.0,  7.6, 3.0],   // D-312 北侧、上空地机房之间的窄条空地
    [10.1, 11.7,  6.5, 7.5],   // D-311 与空地下段的空地（原图无标签）
    [16.0, 13.3,  4.9, 5.9],   // 空地东侧、D-312 西墙外的窄块
    [34.6, 22.2,  7.7, 5.5],   // D3教师休息室西侧空地
    [74.0, 27.7,  7.5, 5.7]    // 楼梯⑥ 以东、通往 C 座口的空白（原图无墙无标签）
  ];

  /* ---------------------------------------------------------------------------
   * C 座 —— 不是方正矩形：整栋是一条"阶梯状斜边"的梯形。
   * 西侧与东北角一共 5 段 35° 斜边，斜边里各藏一部出口楼梯；
   * C阶-201 比 C阶-202 略大；核心筒含 2 部电梯（× 标记）。
   * 局部坐标 x 0..52（向东），z 0..62（向北），全部由照片墙线量得。
   * ------------------------------------------------------------------------ */
  var C_ROOMS_L = [
    ['C-301', 43.93, 38.6, 8.04, 10.74, 'class', 'W', 'C-301'],
    ['C-302', 43.93, 27.65, 8.04, 10.95, 'class', 'W', 'C-302'],
    ['C-303', 43.93, 19.49, 8.04, 8.15, 'class', 'W', 'C-303'],
    ['C3教师休息室', 46.58, 11.46, 5.38, 8.03, 'aux', 'S', '教师休息室'],
    /* 核心筒自西向东：机房(2.2) → 出口楼梯(3.7) → 电梯①②夹电梯厅(1.8) → 强弱电间 → 休息室。
     * 机房是窄长条，只有 2.24 m 宽，不再吞掉楼梯和电梯井。 */
    ['空调机房', 30.70, 11.46, 2.24, 8.72, 'aux', 'S', '机房'],
    ['出口楼梯', 32.94, 11.46, 3.66, 8.72, 'stair', 'S', '出口'],
    ['电梯①', 38.70, 16.90, 2.25, 3.28, 'lift', 'S', '电梯①'],
    ['电梯②', 38.70, 11.46, 2.25, 2.24, 'lift', 'N', '电梯②'],
    ['弱电间', 43.90, 15.60, 2.68, 2.98, 'aux', 'W', '弱电'],
    ['强电间', 43.90, 13.20, 2.68, 2.35, 'aux', 'W', '强电'],
    /* 消防强电间落在西北斜边下面，进深按斜线截短，不允许穿出外墙 */
    ['消防强电间', 39.1, 49.35, 2.45, 3.05, 'aux', 'E', '消'],
    ['C阶-201', 27.26, 25.45, 13.69, 11.73, 'class', 'W', 'C阶-201'],
    ['C阶-202', 12.08, 14.38, 11.52, 12.62, 'class', 'E', 'C阶-202'],
    ['男卫', 23.6, 37.17, 3.66, 4.0, 'wc', 'E', '男卫'],
    ['女卫', 6.4, 24.2, 2.9, 3.0, 'wc', 'W', '女卫'],
    /* 西北出口楼梯：图上此处是横线填充的规整矩形梯间，不是贴斜边的三角。
       门朝南开向西横廊 —— 西侧紧挨连廊 B 进来的那条小通道，C阶-202 就在它东南。 */
    ['出口·西斜边', 9.55, 24.2, 2.53, 5.0, 'stair', 'S', '出口'],
    ['出口·西南上', 4.76, 12.65, 4.05, 3.87, 'stair', 'N', '出口'],
    ['出口·西南下', 4.76, 2.53, 3.75, 3.57, 'stair', 'N', '出口'],
    ['女卫', 8.81, 0, 4.19, 8.54, 'wc', 'N', '女卫'],
    ['开水间', 13, 0, 3.6, 8.54, 'aux', 'N', '开水间'],
    ['男卫', 16.6, 0, 4.41, 8.54, 'wc', 'N', '男卫'],
    ['C-306', 21.01, 0, 10, 8.54, 'class', 'N', 'C-306'],
    ['C-305', 31.01, 0, 11.22, 8.54, 'class', 'N', 'C-305'],
    ['C-304', 42.23, 0, 9.73, 8.54, 'class', 'N', 'C-304'],
  ];

  var C_CORR_L = [
    /* 西纵廊：北端到西斜边楼梯门口为止，不再穿进梯间 */
    [9.3, 11.46, 2.78, 12.54],
    [12.08, 28.8, 11.52, 2.6],
    [23.6, 11.46, 3.66, 25.71],
    /* 北横廊（门厅）：北边界跟着斜边走，拆成西窄东宽两段，不越出斜墙 */
    [27.26, 37.17, 2.30, 6.80],
    [29.56, 37.17, 11.39, 8.40],
    [23.6, 20.18, 20.33, 5.27],
    /* 东纵廊：绿色疏散虚线 x=42.7，从南横廊一路贯通到北端，中间被电梯挡住是不对的 */
    [40.95, 11.46, 2.95, 37.89],
    [12.08, 11.46, 13.02, 2.92],
    [8.51, 8.54, 43.45, 2.92],
    [4.76, 6.1, 4.05, 6.55],
    [4.76, 16.52, 4.05, 1.93],
    /* 西横廊：东端延长到 x=12.08，接西北出口楼梯的南门 */
    [4.2, 18.45, 7.88, 5.75],
    /* 连廊 B 进门后的小通道：西墙就是 C 座外墙（开口接连廊），南接西横廊 */
    [4.20, 24.20, 2.20, 3.03],
    /* 电梯厅：两排电梯/管井之间横向贯通的通道，向西接出口楼梯、向东接东纵廊 —— 这里能走 */
    [36.60, 13.70, 7.30, 3.20],
    /* 强弱电间前的小廊 */
    [43.90, 11.46, 2.68, 1.74],
    /* 通往 D 座：北端被斜边收窄成一级，两段错开相接 */
    [41.55, 49.35, 3.54, 4.70],
    [43.30, 54.05, 1.79, 2.80],
  ];

  var C_POLY_L = [
    ['出口·东北角', [[43.93, 49.35], [45.09, 56.85], [51.67, 61.76], [51.97, 61.9], [51.97, 49.35]], 'stair', 0, '出口'],
    ['出口·西南角', [[0, 18.45], [0, 20.68], [3.6, 23.66], [4.2, 24.6], [4.2, 18.45]], 'stair', 3, '出口'],
  ];

  var C_OUTLINE_L = [[4.76, 0], [4.76, 18.45], [0, 18.45], [0, 20.68], [3.6, 23.66], [4.2, 24.6], [4.2, 27.23], [13.04, 33.8], [21.73, 33.95], [21.73, 36.8], [21.5, 39.73], [29.5, 45.68], [29.5, 46], [40.1, 46], [40.1, 48.8], [39.1, 48.8], [39.1, 52.54], [43.3, 55.2], [43.3, 56.85], [45.09, 56.85], [51.67, 61.76], [51.97, 61.9], [51.97, 0]];
  /* 连廊开口：两个洞口不砌墙 */
  var C_OPEN_L = [
    [[43.30, 55.20], [43.30, 56.85]],   // 连廊 A：接 C 座北廊
    [[4.20, 24.60], [4.20, 27.23]]      // 连廊 B：接 C 座西北出口楼梯前室
  ];

  var C_VOIDS_L = [
    [21.73, 33.95, 1.87, 2.85],
    [25.10, 42.11, 2.16, 3.27],
  ];

  var C_ROOMS = C_ROOMS_L.map(function (r) {
    return [r[0], r[1] + CX, r[2] + CZ, r[3], r[4], r[5], r[6], r[7]];
  });
  var C_CORR = C_CORR_L.map(function (c) {
    return [c[0] + CX, c[1] + CZ, c[2], c[3]];
  });
  var C_POLY = C_POLY_L.map(function (p) {
    return [p[0], p[1].map(function (q) { return [q[0] + CX, q[1] + CZ]; }),
            p[2], p[3], p[4]];
  });
  var C_OUTLINE = C_OUTLINE_L.map(function (q) { return [q[0] + CX, q[1] + CZ]; });
  var C_OPEN = C_OPEN_L.map(function (o) {
    return o.map(function (q) { return [q[0] + CX, q[1] + CZ]; });
  });
  var C_VOIDS_G = C_VOIDS_L.map(function (v) {
    return [v[0] + CX, v[1] + CZ, v[2], v[3]];
  });

  /* ---------------------------------------------------------------------------
   * 连廊：两条，**都是斜的**。
   * 实景上两条连廊并不是横平竖直地正对着开，而是从 D 座东南一侧斜着穿出去，
   * 落到 C 座的斜边上 —— 两栋楼的斜边互相"对着"。所以这里不用 x0/x1/z0/z1 的
   * 轴对齐矩形，改成"中线两端点 + 宽度"：
   *      a = D 座一侧出口，b = C 座一侧洞口，w = 桥面净宽
   * 高度沿中线由 D_BASE 匀坡升到 C_BASE（0.9 m / 30 m 以上，坡度 <3%，看不出来）。
   * 派生工具：linkAxis / linkQuad / linkLocal / linkHit（3D 那边复用同一套，避免两处不一致）
   * ------------------------------------------------------------------------ */
  var LINKS = [
    /* A：D 座东端（北横廊南侧外墙）→ C 座东北斜边上的出口（C 座局部 x 43.30 那个洞口） */
    { ax: 81.5, az: 34.60, bx: CX + 43.30, bz: CZ + 56.03, w: 2.60, name: '连廊 A' },
    /* B：D 座 D-314 西侧走廊南端的安全出口 → C 座西墙 C阶-202 旁（局部 x 4.20 那个洞口） */
    { ax: 54.2, az: 5.10,  bx: CX + 4.20,  bz: CZ + 25.90, w: 2.60, name: '连廊 B' }
  ];

  function linkAxis(b) {
    var dx = b.bx - b.ax, dz = b.bz - b.az;
    var L = Math.sqrt(dx * dx + dz * dz) || 1;
    return { ux: dx / L, uz: dz / L, nx: -dz / L, nz: dx / L, len: L, ang: Math.atan2(dz, dx) };
  }
  function linkQuad(b) {
    var A = linkAxis(b), h = b.w / 2;
    function p(x, z, s) { return [x + A.nx * h * s, z + A.nz * h * s]; }
    return [p(b.ax, b.az, 1), p(b.bx, b.bz, 1), p(b.bx, b.bz, -1), p(b.ax, b.az, -1)];
  }
  function linkLocal(b, x, z) {
    var A = linkAxis(b), dx = x - b.ax, dz = z - b.az;
    return { t: (dx * A.ux + dz * A.uz) / A.len, s: dx * A.nx + dz * A.nz, len: A.len };
  }
  function linkHit(b, x, z) {
    var q = linkLocal(b, x, z);
    return q.t >= -0.002 && q.t <= 1.002 && Math.abs(q.s) <= b.w / 2 + 0.02;
  }

  /* 安全出口是原图上的标识，不虚构成房间。anchor 指明标签往哪个方向铺，
     免得长长的四个字压到旁边的教室上去。 */
  var MARKS = [
    { text: '安全出口', x: 34.4,  z: 8.0,  anchor: 'W' },  // D阶-202 东北角（D-312 楼梯口也汇到这）
    { text: '安全出口', x: 52.2,  z: 20.9, anchor: 'E' },  // D阶-201 东北角、D3教师休息室东
    { text: '安全出口', x: 53.0,  z: 3.2,  anchor: 'E' },  // D-314 西走廊南端 → 连廊 B
    { text: '安全出口', x: CX + 47.0, z: CZ + 52.0 },
    { text: '安全出口', x: CX + 30.0, z: CZ + 8.0 }
  ];

  /* 外墙轮廓：由全部房间 + 走廊矩形求"暴露边"，自动避开内部相邻墙 */
  function exposedShell(rects, skip, coversOnly) {
    var out = [];
    var covers = coversOnly || [];
    function near(a, b) { return Math.abs(a - b) < 0.001; }
    function subtract(a, b, cuts) {
      var parts = [[a, b]];
      cuts.forEach(function (c) {
        var next = [];
        parts.forEach(function (p) {
          if (c[1] <= p[0] || c[0] >= p[1]) { next.push(p); return; }
          if (c[0] > p[0]) next.push([p[0], Math.min(c[0], p[1])]);
          if (c[1] < p[1]) next.push([Math.max(c[1], p[0]), p[1]]);
        });
        parts = next;
      });
      return parts;
    }
    rects.forEach(function (r) {
      var x = r[0], z = r[1], w = r[2], d = r[3];
      [
        { axis: 'h', fixed: z, a: x, b: x + w },
        { axis: 'h', fixed: z + d, a: x, b: x + w },
        { axis: 'v', fixed: x, a: z, b: z + d },
        { axis: 'v', fixed: x + w, a: z, b: z + d }
      ].forEach(function (e) {
        var cuts = [];
        rects.concat(covers).forEach(function (s) {
          if (s === r) return;
          var sx = s[0], sz = s[1], sw = s[2], sd = s[3];
          if (e.axis === 'h' && (near(sz, e.fixed) || near(sz + sd, e.fixed))) {
            var a = Math.max(e.a, sx), b = Math.min(e.b, sx + sw);
            if (b - a > 0.001) cuts.push([a, b]);
          }
          if (e.axis === 'v' && (near(sx, e.fixed) || near(sx + sw, e.fixed))) {
            var c = Math.max(e.a, sz), d2 = Math.min(e.b, sz + sd);
            if (d2 - c > 0.001) cuts.push([c, d2]);
          }
        });
        subtract(e.a, e.b, cuts).forEach(function (p) {
          if (p[1] - p[0] < 0.08) return;
          var seg = e.axis === 'h' ? [p[0], e.fixed, p[1], e.fixed] : [e.fixed, p[0], e.fixed, p[1]];
          if (!skip || !skip(seg)) out.push(seg);
        });
      });
    });
    return out;
  }

  var D_ALL = D_ROOMS.map(function (r) { return [r[1], r[2], r[3], r[4]]; }).concat(D_CORR);
  var C_ALL = C_ROOMS.map(function (r) { return [r[1], r[2], r[3], r[4]]; }).concat(C_CORR);

  function segEq(s, a) {
    var f = function (v) { return Math.abs(v) < 1e-6 ? 0 : v; };
    var s1 = [f(s[0]), f(s[1]), f(s[2]), f(s[3])];
    return (Math.abs(s1[0] - a[0]) < 0.02 && Math.abs(s1[1] - a[1]) < 0.02 &&
            Math.abs(s1[2] - a[2]) < 0.02 && Math.abs(s1[3] - a[3]) < 0.02);
  }

  var D_SHELL = exposedShell(D_ALL, function (s) {
    // 东墙连廊 A 口：z 33.4~35.8 处断开
    return Math.abs(s[0] - 81.5) < 0.001 && Math.abs(s[2] - 81.5) < 0.001 &&
           s[1] >= 33.39 && s[3] <= 35.81;
  }, D_VOIDS);

  /* 连廊 B 在 D 座东墙（x=54.2）上的洞口：把跨过 z 3.8~6.43 的那一段墙切开成两段 */
  D_SHELL = (function (arr) {
    var out = [];
    arr.forEach(function (s) {
      var vert = Math.abs(s[0] - 54.2) < 0.001 && Math.abs(s[2] - 54.2) < 0.001;
      if (!vert) { out.push(s); return; }
      var a = Math.min(s[1], s[3]), b = Math.max(s[1], s[3]);
      if (b <= 3.79 || a >= 6.44) { out.push(s); return; }
      if (a < 3.80) out.push([54.2, a, 54.2, 3.80]);
      if (b > 6.43) out.push([54.2, 6.43, 54.2, b]);
    });
    return out;
  })(D_SHELL);

  /* C 座外墙：直接按量得的外轮廓逐段生成（斜边原样保留，不套矩形） */
  var C_SHELL = [];
  (function () {
    var P = C_OUTLINE;
    for (var i = 0; i < P.length; i++) {
      var a = P[i], b = P[(i + 1) % P.length];
      var vert = Math.abs(a[0] - b[0]) < 0.01;
      var open = false;
      if (vert) {
        for (var k = 0; k < C_OPEN.length; k++) {
          var o = C_OPEN[k];
          if (Math.abs(a[0] - o[0][0]) < 0.01 &&
              Math.min(a[1], b[1]) <= o[0][1] + 0.01 &&
              Math.max(a[1], b[1]) >= o[1][1] - 0.01) { open = true; break; }
        }
      }
      if (open) continue;            // 连廊接口：不砌墙
      C_SHELL.push([a[0], a[1], b[0], b[1]]);
    }
  })();

  function render(ctx, W, H, opt) {
    opt = opt || {};
    var B = opt.world || { x0: -7, x1: 150, z0: -37, z1: 48 };
    var pad = opt.pad == null ? 14 : opt.pad;
    var SC = Math.min((W - pad * 2) / (B.x1 - B.x0), (H - pad * 2) / (B.z1 - B.z0));
    var OX = (W - (B.x1 - B.x0) * SC) / 2;
    var OY = (H - (B.z1 - B.z0) * SC) / 2;
    function px(x) { return OX + (x - B.x0) * SC; }
    function pz(z) { return OY + (B.z1 - z) * SC; }
    function R(x, z, w, d) { return { X: px(x), Y: pz(z + d), W: w * SC, H: d * SC }; }

    ctx.save();
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);

    /* 空地：浅斜线底纹（＝原图上没有门、走不进去的空白区） */
    var voids = D_VOIDS.concat(C_VOIDS_G);
    voids.forEach(function (v) {
      var g = R(v[0], v[1], v[2], v[3]);
      ctx.save();
      ctx.beginPath(); ctx.rect(g.X, g.Y, g.W, g.H); ctx.clip();
      ctx.fillStyle = '#f6f7f9'; ctx.fillRect(g.X, g.Y, g.W, g.H);
      ctx.strokeStyle = '#e2e6eb'; ctx.lineWidth = Math.max(1, SC * 0.10);
      var step = Math.max(6, SC * 1.0);
      for (var t = -g.H; t < g.W + g.H; t += step) {
        ctx.beginPath(); ctx.moveTo(g.X + t, g.Y + g.H); ctx.lineTo(g.X + t + g.H, g.Y); ctx.stroke();
      }
      ctx.restore();
      ctx.strokeStyle = '#c9d0d8'; ctx.lineWidth = Math.max(1, SC * 0.12);
      ctx.strokeRect(g.X, g.Y, g.W, g.H);
    });

    /* 走廊 */
    ctx.fillStyle = '#cfdcea';
    D_CORR.concat(C_CORR).forEach(function (c) {
      var r = R(c[0], c[1], c[2], c[3]); ctx.fillRect(r.X, r.Y, r.W, r.H);
    });
    /* 连廊：斜的四边形（中线 + 宽度） */
    function quadPath(q) {
      ctx.beginPath();
      ctx.moveTo(px(q[0][0]), pz(q[0][1]));
      for (var i = 1; i < 4; i++) ctx.lineTo(px(q[i][0]), pz(q[i][1]));
      ctx.closePath();
    }
    ctx.fillStyle = '#c6dcf1';
    LINKS.forEach(function (b) { quadPath(linkQuad(b)); ctx.fill(); });
    ctx.save();
    ctx.setLineDash([Math.max(6, SC * 0.8), Math.max(4, SC * 0.5)]);
    ctx.strokeStyle = '#2f6394'; ctx.lineWidth = Math.max(2, SC * 0.28);
    LINKS.forEach(function (b) { quadPath(linkQuad(b)); ctx.stroke(); });
    ctx.restore();

    var FILL = { class: '#ffffff', wc: '#eef4f9', stair: '#f0f2f4', lift: '#f0f2f4', aux: '#fbf8f2', exit: '#eef6f0' };
    var rooms = D_ROOMS.concat(C_ROOMS);

    /* 多边形房间（斜边里的出口楼梯） */
    function polyPath(pts) {
      ctx.beginPath();
      pts.forEach(function (q, i) {
        var X = px(q[0]), Y = pz(q[1]);
        if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
      });
      ctx.closePath();
    }
    C_POLY.forEach(function (p) {
      var pts = p[1];
      polyPath(pts);
      ctx.fillStyle = FILL[p[2]] || '#f0f2f4'; ctx.fill();
      ctx.strokeStyle = '#98a2ac'; ctx.lineWidth = Math.max(1, SC * 0.14); ctx.stroke();
      /* 楼梯踏步 */
      ctx.save(); polyPath(pts); ctx.clip();
      var minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
      pts.forEach(function (q) {
        minX = Math.min(minX, q[0]); maxX = Math.max(maxX, q[0]);
        minZ = Math.min(minZ, q[1]); maxZ = Math.max(maxZ, q[1]);
      });
      ctx.strokeStyle = '#b8c0c8'; ctx.lineWidth = Math.max(0.8, SC * 0.08);
      for (var i = 1; i < 6; i++) {
        var zz = minZ + (maxZ - minZ) * i / 6;
        ctx.beginPath(); ctx.moveTo(px(minX), pz(zz)); ctx.lineTo(px(maxX), pz(zz)); ctx.stroke();
      }
      ctx.restore();
    });

    ctx.lineWidth = Math.max(1, SC * 0.14);
    rooms.forEach(function (r) {
      var g = R(r[1], r[2], r[3], r[4]);
      ctx.fillStyle = FILL[r[5]] || '#ffffff'; ctx.fillRect(g.X, g.Y, g.W, g.H);
      ctx.strokeStyle = '#98a2ac'; ctx.strokeRect(g.X, g.Y, g.W, g.H);
      if (r[5] === 'stair') {
        ctx.save(); ctx.strokeStyle = '#b8c0c8'; ctx.lineWidth = Math.max(0.8, SC * 0.08);
        for (var i = 1; i < 6; i++) {
          var yy = g.Y + g.H * i / 6;
          ctx.beginPath(); ctx.moveTo(g.X + 1, yy); ctx.lineTo(g.X + g.W - 1, yy); ctx.stroke();
        }
        ctx.restore();
      }
      if (r[5] === 'lift') {
        ctx.save(); ctx.strokeStyle = '#cdd7e1'; ctx.lineWidth = Math.max(1, SC * 0.09);
        ctx.beginPath();
        ctx.moveTo(g.X + 2, g.Y + 2); ctx.lineTo(g.X + g.W - 2, g.Y + g.H - 2);
        ctx.moveTo(g.X + g.W - 2, g.Y + 2); ctx.lineTo(g.X + 2, g.Y + g.H);
        ctx.stroke(); ctx.restore();
      }
    });

    /* 粗黑外墙（连廊接口处断开；斜边一并画出） */
    ctx.strokeStyle = '#1b2026'; ctx.lineWidth = Math.max(2.5, SC * 0.40); ctx.lineCap = 'butt';
    D_SHELL.concat(C_SHELL).forEach(function (s) {
      ctx.beginPath(); ctx.moveTo(px(s[0]), pz(s[1])); ctx.lineTo(px(s[2]), pz(s[3])); ctx.stroke();
    });

    /* 门：楼梯不画门扇（楼梯口直接通走廊），其余画门扇 */
    rooms.forEach(function (r) {
      var edge = r[6]; if (!edge) return;
      var g = R(r[1], r[2], r[3], r[4]);
      var dw = Math.min(1.2, Math.min(r[3], r[4]) * 0.55) * SC;
      if (dw < 3) return;
      var cx = g.X + g.W / 2, cy = g.Y + g.H / 2;
      var x1, y1, x2, y2, dx = 0, dy = 0;
      if (edge === 'S') { x1 = cx - dw / 2; y1 = g.Y + g.H; x2 = cx + dw / 2; y2 = g.Y + g.H; dy = -1; }
      else if (edge === 'N') { x1 = cx - dw / 2; y1 = g.Y; x2 = cx + dw / 2; y2 = g.Y; dy = 1; }
      else if (edge === 'W') { x1 = g.X; y1 = cy - dw / 2; x2 = g.X; y2 = cy + dw / 2; dx = 1; }
      else { x1 = g.X + g.W; y1 = cy - dw / 2; x2 = g.X + g.W; y2 = cy + dw / 2; dx = -1; }
      var open = (r[5] === 'stair');
      ctx.save();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(2, SC * (open ? 0.9 : 0.34));
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      if (!open) {
        ctx.strokeStyle = '#7d8791'; ctx.lineWidth = Math.max(1, SC * 0.12);
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 + dx * dw * 0.85, y1 + dy * dw * 0.85); ctx.stroke();
      }
      ctx.restore();
    });

    function font(fs, bold) { ctx.font = (bold ? 'bold ' : '') + fs + 'px "Microsoft YaHei","PingFang SC",sans-serif'; }
    function fit(txt, avail, maxFs, minFs, bold) {
      var fs = maxFs;
      for (;;) { font(fs, bold); if (fs <= minFs || ctx.measureText(txt).width <= avail) break; fs -= 1; }
      return fs;
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

    /* 多边形楼梯的标签 */
    C_POLY.forEach(function (p) {
      var pts = p[1];
      var cx2 = 0, cz2 = 0;
      pts.forEach(function (q) { cx2 += q[0]; cz2 += q[1]; });
      cx2 /= pts.length; cz2 /= pts.length;
      var wpx = 0;
      pts.forEach(function (q) { wpx = Math.max(wpx, Math.abs(q[0] - cx2)); });
      font(Math.max(7, Math.min(16, Math.floor(wpx * SC * 0.9))), true);
      if (ctx.measureText(p[4]).width < wpx * SC * 1.6) ctx.fillText(p[4], px(cx2), pz(cz2));
    });

    /* 房间标签：先保证"看得清"，再考虑"写全称"。
       ① 阶梯教室固定两行（D阶 / 201）；
       ② 窄而高的房间（卫生间、机房、电井）逐字竖排 —— 比整行转 90° 好认；
       ③ 一行装得下就用全名；④ 装不下拆两行；⑤ 还不行退到简称/首字。
       字号下限 9 px，不再为了塞进小房间把字压成一条细线。 */
    function textW(t, fs, bold) { font(fs, bold !== false); return ctx.measureText(t).width; }
    function sizeToFit(t, maxFs, avail, bold) {
      var fs = maxFs;
      while (fs > 9 && textW(t, fs, bold) > avail) fs--;
      return (textW(t, 9, bold) <= avail) ? fs : 0;
    }
    rooms.forEach(function (r) {
      var g = R(r[1], r[2], r[3], r[4]);
      if (g.W < 7 || g.H < 7) return;
      var isCls = r[5] === 'class';
      var full = (isCls || opt.fullLabels) ? r[0] : (r[7] || r[0]);
      var color = isCls ? (r[0].charAt(0) === 'C' ? '#1f4d78' : '#23292f') : '#4a5560';
      var cx2 = g.X + g.W / 2, cy2 = g.Y + g.H / 2;
      var availW = g.W - 6, availH = g.H - 6;
      ctx.fillStyle = color;

      /* 电梯井只有 2 m 宽，塞字只会糊；图上已经有对角 × 标记，标签略过 */
      if (r[5] === 'lift') return;

      var m = /^([CD])阶-(\d+)$/.exec(full);
      if (m && g.H > 22) {
        var f2 = Math.max(11, Math.min(30, Math.floor(Math.min(availH * 0.26, availW * 0.42))));
        font(f2, true);
        ctx.fillText(m[1] + '阶', cx2, cy2 - f2 * 0.6);
        ctx.fillText(m[2], cx2, cy2 + f2 * 0.6);
        return;
      }

      if (g.W < g.H * 0.62 && full.length >= 2) {
        var vs = Math.min(24, Math.floor(availW / 1.02), Math.floor(availH / (full.length + 0.35)));
        if (vs >= 9) {
          font(vs, isCls);
          var step = vs * 1.04, y0 = cy2 - (full.length - 1) * step / 2;
          for (var q = 0; q < full.length; q++) ctx.fillText(full.charAt(q), cx2, y0 + q * step);
          return;
        }
      }

      var fs1 = sizeToFit(full, Math.min(30, Math.floor(availH * 0.66)), availW, isCls);
      if (fs1) { font(fs1, isCls); ctx.fillText(full, cx2, cy2); return; }

      if (full.length >= 4) {
        var half = Math.ceil(full.length / 2);
        var l1 = full.slice(0, half), l2 = full.slice(half);
        var fs2 = Math.min(24, Math.floor(availH / 2.4));
        while (fs2 > 9 && Math.max(textW(l1, fs2, isCls), textW(l2, fs2, isCls)) > availW) fs2--;
        if (fs2 >= 9 && Math.max(textW(l1, 9, isCls), textW(l2, 9, isCls)) <= availW) {
          font(fs2, isCls);
          ctx.fillText(l1, cx2, cy2 - fs2 * 0.6);
          ctx.fillText(l2, cx2, cy2 + fs2 * 0.6);
          return;
        }
      }

      var short = (r[7] && r[7] !== full) ? r[7] : full.charAt(0);
      var fs3 = sizeToFit(short, Math.min(30, Math.floor(availH * 0.66)), availW, isCls);
      if (fs3) { font(fs3, isCls); ctx.fillText(short, cx2, cy2); }
    });

    var lf = Math.max(12, Math.round(SC * 1.75));
    font(lf, true); ctx.lineWidth = Math.max(3, lf * 0.28); ctx.strokeStyle = '#ffffff';
    function tag(txt, x, z, color) { ctx.strokeText(txt, px(x), pz(z)); ctx.fillStyle = color; ctx.fillText(txt, px(x), pz(z)); }
    tag('D 座 3F', 2, 44.2, '#23292f');
    tag('C 座 3F', CX + 46, CZ + 60.5, '#1f4d78');
    font(Math.max(11, Math.round(lf * 0.78)), true);
    tag('连廊 A（斜）· D 座东端 → C 座东北斜边', 84.0, 37.2, '#2f6394');
    tag('← 通往 D 座', CX + 41.0, CZ + 58.6, '#2f6394');
    tag('连廊 B（斜）· D-314 旁安全出口 → C阶-202', 60.0, 7.4, '#2f6394');
    font(Math.max(10, Math.round(lf * 0.68)), true);
    MARKS.forEach(function (m) {
      ctx.textAlign = m.anchor === 'E' ? 'left' : (m.anchor === 'W' ? 'right' : 'center');
      tag(m.text, m.x, m.z, '#0f7a3d');
      ctx.textAlign = 'center';
    });
    if (opt.fullLabels) {
      D_VOIDS.concat(C_VOIDS_G).forEach(function (v) {
        if (v[2] * SC < 26 || v[3] * SC < 14) return;
        ctx.fillStyle = '#98a2ac';
        font(Math.max(9, Math.min(15, Math.floor(v[3] * SC * 0.5))), false);
        ctx.fillText('空地', px(v[0] + v[2] / 2), pz(v[1] + v[3] / 2));
      });
    }

    var nx = W - Math.max(26, lf * 2.2), ny = Math.max(26, lf * 2.2), nr = Math.max(11, lf * 0.95);
    ctx.save(); ctx.strokeStyle = '#39424c'; ctx.lineWidth = Math.max(1.4, SC * 0.13);
    ctx.beginPath(); ctx.arc(nx, ny, nr, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#39424c'; ctx.beginPath(); ctx.moveTo(nx, ny - nr * 0.92);
    ctx.lineTo(nx - nr * 0.34, ny + nr * 0.42); ctx.lineTo(nx + nr * 0.34, ny + nr * 0.42); ctx.closePath(); ctx.fill();
    font(Math.max(9, Math.round(nr * 0.72)), true); ctx.fillText('N', nx, ny + nr * 0.05); ctx.restore();

    if (opt.player) {
      var p = opt.player, ax = px(p.x), ay = pz(p.z);
      /* p.yaw 与三维一致：0 = 朝北；画布 y 轴朝南，所以前向在画布上是 (-sin, -cos) */
      var ang = Math.atan2(-Math.cos(p.yaw), -Math.sin(p.yaw));
      ctx.save(); ctx.beginPath(); ctx.moveTo(ax, ay); ctx.arc(ax, ay, Math.max(20, SC * 6), ang - 0.5, ang + 0.5);
      ctx.closePath(); ctx.fillStyle = 'rgba(214,74,74,.20)'; ctx.fill();
      ctx.beginPath(); ctx.moveTo(ax + Math.cos(ang) * Math.max(9, SC * 2.6), ay + Math.sin(ang) * Math.max(9, SC * 2.6));
      ctx.lineTo(ax + Math.cos(ang + 2.45) * Math.max(5, SC * 1.3), ay + Math.sin(ang + 2.45) * Math.max(5, SC * 1.3));
      ctx.lineTo(ax + Math.cos(ang - 2.45) * Math.max(5, SC * 1.3), ay + Math.sin(ang - 2.45) * Math.max(5, SC * 1.3));
      ctx.closePath(); ctx.fillStyle = '#d64a4a'; ctx.fill();
      ctx.beginPath(); ctx.arc(ax, ay, Math.max(3, SC * 0.85), 0, Math.PI * 2); ctx.fillStyle = '#d64a4a'; ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1.2, SC * 0.28); ctx.stroke(); ctx.restore();
    }
    ctx.restore();
    /* 返回画布坐标换算，供页面做「放大后居中到玩家」 */
    return { SC: SC, OX: OX, OY: OY, px: px, pz: pz };
  }

  global.FLOOR3 = {
    CX: CX, CZ: CZ, D_BASE: D_BASE, C_BASE: C_BASE, D_BOX: D_BOX, C_BOX: C_BOX,
    D_ROOMS: D_ROOMS, C_ROOMS: C_ROOMS, D_CORR: D_CORR, C_CORR: C_CORR,
    D_VOIDS: D_VOIDS, C_VOIDS: C_VOIDS_G,
    C_POLY: C_POLY, C_OUTLINE: C_OUTLINE, C_OPEN: C_OPEN,
    D_SHELL: D_SHELL, C_SHELL: C_SHELL, MARKS: MARKS,
    LINKS: LINKS, render: render,
    LINK: { axis: linkAxis, quad: linkQuad, local: linkLocal, hit: linkHit }
  };
})(window);
