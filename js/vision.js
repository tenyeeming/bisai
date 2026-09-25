// ═══════════════════════════════════════════════════════════════════
// 相機與主偵測迴圈
//
// 定位頁（04）與按摩頁（05）共用同一個 MediaPipe 實例與同一個迴圈，
// 差別只在 renderMode：
//   'locate'  — 只畫穴位與信心圓盤
//   'massage' — 另外檢查「另一隻手」的指尖有沒有對準
//
// ⚠️ 這支不要改定位公式。公式在 js/acu-math.js（正式版的複本，改了要同步回去）。
// ═══════════════════════════════════════════════════════════════════

let hands = null, camera = null, video = null;
let camRunning = false, camStarting = false;
// 相機「啟動中」的保護（2026-09-23 修「相機容易打不開」）：
//   camera_utils 的 stop() 只停「已經拿到」的串流。權限視窗還沒按、或鏡頭還在開的時候
//   就切頁／切背景，stop() 等於沒做，等 getUserMedia 回來就變成沒人管的殭屍串流，
//   一直佔著鏡頭 —— Android 同一時間只准一條，下一次開相機就 NotReadableError。
//   ⇒ camWanted 記「現在到底要不要相機」，啟動完才看；camStartP 讓重複呼叫等同一次啟動。
let camWanted = false, camStartP = null;
let facingMode = 'user';
let showDisc = true;
let activeCanvas = null;
let renderMode = 'locate';          // 'locate' | 'massage'
let onTarget = false;               // 指尖是否對準（按摩頁計時用）
// 對位判定的遲滯記憶（2026-09-23 對齊 App locate/AcuMath.kt 的 tolIn/tolOut）。
// 只有「上一幀有走到按摩對位判定、而且判為對準」才是 true；任何一幀沒走到判定就歸零，
// 所以手離開畫面、閘門擋下、換頁都不會把舊狀態帶過去。
let pressWasOn = false;
const PRESS_TOL_OUT_RATIO = 1.6;    // 已對準時，離開要超出 tolIn × 1.6 才算離開
// ⭐ 2026-09-25 用戶：「計時一直斷斷續續、很難判定為對準」。兩個原因：
//   ① 手指壓上去會遮住被按的手，MediaPipe 常掉一兩幀 → 以前掉一幀就暫停、遲滯記憶也歸零。
//      改成：最後一次對準後 PRESS_GRACE_MS 內仍算對準（計時與遲滯都吃這段寬限）。
//   ② lm[8] 在指甲尖端、不是指腹 —— 指腹壓在穴上時，指尖點本來就離穴 5～10mm。
//      同一天第一版把半徑放大到 0.6 寸來補，用戶說「怪怪的」：手指還沒碰到圓盤就變綠、
//      移開約 1 寸（tolOut＝0.96 寸）還算按著。第二版改成**量指腹**（見 pressPoints），
//      半徑縮回跟畫面上的信心圓盤一樣（CONF_DISC_CUN），看到的圈＝判定的圈。
//   ⚠️ 這兩條還沒進 App（新功能先網頁流程），App 仍是只量指尖、無寬限。
const PRESS_GRACE_MS = 600;
// 指腹＝指尖往遠端指節（tip−1：拇指 IP、其他 DIP）退 35%。指尖與指腹都算，取近的 ——
// 垂直戳的人靠指尖、平壓的人靠指腹，兩種按法都認。
const PRESS_PAD_T = 0.35;
function pressPoints(lm, tipIdx, W, H) {
  const out = [];
  tipIdx.forEach(i => {
    const t = lm[i], d = lm[i - 1];
    out.push({ x: t.x * W, y: t.y * H });
    out.push({ x: (t.x + (d.x - t.x) * PRESS_PAD_T) * W, y: (t.y + (d.y - t.y) * PRESS_PAD_T) * H });
  });
  return out;
}
let pressLastOnAt = 0;
// ⭐ 2026-09-25 遮擋推定（拇指按壓）：拇指按下去後按摩手整隻藏在被按的手後面，
//    MediaPipe 只看到一隻手。條件全成立才繼續算「按著」：
//      ① 按摩手消失前最後一次看到時是對準的（occludeAnchor 有值）
//      ② 被按的手還在、穴位離當時的位置不超過離開判定圈（tol × PRESS_TOL_OUT_RATIO）
//      ③ 距最後一次真的看到對準不超過 OCCLUDE_MAX_MS
//    按摩手重新出現就回到正常量距離；沒對準立刻停。
//    ⚠️ 代價：這段期間手指其實移開了也照算（只要被按的手沒動）。③ 是上限，
//       超過就要讓按摩手露出一下重新確認。OCCLUDE_MAX_MS 是估的，沒實機調過。
const OCCLUDE_MAX_MS = 15000;
let occludeAnchor = null;           // { x, y, tol, at }：最後一次真的對準時的穴位與判定圈
// 施密特遲滯：進入用 tolIn，已對準時要超出 tolOut 才判離開（同 App AcuMath.press）。
function pressOnTarget(minD, tolIn, wasOn) {
  return wasOn ? minD <= tolIn * PRESS_TOL_OUT_RATIO : minD <= tolIn;
}

// 手機版與 App 共用的顯示層穩定化。判定仍吃原始 pts，只有畫面上的點／圓盤吃平滑值。
const isMobileWeb = () => typeof matchMedia === 'function' &&
  matchMedia('(max-width: 599px), ((max-height: 599px) and (pointer: coarse))').matches;
class OneEuroFilter {
  constructor(minCutoff = 1, beta = 0.1, dCutoff = 1) {
    this.minCutoff = minCutoff; this.beta = beta; this.dCutoff = dCutoff; this.started = false;
  }
  filter(x, dt) {
    if (!this.started || dt <= 0) {
      this.started = true; this.xHat = this.xPrev = x; this.dxHat = 0; return x;
    }
    const alpha = cutoff => 1 / (1 + (1 / (2 * Math.PI * cutoff)) / dt);
    const dx = (x - this.xPrev) / dt;
    this.dxHat = alpha(this.dCutoff) * dx + (1 - alpha(this.dCutoff)) * this.dxHat;
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dxHat);
    this.xHat = alpha(cutoff) * x + (1 - alpha(cutoff)) * this.xHat;
    this.xPrev = x;
    return this.xHat;
  }
}
class AcuPointSmoother {
  constructor() { this.reset(); }
  reset() { this.filters = []; this.lastAt = 0; }
  smooth(pts, at) {
    if (!pts.length) { this.reset(); return pts; }
    const dt = this.lastAt ? (at - this.lastAt) / 1000 : 0;
    this.lastAt = at;
    if (this.filters.length !== pts.length || dt > .5) {
      this.filters = pts.map(() => [new OneEuroFilter(), new OneEuroFilter()]);
    }
    return pts.map((p, i) => ({
      x: this.filters[i][0].filter(p.x, dt),
      y: this.filters[i][1].filter(p.y, dt),
    }));
  }
}
const acuPointSmoother = new AcuPointSmoother();

const median = values => {
  const sorted = [...values].sort((a, b) => a - b), m = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
};
class TwistTracker {
  constructor() { this.reset(); }
  reset() { this.baseline = []; this.recent = []; this.active = false; }
  update(tb, tilt, blocked) {
    if (tb == null) { this.recent = []; return null; }
    this.recent.push(tb); if (this.recent.length > 5) this.recent.shift();
    const smooth = median(this.recent);
    if (!blocked && tilt <= 15) {
      this.baseline.push(tb); if (this.baseline.length > 40) this.baseline.shift();
    }
    if (this.baseline.length < 8) return null;
    const delta = smooth - median(this.baseline);
    this.active = this.active ? Math.abs(delta) > .14 : Math.abs(delta) > .20;
    return this.active ? (delta > 0 ? 'pinky' : 'index') : null;
  }
}
const twistTracker = new TwistTracker();

function computeTwistTb(lm, W, H) {
  if (!lm || lm.length < 21) return null;
  const ax = lm[0].x * W, ay = lm[0].y * H;
  const ux = lm[9].x * W - ax, uy = lm[9].y * H - ay;
  const len = Math.hypot(ux, uy); if (len < 1e-6) return null;
  const dist = p => Math.abs(ux * (p.y * H - ay) - uy * (p.x * W - ax)) / len;
  const d5 = dist(lm[5]), d17 = dist(lm[17]), sum = d5 + d17;
  return sum < 1e-6 ? null : (d5 - d17) / sum;
}

function drawTwistArrow(ctx, W, H, side, lm, mx) {
  if (!side || !isMobileWeb()) return;
  const indexX = mx(lm[5].x * W), pinkyX = mx(lm[17].x * W);
  // 🔴 2026-09-24 用戶：「箭頭左右是不是用反了」。'pinky' ＝ 小指側被壓扁、要轉回來，
  //    這時掌面朝鏡頭那一面是往**食指側**滑（轉門把），箭頭畫的是掌面滑的方向 → 指向食指。
  //    判定（TwistTracker）不動，只翻畫的方向；與 App AcuCameraView 同步。
  const towardPinky = side !== 'pinky';
  const dir = ((towardPinky ? pinkyX - indexX : indexX - pinkyX) >= 0) ? 1 : -1;
  const len = W * .30, cx = W / 2, cy = H / 2, x0 = cx - dir * len / 2;
  const tip = x0 + dir * len, neck = tip - dir * len * .36;
  const headHalf = len * .26, shaftHalf = len * .137;
  ctx.save(); ctx.globalAlpha = .35; ctx.beginPath();
  ctx.moveTo(x0, cy - shaftHalf); ctx.lineTo(neck, cy - shaftHalf);
  ctx.lineTo(neck, cy - headHalf); ctx.lineTo(tip, cy);
  ctx.lineTo(neck, cy + headHalf); ctx.lineTo(neck, cy + shaftHalf);
  ctx.lineTo(x0, cy + shaftHalf); ctx.closePath();
  ctx.fillStyle = '#4ADE80'; ctx.fill();
  ctx.strokeStyle = '#06101F'; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke(); ctx.restore();
}

// 單一共用實例：每次進頁重建會重載 wasm，又慢又漏
function getHands() {
  if (hands) return hands;
  hands = new Hands({
    locateFile: (f) => mpAsset('hands', f),      // 本機或 CDN，見 js/mp-loader.js
  });
  hands.onResults(onHandsResults);
  return hands;
}

// ⚡ 手數依頁面而定（2026-08-13 效能）：
//   定位頁只挑「一隻目標手」（見下面的 best 迴圈），第二隻手的 landmark 推論
//   算完就丟 —— 而 landmark 推論是每幀最貴的一筆，手數砍半＝推論量砍半。
//   按摩頁才真的需要兩隻（被按的手 + 按的手）。
//   ⚠️ 這是純效能改動：定位頁本來就只用 best 那一隻，輸出座標完全不變。
// ⭐ 2026-09-25 按摩頁門檻降到 0.4：用拇指按時，按摩手的手掌與四指繞到被按的手後面，
//    鏡頭只看得到一根拇指 → 0.6 下整隻手偵測不到（用戶實測提示「請把另一隻手也放進畫面」）。
//    降門檻只能救「露出一部分」的情況；整隻被擋住的由下面的遮擋推定（OCCLUDE_*）接手。
let handsNumConfigured = null;
function applyHandsOptions(h, mode) {
  const n = mode === 'massage' ? 2 : 1;
  if (handsNumConfigured === n) return;         // setOptions 會重配 graph，別每幀呼叫
  const conf = n === 2 ? 0.4 : 0.6;
  h.setOptions({
    maxNumHands: n,
    modelComplexity: 1,           // ⚠️ 不要為了流暢降成 0：lite 模型的 landmark 誤差
                                  //    會直接進到 v35 公式，而本專案的閾值是 2mm。
    minDetectionConfidence: conf,
    minTrackingConfidence: conf,
  });
  handsNumConfigured = n;
}

// ⚡ 預熱（2026-08-13）：MediaPipe 首次使用要抓 ~16MB（wasm 6.1MB + packed assets 4.2MB
//    + hand_landmark_full.tflite 5.4MB），手機 4G 上要 10~30 秒。原本這件事發生在
//    使用者按下「開始定位」的那一刻 —— 體感就是「點下去卡死」。
//
//    改成在**認穴頁**（步驟三）就先在背景載好：使用者在那頁讀定位說明、看參考圖
//    通常要 5~15 秒，剛好把載入藏起來。等他按下一步時模型已經在記憶體裡。
//
//    ⚠️ 這不會開啟相機，也不會畫任何東西（onHandsResults 開頭就擋掉 camRunning=false）。
//    ⚠️ 純載入時機改動，跟定位公式與精度完全無關。
let handsWarmed = false;
function warmUpHands() {
  if (handsWarmed || typeof Hands === 'undefined') return;
  handsWarmed = true;
  // 用 idle 時段做，別跟頁面切換動畫搶主執行緒
  const go = () => {
    try {
      const h = getHands();
      if (typeof h.initialize === 'function') {
        h.initialize().catch(() => {});          // 失敗就算了，等使用者真的進定位頁再載一次
      }
    } catch (e) { /* 預熱失敗不能影響 UI */ }
  };
  if (typeof requestIdleCallback === 'function') requestIdleCallback(go, { timeout: 1500 });
  else setTimeout(go, 300);
}

async function startCamera(canvasId, mode) {
  renderMode = mode;
  activeCanvas = document.getElementById(canvasId);
  // 定位頁 → 按摩頁是「相機不停、只換模式」，會走下面的 early return，
  // 所以手數要在這裡先調整，不能等到 getHands() 之後
  if (hands) applyHandsOptions(hands, mode);
  camWanted = true;
  if (camRunning) return;                  // 已在跑就只換畫布/模式
  if (camStartP) return camStartP;         // 啟動中：等同一次，不另開一條
  camStarting = true;
  setGate('warn', isZh() ? '啟動相機中…' : 'Starting camera…');
  camStartP = (async () => {
    let cam = null;
    try {
      // 臉部頁跟這裡共用 hidden-video，它若還在啟動中要先等它收完
      if (typeof faceCamIdle === 'function') await faceCamIdle();
      if (!camWanted) return;
      if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) {
        throw Object.assign(new Error('no mediaDevices'), { name: 'NoMediaDevices' });
      }
      video = document.getElementById('hidden-video');
      const h = getHands();
      applyHandsOptions(h, renderMode);
      cam = new Camera(video, {
        onFrame: async () => {
          if (!camRunning) return;
          try { await h.send({ image: video }); } catch (e) { /* 關閉瞬間的競態 */ }
        },
        width: 640, height: 480, facingMode,
      });
      camera = cam;
      await cam.start();            // camera_utils 沒有 initialize()，只有 start()
      if (!camWanted) {             // 啟動途中已被關（切頁／切背景）：自己收掉，不留殭屍串流
        try { cam.stop(); } catch (e) {}
        if (camera === cam) camera = null;
        return;
      }
      camera = cam;                 // 途中 stop 過又被叫回來時，camera 已被清成 null
      camRunning = true;
    } catch (err) {
      if (cam) { try { cam.stop(); } catch (e) {} if (camera === cam) camera = null; }
      if (camWanted) setGate('bad', cameraErrorText(err));
      console.error(err);
    } finally {
      camStarting = false;
      camStartP = null;
    }
  })();
  return camStartP;
}

// 別人要用鏡頭前，等這邊的啟動收完（成功或被取消都算）
function camIdle() {
  return camStartP || Promise.resolve();
}

// 相機錯誤翻成看得懂、知道下一步做什麼的話（手部、臉部共用）
function cameraErrorText(err) {
  const zh = isZh();
  const name = (err && err.name) || '';
  if (name === 'NoMediaDevices') {
    return zh ? '這個網址不能開相機：請用 https:// 開頭的網址（本機用 localhost）。'
              : 'Camera needs an https:// address (or localhost).';
  }
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') {
    return zh ? '相機權限被拒絕：點網址列左邊的圖示 → 權限 → 相機改「允許」，再重新整理。'
              : 'Camera permission denied: allow camera in site settings, then reload.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
    return zh ? '鏡頭被佔用：關掉其他正在用相機的 App 或分頁，再重新進這頁。'
              : 'Camera is busy: close other apps/tabs using it, then re-open this page.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'DevicesNotFoundError') {
    return zh ? '找不到可用的鏡頭，試試切換前／後鏡頭。'
              : 'No usable camera found. Try switching front/back camera.';
  }
  return (zh ? '相機啟動失敗：' : 'Camera failed: ') + (err && err.message ? err.message : err);
}

function stopCamera() {
  camWanted = false;                // 啟動中的那次回來時會看到，自己收掉
  camRunning = false;
  onTarget = false;
  occludeAnchor = null;
  acuPointSmoother.reset();
  twistTracker.reset();
  if (camera) { try { camera.stop(); } catch (e) {} camera = null; }
  if (video && video.srcObject) {
    video.srcObject.getTracks().forEach(tr => tr.stop());
    video.srcObject = null;
  }
  // 不呼叫 hands.close()：實例留著重用，下次進頁不必重載 wasm
}

async function switchCamera() {
  facingMode = facingMode === 'user' ? 'environment' : 'user';
  const canvasId = renderMode === 'massage' ? 'massage-canvas' : 'video-canvas';
  stopCamera();
  await startCamera(canvasId, renderMode);
}

// 讀數條：定位頁與按摩頁各有一條，依現在的模式挑
function setGate(kind, msg) {
  const el = document.getElementById(renderMode === 'massage' ? 'massage-gate' : 'camera-gate');
  if (!el) return;
  el.textContent = msg;
  el.className = 'readout gate-' + (kind === 'ok' ? 'ok' : kind === 'bad' ? 'bad' : 'warn');
  // 提示列每一幀都會更新，順路把數據面板也刷新 —— 迴圈裡有七、八個 return 點，
  // 在每一個後面補一次 render 遲早會漏掉一個（漏掉的症狀是「數字卡在上一幀」）。
  renderLiveStats();
}

// ── 即時數據面板（2026-09-20，桌面版型才顯示）──────────────────────
// 用戶：「電腦屏幕太大沒辦法適配」。結論是不追著填滿跑，把大螢幕多出來的空間
// 拿去顯示**系統本來就在算、但手機上沒地方放**的數字 —— 那正是評審要看的技術證據。
//
// ⚠️ 這裡**一個數字都不是新算的**，全部取自同一幀既有的判定結果：
//    conf/tilt/angle 來自閘門那三段，距離來自按摩模式的 minD。
//    所以面板與畫面必然一致，不會出現「圈說對準了、數字說差 5mm」。
// ⚠️ `null` 一律顯示 —— 代表「這一幀沒得算」，不要拿 0 充數。
const liveStats = { conf: null, tilt: null, angle: null, limit: null, distMm: null, on: false };

function resetLiveStats() {
  liveStats.conf = liveStats.tilt = liveStats.angle = liveStats.limit = liveStats.distMm = null;
  liveStats.on = false;
}

function renderLiveStats() {
  const box = document.getElementById(renderMode === 'massage' ? 'massage-stats' : 'camera-stats');
  if (!box) return;
  const put = (k, txt, cls) => {
    const el = box.querySelector('[data-k="' + k + '"]');
    if (!el) return;
    el.textContent = txt;
    if (cls !== undefined) el.className = 'v' + (cls ? ' ' + cls : '');
  };
  put('conf', liveStats.conf == null ? '—' : Math.round(liveStats.conf * 100) + '%');
  put('tilt', liveStats.tilt == null ? '—' : Math.round(liveStats.tilt) + '°');
  put('angle', liveStats.angle == null ? '—'
    : Math.round(liveStats.angle) + '°' + (liveStats.limit == null ? '' : ' / ' + liveStats.limit + '°'));
  put('dist', liveStats.distMm == null ? '—' : liveStats.distMm.toFixed(1) + ' mm',
    liveStats.distMm == null ? '' : (liveStats.on ? 'ok' : 'warn'));
}

// ═══════════════════════════════════════════════════════════════════
// 主偵測迴圈：每一幀都會跑
// ═══════════════════════════════════════════════════════════════════
function onHandsResults(results) {
  // ⭐ 臉部按摩模式（2026-09-04）：這一幀的手只是拿來判「有沒有真的貼到臉」，
  //    畫面完全由 js/face-vision.js 負責（那邊才有臉的 landmark）。
  //    所以這裡只交出 landmark 就走人 —— 兩個模型同時跑，但只有一個在畫。
  //    ⚠️ 擋在最前面：這時候 camRunning 是 false（相機由 face-vision 開的），
  //       走下去只會被下一行的 early return 吃掉，手就永遠傳不過去。
  if (typeof faceMode !== 'undefined' && faceMode === 'massage' && faceCamRunning) {
    const hs = results.multiHandLandmarks || [];
    faceHandLm = hs.length ? hs[0] : null;
    return;
  }

  const canvas = activeCanvas;
  if (!canvas || !camRunning) return;
  const prevPressOn = pressWasOn || (performance.now() - pressLastOnAt < PRESS_GRACE_MS);
  pressWasOn = false;

  // 畫布尺寸必須跟著影像走，否則 landmark(0~1) × W/H 全部算錯位置。
  //
  // ⚡ 2026-08-13 效能：640×480 是 getUserMedia 的 **ideal 不是 exact**，很多手機
  //    （尤其前鏡頭）會回 1280×720 甚至更高。那時每幀 clearRect + drawImage 的
  //    像素量是 3 倍以上，而 MediaPipe 內部無論餵多大都會縮到 ~224×224 去推論
  //    —— 多出來的解析度對定位精度毫無幫助，純浪費。所以這裡設一個上限。
  //
  // ⚠️ 只做**等比**縮小，長寬比一個像素都不能改：
  //    acu-math.js 的 _cv() 是 x,z 乘 W 而 y 乘 H（見該檔註釋③），
  //    等比縮放時三軸同倍數 → 法向量方向不變 → conf / angleDeg 完全相同；
  //    但長寬比一改（例如硬塞成 4:3）法向量就會歪，閘門判定跟著錯。
  //    （Math.round 帶來的比例誤差 < 0.1%，換算 angleDeg < 0.05°。）
  const CANVAS_MAX_EDGE = 640;
  const vw = video.videoWidth || 640, vh = video.videoHeight || 480;
  const s = Math.min(1, CANVAS_MAX_EDGE / Math.max(vw, vh));
  const cw = Math.round(vw * s), ch = Math.round(vh * s);
  if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
  const W = canvas.width, H = canvas.height;
  // alpha:false —— 這塊畫布每幀都被影像整片蓋滿，不需要跟底下的東西做透明合成
  const ctx = canvas.getContext('2d', { alpha: false });

  // 前鏡頭要鏡像，使用者才會覺得畫面裡的手跟自己的手同一邊（照鏡子）。
  // 後鏡頭是「看別人」，鏡像反而不對。
  // ⚠️ 只鏡射「畫面」，landmark 座標一律維持原樣 —— 正反面判定、傾角、
  //    公式都吃原始座標，動了它們等於改定位邏輯。
  const mirror = facingMode === 'user';
  const mx = (x) => mirror ? W - x : x;
  const flip = () => { if (mirror) { ctx.translate(W, 0); ctx.scale(-1, 1); } };

  ctx.clearRect(0, 0, W, H);
  ctx.save();
  flip();
  // ⚡ 2026-08-13 效能：這裡**刻意不用 results.image**。
  //    results.image 是 MediaPipe 內部那張 WebGL canvas，把它畫進 2D canvas 會強迫
  //    瀏覽器做一次 GPU→CPU 同步讀回（pipeline stall），行動 GPU 上特別貴。
  //    直接畫 <video> 的內容一模一樣，而且走的是硬體解碼器的快路徑。
  ctx.drawImage(video, 0, 0, W, H);
  ctx.restore();

  const allHands = results.multiHandLandmarks || [];
  const allSides = results.multiHandedness || [];
  if (allHands.length === 0) {
    acuPointSmoother.reset();
    resetLiveStats();
    setGate('warn', isZh() ? '請將手放入畫面中' : 'Put your hand in frame');
    onTarget = false;
    return;
  }

  const name = curAcuName();
  if (!name) return;
  const acu = ACUPOINTS.find(a => a.name === name);
  const needDorsal = acu && acu.side === 'dorsal';
  const bilateral = BILATERAL_ACUPOINTS.has(name);

  // ── 這一輪「必須」是哪隻手（2026-09-24 對齊 App 的 requireHand）──
  //    用戶：「左右手判斷太糟糕了，參考 app 的做法」。原本只看正反面＋信心挑目標手，
  //    完全不管這一輪是左手還是右手 —— 兩隻手都在畫面上時，常挑到負責按的那隻。
  //    App（MassageScreen.kt requiredHandLabels ＋ AcuCameraView.kt requireHand）是：
  //    只認這一輪那隻手的標籤，找不到就**不畫**並提示，不遞補。
  //    ⚠️ 網頁是 Solutions API ＋ 未鏡像畫面：標籤 'Left' ＝ 真實右手
  //       （同 App AcuBridge.kt 的註解；isDorsalView 也是照這個約定寫的）。
  //    只在按摩頁、而且有分左右兩輪時才限定；定位頁與臉部單輪照舊。
  const requireLabel = (renderMode === 'massage' && typeof hasRounds === 'function' && hasRounds()
                        && typeof curHandKey === 'function')
    ? (curHandKey() === 'hand-right' ? 'Left' : 'Right') : null;

  // ── 挑「目標手」：正反面通過優先，其次信心最高 ──
  let best = null;
  for (let i = 0; i < allHands.length; i++) {
    const lm = allHands[i], handedness = allSides[i];
    if (!lm || lm.length < 21 || !handedness) continue;
    if (requireLabel && handedness.label !== requireLabel) continue;   // 不是這一輪的手
    const dorsal = isDorsalView(lm, handedness);
    const sideOk = bilateral || (needDorsal === dorsal);
    // computeAcuGate 內部就會呼叫 computeAcuConfidence，拿 gate 順便就有 info，不必算兩次
    const gate = computeAcuGate(name, lm, W, H);
    const info = gate ? gate.info : null;
    const conf = info ? info.conf : 0;
    const score = (sideOk ? 10 : 0) + conf;
    if (!best || score > best.score) best = { i, lm, handedness, dorsal, sideOk, info, gate, conf, score };
  }
  if (!best && requireLabel) {
    // 同 App 的 massage_wrong_hand：舉錯手還照畫，等於指著一個現在不該按的位置
    acuPointSmoother.reset();
    const hand = t(curHandKey());
    setGate('bad', isZh()
      ? `這一輪要按${hand} — 現在鏡頭裡的不是那一隻，位置先不顯示`
      : `This round is the ${hand}. That is not the hand in view, so the position is hidden.`);
    onTarget = false;
    return;
  }
  if (!best) {
    setGate('warn', isZh() ? '手部偵測不穩' : 'Unstable detection');
    onTarget = false;
    return;
  }

  // ── 閘門一：正反面 ──
  if (!best.sideOk) {
    setGate('bad', isZh()
      ? `偵測到${best.dorsal ? '手背' : '手心'}，${name}在${needDorsal ? '手背' : '手心'}，請翻面`
      : `Detected ${best.dorsal ? 'back of hand' : 'palm'}; this point is on the ${needDorsal ? 'back' : 'palm'}. Flip your hand.`);
    onTarget = false;
    return;
  }

  // ── 閘門二：傾角（嚴格模式擋下，非嚴格也要照實說）──
  // ⚠ 2026-08-12：這道全域門檻只管 palm 類穴道。side 類（二間/後溪/陽谷…）長在側緣，
  //   **手刀才是它們的最佳視角**，掌面偏離 ~90° 是正常的；擋下等於誤殺它們最準的那批幀。
  //   它們改由閘門三（自己的 ACU_ANGLE_LIMIT）管。
  //   ⭐ 2026-08-18：tip 類（指端穴，目前只有中衝）也一併放行，理由與 side 完全相同 ——
  //   **指尖對著鏡頭才是它的最佳視角**，而那個姿勢下手掌必然遠超 25°。
  //   實測（真實 landmark 繞 x 軸旋轉模擬）：中指從朝上轉到朝鏡頭時，中衝的圓盤
  //   本來就會從 59×9px 的線張開成 59×57px 的正圓 —— 但手掌傾角同時從 11° 升到 79°，
  //   從 45° 起就被這道閘門整頁擋掉，使用者根本看不到圓盤張開的過程，
  //   只會覺得「指尖明明對著鏡頭了，圓盤卻沒有變成正對」。
  const gateKind = best.gate ? best.gate.kind : 'palm';
  const skipPalmTilt = gateKind === 'side' || gateKind === 'tip';
  // 數據面板：信心度與整手傾角都是這一幀既有的判定值，不是另外算的
  liveStats.conf = best.info ? best.info.conf : null;
  const tiltDeg = computeHandTiltDeg(best.lm);
  liveStats.tilt = tiltDeg;
  const tiltBad = tiltDeg > TILT_MAX_DEG && !skipPalmTilt;
  if (tiltBad && strictGate) {
    setGate('bad', isZh()
      ? `傾斜 ${Math.round(tiltDeg)}° > ${TILT_MAX_DEG}°　定位不可靠，請轉正`
      : `Tilt ${Math.round(tiltDeg)}° > ${TILT_MAX_DEG}° — unreliable. Straighten your hand.`);
    onTarget = false;
    return;
  }

  const pts = computeAcupoint(name, best.lm, W, H, best.handedness);
  if (!pts || !pts.length) {
    acuPointSmoother.reset();
    setGate('warn', isZh() ? '無法計算此穴位置' : 'Cannot compute this acupoint');
    onTarget = false;
    return;
  }

  const cunPx = computeCunPx(best.lm, W, H);
  const r = acupointRadius(cunPx);
  const discR = CONF_DISC_CUN * cunPx;

  // 圓盤的形狀是 3D 基底投影出來的多邊形，整組頂點都要跟著翻，
  // 所以走 transform 而不是只翻中心點。
  //
  // ⭐ 2026-08-18：閘門擋下時**圓盤照畫、只有穴道點不畫**（用戶要求）。
  //    圓盤是「該往哪轉」的唯一視覺線索 —— 它貼在皮膚上，手一轉就被壓扁，
  //    扁成一條線＝正在切著看，轉回來就變回正圓。連它一起藏掉，使用者只剩一行字，
  //    根本不知道自己離「轉對」還有多遠。擋下時改用降級樣式（虛線、幾乎不填色），
  //    語意是「這塊皮膚朝哪」而不是「穴道就在這裡」。
  const gateBlocked = !!(best.gate && best.gate.blocked);
  const twistSide = twistTracker.update(computeTwistTb(best.lm, W, H), tiltDeg, gateBlocked);
  const drawPts = isMobileWeb() ? acuPointSmoother.smooth(pts, performance.now()) : pts;
  if (gateBlocked) drawTwistArrow(ctx, W, H, twistSide, best.lm, mx);

  // ⭐ tip 類把圓盤沿骨軸往指尖外推（見 TIP_DISC_OFFSET_CUN）。
  //    法向量的 (x, y) 分量本來就是「骨軸投影在畫面上」的方向與長度（_cv 已經把
  //    x 乘 W、y 乘 H，都是像素），所以直接乘上去就是正確的正投影位移 ——
  //    指尖轉向鏡頭時投影自然縮到 0，不需要任何額外判斷。
  //    ⚠️ **只移動圓盤，穴道點仍然畫在 lm[12]**：那是 WHO 定義的位置，不能為了好看而挪。
  let discDX = 0, discDY = 0;
  if (best.info && best.info.kind === 'tip') {
    const off = TIP_DISC_OFFSET_CUN * cunPx;
    discDX = off * best.info.normal.x;
    discDY = off * best.info.normal.y;
  }

  // ⭐ 圓盤中心那顆白點就是穴道座標，所以**圓盤畫在點上、不再另外畫大光暈點**。
  //    tip 類的外推只推圓盤外框、不推白點 —— 白點必須留在 lm[12]。
  if (showDisc && best.info) {
    ctx.save();
    flip();
    drawPts.forEach(p => {
      drawConfidenceDisc(ctx, p.x + discDX, p.y + discDY, discR, best.info,
        { degraded: gateBlocked, centerAt: { x: p.x, y: p.y } });
    });
    ctx.restore();
  }
  // 標籤不能被鏡射成反字，所以這裡不用 transform，改成把 x 座標自己翻過去畫。
  //
  // ⭐ 2026-08-18【規格改寫】用戶原話：**「反正就要做到在某些角度上也可以看出
  //    正確位置在哪裏」**。舊寫法在 `gateBlocked` 時**整個點都不畫**，直接違反這條 ——
  //    使用者在斜角時看到的是「位置消失了」，而他要的正是那時候還看得見位置。
  //
  //    改成照 `網頁版3d` 的分工：
  //      **圓盤中心的白點** → 位置（永遠都在，不管扁成什麼樣、有沒有降級）
  //      **圓盤的形狀與顏色** → 可不可信（扁掉＝正在切著看、灰虛線＝這一幀別當真）
  //    位置與可信度分開表達，斜角時就不會因為可信度低而連位置一起丟掉。
  const dotColor = best.gate ? best.gate.color : '#00e5a0';
  const showingDisc = showDisc && best.info;
  drawPts.forEach((p, i) => {
    const label = pts.length > 1 ? `${acuLabel(name)}${i + 1}` : acuLabel(name);
    if (showingDisc) {
      // 圓盤已經把白點畫在正確位置上了，這裡只補標籤 ——
      // 而且要畫在**圓盤外面**，不然會壓在色塊上看不清（3d 版 drawLabel 的做法）。
      drawAcuLabel(ctx, mx(p.x), p.y, label, discR);
    } else {
      // 圓盤關掉時退回舊的點畫法，否則什麼都看不到。
      drawAcupoint(ctx, mx(p.x), p.y, label, dotColor, r);
    }
  });

  if (renderMode === 'locate') {
    const pct = Math.round((best.info ? best.info.conf : 0) * 100);
    const g = best.gate;
    // 數據面板：這一穴這一幀的皮膚偏角與它自己的上限
    if (best.gate) { liveStats.angle = best.gate.angleDeg; liveStats.limit = best.gate.limitDeg; }
    if (g && (g.level !== 'ok' || g.blocked)) {
      // ── 閘門三：這個穴道自己的角度（2026-08-12 建立，08-18 改成兩層）──
      // 講的是「**這塊皮膚**偏離鏡頭幾度」，不是「手歪幾度」——對側緣穴這兩件事差約 90°。
      // 姿勢指引照 kind 給：side 類要手刀、palm 類要攤平。
      // ⚠ 刻意不講「往左轉/往右轉」：方向要靠 azimuthDeg，而它是四個角度裡最不可信的
      //   （acu-math.js computeAcuConfidence 註釋③：W≠H 時有非等向縮放偏差）。
      const poseZh = g.kind === 'side' ? '請把手轉成手刀（側緣朝鏡頭）' : '請把手掌攤平正對鏡頭';
      const poseEn = g.kind === 'side' ? 'Turn your hand edge-on to the camera.' : 'Lay your palm flat toward the camera.';
      if (g.blocked) {
        // 圓盤已經扁到看不出形狀 → 這時才擋。措辭要說明「為什麼看不到點」，
        // 不能說「位置僅供參考」（根本沒畫點）。圓盤還是會畫（降級樣式），
        // 使用者靠那條線的方向知道要往哪轉回來。
        setGate('bad', isZh()
          ? `${acuLabel(name)}這塊皮膚幾乎是側著看的（偏離 ${Math.round(g.angleDeg)}°）　暫不顯示　${poseZh}`
          : `${acuLabel(name)} is almost edge-on (${Math.round(g.angleDeg)}° off) · hidden for now · ${poseEn}`);
      } else {
        // 圓盤還看得到 → 不擋，點照畫，只是提醒可能偏了。
        // 使用者看得出圓盤被壓扁多少，自己就能轉回來。
        const tailZh = g.level === 'bad' ? '　位置僅供參考' : '';
        const tailEn = g.level === 'bad' ? ' · indicative only' : '';
        setGate(g.level === 'bad' ? 'bad' : 'warn', isZh()
          ? `${acuLabel(name)}這塊皮膚偏離 ${Math.round(g.angleDeg)}°（上限 ${g.limitDeg}°）${tailZh}　${poseZh}`
          : `Surface tilted ${Math.round(g.angleDeg)}° (limit ${g.limitDeg}°)${tailEn} · ${poseEn}`);
      }
      // 擋下時沒有畫點，就不可能「對準」——按摩計時那頁靠這個旗標決定要不要扣秒。
      onTarget = !g.blocked;
      return;
    }
    if (tiltBad) {
      setGate('warn', isZh()
        ? `已放行　傾斜 ${Math.round(tiltDeg)}°　位置僅供參考`
        : `Shown anyway · tilt ${Math.round(tiltDeg)}° · indicative only`);
    } else {
      const lvl = best.info ? best.info.level : 'low';
      setGate(lvl === 'low' ? 'warn' : 'ok', isZh()
        ? `定位中　信心 ${pct}%　傾斜 ${Math.round(tiltDeg)}°`
        : `Locating · confidence ${pct}% · tilt ${Math.round(tiltDeg)}°`);
    }
    onTarget = true;
    return;
  }

  // ── 按摩模式：檢查「另一隻手」的指尖有沒有對準 ──
  const other = allHands.find((_, i) => i !== best.i);
  if (!other) {
    // 遮擋推定（見 OCCLUDE_MAX_MS）：剛才對準、被按的手沒動 → 當作按摩手被擋住、仍在按
    const a = occludeAnchor;
    const still = a && performance.now() - a.at < OCCLUDE_MAX_MS &&
      pts.some(p => Math.hypot(p.x - a.x, p.y - a.y) <= a.tol * PRESS_TOL_OUT_RATIO);
    if (still) {
      pressWasOn = true;              // 按摩手重新出現時仍吃遲滯；pressLastOnAt 不更新，上限從最後一次真的看到算
      onTarget = true;
      liveStats.distMm = null;
      liveStats.on = true;
      setGate('ok', isZh() ? '按摩手被擋住，依剛才的位置繼續計時' : 'Pressing hand hidden — still counting from last position');
      return;
    }
    occludeAnchor = null;
    setGate('warn', isZh() ? '請把另一隻手也放進畫面' : 'Bring your other hand into frame');
    onTarget = false;
    return;
  }

  // 設定裡勾的指尖（state.js pressFingers，預設拇指＋食指＋中指 —— 中指是 73a3f2d 加的）：
  // 取最靠近穴道的那個當「按壓點」
  // （2026-09-25 第二版：每根手指同時量指尖與指腹，見 pressPoints）
  const tips = pressPoints(other, pressTipIdx(), W, H);
  let minD = Infinity, hitPt = null, hitTip = null;
  pts.forEach(p => tips.forEach(tp => {
    const d = Math.hypot(tp.x - p.x, tp.y - p.y);
    if (d < minD) { minD = d; hitPt = p; hitTip = tp; }
  }));

  // 沒有遲滯的話，手指在邊界抖一下計時就 on/off 反覆跳（App 早就有，網頁 09-21 盤點才發現分岔）。
  const tol = Math.max(discR, 18);   // 判定圈＝畫面上的信心圓盤（第二版改回）
  const touching = pressOnTarget(minD, tol, prevPressOn);
  pressWasOn = touching;
  if (touching) pressLastOnAt = performance.now();
  occludeAnchor = touching && hitPt ? { x: hitPt.x, y: hitPt.y, tol, at: pressLastOnAt } : null;
  onTarget = touching;
  // 數據面板：距離用同一幀的 minD 換算成 mm（CUN_MM 是 acu-data.js 的換算常數）
  liveStats.distMm = cunPx > 0 ? (minD / cunPx) * CUN_MM : null;
  liveStats.on = touching;

  // 指尖標記與引導箭頭：距離已經在原始座標算完了，這裡只是把畫的位置翻過去
  if (hitTip) {
    ctx.save();
    if (!touching && hitPt) {
      // 2026-09-12：虛線改成箭頭。虛線只連出兩點之間，往哪移要自己判斷；
      // 箭頭把方向直接講出來。尖端留白避免蓋住信心圓盤。
      drawGuideArrow(ctx, mx(hitTip.x), hitTip.y, mx(hitPt.x), hitPt.y,
                     { gap: Math.max(16, discR * 0.9) });
    }
    ctx.beginPath();
    ctx.arc(mx(hitTip.x), hitTip.y, 8, 0, Math.PI * 2);
    ctx.fillStyle = touching ? 'rgba(79,191,139,.9)' : 'rgba(224,112,92,.8)';
    ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
  }

  if (!massageRunning) {
    // 2026-09-12：原本是「再靠近 N px」。px 對使用者沒有意義，而且手離鏡頭
    // 遠近不同時同一個 px 代表的實際距離差很多 —— 距離資訊改由箭頭長度承載，
    // 文案只講要做什麼。措辭與臉部（face-vision.js）統一。
    setGate(touching ? 'ok' : 'warn', touching
      ? (isZh() ? '對準了　可按「開始按摩」' : 'On target · press Start')
      : (isZh() ? '指尖沿箭頭移到穴道上' : 'Follow the arrow to the point'));
  } else {
    setGate(touching ? 'ok' : 'bad', touching
      ? (isZh() ? '按對了　計時進行中' : 'On target · timing')
      : (isZh() ? '指尖離開穴道　計時暫停' : 'Off target · timer paused'));
  }
}

// 離開分頁或切到背景就關相機，不要偷偷佔著鏡頭
window.addEventListener('pagehide', stopCamera);
document.addEventListener('visibilitychange', () => { if (document.hidden) stopCamera(); });
