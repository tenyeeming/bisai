// ═══════════════════════════════════════════════════════════════════
// 臉部穴位「黏在網格上」＋「轉太多藏遠側」（2026-09-24，實驗）
//
// 問題：face-math.js 的公式是在**平面照片**上從 landmark 走一段位移，
//       尺是 IPD 或 faceHeight。轉頭時 ① 兩把尺壓縮比例不同 ② 臉不是平的
//       ③ 遠側 landmark 是模型猜的 → 點會偏（用戶 09-24：「臉轉動幅度太大的時候會出現偏移」）。
//
// A 網格錨定：臉接近正對時，照公式算出點，記下它落在哪三個 landmark 圍成的
//    小三角形裡、重心座標多少。之後每一幀直接用那三點 × 權重算位置 ——
//    網格本身跟著 yaw／pitch／roll 變形，點就黏在皮膚上。
//    正對時權重持續更新（EMA），所以正臉下跟公式幾乎一樣；轉開後權重凍結。
//    ⚠️ 公式一個字沒改 —— 這層是疊在 computeFaceAcupoint 輸出之後的後處理。
//
// D 遠側隱藏：|yaw| 超過 FACE_FAR_HIDE_DEG，雙側穴只畫朝鏡頭那一側。
//
// 類比 C#：FaceAnchor 是一個有狀態的 class（綁定表），外面每幀呼叫一次 Update。
// ═══════════════════════════════════════════════════════════════════

/** D：轉頭超過這個角度，遠側的點不畫。⭐ 預設值，用戶覺得不對再調 */
const FACE_FAR_HIDE_DEG = 30;
/** 回到這個角度以內才解除「轉太多」（遲滯，免得在 30° 附近閃）—— 同 App FACE_FAR_SHOW_DEG */
const FACE_FAR_SHOW_DEG = 25;
/** A：|yaw| 在這以內才（重新）綁定 —— 只有接近正臉時公式才可信 */
const FACE_BIND_MAX_DEG = 12;
/** A：正對時權重的 EMA 係數（越大越跟得快，越小越穩） */
const FACE_BIND_ALPHA = 0.2;
/** 臉消失超過這麼久就清掉綁定（可能換人了） */
const FACE_ANCHOR_RESET_MS = 1500;

// 側臉 6 穴是拿**側臉照**擬合的，正臉下本來就偏（face-math.js 有寫）→ 不能用正臉綁，照舊走公式
const FACE_ANCHOR_SKIP = new Set(['EX-HN5', 'GB3', 'SI18', 'ST5', 'ST6', 'ST7']);

// 不拿來當錨的 landmark：
//  - 臉部輪廓（FACEMESH_FACE_OVAL）：定義在投影邊界上，轉頭會沿臉頰滑動（08-28 實測）
//  - 虹膜 468–477：跟著眼珠轉，穴位不該跟著視線跑
const FACE_OVAL_LM = new Set([10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
  397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127,
  162, 21, 54, 103, 67, 109]);
const _anchorOk = (i) => i < 468 && !FACE_OVAL_LM.has(i);

/**
 * 真正的 yaw（度）：兩外眥的 3D 連線在水平面上的角度。
 * FaceMesh 的 z 跟 x 同一個尺度（都乘影像寬），z 越小越靠近鏡頭。
 * 正值 = 左眼（lm263 側）比較遠。
 * 取代 faceHeadPose 的鼻尖代理值 —— 那個吃 lm234/454 輪廓點，40° 就失效了。
 */
function faceYawDeg(lm, W) {
  const r = lm[FLM.outerR], l = lm[FLM.outerL];
  if (!r || !l || r.z == null || l.z == null) return null;
  return Math.atan2((l.z - r.z) * W, (l.x - r.x) * W) * 180 / Math.PI;
}

/** 遠側是哪一側（'R' / 'L'）；轉得不夠多回 null */
function faceFarSide(yawDeg, limit = FACE_FAR_HIDE_DEG) {
  if (yawDeg == null || Math.abs(yawDeg) <= limit) return null;
  return yawDeg > 0 ? 'L' : 'R';
}

function _bary(p, a, b, c) {
  const v0x = b.x - a.x, v0y = b.y - a.y, v1x = c.x - a.x, v1y = c.y - a.y;
  const den = v0x * v1y - v1x * v0y;
  if (Math.abs(den) < 1e-9) return null;
  const px = p.x - a.x, py = p.y - a.y;
  const wb = (px * v1y - v1x * py) / den;
  const wc = (v0x * py - px * v0y) / den;
  return [1 - wb - wc, wb, wc];
}

function _minAngleDeg(a, b, c) {
  const ang = (p, q, r) => {
    const ux = q.x - p.x, uy = q.y - p.y, vx = r.x - p.x, vy = r.y - p.y;
    const d = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    return d ? Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / d))) * 180 / Math.PI : 0;
  };
  return Math.min(ang(a, b, c), ang(b, c, a), ang(c, a, b));
}

/**
 * 替點 p（影像像素）挑一個錨三角形。
 * 從最近的 10 個可用 landmark 裡挑：先要形狀夠好（最小角 ≥ 20°），
 * 再要「p 在裡面」（外推越少越好），最後挑越小的越好（越貼局部皮膚）。
 * @returns {{i:number[], w:number[]}|null}
 */
function faceBindPoint(lm, W, H, p) {
  const P = (i) => ({ x: lm[i].x * W, y: lm[i].y * H });
  const near = [];
  for (let i = 0; i < Math.min(lm.length, 468); i++) {
    if (!_anchorOk(i)) continue;
    const q = P(i);
    near.push({ i, q, d: Math.hypot(q.x - p.x, q.y - p.y) });
  }
  near.sort((a, b) => a.d - b.d);
  const K = near.slice(0, 10);
  let best = null;
  for (let a = 0; a < K.length; a++)
    for (let b = a + 1; b < K.length; b++)
      for (let c = b + 1; c < K.length; c++) {
        const A = K[a].q, B = K[b].q, C = K[c].q;
        if (_minAngleDeg(A, B, C) < 20) continue;
        const w = _bary(p, A, B, C);
        if (!w) continue;
        const outside = Math.max(0, -Math.min(...w));
        const area = Math.abs((B.x - A.x) * (C.y - A.y) - (C.x - A.x) * (B.y - A.y));
        const score = outside * 1e6 + area;
        if (!best || score < best.score) best = { score, i: [K[a].i, K[b].i, K[c].i], w };
      }
  return best ? { i: best.i, w: best.w } : null;
}

/** 用綁定算出這一幀的位置 */
function faceApplyBind(lm, W, H, bind) {
  let x = 0, y = 0;
  for (let k = 0; k < 3; k++) {
    x += lm[bind.i[k]].x * W * bind.w[k];
    y += lm[bind.i[k]].y * H * bind.w[k];
  }
  return { x, y };
}

// ── 有狀態的部分 ─────────────────────────────────────────────────────
let faceAnchorBinds = {};      // key = code + side → {i, w}
let faceAnchorLastSeen = 0;
// 2026-09-25（網頁v2 批 E-2，同 App FaceAnchor.kt 批 65）：轉太多 → 正臉類穴位兩側一起藏＋回正箭頭。
//   用戶 09-25 對網頁確認「這個功能是要的」。每幀先呼叫一次 faceTurnUpdate，再逐穴 computeFaceAcupointAnchored。
let faceTurned = false;
// null＝這一輪還沒呼叫過 faceTurnUpdate → computeFaceAcupointAnchored 退回舊行為（只藏遠側、無遲滯）
let faceTurnState = null;

function faceAnchorReset() {
  faceAnchorBinds = {}; faceAnchorLastSeen = 0;
  faceTurned = false; faceTurnState = null;
}

/**
 * 這一幀轉頭狀態（有遲滯：超過 30° 進入、回到 25° 以內才退出）。
 *   turnedAway：轉太多且選的穴裡有正臉類 → 正臉類全藏、要出回正箭頭（只選側臉 6 穴不叫人回正）
 *   backDirX：回正方向，**影像原始座標** +1 往右／−1 往左（取鼻尖 → 兩外眥中點），畫的時候再依鏡像翻
 *   far：遠側（'R'/'L'），側臉 6 穴只藏這一側
 */
function faceTurnUpdate(yawDeg, codes, lm) {
  const ay = yawDeg == null ? null : Math.abs(yawDeg);
  faceTurned = ay == null ? false : faceTurned ? ay > FACE_FAR_SHOW_DEG : ay > FACE_FAR_HIDE_DEG;
  const far = faceTurned ? (yawDeg > 0 ? 'L' : 'R') : null;
  const turnedAway = faceTurned && codes.some(c => !FACE_ANCHOR_SKIP.has(c));
  let backDirX = 0;
  if (turnedAway && lm[FLM.outerR] && lm[FLM.outerL] && lm[4]) {
    const midX = (lm[FLM.outerR].x + lm[FLM.outerL].x) / 2;
    backDirX = midX - lm[4].x >= 0 ? 1 : -1;
  }
  faceTurnState = { turned: faceTurned, turnedAway, backDirX, far };
  return faceTurnState;
}

/**
 * computeFaceAcupoint 的替代入口：套 A（錨定）＋ D（遠側隱藏）。
 * @returns {{pts: {x,y,side}[]|null, unbound: boolean}}
 *   unbound = 臉轉開了、這穴卻還沒在正臉時綁過（只能照舊走公式）
 */
function computeFaceAcupointAnchored(code, lm, W, H, yawDeg, now = Date.now()) {
  if (faceAnchorLastSeen && now - faceAnchorLastSeen > FACE_ANCHOR_RESET_MS) { faceAnchorBinds = {}; }
  faceAnchorLastSeen = now;

  const raw = computeFaceAcupoint(code, lm, W, H);
  if (!raw) return { pts: null, unbound: false };
  // 遠側改讀這一幀的轉頭狀態（有遲滯，同 App）；沒先呼叫 faceTurnUpdate 時退回舊的無遲滯判法
  const far = faceTurnState ? faceTurnState.far : faceFarSide(yawDeg);
  const hideFront = !!(faceTurnState && faceTurnState.turned);
  const frontal = yawDeg != null && Math.abs(yawDeg) <= FACE_BIND_MAX_DEG;
  let unbound = false;

  const pts = [];
  for (const p of raw) {
    if (far && p.side === far) continue;                 // D
    if (FACE_ANCHOR_SKIP.has(code)) { pts.push(p); continue; }
    const key = code + p.side;
    let bind = faceAnchorBinds[key];
    if (frontal) {
      if (!bind) bind = faceBindPoint(lm, W, H, p);
      else {
        // 三角形不換，只把權重往這一幀的公式結果拉 —— 正臉下兩者一致
        const P = (i) => ({ x: lm[i].x * W, y: lm[i].y * H });
        const w = _bary(p, P(bind.i[0]), P(bind.i[1]), P(bind.i[2]));
        if (w) bind = { i: bind.i, w: bind.w.map((v, k) => v + (w[k] - v) * FACE_BIND_ALPHA) };
      }
      if (bind) faceAnchorBinds[key] = bind;
    }
    // 正臉類：轉太多就兩側一起藏（用戶：「其中一個被擋掉另一個也擋掉」），綁定照樣維護 —— 轉回來不必重綁
    if (hideFront) continue;
    if (bind) pts.push({ ...faceApplyBind(lm, W, H, bind), side: p.side });
    else { pts.push(p); if (!frontal) unbound = true; }
  }
  return { pts: pts.length ? pts : null, unbound };
}
