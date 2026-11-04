// ═══════════════════════════════════════════════════════════════════
// 臉部改跑 MediaPipe Tasks FaceLandmarker（2026-11-04，同 App detect/FaceDetector.kt，版本 0.10.35）
//
// 為什麼：舊的 @mediapipe/face_mesh（Solutions，2021）沒有官方 facial transformation matrix，
//   網頁只能自己用兩眼外眥的 z 估左右角、完全不判上下。用戶：「還是有辦法讓網頁版本拿到那個功能嗎」→「試試看」。
//   換成跟 App 同一個模型（face_landmarker.task 與 App assets 那份同一個檔）＋同一個矩陣，
//   左右／上下的回正就能照搬 App FaceAnchor.kt。
//
// ⭐ 退路：這支載不起來（file:// 雙擊開、瀏覽器不支援 module／WebGL、下載逾時）→ ftState='failed'，
//   face-vision.js 自動退回舊 FaceMesh（行為＝改前：只有左右箭頭、跟 0° 比）。
//   想強制用舊的：localStorage.faceEngine = 'legacy'（除錯用）。
//
// ⚠️ 點位：Tasks 的 478 點跟 FaceMesh refineLandmarks 同一套編號（含虹膜 468–477），公式（face-math.js）不用改。
// ⚠️ VIDEO 模式 timestamp 必須嚴格遞增（CLAUDE.md 雷區）→ ftDetect 自己維護 max(ts+1, now)。
// ⚠️ 本機 vendor/ 裡 vision_bundle 存成 .js 不是 .mjs：Windows 的 python http.server 把 .mjs 標成 text/plain，
//    瀏覽器會拒絕執行 module（CLAUDE.md 雷區）。GitHub Pages 沒這個問題，但本機與線上用同一份檔案比較單純。
// ⚠️ 版本號改了要一起改：這裡、vendor/下載.js。
// ═══════════════════════════════════════════════════════════════════

const FT_VER = '0.10.35';
const FT_PKG = '@mediapipe/tasks-vision@' + FT_VER;
const FT_LOCAL = 'vendor/mediapipe/tasks_vision';
// 本機沒下載時才用：Google 官方模型（App assets 那份就是這個檔，3,758,596 bytes）
const FT_MODEL_CDN = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
// wasm 約 11MB＋模型 3.7MB；超過這麼久就放棄、退回舊 FaceMesh（舊的自己還有 20 秒看門狗）
const FT_LOAD_TIMEOUT_MS = 25000;

let ftState = 'idle';            // 'idle' | 'loading' | 'ready' | 'failed'
let ftLandmarker = null;
let ftLoadP = null;
let ftLastTs = 0;
let ftInfo = null;               // { local, delegate }：除錯看用的是哪一套

function faceTasksDisabled() {
  try {
    if (typeof window !== 'undefined' && window.__noFaceTasks) return true;   // 測試（jsdom 沒有 module／WebGL）
    return typeof localStorage !== 'undefined' && localStorage.getItem('faceEngine') === 'legacy';
  } catch (e) { return false; }
}

async function ftImport() {
  if (typeof MP_LOCAL_ASSETS !== 'undefined' && MP_LOCAL_ASSETS) {
    try {
      const mod = await import(new URL(FT_LOCAL + '/vision_bundle.js', location.href).href);
      return { mod, local: true };
    } catch (e) { /* 沒跑過 vendor/下載.js → 走 CDN */ }
  }
  return { mod: await import(MP_CDN + FT_PKG + '/vision_bundle.mjs'), local: false };
}

/** 開始載（只會載一次）。回傳 Promise<landmarker|null>；null＝放棄，用舊 FaceMesh */
function loadFaceTasks() {
  if (ftLoadP) return ftLoadP;
  if (faceTasksDisabled() || (typeof location !== 'undefined' && location.protocol === 'file:')) {
    ftState = 'failed';
    ftLoadP = Promise.resolve(null);
    return ftLoadP;
  }
  ftState = 'loading';
  const work = (async () => {
    const { mod, local } = await ftImport();
    const fileset = await mod.FilesetResolver.forVisionTasks((local ? FT_LOCAL : MP_CDN + FT_PKG) + '/wasm');
    const make = (delegate) => mod.FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: local ? FT_LOCAL + '/face_landmarker.task' : FT_MODEL_CDN, delegate },
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: true,   // ⭐ 換模型就是為了這個
    });
    // GPU 先試，不行退 CPU（同 App：不是每台都支援 GPU delegate；iOS Safari 也常在這裡出事）
    let lm, delegate = 'GPU';
    try { lm = await make('GPU'); }
    catch (e) { console.warn('[face-tasks] GPU 載不起來，改 CPU：', e); delegate = 'CPU'; lm = await make('CPU'); }
    ftInfo = { local, delegate };
    return lm;
  })();
  const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('載入逾時 ' + FT_LOAD_TIMEOUT_MS + 'ms')), FT_LOAD_TIMEOUT_MS));
  ftLoadP = Promise.race([work, timeout])
    .then((lm) => {
      ftLandmarker = lm; ftState = 'ready';
      console.info('[face-tasks] 臉部改用 Tasks FaceLandmarker ' + FT_VER, ftInfo);
      return lm;
    })
    .catch((e) => {
      console.warn('[face-tasks] 載不起來，退回舊 FaceMesh：', e);
      ftLandmarker = null; ftState = 'failed';
      // 只是逾時（第一次開、手部模型同時在載時實測碰過一次）→ 先用舊的頂著，背景載好了就換回 Tasks
      work.then((lm) => {
        if (!lm) return;
        ftLandmarker = lm; ftState = 'ready';
        console.info('[face-tasks] 逾時後才載好，改用 Tasks FaceLandmarker', ftInfo);
      }).catch(() => {});
      return null;
    });
  return ftLoadP;
}

/**
 * 送一幀，回傳跟舊 FaceMesh onResults 同形狀的結果，多一個 faceMatrix（16 個數，沒有就 null）。
 * 出錯回 null（呼叫端這一幀不畫）。
 */
function ftDetect(video) {
  if (!ftLandmarker) return null;
  let ts = Math.floor(performance.now());
  if (ts <= ftLastTs) ts = ftLastTs + 1;
  ftLastTs = ts;
  const r = ftLandmarker.detectForVideo(video, ts);
  const m = r && r.facialTransformationMatrixes && r.facialTransformationMatrixes[0];
  return {
    image: video,
    multiFaceLandmarks: (r && r.faceLandmarks) || [],
    faceMatrix: m && m.data ? Array.from(m.data) : null,
  };
}
