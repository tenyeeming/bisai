// 前臂內關公式測試（2026-10-01 新增）
//   node tests/forearm.js
//
// js/forearm-vision.js 是 App locate/ForearmMath.kt 的逐式移植。
// 這裡的每一項都照抄 App 的 ForearmMathTest.kt（同一組輸入、同一個期望值），
// 兩邊都綠＝網頁與 App 算出同一個內關點、同一套閘門行為。
const fs = require('fs'), vm = require('vm'), path = require('path');
const DIR = path.join(__dirname, '..').replace(/\\/g, '/') + '/';

let fail = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

const noop = () => {};
const sandbox = {
  console, Math, Number, JSON, Object, Array, Promise, setTimeout,
  window: { addEventListener: noop }, document: { addEventListener: noop, getElementById: () => null },
  performance: { now: () => 0 },
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
const src = fs.readFileSync(DIR + 'js/forearm-vision.js', 'utf8');
// const／class 是語彙範圍，不會掛到 sandbox 上 → 在同一段程式尾巴把要測的東西交出來
const api = vm.runInContext(src + `
;({ faAxis, faNeiguan, faLocate, FA_POINTS, faPickTarget, faTwistWorldDeg, faMeasureCuts, faRadiusCun,
    FaCalib, FaTwistGate, FaPressTracker, FA_R_DEFAULT, FA_A, FA_B, FA_C,
    faPalmAxis, faMaskDir, faPalmNormal, faNormalDev, faParallelCue, faHyst, faPalmRulerSample,
    FaPalmRulerCalib, FaOneEuro })`, sandbox, { filename: 'forearm-vision.js' });

ok(api.FA_A === 0.306 && api.FA_B === 0.085 && api.FA_C === -0.532 && api.FA_R_DEFAULT === 1.676,
   '常數同 App ForearmMath.kt（A 0.306、B 0.085、C −0.532、r 預設 1.676）');

const W = 480, H = 360;
function hand(px) {
  const pts = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  for (const [i, [x, y]] of Object.entries(px)) pts[i] = { x: x / W, y: y / H, z: 0 };
  return pts;
}
// 前臂水平：lm0 (100,100) → 肘 (460,100)，長 360px ⇒ 1 寸 30px；lm9 在 +y 那側
const flat = hand({ 0: [100, 100], 9: [60, 130], 5: [70, 140], 17: [70, 80] });
const axis = api.faAxis(flat, 460, 100, W, H);

ok(near(axis.cun, 30, 1e-4) && near(axis.ax, 1, 1e-9) && near(axis.ny, 1, 1e-9), '軸：寸 30px、法向指向 lm9');
{
  const p = api.faNeiguan(axis, api.FA_R_DEFAULT, 0);
  ok(near(p.x, 100 + 2.306 * 30, 1e-3) && near(p.y, 100 + 0.085 * 30, 1e-3), '沒扭：沿軸 2+A 寸、橫向 B 寸');
}
{
  const p = api.faNeiguan(axis, 1.676, 30);
  ok(near(p.y, 100 + (0.085 - 0.532 * 1.676 * 0.5) * 30, 1e-3), '扭 30 度：橫向加 C·r·sin30');
}
ok(api.faAxis(flat, 110, 100, W, H) === null, '手肘太近回 null');

// 2026-10-27 間使／郄門／外關（用戶 10-23 定寸數；App 還沒有，這幾項沒有 App 對照）
{
  const P = api.FA_POINTS;
  const j = api.faLocate(axis, P['間使穴'], 1.676, 0), x = api.faLocate(axis, P['郄門穴'], 1.676, 0);
  ok(near(j.x, 100 + 3.306 * 30, 1e-3) && near(x.x, 100 + 5.306 * 30, 1e-3) && near(j.y, 100 + 0.085 * 30, 1e-3),
     '間使／郄門：內關公式換 n＝3／5（沿軸 n+A、橫向 B）');
  const w = api.faLocate(axis, P['外關穴'], 1.676, 30);
  ok(near(w.x, 160, 1e-6) && near(w.y, 100, 1e-6) && P['外關穴'].dorsal && !P['內關穴'].dorsal,
     '外關：手背、純 2 寸，不加 A／B／扭轉');
  const n = api.faNeiguan(axis, 1.676, 30), m = api.faLocate(axis, P['內關穴'], 1.676, 30);
  ok(n.x === m.x && n.y === m.y, '內關走 faLocate 結果不變');
}

// 遮罩 → inside()（同 faReadMask 的取樣：四捨五入到遮罩格、出界回 null）
function insideOf(mask, mw, mh) {
  return (x, y) => {
    const mx = Math.round(x * mw / W), my = Math.round(y * mh / H);
    if (mx < 0 || my < 0 || mx >= mw || my >= mh) return null;
    return mask[my * mw + mx] > 0.5;
  };
}
{
  const mask = Float32Array.from({ length: W * H }, (_, i) => (Math.floor(i / W) >= 60 && Math.floor(i / W) <= 139) ? 1 : 0);
  const cuts = api.faMeasureCuts(insideOf(mask, W, H), axis);
  ok(cuts.length === 4 && near(api.faRadiusCun(cuts), 80 / 30 / 2, 1e-6), '覆蓋邊界：80px 寬的手臂帶量出 r＝80÷30÷2 寸（4 刀）');
}
{
  const mw = W / 2, mh = H / 2;
  const mask = Float32Array.from({ length: mw * mh }, (_, i) => (Math.floor(i / mw) >= 30 && Math.floor(i / mw) <= 69) ? 1 : 0);
  ok(near(api.faRadiusCun(api.faMeasureCuts(insideOf(mask, mw, mh), axis)), 80 / 30 / 2, 0.05), '覆蓋邊界：遮罩縮一半解析度也一樣');
}
ok(api.faMeasureCuts(insideOf(new Float32Array(W * H), W, H), axis).length === 0
   && api.faMeasureCuts(insideOf(new Float32Array(W * H).fill(1), W, H), axis).length === 0
   && api.faRadiusCun([]) === null, '覆蓋邊界：刀心不在遮罩或整片都是人（截斷）就沒有刀');

{
  let good = true;
  for (const deg of [0, 20, 45]) {
    const r = deg * Math.PI / 180;
    const w = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
    w[5] = { x: 0.1, y: 0, z: 0 };
    w[17] = { x: 0, y: 0.1 * Math.cos(r), z: 0.1 * Math.sin(r) };
    if (!near(Math.abs(api.faTwistWorldDeg(w, axis)), deg, 1e-3)) good = false;
  }
  ok(good, '扭轉角：手掌繞前臂軸轉幾度就量到幾度（0／20／45）');
}
{
  const c = new api.FaCalib();
  c.update('dorsal', 0, 1, 0);
  const a = c.issue === 'dorsal';
  for (let t = 0; t <= 2000; t += 250) c.update(null, 0.02, 1, 1000 + t);
  const m = new api.FaCalib();
  m.update(null, 0, 1, 0);
  m.update(null, 0.3, 1, 100);
  ok(a && c.result && near(c.result.tb0, 0.02, 1e-9) && m.issue === 'moving' && !m.result,
     '檢測：穩 2 秒收滿、手動就重收、不合格講原因');
}
{
  const g = new api.FaTwistGate(0, 1);
  const feed = (tb, deg) => { let r = false; for (let i = 0; i < 5; i++) r = g.update(tb, Math.cos(deg * Math.PI / 180)); return r; };
  ok(feed(0.05, 40) === true, '扭轉閘門：掌寬比掉了但 ΔTb 沒動＝雜訊，放行');
  ok(feed(0.30, 40) === false && g.latched === 1, '扭轉閘門：鎖方向後 40° 擋');
  ok(feed(0.30, 25) === false, '扭轉閘門：25° 還在遲滯區');
  ok(feed(0.30, 20) === true, '扭轉閘門：20° 放行');
}
{
  const t = new api.FaPressTracker();
  ok(!t.update(0.8, 0) && t.update(0.6, 100) && t.update(0.9, 200) && t.update(null, 500)
     && !t.update(null, 700) && t.update(0.5, 800) && !t.update(1.1, 900),
     '按壓判定：0.7 寸進、1 寸出、看不到手寬限 400ms');
}
{
  const pose = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 1 }));
  pose[15] = { x: 0.2, y: 0.3, visibility: 1 };
  pose[16] = { x: 0.8, y: 0.3, visibility: 1 };
  const a = Array.from({ length: 21 }, () => ({ x: 0.21, y: 0.31 }));
  const b = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 }));
  const p1 = api.faPickTarget(pose, [a, b], null), p2 = api.faPickTarget(pose, [a, b], 14);
  ok(p1.hand === 0 && p1.elbow === 13 && p2.hand === 1 && p2.elbow === 14 && api.faPickTarget(pose, [], null) === null,
     '兩隻手：挑手腕貼著 Pose 腕的那隻，鎖定後只看那一側');
}

// ── 2026-10-31 手掌尺（郄門）：照 測試/前臂手掌尺即時_20261029/前臂手掌尺_即時.py 第 4 版；App 沒有，沒有 App 對照 ──
{
  // 手掌 lm0 (100,100) → lm9 (60,100)：手方向朝 +x，長 40px
  const h = hand({ 0: [100, 100], 9: [60, 100], 5: [70, 110], 17: [70, 90] });
  const c = { k: 9, delta: 0, r: 1.676, palm: 40, L: 360, n0: { x: 0, y: 0, z: 1 } };
  const a = api.faPalmAxis(h, W, H, c);
  ok(near(a.cun, 30, 1e-9) && near(a.ax, 1, 1e-9) && near(a.ay, 0, 1e-9) && near(a.palm, 40, 1e-9),
     '手掌尺軸：寸＝k×手掌長÷12（9×40÷12＝30px）、方向＝lm9→lm0');
  const p = api.faLocate(a, api.FA_POINTS['郄門穴'], c.r, 0);
  ok(near(p.x, 100 + 5.306 * 30, 1e-6) && api.FA_POINTS['郄門穴'].ruler === 'palm' && !api.FA_POINTS['內關穴'].ruler,
     '郄門走手掌尺（ruler: palm），公式照舊 n＝5；其他三穴不變');
  const a2 = api.faPalmAxis(h, W, H, { ...c, delta: 90 });
  ok(near(a2.ax, 0, 1e-9) && near(Math.abs(a2.ay), 1, 1e-9), 'δ 會把手方向轉成前臂軸');
  const h2 = hand({ 0: [100, 100], 9: [20, 100], 5: [30, 110], 17: [30, 90] });
  ok(near(api.faPalmAxis(h2, W, H, c).cun, 60, 1e-9), '手靠近鏡頭（手掌變 2 倍）→ 寸跟著變 2 倍');
}
{
  const cuts = [{ x1: 220, y1: 80, x2: 220, y2: 130 }, { x1: 250, y1: 82, x2: 250, y2: 132 }, { x1: 280, y1: 84, x2: 280, y2: 134 }];
  const d = api.faMaskDir(cuts, { x: 1, y: 0 }), d2 = api.faMaskDir(cuts, { x: -1, y: 0 });
  ok(near(Math.atan2(d.y, d.x) * 180 / Math.PI, Math.atan2(2, 30) * 180 / Math.PI, 1e-6) && d2.x < 0 && api.faMaskDir(cuts.slice(0, 1), { x: 1, y: 0 }) === null,
     '遮罩中線：各刀中點擬合直線、朝肘那側；不到 2 刀回 null');
}
{
  const world = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  world[5] = { x: 1, y: 0, z: 0 }; world[17] = { x: 0, y: 1, z: 0 };
  const n = api.faPalmNormal(world);
  ok(near(n.z, 1, 1e-9) && near(api.faNormalDev(n, { x: Math.sin(Math.PI / 6), y: 0, z: Math.cos(Math.PI / 6) }), 30, 1e-6),
     '手掌法向朝鏡頭；跟校準法向的夾角');
}
{
  const c = { palm: 40, L: 360 };
  ok(near(api.faParallelCue(40, 360, c), 1, 1e-12) && near(api.faParallelCue(46, 360, c), 1.15, 1e-12) && near(api.faParallelCue(44, 396, c), 1, 1e-12),
     '前臂平行線索：手和前臂一起變大＝1（整條手臂靠近），只有手變大＝不平行');
  let b = false; const seq = [0.10, 0.16, 0.12, 0.09].map(v => (b = api.faHyst(b, v, 0.15, 0.10)));
  ok(seq.join() === 'false,true,true,false', '平行關卡遲滯：超過 15% 擋、回到 10% 內才放');
}
{
  const cal = new api.FaPalmRulerCalib();
  const n = { x: 0, y: 0, z: 1 };
  for (let i = 0; i < 8; i++) cal.add({ palm: 40, L: 360, r: 1.5, n, dMask: 2, dPose: 5 });
  const r = cal.result();
  ok(near(r.k, 9, 1e-12) && r.r === 1.5 && r.delta === 2 && r.deltaSrc === 'mask', '檢測結果：k＝前臂÷手掌、δ 優先用遮罩');
  const cal2 = new api.FaPalmRulerCalib();
  for (let i = 0; i < 8; i++) cal2.add({ palm: 40, L: 360, r: null, n, dMask: null, dPose: 5 });
  const r2 = cal2.result();
  ok(r2.delta === 5 && r2.deltaSrc === 'pose' && r2.r === api.FA_R_DEFAULT, '遮罩量不到 → δ 用 Pose 軸、r 用預設');
  const cal3 = new api.FaPalmRulerCalib();
  for (let i = 0; i < 6; i++) cal3.add({ palm: 40, L: 360, r: 1.5, n, dMask: 2, dPose: 5 });
  const okAdd = cal3.add({ palm: 60, L: 360, r: 1.5, n, dMask: 2, dPose: 5 });
  ok(!okAdd && cal3.s.length === 1 && cal3.result() === null, '檢測時手掌長跳超過 3% → 重收');
}
{
  const f = new api.FaOneEuro(1.0, 0.1);
  f.filter({ x: 100, y: 100 }, 0);
  const a = f.filter({ x: 104, y: 100 }, 1 / 30);
  const b = new api.FaOneEuro(1.0, 0.1); b.filter({ x: 100, y: 100 }, 0);
  const c = b.filter({ x: 104, y: 100 }, 1);   // 斷超過 0.5 秒 → 重來
  ok(a.x > 100 && a.x < 104 && c.x === 104, 'One Euro：小抖動被壓、斷線超過 0.5 秒就重來');
}

console.log(fail ? `\n${fail} 項失敗` : '\n全部通過');
process.exit(fail ? 1 : 0);
