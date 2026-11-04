// ═══════════════════════════════════════════════════════════════════
// 前臂內關：相機＋定位＋按壓判定（2026-10-01，網頁 v2 跟上 App 批 89／90）
// 2026-10-27：同一套流程再開間使／郄門／外關（見下面 FA_POINTS），App 還沒跟
// 2026-10-31：郄門改用「手掌尺」（測試/前臂手掌尺即時_20261029/ 第 4 版），其他三穴照舊。見下面〈手掌尺〉一節
//
// 用戶：「激活內關的網頁版本穴道定位」。App 先行（批 89），這支是逐式照抄：
//   公式／閘門／檢測  AcuNavi/app/.../locate/ForearmMath.kt（ForearmMath、ForearmCalib、
//                     ForearmTwistGate、ForearmPressTracker）—— 常數同一份
//   流程與畫法       AcuNavi/app/.../ui/pages/ForearmScreen.kt
//   遮罩讀法         js/forearm-lab.js 的 flReadMask／flMaskAt（Solutions 版遮罩已在這裡實測過）
//
//   內關 = lm0 + (2 + A)·寸·ax + (B + C·r·sinθ)·寸·nv
//     寸 = |Pose 肘 − Hand lm0| / 12；ax = lm0→肘；nv = 法向中指向 lm9 那側
//     r  = Pose 遮罩第 4～7 寸前臂寬度中位 ÷ 2；量不到用 FA_R_DEFAULT
//     θ  = Hand world 掌面法向繞前臂軸的角
//
// 依據：用戶左掌心 1 人 2 支貼紙影片（貼紙實驗/內關優化_20260930/，20260928_1820／1758），
//       1820 分段交叉驗證中位 2.27mm。⚠️ A/B/C 樣本內擬合、容忍角 30° 與按壓 0.7／1.0 寸都沒有 GT。
// ⚠️ 不寫進公式四檔（acu-math.js 等）：同 App，內關刻意放在公式四檔外面。
//
// 與 App 的差別（只差在平台）：
//   ① 模型是 Solutions API（Hands 共用 js/vision.js 那個實例，結果由 onHandsResults 轉交過來；
//      Pose 另建），兩個依序 send 同一幀，所以不用 PAIR_MS 配對。
//   ② 遮罩縮成 FA_MASK_MAX 邊長再讀（手機上每幀讀全幅太貴）；App 是全幅。
//   ③ 座標一律原始（不鏡像），前鏡頭只鏡射畫面（同 vision.js）。
// ═══════════════════════════════════════════════════════════════════

// ── 公式常數（= ForearmMath.kt）──────────────────────────────────────
const FA_A = 0.306, FA_B = 0.085, FA_C = -0.532;
const FA_R_DEFAULT = 1.676;
const FA_CUTS = [4, 5, 6, 7];
const FA_CORRIDOR_HALF = 0.30;
const FA_MERGE_RATIO = 1.35;
// ── 畫面／流程常數（= ForearmScreen.kt）──────────────────────────────
const FA_BOX_FRAC = 0.86, FA_BOX_SLACK = 0.04;
const FA_ELBOW_VIS = 0.5;
const FA_EMA = 0.5;
const FA_CALIB_SHOW_MS = 1200;      // 檢測完打勾停多久
const FA_PRESS_ON = 0.7;            // 判定圈＝畫面上的圈（寸）
const FA_MASK_MAX = 320;
const FA_MASK_TH = 0.5;

// ── 每一穴的定義（2026-10-27 加間使／郄門／外關；寸數是用戶 10-23 定的）──────
//   pc：true＝內關公式換 n（沿軸 n＋A、橫向 B＋C·r·sinθ）；false＝lm0 沿軸純 n 寸
//   dorsal：true＝手背朝鏡頭（外關在內關正背面）
// 依據：貼紙實驗/20261023_2241_間使、_2303_郄門、_2343_外關（用戶左臂各 1 支筆點，手肘都在畫面邊緣）
//   正面幀中位 間使 ≈8mm、郄門 ≈18.5mm、外關 ≈10mm ⇒ 都沒過 2mm，記在 記錄控制/待驗證清單.md 第 10 項
// ⚠️ 只進網頁 v2；App ForearmMath.kt 仍只有內關（新功能先網頁）
const FA_POINTS = {
  // 2026-11-01 用戶：「全部改成現行公式就好之後也這樣網頁和app都是」→ 四穴都走現行公式（faLocate＋每幀 Pose 寸），不再掛 ruler: 'palm'
  //   依據：貼紙實驗/前臂四片_舊公式vs手掌尺_20261101/README.md 總表；手掌尺程式留著不用
  '內關穴': { n: 2, pc: true,  dorsal: false },
  '間使穴': { n: 3, pc: true,  dorsal: false },
  '郄門穴': { n: 5, pc: true,  dorsal: false },
  '外關穴': { n: 2, pc: false, dorsal: true },
  // 2026-11-02 用戶：「那先把可以用的加入到app和網頁上面去」→ 加 6 穴（用戶左臂筆點片，1 人、各 1 支）
  //   手心四穴：書上寸數、中線、不加 A —— 依據 貼紙實驗/前臂七穴_公式誤差_20261102/README.md（P1，沒擬合）
  //     中位 大陵 5.4、陰郄 4.8、通里 5.4、靈道 3.6mm；加 A 的現行內關式反而 9～13mm
  //   手背二穴：斜軸 slant −0.30（往拇指側 ~16.5°）—— 依據 19:32～19:39 三支各自錄的片算 k，
  //     19:46 同片四點（貼紙實驗/20261102_1946_手背四點/）樣本外驗證：支溝 2.5、三陽絡 4.4mm
  //   ⚠️ 外關同一條斜線（新片斜軸 3.5mm vs 現在純 2 寸 12.2mm），要不要改等用戶點頭，先不動
  '大陵穴':   { n: 0,   pc: false, dorsal: false },
  '陰郄穴':   { n: 0.5, pc: false, dorsal: false },
  '通里穴':   { n: 1,   pc: false, dorsal: false },
  '靈道穴':   { n: 1.5, pc: false, dorsal: false },
  '支溝穴':   { n: 3,   pc: false, dorsal: true, slant: -0.30 },
  '三陽絡穴': { n: 4,   pc: false, dorsal: true, slant: -0.30 },
};

const faMedian = (v) => {
  const s = [...v].sort((a, b) => a - b), n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};

// ── ForearmMath ──────────────────────────────────────────────────────
/** 前臂軸（影像像素）。hand 是正規化 21 點；回 null＝太短（多半是 Pose 選錯手臂） */
function faAxis(hand, ex, ey, W, H) {
  if (!hand || hand.length < 21) return null;
  const x0 = hand[0].x * W, y0 = hand[0].y * H;
  const len = Math.hypot(ex - x0, ey - y0);
  if (len < 30) return null;
  const ax = (ex - x0) / len, ay = (ey - y0) / len;
  let nx = -ay, ny = ax;
  const tx = hand[9].x * W - x0, ty = hand[9].y * H - y0;
  if (tx * nx + ty * ny < 0) { nx = -nx; ny = -ny; }
  // u＝垂直前臂軸、指向小指側（lm5→lm17 那邊）；手背斜軸穴（slant）用
  const s = ((hand[17].x - hand[5].x) * W * nx + (hand[17].y - hand[5].y) * H * ny) >= 0 ? 1 : -1;
  return { x0, y0, ax, ay, nx, ny, ux: s * nx, uy: s * ny, lenPx: len, cun: len / 12 };
}

/** 兩隻手時挑被按的那隻：Hand lm0 與 Pose 腕（15／16）最近的那組。回 { hand, elbow } 或 null */
function faPickTarget(pose, hands, lockedElbow) {
  let best = null;
  hands.forEach((h, i) => {
    if (!h || h.length < 21) return;
    for (const [e, w] of [[13, 15], [14, 16]]) {
      if (lockedElbow != null && e !== lockedElbow) continue;
      const d = Math.hypot(pose[w].x - h[0].x, pose[w].y - h[0].y);
      if (!best || d < best.d) best = { hand: i, elbow: e, d };
    }
  });
  return best;
}

/** 扭轉角 θ（度）：Hand world 掌面法向（強制朝鏡頭）繞前臂軸的角 */
function faTwistWorldDeg(world, a) {
  if (!world || world.length < 21) return null;
  const ux = world[5].x - world[0].x, uy = world[5].y - world[0].y, uz = world[5].z - world[0].z;
  const vx = world[17].x - world[0].x, vy = world[17].y - world[0].y, vz = world[17].z - world[0].z;
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const n = Math.hypot(nx, ny, nz);
  if (n < 1e-9) return null;
  nx /= n; ny /= n; nz /= n;
  if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; }
  return Math.atan2(nx * a.nx + ny * a.ny, nz) * 180 / Math.PI;
}

/**
 * 覆蓋邊界：沿前臂軸第 4～7 寸各切一刀，從刀心沿法向往兩側走到遮罩外。
 * @param inside (x,y) → true／false／null（null＝出畫面＝截斷）
 */
function faMeasureCuts(inside, a) {
  const hmax = FA_CORRIDOR_HALF * a.lenPx;
  const out = [];
  for (const k of FA_CUTS) {
    const cx = a.x0 + k * a.cun * a.ax, cy = a.y0 + k * a.cun * a.ay;
    if (inside(cx, cy) !== true) continue;
    const ends = [0, 0];
    let ok = true;
    [1, -1].forEach((sign, i) => {
      if (!ok) return;
      let s = 0, edge = -1;
      while (s <= hmax) {
        const v = inside(cx + sign * s * a.nx, cy + sign * s * a.ny);
        if (v == null) break;
        if (!v) { edge = Math.max(0, s - 1); break; }
        s += 1;
      }
      if (edge < 0) ok = false; else ends[i] = edge;
    });
    if (!ok) continue;
    out.push({
      x1: cx + ends[0] * a.nx, y1: cy + ends[0] * a.ny,
      x2: cx - ends[1] * a.nx, y2: cy - ends[1] * a.ny,
      widthCun: (ends[0] + ends[1] + 1) / a.cun,
    });
  }
  if (out.length >= 2) {
    const ref = faMedian(out.map(c => c.widthCun));
    return out.filter(c => c.widthCun <= FA_MERGE_RATIO * ref);
  }
  return out;
}

const faRadiusCun = (cuts) => cuts.length ? faMedian(cuts.map(c => c.widthCun)) / 2 : null;

/** spec 是 FA_POINTS 的一筆；plain 的穴 rCun／thetaDeg 用不到 */
function faLocate(a, spec, rCun, thetaDeg) {
  if (!spec.pc) {
    // 純 n 寸；slant＝每走 1 寸往小指側偏幾寸（負＝往拇指側）。沒有 u（手掌尺軸）就當 0
    const k = spec.slant && a.ux != null ? spec.slant : 0;
    const along = spec.n * a.cun, across = k * spec.n * a.cun;
    return { x: a.x0 + along * a.ax + across * (a.ux || 0), y: a.y0 + along * a.ay + across * (a.uy || 0) };
  }
  const along = (spec.n + FA_A) * a.cun;
  const across = (FA_B + FA_C * rCun * Math.sin(thetaDeg * Math.PI / 180)) * a.cun;
  return { x: a.x0 + along * a.ax + across * a.nx, y: a.y0 + along * a.ay + across * a.ny };
}
const faNeiguan = (a, rCun, thetaDeg) => faLocate(a, FA_POINTS['內關穴'], rCun, thetaDeg);

/** 掌寬比 |lm5−lm17| ÷ |lm0−lm9|（像素） */
function faWidthRatio(hand, W, H) {
  if (!hand || hand.length < 21) return null;
  const p = (i) => [hand[i].x * W, hand[i].y * H];
  const [x5, y5] = p(5), [x17, y17] = p(17), [x0, y0] = p(0), [x9, y9] = p(9);
  const axis = Math.hypot(x9 - x0, y9 - y0);
  return axis < 1e-6 ? null : Math.hypot(x5 - x17, y5 - y17) / axis;
}

// ═══════════════════════════════════════════════════════════════════
// 手掌尺（2026-10-31，目前只有郄門用：FA_POINTS 裡 ruler: 'palm'）
//   移植 測試/前臂手掌尺即時_20261029/前臂手掌尺_即時.py 第 4 版（第 5 版「鎖定」沒驗過，沒搬）
//   用戶 10-30：「pose還是可以拿來參考但是只參考前後，剩下的檢測還是我的辦法」
//
//   檢測那 2 秒（照舊用 Pose 肘＋遮罩）量一次：
//     k  ＝ 前臂長(lm0→Pose 肘) ÷ 手掌長(lm0→lm9)
//     δ  ＝ 手方向(lm9→lm0) 轉到前臂軸的角度；優先用遮罩各刀中點連線，遮罩不夠才用 Pose 軸
//     r  ＝ 遮罩量的前臂半徑（之後固定，不再每幀量）
//     n0 ＝ 手掌 3D 法向
//   之後每幀（方向、長度都不看 Pose）：
//     ax ＝ 手方向轉 δ；寸 ＝ k × 手掌長 ÷ 12；θ ＝ 手掌法向繞 ax 的角
//     郄門 ＝ lm0 + (5 + A)·寸·ax + (B + C·r·sinθ)·寸·nv，再過 One Euro
//   關卡（任一沒過就不畫點）：① 手心 ② 扭轉＝三角形 或 手掌法向偏離 n0 超過 30°（遲滯 8°）
//     ③ 前臂平行＝(手掌長／校準) ÷ (Pose 前臂長／校準) 偏離 1 超過 15% 就擋、回到 10% 內才放（Pose 只用在這裡）
//
// 依據：貼紙實驗/20261029_2231_郄門/（波動.py、手錨點軸）、測試/前臂手掌尺即時_20261029/README.md
//   錄影重跑：波動 中位 0.82～0.97mm vs 現行 1.14～1.79mm；按壓段 0.96→0.68mm。⚠️ 用戶 1 人、2 支片，門檻沒多人驗。
// 跟 Python 第 4 版的差別（平台）：
//   ・手肘出框時 Python 改看 Pose 深度角 3°；這裡沒搬（Solutions 版的 world 座標沒驗過）→ 手肘看不到時 ③ 維持上一幀的判斷
//   ・Python 校準後改跑 Pose lite、不出遮罩來提速；這裡 Pose 不換模型（Solutions 中途改選項會重載），只是不再每幀讀遮罩
//   ・One Euro 參數照 Python（點 1.0／0.1、肘 0.3／0.05），座標先換算成 1280 寬再濾，速度單位才對得上
// ═══════════════════════════════════════════════════════════════════
const FA_PR_CALIB_CV = 0.03;          // 檢測期間手掌長、前臂長變動上限（CV）
const FA_PR_TWIST3D = 30, FA_PR_HYST = 8;
const FA_PR_PAR_ON = 0.15, FA_PR_PAR_OFF = 0.10;
const FA_PR_ELBOW_VIS = 0.8;
const FA_PR_EURO_PT = [1.0, 0.1], FA_PR_EURO_EL = [0.3, 0.05];
const FA_PR_REF_W = 1280;             // Python 那邊的畫面寬（One Euro 的 beta 是照這個尺度調的）

const faUnit = (x, y) => { const n = Math.hypot(x, y) || 1e-9; return { x: x / n, y: y / n }; };
function faRot(v, deg) {
  const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}
const faAng = (v) => Math.atan2(v.y, v.x) * 180 / Math.PI;
const faWrap = (d) => ((d + 180) % 360 + 360) % 360 - 180;
/** 手的方向：lm9 → lm0（指向手肘那邊），像素座標 */
const faHandDir = (hand, W, H) => faUnit((hand[0].x - hand[9].x) * W, (hand[0].y - hand[9].y) * H);
const faPalmLen = (hand, W, H) => Math.hypot((hand[9].x - hand[0].x) * W, (hand[9].y - hand[0].y) * H);

/** 手掌 3D 法向（Hand world，強制朝鏡頭 z>0）；拿不到回 null */
function faPalmNormal(world) {
  if (!world || world.length < 21) return null;
  const ux = world[5].x - world[0].x, uy = world[5].y - world[0].y, uz = world[5].z - world[0].z;
  const vx = world[17].x - world[0].x, vy = world[17].y - world[0].y, vz = world[17].z - world[0].z;
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const n = Math.hypot(nx, ny, nz);
  if (n < 1e-9) return null;
  const s = nz < 0 ? -1 / n : 1 / n;
  return { x: nx * s, y: ny * s, z: nz * s };
}

/** 遮罩各刀中點擬合直線的方向（朝肘）；刀不到 2 回 null。towards＝h0→肘 的向量 */
function faMaskDir(cuts, towards) {
  if (!cuts || cuts.length < 2) return null;
  const m = cuts.map(c => ({ x: (c.x1 + c.x2) / 2, y: (c.y1 + c.y2) / 2 }));
  const cx = m.reduce((s, p) => s + p.x, 0) / m.length, cy = m.reduce((s, p) => s + p.y, 0) / m.length;
  let sxx = 0, sxy = 0, syy = 0;
  m.forEach(p => { const dx = p.x - cx, dy = p.y - cy; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; });
  const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);                 // 主軸方向（PCA）
  let d = { x: Math.cos(th), y: Math.sin(th) };
  if (d.x * towards.x + d.y * towards.y < 0) d = { x: -d.x, y: -d.y };
  return d;
}

/** One Euro（Casiez 2012），2D；t 用秒 */
class FaOneEuro {
  constructor(minCutoff, beta, dCutoff = 1.0) { Object.assign(this, { minCutoff, beta, dCutoff }); this.reset(); }
  reset() { this.x = null; this.dx = { x: 0, y: 0 }; this.t = null; }
  static alpha(cutoff, dt) { const tau = 1 / (2 * Math.PI * cutoff); return 1 / (1 + tau / dt); }
  filter(p, t) {
    if (this.x == null || this.t == null || t <= this.t || t - this.t > 0.5) {   // 第一幀或斷超過 0.5 秒：重來（同 Python）
      this.x = { x: p.x, y: p.y }; this.dx = { x: 0, y: 0 }; this.t = t; return { x: p.x, y: p.y };
    }
    const dt = t - this.t; this.t = t;
    const ad = FaOneEuro.alpha(this.dCutoff, dt);
    const raw = { x: (p.x - this.x.x) / dt, y: (p.y - this.x.y) / dt };
    this.dx = { x: ad * raw.x + (1 - ad) * this.dx.x, y: ad * raw.y + (1 - ad) * this.dx.y };
    const a = FaOneEuro.alpha(this.minCutoff + this.beta * Math.hypot(this.dx.x, this.dx.y), dt);
    this.x = { x: a * p.x + (1 - a) * this.x.x, y: a * p.y + (1 - a) * this.x.y };
    return { x: this.x.x, y: this.x.y };
  }
}

/** 檢測那 2 秒收樣本；add() 回 false＝手掌長或前臂長動到了，只留這一筆重收 */
class FaPalmRulerCalib {
  constructor() { this.reset(); }
  reset() { this.s = []; }
  add(sample) {
    this.s.push(sample);
    if (this.s.length > 5) {
      const cv = (k) => {
        const v = this.s.map(x => x[k]), m = v.reduce((a, b) => a + b, 0) / v.length;
        return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length) / m;
      };
      if (cv('palm') > FA_PR_CALIB_CV || cv('L') > FA_PR_CALIB_CV) { this.s = [sample]; return false; }
    }
    return true;
  }
  /** 校準結果；樣本 < 5 回 null */
  result() {
    const s = this.s;
    if (s.length < 5) return null;
    const dm = s.map(x => x.dMask).filter(v => v != null);
    const useMask = dm.length >= Math.max(5, Math.floor(s.length / 3));
    const rs = s.map(x => x.r).filter(v => v != null);
    const n = { x: faMedian(s.map(x => x.n.x)), y: faMedian(s.map(x => x.n.y)), z: faMedian(s.map(x => x.n.z)) };
    const nl = Math.hypot(n.x, n.y, n.z) || 1;
    return {
      k: faMedian(s.map(x => x.L / x.palm)), palm: faMedian(s.map(x => x.palm)), L: faMedian(s.map(x => x.L)),
      r: rs.length ? faMedian(rs) : FA_R_DEFAULT,
      delta: useMask ? faMedian(dm) : faMedian(s.map(x => x.dPose)), deltaSrc: useMask ? 'mask' : 'pose',
      n0: { x: n.x / nl, y: n.y / nl, z: n.z / nl },
    };
  }
}

/**
 * 校準那一幀的樣本。axis＝faAxis（Pose 軸）；cuts＝faMeasureCuts（可空）；world＝Hand world；回 null＝這幀不能用
 */
function faPalmRulerSample(hand, world, axis, cuts, W, H) {
  const n = faPalmNormal(world);
  if (!hand || !axis || !n) return null;
  const u = faHandDir(hand, W, H);
  const md = faMaskDir(cuts, { x: axis.ax, y: axis.ay });
  return {
    palm: faPalmLen(hand, W, H), L: axis.lenPx, r: faRadiusCun(cuts || []), n,
    dMask: md ? faWrap(faAng(md) - faAng(u)) : null,
    dPose: faWrap(faAng({ x: axis.ax, y: axis.ay }) - faAng(u)),
  };
}

/** 手掌尺的每幀軸（不看 Pose）。回跟 faAxis 同形狀的物件，按壓距離、判定圈照舊用 .cun；c＝FaPalmRulerCalib.result() */
function faPalmAxis(hand, W, H, c) {
  if (!hand || hand.length < 21 || !c) return null;
  const palm = faPalmLen(hand, W, H);
  if (palm < 5) return null;
  const a = faRot(faHandDir(hand, W, H), c.delta);
  const x0 = hand[0].x * W, y0 = hand[0].y * H;
  let nx = -a.y, ny = a.x;
  if ((hand[9].x * W - x0) * nx + (hand[9].y * H - y0) * ny < 0) { nx = -nx; ny = -ny; }
  const cun = c.k * palm / 12;
  return { x0, y0, ax: a.x, ay: a.y, nx, ny, lenPx: cun * 12, cun, palm };
}

/** 手掌法向 vs 校準時的夾角（度） */
function faNormalDev(n, n0) {
  if (!n || !n0) return null;
  return Math.acos(Math.max(-1, Math.min(1, n.x * n0.x + n.y * n0.y + n.z * n0.z))) * 180 / Math.PI;
}

/** 前臂平行線索：(手掌長／校準) ÷ (Pose 前臂長／校準)；1＝跟校準時一樣 */
const faParallelCue = (palm, L, c) => (palm / c.palm) / (L / c.L);

/** 遲滯開關：blocked 時要回到 off 以下才放；沒擋時超過 on 才擋 */
const faHyst = (blocked, v, on, off) => blocked ? v > off : v > on;

// ── ForearmCalib：放平檢測（手心、整段前臂進框、Tb 穩 2 秒）──────────
class FaCalib {
  constructor(durMs = 2000, minSamples = 5, maxTbRange = 0.12) {
    this.durMs = durMs; this.minSamples = minSamples; this.maxTbRange = maxTbRange;
    this.reset();
  }
  reset() { this.tbs = []; this.wrs = []; this.startMs = 0; this.result = null; this.issue = 'no-hand'; }
  progress(now) {
    if (this.result) return 1;
    return this.tbs.length ? Math.min(1, Math.max(0, (now - this.startMs) / this.durMs)) : 0;
  }
  update(bad, tb, wr, now) {
    if (this.result) return;
    if (bad || tb == null || wr == null) {
      this.issue = bad || 'no-hand'; this.tbs = []; this.wrs = [];
      return;
    }
    if (!this.tbs.length) this.startMs = now;
    this.tbs.push(tb); this.wrs.push(wr);
    if (Math.max(...this.tbs) - Math.min(...this.tbs) > this.maxTbRange) {   // 手在動 → 從這一幀重收
      this.issue = 'moving';
      this.tbs = [tb]; this.wrs = [wr]; this.startMs = now;
      return;
    }
    this.issue = null;
    if (now - this.startMs >= this.durMs && this.tbs.length >= this.minSamples) {
      this.result = { tb0: faMedian(this.tbs), wr0: faMedian(this.wrs) };
    }
  }
}

// ── ForearmTwistGate：ΔTb 鎖方向、掌寬比推轉角、超過容忍角就擋 ─────────
class FaTwistGate {
  constructor(tb0, wr0, tolDeg = 30, hystDeg = 8, latchTb = 0.15, unlockDeg = 20) {
    Object.assign(this, { tb0, wr0, tolDeg, hystDeg, latchTb, unlockDeg });
    this.recentTb = []; this.recentWr = [];
    this.latched = 0; this.blocked = false; this.twistDeg = 0; this.dTb = 0;
  }
  update(tb, wr) {
    this.recentTb.push(tb); if (this.recentTb.length > 5) this.recentTb.shift();
    this.recentWr.push(wr); if (this.recentWr.length > 5) this.recentWr.shift();
    const t = faMedian(this.recentTb), w = faMedian(this.recentWr);
    this.dTb = t - this.tb0;
    const theta = Math.acos(Math.min(1, Math.max(0, w / this.wr0))) * 180 / Math.PI;
    if (this.latched === 0 && Math.abs(this.dTb) > this.latchTb) this.latched = this.dTb > 0 ? 1 : -1;
    if (this.latched !== 0 && theta < Math.min(this.unlockDeg, this.tolDeg - this.hystDeg)) this.latched = 0;
    this.twistDeg = this.latched !== 0 ? theta : 0;
    if (this.blocked && this.twistDeg <= this.tolDeg - this.hystDeg) this.blocked = false;
    else if (!this.blocked && this.twistDeg > this.tolDeg) this.blocked = true;
    return !this.blocked;
  }
}

// ── ForearmPressTracker：另一隻手勾選的指尖離內關夠近就算按到 ──────────
class FaPressTracker {
  constructor(onCun = 0.7, offCun = 1.0, graceMs = 400) {
    Object.assign(this, { onCun, offCun, graceMs });
    this.reset();
  }
  reset() { this.held = false; this.lastSeenMs = 0; }
  update(distCun, now) {
    if (distCun == null) {
      if (this.held && now - this.lastSeenMs > this.graceMs) this.held = false;
      return this.held;
    }
    this.lastSeenMs = now;
    this.held = this.held ? distCun <= this.offCun : distCun <= this.onCun;
    return this.held;
  }
}

// ═══════════════════════════════════════════════════════════════════
// 相機與迴圈
// ═══════════════════════════════════════════════════════════════════
// ── 穩住：鎖定／定格（2026-11-01 用戶：「定版手肘的定位」「兩種都寫給我看」）──────
// 兩種都是「手穩住 1 秒 → 點就不再每幀重算」，差在之後點跟不跟手走：
//   鎖定 lock：照 測試/前臂手掌尺即時_20261029 第 5 版（Python 寫好但沒跑過）。
//              點＝平滑手腕＋固定偏移 —— 手腕平移點跟著走，手轉動／縮放點不動。
//              手方向偏 >8° 或手掌長變 >10%（近 3 幀中位）→ 不顯示、鎖定保留，手回來點就在原位。
//              重新定位：近 0.3 秒手腕淨位移 >20mm，或「手動了」停在新姿勢 >2 秒。
//   定格 freeze：點直接釘在畫面上；手腕離開定格時的位置 >10mm（近 3 幀中位）就收掉、重新定位。
//   即時 live：跟以前一樣每幀重算。
// 每一穴（內關／間使／郄門／外關）都走這裡；閘門擋下時照樣不顯示（鎖定／定格保留）。
// ⚠️ 5mm、20mm、8°、10%、2 秒照 Python 第 5 版，10mm（定格）是 Claude 定的 —— 都沒有實測過。
const FA_HOLD_SEC = 1.0, FA_HOLD_STILL_MM = 5, FA_HOLD_FAST_MM = 20, FA_HOLD_FAST_SEC = 0.3;
const FA_HOLD_DEG = 8, FA_HOLD_SCALE = 0.10, FA_HOLD_RELOCK_SEC = 2.0;
const FA_HOLD_EURO = [0.5, 0.01];       // 鎖定後手腕平移的 One Euro（同 Python LOCK_EURO_H0）
const FA_FREEZE_MM = 10;
const FA_MM_PER_CUN = 250 / 12;         // 換算 mm 用（前臂 12 寸≈250mm，同 Python）

const faHoldNew = () => ({ hist: [], cand: [], hand: [], lock: null, mmPx: 0 });

/**
 * 每幀呼叫一次。point＝這一幀算出來的點（閘門擋下是 null）；hp＝被按那隻手 21 點；cunPx＝這一幀 1 寸幾 px。
 * 回 { point, state }：state = live｜seek（定位中）｜held（已鎖定／已定格）｜moved（鎖定中手動了）
 */
function faHoldStep(h, mode, point, hp, cunPx, now, W, H) {
  if (mode !== 'lock' && mode !== 'freeze') { h.lock = null; h.cand = []; return { point, state: 'live' }; }
  if (!hp || hp.length < 21) { h.cand = []; return { point: null, state: h.lock ? 'held' : 'seek' }; }
  const t = now / 1000, k = FA_PR_REF_W / W;
  const w = { x: hp[0].x * W, y: hp[0].y * H };
  if (cunPx > 0) h.mmPx = FA_MM_PER_CUN / cunPx;
  h.hist.push({ t, x: w.x, y: w.y });
  h.hist = h.hist.filter(e => t - e.t <= FA_HOLD_SEC);
  const cx = faMedian(h.hist.map(e => e.x)), cy = faMedian(h.hist.map(e => e.y));
  const spread = Math.max(...h.hist.map(e => Math.hypot(e.x - cx, e.y - cy))) * h.mmPx;
  const sh = h.hist.filter(e => t - e.t <= FA_HOLD_FAST_SEC);
  const fast = Math.hypot(sh[sh.length - 1].x - sh[0].x, sh[sh.length - 1].y - sh[0].y) * h.mmPx > FA_HOLD_FAST_MM;
  const still = h.mmPx > 0 && spread < FA_HOLD_STILL_MM;
  const ang = faAng(faHandDir(hp, W, H)), palm = faPalmLen(hp, W, H);
  h.hand.push({ ang, palm });
  if (h.hand.length > 3) h.hand.shift();

  // 還沒鎖：照常顯示即時點，同時收「穩住」的樣本
  if (!h.lock) {
    if (!point) { h.cand = []; return { point: null, state: 'seek' }; }
    h.cand = h.cand.filter(c => t - c.t <= FA_HOLD_SEC);
    h.cand.push({ t, ox: point.x - w.x, oy: point.y - w.y, px: point.x, py: point.y, ang, palm });
    if (!still) h.cand = h.cand.slice(-1);
    else if (h.cand[h.cand.length - 1].t - h.cand[0].t >= FA_HOLD_SEC * 0.9) {
      const C = h.cand, a1 = C[C.length - 1].ang;
      h.lock = {
        off: { x: faMedian(C.map(c => c.ox)), y: faMedian(C.map(c => c.oy)) },
        fixed: { x: faMedian(C.map(c => c.px)), y: faMedian(C.map(c => c.py)) },
        w0: { x: cx, y: cy },
        a0: a1 + faMedian(C.map(c => faWrap(c.ang - a1))),
        p0: faMedian(C.map(c => c.palm)),
        euro: new FaOneEuro(...FA_HOLD_EURO), movedSince: null,
      };
      h.lock.euro.filter({ x: w.x * k, y: w.y * k }, t);
      return { point: mode === 'freeze' ? { ...h.lock.fixed } : point, state: 'held' };
    }
    return { point, state: 'seek' };
  }

  const L = h.lock;
  const release = () => { h.lock = null; h.cand = []; return { point, state: 'seek' }; };
  if (mode === 'freeze') {
    const r = h.hist.slice(-3);
    const away = Math.hypot(faMedian(r.map(e => e.x)) - L.w0.x, faMedian(r.map(e => e.y)) - L.w0.y) * h.mmPx;
    if (away > FA_FREEZE_MM) return release();
    return { point: point ? { x: L.fixed.x, y: L.fixed.y } : null, state: 'held' };
  }
  const hs = L.euro.filter({ x: w.x * k, y: w.y * k }, t);
  const dAng = Math.abs(faWrap(faMedian(h.hand.map(e => faWrap(e.ang - L.a0)))));
  const dScl = Math.abs(faMedian(h.hand.map(e => e.palm)) / L.p0 - 1);
  const moved = dAng > FA_HOLD_DEG || dScl > FA_HOLD_SCALE;
  L.movedSince = moved ? (L.movedSince ?? t) : null;
  if (fast || (L.movedSince != null && t - L.movedSince > FA_HOLD_RELOCK_SEC && still)) return release();
  if (moved) return { point: null, state: 'moved' };
  return { point: point ? { x: hs.x / k + L.off.x, y: hs.y / k + L.off.y } : null, state: 'held' };
}

let faCamera = null, faVideo = null, faCanvas = null, faGateId = 'massage-gate';
let faCamRunning = false, faCamStarting = false, faCamWanted = false, faCamStartP = null;
let faFacing = 'user';
let faHandResults = null;           // js/vision.js onHandsResults 轉交過來
let faPoseResults = null;
let faPose = null, faInitP = null, faModelsReady = false;
let faCalibratedCb = null;          // 檢測完（打勾停完）要通知誰：按摩頁的 onForearmCalibrated
let faAcu = '內關穴';                // 現在定位哪一穴（FA_POINTS 的 key）
const faSpec = () => FA_POINTS[faAcu] || FA_POINTS['內關穴'];

/** 讀數條第一句（按摩頁開相機前也用）：外關要手背朝鏡頭 */
function faCalibTitle(name) {
  const s = FA_POINTS[name];
  return s && s.dorsal ? t('fa-calib-title-dorsal') : t('fa-calib-title');
}

// 每次檢測重來就換一份（換鏡頭、重新進頁）
let fa = null;
function faResetState() {
  fa = {
    calib: new FaCalib(), gate: null, press: new FaPressTracker(),
    smooth: null, elbow: null, calibAt: 0, notified: false,
    // 手掌尺（郄門）
    prCalib: new FaPalmRulerCalib(), pr: null, prEuro: new FaOneEuro(...FA_PR_EURO_PT),
    prElbowEuro: new FaOneEuro(...FA_PR_EURO_EL), tw3dBlocked: false, parBlocked: false,
    hold: faHoldNew(), holdState: 'live',
  };
  if (typeof onTarget !== 'undefined') onTarget = false;
}
faResetState();

function getPose() {
  if (faPose) return faPose;
  faPose = new Pose({ locateFile: (f) => mpAsset('pose', f) });
  faPose.setOptions({
    modelComplexity: 1,             // full（App 用 pose_landmarker_full.task）
    smoothLandmarks: false,         // 平滑交給 FA_EMA（同 App）
    enableSegmentation: true,       // 覆蓋邊界要遮罩
    smoothSegmentation: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  faPose.onResults((r) => { faPoseResults = r; });
  return faPose;
}

// ⚠️ Solutions API 兩個模型的 initialize() 不能同時跑（共用 wasm 載入器的全域變數，
//    forearm-lab.js 2026-09-25 實測會 Abort）→ 先等 Hands（可能在認穴頁預熱中），再載 Pose。
function faInitModels() {
  if (faInitP) return faInitP;
  if (typeof Pose === 'undefined' || typeof Hands === 'undefined') return Promise.reject(new Error('MediaPipe 腳本沒載到'));
  faInitP = (async () => {
    const h = getHands(), p = getPose();
    const init = (m) => typeof m.initialize === 'function' ? m.initialize() : undefined;
    await (typeof handsInitP !== 'undefined' && handsInitP ? handsInitP.catch(() => init(h)) : init(h));
    await init(p);
    faModelsReady = true;
  })();
  faInitP.catch(() => { faInitP = null; });
  return faInitP;
}

// 認穴頁預熱（同 warmUpHands 的用意：Pose 約 6MB，別等按下「開始定位」才抓）。
// 晚一點再開始，讓 warmUpHands 的 idle 那次先排進去、handsInitP 有值，兩邊才不會同時 initialize。
function warmUpForearm() {
  if (faInitP || typeof Pose === 'undefined') return;
  setTimeout(() => { faInitModels().catch(() => {}); }, 1800);
}

function setFaGate(kind, msg) {
  const el = document.getElementById(faGateId);
  if (!el) return;
  if (el.textContent !== msg) el.textContent = msg;
  el.className = 'readout gate-' + (kind === 'ok' ? 'ok' : kind === 'bad' ? 'bad' : 'warn');
}

/**
 * @param onCalibrated 檢測完、打勾停完時呼叫（按摩頁用來開始進頁倒數）
 * @param acuName 定位哪一穴；省略＝沿用上一次（換鏡頭、刷新鏡頭）
 */
async function startForearmCamera(canvasId, gateId, onCalibrated, acuName) {
  if (acuName && FA_POINTS[acuName]) faAcu = acuName;
  faCanvas = document.getElementById(canvasId);
  faGateId = gateId || 'massage-gate';
  faCalibratedCb = onCalibrated || null;
  faCamWanted = true;
  if (faCamRunning) return;
  if (faCamStartP) return faCamStartP;
  faCamStarting = true;
  setFaGate('warn', isZh() ? '啟動相機中…' : 'Starting camera…');
  faCamStartP = (async () => {
    let cam = null;
    try {
      // 手部、臉部那兩套共用同一個 <video>：先確定它們都收乾淨
      if (typeof stopCamera === 'function') stopCamera();
      if (typeof stopFaceCamera === 'function') stopFaceCamera();
      // 等的期間打旗標：手部／臉部那邊看到就不反過來等這裡，否則互等死鎖（2026-10-01 續 13）
      faWaitingOthers = true;
      try {
        if (typeof camIdle === 'function') await camIdle();
        if (typeof faceCamIdle === 'function') await faceCamIdle();
      } finally { faWaitingOthers = false; }
      if (!faCamWanted) return;
      if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) {
        throw Object.assign(new Error('no mediaDevices'), { name: 'NoMediaDevices' });
      }
      faVideo = document.getElementById('hidden-video');
      const h = getHands();
      if (typeof applyHandsOptions === 'function') applyHandsOptions(h, 'massage');   // 兩隻手：被按的＋按的
      faInitModels().catch((e) => {
        console.error(e);
        if (faCamWanted) setFaGate('bad', (isZh() ? '模型載入失敗：' : 'Model failed to load: ') + (e && e.message ? e.message : e));
      });
      cam = faCamera = new Camera(faVideo, {
        onFrame: async () => {
          if (!faCamRunning) return;
          if (!faModelsReady) { faDrawPreview(); return; }
          faHandResults = null; faPoseResults = null;
          try {
            await h.send({ image: faVideo });
            if (!faCamRunning) return;
            await getPose().send({ image: faVideo });
          } catch (e) { return; /* 關閉瞬間的競態 */ }
          if (faCamRunning) faProcessFrame();
        },
        width: 640, height: 480, facingMode: faFacing,
      });
      await cam.start();
      if (!faCamWanted) {
        try { cam.stop(); } catch (e) {}
        if (faCamera === cam) faCamera = null;
        return;
      }
      faCamera = cam;
      faCamRunning = true;
      setFaGate('warn', faModelsReady ? faCalibTitle(faAcu) : t('fa-loading'));
    } catch (err) {
      if (cam) { try { cam.stop(); } catch (e) {} if (faCamera === cam) faCamera = null; }
      if (faCamWanted) setFaGate('bad', typeof cameraErrorText === 'function' ? cameraErrorText(err) : String(err));
      console.error(err);
    } finally {
      faCamStarting = false;
      faCamStartP = null;
    }
  })();
  return faCamStartP;
}

// 前臂啟動若正卡在「等手部／臉部收完」，就不用等它：它那時還沒開串流，
// 而呼叫者已經 stopForearmCamera() 過，它醒來會自己退出。反過來等會互等死鎖。
let faWaitingOthers = false;
function forearmCamIdle() { return (!faWaitingOthers && faCamStartP) || Promise.resolve(); }

function stopForearmCamera() {
  faCamWanted = false;
  faCamRunning = false;
  if (typeof onTarget !== 'undefined') onTarget = false;
  if (faCamera) { try { faCamera.stop(); } catch (e) {} faCamera = null; }
  if (faVideo && faVideo.srcObject) {
    faVideo.srcObject.getTracks().forEach(tr => tr.stop());
    faVideo.srcObject = null;
  }
}

/** 換鏡頭＝重新檢測（同 App：btn_flip → recalib） */
async function switchForearmCamera() {
  faFacing = faFacing === 'user' ? 'environment' : 'user';
  const c = faCanvas && faCanvas.id, g = faGateId, cb = faCalibratedCb;
  stopForearmCamera();
  faResetState();
  await forearmCamIdle();
  await startForearmCamera(c, g, cb);
}

/** 只重新檢測，不換鏡頭 */
function recalibForearm() { faResetState(); }

const forearmCalibrated = () => !!(fa && fa.calib.result);

// ── 畫布 ─────────────────────────────────────────────────────────────
function faFitCanvas() {
  const canvas = faCanvas;
  const vw = faVideo.videoWidth || 640, vh = faVideo.videoHeight || 480;
  const s = Math.min(1, 640 / Math.max(vw, vh));             // 同 vision.js CANVAS_MAX_EDGE（等比）
  const cw = Math.round(vw * s), ch = Math.round(vh * s);
  if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
  return { W: cw, H: ch, ctx: canvas.getContext('2d') };
}

function faDrawVideo(ctx, W, H) {
  ctx.save();
  if (faFacing === 'user') { ctx.translate(W, 0); ctx.scale(-1, 1); }
  ctx.drawImage(faVideo, 0, 0, W, H);
  ctx.restore();
}

function faDrawPreview() {
  if (!faCanvas || !faVideo) return;
  const { W, H, ctx } = faFitCanvas();
  faDrawVideo(ctx, W, H);
  setFaGate('warn', t('fa-loading'));
}

// 遮罩縮小再讀（Solutions 版遮罩有的放 alpha、有的放紅色通道，讀法同 forearm-lab.js flMaskAt）
let faMaskCanvas = null, faMaskCtx = null;
function faReadMask(mask, W, H) {
  if (!mask) return null;
  const s = Math.min(1, FA_MASK_MAX / Math.max(W, H));
  const mw = Math.round(W * s), mh = Math.round(H * s);
  if (!faMaskCanvas) {
    faMaskCanvas = document.createElement('canvas');
    faMaskCtx = faMaskCanvas.getContext('2d', { willReadFrequently: true });
  }
  if (faMaskCanvas.width !== mw || faMaskCanvas.height !== mh) { faMaskCanvas.width = mw; faMaskCanvas.height = mh; }
  faMaskCtx.clearRect(0, 0, mw, mh);
  faMaskCtx.drawImage(mask, 0, 0, mw, mh);
  const data = faMaskCtx.getImageData(0, 0, mw, mh).data;
  return (x, y) => {
    const mx = Math.round(x * mw / W), my = Math.round(y * mh / H);
    if (mx < 0 || my < 0 || mx >= mw || my >= mh) return null;   // 出畫面
    const i = (my * mw + mx) * 4, a = data[i + 3], r = data[i];
    return (a < 250 ? a : r) / 255 > FA_MASK_TH;
  };
}

// 2026-11-01（App 批 123）：正方形框換成跟手部、臉部同一個 calibBox（直立 3:4，js/calib.js），
//   框裡加手肘圖（這一穴手心／手背 × 被按的左手／右手）。判斷進框用同一個框，所以畫的跟判斷的一致。
//   （上面的 FA_BOX_FRAC 0.86／FA_BOX_SLACK 已沒人用，留著只是對照舊正方形框的大小。）
// 2026-11-04：改成橫框 calibBoxForearm（2:1）—— 手肘圖是放平的，直立框在電腦橫螢幕上逼人坐很遠。
function faBox(W, H) { return calibBoxForearm(W, H); }
function faInBox(pts, b) { return pointsInBox(pts, b); }

/** 檢測框：同 App CalibGuide（圖＋進度沿框走一圈＋量好變綠打勾） */
function faDrawBox(ctx, b, progress, done, sc) {
  const spec = faSpec();
  const file = calibForearmImgFile(!spec.dorsal, fa.calibHand || 'right');
  drawCalibGuide(ctx, b, progress, done, sc, file, faFacing !== 'user');
}

// ── 每幀 ─────────────────────────────────────────────────────────────
function faProcessFrame() {
  const { W, H, ctx } = faFitCanvas();
  const now = performance.now();
  const mirror = faFacing === 'user';
  const mx = (x) => mirror ? W - x : x;
  const sc = typeof screenScale === 'function' ? screenScale(faCanvas) : 1;
  faDrawVideo(ctx, W, H);

  const hr = faHandResults || {}, pr = faPoseResults || {};
  const hands = hr.multiHandLandmarks || [];
  const sides = hr.multiHandedness || [];
  const worlds = hr.multiHandWorldLandmarks || [];
  const pose = pr.poseLandmarks && pr.poseLandmarks.length >= 33 ? pr.poseLandmarks : null;

  const pick = pose ? faPickTarget(pose, hands, fa.elbow) : null;
  const hp = pick ? hands[pick.hand] : null;
  let elbow = null;
  if (pick) {
    const e = pose[pick.elbow];
    if ((e.visibility == null || e.visibility >= FA_ELBOW_VIS) && e.x >= 0 && e.x <= 1 && e.y >= 0 && e.y <= 1) {
      elbow = { x: e.x * W, y: e.y * H };
    }
  }
  const spec = faSpec();
  const dorsal = !!(hp && sides[pick.hand] && isDorsalView(hp, sides[pick.hand]));
  // 翻錯面：內關／間使／郄門要手心，外關要手背
  const wrongSide = dorsal !== spec.dorsal ? (spec.dorsal ? 'palm' : 'dorsal') : null;
  const tb = hp ? computeTwistTb(hp, W, H) : null;
  const wr = hp ? faWidthRatio(hp, W, H) : null;
  // 檢測框的圖跟著鏡頭裡實際那隻手換；還沒看到手先放右手（App ForearmScreen 批 123）
  if (hp && sides[pick.hand]) fa.calibHand = handKeyOfLabel(sides[pick.hand].label);

  if (showSkeleton) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    hands.forEach(lm => (lm || []).forEach(p => { ctx.beginPath(); ctx.arc(mx(p.x * W), p.y * H, 3, 0, Math.PI * 2); ctx.fill(); }));
    if (elbow) { ctx.fillStyle = '#FFC800'; ctx.beginPath(); ctx.arc(mx(elbow.x), elbow.y, 5 * sc, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }

  const box = faBox(W, H);
  const showingDone = fa.calibAt && now - fa.calibAt < FA_CALIB_SHOW_MS;

  // ── ① 檢測 ──
  if (!fa.calib.result) {
    const bad = !hp ? 'no-hand'
      : !elbow ? 'no-elbow'
      : !faInBox([{ x: hp[0].x * W, y: hp[0].y * H }, elbow], box) ? 'out-box'
      : wrongSide;
    // 手掌尺（郄門）：同一段 2 秒另外收 k、δ、r、手掌法向；手掌長或前臂長動到就一起重收
    let prBad = bad;
    if (spec.ruler === 'palm') {
      if (bad) fa.prCalib.reset();
      else {
        const pAxis = faAxis(hp, elbow.x, elbow.y, W, H);
        const inside = pAxis ? faReadMask(pr.segmentationMask, W, H) : null;
        const sample = pAxis ? faPalmRulerSample(hp, worlds[pick.hand], pAxis, inside ? faMeasureCuts(inside, pAxis) : [], W, H) : null;
        if (!sample) { prBad = 'no-hand'; fa.prCalib.reset(); }
        else if (!fa.prCalib.add(sample)) { prBad = 'moving'; fa.prCalib.reset(); }
      }
    }
    fa.calib.update(prBad, tb, wr, now);
    // FaCalib 因為 Tb 跳動自己從這一幀重收 → 手掌尺樣本也只留這一幀
    if (!fa.calib.result && fa.calib.tbs.length === 1) fa.prCalib.s = fa.prCalib.s.slice(-1);
    if (fa.calib.result && spec.ruler === 'palm') {
      fa.pr = fa.prCalib.result();
      if (!fa.pr) { fa.calib.reset(); fa.prCalib.reset(); }   // 樣本不夠（不太會發生）→ 重新檢測
    }
    if (fa.calib.result) {
      fa.gate = new FaTwistGate(fa.calib.result.tb0, fa.calib.result.wr0);
      fa.elbow = pick.elbow;                 // 鎖定這一側手臂：之後兩隻手都在畫面上也認得出哪隻是被按的
      fa.calibAt = now;
    }
    faDrawBox(ctx, box, fa.calib.progress(now), !!fa.calib.result, sc);
    if (fa.calib.result) setFaGate('ok', t('fa-calib-done'));
    else {
      const msg = { 'no-elbow': 'fa-no-elbow', 'out-box': 'fa-out-box',
        dorsal: 'fa-dorsal', palm: 'fa-palm', moving: 'fa-moving' }[fa.calib.issue];
      setFaGate(fa.calib.issue ? 'warn' : 'ok',
        fa.calib.issue === 'no-hand' ? faCalibTitle(faAcu) : msg ? faT(msg) : t('fa-calib-hold'));
    }
    onTarget = false;
    return;
  }
  if (showingDone) {
    faDrawBox(ctx, box, 1, true, sc);
    setFaGate('ok', t('fa-calib-done'));
    onTarget = false;
    return;
  }
  if (!fa.notified) {
    fa.notified = true;
    if (faCalibratedCb) setTimeout(faCalibratedCb, 0);
  }

  // ── ② 定位 ──
  const ruler = spec.ruler === 'palm' && fa.pr ? fa.pr : null;
  // 手掌尺不靠肘點定位 → 手肘出框照樣可以出點
  const locIssue = !hp ? 'no-hand' : (!elbow && !ruler) ? 'no-elbow' : wrongSide;
  const pass = (tb != null && wr != null) ? fa.gate.update(tb, wr) : false;
  const axis = ruler ? (hp ? faPalmAxis(hp, W, H, ruler) : null)
    : (hp && elbow) ? faAxis(hp, elbow.x, elbow.y, W, H) : null;
  let point = null, cuts = [], r = null;
  if (ruler && hp && axis) {
    // ② 扭轉第二道：手掌法向偏離檢測時超過 30° 就擋（三角形抓不到前臂自己轉）
    const dev = faNormalDev(faPalmNormal(worlds[pick.hand]), ruler.n0);
    if (dev != null) fa.tw3dBlocked = faHyst(fa.tw3dBlocked, dev, FA_PR_TWIST3D, FA_PR_TWIST3D - FA_PR_HYST);
    // ③ 前臂平行：Pose 只用在這裡。手肘看不到（或不可信）就維持上一幀的判斷
    const e = pick ? pose[pick.elbow] : null;
    const m = 20 / Math.max(W, H);
    if (e && (e.visibility == null || e.visibility >= FA_PR_ELBOW_VIS) && e.x >= m && e.x <= 1 - m && e.y >= m && e.y <= 1 - m) {
      const k = FA_PR_REF_W / W;
      const es = fa.prElbowEuro.filter({ x: e.x * W * k, y: e.y * H * k }, now / 1000);
      const L = Math.hypot(es.x / k - axis.x0, es.y / k - axis.y0);
      if (L > 1) fa.parBlocked = faHyst(fa.parBlocked, Math.abs(faParallelCue(axis.palm, L, ruler) - 1), FA_PR_PAR_ON, FA_PR_PAR_OFF);
    }
  }
  if (ruler) {
    if (!locIssue && pass && axis && !fa.tw3dBlocked && !fa.parBlocked) {
      r = ruler.r;
      const th = faTwistWorldDeg(worlds[pick.hand], axis);
      const p = faLocate(axis, spec, r, th != null ? th : 0);
      const k = FA_PR_REF_W / W;
      const q = fa.prEuro.filter({ x: p.x * k, y: p.y * k }, now / 1000);
      point = { x: q.x / k, y: q.y / k };
    }
  } else if (!locIssue && pass && axis) {
    let th = null;
    if (spec.pc) {                           // 純 n 寸的穴（外關）不用量半徑和扭轉角
      const inside = faReadMask(pr.segmentationMask, W, H);
      cuts = inside ? faMeasureCuts(inside, axis) : [];
      r = faRadiusCun(cuts);
      th = faTwistWorldDeg(worlds[pick.hand], axis);
    }
    const p = faLocate(axis, spec, r != null ? r : FA_R_DEFAULT, th != null ? th : 0);
    const prev = fa.smooth;
    point = prev ? { x: FA_EMA * p.x + (1 - FA_EMA) * prev.x, y: FA_EMA * p.y + (1 - FA_EMA) * prev.y } : p;
  }
  fa.smooth = point;

  // ── ②b 穩住：鎖定／定格（設定 › 顯示 › 手肘定位）──
  const mode = typeof faHoldMode !== 'undefined' ? faHoldMode : 'live';
  const held = faHoldStep(fa.hold, mode, point, hp, axis ? axis.cun : 0, now, W, H);
  point = held.point;
  fa.holdState = held.state;

  // ── ③ 按壓：另一隻手勾選的指尖中離內關最近那根 ──
  let tip = null, distCun = null;
  const presser = hands.find((h, i) => i !== (pick && pick.hand) && h && h.length >= 21) || null;
  if (point && axis && presser) {
    const tipIdx = typeof pressTipIdx === 'function' ? pressTipIdx() : [8];
    tipIdx.forEach(i => {
      const q = { x: presser[i].x * W, y: presser[i].y * H };
      const d = Math.hypot(q.x - point.x, q.y - point.y);
      if (!tip || d < tip.d) tip = { ...q, d };
    });
    if (tip) distCun = tip.d / axis.cun;
  }
  const on = fa.press.update(distCun, now) && !!point;
  onTarget = on;

  // ── 畫 ──
  if (showSkeleton && spec.pc) {
    ctx.save();
    ctx.strokeStyle = '#FFC800'; ctx.lineWidth = 2 * sc;
    cuts.forEach(c => { ctx.beginPath(); ctx.moveTo(mx(c.x1), c.y1); ctx.lineTo(mx(c.x2), c.y2); ctx.stroke(); });
    const label = ruler
      ? `手掌尺 k ${ruler.k.toFixed(2)} · δ ${ruler.delta.toFixed(1)}°（${ruler.deltaSrc === 'mask' ? '遮罩' : 'Pose'}） · r ${ruler.r.toFixed(2)} 寸`
        + (fa.parBlocked ? ' · 不平行' : '') + (fa.tw3dBlocked ? ' · 扭轉' : '')
      : 'r = ' + (r != null ? `${r.toFixed(2)} 寸（遮罩 ${cuts.length} 刀）` : `${FA_R_DEFAULT.toFixed(2)} 寸（預設，遮罩沒量到）`);
    ctx.font = `${12 * sc}px 'Microsoft JhengHei', sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(W / 2 - tw / 2 - 8 * sc, 14 * sc, tw + 16 * sc, 18 * sc);
    ctx.fillStyle = '#fff'; ctx.fillText(label, W / 2, 16 * sc);
    ctx.restore();
  }
  const discR = axis ? FA_PRESS_ON * axis.cun : 0;
  if (point) {
    const px = mx(point.x), py = point.y;
    if (showDisc) {
      ctx.save();
      ctx.beginPath(); ctx.arc(px, py, discR, 0, Math.PI * 2);
      // 2026-10-27 用戶：「定位點外層有一個環去掉」→ 不描外框（同 App ForearmScreen）
      ctx.fillStyle = 'rgba(0,229,160,.14)'; ctx.fill();
      ctx.restore();
    }
    drawAcupoint(ctx, px, py, showAcuNames ? itemLabel(faAcu) : '', '#4FBF8B', appDotR(faCanvas), sc);
    if (tip) drawPresserTip(ctx, mx, tip, point, on, discR);
  }
  // 穩住的狀態標在左上角（即時模式不畫）
  if (fa.holdState !== 'live') {
    const label = fa.holdState === 'held' ? t(mode === 'freeze' ? 'fa-hold-frozen' : 'fa-hold-locked')
      : fa.holdState === 'moved' ? t('fa-hold-moved') : t('fa-hold-seek');
    ctx.save();
    ctx.font = `bold ${13 * sc}px 'Microsoft JhengHei', sans-serif`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const tw = ctx.measureText(label).width, bh = 24 * sc, x0 = 10 * sc, y0 = 10 * sc;
    ctx.fillStyle = fa.holdState === 'held' ? 'rgba(46,140,96,.88)' : 'rgba(0,0,0,.6)';
    ctx.fillRect(x0, y0, tw + 20 * sc, bh);
    ctx.fillStyle = '#fff'; ctx.fillText(label, x0 + 10 * sc, y0 + bh / 2);
    ctx.restore();
  }

  // ── 提示（一次只講一件事，順序同 App）──
  // 手背那面 Tb 正負對應哪邊轉沒驗過 → 外關不講往哪轉，只講轉回手背
  const noHand = spec.dorsal ? 'fa-no-hand-dorsal' : 'fa-no-hand';
  if (locIssue) setFaGate('warn', faT({ 'no-hand': noHand, 'no-elbow': 'fa-no-elbow', dorsal: 'fa-dorsal', palm: 'fa-palm' }[locIssue]));
  else if (fa.gate.blocked && spec.dorsal) setFaGate('warn', t('fa-twist-dorsal'));
  else if (fa.gate.blocked && fa.gate.latched > 0) setFaGate('warn', t('fa-twist-pinky'));
  else if (fa.gate.blocked && fa.gate.latched < 0) setFaGate('warn', t('fa-twist-thumb'));
  else if (ruler && fa.tw3dBlocked) setFaGate('warn', t('fa-twist-back'));
  else if (ruler && fa.parBlocked) setFaGate('warn', t('fa-not-parallel'));
  else if (fa.holdState === 'moved') setFaGate('warn', t('fa-hold-moved'));
  else if (!point) setFaGate('warn', faT(noHand));
  else if (!presser) setFaGate('warn', t('massage-hint'));
  else setFaGate(on ? 'ok' : 'bad', t(on ? 'fa-on' : 'fa-off'));
}

// 翻譯 key 寫成字面值給 tests/check.js 掃（上面查表拼出來的它看不到）
function faT(key) {
  switch (key) {
    case 'fa-calib-title': return t('fa-calib-title');
    case 'fa-no-elbow': return t('fa-no-elbow');
    case 'fa-out-box': return t('fa-out-box');
    case 'fa-dorsal': return t('fa-dorsal');
    case 'fa-palm': return t('fa-palm');
    case 'fa-moving': return t('fa-moving');
    case 'fa-no-hand': return t('fa-no-hand');
    case 'fa-no-hand-dorsal': return t('fa-no-hand-dorsal');
    default: return t(key);
  }
}

window.addEventListener('pagehide', stopForearmCamera);
// 2026-10-01 用戶：「網頁每次切個桌面我的鏡頭畫面就卡了」—— 以前切走只關不開，
//   回來畫面停在最後一幀。→ 切走時記下正在用的畫布，切回來（畫布還在畫面上）就重開。
let faResume = null;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    faResume = (faCamWanted || faCamRunning) && faCanvas ? { id: faCanvas.id, gate: faGateId, cb: faCalibratedCb } : null;
    stopForearmCamera();
  } else if (faResume) {
    const r = faResume; faResume = null;
    const el = document.getElementById(r.id);
    if (el && el.offsetParent !== null) startForearmCamera(r.id, r.gate, r.cb);
  }
});
