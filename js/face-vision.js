// ═══════════════════════════════════════════════════════════════════
// 臉部相機與偵測迴圈
//
// 跟手部的 js/vision.js 是**兩套獨立的東西**（模型不同：Hands vs FaceMesh），
// 共用同一個 <video id="hidden-video">。
// 誰該關掉由 js/nav.js 的 showPage 決定（看 keepsCamera / keepsFaceCamera）。
//
// ⭐ 2026-09-04：**按摩模式例外，兩個模型一起跑**（faceMode==='massage'）。
//    臉部要有「對準才扣秒」的閘門就非得同時看到手不可（判定在 js/face-gate.js）。
//    做法是同一幀先 `await faceMesh.send()` 再 `await hands.send()`。
//    ⚠️ 一定要一個 await 完再送下一個 —— MediaPipe 內部的 wasm 是單執行緒佇列，
//       兩邊同時送進去，onResults 會交錯回來，變成拿不同幀的手和臉配在一起。
//    定位模式仍然只跑 FaceMesh（那裡不需要手，多跑一個模型只是白白吃幀率）。
//
// ⚠️ 這支不要改定位公式。公式在 js/face-math.js。
// ═══════════════════════════════════════════════════════════════════

let faceMesh = null, faceCamera = null, faceVideo = null;
let faceCamRunning = false, faceCamStarting = false;
// 啟動中保護，原理同 js/vision.js 的 camWanted／camStartP（2026-09-23 修「相機容易打不開」）
let faceCamWanted = false, faceCamStartP = null;
let faceFacingMode = 'user';
let faceShowDisc = true;
let faceCanvas = null;
// 畫到哪、讀數寫到哪。原本寫死 'face-canvas' / 'face-gate'，
// 2026-09-04 臉部穴道要能在「定位頁」（video-canvas / camera-gate）出現，
// 所以改成啟動時記下來 —— 同一時間只有一邊在跑，一組變數就夠。
let faceCanvasId = 'face-canvas';
let faceGateId = 'face-gate';
let faceSelected = [];       // 現在要顯示哪些穴道（代碼陣列）
let faceShowRefs = false;    // 除錯用：把參考 landmark 也畫出來
let faceGotResult = false;   // 模型吐過第一幀結果了沒
let faceWatchdog = null;

// 'locate'（只跑 FaceMesh）| 'massage'（連 Hands 一起跑，才有對準閘門）
let faceMode = 'locate';
// 按摩模式下，Hands 每幀把 landmark 放這裡（由 js/vision.js 的 onHandsResults 轉交）。
// 沒有手就是 null —— 這跟「手在畫面外」是同一件事，不必分開表示。
let faceHandLm = null;
// 最近一次的閘門結果，讀數條與計時器都看它
let faceGate = { state: 'noface', R: null, ipdFrac: null, gap: null };
// 施密特觸發用：現在算不算「貼著」（含寬限期）。決定下一幀要用哪一組門檻。
let faceHeld = false;
let faceOkUntil = 0;

// 臉部模型第一次要下載約 10MB（wasm 6.1MB + packed assets 4MB）。
// 在那之前 onFaceResults 不會被呼叫 —— 如果只有它會畫圖，畫面就是一片黑，
// 使用者只會覺得「壞了」。所以載入期間由 onFrame 自己把影像畫上去。
const FACE_MODEL_TIMEOUT_MS = 20000;

// 單一共用實例：每次進頁重建會重載 wasm，又慢又漏
function getFaceMesh() {
  if (faceMesh) return faceMesh;
  faceMesh = new FaceMesh({
    locateFile: (f) => mpAsset('face_mesh', f),  // 本機或 CDN，見 js/mp-loader.js
  });
  faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,        // ← 開了才有 478 點（含虹膜 468–477），公式靠虹膜當基準
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.6,
  });
  faceMesh.onResults(onFaceResults);
  return faceMesh;
}

async function startFaceCamera(canvasId, gateId, mode) {
  faceCanvasId = canvasId || 'face-canvas';
  faceGateId = gateId || 'face-gate';
  faceMode = mode === 'massage' ? 'massage' : 'locate';
  faceHandLm = null;
  faceCanvas = document.getElementById(faceCanvasId);
  faceCamWanted = true;
  if (faceCamRunning) return;
  if (faceCamStartP) return faceCamStartP;   // 啟動中：等同一次
  faceCamStarting = true;
  setFaceGate('warn', isZh() ? '啟動相機中…' : 'Starting camera…');
  faceCamStartP = (async () => {
  let cam = null;
  try {
    // 手部那邊可能還開著或還在啟動（例如從定位頁直接切過來），先確保只有一邊在用鏡頭
    if (typeof camRunning !== 'undefined' && (camRunning || camStarting)) stopCamera();
    if (typeof camIdle === 'function') await camIdle();
    if (!faceCamWanted) return;
    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) {
      throw Object.assign(new Error('no mediaDevices'), { name: 'NoMediaDevices' });
    }
    faceVideo = document.getElementById('hidden-video');
    const fm = getFaceMesh();
    // 按摩模式要順便看手。用的是 js/vision.js 那個共用實例（不另外建一個，
    // 不然 wasm 要載兩份），只是把結果導到這裡來 —— 見該檔的 faceMode 分支。
    const hm = (faceMode === 'massage' && typeof getHands === 'function') ? getHands() : null;
    if (hm && typeof applyHandsOptions === 'function') applyHandsOptions(hm, 'locate');  // 臉部只需要一隻手
    cam = faceCamera = new Camera(faceVideo, {
      onFrame: async () => {
        if (!faceCamRunning) return;
        // 模型還沒吐過結果之前，先把影像畫上去，不然使用者盯著一片黑
        if (!faceGotResult) drawFacePreview();
        try { await fm.send({ image: faceVideo }); } catch (e) { /* 關閉瞬間的競態 */ }
        // ⚠️ 一定排在 FaceMesh **之後**、而且是另一個 await：見檔頭說明
        if (hm && faceCamRunning) {
          try { await hm.send({ image: faceVideo }); } catch (e) { /* 同上 */ }
        }
      },
      width: 640, height: 480, facingMode: faceFacingMode,
    });
    await cam.start();
    if (!faceCamWanted) {          // 啟動途中已被關：自己收掉，不留殭屍串流
      try { cam.stop(); } catch (e) {}
      if (faceCamera === cam) faceCamera = null;
      return;
    }
    faceCamera = cam;
    faceCamRunning = true;

    // 模型載不起來時要講清楚，不要讓畫面停在「載入中」讓人以為是相機壞了
    clearTimeout(faceWatchdog);
    faceWatchdog = setTimeout(() => {
      if (faceCamRunning && !faceGotResult) {
        setFaceGate('bad', isZh()
          ? '臉部模型載不起來（約 10MB，需要連網）。相機是好的，只是算不出穴位。'
          : 'Face model failed to load (~10MB, needs internet). Camera is fine; acupoints cannot be computed.');
      }
    }, FACE_MODEL_TIMEOUT_MS);
  } catch (err) {
    if (cam) { try { cam.stop(); } catch (e) {} if (faceCamera === cam) faceCamera = null; }
    if (faceCamWanted) {
      setFaceGate('bad', typeof cameraErrorText === 'function' ? cameraErrorText(err)
        : (isZh() ? '相機啟動失敗：' : 'Camera failed: ') + (err && err.message ? err.message : err));
    }
    console.error(err);
  } finally {
    faceCamStarting = false;
    faceCamStartP = null;
  }
  })();
  return faceCamStartP;
}

function faceCamIdle() {
  return faceCamStartP || Promise.resolve();
}

/** 只畫影像、不畫穴位 —— 模型載入期間用，讓相機至少看得到 */
function drawFacePreview() {
  const canvas = faceCanvas;
  if (!canvas || !faceVideo) return;
  const vw = faceVideo.videoWidth || 640, vh = faceVideo.videoHeight || 480;
  if (canvas.width !== vw || canvas.height !== vh) { canvas.width = vw; canvas.height = vh; }
  const ctx = canvas.getContext('2d');
  ctx.save();
  if (faceFacingMode === 'user') { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
  ctx.drawImage(faceVideo, 0, 0, canvas.width, canvas.height);
  ctx.restore();
  setFaceGate('warn', isZh() ? '臉部模型載入中…（首次約 10MB）' : 'Loading face model… (~10MB first time)');
}

function stopFaceCamera() {
  faceCamWanted = false;
  faceCamRunning = false;
  faceGotResult = false;
  faceHandLm = null;
  faceGate = { state: 'noface', R: null, ipdFrac: null, gap: null };
  faceHeld = false; faceOkUntil = 0;
  if (typeof onTarget !== 'undefined') onTarget = false;   // 計時器不能停在「還對著」
  clearTimeout(faceWatchdog);
  if (faceCamera) { try { faceCamera.stop(); } catch (e) {} faceCamera = null; }
  if (faceVideo && faceVideo.srcObject) {
    faceVideo.srcObject.getTracks().forEach(tr => tr.stop());
    faceVideo.srcObject = null;
  }
  // 不呼叫 faceMesh.close()：實例留著重用，下次進頁不必重載 wasm
}

async function switchFaceCamera() {
  faceFacingMode = faceFacingMode === 'user' ? 'environment' : 'user';
  // stopFaceCamera 會把 faceMode 留著，但讀在前面比較不怕日後改動
  const c = faceCanvasId, g = faceGateId, m = faceMode;
  stopFaceCamera();
  await startFaceCamera(c, g, m);
}

function setFaceGate(kind, msg) {
  const el = document.getElementById(faceGateId);
  if (!el) return;
  el.textContent = msg;
  el.className = 'readout gate-' + (kind === 'ok' ? 'ok' : kind === 'bad' ? 'bad' : 'warn');
}

// ═══════════════════════════════════════════════════════════════════
// 主偵測迴圈
// ═══════════════════════════════════════════════════════════════════
function onFaceResults(results) {
  const canvas = faceCanvas;
  if (!canvas || !faceCamRunning) return;
  faceGotResult = true;                 // 模型活了，之後就由這裡負責畫
  clearTimeout(faceWatchdog);

  const vw = faceVideo.videoWidth || 640, vh = faceVideo.videoHeight || 480;
  if (canvas.width !== vw || canvas.height !== vh) { canvas.width = vw; canvas.height = vh; }
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext('2d');

  // 前鏡頭鏡像，使用者才覺得畫面裡的臉跟自己同一邊（照鏡子）。
  // ⚠️ 只鏡射「畫面」，landmark 座標一律維持原樣 —— 公式吃原始座標。
  const mirror = faceFacingMode === 'user';
  const mx = (x) => mirror ? W - x : x;

  ctx.clearRect(0, 0, W, H);
  ctx.save();
  if (mirror) { ctx.translate(W, 0); ctx.scale(-1, 1); }
  ctx.drawImage(results.image || faceVideo, 0, 0, W, H);
  ctx.restore();

  const faces = results.multiFaceLandmarks || [];
  if (!faces.length) {
    setFaceGate('warn', isZh() ? '請把臉放進畫面中' : 'Put your face in frame');
    return;
  }
  const lm = faces[0];

  const pose = faceHeadPose(lm, W, H);
  if (!pose) {
    setFaceGate('bad', isZh() ? '偵測不穩（虹膜點缺失）' : 'Unstable detection (no iris points)');
    return;
  }

  if (faceShowRefs) {
    ctx.fillStyle = 'rgba(224,163,60,.9)';
    Object.values(FLM).forEach(i => {
      const p = lm[i]; if (!p) return;
      ctx.beginPath(); ctx.arc(mx(p.x * W), p.y * H, 2, 0, Math.PI * 2); ctx.fill();
    });
  }

  const r = faceDiscR(pose.ipd);
  let drawn = 0;
  const allPts = [];

  faceSelected.forEach(code => {
    const pts = computeFaceAcupoint(code, lm, W, H);
    if (!pts) return;
    drawn += pts.length;
    pts.forEach(p => {
      allPts.push(p);
      if (faceShowDisc) drawFaceDisc(ctx, mx(p.x), p.y, r, pose);
      // 穴名不能被鏡射成反字，所以只把 x 翻過去畫，不用 canvas transform
      drawAcupoint(ctx, mx(p.x), p.y, faceLabel(code), '#00e5a0', Math.max(4, r * 0.42));
    });
  });

  // ── 按摩模式：另外判「手指是不是真的貼上去」，並接管讀數條 ──
  if (faceMode === 'massage') {
    renderFaceMassage(ctx, allPts, pose, W, H, mx);
    return;
  }

  // ── 讀數：連續信心度，不是「行 / 不行」二選一 ──
  const pct = Math.round(pose.facing * 100);
  const roll = Math.round(pose.rollDeg);
  if (!drawn) {
    setFaceGate('warn', isZh() ? '請先選要定位的穴道' : 'Select an acupoint first');
  } else if (pose.facing < 0.75) {
    setFaceGate('bad', isZh()
      ? `臉太側　信心 ${pct}%　請正對鏡頭`
      : `Face turned · confidence ${pct}% · look at the camera`);
  } else {
    setFaceGate('ok', isZh()
      ? `定位中　${drawn} 點　信心 ${pct}%　側傾 ${roll}°`
      : `Locating · ${drawn} pts · confidence ${pct}% · roll ${roll}°`);
  }
}

// ═══════════════════════════════════════════════════════════════════
// 按摩模式：對準閘門
//
// 判定本身在 js/face-gate.js（純函式，可單獨測）。這裡只負責
// 「畫指尖 + 寫讀數條 + 設 onTarget」。
//
// ⭐ onTarget 是 js/vision.js 宣告的同一個變數（同一個全域腳本作用域），
//    pages/05-massage.js 的計時器讀它 —— 手部與臉部因此共用同一條計時邏輯，
//    按摩頁不必知道自己在按臉還是按手。
// ═══════════════════════════════════════════════════════════════════
function renderFaceMassage(ctx, acuPts, pose, W, H, mx) {
  // wasOk 一傳進去就改用比較鬆的退場門檻（施密特觸發，見 face-gate.js）
  faceGate = faceTouchGate(faceHandLm, acuPts, pose.ipd, W, H, faceHeld);
  const g = faceGate;

  // 太遠的時候**不擋計時**：這個判定在遠距離已知會失效（門檻方向會反轉），
  // 硬擋會變成「明明按對了卻不扣秒」。改成放行 + 明講沒在驗證。
  // → 這就是「有距離前提的閘門」，同手部既有的 cunPx<22 太遠不顯示。
  const now = Date.now();
  if (g.state === 'ok') faceOkUntil = now + FACE_HOLD_MS;
  // 掉出去之後撐 FACE_HOLD_MS 才真的停錶 —— 蓋掉手擋住自己造成的閃斷。
  // ⚠️ far 不吃這個寬限：那是「判不了」不是「剛剛還貼著」，本來就一路放行。
  faceHeld = g.state === 'ok' || now < faceOkUntil;
  onTarget = faceHeld || g.state === 'far';

  // 指尖標記與導引線。距離已經在原始座標算完，這裡只是把畫的位置翻過去。
  if (faceHandLm && acuPts.length) {
    const tip = { x: faceHandLm[8].x * W, y: faceHandLm[8].y * H };
    ctx.save();
    if (!faceHeld) {
      // 沒對準就指向穴道，使用者才知道要往哪邊移。
      // 2026-09-12：虛線改成箭頭，與手部（vision.js）共用 drawGuideArrow。
      let near = acuPts[0], best = Infinity;
      for (const p of acuPts) {
        const d = Math.hypot(tip.x - p.x, tip.y - p.y);
        if (d < best) { best = d; near = p; }
      }
      drawGuideArrow(ctx, mx(tip.x), tip.y, mx(near.x), near.y);
    }
    ctx.fillStyle = faceHeld ? '#00e5a0' : '#e0a33c';
    ctx.beginPath(); ctx.arc(mx(tip.x), tip.y, 7, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  if (!acuPts.length) {
    setFaceGate('warn', isZh() ? '算不出穴位' : 'Cannot compute acupoint');
    return;
  }
  const zh = isZh();
  if (g.state === 'far') {
    setFaceGate('warn', zh
      ? '離鏡頭太遠，無法確認指尖位置；目前為寬鬆計時'
      : 'Too far to verify fingertip position; relaxed timing is active');
  } else if (g.state === 'nohand') {
    setFaceGate('warn', zh ? '請把手放進畫面' : 'Bring your hand into frame');
  } else if (faceHeld) {
    setFaceGate('ok', zh
      ? `位置已對準　側傾 ${Math.round(pose.rollDeg)}°`
      : `Position aligned · roll ${Math.round(pose.rollDeg)}°`);
  } else {
    // 只看 2D 的時候，off 只有一個原因：指尖離穴位太遠。
    // （深度檢查開回來的話，這裡要多一句「手指還浮在前面」。）
    setFaceGate('warn', zh ? '指尖再靠近穴位一點' : 'Move your fingertip onto the point');
  }
}

window.addEventListener('pagehide', stopFaceCamera);
document.addEventListener('visibilitychange', () => { if (document.hidden) stopFaceCamera(); });
