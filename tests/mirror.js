// 鏡像測試：用真實 landmark 餵進 onHandsResults，攔截 canvas 呼叫，
// 驗證「畫面翻、文字不翻、座標算在原始空間」這三件事。
//   npm install && node tests/mirror.js
const fs = require('fs'), path = require('path');
const { JSDOM, VirtualConsole } = requireJsdom();
const DIR = path.join(__dirname, '..').replace(/\\/g, '/') + '/';
// 專案根目錄的人工標注紀錄，拿來當真實 landmark 來源
const REC = path.join(__dirname, '../../../測試記錄').replace(/\\/g, '/') + '/';

function requireJsdom() {
  try { return require('jsdom'); }
  catch { console.error('缺少 jsdom。請先在 demo網站/ 執行：npm install'); process.exit(2); }
}

let fail = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };

// ── 抓一筆真實的 dorsal landmark ──
let rec = null;
for (const f of fs.readdirSync(REC).filter(f => f.endsWith('.json'))) {
  const rows = JSON.parse(fs.readFileSync(REC + f, 'utf8'));
  const hit = rows.find(r => r.landmarks && r.landmarks.length === 21 && r.isDorsal && r.acupoint === '合谷穴');
  if (hit) { rec = hit; console.log(`使用真實紀錄：${f} / ${hit.acupoint} / ${hit.formulaVersion}`); break; }
}
if (!rec) { console.error('找不到可用的測試紀錄'); process.exit(2); }

// ── 載入網站 ──
let html = fs.readFileSync(DIR + 'acunavi-ideal.html', 'utf8')
  .replace(/<link rel="stylesheet"[^>]*>/g, '')
  .replace(/<script src="https:\/\/[^"]+"[^>]*><\/script>/g,
    '<script>class Hands{setOptions(){}onResults(){}send(){return Promise.resolve()}close(){}}' +
    'class Camera{start(){return Promise.resolve()}stop(){}}<\/script>')
  .replace(/<script src="((?:js|pages)\/[^"]+)"><\/script>/g,
    (_, f) => '<script>' + fs.readFileSync(DIR + f, 'utf8') + '<\/script>');

const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/',
  virtualConsole: new VirtualConsole(),
});
const w = dom.window, d = w.document;

// ── 假的 2D context：把所有呼叫錄下來，並自己維護一個水平翻轉旗標 ──
function makeRecorder() {
  const calls = [];
  let flipped = false;
  const stack = [];
  const rec = {
    calls,
    save() { stack.push(flipped); calls.push(['save']); },
    restore() { flipped = stack.pop() || false; calls.push(['restore']); },
    translate(x, y) { calls.push(['translate', x, y]); },
    scale(sx, sy) { if (sx < 0) flipped = !flipped; calls.push(['scale', sx, sy]); },
    clearRect() { calls.push(['clearRect']); },
    drawImage() { calls.push(['drawImage', { flipped }]); },
    beginPath() {}, closePath() {}, moveTo(x, y) { calls.push(['moveTo', x, y, { flipped }]); },
    lineTo(x, y) { calls.push(['lineTo', x, y, { flipped }]); },
    arc(x, y, r) { calls.push(['arc', x, y, r, { flipped }]); },
    fill() {}, stroke() {}, setLineDash() {},
    fillText(txt, x, y) { calls.push(['fillText', txt, x, y, { flipped }]); },
    measureText() { return { width: 10 }; },
  };
  return rec;
}

setTimeout(() => {
  const W = 640, H = 480;
  const canvas = d.getElementById('video-canvas');
  const ctx = makeRecorder();
  canvas.getContext = () => ctx;

  // 手動把偵測迴圈需要的狀態擺好
  w.eval(`
    state.selectedAcupoints = ['${rec.acupoint}'];
    state.currentAcupointIndex = 0;
    activeCanvas = document.getElementById('video-canvas');
    video = { videoWidth: ${W}, videoHeight: ${H} };
    camRunning = true;
    renderMode = 'locate';
    showDisc = true;
    strictGate = false;
  `);

  const results = {
    image: null,
    multiHandLandmarks: [rec.landmarks],
    multiHandedness: [{ label: 'Left', score: 0.98, index: 0 }],
  };

  // ── 前鏡頭：應該鏡像 ──
  w.eval("facingMode = 'user'");
  ctx.calls.length = 0;
  w.onHandsResults(results);

  const draw = ctx.calls.find(c => c[0] === 'drawImage');
  ok(draw && draw[1].flipped === true, '前鏡頭：影像在翻轉狀態下畫出');

  const texts = ctx.calls.filter(c => c[0] === 'fillText');
  ok(texts.length > 0, `有畫出穴名（${texts.length} 個）`);
  ok(texts.every(c => c[4].flipped === false), '穴名不在翻轉狀態下畫 → 不會變反字');

  const discPts = ctx.calls.filter(c => (c[0] === 'lineTo' || c[0] === 'moveTo') && c[3] && c[3].flipped);
  ok(discPts.length > 0, `信心圓盤的 ${discPts.length} 個頂點是翻轉著畫的（形狀才對）`);

  const dotMirrored = ctx.calls.filter(c => c[0] === 'arc' && c[4].flipped === false);
  ok(dotMirrored.length > 0, '穴位點在正常座標系畫');

  // ── 後鏡頭：不應鏡像 ──
  w.eval("facingMode = 'environment'");
  ctx.calls.length = 0;
  w.onHandsResults(results);
  const draw2 = ctx.calls.find(c => c[0] === 'drawImage');
  ok(draw2 && draw2[1].flipped === false, '後鏡頭：影像不翻轉');
  ok(ctx.calls.filter(c => c[0] === 'scale').length === 0, '後鏡頭完全不呼叫 scale');

  // ── 同一穴道，兩種鏡頭的畫出位置應該左右對稱 ──
  const xOf = (calls) => {
    const a = calls.filter(c => c[0] === 'arc' && c[4].flipped === false);
    return a.length ? a[a.length - 1][1] : null;
  };
  const xEnv = xOf(ctx.calls);
  ctx.calls.length = 0;
  w.eval("facingMode = 'user'");
  w.onHandsResults(results);
  const xUser = xOf(ctx.calls);
  ok(xEnv !== null && xUser !== null && Math.abs((xEnv + xUser) - W) < 0.01,
     `鏡像後的 x 正好是 W - x（${xEnv.toFixed(1)} + ${xUser.toFixed(1)} = ${W}）`);

  // ── 定位邏輯不受影響：landmark 沒被動過 ──
  ok(w.eval(`JSON.stringify(state.selectedAcupoints)`) === JSON.stringify([rec.acupoint]), '狀態沒被弄亂');
  const lmNow = JSON.stringify(results.multiHandLandmarks[0]);
  ok(lmNow === JSON.stringify(rec.landmarks), '原始 landmark 沒有被就地改動（定位公式吃的還是原值）');

  console.log(fail ? `\n=== ${fail} 項失敗 ===` : '\n=== 全過 ===');
  process.exit(fail ? 1 : 0);
}, 30);
