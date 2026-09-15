// ═══════════════════════════════════════════════════════════════════
// 臉部按摩的「對準」判定
//
// 手部的 gate 很單純：另一手指尖與穴道**出自同一個 HandLandmarker**，
// 同座標系、同一把尺，比距離就行（js/vision.js 的 minD <= tol）。
//
// 臉部沒這條路。要判的是「手指尖 vs 臉上的穴道」，跨兩個模型，而且
// **2D 投影上「手指碰到印堂」跟「手停在臉前 15cm、剛好擋住」一模一樣**。
// MediaPipe 的 z 不足以判絕對深度（記錄控制/MediaPipe_z座標性質實測_20260726.md）。
//
// ⭐ 想過的解法：近大遠小。手貼臉時手和臉離鏡頭一樣遠；手前伸 15cm 時手變大。
//    → R = 手的表觀大小 / 臉的表觀大小(IPD)，不需要 z。實驗做出來離線準確率
//      96.5%（三場次、雙向跨場次 98.0% / 95.5%）。
//
// 🚨 但 2026-09-04 實機一試就不行：**預設關掉了**（FACE_DEPTH_CHECK = false）。
//    離線數字漂亮不代表現場好用 —— 用戶原話「怪怪的」「不要管有沒有按倒好了
//    只要2維的有接觸就好」。判斷是這樣：
//      · 離線那三場是「刻意保持貼著／刻意保持前伸」兩種穩態，
//        真實按摩是**一直在動**，中間會經過大量兩者之間的姿態；
//      · 兩類間距只有 0.10–0.13，而場次之間就會平移 0.06 —— 這件事在
//        續 3 就寫了「安全邊際不大」，實機證實了那個擔心。
//    → 現在只看 2D 接觸。手浮在臉前面也會計時，這是**知情的取捨**，不是漏洞。
//
// 判定與常數整份留著，要開回來只要把 FACE_DEPTH_CHECK 改 true。
// 實驗與資料：記錄控制/PROGRESS.md 2026-09-04（續 3、續 5）、
//            穴道按摩正式版本/网页版_2d/depth_gate_test.html、
//            測試記錄/臉部閘門/*.json（用戶本人 3 場次）
// ═══════════════════════════════════════════════════════════════════

// ⭐ 這一顆決定上面整段還算不算數。false = 只看 2D 有沒有碰到。
const FACE_DEPTH_CHECK = false;

/**
 * 手的表觀大小：TRUST_BONES 十條骨 2D 長度的**幾何平均**。
 *
 * ⭐ 為什麼不是單根 `cunPx`（中指中節）—— 實驗直接把它淘汰掉了：
 *    跨場次驗證時單根骨的門檻只剩 27.0% / 51.6%（幾何平均是 98.0% / 95.5%）。
 *    原因是手一傾斜中指中節就投影縮短、整條分佈平移（R1 vs tilt r = +0.622），
 *    換個姿勢兩類就重疊。跟 08-29「cunPx 單點故障」是同一個病根。
 *
 *    幾何平均對「整體等比例縮放」（＝離鏡頭遠近，正是我們要量的）是線性的，
 *    而單一方向塌陷只拖動十條裡的幾條。
 */
function handApparentSize(lm, W, H) {
  if (!lm || lm.length < 21 || typeof TRUST_BONES === 'undefined') return null;
  let sumLog = 0;
  for (const [i, j] of TRUST_BONES) {
    const d = Math.hypot((lm[i].x - lm[j].x) * W, (lm[i].y - lm[j].y) * H);
    if (!(d > 0)) return null;
    sumLog += Math.log(d);
  }
  return Math.exp(sumLog / TRUST_BONES.length);
}

// ── 深度門檻：進場嚴、退場鬆（施密特觸發）──────────────────────────
//
// 合併三場次（ipd ≥ 60px @640 寬）掃出來的最佳門檻是 0.4353，準確率 96.5%。
// 雙向跨場次：舊資料定 0.4332 → 新場次 98.0%；新場次定 0.4441 → 舊資料 95.5%。
//
// ⭐ 2026-09-04 用戶實測「有點不敏感」→ 進場門檻從 0.435 放寬到 0.45。
//    這是照資料選的，不是憑感覺：
//
//      門檻    貼臉通過率   前伸誤放行
//      0.435     95.3%        2.3%
//      0.450     97.1%        4.6%   ← 收在這
//      0.460     99.4%       11.0%
//      0.470     99.4%       23.1%   ← 再往上就崩了
//
//    0.46 之後誤放行是斷崖式上升（真按與虛按開始重疊），所以放到 0.45 為止。
//
// ⚠️ 安全邊際不大：兩場次的 R 各平移了約 0.06，而兩類間距只有 0.10–0.13。
//    所以這個閘門只用來**暫停計時**，不拿去宣稱「你按對了」。
const FACE_TOUCH_R = 0.45;

// ⭐ 退場門檻比進場鬆 —— 這是「不敏感」真正的病根。
//    原本每幀獨立重判，手指壓在臉上時 landmark 本來就會抖個幾 %，
//    只要有一幀越線計時器就閃一下「暫停」。人的感受是「它沒反應」，
//    但其實是「反應太靈敏」。
//
//    先進場才有資格用這條，所以誤放行的風險不是表上那個 41%
//    —— 那是「一開始就用 0.49 判」的數字。這裡要先真的貼上去過。
const FACE_TOUCH_R_RELEASE = 0.49;

// 距離下限。太遠時這個判定會失效 —— 這是物理不是調參：
// 手前伸的是固定的 10–15cm，但比值效應是 D/(D−offset)，
// 坐 50cm 時 1.32、坐 150cm 時只剩 1.09，被雜訊蓋掉。
// 實測 ipd < 60px（@640 寬）時門檻方向會反轉，近距門檻套過去只剩 54.9%。
//
// 🚨 一定要寫成**畫面寬的比例**：60/640 = 0.094。
//    寫死 60px 的話，換一個解析度或 FOV 的鏡頭就整個錯位。
const FACE_MIN_IPD_FRAC = 0.094;

// ── 2D 對準容許度（以 IPD 為單位）────────────────────────────────
//
// 關掉深度檢查之後，**這是唯一的判準**，所以值本身變重要了。
// 換算：IPD 約 6.3cm，所以 0.35 IPD ≈ 2.2cm、0.45 IPD ≈ 2.8cm。
// 對臉上的穴道來說這個範圍是寬鬆的（印堂本身就有 1cm 上下的說法差異），
// 但既然只剩 2D，寧可寬 —— 使用者要的是計時器跟著走，不是精密量測。
//
// ℹ️ 參考實測（那三場次刻意貼著的幀）：gap 中位數 0.096、p99 0.176、最大 0.247。
//    所以 0.35 對「真的在按」的人來說綽綽有餘。
//
// 退場比進場鬆：壓著的時候指尖會被自己的手擋住，landmark 會跳。
const FACE_GAP_ENTER = 0.35;
const FACE_GAP_RELEASE = 0.45;

/**
 * 判斷「指尖有沒有落在穴位上」。
 * 預設只看 2D；FACE_DEPTH_CHECK 打開才會再問「是不是真的貼著」。
 *
 * @param wasOk 上一幀是不是 ok。true 時改用比較鬆的退場門檻（見上面的常數）。
 *              純粹是把「現在算哪一組門檻」交給呼叫端決定，函式本身仍然無狀態。
 * @returns {{state:'ok'|'far'|'off'|'nohand'|'noface', R:number|null, ipdFrac:number|null, gap:number|null}}
 *   ok     指尖落在穴道上 → 計時前進
 *   far    人離鏡頭太遠 → **只有 FACE_DEPTH_CHECK 開著時才可能出現**
 *   off    指尖離穴位太遠（深度檢查開著時，也可能是手浮在前面）
 *   nohand / noface  少一邊，判不了
 */
function faceTouchGate(handLm, acuPts, ipdPx, W, H, wasOk) {
  const out = { state: 'off', R: null, ipdFrac: null, gap: null };
  if (!(ipdPx > 1) || !W) { out.state = 'noface'; return out; }

  out.ipdFrac = ipdPx / W;
  // 距離下限只在「要判深度」時才有意義 —— 那個限制是因為近大遠小的效應
  // 會隨距離消失（D/(D−offset)）。只看 2D 的話遠近都判得動，不必擋。
  if (FACE_DEPTH_CHECK && out.ipdFrac < FACE_MIN_IPD_FRAC) { out.state = 'far'; return out; }

  if (!handLm || !acuPts || !acuPts.length) { out.state = 'nohand'; return out; }

  const gm = handApparentSize(handLm, W, H);
  if (!gm) { out.state = 'nohand'; return out; }
  out.R = gm / ipdPx;

  // 2D 對準：食指尖(8) 或拇指尖(4) 離穴道多近，以 IPD 為單位
  // （跟手部一樣收兩根指尖 —— 按臉的人未必用食指）
  let minD = Infinity;
  for (const tipIdx of [8, 4]) {
    const tp = { x: handLm[tipIdx].x * W, y: handLm[tipIdx].y * H };
    for (const p of acuPts) {
      const d = Math.hypot(tp.x - p.x, tp.y - p.y);
      if (d < minD) minD = d;
    }
  }
  out.gap = minD / ipdPx;

  // 已經貼上去的人用比較鬆的那一組，免得抖一下就掉出去（見常數說明）。
  const gapLimit = wasOk ? FACE_GAP_RELEASE : FACE_GAP_ENTER;
  if (out.gap >= gapLimit) { out.state = 'off'; return out; }

  // ⭐ 預設到這裡就結束 —— 2D 碰到就算數。
  //    R 仍然算出來放進回傳值：讀數條看不看它是另一回事，但要能查。
  if (!FACE_DEPTH_CHECK) { out.state = 'ok'; return out; }

  const rLimit = wasOk ? FACE_TOUCH_R_RELEASE : FACE_TOUCH_R;
  out.state = out.R < rLimit ? 'ok' : 'off';
  return out;
}

// 掉出去之後還撐這麼久才真的停錶。
// 手指壓在臉上時另一隻手會擋住自己，MediaPipe 偶爾整幀認不到手（→ nohand），
// 那不是「放開了」，只是看不到。0.4 秒夠蓋掉這種閃斷，又短到使用者
// 真的把手拿開時不會覺得計時器賴著不停。
// ⚠️ 代價要講明：這 0.4 秒內就算真的浮起來也照樣扣秒。
const FACE_HOLD_MS = 400;
