// 定位前檢測測試（2026-11-01 新增）
//   node tests/calib.js
//
// js/calib.js 是 App acu/HandCalib.kt、locate/FaceCalib.kt、SessionViewModel 量手那段的移植。
// 前半照抄 App HandCalibTest.kt／FaceCalibTest.kt（同一組輸入、同一個期望值）；
// 後半驗網頁自己接的地方：療程紀錄、computeAcupoint 的寸參數、扭轉固定基準、頁面有沒有接上。
const fs = require('fs'), vm = require('vm'), path = require('path');
const DIR = path.join(__dirname, '..').replace(/\\/g, '/') + '/';
const read = (f) => fs.readFileSync(DIR + f, 'utf8');

let fail = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

const store = {};
const localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
const sandbox = { console, Math, Number, JSON, Object, Array, Set, Date, localStorage };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(read('js/acu-data.js'), sandbox, { filename: 'acu-data.js' });
vm.runInContext(read('js/acu-math.js'), sandbox, { filename: 'acu-math.js' });
// state.js 要 DOM，這裡只補 calib.js 需要的兩個東西
vm.runInContext(`var state = { selectedAcupoints: ['合谷穴', '勞宮穴'], currentAcupointIndex: 0 };
  var curAcuName = () => state.selectedAcupoints[state.currentAcupointIndex];`, sandbox);
const api = vm.runInContext(read('js/calib.js') + `
;({ HandCalibrator, FaceCalibrator, calibBox, calibBoxForearm, pointsInBox, fingersOpen, calibFacingOk, calibAcuOnPalm,
    calibImgFile, calibForearmImgFile, handKeyOfLabel, labelOfHandKey,
    needsHandCalib, recordHandCalib, skipHandCalib, resetHandCalib, activeHandCalib, setCalibEnabled,
    needsFaceCalib, recordFaceCalib, skipFaceCalib, savedCalib })`, sandbox, { filename: 'calib.js' });

// ── 手部（同 App HandCalibTest）──────────────────────────────────
const s = (t, o = {}) => Object.assign({ axisPx: 200, cunPx: 40, tb: 0.05, tiltDeg: 5, fingersOpen: true, atMs: t,
  inBox: true, facingOk: true }, o);
{
  const c = new api.HandCalibrator();
  c.update(s(0)); c.update(s(1000));
  const st = c.update(s(1100, { facingOk: false }));
  ok(st.issue === 'wrong-side' && st.progress === 0, '翻錯面：從頭收（App wrongSideResetsProgress）');
}
ok(api.calibFacingOk('合谷穴', true) && !api.calibFacingOk('合谷穴', false)
   && api.calibFacingOk('勞宮穴', false) && !api.calibFacingOk('勞宮穴', true)
   && api.calibFacingOk('不存在的穴', false), '朝向照這一穴那一面，查不到不擋（App facingFollowsAcupointSide）');
{
  const c = new api.HandCalibrator();
  let last = c.update(s(0));
  for (let t = 100; t <= 2000; t += 100) last = c.update(s(t));
  ok(last.result && near(last.result.k, 0.2) && near(last.result.tb0, 0.05) && last.progress === 1,
     '好幀收滿 2 秒：k = 40/200 = 0.2、tb0 = 0.05（App collectsAfterTwoSecondsOfGoodFrames）');
  ok(near(last.result.k * 200, 40) && near(last.result.k * 100, 20), '寸＝k × 掌軸：手離遠一倍寸減半（App calibratedCunScalesWithAxisOnly）');
}
{
  const c = new api.HandCalibrator();
  for (let t = 0; t <= 1500; t += 100) c.update(s(t));
  const a = c.update(s(1550, { tiltDeg: 25 }));
  const b = c.update(s(1600, { tiltDeg: 35 }));
  ok(a.issue === null && b.issue === 'tilted' && b.progress === 0 && !b.result, '斜 25° 照收、35° 從頭收（App tiltedHandResetsProgress）');
}
{
  const c = new api.HandCalibrator();
  ok(c.update(s(0, { fingersOpen: false })).issue === 'fingers'
     && c.update(s(100), true).issue === 'wrong-hand'
     && c.update(null).issue === 'no-hand', '握拳／舉錯手／沒手各有原因（App closedFingersAndWrongHandAreRejected）');
}
{
  const c = new api.HandCalibrator();
  for (let t = 0; t <= 1500; t += 100) c.update(s(t));
  const st = c.update(s(1600, { inBox: false }));
  ok(st.issue === 'out-box' && st.progress === 0, '出框：從頭收（App handOutOfBoxResetsProgress）');
}
{
  const c = new api.HandCalibrator();
  for (let t = 0; t <= 1000; t += 100) c.update(s(t));
  const st = c.update(s(1100, { axisPx: 240 }));
  ok(st.issue === 'moving' && st.progress === 0, '掌軸長變 20%：手在動，從頭收（App movingHandRestarts）');
}
{
  const a = api.calibBox(400, 800);
  ok(near(a.w, 320, 1e-3) && near(a.h, 320 / 0.75, 1e-3) && near(a.l, 40, 1e-3) && near(800 - (a.t + a.h), a.t, 1e-3),
     '直立取景框：寬受限、置中（App calibBoxIsCenteredPortraitAndFits）');
  const b = api.calibBox(1600, 600);
  ok(near(b.h, 480, 1e-3) && near(b.w, 360, 1e-3) && b.t >= 0 && b.t + b.h <= 600, '橫向取景框：高受限，框塞得進去');
  ok(api.pointsInBox([{ x: 200, y: 400 }, { x: 45, y: 200 }], a) && api.pointsInBox([{ x: 35, y: 400 }], a)
     && !api.pointsInBox([{ x: 200, y: 400 }, { x: 10, y: 400 }], a) && !api.pointsInBox([], a),
     '進框只寬容一點點（App pointsInBoxAllowsSmallSlackOnly）');
  // 11-04 手肘橫框：電腦橫螢幕寬多了、手機直放寬度不變
  const fd = api.calibBoxForearm(1280, 720), hd = api.calibBox(1280, 720);
  ok(near(fd.w, 1024, 1e-3) && near(fd.h, 512, 1e-3) && fd.w > hd.w * 2 && fd.t >= 0 && fd.t + fd.h <= 720,
     '手肘框：電腦 1280×720 是 1024×512（直立框只有 432 寬）');
  const fp = api.calibBoxForearm(390, 844), hp = api.calibBox(390, 844);
  ok(near(fp.w, hp.w, 1e-3) && near(fp.h, hp.h, 1e-3) && near(fp.t, hp.t, 1e-3),
     '手肘框：手機直放維持原本的 3:4（換橫框只會變矮、更難進框）');
}
{
  const hand = (tipY) => {
    const p = Array.from({ length: 21 }, () => ({ x: 0, y: 0 }));
    [5, 9, 13, 17].forEach((i, k) => { p[i] = { x: k * 20, y: -100 }; });
    [8, 12, 16, 20].forEach((i, k) => { p[i] = { x: k * 20, y: tipY }; });
    return p;
  };
  ok(api.fingersOpen(hand(-200)) && !api.fingersOpen(hand(-90)), '握拳偵測（App fingersOpenDetectsFist）');
}

// ── 臉部（同 App FaceCalibTest，網頁沒有上下角）──────────────────
const f = (t, o = {}) => Object.assign({ ipdPx: 100, yawDeg: 3, pitchDeg: null, inBox: true, atMs: t }, o);
{
  const c = new api.FaceCalibrator();
  let st = c.update(f(0, { yawDeg: 2 }));
  for (let t = 250; t <= 2000; t += 250) st = c.update(f(t, { yawDeg: 4 }));
  ok(st.done && st.progress === 1 && near(st.yaw0, 4) && c.update(null).done, '臉收滿 2 秒、量好不退回（App holdsTwoSecondsThenDoneWithBaseline）');
}
{
  const c = new api.FaceCalibrator();
  c.update(f(0)); c.update(f(1000));
  ok(c.update(null).issue === 'no-face' && c.update(f(1100, { inBox: false })).issue === 'out-box'
     && c.update(f(1200, { yawDeg: -15 })).issue === 'turned' && c.update(f(1300, { yawDeg: null })).issue === 'turned',
     '沒臉／出框／轉太多各有原因（App eachIssueResetsProgress）');
  c.update(f(2000));
  ok(!c.update(f(3000)).done, '從頭收：再 1 秒還不夠');
}
{
  const c = new api.FaceCalibrator();
  c.update(f(0, { ipdPx: 100 })); c.update(f(500, { ipdPx: 101 }));
  ok(c.update(f(1000, { ipdPx: 120 })).issue === 'moving', '頭在動：從頭收（App movingHeadRestarts）');
  ok(new api.FaceCalibrator().update(f(0, { yawDeg: -12 })).issue === null, '左右 12° 剛好收（App yawAtBindLimitIsAccepted）');
}

// ── 療程紀錄（App HandCalibSessionTest）────────────────────────────
const S = sandbox.state;
api.setCalibEnabled(true);
ok(api.needsHandCalib('right') && api.needsHandCalib('left'), '剛開療程：兩隻手都要量');
api.recordHandCalib('right', { k: 0.2, tb0: 0.05 });
ok(!api.needsHandCalib('right') && api.needsHandCalib('left'), '量了右手：右手這一穴不再問，左手還要');
ok(near(api.activeHandCalib('right').k, 0.2) && api.activeHandCalib('left') === null, '定位只拿這一穴量到的');
S.currentAcupointIndex = 1;
ok(api.needsHandCalib('right') && api.activeHandCalib('right') === null, '換一穴：每一穴都要重量（App 批 124）');
api.skipHandCalib('right');
ok(!api.needsHandCalib('right') && api.activeHandCalib('right') === null, '略過：這一穴不問、照舊每幀量寸');
S.currentAcupointIndex = 0;
S.selectedAcupoints = ['合谷穴'];   // 新療程＝新陣列（首頁／選穴／圖冊練習都是重新指定）
ok(api.needsHandCalib('right'), '新療程同一穴也要重量（App 批 130 newSessionOnSameAcupointAsksAgain）');
ok(near(api.savedCalib().right, 0.2) && /^\d{4}-\d{2}-\d{2}$/.test(api.savedCalib().savedAt), '量到的寸比例存進瀏覽器（附日期）');
api.recordHandCalib('left', { k: 0.25, tb0: 0.1 });
api.resetHandCalib();
ok(api.needsHandCalib('left') && api.needsHandCalib('right'), '齒輪「重新檢測手部」：兩隻都清掉');
api.setCalibEnabled(false);
ok(!api.needsHandCalib('right') && near(api.activeHandCalib('right').k, 0.2) && api.activeHandCalib('right').tb0 === null,
   '關掉檢測：不再問，定位用存檔的寸比例、扭轉基準不存');
ok(!api.needsFaceCalib(), '關掉檢測：臉也不問');
api.setCalibEnabled(true);
ok(api.needsFaceCalib(), '臉：開著就要量');
api.recordFaceCalib();
ok(!api.needsFaceCalib(), '臉量好了這一穴不再問');
S.selectedAcupoints = ['印堂'];
api.skipFaceCalib();
ok(!api.needsFaceCalib(), '臉略過也不再問');

// ── 左右手與圖 ────────────────────────────────────────────────────
ok(api.handKeyOfLabel('Left') === 'right' && api.labelOfHandKey('right') === 'Left',
   'Solutions 標籤 Left ＝ 真實右手（同 vision.js requireLabel 的約定）');
ok(api.calibImgFile(true, 'left') === 'calib_palm_left.png' && api.calibImgFile(false, 'right') === 'calib_back_right.png',
   '手圖：手心／手背 × 左右手（App calibGuideAsset）');
ok(api.calibForearmImgFile(true, 'right') === 'calib_forearm_palm_right.png', '手肘圖：內關在手心那面');
ok(['calib_back_left', 'calib_back_right', 'calib_palm_left', 'calib_palm_right', 'calib_face',
    'calib_forearm_back_left', 'calib_forearm_back_right', 'calib_forearm_palm_left', 'calib_forearm_palm_right']
   .every(n => fs.existsSync(DIR + 'assets/calib/' + n + '.png')), '九張檢測框圖都在 assets/calib/');
ok(api.calibAcuOnPalm('勞宮穴') && !api.calibAcuOnPalm('合谷穴'), '手心穴挑手心那張圖');

// ── computeAcupoint 的寸參數（同 App cunOverride）──────────────────
// 真實 landmark 從 測試記錄/*.json 取（同 angle-gate.js）；兩種左右標籤都試，挑合谷算得出來的那個
const REC = path.join(__dirname, '../../../測試記錄').replace(/\\/g, '/') + '/';
let real = null;
for (const fn of fs.existsSync(REC) ? fs.readdirSync(REC).filter(x => x.endsWith('.json')) : []) {
  let rows; try { rows = JSON.parse(fs.readFileSync(REC + fn, 'utf8')); } catch { continue; }
  if (!Array.isArray(rows)) continue;
  for (const r of rows) {
    if (!r || !r.landmarks || r.landmarks.length !== 21 || !r.isDorsal) continue;
    const hd = ['Left', 'Right'].map(label => ({ label })).find(h => sandbox.computeAcupoint('合谷穴', r.landmarks, 640, 480, h));
    if (hd) { real = { lm: r.landmarks, hd, fn }; break; }
  }
  if (real) break;
}
if (!real) console.error('找不到可用的測試紀錄（測試記錄/*.json），跳過寸參數那組');
else {
  console.log(`使用真實紀錄：${real.fn}`);
  const lm = real.lm, W = 640, H = 480, hd = real.hd;
  const raw = sandbox.computeAcupoint('合谷穴', lm, W, H, hd);
  const cun = sandbox.computeCunPx(lm, W, H);
  const same = sandbox.computeAcupoint('合谷穴', lm, W, H, hd, cun);
  const none = sandbox.computeAcupoint('合谷穴', lm, W, H, hd, undefined);
  ok(raw && same && raw.length === same.length && raw.every((p, i) => near(p.x, same[i].x, 1e-9) && near(p.y, same[i].y, 1e-9)),
     '帶進跟原本一樣的寸 → 點完全一樣');
  ok(none && raw.every((p, i) => p.x === none[i].x && p.y === none[i].y), '不帶寸 → 舊行為逐位元不變');
  const big = sandbox.computeAcupoint('合谷穴', lm, W, H, hd, cun * 1.2);
  ok(big && raw.some((p, i) => !near(p.x, big[i].x, 1e-6) || !near(p.y, big[i].y, 1e-6)), '寸變大 → 點跟著移');
}

// ── 扭轉固定基準（App twistTrackerUsesFixedBaseline）、頁面接線 ──────────
{
  const v = read('js/vision.js');
  const src = v.slice(v.indexOf('const median ='), v.indexOf('const twistTracker'));
  const T = vm.runInContext(src + ';TwistTracker', vm.createContext({ Math }));
  const tr = new T();
  tr.fixedBaseline = 0.10;
  let side = null;
  for (let i = 0; i < 50; i++) side = tr.update(0.10, 3, false);
  ok(side === null && tr.baseline.length === 0, '有固定基準：不再滾動收基準、跟基準一樣就不亮箭頭');
  tr.reset();
  ok(tr.fixedBaseline === 0.10, 'reset 不清固定基準');
  ok(tr.update(0.40, 3, false) !== null, '偏離固定基準 0.3 → 第一幀就亮箭頭（不必先收 8 幀）');
  ok(/const n = 2;/.test(v), '定位頁也偵測兩隻手（定位頁要看另一隻手、檢測要在兩隻手裡挑）');
}
{
  const html = read('acunavi-ideal.html');
  const i = (f) => html.indexOf(f);
  ok(i('js/calib.js') > i('js/state.js') && i('js/calib.js') < i('js/vision.js') && i('js/calib.js') > 0,
     'calib.js 在 state.js 之後、vision.js 之前載入');
  const cam = read('pages/04-camera.js'), mas = read('pages/05-massage.js');
  ok(/needsHandCalib/.test(cam) && /btn-locate-calib-skip/.test(cam), '定位頁：進頁先量第一隻手、有「略過檢測」');
  ok(/holdForCalib\(\(\) => startSwitchCountdown\(\)\)/.test(mas) && /holdForCalib\(startEntryCountdown\)/.test(mas),
     '按摩頁：換手、臉部進頁都先量再倒數');
  ok(/calibBoxForearm\(W, H\)/.test(read('js/forearm-vision.js')), '手肘：用橫的 2:1 框（11-04，圖是放平的）');
  ok(/\.gear-menu button\[hidden\]\s*\{\s*display:\s*none/.test(read('css/shell.css')), '齒輪選單項目可以藏（重新檢測手部）');
}

console.log(fail ? `\n${fail} 項失敗` : '\n全部通過');
process.exit(fail ? 1 : 0);
