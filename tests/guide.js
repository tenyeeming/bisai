// 引導箭頭測試（2026-09-12 新增）
//   node tests/guide.js
//
// 釘住的是「箭頭取代虛線」這次改動的三個設計決定，而不是實作細節：
//   ① 箭頭尖端不可以蓋住穴道 —— 蓋住等於把信心圓盤遮掉，
//      而圓盤是「這個位置可不可信」的唯一視覺線索。
//   ② 太近時不畫 —— 快對準時箭頭會縮成色塊蓋住目標。
//   ③ 長度封頂 —— 離很遠時不可以畫一條穿過半個畫面的長箭頭。
// 另外釘住兩邊（手部／臉部）真的都改用箭頭了，沒有人還留著虛線。
const fs = require('fs'), vm = require('vm'), path = require('path');
const DIR = path.join(__dirname, '..').replace(/\\/g, '/') + '/';

let fail = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const read = f => fs.readFileSync(DIR + f, 'utf8');

// ── 只載入 acu-math.js（純函式，不需要 DOM）──
const sandbox = { window: {}, console, Math, Number, isNaN, parseFloat };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(read('js/acu-math.js'), sandbox, { filename: 'acu-math.js' });
ok(typeof sandbox.drawGuideArrow === 'function', 'drawGuideArrow() 存在');

// ── 假 context：錄下所有幾何呼叫 ──
function makeCtx() {
  const pts = [], calls = [];
  const push = (op, x, y) => { calls.push(op); if (x != null) pts.push([x, y]); };
  return {
    pts, calls,
    save() { calls.push('save'); }, restore() { calls.push('restore'); },
    beginPath() { calls.push('beginPath'); }, closePath() { calls.push('closePath'); },
    moveTo(x, y) { push('moveTo', x, y); }, lineTo(x, y) { push('lineTo', x, y); },
    stroke() { calls.push('stroke'); }, fill() { calls.push('fill'); },
    set strokeStyle(v) {}, set fillStyle(v) {}, set lineWidth(v) {},
    set lineCap(v) {}, set lineJoin(v) {},
  };
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// ── ① 尖端不可以蓋住穴道 ──
{
  const ctx = makeCtx();
  const from = [100, 100], to = [400, 100], gap = 16;
  const drew = sandbox.drawGuideArrow(ctx, from[0], from[1], to[0], to[1], { gap });
  ok(drew === true, '距離夠遠時有畫（回傳 true）');
  const nearest = Math.min(...ctx.pts.map(p => dist(p, to)));
  ok(nearest >= gap - 0.51,
     `箭頭所有頂點都離穴道 ≥ gap：最近 ${nearest.toFixed(1)}px（gap=${gap}）`);
}

// ── gap 調大時，留白確實跟著變大（釘住呼叫端傳 discR 有效）──
// ⚠️ 必須在**近距離**測：距離遠到觸發 maxLen 封頂時，尖端本來就離目標很遠，
//    gap 這個「最小留白」不會是生效的那個約束。而會蓋住圓盤的正是近距離。
{
  const from = [100, 100], to = [220, 100];   // 距離 120，在封頂生效前
  const near = g => {
    const ctx = makeCtx();
    const drew = sandbox.drawGuideArrow(ctx, from[0], from[1], to[0], to[1], { gap: g });
    return drew ? Math.min(...ctx.pts.map(p => dist(p, to))) : null;
  };
  const a = near(16), b = near(48);
  ok(a !== null && Math.abs(a - 16) < 0.6, `近距離時 gap=16 精確生效（留白 ${a && a.toFixed(1)}）`);
  ok(b !== null && Math.abs(b - 48) < 0.6, `近距離時 gap=48 精確生效（留白 ${b && b.toFixed(1)}）`);
  ok(b > a + 25, `gap 調大，留白跟著變大（${a.toFixed(1)} → ${b.toFixed(1)}）`);
}

// ── 圓盤越大，箭頭退得越遠（呼叫端用 discR 算 gap 的理由）──
{
  const from = [100, 100], to = [230, 100];
  const near = discR => {
    const ctx = makeCtx();
    sandbox.drawGuideArrow(ctx, from[0], from[1], to[0], to[1],
                           { gap: Math.max(16, discR * 0.9) });
    return Math.min(...ctx.pts.map(p => dist(p, to)));
  };
  ok(near(60) > near(10) + 20,
     `圓盤半徑 60 時箭頭比半徑 10 時退得更遠（${near(10).toFixed(1)} → ${near(60).toFixed(1)}）`);
}

// ── ② 太近時不畫 ──
{
  const ctx = makeCtx();
  const drew = sandbox.drawGuideArrow(ctx, 200, 200, 210, 205, {});
  ok(drew === false, '指尖已經很靠近穴道時不畫（回傳 false）');
  ok(ctx.pts.length === 0, '不畫時一個座標都沒送出去');
}

// ── ③ 長度封頂 ──
{
  const ctx = makeCtx();
  const maxLen = 110;
  sandbox.drawGuideArrow(ctx, 0, 300, 2000, 300, { maxLen });
  const from = [0, 300];
  const far = Math.max(...ctx.pts.map(p => dist(p, from)));
  ok(far <= maxLen + 20,
     `離很遠時箭頭長度封頂：最遠頂點 ${far.toFixed(1)}px（上限 ${maxLen} + 起點留白）`);
}

// ── 方向要對：尖端必須比起點更接近目標 ──
for (const [dx, dy, label] of [[300, 0, '右'], [-300, 0, '左'],
                               [0, 300, '下'], [0, -300, '上'],
                               [200, -200, '右上']]) {
  const ctx = makeCtx();
  const from = [500, 400], to = [500 + dx, 400 + dy];
  sandbox.drawGuideArrow(ctx, from[0], from[1], to[0], to[1], {});
  const closest = Math.min(...ctx.pts.map(p => dist(p, to)));
  ok(closest < dist(from, to),
     `方向正確（往${label}）：最近頂點離目標 ${closest.toFixed(0)}px < 起點的 ${dist(from, to).toFixed(0)}px`);
}

// ── 兩邊都改用箭頭了，沒有人還留著虛線引導 ──
{
  const vision = read('js/vision.js'), face = read('js/face-vision.js');
  ok(/drawGuideArrow\(/.test(vision), '手部（vision.js）有呼叫 drawGuideArrow');
  ok(/drawGuideArrow\(/.test(face), '臉部（face-vision.js）有呼叫 drawGuideArrow');
  ok(!/setLineDash/.test(face),
     '臉部不再用 setLineDash 畫引導虛線');
}

// ── 「再靠近 N px」那句已經移除（px 對使用者沒有意義）──
{
  const vision = read('js/vision.js');
  ok(!/再靠近\s*\$\{/.test(vision) && !/px['`]/.test(vision.match(/setGate\([^;]*?closer[^;]*?\)/s) || ''),
     '手部提示不再對使用者報 px 數字');
  ok(/箭頭/.test(vision), '手部提示改成講箭頭');
}

console.log(fail ? `\n${fail} 項失敗` : '\n全部通過');
process.exit(fail ? 1 : 0);
