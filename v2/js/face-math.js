// ═══════════════════════════════════════════════════════════════════
// 臉部穴道定位公式
//
// 這是 `臉部/face_acu.py` 的 JS 版，兩邊必須一致 —— 改了要同步回去，
// 因為 Python 那邊有 `臉部/驗證.py` 在跑誤差，公式分家就沒得驗了。
//
// ⚠️ 資料基礎極薄：1 人 1 張照片 / 29 筆標注 / 15 個穴道。
//    每條公式的 src 欄位寫明參數怎麼來的，`WHO字面` 才是可靠的，
//    `fit(n=…)` 都是暫定值。
//
// 2026-08-23：補進眉區 5 穴 → 9 / 23。整體 NME 2.292%、FR10% 0（n=17 點）。
// 2026-08-27：補進鼻 2 ＋ 口周 4 → 15 / 23。整體 NME 2.041%、FR10% 0（n=25 點）。
//    這 6 個裡有 4 個是 0 擬合，水溝 0.27% / 兌端 0.40% 是全檔最準的兩個。
// 2026-09-15：補進瞳子髎 GB1 ＋ 側臉 6 穴 → **23 / 23 全部有公式**。
//    正臉 17 穴：3 人 60 點、NME 3.48%（self 2.62 / ten_2 3.99 / duke 4.93）。
//    ⚠️ 側臉 6 穴（EX-HN5 GB3 SI18 ST5 ST6 ST7）**全部沒有 GT**：
//       n=1 人、每側各 1 筆、兩側還來自不同照片，常數就是拿那 2 筆挑的。
//       它們用新的 PF 法（尺 = faceHeight 而非 IPD），詳見下方說明。
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

// PF 法的尺：眉間 → 下巴。受 yaw 影響遠小於 IPD，側臉才量得準。
function _faceHeight(lm, W, H) {
  const g = _p(lm, 'glabella', W, H), c = _p(lm, 'chin', W, H);
  return Math.hypot(g.x - c.x, g.y - c.y);
}

// ── 二、定位法 ────────────────────────────────────────────────────────
//
// 沿用 Su et al. 2023 §4.1 的三分法，臉部多加一種特化：
//   PT  點定位      直接落在某個 landmark
//                   dy = 沿 ey（臉的下方）位移；dx = 沿 ex **向外側**位移
//                   （dx 正 = 離中線更遠，左右自動鏡像；正中穴不適用）
//   BT  點間定位    兩點之間用 ratio 內插
//   PV  瞳孔垂線交叉  x 鎖在瞳孔垂線上，y 取某個水平基準 + k×IPD
//   PF  點定位，但尺用 **faceHeight（眉間 lm9 → 下巴 lm152）** 而不是 IPD
//       側臉 6 穴專用：側臉時遠側那隻眼被壓扁，IPD 只剩正臉的 55~72%，
//       當分母會讓誤差虛胖 3 倍。dx/dy 的意義與 PT 相同（dx 正 = 向外側）。
//
// PV 是她 CS（線間交叉）的特例。WHO 有一票臉部穴道都是「瞳孔正下方 ×
// 某個高度」（承泣、四白、巨髎、陽白、魚腰…），共用這一種就夠，
// 不必每個穴道各自擬合一組 (x, y)。
const FACE_FORMULA = {
  BL1: {
    method: 'PT', at: 'inner', dy: 0,
    src: 'WHO字面（內眥）。實測偏差 1–3px = 0.3–0.9% IPD，在標注雜訊內，不加位移',
    err: '0.35% / 0.24%',
  },
  ST1: {
    method: 'PV', base: 'eyeBot', dy: 0.105,
    src: 'fit(n=1張/2側)：實測 9.31% 與 11.70% IPD，取平均。⚠ 兩側差 2.4pp，需多張',
    err: '0.87% / 0.82%',
  },
  ST2: {
    method: 'PV', base: 'eyeBot', dy: 0.255,
    src: 'fit(n=1張/1側)：⚠ 另一側標注有誤，只有單一樣本撐著',
    err: '1.88% / 2.19%',
  },
  ST3: {
    method: 'PV', base: 'ala', dy: 0,
    src: 'WHO字面（瞳孔垂線 × 鼻翼下緣同高）。實測高度與 landmark 129/358 差 2.2–2.8px',
    err: '1.81% / 3.35%',
  },
  'EX-HN7': {
    method: 'CS', xa: 'outer', xb: 'inner', ratio: 0.25, ylike: 'ST1',
    src: '⭐ 用戶 2026-09-13 口頭指定的定義，非 WHO、非擬合、0 常數：'
       + 'x = 外眥→內眥 走 1/4；y = 與承泣 ST1 同高。'
       + '與傳統說法「眶下緣外 1/4 與內 3/4 交界」的差別只在高度基準。',
    err: null,       // ⚠ 用戶指示標注檔裡的球後不作為 GT → 此穴永遠沒有誤差數字
    noGt: true,
  },

  // ── 眉區 5 穴（2026-08-23 補）────────────────────────────────────
  // 資料：臉部/標注結果/face_annot_self_2026-08-23_14h22m.json（n=1 人 1 張）
  // 5 個裡有 3 個是 0 擬合（印堂、魚腰、絲竹空），只有陽白與攢竹帶 fit 常數。
  'EX-HN3': {
    method: 'PT', at: 'glabella', dy: 0,
    src: '解剖標誌（landmark 9 = glabella 眉間），0 擬合。'
       + '⚠ WHO 字面的「兩眉頭連線中點」(BT 107↔336) 實測 4.56%，比直接取 glabella 差一倍',
    err: '2.86%（正中穴）',
  },
  BL2: {
    method: 'PT', at: 'browInBot', dy: -0.0833,
    src: 'fit(n=1張/2側)：⚠⚠ 本檔誤差最大的一個。試過 6 種寫法全部 >5%'
       + '（上緣 9.67%／下緣 10.10%／上下內插 7.25%）。推測原因：「眉頭凹陷」是**觸診**定義，'
       + '不是視覺可見標誌 —— 光學法的結構性限制，不是常數沒調好',
    err: '6.84% / 4.62%',
  },
  'EX-HN4': {
    method: 'PV', base: 'browMidBot', dy: 0,
    src: 'WHO/教科書字面（瞳孔垂線 × 眉毛中點），0 擬合。'
       + '高度基準用眉中「下」緣 65/295；改用上緣 105/334 會惡化到 8.04%',
    err: '2.10% / 1.25%',
  },
  GB14: {
    method: 'PV', base: 'browMidBot', dy: -0.2431,
    src: 'fit(n=1張/2側)：實測 R -0.2458 / L -0.2404，取平均。'
       + '⚠ 這個 -0.2431 IPD 是**暫代「眉上 1 寸」的擬合值**，不是量出來的寸。'
       + '真正的 B-cun 要靠髮際線，而 glabellaHair 那把尺已知低估 86%，'
       + '且該批 hairline=null（沒撥瀏海拍）→ 等有髮際照再改成真正的 0 擬合編碼',
    err: '4.64% / 2.26%',
  },
  TE23: {
    method: 'PT', at: 'browTail', dy: 0,
    src: '解剖標誌（landmark 70/300 = 眉梢外端上緣），0 擬合。'
       + '改用 browOut 46/276 會惡化到 4.51%',
    err: '1.04% / 1.87%',
  },

  // ── 鼻 2 ＋ 口周 4（2026-08-27 補）─────────────────────────────────
  // 資料：臉部/標注結果/face_annot_self_2026-08-27_03h30m.json（n=1 人 1 張）
  // 6 個裡 4 個 0 擬合；只有迎香與地倉帶 fit 常數，兩個都只 fit 一個參數（dx）。
  LI20: {
    method: 'PT', at: 'ala', dx: 0.0268,
    src: 'fit(n=1張/2側)：鼻翼外緣 129/358 再向外 0.0268 IPD（≈8.7px）。'
       + '⭐ 兩側量到 0.0250 / 0.0285，差只有 0.0036 —— 本檔一致性最好的擬合參數。'
       + '解剖上說得通：lm129/358 是鼻翼外緣本身，WHO 說穴在「鼻唇溝中」，本來就該再外一點。'
       + '0 擬合版（直接取 129/358）是 3.04%',
    err: '0.35% / 2.13%',
  },
  GV25: {
    method: 'PT', at: 'noseApex',
    src: '解剖標誌（landmark 4 = 鼻尖最凸點），0 擬合。'
       + '⚠ 直覺會抓 lm1（名字就叫 noseTip）但那點實測 8.93%，差 5 倍',
    err: '1.68%（正中穴）',
  },
  ST4: {
    method: 'PT', at: 'mouth', dx: 0.1483,
    src: 'fit(n=1張/2側)：口角 61/291 向外 0.1483 IPD。'
       + '⚠ **非 fit 不可** —— WHO 寫「口角外側 0.4 F-cun」，F-cun 是指寸'
       + '（中指中節橫紋間距），臉上量不到，只能先用 IPD 比例暫代。'
       + '兩側量到 0.1255 / 0.1711，差 0.0457 偏大，需多人資料。'
       + 'dy 平均 +0.0004 ≈ 0（純水平位移），與 WHO「口角外側」一致，故不設 dy',
    err: '2.53% / 2.57%',
  },
  GV26: {
    method: 'BT', a: 'subnasale', b: 'lipTop', ratio: 1 / 3,
    src: 'WHO **另一版本**字面（人中溝上 1/3 與下 2/3 交界），0 擬合。'
       + '⭐ 這批意外驗到一件事：WHO 主定位寫「人中溝中線的**中點**」(ratio 0.5) 實測 2.98%，'
       + '而註記的另一版本 1/3 是 0.27% —— 實測站在另一版本這邊'
       + '（自由掃描的最佳 ratio 是 0.325）',
    err: '0.27%（正中穴，全檔最準）',
  },
  GV27: {
    method: 'PT', at: 'lipTop',
    src: '解剖標誌（landmark 0 = 上唇結節），0 擬合',
    err: '0.40%（正中穴）',
  },
  CV24: {
    method: 'PT', at: 'mentolabial',
    src: '解剖標誌（landmark 18 = 頦唇溝中央），0 擬合。'
       + '⚠ lm200 名字看起來才像頦唇溝，但實測 11.65%；lm17（下唇下緣）5.29%',
    err: '2.12%（正中穴）',
  },

  // ── 瞳子髎（2026-09-15 補）─────────────────────────────────────────
  GB1: {
    method: 'PT', at: 'outer', dx: 1 / 6, dy: 0,
    src: 'WHO 字面、0 擬合：外眥 lm33/263 向外 0.5 B-cun。'
       + '臉部橫向骨度取「兩瞳孔間 = 3 寸」→ 0.5 寸 = IPD/6 = 0.1667。'
       + '⚠ 誤差數字目前不可信 —— 三份標注解讀差 2.4 倍（換算成寸：'
       + 'self 09-01 標 0.556/0.497、duke 09-12 標 0.289/0.300、ten_2 09-14 標 0.226/0.230）。'
       + '每人自己左右一致但三份差兩倍多，而三份都是同一個標注者 → 解讀隨時間漂移。'
       + '三人硬 fit（dx=0.1166）會變成誰都不準，故採 0 擬合的 WHO 字面。',
    err: '1.86% / 7.15% / 9.20%（self / duke / ten_2）',
  },

  // ── 側臉 6 穴（2026-09-15 補）───────────────────────────────────────
  // 資料：ten_2 `S__30269450_0.jpg`（右側臉）＋ `S__30285826.jpg`（左側臉）。
  //
  // ⚠️⚠️ 這 6 個是**用戶指示「全部做成公式灌進 demo 網站」才寫的，不是驗證通過才寫的**。
  //      每穴每側各只有 1 筆，基準點與常數都是拿這 2 筆挑出來的 —— 連訓練誤差都算不出來。
  //      唯一的交叉訊號是「兩側差」（兩側來自不同照片），下面各穴都換算成 mm 附上
  //      （faceHeight 取 12cm）。全部登記在 記錄控制/待驗證清單.md，正臉補標後必須重做。
  //
  //
  // ⚠️⚠️⚠️ 2026-09-15 實測：這 6 條**只在側臉照上成立，正臉相機下會系統性偏**。
  //      驗法（臉部/檢查_側臉公式套正臉_20260915.py）：同一條公式算出來的點，
  //      在側臉照上落在哪個 landmark、正臉照上又落在哪個 —— 鏡像正規化後比。
  //      **12 個落點只有 3 個對到同一個解剖點。**
  //      原因：側臉量到的「向內」在 3D 裡有一部分其實是「向後」（深度方向），
  //      正臉投影下就變成錯誤的橫向位移。上關 GB3 最明顯（正臉上往臉中央跑約 2.5cm）。
  //      → 正臉補標之後一定要整批重做，不是微調常數的問題。
  //
  // 選基準的規則：先要求「基準點離穴道 ≤ 0.30 faceHeight」（約 3.6cm），在這個範圍內
  // 才比兩側一致性。只比一致性會挑到位移 0.7 faceHeight 的點 —— 剛好兩側一致，
  // 但講不出解剖道理，而且對頭部姿態極度敏感。
  'EX-HN5': {
    method: 'PF', at: 'outer', dx: 0.2377, dy: -0.0501,
    src: 'fit(n=1人/2張/每側1筆)：外眥向外 0.2377、向上 0.0501 faceHeight。'
       + '兩側差 0.0237 faceHeight ≈ 2.8mm —— 6 個裡最好的。⚠ 無 GT 可驗。',
    err: null, noGt: true,
  },
  GB3: {
    method: 'PF', at: 'temp', dx: -0.1043, dy: 0.1517,
    src: 'fit(n=1人/2張/每側1筆)：顳部 lm139/389 向內 0.1043、向下 0.1517 faceHeight。'
       + '兩側差 0.0978 faceHeight ≈ 11.7mm ⚠ 偏大。'
       + 'WHO 說「顴弓上緣中點凹陷」是**觸診**定義，跟攢竹 BL2 同一類結構性困難。',
    err: null, noGt: true,
  },
  SI18: {
    method: 'PF', at: 'cheek', dx: 0.0020, dy: -0.0429,
    src: 'fit(n=1人/2張/每側1筆)：顴部 lm50/280 幾乎原地（dx≈0）、向上 0.0429 faceHeight。'
       + '兩側差 0.1289 faceHeight ≈ 15.5mm ⚠⚠ 6 個裡最差 —— '
       + '目前這條公式只能說「大概在顴骨上」。',
    err: null, noGt: true,
  },
  ST5: {
    method: 'PF', at: 'mand', dx: 0.0516, dy: -0.0261,
    src: 'fit(n=1人/2張/每側1筆)：下頜體 lm135/364 向外 0.0516、向上 0.0261 faceHeight。'
       + '兩側差 0.0552 faceHeight ≈ 6.6mm。'
       + '另有一筆 S__30277635.jpg 的 ST5_R/ST5_L 標在同一位置（側臉看不到對側），已排除。',
    err: null, noGt: true,
  },
  ST6: {
    method: 'PF', at: 'jaw', dx: -0.0355, dy: -0.0901,
    src: 'fit(n=1人/2張/每側1筆)：下頜角 lm172/397 向內 0.0355、向上 0.0901 faceHeight。'
       + '兩側差 0.0502 faceHeight ≈ 6.0mm。'
       + '這穴是 6 個裡唯一在最近點探測時兩側指到同一個 landmark 的，訊號相對乾淨。',
    err: null, noGt: true,
  },
  ST7: {
    method: 'PF', at: 'tragus', dx: -0.1896, dy: 0.1873,
    src: 'fit(n=1人/2張/每側1筆)：耳屏 lm127/356 向內 0.1896、向下 0.1873 faceHeight。'
       + '兩側差 0.0731 faceHeight ≈ 8.8mm。WHO 定義同樣依賴觸診（閉口取穴）。',
    err: null, noGt: true,
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
    const ky = f.dy || 0;
    // dx 一律「向外側為正」：canonical R 側在 -ex 方向、L 側在 +ex 方向
    const kx = (f.dx || 0) * (side === 'M' ? 0 : (side === 'R' ? -1 : 1));
    return {
      x: b.x + ey.x * ky * ipd + fr.ex.x * kx * ipd,
      y: b.y + ey.y * ky * ipd + fr.ex.y * kx * ipd,
    };
  }

  if (f.method === 'PF') {
    // 同 PT，但尺換成 faceHeight —— 側臉時 IPD 被壓扁，不能當分母
    const b = _p(lm, f.at + sfx, W, H);
    const fh = _faceHeight(lm, W, H);
    const ky = f.dy || 0;
    const kx = (f.dx || 0) * (side === 'M' ? 0 : (side === 'R' ? -1 : 1));
    return {
      x: b.x + ey.x * ky * fh + fr.ex.x * kx * fh,
      y: b.y + ey.y * ky * fh + fr.ex.y * kx * fh,
    };
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

  // CS：橫縱分開取 —— x 走兩個 landmark 的內插，y 抄另一個穴道的高度。
  // 兩個分量都在臉座標系 (ex, ey) 裡取，所以對頭部側傾 (roll) 免疫。
  // 與 Python 版 face_acu.py 的 CS 分支必須逐行對應（tests/face.js 會比數字）。
  if (f.method === 'CS') {
    if (side === 'M') return null;
    const ref = _oneFacePoint(FACE_FORMULA[f.ylike], side, lm, W, H, fr);
    if (!ref) return null;
    const a = _p(lm, f.xa + side, W, H), b = _p(lm, f.xb + side, W, H);
    const r = f.ratio == null ? 0.5 : f.ratio;
    const px = { x: a.x + (b.x - a.x) * r, y: a.y + (b.y - a.y) * r };
    const o = side === 'R' ? fr.irisR : fr.irisL;      // 共用原點
    const u = (px.x - o.x) * fr.ex.x + (px.y - o.y) * fr.ex.y;   // 橫向取自內插點
    const v = (ref.x - o.x) * ey.x + (ref.y - o.y) * ey.y;       // 縱向取自參考穴
    return { x: o.x + fr.ex.x * u + ey.x * v, y: o.y + fr.ex.y * u + ey.y * v };
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
