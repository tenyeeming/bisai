// ═══════════════════════════════════════════════════════════════════
// 定位前檢測（2026-11-01，App 批 79／88／108／121～124／127 搬到網頁）
//
// 用戶：「我發現檢測的時候那個框框沒有出現」（網頁）→ 選 B「整套搬過來」。
// 對應 App：
//   acu/HandCalib.kt        → HandCalibrator、fingersOpen、calibFacingOk、calibBox、pointsInBox
//   locate/FaceCalib.kt     → FaceCalibrator
//   MassageScreen.kt CalibGuide／calibGuideAsset／calibGuideFlip → drawCalibGuide、calibImgFile
//   SessionViewModel.kt     → needsHandCalib／recordHandCalib／skipHandCalib／activeHandCalib
// 數字一律照 App（2 秒、至少 5 幀、斜 ≤30°、掌軸抖 15%、框 80%／3:4／寬容 4%）。
//
// ⭐ 手的鍵一律用「真實的手」'right'／'left'（＝App 的 Tasks 標籤）。
//    網頁是 Solutions API ＋ 未鏡像畫面：標籤 'Left' ＝ 真實右手（見 vision.js requireLabel 那段）。
//    換算只走 handKeyOfLabel／labelOfHandKey，別在別處自己翻。
//
// ⚠️ 網頁沒有的（刻意沒搬，記在 開發日誌）：
//   · 批 126「關掉檢測前先量一次存檔」那一頁 —— 網頁關掉時直接用最近一次量到的寸比例（有的話）。
//   · 批 125 臉部「你的正面」改箭頭 —— 網頁臉部模型沒有上下角，箭頭照舊看絕對左右角。
//   · 臉部「抬／低頭太多」那條（App 用官方矩陣算上下角）—— 網頁算不出，不擋。
// ═══════════════════════════════════════════════════════════════════

const CALIB_TILT_MAX_DEG = 30;
const CALIB_HOLD_MS = 2000;
const CALIB_MIN_SAMPLES = 5;
const CALIB_AXIS_JITTER = 0.15;
const CALIB_FINGER_OPEN_RATIO = 1.35;
const CALIB_BOX_FRAC = 0.8;
const CALIB_BOX_ASPECT = 0.75;
const CALIB_BOX_SLACK = 0.04;
/** 量好打勾停多久再接下去（App delay(1200)） */
const CALIB_DONE_SHOW_MS = 1200;
/** 臉部：左右轉頭上限（＝FACE_BIND_MAX_DEG，face-anchor.js 記住這張臉的條件） */
const FACE_CALIB_YAW_MAX = 12;

const handKeyOfLabel = (label) => label === 'Left' ? 'right' : 'left';
const labelOfHandKey = (key) => key === 'right' ? 'Left' : 'Right';

function _calibMedian(v) {
  const s = [...v].sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** 四指（食、中、無名、小）都伸直張開嗎。px：21 點像素座標 [{x,y}] */
function fingersOpen(px) {
  if (!px || px.length < 21) return false;
  const w = px[0], d = (i) => Math.hypot(px[i].x - w.x, px[i].y - w.y);
  return [[5, 8], [9, 12], [13, 16], [17, 20]].every(([mcp, tip]) => d(tip) > d(mcp) * CALIB_FINGER_OPEN_RATIO);
}

/**
 * 手部檢測狀態機（App HandCalibrator）。一幀呼叫一次 update；條件不成立就從頭收。
 * sample：{ axisPx, cunPx, tb, tiltDeg, fingersOpen, atMs, inBox, facingOk }；null＝沒看到手
 * 回 { progress, issue, result }，issue：'no-hand'|'wrong-hand'|'out-box'|'wrong-side'|'tilted'|'fingers'|'moving'|null
 * result：{ k（寸 ÷ 掌軸長）, tb0 }
 */
class HandCalibrator {
  constructor(holdMs = CALIB_HOLD_MS, minSamples = CALIB_MIN_SAMPLES) {
    this.holdMs = holdMs; this.minSamples = minSamples; this.reset();
  }
  reset() { this.samples = []; this.done = null; }
  update(s, wrongHand = false) {
    if (this.done) return { progress: 1, issue: null, result: this.done };
    const issue = wrongHand ? 'wrong-hand'
      : (!s || !(s.axisPx > 1) || !(s.cunPx > 0)) ? 'no-hand'
      : !s.inBox ? 'out-box'
      : !s.facingOk ? 'wrong-side'
      : s.tiltDeg > CALIB_TILT_MAX_DEG ? 'tilted'
      : !s.fingersOpen ? 'fingers'
      : null;
    if (issue) { this.samples = []; return { progress: 0, issue, result: null }; }

    this.samples.push(s);
    const axes = this.samples.map(x => x.axisPx);
    if (Math.max(...axes) / Math.min(...axes) - 1 > CALIB_AXIS_JITTER) {
      this.samples = [s];                                  // 動太多：只留這一幀重新起算
      return { progress: 0, issue: 'moving', result: null };
    }
    const span = s.atMs - this.samples[0].atMs;
    const progress = Math.min(1, Math.max(0, span / this.holdMs));
    const tbs = this.samples.map(x => x.tb).filter(v => v != null);
    if (span >= this.holdMs && this.samples.length >= this.minSamples && tbs.length >= this.minSamples / 2) {
      this.done = { k: _calibMedian(this.samples.map(x => x.cunPx / x.axisPx)), tb0: _calibMedian(tbs) };
      return { progress: 1, issue: null, result: this.done };
    }
    return { progress, issue: null, result: null };
  }
}

/**
 * 臉部檢測狀態機（App FaceCalibrator）。sample：{ ipdPx, yawDeg, pitchDeg, inBox, atMs }；null＝沒看到臉
 * issue：'no-face'|'out-box'|'turned'|'pitched'|'moving'|null；網頁 pitchDeg 一律 null（不擋）
 */
class FaceCalibrator {
  constructor(holdMs = CALIB_HOLD_MS, minSamples = CALIB_MIN_SAMPLES) {
    this.holdMs = holdMs; this.minSamples = minSamples; this.samples = []; this.done = null;
  }
  update(s) {
    if (this.done) return this.done;
    const issue = (!s || !(s.ipdPx > 1)) ? 'no-face'
      : !s.inBox ? 'out-box'
      : (s.yawDeg == null || Math.abs(s.yawDeg) > FACE_CALIB_YAW_MAX) ? 'turned'
      : (s.pitchDeg != null && Math.abs(s.pitchDeg) > 30) ? 'pitched'
      : null;
    if (issue) { this.samples = []; return { progress: 0, issue, done: false }; }
    this.samples.push(s);
    const ipds = this.samples.map(x => x.ipdPx);
    if (Math.max(...ipds) / Math.min(...ipds) - 1 > CALIB_AXIS_JITTER) {
      this.samples = [s];
      return { progress: 0, issue: 'moving', done: false };
    }
    const span = s.atMs - this.samples[0].atMs;
    if (span >= this.holdMs && this.samples.length >= this.minSamples) {
      this.done = { progress: 1, issue: null, done: true, yaw0: _calibMedian(this.samples.map(x => x.yawDeg)) };
      return this.done;
    }
    return { progress: Math.min(1, Math.max(0, span / this.holdMs)), issue: null, done: false };
  }
}

/** 量手時朝鏡頭的是不是這一穴那一面（App calibFacingOk，批 127）。兩面都可以的穴、查不到的穴不擋 */
function calibFacingOk(acuName, dorsal) {
  if (typeof BILATERAL_ACUPOINTS !== 'undefined' && BILATERAL_ACUPOINTS.has(acuName)) return true;
  const acu = typeof ACUPOINTS !== 'undefined' ? ACUPOINTS.find(a => a.name === acuName) : null;
  if (!acu || !acu.side) return true;
  return (acu.side === 'palm') !== dorsal;
}

/** 這一穴在手心嗎（挑手心那兩張圖、提示講「手心朝鏡頭」） */
function calibAcuOnPalm(acuName) {
  const acu = typeof ACUPOINTS !== 'undefined' ? ACUPOINTS.find(a => a.name === acuName) : null;
  return !!(acu && acu.side === 'palm');
}

/** 檢測框：取景框中央直立圓角長方形（寬:高 3:4）。畫的跟判斷的都用它 → 永遠同一個框 */
function calibBox(W, H) {
  const w = Math.min(W * CALIB_BOX_FRAC, H * CALIB_BOX_FRAC * CALIB_BOX_ASPECT);
  const h = w / CALIB_BOX_ASPECT;
  return { l: (W - w) / 2, t: (H - h) / 2, w, h };
}

/** 所有點（畫布座標 {x,y}）都在框裡嗎（含寬容）。框左右置中，前鏡頭鏡像不影響結果 */
function pointsInBox(pts, b) {
  if (!pts || !pts.length) return false;
  const m = b.w * CALIB_BOX_SLACK;
  return pts.every(p => p.x >= b.l - m && p.x <= b.l + b.w + m && p.y >= b.t - m && p.y <= b.t + b.h + m);
}

// ── 圖（App assets/calib_*.png → assets/calib/）────────────────────────
// 四張手圖、四張手肘圖都畫成前鏡頭（鏡像）的樣子；後鏡頭畫面沒鏡像 → 要左右翻（App calibGuideFlip）。
const calibImgFile = (palm, handKey) => `calib_${palm ? 'palm' : 'back'}_${handKey === 'left' ? 'left' : 'right'}.png`;
const calibForearmImgFile = (palm, handKey) => `calib_forearm_${palm ? 'palm' : 'back'}_${handKey === 'left' ? 'left' : 'right'}.png`;
const CALIB_FACE_IMG = 'calib_face.png';
const _calibImgs = {};
function calibImg(file) {
  if (typeof Image === 'undefined') return null;
  let img = _calibImgs[file];
  // ?v=：圖換過（2026-11-03 手肘改放平）時改這個，瀏覽器才不會拿快取的舊圖
  if (!img) { img = new Image(); img.src = 'assets/calib/' + file + '?v=20261103flat'; _calibImgs[file] = img; }
  return img.complete && img.naturalWidth ? img : null;   // 還沒載完這一幀就先只畫框
}

/**
 * 畫檢測框（App CalibGuide）：半透明圖（直圖框高 88%、橫圖框寬 92%）、淡白框、進度沿框走一圈、量好變綠＋✓。
 * ctx 必須是**沒有鏡像變換**的狀態；flipImg＝圖要不要左右翻（後鏡頭 true）。
 * sc：畫布像素 ÷ CSS 像素（screenScale），讓線寬、圓角在各種螢幕上看起來一樣粗。
 */
function drawCalibGuide(ctx, b, progress, done, sc, file, flipImg) {
  const img = file ? calibImg(file) : null;
  ctx.save();
  if (img) {
    // 橫的圖（手肘檢測放平，2026-11-03 用戶：「手肘檢測的時候幫我把手轉成放平的而不是舉手」，同 App 批 153）
    //   改成佔框寬 92%；直的圖（手、臉）照舊佔框高 88%
    const iw = img.naturalWidth, ih = img.naturalHeight, landscape = iw > ih;
    const dw = landscape ? b.w * 0.92 : b.h * 0.88 * iw / ih;
    const dh = landscape ? dw * ih / iw : b.h * 0.88;
    const cx = b.l + b.w / 2, cy = b.t + b.h / 2;
    ctx.save();
    ctx.globalAlpha = done ? 0.45 : 0.28;
    ctx.translate(cx, cy);
    if (flipImg) ctx.scale(-1, 1);
    ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
  }
  const r = Math.min(24 * sc, b.w / 4), lw = 5 * sc;
  const path = () => {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(b.l, b.t, b.w, b.h, r); else ctx.rect(b.l, b.t, b.w, b.h);
  };
  ctx.lineWidth = lw;
  path(); ctx.strokeStyle = 'rgba(255,255,255,.33)'; ctx.stroke();
  const per = 2 * (b.w + b.h) - 8 * r + 2 * Math.PI * r;
  const len = per * (done ? 1 : Math.min(1, Math.max(0, progress)));
  if (len > 0) {
    ctx.setLineDash([len, per + 1]);
    ctx.lineCap = 'round';
    path(); ctx.strokeStyle = done ? '#4FBF8B' : '#fff'; ctx.stroke();
    ctx.setLineDash([]);
  }
  if (done) {
    ctx.fillStyle = '#4FBF8B';
    ctx.font = `600 ${Math.round(b.h * 0.22)}px system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('✓', b.l + b.w / 2, b.t + b.h / 2);
  }
  ctx.restore();
}

// ── 這一次療程的檢測紀錄（App SessionViewModel 手部校準那段）───────────────
// ⭐ 每一穴都量（App 批 124）：每筆量手／略過都記「是在哪一穴」，換到別穴自動算沒量。
// ⭐ 新療程要重量（App 批 130）：記錄綁在 state.selectedAcupoints 這個陣列上 ——
//    每次開新療程（首頁、選穴、圖冊練習、我的流程）都會換一個新陣列，舊紀錄自然作廢，
//    不必去每個入口加清除。
let calibEnabled = (() => { try { return JSON.parse(localStorage.getItem('handCalib')) !== false; } catch { return true; } })();
function setCalibEnabled(on) { calibEnabled = !!on; localStorage.setItem('handCalib', JSON.stringify(calibEnabled)); }

/** 最近一次量到的寸比例（關掉檢測時定位用它）。{ right, left, savedAt }；扭轉基準不存（App 同） */
function savedCalib() {
  try { const v = JSON.parse(localStorage.getItem('savedCalib')); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}

let _calibSession = { arr: null, hand: {}, handSkip: {}, face: null, faceSkip: null };
function _calibCur() {
  const arr = typeof state !== 'undefined' ? state.selectedAcupoints : null;
  if (_calibSession.arr !== arr) _calibSession = { arr, hand: {}, handSkip: {}, face: null, faceSkip: null };
  return _calibSession;
}
const _calibKey = () => (typeof curAcuName === 'function' ? curAcuName() : '') || '';

/** 這隻手在這一穴要不要先量 */
function needsHandCalib(hand) {
  if (!calibEnabled) return false;
  const s = _calibCur(), k = _calibKey();
  return !(s.hand[hand] && s.hand[hand].acu === k) && s.handSkip[hand] !== k;
}
/** 量好一隻手：記在這一穴，寸比例存進瀏覽器 */
function recordHandCalib(hand, r) {
  _calibCur().hand[hand] = { k: r.k, tb0: r.tb0, acu: _calibKey() };
  const sv = savedCalib();
  sv[hand] = r.k;
  sv.savedAt = new Date().toISOString().slice(0, 10);
  localStorage.setItem('savedCalib', JSON.stringify(sv));
}
function skipHandCalib(hand) { _calibCur().handSkip[hand] = _calibKey(); }
/** 齒輪「重新檢測手部」：兩隻手都清掉 */
function resetHandCalib() { const s = _calibCur(); s.hand = {}; s.handSkip = {}; }
/**
 * 交給定位用的校準值。開著：只給**這一穴**量到的；關著：給存檔的寸比例（沒存過＝null，照舊每幀量）。
 * 回 { k, tb0 } 或 null
 */
function activeHandCalib(hand) {
  if (calibEnabled) {
    const c = _calibCur().hand[hand];
    return c && c.acu === _calibKey() ? { k: c.k, tb0: c.tb0 } : null;
  }
  const k = savedCalib()[hand];
  return typeof k === 'number' && k > 0 ? { k, tb0: null } : null;
}

function needsFaceCalib() {
  if (!calibEnabled) return false;
  const s = _calibCur(), k = _calibKey();
  return s.face !== k && s.faceSkip !== k;
}
function recordFaceCalib() { _calibCur().face = _calibKey(); }
function skipFaceCalib() { _calibCur().faceSkip = _calibKey(); }
