// ── MATH HELPERS ──────────────────────────────────────────────────────────────

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function computeCunPx(lm, W, H) {
  // 中指同身寸：中指中節指骨長 |lm10-lm11|（2026-07-18 換尺）
  //   理由：古典同身寸之一、可引用 WHO；手背視角下攤平、投影縮短小；
  //         實測跨人 CV 7.1% 略優於拇指 7.0%，且不隨拇指外展角伸縮。
  //   舊尺（拇指近節指骨長 |lm2-lm3|）自創、隨拇指姿勢飄（r=+0.693），
  //   校準對比與拇指舊參數見 記錄控制/中指同身寸校準_20260718.md。
  return Math.hypot((lm[11].x - lm[10].x) * W, (lm[11].y - lm[10].y) * H);
  // 拇指舊尺（保留供對照）：Math.hypot((lm[3].x-lm[2].x)*W, (lm[3].y-lm[2].y)*H)
}

function computeHandTiltDeg(lm) {
  const v1 = {
    x: lm[9].x - lm[0].x,
    y: lm[9].y - lm[0].y,
    z: (lm[9].z || 0) - (lm[0].z || 0),
  };
  const v2 = {
    x: lm[5].x - lm[17].x,
    y: lm[5].y - lm[17].y,
    z: (lm[5].z || 0) - (lm[17].z || 0),
  };
  const nx = v1.y * v2.z - v1.z * v2.y;
  const ny = v1.z * v2.x - v1.x * v2.z;
  const nz = v1.x * v2.y - v1.y * v2.x;
  const mag = Math.sqrt(nx * nx + ny * ny + nz * nz);
  if (mag < 1e-6) return 0;
  return (Math.acos(Math.min(1, Math.abs(nz) / mag)) * 180) / Math.PI;
}

// ── 手掌信任值（骨長自洽性）───────────────────────────────────────────────────
//
// ⭐ 這是「整隻手」的指標，跟選了哪個穴道完全無關。
//
// 原理：同一隻手的骨頭比例是固定的。MediaPipe 輸出的是 3D 座標，理論上手怎麼轉，
//       算出來的 3D 骨長比都該是同一組數字。實際上不是 —— 2026-07-26 實機錄製
//       203 筆實測：手轉到切面時中指中節「長」了 57%、掌寬「縮」了 39%。
//       骨頭不會變長，所以偏離多少 = 這一幀的 3D 重建有多不可信。
//
// 為什麼用這個而不用 MediaPipe 自報的 handedness score：
//       同一份實測，自報信心在 0~180° 全程 0.86~0.99 幾乎是平的（與角度相關 r=−0.287），
//       骨長自洽跨度 0.19~1.00（r=+0.724）。**判別力差 6 倍。**
//       模型自報的信心不知道自己看不看得到手（2026-07-22 拆解已證：全黑輸入照吐 21 點）。
//
// ⚠ 這是單次錄製、單手、203 筆、中間角度採樣稀疏的結果，方向可信、數字待驗。

// 涵蓋整隻手的 10 條骨頭（掌骨骨架 + 各指節）。避免全部集中在同一平面上，
// 否則手繞該平面轉時偏離會系統性偏一邊。
const TRUST_BONES = [
  [0, 5], [0, 17], [5, 17], [5, 9], [9, 13], [13, 17], // 手掌骨架
  [10, 11], [5, 6], [13, 14], [17, 18],                 // 各指節
];

// 信任值的衰減尺度：骨長 RMS 偏離達這個值時，信任降到 1/e ≈ 0.37。
// 0.15 是依 2026-07-26 實測資料選的（該資料在切面時偏離約 30%，對應信任 ~0.2）。
const TRUST_DECAY = 0.15;

// 一幀的「形狀向量」：10 條骨長除以它們的幾何平均。
// 除掉幾何平均是為了消掉「手離鏡頭遠近」——那只會整體放大縮小，不是失真。
function handShapeVector(lm, W) {
  if (!lm || lm.length < 21) return null;
  const L = TRUST_BONES.map(([i, j]) => {
    // 三軸都用 W 當尺度（等向）。注意這與 _cv() 的 y*H 不同：算長度時若 y 用 H
    // 會讓非方形畫布的骨長被系統性壓縮，比例就不能跨角度比較了。
    const a = lm[i], b = lm[j];
    return Math.hypot(
      (a.x - b.x) * W,
      (a.y - b.y) * W,
      ((a.z || 0) - (b.z || 0)) * W,
    );
  });
  if (L.some((x) => !(x > 0))) return null;
  const g = Math.exp(L.reduce((s, x) => s + Math.log(x), 0) / L.length);
  return L.map((x) => x / g);
}

/**
 * 從一批「手正對鏡頭」的幀建立這隻手的骨長基準。
 * 每個人的手比例不同，所以基準必須逐人校準，不能寫死常數。
 *
 * @param {Array} frames 一批 landmark 陣列（建議手正對鏡頭停 2 秒，約 20 幀）
 * @returns {Object|null} { base:[...], noiseFloor:number, n:number }
 */
function calibrateHandBaseline(frames, W) {
  const vecs = frames.map((lm) => handShapeVector(lm, W)).filter(Boolean);
  if (vecs.length < 3) return null;
  // 取中位數而非平均：對偶發的爛幀穩健（等同 Java 裡先 sort 再取中間值）
  const mid = (a) => {
    const s = [...a].sort((x, y) => x - y);
    return s[Math.floor(s.length / 2)];
  };
  const base = TRUST_BONES.map((_, i) => mid(vecs.map((v) => v[i])));
  // 雜訊底線：校準期自己的殘留偏離。手明明沒轉也會有這麼多抖動，
  // 這部分不該算成「不可信」，所以之後要扣掉。
  const resid = vecs.map((v) => {
    const rel = v.map((x, i) => (x - base[i]) / base[i]);
    return Math.sqrt(rel.reduce((s, x) => s + x * x, 0) / rel.length);
  });
  return { base, noiseFloor: mid(resid), n: vecs.length };
}

/**
 * 掌面法向的極角，0~180°（0=掌面正對鏡頭、90=掌緣切著看、180=另一面正對）。
 *
 * ⚠ 為什麼要獨立一個函式，不直接用 computeAcuConfidence 的 polarDeg：
 *   後者會依選中的穴道決定用哪個法向。選 palm 類穴道（如合谷）時它等於掌面法向，
 *   但選 side 類穴道（如二間）時它是**側緣法向**，與掌面差約 90°。
 *   2026-07-26 兩份實機錄製就踩到這個：合谷那份差 0.0°、二間那份差 79.3°。
 *   手掌層級的指標必須有自己的角度軸，不能寄生在「現在選了哪個穴道」上。
 */
function computePalmPolarDeg(lm, W, H) {
  if (!lm || lm.length < 21) return null;
  const wrist = _cv(lm, 0, W, H);
  const n = _cCross(
    _cSub(_cv(lm, 5, W, H), wrist),
    _cSub(_cv(lm, 17, W, H), wrist),
  );
  const m = Math.hypot(n.x, n.y, n.z);
  if (m < 1e-6) return null;
  return (Math.acos(Math.max(-1, Math.min(1, n.z / m))) * 180) / Math.PI;
}

// 「掌面偏離正對幾度」0~90。0=正對（不管手心手背）、90=掌緣切著看。
// 這是使用者實際關心的量：我的手歪成這樣，系統還信不信得過。
function palmOffAxisDeg(polarDeg) {
  return polarDeg == null ? null : Math.min(polarDeg, 180 - polarDeg);
}

/**
 * 算這一幀的手掌信任值。
 *
 * @returns {Object|null} { dev, trust, level }
 *   dev   骨長 RMS 相對偏離（0.10 = 骨頭比例平均差 10%）
 *   trust 0~1，1=完全自洽可信、0=完全走樣
 *   level "high"(≥0.8) / "mid"(≥0.5) / "low"
 *
 * 門檻依 2026-07-26 實測定：掌面偏離正對 ≤27° 時 trust≥0.8、≤59° 時 ≥0.5。
 * 前者與專案既有的 TILT_MAX_DEG=25° 幾乎吻合 —— 一個憑直覺定的門檻被獨立方法驗證。
 */
function computeHandTrust(lm, W, baseline) {
  if (!baseline || !baseline.base) return null;
  const v = handShapeVector(lm, W);
  if (!v) return null;
  const rel = v.map((x, i) => (x - baseline.base[i]) / baseline.base[i]);
  const dev = Math.sqrt(rel.reduce((s, x) => s + x * x, 0) / rel.length);
  const excess = Math.max(0, dev - (baseline.noiseFloor || 0));
  const trust = Math.exp(-excess / TRUST_DECAY);
  return {
    dev,
    trust,
    level: trust >= 0.8 ? "high" : trust >= 0.5 ? "mid" : "low",
  };
}

// ── 局部視角信心度 ────────────────────────────────────────────────────────────
//
// JS 沒有內建的向量型別（不像 C# 有 Vector3），所以下面四個小函式等於是手寫一個
// 極簡版 Vector3。每個「向量」就是一個 {x, y, z} 物件——你可以想成 Java 的
// 一個只有三個 public float 欄位的小 class，只是不用先宣告型別。

// 把第 i 個 landmark 轉成像素座標的 3D 點。
// MediaPipe 給的 x,y 是 0~1 的比例值，要乘上畫布寬高才是像素；
// z 沒有明確單位，慣例上乘寬度讓三軸尺度接近（houxi_3d_demo.py 也是這樣做）。
function _cv(lm, i, W, H) {
  return { x: lm[i].x * W, y: lm[i].y * H, z: (lm[i].z || 0) * W };
}

function _cSub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

// 外積（cross product）：給兩個向量，回傳一個同時垂直於兩者的向量。
// 等同 C# 的 Vector3.Cross(a, b)。拿三個點做兩次相減再外積，就得到那個平面的法向量。
function _cCross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

// 正規化：把向量長度變成 1，只保留方向。等同 Vector3.Normalize()。
function _cNorm(a) {
  const m = Math.hypot(a.x, a.y, a.z);
  if (m < 1e-9) return { x: 0, y: 0, z: 0 };
  return { x: a.x / m, y: a.y / m, z: a.z / m };
}

/**
 * 算某個穴道所在皮膚的「朝向鏡頭程度」。
 *
 * 回傳 { angleDeg, conf, level, polarDeg, azimuthDeg, azimuthValid, normal, kind, basis }
 * 或 null（landmark 不足時）：
 *   angleDeg   0~90  法向量與視線的夾角。0=皮膚正對鏡頭、90=切著看
 *   conf       0~1   = |法向量.z| = cos(angleDeg)
 *   level      "high"/"mid"/"low"  依 CONF_HIGH / CONF_MID 分級
 *   polarDeg   0~180 不取絕對值的極角，可區分正對(0)/切面(90)/背對(180)
 *   azimuthDeg 0~360 法向量投影在畫面上的方位（往哪邊轉的）
 *   azimuthValid     false 時 azimuthDeg 是雜訊（法向量幾乎沿著視線）
 *   kind       "palm" 或 "side"    這個穴道用哪種法向（見 ACU_NORMAL_SPEC）
 *   basis      { b1, b2 }          圓盤所在平面的兩個方向向量，畫圓盤時用
 *
 * ⚠ 三個必須知道的限制：
 *   ① conf 與 angleDeg 互為 cos 恆等式，是「幾何量」不是「可信度」。
 *      拿 angleDeg 當 x 軸、conf 當 y 軸畫圖，畫出來的是純數學 cos 曲線，
 *      跟手、跟模型表現無關。真可信度要看 handedness score 與 landmark 抖動。
 *   ② 這個計算吃 MediaPipe 的 z。z 在攝像頭即時模式下相對可用，但在靜態照片上
 *      是神經網路硬猜的（2026-05-23 已記錄）；且大角度時 z 本來就在猜
 *      （2026-07-22 拆解：全黑輸入照吐 21 點）——量尺與被量物同源。
 *   ③ _cv() 把 x,z 乘 W 而 y 乘 H。W≠H 時 y 軸尺度與另兩軸不同，法向量會有
 *      非等向縮放的系統性偏差，對 azimuthDeg 影響最明顯（polarDeg 次之）。
 *      此為既有行為，未修以免動到已部署的 conf/angleDeg；離線分析時若需要精確
 *      方位角，應改以等向尺度（三軸都乘 W）重算。
 */
function computeAcuConfidence(acuName, lm, W, H) {
  if (!lm || lm.length < 21) return null;

  // 手掌平面法向量：拿「手腕→食指根」和「手腕→小指根」兩個向量做外積，
  // 得到一個垂直戳出手掌平面的箭頭。
  const wrist = _cv(lm, 0, W, H);
  const nPalm = _cNorm(
    _cCross(
      _cSub(_cv(lm, 5, W, H), wrist),
      _cSub(_cv(lm, 17, W, H), wrist),
    ),
  );
  // 手的長軸（手腕→中指根），當作手掌平面上的一個參考方向
  const fHand = _cNorm(_cSub(_cv(lm, 9, W, H), wrist));

  const spec = ACU_NORMAL_SPEC[acuName];
  let normal, b1, b2;

  if (spec && spec.kind === "side") {
    // 側緣穴：法向量是「側向」——同時垂直於手掌法向與該根手指的骨軸。
    // 圓盤就立在側壁上，所以圓盤平面由「骨軸」和「手掌法向」張成。
    const [ia, ib] = spec.axis;
    const fBone = _cNorm(_cSub(_cv(lm, ib, W, H), _cv(lm, ia, W, H)));
    normal = _cNorm(_cCross(nPalm, fBone));
    b1 = fBone;
    b2 = nPalm;
  } else {
    // 手背/手心正面穴：法向量就是手掌法向，圓盤平躺在手掌平面上。
    normal = nPalm;
    b1 = fHand;
    b2 = _cNorm(_cCross(nPalm, fHand));
  }

  if (Math.hypot(normal.x, normal.y, normal.z) < 1e-6) return null;

  // facing = 法向量的 z 分量絕對值。
  // z 軸就是「射向鏡頭」的方向，所以 z 分量越大 = 這塊皮膚越正對鏡頭。
  // 取絕對值是因為手心朝上時法向量整個反過來，但「攤平程度」是一樣的。
  const conf = Math.min(1, Math.abs(normal.z));
  const angleDeg = (Math.acos(conf) * 180) / Math.PI;
  const level = conf >= CONF_HIGH ? "high" : conf >= CONF_MID ? "mid" : "low";

  // ⭐ 360° 用的完整球面座標（2026-07-26 新增，供角度覆蓋實驗）
  //
  // 上面的 angleDeg 因為取了絕對值，只有 0~90°：手背朝鏡頭和手心朝鏡頭會得到
  // 同一個數字，往左轉和往右轉也是同一個數字。要畫「每一個角度的信任值」需要
  // 能區分方向，所以另外算一組不取絕對值的球面座標：
  //
  //   polarDeg   = 法向量與 +z（射向鏡頭）的夾角，0~180°
  //                0°  = 這塊皮膚正對鏡頭
  //                90° = 完全切著看（最不可信）
  //                180°= 背對鏡頭（翻面，皮膚朝另一邊）
  //   azimuthDeg = 法向量投影到畫面平面後指向哪個方位，0~360°
  //                0°=畫面右、90°=畫面下（canvas y 軸向下）、180°=左、270°=上
  //                polarDeg 接近 0 或 180 時投影趨近於零，此角無意義（見 azimuthValid）
  //
  // 兩個角合起來就是「手朝哪」的完整描述，可以做成極座標熱圖。
  // 註：Java/C# 的 Math.atan2 語意相同，回傳 −π~π，這裡搬到 0~360。
  const polarDeg = (Math.acos(Math.max(-1, Math.min(1, normal.z))) * 180) / Math.PI;
  let azimuthDeg = (Math.atan2(normal.y, normal.x) * 180) / Math.PI;
  if (azimuthDeg < 0) azimuthDeg += 360;
  // 投影長度太短時方位角是純雜訊（法向量幾乎沿著視線，方位沒有意義）
  const azimuthValid = Math.hypot(normal.x, normal.y) > 0.08;

  return {
    angleDeg,
    conf,
    level,
    polarDeg,
    azimuthDeg,
    azimuthValid,
    normal,
    kind: spec && spec.kind === "side" ? "side" : "palm",
    basis: { b1, b2 },
  };
}

/**
 * 查某個穴道的角度上限（度）。表在 acu-data.js 的 ACU_ANGLE_LIMIT。
 * 沒列到的穴道回傳共同上限 ACU_ANGLE_HARD_CAP，不會回傳 undefined。
 */
function acuAngleLimit(acuName) {
  const v = ACU_ANGLE_LIMIT[acuName];
  return typeof v === "number" ? v : ACU_ANGLE_HARD_CAP;
}

/**
 * ⭐ 逐穴道角度閘門（2026-08-12 新增）。
 *
 * 取代「一個 TILT_MAX_DEG=25° 管全部穴道」的舊做法。判斷的是**這個穴道自己那塊皮膚**
 * 偏離鏡頭幾度，不是整隻手歪幾度 —— 對側緣穴（二間/後溪/陽谷…）這兩件事差了約 90°。
 *
 * 行為是「軟降級」（2026-08-12 用戶決定）：超標時**照樣畫點**，但把點染色 + 出提示，
 * 不像正反面閘門那樣直接不畫。理由：角度超標是「這個位置可能偏了幾 mm」，
 * 正反面錯是「這塊皮膚根本不在鏡頭這一側」，後者畫出來的點是錯的，前者只是不精確。
 *
 * 回傳 { level, angleDeg, limitDeg, overBy, kind, color, hint } 或 null：
 *   level     "ok" / "edge" / "bad"
 *             ok   = 在上限內
 *             edge = 超過上限但還在 ACU_ANGLE_MARGIN_DEG 以內（黃字，仍可參考）
 *             bad  = 超過上限 + margin（紅字，位置僅供參考）
 *   angleDeg  這塊皮膚偏離鏡頭幾度（0=正對）
 *   limitDeg  這個穴道的上限
 *   overBy    超出幾度（沒超就是 0）
 *   color     畫點用的顏色，直接餵 drawAcupoint
 *   hint      給使用者看的中文提示（level=ok 時為 null）
 *
 * ⚠ 提示文字刻意**不講「往左轉/往右轉」**：方向要靠 azimuthDeg，而 computeAcuConfidence
 *   的註釋③已載明 W≠H 時 azimuthDeg 有非等向縮放的系統性偏差，是四個角度裡最不可信的一個。
 *   講錯方向比不講方向更糟，所以只給「要擺成什麼姿勢」這種靠 kind 就能確定的定性指引。
 */
function computeAcuGate(acuName, lm, W, H) {
  const info = computeAcuConfidence(acuName, lm, W, H);
  if (!info) return null;

  const limitDeg = acuAngleLimit(acuName);
  const overBy = Math.max(0, info.angleDeg - limitDeg);
  const level =
    overBy <= 0 ? "ok" : overBy <= ACU_ANGLE_MARGIN_DEG ? "edge" : "bad";

  // side 類穴道長在側緣，要它正對鏡頭＝手要轉成手刀；palm 類則是把手掌攤平朝鏡頭。
  const poseHint =
    info.kind === "side"
      ? "請把手轉成手刀（側緣朝鏡頭）"
      : "請把手掌攤平正對鏡頭";

  const hint =
    level === "ok"
      ? null
      : `${acuName}這塊皮膚偏離鏡頭 ${Math.round(info.angleDeg)}°（上限 ${limitDeg}°）${
          level === "bad" ? "，位置僅供參考" : ""
        }　${poseHint}`;

  return {
    level,
    angleDeg: info.angleDeg,
    limitDeg,
    overBy,
    kind: info.kind,
    // 綠=在上限內、橘=邊緣、紅=明顯超標。與信心圓盤同一套語意色。
    color: level === "ok" ? "#00e5a0" : level === "edge" ? "#ffaa3c" : "#ff505a",
    hint,
    info, // 原始的 computeAcuConfidence 結果，畫圓盤/記 log 時可直接用，不必重算
  };
}

/**
 * 算信心圓盤的頂點（畫在畫布上的多邊形）。
 *
 * ⭐ 整個「圓盤會自己跟著手轉」的祕密就在最後兩行：算出來的頂點本來是 3D 的，
 *    但我們**只取 x 和 y、把 z 丟掉**。丟掉 z 在圖學上就叫「正投影」
 *    (orthographic projection)——等同於從無限遠處拍照。
 *
 *    手一轉，b1/b2 這兩個方向向量在畫面上的投影就變短，圓自動被壓扁成橢圓。
 *    **沒有任何一行程式在計算「該壓多扁」，它是丟掉 z 之後自然發生的。**
 *
 *    實測（ten_back.jpg，半徑 0.42 寸 = 52px）：
 *      手背正對鏡頭 → 畫出 14.8 × 103.2 px（幾乎是條線）
 *      手轉 30°     → 46.7 × 103.9 px
 *      手轉 60°     → 86.4 × 104.1 px
 *      手轉 90°     → 103.8 × 103.8 px（正圓）
 */
function confidenceDiscPoints(cx, cy, radiusPx, basis, segments = 36) {
  const pts = [];
  for (let k = 0; k < segments; k++) {
    const th = (k * 2 * Math.PI) / segments;
    const c = Math.cos(th),
      s = Math.sin(th);
    pts.push({
      x: cx + radiusPx * (c * basis.b1.x + s * basis.b2.x),
      y: cy + radiusPx * (c * basis.b1.y + s * basis.b2.y),
      // ↑ 只用 .x 和 .y，兩個基底向量的 .z 完全沒被用到 = 正投影
    });
  }
  return pts;
}

// isDorsalView — Solutions API (camera, mirrored): 'Left' = real right hand
function isDorsalView(lm, handedness) {
  const v1x = lm[5].x - lm[0].x,
    v1y = lm[5].y - lm[0].y;
  const v2x = lm[17].x - lm[0].x,
    v2y = lm[17].y - lm[0].y;
  const cross = v1x * v2y - v1y * v2x;
  return handedness.label === "Left" ? cross > 0 : cross < 0;
}

// ── CONVEX HULL (hand boundary clamping) ──────────────────────────────────────

function _convexHull(pts) {
  pts = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (O, A, B) =>
    (A.x - O.x) * (B.y - O.y) - (A.y - O.y) * (B.x - O.x);
  const lower = [],
    upper = [];
  for (const p of pts) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0
    )
      lower.pop();
    lower.push(p);
  }
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0
    )
      upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

function _ptInHull(p, hull) {
  let inside = false;
  for (let i = 0, j = hull.length - 1; i < hull.length; j = i++) {
    const { x: xi, y: yi } = hull[i],
      { x: xj, y: yj } = hull[j];
    if (
      yi > p.y !== yj > p.y &&
      p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi
    )
      inside = !inside;
  }
  return inside;
}

function _clampToHull(p, hull) {
  if (_ptInHull(p, hull)) return p;
  let best = p,
    bestD = Infinity;
  for (let i = 0, j = hull.length - 1; i < hull.length; j = i++) {
    const A = hull[j],
      B = hull[i];
    const dx = B.x - A.x,
      dy = B.y - A.y;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-6) continue;
    const t = Math.max(
      0,
      Math.min(1, ((p.x - A.x) * dx + (p.y - A.y) * dy) / len2),
    );
    const q = { x: A.x + t * dx, y: A.y + t * dy };
    const d = Math.hypot(p.x - q.x, p.y - q.y);
    if (d < bestD) {
      bestD = d;
      best = q;
    }
  }
  return best;
}


// ── PER-ACUPOINT CALC FUNCTIONS (v35 / v34) ───────────────────────────────────
//
// 每個穴道一個函數，統一簽名：
//   (lm, W, H, cp, dorsal, ov) → [{x, y}] | null
//
//   lm     : MediaPipe landmarks（正規化 0-1）
//   W, H   : 畫布像素尺寸
//   cp     : cunPx（同身寸對應的像素數）
//   dorsal : isDorsalView 結果（true = 手背朝鏡頭）
//   ov     : 參數覆蓋物件（用於 v34 snapshot，預設 {}）

// ── 合谷穴 LI4 ───────────────────────────────────────────────────────────────
// 起點 mid(lm[0],lm[5])，往 lm[2] 方向偏移 HG_CUN 寸
function _calcHegu(lm, W, H, cp, dorsal, ov = {}) {
  if (!dorsal) return null;
  const _HG_CUN = ov.HG_CUN ?? HG_CUN;
  const midX = ((lm[0].x + lm[5].x) / 2) * W;
  const midY = ((lm[0].y + lm[5].y) / 2) * H;
  const dx = lm[2].x * W - midX;
  const dy = lm[2].y * H - midY;
  const dist = Math.hypot(dx, dy);
  if (dist < 1) return [{ x: midX, y: midY }];
  const scale = (_HG_CUN * cp) / dist;
  return [{ x: midX + dx * scale, y: midY + dy * scale }];
}

// ── 陽池穴 SJ4 ───────────────────────────────────────────────────────────────
// lerp( mid(lm[9],lm[13]), lm[0] )
function _calcYangchi(lm, W, H, cp, dorsal, ov = {}) {
  if (!dorsal) return null;
  const _YC_T = ov.YC_T ?? YC_T;
  const mx = (lm[9].x + lm[13].x) / 2;
  const my = (lm[9].y + lm[13].y) / 2;
  return [{ x: lerp(mx, lm[0].x, _YC_T) * W, y: lerp(my, lm[0].y, _YC_T) * H }];
}

// ── 陽溪穴 LI5 ───────────────────────────────────────────────────────────────
// lm[0] + 橈側 unit-vector × YX_CUN 寸
function _calcYangxi(lm, W, H, cp, dorsal, ov) {
  if (!dorsal) return null;
  const _YX_CUN = ov.YX_CUN ?? YX_CUN;
  const wcPx = { x: (lm[5].x - lm[17].x) * W, y: (lm[5].y - lm[17].y) * H };
  const wcLen = Math.hypot(wcPx.x, wcPx.y);
  if (wcLen < 1) return null;
  return [{
    x: lm[0].x * W + (wcPx.x / wcLen) * _YX_CUN * cp,
    y: lm[0].y * H + (wcPx.y / wcLen) * _YX_CUN * cp,
  }];
}

// ── 陽谷穴 SI5 ───────────────────────────────────────────────────────────────
// lm[0] + 純尺側方向(⊥手軸) × YG_U 寸 + 手軸前向 × YG_F 寸
function _calcYanggu(lm, W, H, cp, dorsal, ov = {}) {
  if (!dorsal) return null;
  const _YG_U = ov.YG_U ?? YG_U;
  const _YG_F = ov.YG_F ?? YG_F;
  const wcx = (lm[17].x - lm[5].x) * W, wcy = (lm[17].y - lm[5].y) * H;
  const hax = (lm[9].x - lm[0].x) * W, hay = (lm[9].y - lm[0].y) * H;
  const haLen = Math.hypot(hax, hay);
  if (haLen < 1) return null;
  // 從腕-尺側向量中減去手軸分量，得到純尺側方向
  const dot = (wcx * hax + wcy * hay) / (haLen * haLen);
  const ucx = wcx - dot * hax, ucy = wcy - dot * hay;
  const ucLen = Math.hypot(ucx, ucy);
  if (ucLen < 1) return null;
  return [{
    x: lm[0].x * W + (ucx / ucLen) * _YG_U * cp + (hax / haLen) * _YG_F * cp,
    y: lm[0].y * H + (ucy / ucLen) * _YG_U * cp + (hay / haLen) * _YG_F * cp,
  }];
}

// ── 液門穴 SJ2 ───────────────────────────────────────────────────────────────
// mid(lm[13],lm[17]) 向 lm[0] 方向再前推 YM_CUN 寸
function _calcYemen(lm, W, H, cp, dorsal, ov = {}) {
  if (!dorsal) return null;
  const _YM_CUN = ov.YM_CUN ?? YM_CUN;
  const mx = ((lm[13].x + lm[17].x) / 2) * W;
  const my = ((lm[13].y + lm[17].y) / 2) * H;
  const dvx = mx - lm[0].x * W, dvy = my - lm[0].y * H;
  const dvLen = Math.hypot(dvx, dvy);
  if (dvLen < 1) return [{ x: mx, y: my }];
  return [{
    x: mx + (dvx / dvLen) * _YM_CUN * cp,
    y: my + (dvy / dvLen) * _YM_CUN * cp,
  }];
}

// ── 中渚穴 SJ3 ───────────────────────────────────────────────────────────────
// lerp( mid(lm[13],lm[17]), lm[0] )
function _calcZhongzhu(lm, W, H, cp, dorsal, ov = {}) {
  if (!dorsal) return null;
  const _ZZ_T = ov.ZZ_T ?? ZZ_T;
  const mx = (lm[13].x + lm[17].x) / 2;
  const my = (lm[13].y + lm[17].y) / 2;
  return [{ x: lerp(mx, lm[0].x, _ZZ_T) * W, y: lerp(my, lm[0].y, _ZZ_T) * H }];
}

// ── 小骨空 ───────────────────────────────────────────────────────────────────
// 直接取 lm[18]（小指中節指骨中點）
function _calcXiaogukong(lm, W, H, cp, dorsal) {
  return dorsal ? [{ x: lm[18].x * W, y: lm[18].y * H }] : null;
}

// ── 中魁穴 ───────────────────────────────────────────────────────────────────
// 直接取 lm[10]（中指中節指骨中點）
function _calcZhongkui(lm, W, H, cp, dorsal) {
  return dorsal ? [{ x: lm[10].x * W, y: lm[10].y * H }] : null;
}

// ── 大骨空 ───────────────────────────────────────────────────────────────────
// lm[3] + (lm[3]-lm[2]) × DG_EXT（DG_EXT=0 即直接取 lm[3]）
function _calcDagukong(lm, W, H, cp, dorsal, ov = {}) {
  if (!dorsal) return null;
  const _DG_EXT = ov.DG_EXT ?? DG_EXT;
  const dx = lm[3].x - lm[2].x, dy = lm[3].y - lm[2].y;
  return [{ x: (lm[3].x + dx * _DG_EXT) * W, y: (lm[3].y + dy * _DG_EXT) * H }];
}

// ── 八邪穴 ───────────────────────────────────────────────────────────────────
// 四個指縫節點；食/中/無名指縫加手指方向前推，無名-小指縫再加尺側偏移
function _calcBaxie(lm, W, H, cp, dorsal, ov = {}) {
  if (!dorsal) return null;
  const _BX1_T = ov.BX1_T ?? BX1_T;
  const _BX_FWD = ov.BX_FWD ?? BX_FWD;
  const _BX4_ULNAR = ov.BX4_ULNAR ?? BX4_ULNAR;
  const faxPx = (lm[9].x - lm[0].x) * W, fayPx = (lm[9].y - lm[0].y) * H;
  const faLen = Math.hypot(faxPx, fayPx);
  const fwdX = faLen > 1e-6 ? (faxPx / faLen) * _BX_FWD * cp : 0;
  const fwdY = faLen > 1e-6 ? (fayPx / faLen) * _BX_FWD * cp : 0;
  // 無名-小指縫的額外尺側偏移
  const ux = (lm[17].x - lm[13].x) * W, uy = (lm[17].y - lm[13].y) * H;
  const uLen = Math.hypot(ux, uy);
  const uX = uLen > 1e-6 ? (ux / uLen) * _BX4_ULNAR * cp : 0;
  const uY = uLen > 1e-6 ? (uy / uLen) * _BX4_ULNAR * cp : 0;
  return [
    // 拇-食指縫
    { x: lerp(lm[2].x, lm[5].x, _BX1_T) * W,          y: lerp(lm[2].y, lm[5].y, _BX1_T) * H },
    // 食-中指縫
    { x: ((lm[5].x + lm[9].x) / 2) * W + fwdX,        y: ((lm[5].y + lm[9].y) / 2) * H + fwdY },
    // 中-無名指縫
    { x: ((lm[9].x + lm[13].x) / 2) * W + fwdX,       y: ((lm[9].y + lm[13].y) / 2) * H + fwdY },
    // 無名-小指縫（+尺側偏移）
    { x: ((lm[13].x + lm[17].x) / 2) * W + fwdX + uX, y: ((lm[13].y + lm[17].y) / 2) * H + fwdY + uY },
  ];
}

// ── 二間穴 LI2 ───────────────────────────────────────────────────────────────
// lerp(lm[5],lm[6]) + 橈側偏移 EJ_RAD 寸
function _calcErjian(lm, W, H, cp, dorsal, ov = {}) {
  if (!dorsal) return null;
  const _EJ_T = ov.EJ_T ?? EJ_T;
  const _EJ_RAD = ov.EJ_RAD ?? EJ_RAD;
  const bxPx = lerp(lm[5].x, lm[6].x, _EJ_T) * W;
  const byPx = lerp(lm[5].y, lm[6].y, _EJ_T) * H;
  const rxPx = (lm[5].x - lm[9].x) * W, ryPx = (lm[5].y - lm[9].y) * H;
  const rLen = Math.hypot(rxPx, ryPx);
  return [{
    x: bxPx + (rLen > 1e-6 ? (rxPx / rLen) * _EJ_RAD * cp : 0),
    y: byPx + (rLen > 1e-6 ? (ryPx / rLen) * _EJ_RAD * cp : 0),
  }];
}

// ── 三間穴 LI3 ───────────────────────────────────────────────────────────────
// lm[5] + 橈側 × SJ3_CUN 寸 + 近腕 × SJ3_PROX 寸
function _calcSanjian(lm, W, H, cp, dorsal, ov = {}) {
  if (!dorsal) return null;
  const _SJ3_CUN = ov.SJ3_CUN ?? SJ3_CUN;
  const _SJ3_PROX = ov.SJ3_PROX ?? SJ3_PROX;
  const rxPx = (lm[5].x - lm[9].x) * W, ryPx = (lm[5].y - lm[9].y) * H;
  const rLen = Math.hypot(rxPx, ryPx);
  const haxPx = (lm[0].x - lm[9].x) * W, hayPx = (lm[0].y - lm[9].y) * H;
  const haLen = Math.hypot(haxPx, hayPx);
  return [{
    x: lm[5].x * W
      + (rLen  > 1e-6 ? (rxPx  / rLen)  * _SJ3_CUN  * cp : 0)
      + (haLen > 1e-6 ? (haxPx / haLen) * _SJ3_PROX * cp : 0),
    y: lm[5].y * H
      + (rLen  > 1e-6 ? (ryPx  / rLen)  * _SJ3_CUN  * cp : 0)
      + (haLen > 1e-6 ? (hayPx / haLen) * _SJ3_PROX * cp : 0),
  }];
}

// ── 前谷穴 SI2 ───────────────────────────────────────────────────────────────
// lerp(lm[17],lm[18]) + CCW 垂直方向（尺側）× QG_ULNAR 寸
function _calcQiangu(lm, W, H, cp, dorsal, ov = {}) {
  if (!dorsal) return null;
  const _QG_T = ov.QG_T ?? QG_T;
  const _QG_ULNAR = ov.QG_ULNAR ?? QG_ULNAR;
  const axPx = (lm[18].x - lm[17].x) * W, ayPx = (lm[18].y - lm[17].y) * H;
  const aLen = Math.hypot(axPx, ayPx);
  const ulnarX = aLen > 1e-6 ? (-ayPx / aLen) * _QG_ULNAR * cp : 0;
  const ulnarY = aLen > 1e-6 ? ( axPx / aLen) * _QG_ULNAR * cp : 0;
  return [{
    x: lerp(lm[17].x, lm[18].x, _QG_T) * W + ulnarX,
    y: lerp(lm[17].y, lm[18].y, _QG_T) * H + ulnarY,
  }];
}

// ── 腕谷穴 SI4 ───────────────────────────────────────────────────────────────
// lerp(lm[17],lm[0]) + CW 垂直方向（尺側）× WG_ULNAR 寸
function _calcWangu(lm, W, H, cp, dorsal, ov) {
  if (!dorsal) return null;
  const _WG_T     = ov.WG_T     ?? WG_T;
  const _WG_ULNAR = ov.WG_ULNAR ?? WG_ULNAR;
  const axPx = (lm[0].x - lm[17].x) * W, ayPx = (lm[0].y - lm[17].y) * H;
  const aLen = Math.hypot(axPx, ayPx);
  const ulnarX = aLen > 1e-6 ? ( ayPx / aLen) * _WG_ULNAR * cp : 0;
  const ulnarY = aLen > 1e-6 ? (-axPx / aLen) * _WG_ULNAR * cp : 0;
  return [{
    x: lerp(lm[17].x, lm[0].x, _WG_T) * W + ulnarX,
    y: lerp(lm[17].y, lm[0].y, _WG_T) * H + ulnarY,
  }];
}

// ── 後溪穴 SI3 ───────────────────────────────────────────────────────────────
// lerp(lm[17],lm[0]) + CW 垂直方向（尺側）× HX_ULNAR 寸（起點比腕谷靠近 lm[17]）
function _calcHouxi(lm, W, H, cp, dorsal, ov) {
  if (!dorsal) return null;
  const _HX_T     = ov.HX_T     ?? HX_T;
  const _HX_ULNAR = ov.HX_ULNAR ?? HX_ULNAR;
  const axPx = (lm[0].x - lm[17].x) * W, ayPx = (lm[0].y - lm[17].y) * H;
  const aLen = Math.hypot(axPx, ayPx);
  const ulnarX = aLen > 1e-6 ? ( ayPx / aLen) * _HX_ULNAR * cp : 0;
  const ulnarY = aLen > 1e-6 ? (-axPx / aLen) * _HX_ULNAR * cp : 0;
  return [{
    x: lerp(lm[17].x, lm[0].x, _HX_T) * W + ulnarX,
    y: lerp(lm[17].y, lm[0].y, _HX_T) * H + ulnarY,
  }];
}

// ── 中衝穴 PC9 ───────────────────────────────────────────────────────────────
// WHO：指端中央 = lm[12]，ZC_EXT=0 故直接取 lm[12]
function _calcZhongchong(lm, W, H, cp, dorsal) {
  if (dorsal) return null;
  const dx = lm[12].x - lm[11].x, dy = lm[12].y - lm[11].y;
  return [{ x: (lm[12].x + dx * ZC_EXT) * W, y: (lm[12].y + dy * ZC_EXT) * H }];
}

// ── 魚際穴 LU10 ──────────────────────────────────────────────────────────────
// lerp(lm[0],lm[2]) + 向掌心 CW 垂直偏移 YJ_PERP 寸
function _calcYuji(lm, W, H, cp, dorsal) {
  if (dorsal) return null;
  // v34: lm[0]（腕）替代舊版 lm[1]（拇指根，活動量大）
  const axPx = (lm[2].x - lm[0].x) * W, ayPx = (lm[2].y - lm[0].y) * H;
  const alen = Math.hypot(axPx, ayPx);
  if (alen > 1e-6) {
    return [{
      x: lerp(lm[0].x, lm[2].x, YJ_T) * W + (-ayPx / alen) * YJ_PERP * cp,
      y: lerp(lm[0].y, lm[2].y, YJ_T) * H + ( axPx / alen) * YJ_PERP * cp,
    }];
  }
  return [{ x: lerp(lm[0].x, lm[2].x, YJ_T) * W, y: lerp(lm[0].y, lm[2].y, YJ_T) * H }];
}

// ── 神門穴 HT7 ───────────────────────────────────────────────────────────────
// lm[0] + 尺側 unit-vector × SM_CUN 寸
function _calcShenmen(lm, W, H, cp, dorsal) {
  if (dorsal) return null;
  const wcPx = { x: (lm[17].x - lm[5].x) * W, y: (lm[17].y - lm[5].y) * H };
  const wcLen = Math.hypot(wcPx.x, wcPx.y);
  if (wcLen < 1) return null;
  return [{
    x: lm[0].x * W + (wcPx.x / wcLen) * SM_CUN * cp,
    y: lm[0].y * H + (wcPx.y / wcLen) * SM_CUN * cp,
  }];
}

// ── 太淵穴 LU9 ───────────────────────────────────────────────────────────────
// lm[0] + 橈側 × TY_CUN 寸 + 近腕 × TY_BCUN 寸
function _calcTaiyuan(lm, W, H, cp, dorsal) {
  if (dorsal) return null;
  const wcPx = { x: (lm[5].x - lm[17].x) * W, y: (lm[5].y - lm[17].y) * H };
  const wcLen = Math.hypot(wcPx.x, wcPx.y);
  if (wcLen < 1) return null;
  const bPx = { x: (lm[0].x - lm[9].x) * W, y: (lm[0].y - lm[9].y) * H };
  const bLen = Math.hypot(bPx.x, bPx.y);
  const bkX = bLen > 1 ? (bPx.x / bLen) * TY_BCUN * cp : 0;
  const bkY = bLen > 1 ? (bPx.y / bLen) * TY_BCUN * cp : 0;
  return [{
    x: lm[0].x * W + (wcPx.x / wcLen) * TY_CUN * cp + bkX,
    y: lm[0].y * H + (wcPx.y / wcLen) * TY_CUN * cp + bkY,
  }];
}

// ── 四縫穴 ───────────────────────────────────────────────────────────────────
// 四根手指的中節指骨中點（食→小指：lm[6,10,14,18]）
function _calcSifeng(lm, W, H, cp, dorsal) {
  if (dorsal) return null;
  return [6, 10, 14, 18].map((i) => ({ x: lm[i].x * W, y: lm[i].y * H }));
}

// ── 新增穴道（2026-07-12）─────────────────────────────────────────────────────
// 指尖穴（甲角旁）及掌心穴，公式待校準

// 指尖穴共用：從指尖 landmark 沿指軸往近端退 prox 寸，再往橈側/尺側橫移 lat 寸。
//   tipI/dipI  指尖與其近端關節的 landmark index（指軸方向 = tip→dip）
//   lat > 0 = 橈側（lm[9]→lm[5] 方向，與三間穴同慣例，左右手皆安全）
//   lat < 0 = 尺側
function _fingertipAcu(lm, W, H, cp, tipI, dipI, prox, lat) {
  const tip = { x: lm[tipI].x * W, y: lm[tipI].y * H };
  const axPx = { x: lm[dipI].x * W - tip.x, y: lm[dipI].y * H - tip.y };
  const aLen = Math.hypot(axPx.x, axPx.y);
  if (aLen < 1) return [tip];
  const radPx = { x: (lm[5].x - lm[9].x) * W, y: (lm[5].y - lm[9].y) * H };
  const rLen = Math.hypot(radPx.x, radPx.y);
  const rx = rLen > 1 ? (radPx.x / rLen) * lat * cp : 0;
  const ry = rLen > 1 ? (radPx.y / rLen) * lat * cp : 0;
  return [{
    x: tip.x + (axPx.x / aLen) * prox * cp + rx,
    y: tip.y + (axPx.y / aLen) * prox * cp + ry,
  }];
}

// 少商穴 LU11 — 拇指橈側甲角旁（未校準，暫取 lm[4] 拇指尖）
function _calcShaoshang(lm, W, H, cp, dorsal) {
  if (!dorsal) return null;
  return _fingertipAcu(lm, W, H, cp, 4, 3, SS_PROX, SS_LAT);
}

// 商陽穴 LI1 — 食指橈側甲角旁
// calibrated ten_back 2026-07-12（單張，overfit 風險高）
function _calcShangyang(lm, W, H, cp, dorsal) {
  if (!dorsal) return null;
  return _fingertipAcu(lm, W, H, cp, 8, 7, SY_PROX, SY_LAT);
}

// 少衝穴 HT9 — 小指橈側甲角旁（未校準）
function _calcShaoChong(lm, W, H, cp, dorsal) {
  if (!dorsal) return null;
  return _fingertipAcu(lm, W, H, cp, 20, 19, SC_PROX, SC_LAT);
}

// 少澤穴 SI1 — 小指尺側甲角旁（未校準）
function _calcShaoze(lm, W, H, cp, dorsal) {
  if (!dorsal) return null;
  return _fingertipAcu(lm, W, H, cp, 20, 19, SZ_PROX, SZ_LAT);
}

// 關衝穴 TE1 — 無名指尺側甲角旁（未校準）
function _calcGuanchong(lm, W, H, cp, dorsal) {
  if (!dorsal) return null;
  return _fingertipAcu(lm, W, H, cp, 16, 15, GC_PROX, GC_LAT);
}

// 勞宮穴 PC8 — 掌心 lerp(lm[0], lm[9])（未校準）
function _calcLaogong(lm, W, H, cp, dorsal) {
  if (dorsal) return null;
  return [{
    x: lerp(lm[0].x, lm[9].x, LG_T) * W,
    y: lerp(lm[0].y, lm[9].y, LG_T) * H,
  }];
}

// ── DISPATCH TABLE + RAW ENTRY POINT ─────────────────────────────────────────

const _ACU_CALC_RAW = {
  // 原有穴道（20 個）
  "合谷穴": _calcHegu,
  "陽池穴": _calcYangchi,
  "陽溪穴": _calcYangxi,
  "陽谷穴": _calcYanggu,
  "液門穴": _calcYemen,
  "中渚穴": _calcZhongzhu,
  "小骨空": _calcXiaogukong,
  "中魁穴": _calcZhongkui,
  "大骨空": _calcDagukong,
  "八邪穴": _calcBaxie,
  "二間穴": _calcErjian,
  "三間穴": _calcSanjian,
  "前谷穴": _calcQiangu,
  "腕谷穴": _calcWangu,
  "後溪穴": _calcHouxi,
  "中衝穴": _calcZhongchong,
  "魚際穴": _calcYuji,
  "神門穴": _calcShenmen,
  "太淵穴": _calcTaiyuan,
  "四縫穴": _calcSifeng,
  // 新增穴道（6 個，2026-07-12）
  "少商穴": _calcShaoshang,
  "商陽穴": _calcShangyang,
  "少衝穴": _calcShaoChong,
  "少澤穴": _calcShaoze,
  "勞宮穴": _calcLaogong,
  "關衝穴": _calcGuanchong,
};

function _computeAcupointRaw(name, lm, W, H, handedness, ov = {}) {
  let dorsal = isDorsalView(lm, handedness);
  // 側緣穴（長在手指「書脊」那一面）從手背或手心看都在那裡，兩面都該定位得到。
  // 各 _calc 函式開頭的 `if (!dorsal) return null` 對它們是多餘的保護，
  // 這裡把 dorsal 視為 true 讓公式照算。公式的方向向量（如二間的 lm[5]−lm[9]）
  // 是從 landmark 自己算的純幾何量，手翻面時 landmark 一起翻，方向自動跟著對。
  // 實測驗證見 BILATERAL_ACUPOINTS 的註解（2026-07-26，手心 32/32 幀正確）。
  if (!dorsal && BILATERAL_ACUPOINTS.has(name)) dorsal = true;
  const cp = computeCunPx(lm, W, H);
  const fn = _ACU_CALC_RAW[name];
  return fn ? fn(lm, W, H, cp, dorsal, ov) : null;
}

// ── LEGACY FORMULA (v5–v25) — lerp-ratio system ───────────────────────────────
// 歷史版本對比用，不拆函數。
// BACK params (YX_BACK, TY_BACK): fraction of backward vector (lm[0]−lm[9]).
// PERP params (YG_PERP, YJ_PERP): cun along respective perp axes.
function _computeAcupointLegacy(name, lm, W, H, handedness, p) {
  let dorsal = isDorsalView(lm, handedness);
  // 與 _computeAcupointRaw 同步：側緣穴兩面皆可定位（見 BILATERAL_ACUPOINTS）
  if (!dorsal && BILATERAL_ACUPOINTS.has(name)) dorsal = true;
  const cp = computeCunPx(lm, W, H);
  const lx = (i) => lm[i].x,
    ly = (i) => lm[i].y;
  const bkX = lx(0) - lx(9),
    bkY = ly(0) - ly(9); // backward direction (normalized)

  function s1(nx, ny) {
    return [{ x: nx * W, y: ny * H }];
  }

  // ── 合谷穴
  if (name === "合谷穴") {
    if (!dorsal) return null;
    const mX = ((lx(0) + lx(5)) / 2) * W,
      mY = ((ly(0) + ly(5)) / 2) * H;
    const dx = lx(2) * W - mX,
      dy = ly(2) * H - mY;
    const d = Math.hypot(dx, dy);
    if (d < 1) return [{ x: mX, y: mY }];
    const s = (p.HG_CUN * cp) / d;
    return [{ x: mX + dx * s, y: mY + dy * s }];
  }
  // ── 陽池穴
  if (name === "陽池穴") {
    if (!dorsal) return null;
    const mx = (lx(9) + lx(13)) / 2,
      my = (ly(9) + ly(13)) / 2;
    return s1(lerp(mx, lx(0), p.YC_T), lerp(my, ly(0), p.YC_T));
  }
  // ── 陽溪穴
  if (name === "陽溪穴") {
    if (!dorsal) return null;
    const radX = lx(5) - lx(17),
      radY = ly(5) - ly(17);
    const bk = p.YX_BACK || 0;
    return s1(
      lx(0) + radX * p.YX_T + bkX * bk,
      ly(0) + radY * p.YX_T + bkY * bk,
    );
  }
  // ── 陽谷穴
  if (name === "陽谷穴") {
    if (!dorsal) return null;
    const gx = lerp(lx(0), lx(17), p.YG_T),
      gy = lerp(ly(0), ly(17), p.YG_T);
    const perp = p.YG_PERP || 0;
    let ex = 0,
      ey = 0;
    if (perp !== 0) {
      const hax = (lx(9) - lx(0)) * W,
        hay = (ly(9) - ly(0)) * H;
      const hLen = Math.hypot(hax, hay);
      if (hLen > 1e-6) {
        ex = ((hax / hLen) * perp * cp) / W;
        ey = ((hay / hLen) * perp * cp) / H;
      }
    }
    return s1(gx + ex, gy + ey);
  }
  // ── 液門穴
  if (name === "液門穴") {
    if (!dorsal) return null;
    const mx = (lx(13) + lx(17)) / 2,
      my = (ly(13) + ly(17)) / 2;
    const dx = mx - lx(0),
      dy = my - ly(0);
    return s1(mx + dx * p.YM_D, my + dy * p.YM_D);
  }
  // ── 中渚穴
  if (name === "中渚穴") {
    if (!dorsal) return null;
    const mx = (lx(13) + lx(17)) / 2,
      my = (ly(13) + ly(17)) / 2;
    return s1(lerp(mx, lx(0), p.ZZ_T), lerp(my, ly(0), p.ZZ_T));
  }
  // ── 小骨空
  if (name === "小骨空")
    return dorsal ? [{ x: lx(18) * W, y: ly(18) * H }] : null;
  // ── 中魁穴
  if (name === "中魁穴")
    return dorsal ? [{ x: lx(10) * W, y: ly(10) * H }] : null;
  // ── 大骨空
  if (name === "大骨空") {
    if (!dorsal) return null;
    const dx = lx(3) - lx(2),
      dy = ly(3) - ly(2);
    return s1(lx(3) + dx * p.DG_EXT, ly(3) + dy * p.DG_EXT);
  }
  // ── 中衝穴
  if (name === "中衝穴") {
    if (dorsal) return null;
    const dx = lx(12) - lx(11),
      dy = ly(12) - ly(11);
    return s1(lx(12) + dx * p.ZC_EXT, ly(12) + dy * p.ZC_EXT);
  }
  // ── 魚際穴
  if (name === "魚際穴") {
    if (dorsal) return null;
    const bxN = lerp(lx(1), lx(2), p.YJ_T),
      byN = lerp(ly(1), ly(2), p.YJ_T);
    const ax = lx(2) - lx(1),
      ay = ly(2) - ly(1);
    const alen = Math.hypot(ax, ay);
    const yp = p.YJ_PERP || 0;
    if (alen > 1e-6 && yp !== 0) {
      return s1(
        bxN + ((-ay / alen) * yp * cp) / W,
        byN + ((ax / alen) * yp * cp) / H,
      );
    }
    return s1(bxN, byN);
  }
  // ── 神門穴
  if (name === "神門穴") {
    if (dorsal) return null;
    const ulnX = lx(17) - lx(5),
      ulnY = ly(17) - ly(5);
    return s1(lx(0) + ulnX * p.SM_T, ly(0) + ulnY * p.SM_T);
  }
  // ── 太淵穴
  if (name === "太淵穴") {
    if (dorsal) return null;
    const radX = lx(5) - lx(17),
      radY = ly(5) - ly(17);
    const bk = p.TY_BACK || 0;
    return s1(
      lx(0) + radX * p.TY_T + bkX * bk,
      ly(0) + radY * p.TY_T + bkY * bk,
    );
  }
  // ── 四縫穴
  if (name === "四縫穴") {
    if (dorsal) return null;
    return [6, 10, 14, 18].map((i) => ({ x: lx(i) * W, y: ly(i) * H }));
  }

  return null; // 八邪、二間、三間、前谷、腕谷、後溪 在 v5–v25 尚未實裝
}

// ── PUBLIC ENTRY POINT ────────────────────────────────────────────────────────

/**
 * computeAcupoint — returns array of {x, y} clamped to hand convex hull, or null.
 * Side-edge acupoints skip clamping as their anatomical positions lie outside the hull.
 */
function computeAcupoint(name, lm, W, H, handedness) {
  // 舊版本號防呆：v28~v32 等版本曾經上線過但沒有留 preset，若使用者的
  // localStorage 還存著這些值，VERSION_PRESETS[...] 會是 undefined，
  // 一路掉進 _computeAcupointLegacy(..., undefined) 然後每一幀丟
  // TypeError: Cannot read properties of undefined (reading 'HG_CUN')。
  // 認不得的版本一律退回最新版（v35 = null = raw）。
  const preset = Object.prototype.hasOwnProperty.call(
    VERSION_PRESETS,
    selectedFormulaVersion,
  )
    ? VERSION_PRESETS[selectedFormulaVersion]
    : null;
  const pts =
    preset === null
      ? _computeAcupointRaw(name, lm, W, H, handedness)
      : preset === "v34_raw"
        ? _computeAcupointRaw(name, lm, W, H, handedness, V34_PARAMS)
        : _computeAcupointLegacy(name, lm, W, H, handedness, preset);
  if (!pts) return null;
  const acu = ACUPOINTS.find((a) => a.name === name);
  if (acu?.skipHullClamp) return pts;
  const hull = _convexHull(lm.map((p) => ({ x: p.x * W, y: p.y * H })));
  return pts.map((p) => _clampToHull(p, hull));
}

// ── DRAWING ───────────────────────────────────────────────────────────────────

// 依距離縮放點的半徑：cunPx 越大代表手離鏡頭越近（畫面佔比越大）。
// CUNPX_FAR/NEAR 之間線性內插，兩端夾在 [R_MIN, R_MAX]，避免近距離時點蓋住小穴道、遠距離時點小到看不見。
function acupointRadius(cunPx) {
  const CUNPX_FAR = 22; // 對應 acu-ui.js 的「手部太遠」警告閾值
  const CUNPX_NEAR = 55; // 到這個距離（含以上）就用最大半徑
  const R_MIN = 2,
    R_MAX = 5;
  const t = Math.max(
    0,
    Math.min(1, (cunPx - CUNPX_FAR) / (CUNPX_NEAR - CUNPX_FAR)),
  );
  return R_MIN + t * (R_MAX - R_MIN);
}

/**
 * 畫信心圓盤：一個「貼在皮膚上」的圓，手一轉就自動壓扁。
 * 壓扁成細線 = 這塊皮膚是切著看的 = 定位不可信。
 *
 * 顏色沿用等級：綠(高) / 橘(中) / 紅(低)。
 */
function drawConfidenceDisc(ctx, cx, cy, radiusPx, info) {
  if (!info || !info.basis) return;
  const pts = confidenceDiscPoints(cx, cy, radiusPx, info.basis);
  if (pts.length < 3) return;

  const col =
    info.level === "high"
      ? "0, 229, 160"
      : info.level === "mid"
        ? "255, 170, 60"
        : "255, 80, 90";

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.fillStyle = `rgba(${col}, 0.28)`;
  ctx.fill();
  ctx.strokeStyle = `rgba(${col}, 0.95)`;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

/**
 * ⚡ 2026-08-13 效能：光暈原本是 ctx.shadowBlur = 12 做的。
 *    canvas2d 的 shadow blur 在多數行動瀏覽器會掉到軟體路徑，是 canvas2d 最貴的
 *    單一操作；而這裡每幀每個穴位點都要來一次（八邪一次 4 個點 = 4 次模糊）。
 *    改成「外圈半透明大圓 + 內圈實心點」，視覺上一樣是發光的點，但成本是普通填色。
 *    ⚠️ 純繪製改動，座標與半徑都沒動。
 */
function drawAcupoint(ctx, x, y, label, color, radius) {
  radius = radius || 6;
  ctx.save();
  // 外圈光暈（取代 shadowBlur）
  ctx.globalAlpha = 0.22;
  ctx.beginPath();
  ctx.arc(x, y, radius * 2.2, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.globalAlpha = 1;
  // 實心點
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.font = `bold ${Math.max(11, radius + 6)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText(label, x, y - radius - 4);
  ctx.restore();
}
