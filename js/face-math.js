// ═══════════════════════════════════════════════════════════════════
// 臉部穴道定位公式
//
// 這是 `臉部/face_acu.py` 的 JS 版，兩邊必須一致 —— 改了要同步回去，
// 因為 Python 那邊有 `臉部/驗證.py` 在跑誤差，公式分家就沒得驗了。
//
// ⚠️ 資料基礎極薄：1 人 1 張照片 / 7 筆有效標注 / 4 個穴道。
//    每條公式的 src 欄位寫明參數怎麼來的，`WHO字面` 才是可靠的，
//    `fit(n=…)` 都是暫定值。
// ═══════════════════════════════════════════════════════════════════

// ── 一、臉座標系：先把頭部側傾（roll）吃掉 ────────────────────────────
//
//   ex = 兩虹膜中心連線方向（水平軸，已含 roll）
//   ey = ex 轉 90°（臉的「下方」）
//   尺度 = IPD 瞳距
//
// 所有位移一律寫成 IPD 的比例 → 離鏡頭遠近無關、頭歪也無關。
// 為什麼非做不可：測試照 roll 只有 −2.73°（看起來很正），兩側眼下緣的 y
// 就差了 13.3px。不轉座標系，所有垂直位移都混著頭部傾斜。
// （Su et al. 2023 的 ±30° 閘門只擋 yaw，沒處理 roll。）
function faceFrame(lm, W, H) {
  if (!lm || lm.length < 478) return null;      // 少於 478 表示沒開 refineLandmarks
  const ir = { x: lm[FLM.irisR].x * W, y: lm[FLM.irisR].y * H };
  const il = { x: lm[FLM.irisL].x * W, y: lm[FLM.irisL].y * H };
  const dx = il.x - ir.x, dy = il.y - ir.y;
  const ipd = Math.hypot(dx, dy);
  if (!(ipd > 1)) return null;
  const ex = { x: dx / ipd, y: dy / ipd };
  const ey = { x: -ex.y, y: ex.x };             // 影像 y 軸向下，這個轉向剛好朝臉下方
  return { ex, ey, ipd, irisR: ir, irisL: il };
}

const _p = (lm, key, W, H) => ({ x: lm[FLM[key]].x * W, y: lm[FLM[key]].y * H });

// ── 二、定位法 ────────────────────────────────────────────────────────
//
// 沿用 Su et al. 2023 §4.1 的三分法，臉部多加一種特化：
//   PT  點定位      直接落在某個 landmark（可加 IPD 比例位移）
//   BT  點間定位    兩點之間用 ratio 內插
//   PV  瞳孔垂線交叉  x 鎖在瞳孔垂線上，y 取某個水平基準 + k×IPD
//
// PV 是她 CS（線間交叉）的特例。WHO 有一票臉部穴道都是「瞳孔正下方 ×
// 某個高度」（承泣、四白、巨髎、陽白、魚腰…），共用這一種就夠，
// 不必每個穴道各自擬合一組 (x, y)。
const FACE_FORMULA = {
  BL1: {
    method: 'PT', at: 'inner', dy: 0,
    src: 'WHO字面（內眥）。實測偏差 1–3px = 0.3–0.9% IPD，在標注雜訊內，不加位移',
    err: '0.34% / 0.95%',
  },
  ST1: {
    method: 'PV', base: 'eyeBot', dy: 0.105,
    src: 'fit(n=1張/2側)：實測 9.31% 與 11.70% IPD，取平均。⚠ 兩側差 2.4pp，需多張',
    err: '1.34% / 2.64%',
  },
  ST2: {
    method: 'PV', base: 'eyeBot', dy: 0.255,
    src: 'fit(n=1張/1側)：⚠ 另一側標注有誤，只有單一樣本撐著',
    err: '4.30%（另一筆標錯）',
  },
  ST3: {
    method: 'PV', base: 'ala', dy: 0,
    src: 'WHO字面（瞳孔垂線 × 鼻翼下緣同高）。實測高度與 landmark 129/358 差 2.2–2.8px',
    err: '2.52% / 6.77%',
  },
};

/**
 * 算一個臉部穴道的位置。
 * @returns [{x, y, side}]，雙側穴回兩點；公式沒定義回 null
 */
function computeFaceAcupoint(code, lm, W, H) {
  const f = FACE_FORMULA[code];
  const meta = faceAcu(code);
  if (!f || !meta) return null;
  const fr = faceFrame(lm, W, H);
  if (!fr) return null;

  const sides = meta.bilateral ? ['R', 'L'] : ['M'];
  const out = [];
  for (const side of sides) {
    const p = _oneFacePoint(f, side, lm, W, H, fr);
    if (p) out.push({ x: p.x, y: p.y, side });
  }
  return out.length ? out : null;
}

function _oneFacePoint(f, side, lm, W, H, fr) {
  const sfx = side === 'M' ? '' : side;        // 正中穴的 landmark 名不帶 R/L
  const { ey, ipd } = fr;

  if (f.method === 'PT') {
    const b = _p(lm, f.at + sfx, W, H);
    const k = f.dy || 0;
    return { x: b.x + ey.x * k * ipd, y: b.y + ey.y * k * ipd };
  }

  if (f.method === 'PV') {
    if (side === 'M') return null;             // 正中穴沒有「自己這一側的瞳孔」
    const iris = side === 'R' ? fr.irisR : fr.irisL;
    const base = _p(lm, f.base + side, W, H);
    // 把基準點投影到 ey 軸上取「高度」，x 就自然鎖在瞳孔垂線
    const t = (base.x - iris.x) * ey.x + (base.y - iris.y) * ey.y;
    const d = t + (f.dy || 0) * ipd;
    return { x: iris.x + ey.x * d, y: iris.y + ey.y * d };
  }

  if (f.method === 'BT') {
    const a = _p(lm, f.a + sfx, W, H), b = _p(lm, f.b + sfx, W, H);
    const r = f.ratio == null ? 0.5 : f.ratio;
    return { x: a.x + (b.x - a.x) * r, y: a.y + (b.y - a.y) * r };
  }
  return null;
}

// ── 三、頭部姿態與信心度 ──────────────────────────────────────────────
//
// Su et al. 用 ±30° 硬閾值：超過就叫使用者轉正，二選一。
// 這裡改成連續信心度，臉越側圓盤壓得越扁 —— 把不確定性直接畫出來，
// 跟手部那條線的核心賣點（圓盤壓扁＝即時信心度）是同一套。
function faceHeadPose(lm, W, H) {
  const fr = faceFrame(lm, W, H);
  if (!fr) return null;
  const rollDeg = Math.atan2(fr.irisL.y - fr.irisR.y, fr.irisL.x - fr.irisR.x) * 180 / Math.PI;

  const fR = _p(lm, 'faceR', W, H), fL = _p(lm, 'faceL', W, H), nose = _p(lm, 'noseTip', W, H);
  const half = (fL.x - fR.x) / 2;
  // ⚠ 這是「鼻尖相對臉寬中線的偏移」，是 yaw 的粗略代理不是真角度。
  //   之後要換成 3D 法向（待辦，見 臉部/README.md）
  const yaw = Math.abs(half) < 1 ? 0 : (nose.x - (fR.x + fL.x) / 2) / half;

  return {
    rollDeg,
    yaw,
    facing: Math.max(0, 1 - Math.abs(yaw)),
    ipd: fr.ipd,
  };
}

/** 圓盤半徑：跟著臉的大小走，不用絕對像素 */
const faceDiscR = (ipd) => Math.max(6, ipd * 0.035);

/**
 * 信心圓盤：臉越側，水平方向壓得越扁。
 * 跟手部的 drawConfidenceDisc 不同 —— 手部是用 3D 基底投影多邊形，
 * 臉部目前只有 yaw 代理值，所以先用橢圓。等 3D 法向做出來再對齊。
 */
function drawFaceDisc(ctx, x, y, r, pose) {
  const k = Math.max(0.08, pose.facing);
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(x, y, r * k, r, pose.rollDeg * Math.PI / 180, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(0, 229, 160, .85)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = 'rgba(0, 229, 160, .12)';
  ctx.fill();
  ctx.restore();
}
