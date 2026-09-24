// forearm-measure.js — 2026-09-24（Claude）
// ============================================================================
// 小海穴量測：用戶在手肘上畫出真正的小海（GT），拍照或錄影，這頁把 GT 跟演算法的候選點比。
//   照片：一張張載入 → 點畫的那個點（自動吸附到點的中心）→ 記一筆
//   影片：第一幀點一下畫的點 → 逐幀自動追蹤那個顏色的點 → 每幀記一筆
// 候選點與閘門全部來自 forearm-lab.js 的 flMeasure()（跟即時頁同一套公式）。
// 輸出 JSON：每筆有 GT、所有候選、各自誤差（px / mm / 寸）、當幀的閘門狀態。
// mm 換算：誤差px ÷ 同身寸px × CUN_MM(17.66)，跟手部量測工具同一個換算。
// ============================================================================

const FM = {
  side: "auto",
  mode: null,          // "photo" | "video"
  records: [],
  photos: [],          // 待處理的照片 File
  photoIdx: -1,
  cur: null,           // 目前畫面：{ m: flMeasure 結果, gt, name, t }
  snap: true,
  tol: 70,             // 追蹤點的顏色容許（RGB 距離）
  seed: null,          // 影片：{ x, y, color }
  running: false,
};
const FM_CAND = [
  { k: "edge", zh: "即時邊緣（學長公式）", color: "#00e5ff" },
  { k: "fixed_hand", zh: "固定 0.5 寸 × 同身寸", color: "#6f6fff" },
  { k: "fixed_forearm", zh: "固定 0.5 寸 × 骨度", color: "#d070ff" },
  { k: "elbow", zh: "肘點本身（對照）", color: "#9aa3b5" },
];
const FM_MAX_SIDE = 1920;   // 照片太大先縮，GT 精度夠、推論也快
const FM_MIN_PIX = 6;       // 追蹤：至少幾個像素像那個顏色才算找到

let fmPose, fmHands, fmPoseRes, fmHandRes;
const fmWork = document.createElement("canvas");
const fmWorkCtx = fmWork.getContext("2d", { willReadFrequently: true });

function fmInitModels() {
  fmHands = new Hands({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}` });
  fmHands.setOptions({ maxNumHands: 2, modelComplexity: 1, minDetectionConfidence: 0.8, minTrackingConfidence: 0.8 });
  fmHands.onResults((r) => { fmHandRes = r; });
  fmPose = new Pose({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${f}` });
  fmPose.setOptions({ modelComplexity: 1, smoothLandmarks: false, enableSegmentation: true, smoothSegmentation: false,
                      minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
  fmPose.onResults((r) => { fmPoseRes = r; });
}

// 兩個模型跑同一張圖，回傳 flMeasure 結果。照片之間要 reset，否則會把上一張的追蹤帶過來。
async function fmInfer(reset) {
  if (reset) { fmHands.reset(); fmPose.reset(); }
  fmPoseRes = fmHandRes = null;
  await fmHands.send({ image: fmWork });
  await fmPose.send({ image: fmWork });
  const W = fmWork.width, H = fmWork.height;
  if (FM.side !== "auto") return flMeasure(fmPoseRes, fmHandRes, W, H, FM.side);
  // 自動：鏡像影片裡 Pose 的左右會對調（09-24 第一支影片就是鏡像的）→ 兩側都算，
  // 挑肘點離「畫點」最近的那側；還沒有畫點位置時挑可見度高的
  const a = flMeasure(fmPoseRes, fmHandRes, W, H, "left"), b = flMeasure(fmPoseRes, fmHandRes, W, H, "right");
  const ref = FM.lastGt;
  const score = (m) => !m.elbow ? Infinity : ref ? Math.hypot(m.elbow.x - ref.x, m.elbow.y - ref.y) : -m.vis;
  return score(a) <= score(b) ? a : b;
}

// ── 畫的點：取色、吸附、追蹤 ──────────────────────────────────────────────
function fmColorAt(x, y, r = 2) {
  const d = fmWorkCtx.getImageData(Math.round(x) - r, Math.round(y) - r, 2 * r + 1, 2 * r + 1).data;
  let R = 0, G = 0, B = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) { R += d[i]; G += d[i + 1]; B += d[i + 2]; n++; }
  return { r: R / n, g: G / n, b: B / n };
}
// 以 center 為圓心、radius 內，找顏色接近 color 的像素，回傳質心
function fmFindDot(center, radius, color, tol) {
  const W = fmWork.width, H = fmWork.height;
  const x0 = Math.max(0, Math.round(center.x - radius)), y0 = Math.max(0, Math.round(center.y - radius));
  const x1 = Math.min(W, Math.round(center.x + radius)), y1 = Math.min(H, Math.round(center.y + radius));
  if (x1 <= x0 || y1 <= y0) return null;
  const d = fmWorkCtx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
  let sx = 0, sy = 0, n = 0;
  const t2 = tol * tol, r2 = radius * radius;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    if ((x - center.x) ** 2 + (y - center.y) ** 2 > r2) continue;
    const i = ((y - y0) * (x1 - x0) + (x - x0)) * 4;
    const dr = d[i] - color.r, dg = d[i + 1] - color.g, db = d[i + 2] - color.b;
    if (dr * dr + dg * dg + db * db <= t2) { sx += x; sy += y; n++; }
  }
  return n >= FM_MIN_PIX ? { x: sx / n, y: sy / n, n } : null;
}
function fmSnapRadius() { return Math.max(12, Math.max(fmWork.width, fmWork.height) / 80); }

// ── 誤差 ────────────────────────────────────────────────────────────────
function fmErrors(m, gt) {
  const e = {};
  if (!m.ok || !gt) return e;
  for (const c of FM_CAND) {
    const p = m.cand[c.k];
    if (!p) { e[c.k] = null; continue; }
    const px = Math.hypot(p.x - gt.x, p.y - gt.y);
    e[c.k] = { px, cun: px / m.cunHandPx, mm: (px / m.cunHandPx) * CUN_MM,
               cunForearm: px / m.cunForearmPx };
  }
  return e;
}
// 即時頁在這幀會不會出點（前臂變短／姿勢範本要跨幀，這裡不判）
function fmLiveWouldShow(m) {
  return !!(m.ok && m.vis >= FL_FALLBACK_MIN_VISIBILITY && !m.vetoed && m.dorsal === true);
}

function fmRecord(gt, how) {
  const m = FM.cur.m;
  const rec = {
    source: FM.cur.name, t: FM.cur.t, side: m.side, sideMode: FM.side, W: fmWork.width, H: fmWork.height,
    gt: gt ? { x: +gt.x.toFixed(1), y: +gt.y.toFixed(1) } : null, gtHow: how,
    ok: m.ok, reason: m.reason || null,
    liveWouldShow: fmLiveWouldShow(m),
    vis: m.vis, vetoed: m.vetoed ?? null, dorsal: m.dorsal ?? null, handLabel: m.handLabel ?? null,
    matchDist: m.matchDist ?? null,
    cunHandPx: m.cunHandPx ?? null, cunForearmPx: m.cunForearmPx ?? null,
    forearmLenPx: m.forearmLenPx ?? null, edgeDistPx: m.edgeDistPx ?? null,
    posture: m.posture || null,
    profile: m.profile || null,
    palmFacing: m.palmFacing ?? null, palmWidthCun: m.palmWidthCun ?? null, handPts: m.handPts || null,
    elbow: m.elbow || null, wrist: m.wrist || null, shoulder: m.shoulder || null,
    cand: m.cand || null,
    err: fmErrors(m, gt),
  };
  FM.records.push(rec);
  fmRenderSummary();
  return rec;
}

// ── 畫面 ────────────────────────────────────────────────────────────────
function fmDraw(gt, extraText) {
  const c = document.getElementById("fm-canvas");
  c.width = fmWork.width; c.height = fmWork.height;
  const ctx = c.getContext("2d");
  ctx.drawImage(fmWork, 0, 0);
  const m = FM.cur && FM.cur.m;
  const s = Math.max(1, fmWork.width / 640);
  if (m && m.elbow) {
    ctx.setLineDash([6 * s, 6 * s]); ctx.strokeStyle = "rgba(150,160,180,.8)"; ctx.lineWidth = 2 * s;
    ctx.beginPath(); ctx.moveTo(m.wrist.x, m.wrist.y); ctx.lineTo(m.elbow.x, m.elbow.y); ctx.stroke();
    ctx.setLineDash([]);
  }
  if (m && m.ok) {
    for (const cd of FM_CAND) {
      const p = m.cand[cd.k]; if (!p) continue;
      ctx.beginPath(); ctx.arc(p.x, p.y, 6 * s, 0, Math.PI * 2);
      ctx.strokeStyle = cd.color; ctx.lineWidth = 2.5 * s; ctx.stroke();
    }
  }
  if (gt) {
    ctx.strokeStyle = "#ff3040"; ctx.lineWidth = 2.5 * s;
    ctx.beginPath(); ctx.moveTo(gt.x - 10 * s, gt.y); ctx.lineTo(gt.x + 10 * s, gt.y);
    ctx.moveTo(gt.x, gt.y - 10 * s); ctx.lineTo(gt.x, gt.y + 10 * s); ctx.stroke();
  }
  // 逐幀確認模式的放大鏡：左上角放大「沒疊圖的原始幀」，點在放大鏡裡也算數（見 fmMagMap）
  FM.magBox = null;
  const mc = FM.reviewing && (gt || FM.pred);
  if (mc) {
    const Z = 4, B = Math.round(Math.min(fmWork.width, fmWork.height) * 0.45), R = B / (2 * Z), x0 = 8 * s, y0 = 8 * s;
    ctx.fillStyle = "#000"; ctx.fillRect(x0, y0, B, B);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(fmWork, mc.x - R, mc.y - R, 2 * R, 2 * R, x0, y0, B, B);
    ctx.imageSmoothingEnabled = true;
    const cx = x0 + B / 2, cy = y0 + B / 2, g = 10 * s, L = 26 * s;
    ctx.strokeStyle = gt ? "#ff3040" : "#ffd400"; ctx.lineWidth = 2 * s;
    ctx.beginPath();
    ctx.moveTo(cx - L, cy); ctx.lineTo(cx - g, cy); ctx.moveTo(cx + g, cy); ctx.lineTo(cx + L, cy);
    ctx.moveTo(cx, cy - L); ctx.lineTo(cx, cy - g); ctx.moveTo(cx, cy + g); ctx.lineTo(cx, cy + L);
    ctx.stroke();
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5 * s; ctx.strokeRect(x0, y0, B, B);
    FM.magBox = { x0, y0, B, Z, c: { ...mc } };
  }
  const st = document.getElementById("fm-frame");
  if (!m) { st.textContent = extraText || ""; return; }
  const e = fmErrors(m, gt);
  st.innerHTML = (extraText ? extraText + "<br>" : "") +
    (m.ok ? "" : `<span class="lv-bad">算不出候選點：${m.reason}</span><br>`) +
    (m.ok ? `可見度 ${m.vis.toFixed(2)}　${m.dorsal ? "手背" : "掌心"}朝鏡頭　${m.vetoed ? "<span class='lv-bad'>肘點翻邊</span>　" : ""}` +
            `即時頁${fmLiveWouldShow(m) ? "<span class='lv-ok'>會出點</span>" : "<span class='lv-bad'>不出點</span>"}<br>` : "") +
    FM_CAND.map((cd) => `<span style="color:${cd.color}">●</span> ${cd.zh}：` +
      (e[cd.k] ? `<b>${e[cd.k].mm.toFixed(1)} mm</b>（${e[cd.k].cun.toFixed(2)} 寸）` : m.ok && !m.cand[cd.k] ? "找不到邊緣" : "—")).join("<br>");
}

function fmCanvasPoint(ev) {
  const c = document.getElementById("fm-canvas");
  const r = c.getBoundingClientRect();
  return { x: (ev.clientX - r.left) * (c.width / r.width), y: (ev.clientY - r.top) * (c.height / r.height) };
}

// 點在放大鏡裡 → 換回原始畫面座標
function fmMagMap(p) {
  const b = FM.magBox;
  if (!b || p.x < b.x0 || p.y < b.y0 || p.x > b.x0 + b.B || p.y > b.y0 + b.B) return p;
  return { x: b.c.x + (p.x - b.x0 - b.B / 2) / b.Z, y: b.c.y + (p.y - b.y0 - b.B / 2) / b.Z };
}

// 把 source（img 或 video）畫進工作畫布，長邊不超過 FM_MAX_SIDE
function fmLoadWork(src, w, h) {
  const k = Math.min(1, FM_MAX_SIDE / Math.max(w, h));
  fmWork.width = Math.round(w * k); fmWork.height = Math.round(h * k);
  fmWorkCtx.drawImage(src, 0, 0, fmWork.width, fmWork.height);
}

// ── 照片 ────────────────────────────────────────────────────────────────
async function fmOpenPhotos(files) {
  FM.mode = "photo"; FM.photos = [...files]; FM.photoIdx = -1;
  await fmNextPhoto();
}
async function fmNextPhoto() {
  FM.photoIdx++; FM.lastGt = null;
  if (FM.photoIdx >= FM.photos.length) { fmMsg("照片都處理完了，按「下載 JSON」存檔", "ok"); return; }
  const f = FM.photos[FM.photoIdx];
  const img = new Image();
  img.src = URL.createObjectURL(f);
  await img.decode();
  fmLoadWork(img, img.naturalWidth, img.naturalHeight);
  URL.revokeObjectURL(img.src);
  fmMsg(`第 ${FM.photoIdx + 1}/${FM.photos.length} 張：偵測中…`);
  const m = await fmInfer(true);
  FM.cur = { m, name: f.name, t: null, gt: null };
  fmDraw(null);
  fmMsg(`第 ${FM.photoIdx + 1}/${FM.photos.length} 張「${f.name}」：點一下你畫的點（點錯可以再點），確定後按「記下這張」`);
}
function fmPhotoClick(p) {
  let gt = p, how = "click";
  if (FM.snap) {
    const dot = fmFindDot(p, fmSnapRadius(), fmColorAt(p.x, p.y), FM.tol);
    if (dot) { gt = dot; how = "snap"; }
  }
  FM.cur.gt = gt; FM.cur.gtHow = how;
  if (FM.side === "auto" && FM.lastGt !== gt) {   // 自動挑邊要靠畫點位置：點完重算一次
    FM.lastGt = gt; fmInfer(false).then((m) => { FM.cur.m = m; fmDraw(gt, how === "snap" ? "已吸附到畫點中心" : "用點擊位置（沒吸附到）"); });
  }
  fmDraw(gt, how === "snap" ? "已吸附到畫點中心" : "用點擊位置（沒吸附到）");
}
function fmCommitPhoto() {
  if (!FM.cur || FM.mode !== "photo") return;
  if (!FM.cur.gt) { fmMsg("還沒點你畫的點", "warn"); return; }
  fmRecord(FM.cur.gt, FM.cur.gtHow);
  fmNextPhoto();
}

// ── 影片 ────────────────────────────────────────────────────────────────
const fmVideo = document.createElement("video");
fmVideo.muted = true; fmVideo.playsInline = true;
function fmSeek(t) {
  return new Promise((res) => {
    const done = () => { fmVideo.removeEventListener("seeked", done); res(); };
    fmVideo.addEventListener("seeked", done);
    fmVideo.currentTime = t;
  });
}
async function fmOpenVideo(file) {
  FM.mode = "video"; FM.seed = null;
  fmVideo.src = URL.createObjectURL(file);
  FM.videoName = file.name;
  await new Promise((res, rej) => { fmVideo.onloadeddata = res; fmVideo.onerror = () => rej(fmVideo.error); })
    .catch((e) => { fmMsg("這支影片瀏覽器解不開（iPhone 的 HEVC 常見）：請改用「相容性最佳」格式錄，或轉成 mp4/H.264", "bad"); throw e; });
  await fmSeek(Math.min(0.05, fmVideo.duration / 2));
  fmLoadWork(fmVideo, fmVideo.videoWidth, fmVideo.videoHeight);
  FM.cur = { m: null, name: file.name, t: fmVideo.currentTime };
  fmDraw(null);
  fmMsg(`影片 ${fmVideo.duration.toFixed(1)} 秒：先點一下你畫的點，再按「▶ 逐幀確認」`);
}
function fmVideoClick(p) {
  const color = fmColorAt(p.x, p.y);
  const dot = fmFindDot(p, fmSnapRadius(), color, FM.tol) || p;
  FM.seed = { x: dot.x, y: dot.y, color };
  fmDraw(dot, `記住顏色 rgb(${color.r | 0},${color.g | 0},${color.b | 0})`);
}
function fmSeedAt(x, y) { fmVideoClick({ x, y }); }   // 給自動化腳本用

// ── 畫點追蹤 v2（2026-09-24）────────────────────────────────────────────
// v1 用「絕對顏色」在上一個位置附近找：第 6 秒手一舉就黏到前臂皮膚、第 21 秒飄到背景櫃子，
// 誤差中位 100mm 全是假的。v2 改三件事：
//   ① 預測：記住畫點在「前臂座標」的位置（原點＝Pose 肘點、軸＝腕→肘、單位＝前臂長），
//      下一幀用新的肘點與前臂方向換回畫面座標 —— 手臂整個移動或轉向都跟得上
//   ② 找點：窗內「比皮膚中位亮度暗 FM_DARK_DELTA 以上」的像素連成的小團，面積要像一顆點
//   ③ 必須落在 Pose 人體遮罩內（背景的深色東西直接排除）；多團時取離預測最近的
// ⚠️ 預測靠 Pose 肘點，肘點本身會抖 1～2 寸，所以搜尋半徑不能太小；肘窩皺褶、陰影也是暗團，
//    挑錯的可能仍在 —— 每 N 幀留縮圖肉眼檢查。
const FM_DARK_DELTA = 25;
const FM_DOT_AREA = [6, 900];
const FM_SEARCH_R = 0.15;     // 搜尋半徑＝前臂長 × 這個（約 1.8 寸）；跟丟每幀加大一半
function fmArmFrame(m) {
  if (!m || !m.elbow || !m.wrist) return null;
  const L = Math.hypot(m.elbow.x - m.wrist.x, m.elbow.y - m.wrist.y);
  if (L < 5) return null;
  const u = { x: (m.elbow.x - m.wrist.x) / L, y: (m.elbow.y - m.wrist.y) / L };
  return { o: m.elbow, u, v: { x: -u.y, y: u.x }, L };
}
function fmToArm(f, p) {
  const dx = p.x - f.o.x, dy = p.y - f.o.y;
  return { a: (dx * f.u.x + dy * f.u.y) / f.L, b: (dx * f.v.x + dy * f.v.y) / f.L };
}
function fmFromArm(f, q) {
  return { x: f.o.x + (q.a * f.u.x + q.b * f.v.x) * f.L, y: f.o.y + (q.a * f.u.y + q.b * f.v.y) * f.L };
}
function fmFindDarkDot(pred, radius, mask) {
  const W = fmWork.width, H = fmWork.height;
  const x0 = Math.max(0, Math.round(pred.x - radius)), y0 = Math.max(0, Math.round(pred.y - radius));
  const x1 = Math.min(W, Math.round(pred.x + radius)), y1 = Math.min(H, Math.round(pred.y + radius));
  const w = x1 - x0, h = y1 - y0;
  if (w < 3 || h < 3) return null;
  const d = fmWorkCtx.getImageData(x0, y0, w, h).data;
  const lum = new Float32Array(w * h), inside = new Uint8Array(w * h), vals = [];
  const r2 = radius * radius;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const k = y * w + x, gx = x0 + x, gy = y0 + y;
    if ((gx - pred.x) ** 2 + (gy - pred.y) ** 2 > r2) continue;
    if (mask && flMaskAt(mask, gx, gy, W, H) < FL_MASK_TH) continue;   // 只看身體上的像素
    lum[k] = 0.299 * d[k * 4] + 0.587 * d[k * 4 + 1] + 0.114 * d[k * 4 + 2];
    inside[k] = 1; vals.push(lum[k]);
  }
  if (vals.length < 20) return null;
  vals.sort((a, b) => a - b);
  // （試過「門檻隨最暗處自適應」：反而整片黏到袖口陰影上，退回固定門檻）
  const th = vals[vals.length >> 1] - FM_DARK_DELTA;
  const seen = new Uint8Array(w * h);
  let best = null;
  for (let k0 = 0; k0 < w * h; k0++) {
    if (!inside[k0] || seen[k0] || lum[k0] >= th) continue;
    const q = [k0]; seen[k0] = 1; let n = 0, sx = 0, sy = 0, dark = 0;
    while (q.length) {
      const k = q.pop(), x = k % w, y = (k / w) | 0;
      n++; sx += x; sy += y; dark += th - lum[k];
      for (const nk of [x > 0 ? k - 1 : -1, x < w - 1 ? k + 1 : -1, y > 0 ? k - w : -1, y < h - 1 ? k + w : -1]) {
        if (nk >= 0 && inside[nk] && !seen[nk] && lum[nk] < th) { seen[nk] = 1; q.push(nk); }
      }
    }
    if (n < FM_DOT_AREA[0] || n > FM_DOT_AREA[1]) continue;
    // 挑「夠暗、夠大」的那團，距離只當次要扣分（v2 第一版挑最近的 → 被旁邊淡淡的痕跡搶走）
    const c = { x: x0 + sx / n, y: y0 + sy / n, n };
    c.dist = Math.hypot(c.x - pred.x, c.y - pred.y);
    c.score = dark / (1 + (c.dist / radius) ** 2);
    if (!best || c.score > best.score) best = c;
  }
  return best;
}

// ── 逐幀確認（2026-09-24）：v2 自動追蹤在筆電鏡頭上靠不住（動作模糊、點轉到看不到時會黏到陰影），
//    GT 錯了後面的誤差全無意義 → 自動只負責「提議」，每幀由人按鍵確認：
//    Enter／空白＝接受　點畫面或放大鏡＝改到那裡（吸附到暗點中心）　S＝這幀看不到點　←／Backspace＝回上一幀　Esc＝停
let fmActResolve = null;
function fmWaitAction() { return new Promise((res) => { fmActResolve = res; }); }
function fmAct(a) { if (fmActResolve) { const r = fmActResolve; fmActResolve = null; r(a); } }

async function fmRunVideo(fps, review) {
  if (!FM.seed) { fmMsg("先在畫面上點一下你畫的點", "warn"); return; }
  FM.running = true; FM.reviewing = !!review;
  fmMsg(review ? "逐幀確認中：十字壓在點上就按「對」，不對就在放大鏡裡點正確位置" : "全自動分析中…");
  const step = 1 / (fps || 10), t0 = Math.min(0.05, fmVideo.duration / 2);
  const tEnd = Math.min(fmVideo.duration, FM.maxT || Infinity);
  const hist = [];                      // 每幀開始前的追蹤狀態，給「回上一幀」還原
  let st = { last: { x: FM.seed.x, y: FM.seed.y }, off: null, lost: 0 };
  let i = 0;
  while (FM.running && t0 + i * step < tEnd) {
    const t = t0 + i * step;
    hist[i] = { ...st };
    await fmSeek(t);
    fmLoadWork(fmVideo, fmVideo.videoWidth, fmVideo.videoHeight);
    FM.lastGt = st.last;
    const m = await fmInfer(i === 0);
    FM.cur = { m, name: FM.videoName, t: +fmVideo.currentTime.toFixed(3) };
    const f = fmArmFrame(m);
    const mask = flReadMask(fmPoseRes && fmPoseRes.segmentationMask);
    let dot, how;
    if (i === 0) dot = fmFindDarkDot(st.last, fmSnapRadius(), mask);   // 第一幀：就在用戶點的地方附近
    else {
      const pred = st.off && f ? fmFromArm(f, st.off) : st.last;
      FM.pred = pred;
      const r = (f ? f.L * FM_SEARCH_R : fmWork.width * 0.06) * (1 + 0.5 * st.lost);
      dot = fmFindDarkDot(pred, r, mask);
    }
    how = dot ? "track" : "lost";
    const label = `${t.toFixed(2)} / ${fmVideo.duration.toFixed(1)} 秒`;
    if (review) {
      FM.pred = dot || FM.pred || st.last;
      fmDraw(dot, `${label}　${dot ? "黃紅十字＝程式猜的畫點" : "<span class='lv-bad'>程式沒找到</span>"}　` +
        "<b>Enter</b> 接受　<b>點畫面／放大鏡</b> 改位置　<b>S</b> 看不到　<b>←</b> 上一幀　<b>Esc</b> 停");
      document.getElementById("fm-review-bar").hidden = false;
      document.getElementById("fm-review-n").textContent =
        `第 ${i + 1} / ${Math.ceil((tEnd - t0) / step)} 幀（已記 ${FM.records.length} 筆）`;
      const a = await fmWaitAction();
      if (a.type === "stop") break;
      if (a.type === "back") {
        if (i > 0) { i--; FM.records.pop(); st = { ...hist[i] }; fmRenderSummary(); }
        continue;
      }
      if (a.type === "skip") { dot = null; how = "review-skip"; }
      else if (a.type === "click") {
        dot = fmFindDarkDot(a.p, fmSnapRadius(), null) || a.p; how = "review-click";
      } else if (!dot) { continue; }  // 沒提議時按 Enter 不算數，等下一個動作
      else how = "review-accept";
    }
    if (dot) { st.last = dot; st.lost = 0; if (f) st.off = fmToArm(f, dot); } else st.lost++;
    fmRecord(dot, how);
    if (!review) fmDraw(dot, `${label}　${dot ? "追到畫點" : `<span class='lv-bad'>跟丟畫點（${st.lost}）</span>`}`);
    // 自動化腳本用：每 N 幀留一張縮圖，事後肉眼檢查追蹤有沒有追錯
    if (FM.snapEvery && FM.records.length % FM.snapEvery === 1) {
      const c = document.getElementById("fm-canvas");
      FM.snaps = FM.snaps || [];
      FM.snaps.push({ t: FM.cur.t, url: c.toDataURL("image/jpeg", 0.8) });
    }
    // 追蹤檢查用：以 GT（跟丟時用肘點）為中心，從「沒疊圖的原始幀」裁 140×140，跟記錄一一對應
    if (FM.keepCrops) {
      const c0 = dot || m.elbow || st.last, C = 70;
      const cc = document.createElement("canvas"); cc.width = cc.height = 2 * C;
      cc.getContext("2d").drawImage(fmWork, c0.x - C, c0.y - C, 2 * C, 2 * C, 0, 0, 2 * C, 2 * C);
      FM.crops = FM.crops || [];
      FM.crops.push({ t: FM.cur.t, cx: c0.x, cy: c0.y, url: cc.toDataURL("image/png") });
    }
    if (!review && st.lost > 15) { fmMsg("畫點連續跟丟 15 幀，已停止：拖回來重點一次再開始", "bad"); break; }
    i++;
  }
  FM.running = false; FM.reviewing = false; FM.pred = null;
  document.getElementById("fm-review-bar").hidden = true;
  fmMsg(`分析完成，共 ${FM.records.length} 筆。按「下載 JSON」存檔`, "ok");
}

// ── 回放（2026-09-24）：照一份舊 JSON 的每筆時間重跑演算法，GT 沿用舊的（給新候選／新欄位重算用）
async function fmReplay(old) {
  FM.running = true;
  let first = true;
  for (const r of old) {
    if (!FM.running) break;
    await fmSeek(r.t);
    fmLoadWork(fmVideo, fmVideo.videoWidth, fmVideo.videoHeight);
    FM.lastGt = r.gt;
    const m = await fmInfer(first); first = false;
    FM.cur = { m, name: FM.videoName, t: r.t };
    fmRecord(r.gt, "replay:" + r.gtHow);
  }
  FM.running = false;
  fmMsg(`回放完成，共 ${FM.records.length} 筆`, "ok");
}

// ── 統計 ────────────────────────────────────────────────────────────────
function fmStats(recs) {
  const rows = {};
  for (const c of FM_CAND) {
    const v = recs.map((r) => r.err[c.k] && r.err[c.k].mm).filter((x) => x != null).sort((a, b) => a - b);
    const q = (p) => v.length ? v[Math.min(v.length - 1, Math.floor(p * v.length))] : null;
    rows[c.k] = { n: v.length, median: q(0.5), p90: q(0.9), mean: v.length ? v.reduce((a, b) => a + b, 0) / v.length : null,
                  le5: v.length ? v.filter((x) => x <= 5).length / v.length : null,
                  le10: v.length ? v.filter((x) => x <= 10).length / v.length : null };
  }
  return rows;
}
function fmSummary() {
  const withGt = FM.records.filter((r) => r.gt && r.ok);
  return { all: fmStats(withGt), liveShown: fmStats(withGt.filter((r) => r.liveWouldShow)),
           nRecords: FM.records.length, nWithGt: withGt.length };
}
function fmRenderSummary() {
  const s = fmSummary();
  const f = (x, d = 1) => x == null ? "—" : x.toFixed(d);
  const pc = (x) => x == null ? "—" : (x * 100).toFixed(0) + "%";
  const table = (st) => `<table class="fm-t"><tr><th>候選</th><th>n</th><th>中位 mm</th><th>P90</th><th>≤5mm</th><th>≤10mm</th></tr>` +
    FM_CAND.map((c) => { const r = st[c.k]; return `<tr><td><span style="color:${c.color}">●</span> ${c.zh}</td><td>${r.n}</td>` +
      `<td><b>${f(r.median)}</b></td><td>${f(r.p90)}</td><td>${pc(r.le5)}</td><td>${pc(r.le10)}</td></tr>`; }).join("") + "</table>";
  document.getElementById("fm-summary").innerHTML =
    `共 ${s.nRecords} 筆，有 GT 且算得出 ${s.nWithGt} 筆<h4>全部</h4>${table(s.all)}<h4>即時頁會出點的那幾筆（手背、可見度夠、沒翻邊）</h4>${table(s.liveShown)}`;
}

function fmExport() {
  const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const data = { tool: "forearm-measure", version: "2026-09-24", acupoint: "SI8 小海", CUN_MM,
                 params: { FL_ULNAR_OFFSET_CUN, FL_FOREARM_CUN, FL_EDGE_MAX_CUN, FL_MASK_TH, FL_VETO_COS,
                           FL_HAND_MATCH_RATIO, FL_FALLBACK_MIN_VISIBILITY, tol: FM.tol },
                 summary: fmSummary(), records: FM.records };
  const a = document.createElement("a");
  a.download = `xiaohai_gt_${FM.side}_${ts}.json`;
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: "application/json" }));
  a.click();
  return data;
}
function fmUndo() { FM.records.pop(); fmRenderSummary(); fmMsg("刪掉最後一筆"); }
function fmClear() { if (confirm("清掉全部紀錄？")) { FM.records = []; fmRenderSummary(); } }

function fmMsg(text, cls) {
  const el = document.getElementById("fm-status");
  el.textContent = text; el.className = "fl-status " + (cls || "");
}

window.addEventListener("DOMContentLoaded", () => {
  fmInitModels();
  document.getElementById("fm-canvas").addEventListener("click", (ev) => {
    const p = fmMagMap(fmCanvasPoint(ev));
    if (FM.reviewing) { fmAct({ type: "click", p }); return; }
    if (FM.running || !FM.cur) return;
    if (FM.mode === "photo") fmPhotoClick(p); else if (FM.mode === "video") fmVideoClick(p);
  });
  window.addEventListener("keydown", (ev) => {
    if (!FM.reviewing) return;
    const k = ev.key;
    if (k === "Enter" || k === " ") fmAct({ type: "accept" });
    else if (k === "s" || k === "S") fmAct({ type: "skip" });
    else if (k === "ArrowLeft" || k === "Backspace") fmAct({ type: "back" });
    else if (k === "Escape") fmAct({ type: "stop" });
    else return;
    ev.preventDefault();
  });
  fmRenderSummary();
});
