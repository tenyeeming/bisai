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
;({ faAxis, faNeiguan, faPickTarget, faTwistWorldDeg, faMeasureCuts, faRadiusCun,
    FaCalib, FaTwistGate, FaPressTracker, FA_R_DEFAULT, FA_A, FA_B, FA_C })`, sandbox, { filename: 'forearm-vision.js' });

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

console.log(fail ? `\n${fail} 項失敗` : '\n全部通過');
process.exit(fail ? 1 : 0);
