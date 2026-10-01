// ═══════════════════════════════════════════════════════════════════
// 前臂內關：相機＋定位＋按壓判定（2026-10-01，網頁 v2 跟上 App 批 89／90）
//
// 用戶：「激活內關的網頁版本穴道定位」。App 先行（批 89），這支是逐式照抄：
//   公式／閘門／檢測  AcuNavi/app/.../locate/ForearmMath.kt（ForearmMath、ForearmCalib、
//                     ForearmTwistGate、ForearmPressTracker）—— 常數同一份
//   流程與畫法       AcuNavi/app/.../ui/pages/ForearmScreen.kt
//   遮罩讀法         js/forearm-lab.js 的 flReadMask／flMaskAt（Solutions 版遮罩已在這裡實測過）
//
//   內關 = lm0 + (2 + A)·寸·ax + (B + C·r·sinθ)·寸·nv
//     寸 = |Pose 肘 − Hand lm0| / 12；ax = lm0→肘；nv = 法向中指向 lm9 那側
//     r  = Pose 遮罩第 4～7 寸前臂寬度中位 ÷ 2；量不到用 FA_R_DEFAULT
//     θ  = Hand world 掌面法向繞前臂軸的角
//
// 依據：用戶左掌心 1 人 2 支貼紙影片（貼紙實驗/內關優化_20260930/，20260928_1820／1758），
//       1820 分段交叉驗證中位 2.27mm。⚠️ A/B/C 樣本內擬合、容忍角 30° 與按壓 0.7／1.0 寸都沒有 GT。
// ⚠️ 不寫進公式四檔（acu-math.js 等）：同 App，內關刻意放在公式四檔外面。
//
// 與 App 的差別（只差在平台）：
//   ① 模型是 Solutions API（Hands 共用 js/vision.js 那個實例，結果由 onHandsResults 轉交過來；
//      Pose 另建），兩個依序 send 同一幀，所以不用 PAIR_MS 配對。
//   ② 遮罩縮成 FA_MASK_MAX 邊長再讀（手機上每幀讀全幅太貴）；App 是全幅。
//   ③ 座標一律原始（不鏡像），前鏡頭只鏡射畫面（同 vision.js）。
// ═══════════════════════════════════════════════════════════════════

// ── 公式常數（= ForearmMath.kt）──────────────────────────────────────
const FA_A = 0.306, FA_B = 0.085, FA_C = -0.532;
const FA_R_DEFAULT = 1.676;
const FA_CUTS = [4, 5, 6, 7];
const FA_CORRIDOR_HALF = 0.30;
const FA_MERGE_RATIO = 1.35;
// ── 畫面／流程常數（= ForearmScreen.kt）──────────────────────────────
const FA_BOX_FRAC = 0.86, FA_BOX_SLACK = 0.04;
const FA_ELBOW_VIS = 0.5;
const FA_EMA = 0.5;
const FA_CALIB_SHOW_MS = 1200;      // 檢測完打勾停多久
const FA_PRESS_ON = 0.7;            // 判定圈＝畫面上的圈（寸）
const FA_MASK_MAX = 320;
const FA_MASK_TH = 0.5;

const faMedian = (v) => {
  const s = [...v].sort((a, b) => a - b), n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};

// ── ForearmMath ──────────────────────────────────────────────────────
/** 前臂軸（影像像素）。hand 是正規化 21 點；回 null＝太短（多半是 Pose 選錯手臂） */
function faAxis(hand, ex, ey, W, H) {
  if (!hand || hand.length < 21) return null;
  const x0 = hand[0].x * W, y0 = hand[0].y * H;
  const len = Math.hypot(ex - x0, ey - y0);
  if (len < 30) return null;
  const ax = (ex - x0) / len, ay = (ey - y0) / len;
  let nx = -ay, ny = ax;
  const tx = hand[9].x * W - x0, ty = hand[9].y * H - y0;
  if (tx * nx + ty * ny < 0) { nx = -nx; ny = -ny; }
  return { x0, y0, ax, ay, nx, ny, lenPx: len, cun: len / 12 };
}

/** 兩隻手時挑被按的那隻：Hand lm0 與 Pose 腕（15／16）最近的那組。回 { hand, elbow } 或 null */
function faPickTarget(pose, hands, lockedElbow) {
  let best = null;
  hands.forEach((h, i) => {
    if (!h || h.length < 21) return;
    for (const [e, w] of [[13, 15], [14, 16]]) {
      if (lockedElbow != null && e !== lockedElbow) continue;
      const d = Math.hypot(pose[w].x - h[0].x, pose[w].y - h[0].y);
      if (!best || d < best.d) best = { hand: i, elbow: e, d };
    }
  });
  return best;
}

/** 扭轉角 θ（度）：Hand world 掌面法向（強制朝鏡頭）繞前臂軸的角 */
function faTwistWorldDeg(world, a) {
  if (!world || world.length < 21) return null;
  const ux = world[5].x - world[0].x, uy = world[5].y - world[0].y, uz = world[5].z - world[0].z;
  const vx = world[17].x - world[0].x, vy = world[17].y - world[0].y, vz = world[17].z - world[0].z;
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const n = Math.hypot(nx, ny, nz);
  if (n < 1e-9) return null;
  nx /= n; ny /= n; nz /= n;
  if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; }
  return Math.atan2(nx * a.nx + ny * a.ny, nz) * 180 / Math.PI;
}

/**
 * 覆蓋邊界：沿前臂軸第 4～7 寸各切一刀，從刀心沿法向往兩側走到遮罩外。
 * @param inside (x,y) → true／false／null（null＝出畫面＝截斷）
 */
function faMeasureCuts(inside, a) {
  const hmax = FA_CORRIDOR_HALF * a.lenPx;
  const out = [];
  for (const k of FA_CUTS) {
    const cx = a.x0 + k * a.cun * a.ax, cy = a.y0 + k * a.cun * a.ay;
    if (inside(cx, cy) !== true) continue;
    const ends = [0, 0];
    let ok = true;
    [1, -1].forEach((sign, i) => {
      if (!ok) return;
      let s = 0, edge = -1;
      while (s <= hmax) {
        const v = inside(cx + sign * s * a.nx, cy + sign * s * a.ny);
        if (v == null) break;
        if (!v) { edge = Math.max(0, s - 1); break; }
        s += 1;
      }
      if (edge < 0) ok = false; else ends[i] = edge;
    });
    if (!ok) continue;
    out.push({
      x1: cx + ends[0] * a.nx, y1: cy + ends[0] * a.ny,
      x2: cx - ends[1] * a.nx, y2: cy - ends[1] * a.ny,
      widthCun: (ends[0] + ends[1] + 1) / a.cun,
    });
  }
  if (out.length >= 2) {
    const ref = faMedian(out.map(c => c.widthCun));
    return out.filter(c => c.widthCun <= FA_MERGE_RATIO * ref);
  }
  return out;
}

const faRadiusCun = (cuts) => cuts.length ? faMedian(cuts.map(c => c.widthCun)) / 2 : null;

function faNeiguan(a, rCun, thetaDeg) {
  const along = (2 + FA_A) * a.cun;
  const across = (FA_B + FA_C * rCun * Math.sin(thetaDeg * Math.PI / 180)) * a.cun;
  return { x: a.x0 + along * a.ax + across * a.nx, y: a.y0 + along * a.ay + across * a.ny };
}

/** 掌寬比 |lm5−lm17| ÷ |lm0−lm9|（像素） */
function faWidthRatio(hand, W, H) {
  if (!hand || hand.length < 21) return null;
  const p = (i) => [hand[i].x * W, hand[i].y * H];
  const [x5, y5] = p(5), [x17, y17] = p(17), [x0, y0] = p(0), [x9, y9] = p(9);
  const axis = Math.hypot(x9 - x0, y9 - y0);
  return axis < 1e-6 ? null : Math.hypot(x5 - x17, y5 - y17) / axis;
}

// ── ForearmCalib：放平檢測（手心、整段前臂進框、Tb 穩 2 秒）──────────
class FaCalib {
  constructor(durMs = 2000, minSamples = 5, maxTbRange = 0.12) {
    this.durMs = durMs; this.minSamples = minSamples; this.maxTbRange = maxTbRange;
    this.reset();
  }
  reset() { this.tbs = []; this.wrs = []; this.startMs = 0; this.result = null; this.issue = 'no-hand'; }
  progress(now) {
    if (this.result) return 1;
    return this.tbs.length ? Math.min(1, Math.max(0, (now - this.startMs) / this.durMs)) : 0;
  }
  update(bad, tb, wr, now) {
    if (this.result) return;
    if (bad || tb == null || wr == null) {
      this.issue = bad || 'no-hand'; this.tbs = []; this.wrs = [];
      return;
    }
    if (!this.tbs.length) this.startMs = now;
    this.tbs.push(tb); this.wrs.push(wr);
    if (Math.max(...this.tbs) - Math.min(...this.tbs) > this.maxTbRange) {   // 手在動 → 從這一幀重收
      this.issue = 'moving';
      this.tbs = [tb]; this.wrs = [wr]; this.startMs = now;
      return;
    }
    this.issue = null;
    if (now - this.startMs >= this.durMs && this.tbs.length >= this.minSamples) {
      this.result = { tb0: faMedian(this.tbs), wr0: faMedian(this.wrs) };
    }
  }
}

// ── ForearmTwistGate：ΔTb 鎖方向、掌寬比推轉角、超過容忍角就擋 ─────────
class FaTwistGate {
  constructor(tb0, wr0, tolDeg = 30, hystDeg = 8, latchTb = 0.15, unlockDeg = 20) {
    Object.assign(this, { tb0, wr0, tolDeg, hystDeg, latchTb, unlockDeg });
    this.recentTb = []; this.recentWr = [];
    this.latched = 0; this.blocked = false; this.twistDeg = 0; this.dTb = 0;
  }
  update(tb, wr) {
    this.recentTb.push(tb); if (this.recentTb.length > 5) this.recentTb.shift();
    this.recentWr.push(wr); if (this.recentWr.length > 5) this.recentWr.shift();
    const t = faMedian(this.recentTb), w = faMedian(this.recentWr);
    this.dTb = t - this.tb0;
    const theta = Math.acos(Math.min(1, Math.max(0, w / this.wr0))) * 180 / Math.PI;
    if (this.latched === 0 && Math.abs(this.dTb) > this.latchTb) this.latched = this.dTb > 0 ? 1 : -1;
    if (this.latched !== 0 && theta < Math.min(this.unlockDeg, this.tolDeg - this.hystDeg)) this.latched = 0;
    this.twistDeg = this.latched !== 0 ? theta : 0;
    if (this.blocked && this.twistDeg <= this.tolDeg - this.hystDeg) this.blocked = false;
    else if (!this.blocked && this.twistDeg > this.tolDeg) this.blocked = true;
    return !this.blocked;
  }
}

// ── ForearmPressTracker：另一隻手勾選的指尖離內關夠近就算按到 ──────────
class FaPressTracker {
  constructor(onCun = 0.7, offCun = 1.0, graceMs = 400) {
    Object.assign(this, { onCun, offCun, graceMs });
    this.reset();
  }
  reset() { this.held = false; this.lastSeenMs = 0; }
  update(distCun, now) {
    if (distCun == null) {
      if (this.held && now - this.lastSeenMs > this.graceMs) this.held = false;
      return this.held;
    }
    this.lastSeenMs = now;
    this.held = this.held ? distCun <= this.offCun : distCun <= this.onCun;
    return this.held;
  }
}

// ═══════════════════════════════════════════════════════════════════
// 相機與迴圈
// ═══════════════════════════════════════════════════════════════════
let faCamera = null, faVideo = null, faCanvas = null, faGateId = 'massage-gate';
let faCamRunning = false, faCamStarting = false, faCamWanted = false, faCamStartP = null;
let faFacing = 'user';
let faHandResults = null;           // js/vision.js onHandsResults 轉交過來
let faPoseResults = null;
let faPose = null, faInitP = null, faModelsReady = false;
let faCalibratedCb = null;          // 檢測完（打勾停完）要通知誰：按摩頁的 onForearmCalibrated

// 每次檢測重來就換一份（換鏡頭、重新進頁）
let fa = null;
function faResetState() {
  fa = {
    calib: new FaCalib(), gate: null, press: new FaPressTracker(),
    smooth: null, elbow: null, calibAt: 0, notified: false,
  };
  if (typeof onTarget !== 'undefined') onTarget = false;
}
faResetState();

function getPose() {
  if (faPose) return faPose;
  faPose = new Pose({ locateFile: (f) => mpAsset('pose', f) });
  faPose.setOptions({
    modelComplexity: 1,             // full（App 用 pose_landmarker_full.task）
    smoothLandmarks: false,         // 平滑交給 FA_EMA（同 App）
    enableSegmentation: true,       // 覆蓋邊界要遮罩
    smoothSegmentation: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  faPose.onResults((r) => { faPoseResults = r; });
  return faPose;
}

// ⚠️ Solutions API 兩個模型的 initialize() 不能同時跑（共用 wasm 載入器的全域變數，
//    forearm-lab.js 2026-09-25 實測會 Abort）→ 先等 Hands（可能在認穴頁預熱中），再載 Pose。
function faInitModels() {
  if (faInitP) return faInitP;
  if (typeof Pose === 'undefined' || typeof Hands === 'undefined') return Promise.reject(new Error('MediaPipe 腳本沒載到'));
  faInitP = (async () => {
    const h = getHands(), p = getPose();
    const init = (m) => typeof m.initialize === 'function' ? m.initialize() : undefined;
    await (typeof handsInitP !== 'undefined' && handsInitP ? handsInitP.catch(() => init(h)) : init(h));
    await init(p);
    faModelsReady = true;
  })();
  faInitP.catch(() => { faInitP = null; });
  return faInitP;
}

// 認穴頁預熱（同 warmUpHands 的用意：Pose 約 6MB，別等按下「開始定位」才抓）。
// 晚一點再開始，讓 warmUpHands 的 idle 那次先排進去、handsInitP 有值，兩邊才不會同時 initialize。
function warmUpForearm() {
  if (faInitP || typeof Pose === 'undefined') return;
  setTimeout(() => { faInitModels().catch(() => {}); }, 1800);
}

function setFaGate(kind, msg) {
  const el = document.getElementById(faGateId);
  if (!el) return;
  if (el.textContent !== msg) el.textContent = msg;
  el.className = 'readout gate-' + (kind === 'ok' ? 'ok' : kind === 'bad' ? 'bad' : 'warn');
}

/**
 * @param onCalibrated 檢測完、打勾停完時呼叫（按摩頁用來開始進頁倒數）
 */
async function startForearmCamera(canvasId, gateId, onCalibrated) {
  faCanvas = document.getElementById(canvasId);
  faGateId = gateId || 'massage-gate';
  faCalibratedCb = onCalibrated || null;
  faCamWanted = true;
  if (faCamRunning) return;
  if (faCamStartP) return faCamStartP;
  faCamStarting = true;
  setFaGate('warn', isZh() ? '啟動相機中…' : 'Starting camera…');
  faCamStartP = (async () => {
    let cam = null;
    try {
      // 手部、臉部那兩套共用同一個 <video>：先確定它們都收乾淨
      if (typeof stopCamera === 'function') stopCamera();
      if (typeof stopFaceCamera === 'function') stopFaceCamera();
      if (typeof camIdle === 'function') await camIdle();
      if (typeof faceCamIdle === 'function') await faceCamIdle();
      if (!faCamWanted) return;
      if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) {
        throw Object.assign(new Error('no mediaDevices'), { name: 'NoMediaDevices' });
      }
      faVideo = document.getElementById('hidden-video');
      const h = getHands();
      if (typeof applyHandsOptions === 'function') applyHandsOptions(h, 'massage');   // 兩隻手：被按的＋按的
      faInitModels().catch((e) => {
        console.error(e);
        if (faCamWanted) setFaGate('bad', (isZh() ? '模型載入失敗：' : 'Model failed to load: ') + (e && e.message ? e.message : e));
      });
      cam = faCamera = new Camera(faVideo, {
        onFrame: async () => {
          if (!faCamRunning) return;
          if (!faModelsReady) { faDrawPreview(); return; }
          faHandResults = null; faPoseResults = null;
          try {
            await h.send({ image: faVideo });
            if (!faCamRunning) return;
            await getPose().send({ image: faVideo });
          } catch (e) { return; /* 關閉瞬間的競態 */ }
          if (faCamRunning) faProcessFrame();
        },
        width: 640, height: 480, facingMode: faFacing,
      });
      await cam.start();
      if (!faCamWanted) {
        try { cam.stop(); } catch (e) {}
        if (faCamera === cam) faCamera = null;
        return;
      }
      faCamera = cam;
      faCamRunning = true;
      setFaGate('warn', faModelsReady ? t('fa-calib-title') : t('fa-loading'));
    } catch (err) {
      if (cam) { try { cam.stop(); } catch (e) {} if (faCamera === cam) faCamera = null; }
      if (faCamWanted) setFaGate('bad', typeof cameraErrorText === 'function' ? cameraErrorText(err) : String(err));
      console.error(err);
    } finally {
      faCamStarting = false;
      faCamStartP = null;
    }
  })();
  return faCamStartP;
}

function forearmCamIdle() { return faCamStartP || Promise.resolve(); }

function stopForearmCamera() {
  faCamWanted = false;
  faCamRunning = false;
  if (typeof onTarget !== 'undefined') onTarget = false;
  if (faCamera) { try { faCamera.stop(); } catch (e) {} faCamera = null; }
  if (faVideo && faVideo.srcObject) {
    faVideo.srcObject.getTracks().forEach(tr => tr.stop());
    faVideo.srcObject = null;
  }
}

/** 換鏡頭＝重新檢測（同 App：btn_flip → recalib） */
async function switchForearmCamera() {
  faFacing = faFacing === 'user' ? 'environment' : 'user';
  const c = faCanvas && faCanvas.id, g = faGateId, cb = faCalibratedCb;
  stopForearmCamera();
  faResetState();
  await forearmCamIdle();
  await startForearmCamera(c, g, cb);
}

/** 只重新檢測，不換鏡頭 */
function recalibForearm() { faResetState(); }

const forearmCalibrated = () => !!(fa && fa.calib.result);

// ── 畫布 ─────────────────────────────────────────────────────────────
function faFitCanvas() {
  const canvas = faCanvas;
  const vw = faVideo.videoWidth || 640, vh = faVideo.videoHeight || 480;
  const s = Math.min(1, 640 / Math.max(vw, vh));             // 同 vision.js CANVAS_MAX_EDGE（等比）
  const cw = Math.round(vw * s), ch = Math.round(vh * s);
  if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
  return { W: cw, H: ch, ctx: canvas.getContext('2d') };
}

function faDrawVideo(ctx, W, H) {
  ctx.save();
  if (faFacing === 'user') { ctx.translate(W, 0); ctx.scale(-1, 1); }
  ctx.drawImage(faVideo, 0, 0, W, H);
  ctx.restore();
}

function faDrawPreview() {
  if (!faCanvas || !faVideo) return;
  const { W, H, ctx } = faFitCanvas();
  faDrawVideo(ctx, W, H);
  setFaGate('warn', t('fa-loading'));
}

// 遮罩縮小再讀（Solutions 版遮罩有的放 alpha、有的放紅色通道，讀法同 forearm-lab.js flMaskAt）
let faMaskCanvas = null, faMaskCtx = null;
function faReadMask(mask, W, H) {
  if (!mask) return null;
  const s = Math.min(1, FA_MASK_MAX / Math.max(W, H));
  const mw = Math.round(W * s), mh = Math.round(H * s);
  if (!faMaskCanvas) {
    faMaskCanvas = document.createElement('canvas');
    faMaskCtx = faMaskCanvas.getContext('2d', { willReadFrequently: true });
  }
  if (faMaskCanvas.width !== mw || faMaskCanvas.height !== mh) { faMaskCanvas.width = mw; faMaskCanvas.height = mh; }
  faMaskCtx.clearRect(0, 0, mw, mh);
  faMaskCtx.drawImage(mask, 0, 0, mw, mh);
  const data = faMaskCtx.getImageData(0, 0, mw, mh).data;
  return (x, y) => {
    const mx = Math.round(x * mw / W), my = Math.round(y * mh / H);
    if (mx < 0 || my < 0 || mx >= mw || my >= mh) return null;   // 出畫面
    const i = (my * mw + mx) * 4, a = data[i + 3], r = data[i];
    return (a < 250 ? a : r) / 255 > FA_MASK_TH;
  };
}

function faBox(W, H) {
  const s = Math.min(W, H) * FA_BOX_FRAC;
  return { l: (W - s) / 2, t: (H - s) / 2, s };
}
function faInBox(pts, b) {
  const m = b.s * FA_BOX_SLACK;
  return pts.every(p => p.x >= b.l - m && p.x <= b.l + b.s + m && p.y >= b.t - m && p.y <= b.t + b.s + m);
}

/** 正方形檢測框：進度沿框走一圈，量好整框變綠（同 App ForearmViewport） */
function faDrawBox(ctx, b, progress, done, sc) {
  const r = 18 * sc, lw = 5 * sc;
  const path = () => {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(b.l, b.t, b.s, b.s, r); else ctx.rect(b.l, b.t, b.s, b.s);
  };
  ctx.save();
  ctx.lineWidth = lw;
  path(); ctx.strokeStyle = 'rgba(255,255,255,.33)'; ctx.stroke();
  const per = 4 * b.s - 8 * r + 2 * Math.PI * r;
  const len = per * (done ? 1 : progress);
  if (len > 0) {
    ctx.setLineDash([len, per + 1]);
    ctx.lineCap = 'round';
    path(); ctx.strokeStyle = done ? '#4FBF8B' : '#fff'; ctx.stroke();
  }
  ctx.restore();
}

// ── 每幀 ─────────────────────────────────────────────────────────────
function faProcessFrame() {
  const { W, H, ctx } = faFitCanvas();
  const now = performance.now();
  const mirror = faFacing === 'user';
  const mx = (x) => mirror ? W - x : x;
  const sc = typeof screenScale === 'function' ? screenScale(faCanvas) : 1;
  faDrawVideo(ctx, W, H);

  const hr = faHandResults || {}, pr = faPoseResults || {};
  const hands = hr.multiHandLandmarks || [];
  const sides = hr.multiHandedness || [];
  const worlds = hr.multiHandWorldLandmarks || [];
  const pose = pr.poseLandmarks && pr.poseLandmarks.length >= 33 ? pr.poseLandmarks : null;

  const pick = pose ? faPickTarget(pose, hands, fa.elbow) : null;
  const hp = pick ? hands[pick.hand] : null;
  let elbow = null;
  if (pick) {
    const e = pose[pick.elbow];
    if ((e.visibility == null || e.visibility >= FA_ELBOW_VIS) && e.x >= 0 && e.x <= 1 && e.y >= 0 && e.y <= 1) {
      elbow = { x: e.x * W, y: e.y * H };
    }
  }
  const dorsal = !!(hp && sides[pick.hand] && isDorsalView(hp, sides[pick.hand]));
  const tb = hp ? computeTwistTb(hp, W, H) : null;
  const wr = hp ? faWidthRatio(hp, W, H) : null;

  if (showSkeleton) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    hands.forEach(lm => (lm || []).forEach(p => { ctx.beginPath(); ctx.arc(mx(p.x * W), p.y * H, 3, 0, Math.PI * 2); ctx.fill(); }));
    if (elbow) { ctx.fillStyle = '#FFC800'; ctx.beginPath(); ctx.arc(mx(elbow.x), elbow.y, 5 * sc, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }

  const box = faBox(W, H);
  const showingDone = fa.calibAt && now - fa.calibAt < FA_CALIB_SHOW_MS;

  // ── ① 檢測 ──
  if (!fa.calib.result) {
    const bad = !hp ? 'no-hand'
      : !elbow ? 'no-elbow'
      : !faInBox([{ x: hp[0].x * W, y: hp[0].y * H }, elbow], box) ? 'out-box'
      : dorsal ? 'dorsal' : null;
    fa.calib.update(bad, tb, wr, now);
    if (fa.calib.result) {
      fa.gate = new FaTwistGate(fa.calib.result.tb0, fa.calib.result.wr0);
      fa.elbow = pick.elbow;                 // 鎖定這一側手臂：之後兩隻手都在畫面上也認得出哪隻是被按的
      fa.calibAt = now;
    }
    faDrawBox(ctx, box, fa.calib.progress(now), !!fa.calib.result, sc);
    if (fa.calib.result) setFaGate('ok', t('fa-calib-done'));
    else {
      const msg = { 'no-hand': 'fa-calib-title', 'no-elbow': 'fa-no-elbow', 'out-box': 'fa-out-box',
        dorsal: 'fa-dorsal', moving: 'fa-moving' }[fa.calib.issue];
      setFaGate(fa.calib.issue ? 'warn' : 'ok', msg ? faT(msg) : t('fa-calib-hold'));
    }
    onTarget = false;
    return;
  }
  if (showingDone) {
    faDrawBox(ctx, box, 1, true, sc);
    setFaGate('ok', t('fa-calib-done'));
    onTarget = false;
    return;
  }
  if (!fa.notified) {
    fa.notified = true;
    if (faCalibratedCb) setTimeout(faCalibratedCb, 0);
  }

  // ── ② 定位 ──
  const locIssue = !hp ? 'no-hand' : !elbow ? 'no-elbow' : dorsal ? 'dorsal' : null;
  const pass = (tb != null && wr != null) ? fa.gate.update(tb, wr) : false;
  const axis = (hp && elbow) ? faAxis(hp, elbow.x, elbow.y, W, H) : null;
  let point = null, cuts = [], r = null;
  if (!locIssue && pass && axis) {
    const inside = faReadMask(pr.segmentationMask, W, H);
    cuts = inside ? faMeasureCuts(inside, axis) : [];
    r = faRadiusCun(cuts);
    const th = faTwistWorldDeg(worlds[pick.hand], axis);
    const p = faNeiguan(axis, r != null ? r : FA_R_DEFAULT, th != null ? th : 0);
    const prev = fa.smooth;
    point = prev ? { x: FA_EMA * p.x + (1 - FA_EMA) * prev.x, y: FA_EMA * p.y + (1 - FA_EMA) * prev.y } : p;
  }
  fa.smooth = point;

  // ── ③ 按壓：另一隻手勾選的指尖中離內關最近那根 ──
  let tip = null, distCun = null;
  const presser = hands.find((h, i) => i !== (pick && pick.hand) && h && h.length >= 21) || null;
  if (point && axis && presser) {
    const tipIdx = typeof pressTipIdx === 'function' ? pressTipIdx() : [8];
    tipIdx.forEach(i => {
      const q = { x: presser[i].x * W, y: presser[i].y * H };
      const d = Math.hypot(q.x - point.x, q.y - point.y);
      if (!tip || d < tip.d) tip = { ...q, d };
    });
    if (tip) distCun = tip.d / axis.cun;
  }
  const on = fa.press.update(distCun, now) && !!point;
  onTarget = on;

  // ── 畫 ──
  if (showSkeleton) {
    ctx.save();
    ctx.strokeStyle = '#FFC800'; ctx.lineWidth = 2 * sc;
    cuts.forEach(c => { ctx.beginPath(); ctx.moveTo(mx(c.x1), c.y1); ctx.lineTo(mx(c.x2), c.y2); ctx.stroke(); });
    const label = 'r = ' + (r != null ? `${r.toFixed(2)} 寸（遮罩 ${cuts.length} 刀）` : `${FA_R_DEFAULT.toFixed(2)} 寸（預設，遮罩沒量到）`);
    ctx.font = `${12 * sc}px 'Microsoft JhengHei', sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(W / 2 - tw / 2 - 8 * sc, 14 * sc, tw + 16 * sc, 18 * sc);
    ctx.fillStyle = '#fff'; ctx.fillText(label, W / 2, 16 * sc);
    ctx.restore();
  }
  const discR = axis ? FA_PRESS_ON * axis.cun : 0;
  if (point) {
    const px = mx(point.x), py = point.y;
    if (showDisc) {
      ctx.save();
      ctx.beginPath(); ctx.arc(px, py, discR, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,229,160,.14)'; ctx.fill();
      ctx.strokeStyle = '#00E5A0'; ctx.lineWidth = 2 * sc; ctx.stroke();
      ctx.restore();
    }
    drawAcupoint(ctx, px, py, showAcuNames ? itemLabel('內關穴') : '', '#4FBF8B', appDotR(faCanvas), sc);
    if (tip) drawPresserTip(ctx, mx, tip, point, on, discR);
  }

  // ── 提示（一次只講一件事，順序同 App）──
  if (locIssue) setFaGate('warn', faT({ 'no-hand': 'fa-no-hand', 'no-elbow': 'fa-no-elbow', dorsal: 'fa-dorsal' }[locIssue]));
  else if (fa.gate.blocked && fa.gate.latched > 0) setFaGate('warn', t('fa-twist-pinky'));
  else if (fa.gate.blocked && fa.gate.latched < 0) setFaGate('warn', t('fa-twist-thumb'));
  else if (!point) setFaGate('warn', t('fa-no-hand'));
  else if (!presser) setFaGate('warn', t('massage-hint'));
  else setFaGate(on ? 'ok' : 'bad', t(on ? 'fa-on' : 'fa-off'));
}

// 翻譯 key 寫成字面值給 tests/check.js 掃（上面查表拼出來的它看不到）
function faT(key) {
  switch (key) {
    case 'fa-calib-title': return t('fa-calib-title');
    case 'fa-no-elbow': return t('fa-no-elbow');
    case 'fa-out-box': return t('fa-out-box');
    case 'fa-dorsal': return t('fa-dorsal');
    case 'fa-moving': return t('fa-moving');
    case 'fa-no-hand': return t('fa-no-hand');
    default: return t(key);
  }
}

window.addEventListener('pagehide', stopForearmCamera);
// 2026-10-01 用戶：「網頁每次切個桌面我的鏡頭畫面就卡了」—— 以前切走只關不開，
//   回來畫面停在最後一幀。→ 切走時記下正在用的畫布，切回來（畫布還在畫面上）就重開。
let faResume = null;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    faResume = (faCamWanted || faCamRunning) && faCanvas ? { id: faCanvas.id, gate: faGateId, cb: faCalibratedCb } : null;
    stopForearmCamera();
  } else if (faResume) {
    const r = faResume; faResume = null;
    const el = document.getElementById(r.id);
    if (el && el.offsetParent !== null) startForearmCamera(r.id, r.gate, r.cb);
  }
});
