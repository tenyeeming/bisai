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
// 輔助線（灰色肘-腕虛線、黃色手部 21 點、青色邊緣線）：除錯用，預設關（2026-09-24 用戶：點的呈現「像臉和手那樣就好」）
let flShowAux = false;
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

// ── 即時邊緣（2026-09-24，照學長 acupoint_realtimeMediapipe.py:396 的小海公式）─────
//   學長：pt_si8 = (px_elbow + elbow_ulnar) / 2
//         elbow_ulnar = 從肘點沿尺側法向量走到**手臂輪廓邊緣**的那一點（SAM2 輪廓）
//   這裡：輪廓換成 Pose 的 segmentationMask；從肘點沿尺側方向逐步取樣，
//         遮罩值掉到 FL_MASK_TH 以下的第一個位置就是邊緣。
//   邊緣距離每幀會抖（遮罩邊緣本來就毛）→ EMA 平滑。找不到邊緣就不硬猜，退回固定 0.5 寸並標明。
let flOffsetMode = "tip";          // edge ＝ 學長公式（肘點與尺側邊緣中點）；fixed ＝ 舊的固定 0.5 寸
const FL_MASK_TH = 0.5;
const FL_EDGE_MAX_CUN = 4;          // 最遠找幾寸；超過代表遮罩連到身體或背景，視為沒找到（估的）
const FL_EDGE_EMA = 0.3;
// 邊緣鎖定（2026-09-24 用戶：「按壓的時候另一隻手加入，干擾到邊緣的判斷」）：
//   按壓的手也被 Pose 遮罩當成身體 → 從肘往尺側走不會在皮膚邊停下，邊緣被撐遠、小海往外跑。
//   ⇒ 記住姿勢後先量 FL_EDGE_LOCK_N 次（這時另一隻手還沒放上來），取中位數存成「肘→邊 ÷ 前臂長」，
//      之後不再讀遮罩。用比例而不是 px：人往前後靠時前臂與這段距離一起縮放。
//   ⚠️ 前提是姿勢不變（已由姿勢範本擋住）；換姿勢要重按記住姿勢。
const FL_EDGE_LOCK_N = 10;
// ── 肘尖錨定（2026-09-24 晚，用戶：「放進即時頁試試看」）──────────────────────────
//   依據：用戶左手逐幀 GT 回放（前臂/小海GT_量測記錄_20260924.md「寬度剖面＋肘尖」那節）：
//   GT 相對 Pose 肘點縱向標準差 3.7mm、相對輪廓肘尖只有 1.2mm ⇒ 縱向改用肘尖當錨點，
//   校準 8 幀、評分 18 幀：中位 6.0 → 4.1mm（肘尖也鎖定的版本）。
//   小海＝肘點 ＋ 軸 ×（肘尖距離 − FL_TIP_BACK）× 前臂長 ＋ 尺側 ×（±0.5 寸內各刀尺側寬度中位 ÷ 2）× 前臂長
//   ⚠️ FL_TIP_BACK＝0.081 前臂長（≈16.5mm）是用那 8 幀校準幀的 GT 定的，**1 人**；換人可能要重定。
//   肘尖、寬度都在記住姿勢後量 FL_EDGE_LOCK_N 幀取中位數鎖定（按壓的手會撐大輪廓，同邊緣鎖定）。
const FL_TIP_BACK = 0.081;
const FL_MASK_W = 160, FL_MASK_H = 120;   // 遮罩縮小再讀像素，手機上每幀 getImageData 才不會太貴
let flMaskCanvas = null, flMaskCtx = null, flEdgeDistSm = {};
function flReadMask(mask) {
  if (!mask) return null;
  if (!flMaskCanvas) {
    flMaskCanvas = document.createElement("canvas");
    flMaskCanvas.width = FL_MASK_W; flMaskCanvas.height = FL_MASK_H;
    flMaskCtx = flMaskCanvas.getContext("2d", { willReadFrequently: true });
  }
  flMaskCtx.clearRect(0, 0, FL_MASK_W, FL_MASK_H);
  flMaskCtx.drawImage(mask, 0, 0, FL_MASK_W, FL_MASK_H);
  return flMaskCtx.getImageData(0, 0, FL_MASK_W, FL_MASK_H).data;
}
// 遮罩值 0~1。Solutions 版遮罩有的放在 alpha、有的放在紅色通道 → 兩個都看，取有資訊的那個
function flMaskAt(data, x, y, W, H) {
  const mx = Math.floor((x / W) * FL_MASK_W), my = Math.floor((y / H) * FL_MASK_H);
  if (mx < 0 || my < 0 || mx >= FL_MASK_W || my >= FL_MASK_H) return 0;
  const i = (my * FL_MASK_W + mx) * 4;
  const a = data[i + 3], r = data[i];
  return (a < 250 ? a : r) / 255;
}
// 從 from 沿 dir 走，回傳第一個遮罩外的距離（px）；起點不在遮罩內或走太遠都回 null
function flEdgeDistance(data, from, dir, W, H, maxPx) {
  if (flMaskAt(data, from.x, from.y, W, H) < FL_MASK_TH) return null;
  const step = Math.max(1, W / FL_MASK_W / 2);
  for (let d = step; d <= maxPx; d += step) {
    if (flMaskAt(data, from.x + dir.x * d, from.y + dir.y * d, W, H) < FL_MASK_TH) return d;
  }
  return null;
}

// ── 肘點翻邊否決（2026-08-13 T14 的修法，當時只進了 前臂/學長姐法_即時.py，這裡補上）──
//   Pose 會把肘丟到手腕的另一側（手指那側），整段跳位不是抖動，平滑救不了。
//   腕→肘 與 腕→中指根部(lm9) 同向（cos > 0.2）＝ 肘跑到手那邊了 ⇒ 這幀的肘不可信。
const FL_VETO_COS = 0.2;

// ── 前臂變短閘門（2026-09-24 用戶：「從平放手到舉手，pose 的那條綫一直在變短，導致我的點位也變化」）──
//   變短有兩種成因、單鏡頭分不出來：① 前臂真的朝鏡頭傾斜（透視前縮） ② Pose 肘點往腕端滑（08-13 T14 見過）。
//   兩種情況下的小海都不可信 → 不補償、直接擋（同專案「不確定就誠實提示」的做法）。
//   指標：前臂像素長 ÷ 手部同身寸 —— 兩者隨拍攝距離一起縮放，比值與距離無關。
//   基準：這隻手目前為止見過的**最大**比值（前縮只會讓它變小；翻邊的假長度已被 FL_VETO_COS 擋在前面）。
//   掉到基準的 FL_FORESHORT_TH 以下就不顯示。0.85 ≈ cos 32°，估的、沒量過。
const FL_FORESHORT_TH = 0.85;
const FL_RATIO_EMA = 0.3;
let flRatioMax = {}, flRatioSm = {};

// ── 姿勢範本（2026-09-24 用戶：「可以通過動作的向量嗎，就是要求他擺這個姿勢」）──────
//   用戶擺好標準姿勢按「記住姿勢」→ 記下三個量：上臂方向（肩→肘）、前臂方向（肘→腕）、前臂長÷同身寸。
//   之後每幀比對，任一項超出容許就不出點、並說出要怎麼調。有範本時長度基準改用範本的，不再用「見過的最大值」。
//   容許值都是估的（沒量過）：方向 ±20°，長度 ≥ 範本 × FL_FORESHORT_TH。
const FL_POSE_TOL_DEG = 20;
// ── 手腕扭轉閘門（2026-09-24 用戶：「限制姿勢，讓他動作幅度不准太大」）──────────────
//   依據：用戶左手逐幀確認 GT 177 幀（前臂/小海GT_量測記錄_20260924.md）。
//   尺側方向是從手（腕→小指）算的，手腕一扭就翻邊，但小海在手肘後面、幾乎不跟著轉 ⇒
//   只有「手腕扭到跟記住時差不多」那段，推的方向才對。
//   即時頁原本只靠 isDorsalView 判手背，會誤判（那支影片 45 幀出點裡有 7 幀判錯，誤差中位 25mm）。
//   改成記住姿勢時一併記 palmFacing（見 flMeasure 的說明），之後差超過 FL_TWIST_TOL 就不出點。
//   模擬：出點 27 幀、中位 6.3mm、全部 ≤10mm —— ⚠️ 0.3 是用同一支影片挑的，偏樂觀；1 人。
const FL_TWIST_TOL = 0.3;
// ── 前臂長度用哪把尺（2026-09-24 實驗，用戶：「先實驗看看效果」「我怕上手被擋，判斷下哪一種比較好」）──
//   hand  ＝ 前臂 ÷ 手部同身寸（原本的）：手一扭同身寸就變（逐幀 GT 那支 25→38px），看起來像前臂變短。
//   upper ＝ 前臂 ÷ 上臂（肩→肘）：兩個都從 Pose 來、不受手扭轉影響；那支影片有範本時扭腕段 0% 誤擋（hand 10%）。
//           但要肩膀入鏡；肩膀被擋時 Pose 用猜的。
//   auto  ＝ 肩膀可見度 ≥ FL_SHOULDER_VIS 用 upper，否則退回 hand。範本兩種比值都記，所以可以逐幀換尺。
//   ⚠️ 哪個好**還沒實測**（那支影片肩膀一直入鏡），面板兩種 % 都顯示給用戶比。
let flLenMode = "auto";
const FL_SHOULDER_VIS = 0.5;
function flPalmFacing(pts) {
  const v5 = { x: pts[5].x - pts[0].x, y: pts[5].y - pts[0].y }, v17 = { x: pts[17].x - pts[0].x, y: pts[17].y - pts[0].y };
  return (v5.x * v17.y - v5.y * v17.x) / ((Math.hypot(v5.x, v5.y) * Math.hypot(v17.x, v17.y)) || 1);
}
let flPoseRef = {};   // side -> { upper: 角度°, fore: 角度°, ratio, twist }
let flPoseNow = {};   // side -> 目前這幀的同三個量（按「記住」時拿它）
function flAngleDeg(v) { return Math.atan2(v.y, v.x) * 180 / Math.PI; }
function flAngleDiff(a, b) { let d = a - b; while (d > 180) d -= 360; while (d < -180) d += 360; return d; }
function flRememberPose() {
  const now = flPoseNow[flHand];
  if (!now) { flStatus("還抓不到完整的手臂和手，先擺好再按", "warn"); return; }
  // 手掌朝鏡頭時從手算的尺側方向是反的（見 FL_TWIST_TOL），不讓記這種姿勢
  const c = flLastHandCache[flHand];
  if (!c || !c.dorsal) { flStatus("要手背朝鏡頭時才能記住姿勢", "warn"); return; }
  flPoseRef[flHand] = { ...now };
  flRatioMax[flHand] = now.ratio;
}
function flClearPose() { delete flPoseRef[flHand]; flRatioMax = {}; flRatioSm = {}; }

// Hands 隔幀（見 flStartCamera 的 onFrame）與幀率讀數
let flFrameNo = 0, flHandFresh = true, flFps = null, flLastFrameT = null;
const flRecent = [];       // 最近 N 幀的點（px），算波動用
let flScaleMode = "hand";
let flForearmLenPx = null; // 每幀更新：平滑後的肘-腕像素距離
function flScalePx(handCunPx) {
  if (flScaleMode === "forearm" && flForearmLenPx) return flForearmLenPx / FL_FOREARM_CUN;
  return handCunPx;
}

function flSetHand(side) {
  flHand = side;
  flRatioMax = {}; flRatioSm = {};   // 姿勢範本（flPoseRef）按手分開存，換手不清
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
  // minCutoff 1.0 → 0.5（2026-09-24，配合 Pose 內建平滑關掉）：靜止時多壓一點抖；
  // 移動時 cutoff = 0.5 + 0.1 × 速度(px/s)，300px/s 就 30Hz，幾乎不拖。0.5 是估的、沒量過。
  return mode === "one_euro" ? new FLOneEuroFilter({ minCutoff: 0.5, beta: 0.1 }) : new FLNoSmoothing();
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
    // 沿革：09-23 為「動的時候跟不上」改 false → 09-24 早「很容易出現位置波動」改回 true
    //       → 09-24 晚「我移動會偏移」再改 false。
    // 這次改 false 的理由跟 09-23 不同：當時的波動主因是**尺側翻邊**與**同身寸沒平滑**，
    // 那兩個已另外修掉（FL_SIGN_HYST、FL_CUN_EMA）；Pose 內建平滑只剩「移動時拖尾」這個副作用。
    // 靜止時的穩定交給 One Euro（minCutoff 調低到 0.5：靜止多平滑，動起來 beta 讓它自動放開）。
    smoothLandmarks: false,
    // 2026-09-24 用戶：「參考他的做法實時檢測手的邊緣試試看」——
    // 學長用 SAM2 切手臂輪廓（手機跑不動），這裡改用 Pose 自帶的人體分割遮罩，同一次推論順便輸出。
    enableSegmentation: true,
    smoothSegmentation: true,
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
      // 2026-09-24「我移動會偏移」：Hands 改隔幀跑。手的資訊（朝向、小指側、同身寸）變得慢，
      // 已有快取可沿用；省下的時間讓 Pose（肘點＝位置本體）更新得更勤。
      // 沒跑 Hands 的那幀視為「這幀沒手」→ 由 StableLabelTracker 的寬限期（8 幀）撐住。
      flFrameNo++;
      flHandFresh = flFrameNo % 2 === 0 || !flLastHandCache[flHand];
      if (flHandFresh) await flHandsModel.send({ image: video });
      await flPoseModel.send({ image: video });
      const t = performance.now();
      if (flLastFrameT) flFps = flFps ? flFps * 0.9 + 100 / (t - flLastFrameT) : 1000 / (t - flLastFrameT);
      flLastFrameT = t;
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
    smoothedWrist = null,
    vetoed = false;
  if (chosenSide) {
    const idx = FL_POSE_IDX[chosenSide];
    const rawElbow = { x: poseLm[idx.elbow].x * W, y: poseLm[idx.elbow].y * H };
    const rawWrist = { x: poseLm[idx.wrist].x * W, y: poseLm[idx.wrist].y * H };
    // 肘點翻邊否決（見檔頭 FL_VETO_COS）：要在餵進平滑器**之前**擋，否則錯的肘會被平均進去
    const hs = (flHandFresh && flLastHandResults && flLastHandResults.multiHandLandmarks) || []; // 隔幀沒跑 Hands＝舊的手，不拿來比
    if (hs.length) {
      const h = hs.reduce((b, lm) =>
        Math.hypot(lm[0].x * W - rawWrist.x, lm[0].y * H - rawWrist.y) <
        Math.hypot(b[0].x * W - rawWrist.x, b[0].y * H - rawWrist.y) ? lm : b);
      const hd = { x: (h[9].x - h[0].x) * W, y: (h[9].y - h[0].y) * H };
      const ew = { x: rawElbow.x - rawWrist.x, y: rawElbow.y - rawWrist.y };
      const cos = (hd.x * ew.x + hd.y * ew.y) / ((Math.hypot(hd.x, hd.y) * Math.hypot(ew.x, ew.y)) || 1);
      if (cos > FL_VETO_COS) vetoed = true;
    }
  }
  if (vetoed) chosenSide = null;
  if (chosenSide) {
    const idx = FL_POSE_IDX[chosenSide];
    const rawElbow = { x: poseLm[idx.elbow].x * W, y: poseLm[idx.elbow].y * H };
    const rawWrist = { x: poseLm[idx.wrist].x * W, y: poseLm[idx.wrist].y * H };
    smoothedElbow = flGetSmoother(`elbow_${chosenSide}`).filter(rawElbow, now);
    smoothedWrist = flGetSmoother(`wrist_${chosenSide}`).filter(rawWrist, now);
    axis = flUnit({ x: smoothedElbow.x - smoothedWrist.x, y: smoothedElbow.y - smoothedWrist.y });
    flForearmLenPx = Math.hypot(smoothedElbow.x - smoothedWrist.x, smoothedElbow.y - smoothedWrist.y);

    // 灰色肘-腕參考線：不管穴位顯不顯示都畫，方便分辨「Pose有沒有抓到」跟「穴位有沒有顯示」
    if (flShowAux) {
    ctx.beginPath();
    ctx.moveTo(smoothedWrist.x, smoothedWrist.y);
    ctx.lineTo(smoothedElbow.x, smoothedElbow.y);
    ctx.strokeStyle = "rgba(150,160,180,0.6)";
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    }
  }

  // ── 2) Hand：掌側/背側二分判定 + cun/尺側方向 ───────────────────────────
  let observed = null; // "palmar" / "dorsal" / null（這幀沒偵測到手）
  let handedLabel = null;
  // 從偵測到的手裡挑「手腕離這隻手臂的 Pose 手腕最近」的那隻（見檔頭 flHand 說明）
  let handLm = null, handedness = null, handCount = 0, matchDist = null, rejected = false;
  const allHands = (flHandFresh && flLastHandResults && flLastHandResults.multiHandLandmarks) || [];
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
      flLastHandCache[chosenSide] = { cunPx: cunSm, ulnarSign, dorsal, handedLabel, twist: flPalmFacing(pts) };
    }

    if (flShowAux) for (const p of pts) {
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
  let edgePt = null, edgeInfo = null, tipPt = null;
  let postureFail = null, lenPct = null, poseDiff = null;
  let lenPctHand = null, lenPctUpper = null, lenUsed = null, shoulderVis = null, edgeLocking = null;

  if (chosenSide) {
    const tracker = flUseStable ? flGetTracker(chosenSide) : null;
    stable = flUseStable ? tracker.update(observed) : observed;
    const cached = flLastHandCache[chosenSide];

    // ── 姿勢／前臂長度閘門（見檔頭 FL_POSE_TOL_DEG、FL_FORESHORT_TH）──
    postureFail = null;
    if (cached && cached.cunPx) {
      const idx = FL_POSE_IDX[chosenSide];
      const sh = flGetSmoother(`shoulder_${chosenSide}`).filter(
        { x: poseLm[idx.shoulder].x * W, y: poseLm[idx.shoulder].y * H }, now);
      const upperLen = Math.hypot(smoothedElbow.x - sh.x, smoothedElbow.y - sh.y);
      shoulderVis = poseLm[idx.shoulder].visibility ?? 0;
      const raw = { hand: flForearmLenPx / cached.cunPx, upper: upperLen > 1 ? flForearmLenPx / upperLen : null };
      const rs = flRatioSm[chosenSide] || {};
      const ema = (k) => raw[k] == null ? rs[k] : rs[k] != null ? rs[k] + (raw[k] - rs[k]) * FL_RATIO_EMA : raw[k];
      flRatioSm[chosenSide] = { hand: ema("hand"), upper: ema("upper") };
      const cur = {
        upper: flAngleDeg({ x: smoothedElbow.x - sh.x, y: smoothedElbow.y - sh.y }),
        fore: flAngleDeg({ x: smoothedWrist.x - smoothedElbow.x, y: smoothedWrist.y - smoothedElbow.y }),
        ratio: flRatioSm[chosenSide].hand,          // 舊欄位名保留＝同身寸比值
        ratioUpper: flRatioSm[chosenSide].upper,
        twist: cached.twist,
      };
      flPoseNow[chosenSide] = cur;
      const ref = flPoseRef[chosenSide];
      // 🐞 09-24 逐幀 GT 那支：沒記姿勢時用「見過的最大值」當基準，摸臉那一下 Pose 認錯冒出假長度，
      //    之後整段 100% 被擋 → 改成**一定要先記住姿勢**才出點（也就是用戶要的「限制姿勢」）
      if (!ref) postureFail = "先把手背朝鏡頭、擺好姿勢，按「📌 記住姿勢」";
      else {
        const dU = flAngleDiff(cur.upper, ref.upper), dF = flAngleDiff(cur.fore, ref.fore);
        poseDiff = { dU, dF };
        lenPctHand = cur.ratio / ref.ratio;
        lenPctUpper = cur.ratioUpper != null && ref.ratioUpper ? cur.ratioUpper / ref.ratioUpper : null;
        const useUpper = flLenMode === "upper" || (flLenMode === "auto" && shoulderVis >= FL_SHOULDER_VIS && lenPctUpper != null);
        lenUsed = useUpper ? "upper" : "hand";
        lenPct = useUpper ? lenPctUpper : lenPctHand;
        if (flLenMode === "upper" && shoulderVis < FL_SHOULDER_VIS) postureFail = "看不到肩膀（上臂當尺需要肩膀入鏡）";
        else if (Math.abs(dU) > FL_POSE_TOL_DEG) postureFail = `上臂方向跟記住的姿勢差 ${Math.abs(dU).toFixed(0)}°，請擺回去`;
        else if (Math.abs(dF) > FL_POSE_TOL_DEG) postureFail = `前臂方向跟記住的姿勢差 ${Math.abs(dF).toFixed(0)}°，請擺回去`;
        else if (ref.twist != null && cur.twist != null && Math.abs(cur.twist - ref.twist) > FL_TWIST_TOL)
          postureFail = "手腕扭轉跟記住的姿勢不一樣，請把手腕轉回去";
        poseDiff.dT = ref.twist != null && cur.twist != null ? cur.twist - ref.twist : null;
        if (!postureFail && lenPct != null && lenPct < FL_FORESHORT_TH)
          postureFail = `前臂變短（只剩 ${(lenPct * 100).toFixed(0)}%），前臂可能朝鏡頭傾斜，請放平`;
      }
    }

    // 2026-09-24 改：掌心 → **手背**朝鏡頭才顯示（用戶：「試試看好了」）。
    //   小海在肘後內側（鷹嘴與內上髁之間），從背面才看得到；學長的「肘點與尺側邊緣中點」
    //   也是在手背面／尺側才用。09-22 選掌心是因為側面時 Hands 幾乎抓不到手，
    //   但手背朝鏡頭 Hands 抓得到（外關就是這樣做的），所以不必再遷就。
    if (stable !== "dorsal" || cached == null || postureFail) {
      reason =
        stable === "dorsal" && cached && postureFail
          ? postureFail
          : stable === "palmar"
          ? "目前掌心朝鏡頭（小海在手肘背面，請把手背轉向鏡頭）"
          : handLm == null
            ? rejected
              ? `畫面裡的手不是${handZh}（離${handZh}腕太遠）`
              : flUseStable
              ? "Hand 未偵測到，且已超過跨幀寬限期"
              : "Hand 未偵測到"
            : "尚未累積到足夠的穩定判定";
    } else {
      const dirNow = { x: -axis.y * cached.ulnarSign, y: axis.x * cached.ulnarSign };
      const scale = flScalePx(cached.cunPx);
      const pref = flPoseRef[chosenSide];
      if (flOffsetMode === "tip") {
        const L = flForearmLenPx;
        if (pref && pref.tipFrac != null && pref.sideFrac != null) {
          const a = (pref.tipFrac - FL_TIP_BACK) * L, b = pref.sideFrac * L / 2;
          point = { x: smoothedElbow.x + axis.x * a + dirNow.x * b, y: smoothedElbow.y + axis.y * a + dirNow.y * b };
          tipPt = { x: smoothedElbow.x + axis.x * pref.tipFrac * L, y: smoothedElbow.y + axis.y * pref.tipFrac * L };
          edgePt = { x: smoothedElbow.x + dirNow.x * pref.sideFrac * L, y: smoothedElbow.y + dirNow.y * pref.sideFrac * L };
          edgeInfo = `肘尖錨定（已鎖定：肘→尖 ${scale ? (pref.tipFrac * L / scale).toFixed(2) : "?"} 寸、肘→邊 ${scale ? (pref.sideFrac * L / scale).toFixed(2) : "?"} 寸）`;
        } else if (pref && L) {
          const prof = flMeasureProfile(flLastPoseResults && flLastPoseResults.segmentationMask, smoothedElbow, axis, dirNow, cached.cunPx, W, H);
          pref.tipSamples = pref.tipSamples || []; pref.sideSamples = pref.sideSamples || [];
          if (prof) {
            const ul = prof.slices.filter((x) => Math.abs(x.s) <= 0.5 && x.ul).map((x) => x.ul / L);
            if (prof.tip && ul.length) { pref.tipSamples.push(prof.tip / L); pref.sideSamples.push(...ul); }
          }
          const n = pref.tipSamples.length;
          if (n >= FL_EDGE_LOCK_N) {
            const mdn = (v) => { const w = v.slice().sort((p, q) => p - q); return w[w.length >> 1]; };
            pref.tipFrac = mdn(pref.tipSamples); pref.sideFrac = mdn(pref.sideSamples);
          }
          reason = `量肘尖與手臂寬度中 ${Math.min(n, FL_EDGE_LOCK_N)}/${FL_EDGE_LOCK_N}，手先別動、另一隻手先別放上來`;
          edgeInfo = prof ? "校準中" : "沒有遮罩，無法校準";
        }
      } else if (flOffsetMode === "edge" && pref && pref.edgeFrac) {
        const dL = pref.edgeFrac * flForearmLenPx;
        edgePt = { x: smoothedElbow.x + dirNow.x * dL, y: smoothedElbow.y + dirNow.y * dL };
        point = { x: smoothedElbow.x + dirNow.x * dL / 2, y: smoothedElbow.y + dirNow.y * dL / 2 };
        edgeInfo = `已鎖定（記住姿勢後量的，肘→邊 ${scale ? (dL / scale).toFixed(2) : "?"} 寸）`;
      } else if (flOffsetMode === "edge") {
        const mask = flReadMask(flLastPoseResults && flLastPoseResults.segmentationMask);
        const d = mask && scale ? flEdgeDistance(mask, smoothedElbow, dirNow, W, H, FL_EDGE_MAX_CUN * scale) : null;
        if (d != null) {
          const prevD = flEdgeDistSm[chosenSide];
          const dSm = prevD != null ? prevD + (d - prevD) * FL_EDGE_EMA : d;
          flEdgeDistSm[chosenSide] = dSm;
          edgePt = { x: smoothedElbow.x + dirNow.x * dSm, y: smoothedElbow.y + dirNow.y * dSm };
          point = { x: smoothedElbow.x + dirNow.x * dSm / 2, y: smoothedElbow.y + dirNow.y * dSm / 2 };
          edgeInfo = `找到（肘→邊 ${scale ? (dSm / scale).toFixed(2) : "?"} 寸）`;
          if (pref && flForearmLenPx) {
            (pref.edgeSamples = pref.edgeSamples || []).push(d / flForearmLenPx);
            if (pref.edgeSamples.length >= FL_EDGE_LOCK_N) {
              const v = pref.edgeSamples.slice().sort((a, b) => a - b);
              pref.edgeFrac = v[v.length >> 1];
            }
            edgeLocking = `量邊緣中 ${Math.min(pref.edgeSamples.length, FL_EDGE_LOCK_N)}/${FL_EDGE_LOCK_N}，另一隻手先別放上來`;
          }
        } else {
          edgeInfo = mask ? "沒找到 → 暫用固定 0.5 寸" : "沒有遮罩 → 暫用固定 0.5 寸";
          point = flLocateXiaohai(smoothedElbow, dirNow, scale, FL_ULNAR_OFFSET_CUN);
        }
      } else {
        point = flLocateXiaohai(smoothedElbow, dirNow, scale, FL_ULNAR_OFFSET_CUN);
      }
    }
  } else {
    reason = vetoed ? "這幀手肘位置不可信（Pose 把肘認到手那一側）"
      : poseLm ? `${handZh}肘／腕可見度低於門檻 ${FL_FALLBACK_MIN_VISIBILITY}` : "Pose 未偵測到人";
  }

  // 測試用：這幀的點與幾何（tests/forearm_press_sim.py 讀）
  window.flDebug = point ? { point, elbow: smoothedElbow, edgePt, ulnar: flLastHandCache[chosenSide] && axis
    ? { x: -axis.y * flLastHandCache[chosenSide].ulnarSign, y: axis.x * flLastHandCache[chosenSide].ulnarSign } : null,
    cun: flScalePx(flLastHandCache[chosenSide].cunPx), frame: flFrameNo } : null;

  // ── 4) 畫穴位 / 文字 ─────────────────────────────────────────────────
  if (flShowAux && point && tipPt) {
    // 洋紅：肘點 → 肘尖（肘尖錨定的縱向錨點）
    ctx.beginPath();
    ctx.moveTo(smoothedElbow.x, smoothedElbow.y);
    ctx.lineTo(tipPt.x, tipPt.y);
    ctx.strokeStyle = "rgba(255,64,200,0.9)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  if (flShowAux && point && edgePt) {
    // 青色：肘點 → 尺側邊緣的橫截線（學長的 elbow_ulnar），小海在它的中點
    ctx.beginPath();
    ctx.moveTo(smoothedElbow.x, smoothedElbow.y);
    ctx.lineTo(edgePt.x, edgePt.y);
    ctx.strokeStyle = "rgba(0,229,255,0.9)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(edgePt.x, edgePt.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = "rgb(0,229,255)";
    ctx.fill();
  }
  if (point) {
    // 2026-09-24 改成手部同款（js/acu-math.js 的 drawConfidenceDisc／drawAcuCenterDot／drawAcuLabel）：
    //   淡綠細線圓盤（半徑＝手部判定範圍 CONF_DISC_CUN 寸）＋綠色實心點＋白字穴名。
    //   手部圓盤會依皮膚朝向壓扁；小海沒有法向資訊，畫正圓。原本的藍色粗圈與左上角大字拿掉。
    const discR = Math.max(8, CONF_DISC_CUN * (flScalePx(flLastHandCache[chosenSide].cunPx) || 20));
    ctx.save();
    ctx.beginPath();
    ctx.arc(point.x, point.y, discR, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0, 255, 133, 0.14)";
    ctx.fill();
    ctx.strokeStyle = "rgba(0, 255, 133, 1)";
    ctx.lineWidth = 2.4;
    ctx.stroke();
    ctx.restore();
    drawAcuCenterDot(ctx, point.x, point.y);
    drawAcuLabel(ctx, point.x, point.y, "小海", discR);
    flStatus(edgeLocking || ("顯示中（手背朝鏡頭）" + (usingCache && handLm == null ? "，手沿用快取" : "")), edgeLocking ? "warn" : "ok");
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
      (flFps ? `每秒 <b>${flFps.toFixed(1)}</b> 幀　` : "") +
      `姿勢範本 <b>${flPoseRef[flHand] ? "已記住" : "未記住（只檢查前臂長度）"}</b>` +
      (lenPctHand != null ? (() => {
        const pc = (v, k) => v == null ? "—" :
          `<b class='${v >= FL_FORESHORT_TH ? "lv-ok" : "lv-bad"}'${lenUsed === k ? " style='text-decoration:underline'" : ""}>${(v * 100).toFixed(0)}%</b>`;
        return `　前臂長度：上臂尺 ${pc(lenPctUpper, "upper")}　同身寸尺 ${pc(lenPctHand, "hand")}（底線＝這幀用的）` +
          `　肩膀可見度 <b class='${shoulderVis >= FL_SHOULDER_VIS ? "lv-ok" : "lv-bad"}'>${shoulderVis.toFixed(2)}</b>`;
      })() : "") +
      (poseDiff ? `　上臂差 <b>${poseDiff.dU.toFixed(0)}°</b>　前臂差 <b>${poseDiff.dF.toFixed(0)}°</b>（容許 ±${FL_POSE_TOL_DEG}°）` +
        (poseDiff.dT != null ? `　扭轉差 <b class='${Math.abs(poseDiff.dT) <= FL_TWIST_TOL ? "lv-ok" : "lv-bad"}'>${poseDiff.dT.toFixed(2)}</b>（容許 ±${FL_TWIST_TOL}）` : "") : "") +
      `　　` +
      `限定 <b>${handZh}</b>　　` +
      `偏移 <b>${flOffsetMode === "edge" ? "輪廓邊緣（學長公式）" : "固定 0.5 寸"}</b>` +
      (edgeInfo ? `：${edgeInfo}` : "") + `　` +
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

// ── 單幀量測（2026-09-24，給 forearm-measure.html 照片／影片量測用）─────────────
// 跟 flProcessFrame 同一套步驟（限定側 → 配對手 → 肘點翻邊否決 → 尺側方向 → 邊緣），差別：
//   ① 不平滑、不跨幀快取、沒有遲滯 —— 每幀獨立算，才對得上「這一幀」畫的點
//   ② 不做取捨：肘點本身／固定 0.5 寸×同身寸／固定 0.5 寸×骨度／即時邊緣 全部算，一起跟 GT 比
//   ③ 閘門（手背、翻邊、可見度）只記錄、不擋；前臂變短與姿勢範本要跨幀基準，交給量測頁事後算
// ⚠️ 即時頁的點＝這裡的某個候選再經過平滑；兩者公式相同，改公式要兩處一起改。
function flMeasure(poseRes, handRes, W, H, side) {
  const out = { side, W, H, ok: false };
  const lm = poseRes && poseRes.poseLandmarks;
  if (!lm) { out.reason = "Pose 未偵測到人"; return out; }
  const idx = FL_POSE_IDX[side];
  const P = (i) => ({ x: lm[i].x * W, y: lm[i].y * H });
  const elbow = P(idx.elbow), wrist = P(idx.wrist), shoulder = P(idx.shoulder);
  Object.assign(out, { elbow, wrist, shoulder });
  out.vis = Math.min(lm[idx.elbow].visibility ?? 0, lm[idx.wrist].visibility ?? 0);
  const fl = Math.hypot(elbow.x - wrist.x, elbow.y - wrist.y);
  out.forearmLenPx = fl;
  const axis = flUnit({ x: elbow.x - wrist.x, y: elbow.y - wrist.y });

  const hands = (handRes && handRes.multiHandLandmarks) || [];
  out.handCount = hands.length;
  let best = -1, bestD = Infinity;
  hands.forEach((h, i) => {
    const d = Math.hypot(h[0].x * W - wrist.x, h[0].y * H - wrist.y);
    if (d < bestD) { bestD = d; best = i; }
  });
  out.matchDist = best >= 0 && fl > 1 ? bestD / fl : null;
  if (best < 0) { out.reason = "Hand 未偵測到"; return out; }
  if (out.matchDist > FL_HAND_MATCH_RATIO) { out.reason = "畫面裡的手不是這隻手臂的"; return out; }
  const h = hands[best];
  const hd = handRes.multiHandedness && handRes.multiHandedness[best];
  const pts = h.map((p) => ({ x: p.x * W, y: p.y * H }));

  const hv = { x: pts[9].x - pts[0].x, y: pts[9].y - pts[0].y };
  const ew = { x: elbow.x - wrist.x, y: elbow.y - wrist.y };
  const cos = (hv.x * ew.x + hv.y * ew.y) / ((Math.hypot(hv.x, hv.y) * Math.hypot(ew.x, ew.y)) || 1);
  out.vetoed = cos > FL_VETO_COS;
  out.handLabel = hd ? hd.label : null;
  out.dorsal = hd ? isDorsalView(h, hd) : null;
  out.cunHandPx = computeCunPx(h, W, H);
  out.cunForearmPx = fl / FL_FOREARM_CUN;
  // 手腕扭轉讀數（2026-09-24 用戶：「我有扭轉手腕，手肘應該會有點偏差」）：
  //   palmFacing ＝ (腕→食指根) × (腕→小指根) 的正規化叉積 ≈ sin(兩向量夾角)，有號。
  //   掌面正對鏡頭時絕對值大、轉到側面（手刀）趨近 0、翻面後變號 —— 連續的扭轉量，不是二分。
  //   符號跟左右手、鏡像有關，只拿來看「變化」，不拿絕對正負下結論。
  const v5 = { x: pts[5].x - pts[0].x, y: pts[5].y - pts[0].y }, v17 = { x: pts[17].x - pts[0].x, y: pts[17].y - pts[0].y };
  out.palmFacing = (v5.x * v17.y - v5.y * v17.x) / ((Math.hypot(v5.x, v5.y) * Math.hypot(v17.x, v17.y)) || 1);
  out.palmWidthCun = Math.hypot(pts[17].x - pts[5].x, pts[17].y - pts[5].y) / out.cunHandPx;
  out.handPts = pts.map((p) => ({ x: +p.x.toFixed(1), y: +p.y.toFixed(1) }));
  const dir = flUlnarDirection(axis, pts[0], pts[17]);
  out.ulnarDir = dir;

  const mask = flReadMask(poseRes.segmentationMask);
  const d = mask ? flEdgeDistance(mask, elbow, dir, W, H, FL_EDGE_MAX_CUN * out.cunHandPx) : null;
  out.edgeDistPx = d;
  out.profile = flMeasureProfile(poseRes.segmentationMask, elbow, axis, dir, out.cunHandPx, W, H);
  const at = (k) => ({ x: elbow.x + dir.x * k, y: elbow.y + dir.y * k });
  out.cand = {
    elbow: { ...elbow },
    fixed_hand: at(FL_ULNAR_OFFSET_CUN * out.cunHandPx),
    fixed_forearm: at(FL_ULNAR_OFFSET_CUN * out.cunForearmPx),
    edge: d != null ? at(d / 2) : null,
  };
  out.posture = {
    upper: flAngleDeg({ x: elbow.x - shoulder.x, y: elbow.y - shoulder.y }),
    fore: flAngleDeg({ x: wrist.x - elbow.x, y: wrist.y - elbow.y }),
    ratio: fl / out.cunHandPx,
  };
  out.ok = true;
  return out;
}

// ── 寬度剖面＋肘尖（2026-09-24，用戶：「像我以前一樣把手肘拆成多個部分算寬度，開始時算好」）──
//   延伸 08-12 方案 C（前臂/方案C_寬度剖面.py）。量測頁專用，即時頁沒用到。
//   沿前臂軸切刀：s＝離 Pose 肘點幾寸（負＝往腕、正＝往肘外），每刀從軸上往尺側（u）、橈側（−u）走到遮罩外。
//   肘尖 tip＝從肘點沿「腕→肘」方向一直走到遮罩外的距離（肘彎時那裡就是鷹嘴那側的輪廓）。
//   遮罩讀 640 寬（即時頁 160×120 在 1280 畫面上一格 8px ≈ 0.3 寸，量寬度太粗）。
//   單位全是影像 px；分析端（前臂/小海GT_寬度剖面.py）再換算。
const FL_PROFILE_S = [-2, -1.75, -1.5, -1.25, -1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1];
let flProfCanvas = null, flProfCtx = null;
function flMeasureProfile(maskImg, elbow, axis, u, cun, W, H) {
  if (!maskImg || !cun) return null;
  const MW = Math.min(640, W), MH = Math.round(MW * H / W);
  if (!flProfCanvas) {
    flProfCanvas = document.createElement("canvas");
    flProfCtx = flProfCanvas.getContext("2d", { willReadFrequently: true });
  }
  flProfCanvas.width = MW; flProfCanvas.height = MH;
  flProfCtx.clearRect(0, 0, MW, MH);
  flProfCtx.drawImage(maskImg, 0, 0, MW, MH);
  const data = flProfCtx.getImageData(0, 0, MW, MH).data;
  const inside = (x, y) => {
    const mx = Math.floor(x / W * MW), my = Math.floor(y / H * MH);
    if (mx < 0 || my < 0 || mx >= MW || my >= MH) return false;
    const i = (my * MW + mx) * 4, a = data[i + 3], r = data[i];
    return (a < 250 ? a : r) / 255 >= FL_MASK_TH;
  };
  const step = W / MW / 2, maxPx = 4 * cun;
  const walk = (p, d) => {
    if (!inside(p.x, p.y)) return null;
    for (let k = step; k <= maxPx; k += step) if (!inside(p.x + d.x * k, p.y + d.y * k)) return k;
    return null;
  };
  const neg = { x: -u.x, y: -u.y };
  const slices = FL_PROFILE_S.map((s) => {
    const c = { x: elbow.x + axis.x * s * cun, y: elbow.y + axis.y * s * cun };
    return { s, ul: walk(c, u), ra: walk(c, neg) };
  });
  return { slices, tip: walk(elbow, axis) };
}

if (!window.FL_NO_AUTOSTART) window.addEventListener("DOMContentLoaded", flStart);
