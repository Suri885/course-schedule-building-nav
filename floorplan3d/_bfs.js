global.window = {};
const fs = require('fs');
eval(fs.readFileSync('plan-data.js', 'utf8'));
const F = window.FLOOR3, LK = F.LINK;
const D_CORR = F.D_CORR, C_CORR = F.C_CORR;

function inRect(x, z, r) { return x >= r[0] - 1e-9 && x <= r[0] + r[2] + 1e-9 && z >= r[1] - 1e-9 && z <= r[1] + r[3] + 1e-9; }
function walkable(x, z) {
  for (const b of F.LINKS) if (LK.hit(b, x, z)) return true;
  for (const c of D_CORR) if (inRect(x, z, c)) return true;
  for (const c of C_CORR) if (inRect(x, z, c)) return true;
  return false;
}
const S = 0.25, X0 = -8, X1 = 152, Z0 = -38, Z1 = 50;
const NX = Math.round((X1 - X0) / S), NZ = Math.round((Z1 - Z0) / S);
const idx = (i, j) => j * NX + i;
const seen = new Uint8Array(NX * NZ);
function key(x, z) { return [Math.round((x - X0) / S), Math.round((z - Z0) / S)]; }
const start = key(12, 34.6);
const q = [start];
seen[idx(start[0], start[1])] = 1;
let cnt = 0;
while (q.length) {
  const [i, j] = q.pop(); cnt++;
  const nb = [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]];
  for (const [a, b] of nb) {
    if (a < 0 || b < 0 || a >= NX || b >= NZ) continue;
    const k = idx(a, b);
    if (seen[k]) continue;
    if (!walkable(X0 + a * S, Z0 + b * S)) continue;
    seen[k] = 1; q.push([a, b]);
  }
}
console.log('可达格点', cnt);
const tests = {
  '西南前室(男/女卫之间)': [13.4, 9.6],
  'D-312 楼梯口外': [27.3, 12.8],
  'D阶-202 旁出口': [31.0, 8.0],
  'D阶-201 门前': [33.0, 14.0],
  'D3教师休息室门': [45.0, 21.5],
  'D-314 廊南端(连廊B口)': [53.0, 4.6],
  '连廊B中点': [(54.2 + 88.2) / 2, (5.1 - 6.9) / 2],
  '连廊A中点': [(81.5 + 127.3) / 2, (34.6 + 23.2) / 2],
  'C座 连廊A落脚/北廊': [127.0, 23.2],
  'C座 连廊B落脚': [88.5, -6.9],
  'C座 C阶-202 门': [95.0, -10.0],
  'C座 南横廊': [96.0, -22.0],
  'C座 东纵廊': [126.0, -12.0],
};
let bad = 0;
for (const [k, [x, z]] of Object.entries(tests)) {
  const [i, j] = key(x, z);
  const w = walkable(x, z);
  const r = (i >= 0 && j >= 0 && i < NX && j < NZ) ? seen[idx(i, j)] : 0;
  console.log(`${r ? 'OK  ' : '✗   '} ${k.padEnd(24)} (${x},${z}) 可走=${w} 连通=${!!r}`);
  if (!r) bad++;
}
console.log(bad ? `${bad} 处不通` : '全部连通');
