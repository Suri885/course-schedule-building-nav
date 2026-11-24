global.window = {};
const fs = require('fs');
eval(fs.readFileSync('plan-data.js', 'utf8'));
const F = window.FLOOR3, LK = F.LINK;

function rectsOf(list) { return list.map(r => ({ n: r[0], x0: +r[1], z0: +r[2], x1: +r[1] + +r[3], z1: +r[2] + +r[4] })); }
function corr(list) { return list.map(c => ({ n: '走廊', x0: +c[0], z0: +c[1], x1: +c[0] + +c[2], z1: +c[1] + +c[3] })); }
const rooms = rectsOf(F.D_ROOMS).concat(rectsOf(F.C_ROOMS));
const cors = corr(F.D_CORR).concat(corr(F.C_CORR));

// 1. 连廊四边形是否穿房/穿走廊
console.log('== 连廊几何 ==');
F.LINKS.forEach((b, i) => {
  const A = LK.axis(b);
  console.log(`${b.name}: (${b.ax.toFixed(1)},${b.az.toFixed(1)}) → (${b.bx.toFixed(1)},${b.bz.toFixed(1)})`
    + ` 长 ${A.len.toFixed(1)} m  倾角 ${(Math.atan2(Math.abs(Math.sin(A.ang)), Math.abs(Math.cos(A.ang))) * 180 / Math.PI).toFixed(1)}°`
    + `  走向 ${(A.uz < 0 ? '东南' : '东北')}`);
  const q = LK.quad(b);
  const minx = Math.min(...q.map(p => p[0])), maxx = Math.max(...q.map(p => p[0]));
  const minz = Math.min(...q.map(p => p[1])), maxz = Math.max(...q.map(p => p[1]));
  let hit = [];
  rooms.forEach(r => {
    if (r.x1 < minx || r.x0 > maxx || r.z1 < minz || r.z0 > maxz) return;
    // 采样 0.2m 网格
    for (let x = Math.max(minx, r.x0); x <= Math.min(maxx, r.x1); x += 0.2)
      for (let z = Math.max(minz, r.z0); z <= Math.min(maxz, r.z1); z += 0.2)
        if (LK.hit(b, x, z)) { hit.push(r.n); return; }
  });
  console.log('   穿过的房间:', hit.length ? [...new Set(hit)].join(',') : '无');
});

// 2. 连廊两端是否落在洞口里
console.log('\n== 端点与洞口 ==');
const opens = { '连廊 A': F.C_OPEN[0], '连廊 B': F.C_OPEN[1] };
Object.keys(opens).forEach(k => {
  const o = opens[k];
  const b = F.LINKS.find(l => l.name === k);
  const okX = Math.abs(b.bx - o[0][0]) < 0.05 && Math.abs(b.bx - o[1][0]) < 0.05;
  const lo = Math.min(o[0][1], o[1][1]), hi = Math.max(o[0][1], o[1][1]);
  const okZ = b.bz > lo - 0.05 && b.bz < hi + 0.05;
  console.log(`${k}: C 座洞口 x=${o[0][0]} z=${lo.toFixed(2)}~${hi.toFixed(2)} | 端点 (${b.bx.toFixed(2)},${b.bz.toFixed(2)}) → ${okX && okZ ? 'OK' : '✗ 不在洞口'}`);
});

// 3. D 座一侧端点是否贴着外墙
console.log('\n== D 座端 ==');
F.LINKS.forEach(b => {
  let near = 1e9;
  F.D_SHELL.forEach(s => {
    const d = ptSeg(b.ax, b.az, s[0], s[1], s[2], s[3]);
    if (d < near) near = d;
  });
  console.log(`${b.name}: D 端 (${b.ax},${b.az}) 离外墙 ${near.toFixed(2)} m`);
});
function ptSeg(px, pz, x1, z1, x2, z2) {
  const dx = x2 - x1, dz = z2 - z1, L = dx * dx + dz * dz || 1;
  let t = ((px - x1) * dx + (pz - z1) * dz) / L;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + dx * t), pz - (z1 + dz * t));
}

// 4. 房间 × 走廊重叠
console.log('\n== 房间压在走廊里 ==');
let bad = 0;
rooms.forEach(r => cors.forEach(c => {
  const ox = Math.min(r.x1, c.x1) - Math.max(r.x0, c.x0);
  const oz = Math.min(r.z1, c.z1) - Math.max(r.z0, c.z0);
  if (ox > 0.05 && oz > 0.05) { console.log(`  ${r.n} × 走廊 ${ox.toFixed(2)}×${oz.toFixed(2)}`); bad++; }
}));
console.log(bad ? `  共 ${bad} 处` : '  无');
