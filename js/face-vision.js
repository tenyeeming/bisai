// ═══════════════════════════════════════════════════════════════════
// 臉部相機與偵測迴圈
//
// 跟手部的 js/vision.js 是**兩套獨立的東西**（模型不同：Hands vs FaceMesh），
// 但共用同一個 <video id="hidden-video">，所以同一時間只能有一邊在跑。
// 誰該關掉由 js/nav.js 的 showPage 決定（看 keepsCamera / keepsFaceCamera）。
//
// ⚠️ 這支不要改定位公式。公式在 js/face-math.js。
// ═══════════════════════════════════════════════════════════════════

let faceMesh = null, faceCamera = null, faceVideo = null;
let faceCamRunning = false, faceCamStarting = false;
let faceFacingMode = 'user';
let faceShowDisc = true;
let faceCanvas = null;
let faceSelected = [];       // 現在要顯示哪些穴道（代碼陣列）
let faceShowRefs = false;    // 除錯用：把參考 landmark 也畫出來
let faceGotResult = false;   // 模型吐過第一幀結果了沒
let faceWatchdog = null;

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

async function startFaceCamera(canvasId) {
  faceCanvas = document.getElementById(canvasId);
  if (faceCamRunning || faceCamStarting) return;
  faceCamStarting = true;
  setFaceGate('warn', isZh() ? '啟動相機中…' : 'Starting camera…');
  try {
    // 手部那邊可能還開著（例如從定位頁直接切過來），先確保只有一邊在用鏡頭
    if (typeof camRunning !== 'undefined' && camRunning) stopCamera();
    faceVideo = document.getElementById('hidden-video');
    const fm = getFaceMesh();
    faceCamera = new Camera(faceVideo, {
      onFrame: async () => {
        if (!faceCamRunning) return;
        // 模型還沒吐過結果之前，先把影像畫上去，不然使用者盯著一片黑
        if (!faceGotResult) drawFacePreview();
        try { await fm.send({ image: faceVideo }); } catch (e) { /* 關閉瞬間的競態 */ }
      },
      width: 640, height: 480, facingMode: faceFacingMode,
    });
    await faceCamera.start();
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
    setFaceGate('bad', (isZh() ? '相機啟動失敗：' : 'Camera failed: ') + (err && err.message ? err.message : err));
    console.error(err);
  } finally {
    faceCamStarting = false;
  }
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
  faceCamRunning = false;
  faceGotResult = false;
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
  stopFaceCamera();
  await startFaceCamera('face-canvas');
}

function setFaceGate(kind, msg) {
  const el = document.getElementById('face-gate');
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

  faceSelected.forEach(code => {
    const pts = computeFaceAcupoint(code, lm, W, H);
    if (!pts) return;
    drawn += pts.length;
    pts.forEach(p => {
      if (faceShowDisc) drawFaceDisc(ctx, mx(p.x), p.y, r, pose);
      // 穴名不能被鏡射成反字，所以只把 x 翻過去畫，不用 canvas transform
      drawAcupoint(ctx, mx(p.x), p.y, faceLabel(code), '#00e5a0', Math.max(4, r * 0.42));
    });
  });

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

window.addEventListener('pagehide', stopFaceCamera);
document.addEventListener('visibilitychange', () => { if (document.hidden) stopFaceCamera(); });
