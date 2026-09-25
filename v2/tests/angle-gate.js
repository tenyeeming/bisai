// 逐穴道角度閘門測試（2026-08-12）。驗證 ACU_ANGLE_LIMIT + computeAcuGate 三件事：
//   ① 每個穴道都查得到自己的上限，而且值合理
//   ② 上限的數字與「投影縮短」反推公式自洽（不是隨手填的）
//   ③ 拿真實 landmark 餵進去，palm 類與 side 類的 angleDeg 真的天差地遠
//      —— 這是整個功能存在的理由：同一幀手掌很正，側緣穴那塊皮膚卻是切著看的。
//   node tests/angle-gate.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const DIR = path.join(__dirname, '..').replace(/\\/g, '/') + '/';
const REC = path.join(__dirname, '../../../測試記錄').replace(/\\/g, '/') + '/';

let fail = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };

// ── 載入 acu-data.js + acu-math.js（純計算，不需要 DOM，只要補 localStorage）──
const ctx = vm.createContext({
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  console, Math, JSON,
});
// ⚠ 兩個檔案必須「串成同一支 script」跑：頂層 const/let 是詞法宣告，
//   不會掛到 global 上，分兩次 runInContext 後面那支就看不到前面的常數
//   （C# 類比：兩個獨立的 static 建構區塊，區域變數彼此不可見）。
//   最後那行把要驗的東西塞進 global，外面才拿得到。
const EXPORTS = ['ACUPOINTS', 'ACU_ANGLE_LIMIT', 'ACU_ANGLE_HARD_CAP', 'ACU_ANGLE_MARGIN_DEG',
  'ACU_GATE_BLOCK', 'DISC_MIN_MINOR_PX', 'CONF_DISC_CUN', 'computeCunPx',
  'ACU_NORMAL_SPEC', 'CUN_MM', 'HIT_MM', 'acuAngleLimit', 'computeAcuGate',
  'computeAcuConfidence', 'confidenceDiscPoints', 'TIP_DISC_OFFSET_CUN', 'computeAcupoint'];
vm.runInContext(
  ['js/acu-data.js', 'js/acu-math.js'].map(f => fs.readFileSync(DIR + f, 'utf8')).join('\n;\n') +
  `\n;globalThis.__t = { ${EXPORTS.join(', ')} };`,
  ctx, { filename: 'acu-bundle.js' });
const {
  ACUPOINTS, ACU_ANGLE_LIMIT, ACU_ANGLE_HARD_CAP, ACU_ANGLE_MARGIN_DEG,
  ACU_GATE_BLOCK, DISC_MIN_MINOR_PX, CONF_DISC_CUN, computeCunPx,
  ACU_NORMAL_SPEC, CUN_MM, HIT_MM, acuAngleLimit, computeAcuGate,
  computeAcuConfidence, confidenceDiscPoints, TIP_DISC_OFFSET_CUN, computeAcupoint,
} = ctx.__t;

// ── ① 覆蓋率與值域 ──
const missing = ACUPOINTS.filter(a => typeof ACU_ANGLE_LIMIT[a.name] !== 'number');
ok(missing.length === 0,
  `${ACUPOINTS.length} 個穴道都在 ACU_ANGLE_LIMIT 裡有自己的上限` +
  (missing.length ? '；缺：' + missing.map(a => a.name).join('、') : ''));

const outOfRange = Object.entries(ACU_ANGLE_LIMIT)
  .filter(([, v]) => !(v > 0 && v <= ACU_ANGLE_HARD_CAP));
ok(outOfRange.length === 0,
  `所有上限都在 (0, ${ACU_ANGLE_HARD_CAP}] 度之間` +
  (outOfRange.length ? '；越界：' + outOfRange.map(([k, v]) => `${k}=${v}`).join('、') : ''));

ok(acuAngleLimit('不存在的穴道') === ACU_ANGLE_HARD_CAP,
  `沒列到的穴道回傳共同上限 ${ACU_ANGLE_HARD_CAP}°，不會是 undefined`);

// ── ② 數字與反推公式自洽 ──
// 誤差(mm) ≈ d × CUN_MM × (1−cosθ) ≤ HIT_MM  →  θ_max = acos(1 − HIT_MM/(CUN_MM·d))
// d = 該穴道公式裡「以寸為單位的偏移」向量長度，抄自 acu-data.js 的常數（見該檔表格）。
const D = {
  合谷穴: [0.826], 陽溪穴: [1.835], 陽谷穴: [1.076, 0.476], 液門穴: [0.41],
  八邪穴: [0.611, 0.362], 二間穴: [0.476], 三間穴: [0.645, 0.215],
  前谷穴: [0.34], 腕谷穴: [0.750], 後溪穴: [0.473], 魚際穴: [0.226],
  神門穴: [0.838], 太淵穴: [0.985, 0.419],
  少商穴: [0.408, 0.125], 商陽穴: [0.408, 0.125], 少衝穴: [0.408, 0.125],
  少澤穴: [0.408, 0.125], 關衝穴: [0.408, 0.125],
};
let mismatch = [];
for (const [name, parts] of Object.entries(D)) {
  const d = Math.hypot(...parts);
  const raw = Math.acos(Math.max(-1, Math.min(1, 1 - HIT_MM / (CUN_MM * d)))) * 180 / Math.PI;
  const expect = Math.min(ACU_ANGLE_HARD_CAP, Math.round(raw));
  if (ACU_ANGLE_LIMIT[name] !== expect) {
    mismatch.push(`${name}: 表=${ACU_ANGLE_LIMIT[name]} 反推=${expect}(${raw.toFixed(1)}°)`);
  }
}
ok(mismatch.length === 0,
  `${Object.keys(D).length} 個有偏移量的穴道，上限與投影縮短反推值一致` +
  (mismatch.length ? '；不符：' + mismatch.join('　') : ''));

// 純 lerp / 直接取 landmark 的穴道對投影縮短免疫 → 一律吃共同上限
const IMMUNE = ['陽池穴', '中渚穴', '小骨空', '中魁穴', '大骨空', '中衝穴', '四縫穴', '勞宮穴'];
ok(IMMUNE.every(n => ACU_ANGLE_LIMIT[n] === ACU_ANGLE_HARD_CAP),
  `${IMMUNE.length} 個純 lerp/直接取 landmark 的穴道都吃共同上限 ${ACU_ANGLE_HARD_CAP}°`);

// 偏移量最大的陽溪應該最嚴格
const strictest = Object.entries(ACU_ANGLE_LIMIT).sort((a, b) => a[1] - b[1])[0];
ok(strictest[0] === '陽溪穴',
  `最嚴格的是陽溪穴（偏移 1.835 寸，全表最大）→ 實得 ${strictest[0]} ${strictest[1]}°`);

// ── ③ 拿真實 landmark 驗證 palm vs side 的 angleDeg 真的差很多 ──
let rec = null;
for (const f of fs.readdirSync(REC).filter(f => f.endsWith('.json'))) {
  const rows = JSON.parse(fs.readFileSync(REC + f, 'utf8'));
  const hit = rows.find(r => r.landmarks && r.landmarks.length === 21 && r.isDorsal);
  if (hit) { rec = hit; console.log(`使用真實紀錄：${f} / ${hit.acupoint}`); break; }
}
if (!rec) {
  console.error('找不到可用的測試紀錄（測試記錄/*.json），跳過第 ③ 組');
} else {
  const lm = rec.landmarks, W = 640, H = 640;
  const gPalm = computeAcuGate('合谷穴', lm, W, H);   // palm 類
  const gSide = computeAcuGate('二間穴', lm, W, H);   // side 類（食指橈側緣）

  ok(gPalm && gSide, '兩類穴道都算得出閘門結果');
  ok(gPalm.kind === 'palm' && gSide.kind === 'side', 'kind 分類正確（合谷=palm、二間=side）');

  // 這是整個功能的核心事實：同一幀、同一隻手，手掌很正但側緣是切著看的。
  const diff = Math.abs(gSide.angleDeg - gPalm.angleDeg);
  ok(diff > 60,
    `同一幀裡 side 與 palm 的皮膚朝向差 ${diff.toFixed(1)}°（合谷 ${gPalm.angleDeg.toFixed(1)}° / 二間 ${gSide.angleDeg.toFixed(1)}°）` +
    ' → 用一個全域門檻管兩類穴道必定誤判');

  // 分級邊界：ok / edge / bad
  ok(['ok', 'edge', 'bad'].includes(gPalm.level) && ['ok', 'edge', 'bad'].includes(gSide.level),
    'level 只會是 ok / edge / bad');
  ok(gPalm.overBy === Math.max(0, gPalm.angleDeg - gPalm.limitDeg),
    'overBy = 超出上限幾度（沒超為 0）');
  ok((gPalm.level === 'ok') === (gPalm.hint === null),
    'level=ok 時沒有提示文字，非 ok 時一定有');
  ok(gSide.hint === null || gSide.hint.includes('手刀'),
    'side 類的提示講的是「轉成手刀」，不是「轉正」');

  // 顏色與分級對應
  const colorOf = l => (l === 'ok' ? '#00e5a0' : l === 'edge' ? '#ffaa3c' : '#ff505a');
  ok(gPalm.color === colorOf(gPalm.level) && gSide.color === colorOf(gSide.level),
    '顏色與分級對應（綠/橘/紅）');

  // ── ⭐ 兩層分工（2026-08-18）：圓盤看得到就不擋，看不到才擋 ──────────────
  ok(typeof gPalm.blocked === 'boolean' && typeof gSide.blocked === 'boolean',
    'gate 有 blocked 欄位，UI 只要看這一個布林');

  // ⭐ 核心：blocked 看的是「圓盤短軸夠不夠粗」，不是「有沒有超過 limitDeg」。
  const expectBlocked = g => ACU_GATE_BLOCK && g.discMinorPx < DISC_MIN_MINOR_PX;
  ok(gPalm.blocked === expectBlocked(gPalm) && gSide.blocked === expectBlocked(gSide),
    `blocked 由圓盤短軸決定（門檻 ${DISC_MIN_MINOR_PX}px），不是由 limitDeg 決定`);
  ok(gPalm.discVisible === (gPalm.discMinorPx >= DISC_MIN_MINOR_PX),
    'discVisible 與 discMinorPx 自洽');

  // 短軸 = 2 × 半徑 × cosθ，而 conf 就是 cosθ —— 驗證這條恆等式
  const cunPxHere = computeCunPx(lm, W, H);
  const wantMinor = 2 * CONF_DISC_CUN * cunPxHere * gSide.info.conf;
  ok(Math.abs(gSide.discMinorPx - wantMinor) < 1e-9,
    '圓盤短軸 = 2 × CONF_DISC_CUN × cunPx × cosθ');

  // ⭐ 這是整個設計要守住的那件事：超過上限、但圓盤還看得見時，**不可以擋**。
  //    （合谷上限 30°，圓盤在那個角度還是個很清楚的橢圓）
  const stillVisibleButOver = [gPalm, gSide].filter(g => g.level !== 'ok' && g.discVisible);
  ok(stillVisibleButOver.every(g => !g.blocked),
    '超過上限但圓盤還看得見時不擋 —— 讓使用者靠圓盤自己轉回來');

  if (gSide.blocked) {
    ok(gSide.hint.includes('暫不顯示'),
      '擋下時提示要講「暫不顯示」');
    ok(!gSide.hint.includes('位置僅供參考'),
      '擋下時不能出現「位置僅供參考」—— 根本沒給位置');
  }

  // margin 的語意：上限 + margin 內是 edge，超過才是 bad
  const over = gSide.angleDeg - gSide.limitDeg;
  const wantLevel = over <= 0 ? 'ok' : over <= ACU_ANGLE_MARGIN_DEG ? 'edge' : 'bad';
  ok(gSide.level === wantLevel,
    `分級門檻正確（超出 ${over.toFixed(1)}°，margin ${ACU_ANGLE_MARGIN_DEG}° → ${wantLevel}）`);

  // ── ④ 指端穴 tip（2026-08-18 新增）─────────────────────────────────────
  //
  // 這組釘住的 bug：中衝原本沒列進 ACU_NORMAL_SPEC，落到預設的 palm，
  // 於是它的圓盤跟合谷拿到**一模一樣**的角度，被畫成一個平躺在指甲上的正圓 ——
  // 等於跟使用者說「指尖端面正對著你」。指尖端面在手張開時根本看不到。
  const iZC = computeAcuConfidence('中衝穴', lm, W, H);
  const gZC = computeAcuGate('中衝穴', lm, W, H);

  ok(iZC.kind === 'tip', '中衝穴是 tip 類（指端正中），不是 palm');
  ok(ACU_NORMAL_SPEC['中衝穴'] && ACU_NORMAL_SPEC['中衝穴'].kind === 'tip',
    '中衝穴在 ACU_NORMAL_SPEC 裡有自己的 spec（不再落到預設值）');

  // ⭐ 回歸測試本體：中衝的皮膚朝向不可以再等於手掌的朝向
  const dZC = Math.abs(iZC.angleDeg - gPalm.angleDeg);
  ok(dZC > 45,
    `中衝（指端）與合谷（手背）的皮膚朝向差 ${dZC.toFixed(1)}°` +
    `（中衝 ${iZC.angleDeg.toFixed(1)}° / 合谷 ${gPalm.angleDeg.toFixed(1)}°）` +
    ' → 修好前這兩個數字是相同的');

  // 圓盤實際畫出來要是「一條線」：手張開時短軸應該遠小於長軸
  const discPts = confidenceDiscPoints(0, 0, CONF_DISC_CUN * computeCunPx(lm, W, H), iZC.basis);
  const dx = Math.max(...discPts.map(p => p.x)) - Math.min(...discPts.map(p => p.x));
  const dy = Math.max(...discPts.map(p => p.y)) - Math.min(...discPts.map(p => p.y));
  const [major, minor] = dx >= dy ? [dx, dy] : [dy, dx];
  ok(minor / major < 0.35,
    `手張開時中衝的圓盤被壓成一條線（${major.toFixed(1)} × ${minor.toFixed(1)} px，短長比 ${(minor / major).toFixed(2)}）`);

  // ⭐ 但**不可以因此擋掉點**：中衝的座標就是 lm[12]，公式偏移量為 0，
  //    角度再斜也不會讓它偏。擋掉等於拿一把不適用的尺去量。
  ok(gZC.blocked === false, '指端穴豁免角度閘門 —— 手一張開就必定接近 90°，擋掉它是誤擋');
  ok(gZC.level === 'ok' && gZC.hint === null,
    '指端穴不出「請把手掌攤平」這種提示（那個姿勢對它沒有意義）');

  const tipNames = Object.keys(ACU_NORMAL_SPEC).filter(n => ACU_NORMAL_SPEC[n].kind === 'tip');
  ok(tipNames.every(n => computeAcuGate(n, lm, W, H).blocked === false),
    `${tipNames.length} 個 tip 類穴道都不會被角度擋下`);

  // ── ⑤ tip 圓盤外推（2026-08-18）──────────────────────────────────────
  //
  // 釘住的問題：圓盤以穴道點為圓心，而中衝的點就在指尖，圓盤半徑 7.4mm 會往回
  // 蓋住整片指甲，看起來像「穴道在指甲裡面」。往骨軸外推一小段解決。
  const cunPxTip = computeCunPx(lm, W, H);
  const offPx = TIP_DISC_OFFSET_CUN * cunPxTip;
  const dxTip = offPx * iZC.normal.x, dyTip = offPx * iZC.normal.y;
  const shift = Math.hypot(dxTip, dyTip);

  ok(TIP_DISC_OFFSET_CUN * CUN_MM > 2 && TIP_DISC_OFFSET_CUN * CUN_MM < 8,
    `外推量 ${(TIP_DISC_OFFSET_CUN * CUN_MM).toFixed(1)}mm 在合理範圍（2–8mm）`);

  // 手張開時 tip 幾乎切著看 → 法向量幾乎躺在畫面上 → 外推量接近滿額
  ok(shift > offPx * 0.8,
    `手張開時圓盤確實被推開 ${shift.toFixed(1)}px（滿額 ${offPx.toFixed(1)}px）`);

  // ⭐ 核心：外推是「法向量的正投影」，所以指尖轉向鏡頭時必須自動縮到 0 ——
  //    不是靠額外的 if 判斷。這裡直接用一個沿視線的假法向量檢查那條恆等式。
  const shiftAt = n => Math.hypot(offPx * n.x, offPx * n.y);
  ok(shiftAt({ x: 0, y: 0, z: 1 }) < 1e-9,
    '法向量沿視線（指尖對著鏡頭）時外推量為 0 —— 正投影自然的結果');
  ok(Math.abs(shift - offPx * Math.hypot(iZC.normal.x, iZC.normal.y)) < 1e-9,
    '外推量 = TIP_DISC_OFFSET_CUN × cunPx × sin(偏離角)');

  // ⚠️ 外推只動圓盤，穴道點必須還在 lm[12]（WHO 定義的位置，不能為了好看而挪）
  // ⚠️ computeAcupoint 的第 5 參數收的是**物件** `{label}` 不是字串（踩過一次）。
  //    中衝的公式是 lm[12] 直取，跟左右手無關，所以這裡給哪一手都不影響結果。
  const ptZC = computeAcupoint('中衝穴', lm, W, H, { label: 'Right' });
  ok(ptZC && Math.abs(ptZC[0].x - lm[12].x * W) < 1e-6 && Math.abs(ptZC[0].y - lm[12].y * H) < 1e-6,
    '穴道點仍然精確等於 lm[12]，沒有被圓盤外推帶著跑');
}

// side 類穴道在 ACU_NORMAL_SPEC 與 ACU_ANGLE_LIMIT 兩張表要對得上
const sideNames = Object.keys(ACU_NORMAL_SPEC).filter(n => ACU_NORMAL_SPEC[n].kind === 'side');
ok(sideNames.every(n => typeof ACU_ANGLE_LIMIT[n] === 'number'),
  `${sideNames.length} 個 side 類穴道都有自己的角度上限`);

console.log(fail ? `\n${fail} 項失敗` : '\n全部通過');
process.exit(fail ? 1 : 0);
