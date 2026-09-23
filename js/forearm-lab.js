// forearm-lab.js — 2026-09-23（Claude）
// ============================================================================
// 把今天在 Python 端測到「使用者驗收通過」的小海穴 Pose 錨定邏輯搬進瀏覽器。
// 來源（provenance）：
//   - 位置公式 / 掌背二分判定 / 跨幀穩定化 / Hand資料快取：原封不動照抄
//     `前臂/xiaohai_pose_anchored.py` process_frame() 的邏輯（見同目錄
//     `小海穴_Pose錨定實驗版_20260922.md` 第三、四輪改版說明）
//   - isDorsalView() / computeCunPx()：直接重用 js/acu-math.js 既有函式
//     （Python 版本本來就是照抄這兩支 JS 函式寫的，這裡等於物歸原主）
//   - StableLabelTracker：照抄 `前臂/smoothing_utils.py` 的同名 class
//   - OneEuroFilter：照抄 `前臂/smoothing_utils.py` 的同名 class
//
// ⚠️ 沒有改良、沒有調參——這頁的目的單純是「同一套邏輯，網頁上看起來是什麼效果」，
//    跟 Python 版本已知的限制（掌背二分不是真尺側判定、偏移量是猜的、Pose可見度
//    常低於門檻）完全一樣，一個都沒解決。
// ============================================================================

// ── 可調參數（跟 Python 版預設值一致）──────────────────────────────────────
const FL_FALLBACK_MIN_VISIBILITY = 0.5; // xiaohai_pose_anchored.py: FALLBACK_MIN_VISIBILITY
const FL_ULNAR_OFFSET_CUN = 0.5; // xiaohai_pose_anchored.py: DEFAULT_ULNAR_OFFSET_CUN
const FL_SWITCH_FRAMES = 5; // smoothing_utils.py: StableLabelTracker 預設
const FL_LOST_GRACE_FRAMES = 8; // smoothing_utils.py: StableLabelTracker 預設

// Pose（Solutions API）landmark 索引：11/12 肩、13/14 肘、15/16 腕
const FL_POSE_IDX = {
  left: { shoulder: 11, elbow: 13, wrist: 15 },
  right: { shoulder: 12, elbow: 14, wrist: 16 },
};

let flUseStable = true;
let flSmoothMode = "one_euro";

// ── 左右手限定（demo網站版，2026-09-23 用戶：「加入左右手判定，先限制某一手的判定」）──
// ⭐ 左右**不看 Hands 的 handedness 標籤**：那個標籤假設輸入是鏡像畫面，
//    我們餵的是沒翻轉的原始幀，可不可信沒驗過。改成兩步：
//    ① Pose 只看使用者選的那一側（13/15 或 14/16），不再「挑可見度高的那側」
//    ② Hands 開到 2 隻手，挑 lm0（腕）離 Pose 那側手腕最近的那隻；
//       距離超過前臂長 × FL_HAND_MATCH_RATIO 就當作「畫面裡的手不是這隻手臂的」
// ⚠️ Pose 自己的左右（解剖學左右）在背對鏡頭時可能對調，這裡沒有防。
let flHand = "left";
const FL_HAND_MATCH_RATIO = 0.35; // 約前臂長的三分之一 ≈ 8cm，估的、沒量過
// ── 比例尺切換（2026-09-23 用戶：「會隨著移動不再精準」）──────────────────
// hand    ＝ 原本的同身寸（computeCunPx，從手部算）：手指一彎、手掌一轉就跟著變，
//            而小海在手肘，手的姿勢其實跟它無關
// forearm ＝ 骨度分寸：肘橫紋→腕橫紋 12 寸，用 Pose 肘-腕距離 ÷ 12。
//            不受手指姿勢影響，但前臂朝向鏡頭（透視縮短）時會變短。
// ⚠️ 哪一把比較準**沒有標注可驗**，所以做成切換讓用戶實機比，預設仍是原本的 hand。
//    （09-22 記錄：骨度與同身寸在測試照片上差 24%，量級不小）
const FL_FOREARM_CUN = 12;
const FL_SIGN_HYST = 0.3;  // 尺側翻邊門檻（見 Hand 段）；估的
const FL_CUN_EMA = 0.2;    // 同身寸平滑：新值權重；估的
const FL_JITTER_N = 30;    // 波動讀數取最近幾幀
const flRecent = [];       // 最近 N 幀的點（px），算波動用
let flScaleMode = "hand";
let flForearmLenPx = null; // 每幀更新：平滑後的肘-腕像素距離
function flScalePx(handCunPx) {
  if (flScaleMode === "forearm" && flForearmLenPx) return flForearmLenPx / FL_FOREARM_CUN;
  return handCunPx;
}

function flSetHand(side) {
  flHand = side;
  flResetSmoothers();
  flResetTracker();
}

// ── 平滑器（照抄 smoothing_utils.OneEuroFilter）────────────────────────────
class FLOneEuroFilter {
  constructor({ minCutoff = 1.0, beta = 0.1, dCutoff = 1.0 } = {}) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.xPrev = null;
    this.dxPrev = null;
    this.tPrev = null;
  }
  static alpha(cutoff, freq) {
    const te = 1.0 / freq;
    const tau = 1.0 / (2 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / te);
  }
  filter(x, t) {
    // x: {x, y}
    if (this.xPrev == null) {
      this.xPrev = { ...x };
      this.dxPrev = { x: 0, y: 0 };
      this.tPrev = t;
      return { ...x };
    }
    let freq = 30.0;
    if (t != null && this.tPrev != null) {
      const dt = Math.max((t - this.tPrev) / 1000, 1e-3); // t 是 ms，換成秒跟 Python 的秒制一致
      freq = 1.0 / dt;
    }
    const dx = { x: (x.x - this.xPrev.x) * freq, y: (x.y - this.xPrev.y) * freq };
    const aD = FLOneEuroFilter.alpha(this.dCutoff, freq);
    const dxHat = {
      x: aD * dx.x + (1 - aD) * this.dxPrev.x,
      y: aD * dx.y + (1 - aD) * this.dxPrev.y,
    };
    const dxNorm = Math.hypot(dxHat.x, dxHat.y);
    const cutoff = this.minCutoff + this.beta * dxNorm;
    const a = FLOneEuroFilter.alpha(cutoff, freq);
    const xHat = { x: a * x.x + (1 - a) * this.xPrev.x, y: a * x.y + (1 - a) * this.xPrev.y };
    this.xPrev = xHat;
    this.dxPrev = dxHat;
    this.tPrev = t;
    return { ...xHat };
  }
}
class FLNoSmoothing {
  filter(x) {
    return { ...x };
  }
}
function flMakeSmoother(mode) {
  return mode === "one_euro" ? new FLOneEuroFilter({ minCutoff: 1.0, beta: 0.1 }) : new FLNoSmoothing();
}

// ── 跨幀穩定化（照抄 smoothing_utils.StableLabelTracker）──────────────────
class FLStableLabelTracker {
  constructor(switchFrames = FL_SWITCH_FRAMES, lostGraceFrames = FL_LOST_GRACE_FRAMES) {
    this.switchFrames = switchFrames;
    this.lostGraceFrames = lostGraceFrames;
    this.reset();
  }
  reset() {
    this.current = null;
    this.candidate = null;
    this.candidateCount = 0;
    this.lostCount = 0;
  }
  update(observed) {
    if (observed == null) {
      this.lostCount += 1;
      if (this.lostCount > this.lostGraceFrames) this.current = null;
      return this.current;
    }
    this.lostCount = 0;
    if (observed === this.current) {
      this.candidate = null;
      this.candidateCount = 0;
      return this.current;
    }
    if (observed !== this.candidate) {
      this.candidate = observed;
      this.candidateCount = 1;
    } else {
      this.candidateCount += 1;
    }
    if (this.candidateCount >= this.switchFrames) {
      this.current = observed;
      this.candidate = null;
      this.candidateCount = 0;
    }
    return this.current;
  }
}

// ── 幾何小工具（照抄 neiguan_realtime.py 的 unit / ulnar_direction）───────
function flUnit(v) {
  const n = Math.hypot(v.x, v.y);
  return n > 1e-9 ? { x: v.x / n, y: v.y / n } : { x: 0, y: 0 };
}
// 尺側（小指側）垂直方向：跟軸垂直的兩個方向中，挑跟「往小指根部lm17」點積較大那個
// —— 照抄 neiguan_realtime.py:ulnar_direction，不寫死正負號
function flUlnarDirection(axis, wristLm0Px, pinkyLm17Px) {
  const n1 = { x: -axis.y, y: axis.x };
  const n2 = { x: -n1.x, y: -n1.y };
  const toPinky = { x: pinkyLm17Px.x - wristLm0Px.x, y: pinkyLm17Px.y - wristLm0Px.y };
  const dot1 = n1.x * toPinky.x + n1.y * toPinky.y;
  const dot2 = n2.x * toPinky.x + n2.y * toPinky.y;
  return dot1 >= dot2 ? n1 : n2;
}
// 小海位置＝肘點 ＋ 尺側方向 × (offsetCun × cunPx) —— 照抄 xiaohai_pose_anchored.py:locate_xiaohai
function flLocateXiaohai(elbowPx, ulnarDir, cunPx, offsetCun) {
  if (ulnarDir == null || cunPx == null) return { ...elbowPx };
  return { x: elbowPx.x + ulnarDir.x * (offsetCun * cunPx), y: elbowPx.y + ulnarDir.y * (offsetCun * cunPx) };
}

// ── 狀態 ────────────────────────────────────────────────────────────────
let flHandsModel = null;
let flPoseModel = null;
let flCamera = null;
let flLastHandResults = null;
let flLastPoseResults = null;

const flSmoothers = {}; // key: `elbow_${side}` / `wrist_${side}`
const flTrackers = {}; // key: side
const flLastHandCache = {}; // key: side -> {cunPx, ulnarDir, dorsal, handedLabel}

function flResetSmoothers() {
  for (const k of Object.keys(flSmoothers)) delete flSmoothers[k];
}
function flResetTracker() {
  for (const k of Object.keys(flTrackers)) delete flTrackers[k];
  for (const k of Object.keys(flLastHandCache)) delete flLastHandCache[k];
}
function flGetSmoother(key) {
  if (!flSmoothers[key]) flSmoothers[key] = flMakeSmoother(flSmoothMode);
  return flSmoothers[key];
}
function flGetTracker(side) {
  if (!flTrackers[side]) flTrackers[side] = new FLStableLabelTracker(FL_SWITCH_FRAMES, FL_LOST_GRACE_FRAMES);
  return flTrackers[side];
}

function flStatus(text, cls) {
  const el = document.getElementById("fl-status");
  el.textContent = text;
  el.className = "fl-status " + (cls || "");
}

function flMetrics(html) {
  document.getElementById("fl-metrics").innerHTML = html;
}

// ── 主流程 ──────────────────────────────────────────────────────────────
function flStart() {
  const video = document.getElementById("fl-video");
  const canvas = document.getElementById("fl-canvas");
  const ctx = canvas.getContext("2d");

  flHandsModel = new Hands({
    locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`,
  });
  flHandsModel.setOptions({
    maxNumHands: 2, // demo網站版：兩隻手都抓，再用 Pose 手腕挑對的那隻（見 flHand）
    modelComplexity: 1,
    minDetectionConfidence: 0.8,
    minTrackingConfidence: 0.8,
  });
  flHandsModel.onResults((r) => {
    flLastHandResults = r;
  });

  flPoseModel = new Pose({
    locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${f}`,
  });
  flPoseModel.setOptions({
    modelComplexity: 1,
    // 09-23 為了「動的時候跟不上」改成 false，09-24 用戶回報「很容易出現位置波動」→ 改回 true。
    // 延遲與抖動是拉鋸；這次優先壓抖動（用戶要在身上畫點實測，靜止時要穩才量得出誤差）。
    smoothLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  flPoseModel.onResults((r) => {
    flLastPoseResults = r;
  });

  flStartCamera(video, ctx, canvas);
}

// ── 鏡頭（demo網站版才有，2026-09-23）────────────────────────────────────
// 手機上是一手拿手機、拍另一手的手肘 → 預設後鏡頭。
// 座標不做鏡像：兩個模型都吃同一張沒翻轉的畫面、畫布也照原樣畫，前後鏡頭都一致。
let flFacing = "environment";
// 切鏡頭的競態（2026-09-23 修「相機容易打不開」，原理同 js/vision.js 的 camWanted）：
//   camera_utils 的 stop() 只停「已經拿到」的串流。上一次還在開就切，stop() 落空，
//   舊串流回來後一直佔著鏡頭，Android 上新鏡頭就 NotReadableError。
//   ⇒ flGen 標記「哪一次才是最新的」，舊的回來自己收掉；切換前先等舊的那次回來。
let flGen = 0, flStartP = null, flSwitching = false;
async function flSwitchFacing(mode) {
  flFacing = mode;
  if (flSwitching) return;            // 連點：正在切的那次會讀到最新的 flFacing
  flSwitching = true;
  flGen++;                            // 讓還在啟動中的那次作廢
  if (flStartP) await flStartP.catch(() => {});
  if (flCamera) flCamera.stop();
  flResetSmoothers();
  flResetTracker();
  flSwitching = false;
  flStartCamera(document.getElementById("fl-video"), document.getElementById("fl-canvas").getContext("2d"),
                document.getElementById("fl-canvas"));
}

function flStartCamera(video, ctx, canvas) {
  const gen = ++flGen;
  const cam = flCamera = new Camera(video, {
    facingMode: flFacing,
    onFrame: async () => {
      // 兩個模型都跑同一幀畫面。send() 的 promise 在 onResults callback 跑完才 resolve
      // （Solutions API 的行為），所以兩個 await 做完後 flLastHandResults /
      // flLastPoseResults 一定是這一幀的最新結果，再統一畫一次，不會半幀半幀畫。
      await flHandsModel.send({ image: video });
      await flPoseModel.send({ image: video });
      flProcessFrame(ctx, canvas, video);
    },
    width: 640,
    height: 480,
  });
  flStartP = cam.start().then(
    () => {
      if (gen !== flGen) { cam.stop(); return; }   // 途中又切了：這條作廢
      flStatus("相機已啟動", "ok");
    },
    (e) => {
      if (gen !== flGen) return;
      const n = (e && e.name) || "";
      const hint = n === "NotAllowedError" ? "（權限被拒：網址列左邊圖示 → 權限 → 相機改允許，再重新整理）"
        : n === "NotReadableError" ? "（鏡頭被佔用：關掉其他用相機的 App 或分頁）"
        : n === "NotFoundError" || n === "OverconstrainedError" ? "（找不到這顆鏡頭，換前／後鏡頭試試）" : "";
      flStatus("相機打不開：" + e + hint, "bad");
    },
  );
}

function flProcessFrame(ctx, canvas, video) {
  if (video.videoWidth > 0 && (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight)) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }
  const W = canvas.width,
    H = canvas.height;
  const now = performance.now();

  ctx.save();
  ctx.clearRect(0, 0, W, H);
  const bgImage = (flLastPoseResults && flLastPoseResults.image) || (flLastHandResults && flLastHandResults.image);
  if (bgImage) ctx.drawImage(bgImage, 0, 0, W, H);
  ctx.restore();

  // ── 1) Pose：挑可見度較高的那一側手肘/手腕 ──────────────────────────────
  let chosenSide = null;
  let poseVis = { left: 0, right: 0 };
  let elbowPx = null,
    wristPx = null,
    axis = null;
  const poseLm = flLastPoseResults && flLastPoseResults.poseLandmarks;

  if (poseLm) {
    for (const side of ["left", "right"]) {
      const idx = FL_POSE_IDX[side];
      const el = poseLm[idx.elbow],
        wr = poseLm[idx.wrist];
      poseVis[side] = Math.min(el.visibility ?? 0, wr.visibility ?? 0);
    }
    // demo網站版：只看使用者限定的那一側，不再挑可見度高的
    chosenSide = flHand;
    if (poseVis[chosenSide] < FL_FALLBACK_MIN_VISIBILITY) chosenSide = null;
  }
  const handZh = flHand === "left" ? "左手" : "右手";

  let smoothedElbow = null,
    smoothedWrist = null;
  if (chosenSide) {
    const idx = FL_POSE_IDX[chosenSide];
    const rawElbow = { x: poseLm[idx.elbow].x * W, y: poseLm[idx.elbow].y * H };
    const rawWrist = { x: poseLm[idx.wrist].x * W, y: poseLm[idx.wrist].y * H };
    smoothedElbow = flGetSmoother(`elbow_${chosenSide}`).filter(rawElbow, now);
    smoothedWrist = flGetSmoother(`wrist_${chosenSide}`).filter(rawWrist, now);
    axis = flUnit({ x: smoothedElbow.x - smoothedWrist.x, y: smoothedElbow.y - smoothedWrist.y });
    flForearmLenPx = Math.hypot(smoothedElbow.x - smoothedWrist.x, smoothedElbow.y - smoothedWrist.y);

    // 灰色肘-腕參考線：不管穴位顯不顯示都畫，方便分辨「Pose有沒有抓到」跟「穴位有沒有顯示」
    ctx.beginPath();
    ctx.moveTo(smoothedWrist.x, smoothedWrist.y);
    ctx.lineTo(smoothedElbow.x, smoothedElbow.y);
    ctx.strokeStyle = "rgba(150,160,180,0.6)";
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // ── 2) Hand：掌側/背側二分判定 + cun/尺側方向 ───────────────────────────
  let observed = null; // "palmar" / "dorsal" / null（這幀沒偵測到手）
  let handedLabel = null;
  // 從偵測到的手裡挑「手腕離這隻手臂的 Pose 手腕最近」的那隻（見檔頭 flHand 說明）
  let handLm = null, handedness = null, handCount = 0, matchDist = null, rejected = false;
  const allHands = (flLastHandResults && flLastHandResults.multiHandLandmarks) || [];
  handCount = allHands.length;
  if (chosenSide && handCount) {
    const forearmLen = Math.hypot(smoothedElbow.x - smoothedWrist.x, smoothedElbow.y - smoothedWrist.y);
    let best = -1, bestD = Infinity;
    allHands.forEach((lm, i) => {
      const d = Math.hypot(lm[0].x * W - smoothedWrist.x, lm[0].y * H - smoothedWrist.y);
      if (d < bestD) { bestD = d; best = i; }
    });
    matchDist = forearmLen > 1 ? bestD / forearmLen : null;
    if (matchDist != null && matchDist <= FL_HAND_MATCH_RATIO) {
      handLm = allHands[best];
      handedness = flLastHandResults.multiHandedness && flLastHandResults.multiHandedness[best];
    } else {
      rejected = true;
    }
  }

  if (handLm && chosenSide) {
    const pts = handLm.map((p) => ({ x: p.x * W, y: p.y * H }));
    const cunPx = computeCunPx(handLm, W, H);
    const dorsal = isDorsalView(handLm, handedness);
    observed = dorsal ? "dorsal" : "palmar";
    handedLabel = handedness ? handedness.label : null;

    if (axis) {
      // 🐞 2026-09-23 修：以前快取的是**絕對方向向量** ulnarDir。Hand 漏抓的那幾幀（動起來常因模糊漏抓）
      //    沿用它時，手臂已經轉了、向量還指著舊方向 ⇒ 點往錯的方向偏。
      //    改成只記「小指在軸的哪一側」（±1），方向每幀用**當下**的軸重算。
      const n1 = { x: -axis.y, y: axis.x };
      const ulnarDir = flUlnarDirection(axis, pts[0], pts[17]);
      let ulnarSign = ulnarDir.x * n1.x + ulnarDir.y * n1.y >= 0 ? 1 : -1;
      // 🐞 2026-09-24「很容易出現位置波動」：小指根部 lm17 靠近前臂軸線時，
      //    它在軸的哪一側每幀都可能翻，點就在肘的兩側之間**跳一整寸**。
      //    加遲滯：新的一側要夠明確（投影 ≥ FL_SIGN_HYST × 腕→小指距離）才准翻，否則沿用上一次。
      const prev = flLastHandCache[chosenSide];
      if (prev && ulnarSign !== prev.ulnarSign) {
        const tp = { x: pts[17].x - pts[0].x, y: pts[17].y - pts[0].y };
        const proj = Math.abs(tp.x * n1.x + tp.y * n1.y) / (Math.hypot(tp.x, tp.y) || 1);
        if (proj < FL_SIGN_HYST) ulnarSign = prev.ulnarSign;
      }
      // 同身寸每幀從手重算、抖動大（手指一動就變）→ 指數平滑，新值只佔 FL_CUN_EMA
      const cunSm = prev && prev.cunPx ? prev.cunPx + (cunPx - prev.cunPx) * FL_CUN_EMA : cunPx;
      flLastHandCache[chosenSide] = { cunPx: cunSm, ulnarSign, dorsal, handedLabel };
    }

    for (const p of pts) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,0,0.85)";
      ctx.fill();
    }
  }

  // ── 3) 跨幀穩定化 + Hand資料快取 → 決定顯不顯示 ─────────────────────────
  let stable = null;
  let usingCache = handLm == null;
  let point = null;
  let reason = null;

  if (chosenSide) {
    const tracker = flUseStable ? flGetTracker(chosenSide) : null;
    stable = flUseStable ? tracker.update(observed) : observed;
    const cached = flLastHandCache[chosenSide];

    if (stable !== "palmar" || cached == null) {
      reason =
        stable === "dorsal"
          ? "目前背側朝鏡頭"
          : handLm == null
            ? rejected
              ? `畫面裡的手不是${handZh}（離${handZh}腕太遠）`
              : flUseStable
              ? "Hand 未偵測到，且已超過跨幀寬限期"
              : "Hand 未偵測到"
            : "尚未累積到足夠的穩定判定";
    } else {
      const dirNow = { x: -axis.y * cached.ulnarSign, y: axis.x * cached.ulnarSign };
      point = flLocateXiaohai(smoothedElbow, dirNow, flScalePx(cached.cunPx), FL_ULNAR_OFFSET_CUN);
    }
  } else {
    reason = poseLm ? `${handZh}肘／腕可見度低於門檻 ${FL_FALLBACK_MIN_VISIBILITY}` : "Pose 未偵測到人";
  }

  // ── 4) 畫穴位 / 文字 ─────────────────────────────────────────────────
  if (point) {
    const r = Math.max(8, (flScalePx(flLastHandCache[chosenSide].cunPx) || 20) * 0.35);
    ctx.beginPath();
    ctx.arc(point.x, point.y, r, 0, Math.PI * 2);
    ctx.strokeStyle = "rgb(100,100,255)";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(point.x, point.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = "rgb(100,100,255)";
    ctx.fill();
    ctx.font = "bold 16px sans-serif";
    ctx.fillStyle = "#fff";
    ctx.fillText("小海穴 SI8（實驗版" + (usingCache && handLm == null ? "，沿用快取" : "") + "）", 14, 24);
    flStatus("顯示中（掌側/背側二分判定，非真正尺側判定）", "ok");
  } else {
    ctx.font = "16px sans-serif";
    ctx.fillStyle = "#ffaa3c";
    ctx.fillText("⚠ " + reason + " → 不顯示", 14, 24);
    flStatus(reason || "偵測中…", "warn");
  }

  // ── 波動讀數（2026-09-24，給用戶在身上畫點實測用）──────────────────────
  // 最近 N 幀點位的標準差（兩軸合成），換成寸。**只有手靜止時才有意義**——動的時候這數字本來就大。
  let jitterCun = null;
  if (point) {
    flRecent.push(point);
    if (flRecent.length > FL_JITTER_N) flRecent.shift();
    if (flRecent.length >= 10) {
      const mx = flRecent.reduce((s, p) => s + p.x, 0) / flRecent.length;
      const my = flRecent.reduce((s, p) => s + p.y, 0) / flRecent.length;
      const sd = Math.sqrt(flRecent.reduce((s, p) => s + (p.x - mx) ** 2 + (p.y - my) ** 2, 0) / flRecent.length);
      const cun = flScalePx(flLastHandCache[chosenSide].cunPx);
      if (cun) jitterCun = sd / cun;
    }
  } else {
    flRecent.length = 0;
  }

  // ── 5) 診斷面板 ──────────────────────────────────────────────────────
  flMetrics(
    (jitterCun != null
      ? `靜止時看：近 ${flRecent.length} 幀波動 <b class='${jitterCun < 0.15 ? "lv-ok" : jitterCun < 0.3 ? "lv-edge" : "lv-bad"}'>±${jitterCun.toFixed(2)} 寸</b>　　`
      : "") +
    `可見度（門檻 ${FL_FALLBACK_MIN_VISIBILITY}） 左 <b>${poseVis.left.toFixed(2)}</b>　右 <b>${poseVis.right.toFixed(2)}</b>　` +
      `限定 <b>${handZh}</b>　　` +
      (chosenSide && flLastHandCache[chosenSide]
        ? `1寸：同身寸 <b>${flLastHandCache[chosenSide].cunPx.toFixed(1)}</b>px／骨度 <b>${(flForearmLenPx / FL_FOREARM_CUN).toFixed(1)}</b>px` +
          `（用 <b>${flScaleMode === "forearm" ? "骨度" : "同身寸"}</b>）　`
        : "") +
      `畫面中的手 <b>${handCount}</b> 隻　` +
      `Hand ${handLm ? "<b class='lv-ok'>配對到" + handZh + "</b>（MediaPipe 標籤 " + (handedLabel ?? "?") + "）"
                     : rejected ? "<span class='lv-bad'>不是" + handZh + "</span>" : "<span class='lv-bad'>沒偵測到</span>"}` +
      `${matchDist != null ? "　腕距 <b>" + matchDist.toFixed(2) + "</b>×前臂（門檻 " + FL_HAND_MATCH_RATIO + "）" : ""}　` +
      `這幀判定 <b>${observed ?? "--"}</b>　穩定判定 <b>${stable ?? "--"}</b>　` +
      `平滑 <b>${flSmoothMode}</b>　跨幀穩定化 <b>${flUseStable ? "開" : "關"}</b>`,
  );
}

// 📸 存圖（2026-09-24）：用戶在身上畫出真正的小海，存下「畫面＋演算法的點」，
// 之後對照兩個點量誤差。圖只存在手機本機（瀏覽器下載），不上傳。
function flSaveShot() {
  const c = document.getElementById("fl-canvas");
  const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const a = document.createElement("a");
  a.download = `xiaohai_${flHand}_${flScaleMode}_${ts}.png`;
  a.href = c.toDataURL("image/png");
  a.click();
}

window.addEventListener("DOMContentLoaded", flStart);
