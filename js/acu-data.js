// ── ACUPOINT CONFIG ───────────────────────────────────────────────────────────

// 標注參考資料（照片模式側邊參考框用）：
//   locate — WHO 標準解剖定位，抄自 `資料存放區/穴道資料庫_整合版.md`（來源：醫砭中醫資料庫）
//   ref    — `assets/acu-ref/` 下的參考圖檔名，抄自 `自製穴道位置/`（原中文檔名已轉拼音）
// 新增的 6 穴（少商/商陽/少衝/少澤/關衝/勞宮）兩者都缺，UI 顯示「尚無參考資料」。

const ACUPOINTS = [
  // 原有穴道（20 個）
  { name: "合谷穴", code: "LI4", side: "dorsal", ref: "hegu.png",
    locate: "手背第 1～2 掌骨間，第 2 掌骨橈側的中點。拇食兩指並攏時，虎口部隆起最高處。" },
  { name: "陽池穴", code: "SJ4", side: "dorsal", ref: "yangchi.png",
    locate: "腕背橫紋中，指伸肌腱的尺側緣凹陷處" },
  { name: "陽溪穴", code: "LI5", side: "dorsal", ref: "yangxi.png",
    locate: "腕背橈側，拇短伸肌腱與拇長伸肌腱之間凹陷處；拇指上翹時位於「鼻煙窩」中" },
  { name: "陽谷穴", code: "SI5", side: "dorsal", ref: "yanggu.png",
    locate: "手腕尺側，尺骨莖突與三角骨之間凹陷處；屈腕時當腕中間橫紋尺側端" },
  { name: "液門穴", code: "SJ2", side: "dorsal", ref: "yemen.png",
    locate: "手背第 4～5 指間，指蹼緣後方赤白肉際處" },
  { name: "中渚穴", code: "SJ3", side: "dorsal", ref: "zhongzhu.png",
    locate: "手背第 4～5 掌骨間，掌指關節後方凹陷處（掌骨間隙前 1/3 折點）" },
  { name: "小骨空", code: "", side: "dorsal", ref: "xiaogukong.png",
    locate: "小指背側近側指間關節的中點處" },
  { name: "中魁穴", code: "", side: "dorsal", ref: "zhongkui.png",
    locate: "中指背側，近側指間關節的中點處（中指第一指間關節突出處）" },
  { name: "大骨空", code: "", side: "dorsal", ref: "dagukong.png",
    locate: "拇指背側指間關節的中點處" },
  { name: "八邪穴", code: "", side: "dorsal", ref: "baxie.png",
    locate: "手背側微握拳，第 1～5 指間指蹼緣後方赤白肉際處，左右共八穴" },
  { name: "二間穴", code: "LI2", side: "dorsal", skipHullClamp: true, ref: "erjian.png",
    locate: "微握拳，食指橈側緣第 2 掌指關節前方赤白肉際凹陷處" },
  { name: "三間穴", code: "LI3", side: "dorsal", skipHullClamp: true, ref: "sanjian.png",
    locate: "微握拳，食指第 2 掌指關節後方橈側凹陷處" },
  { name: "前谷穴", code: "SI2", side: "dorsal", skipHullClamp: true, ref: "qiangu.png",
    locate: "小指尺側，第 5 掌指關節前方赤白肉際處；握拳時當掌指橫紋尺側端" },
  { name: "腕谷穴", code: "SI4", side: "dorsal", skipHullClamp: true, ref: "wangu.png",
    locate: "手掌尺側赤白肉際，第 5 掌骨基底與鉤骨之間凹陷處；屈腕時當腕遠側橫紋尺側端" },
  { name: "後溪穴", code: "SI3", side: "dorsal", skipHullClamp: true, ref: "houxi.png",
    locate: "小指第 5 掌指關節後緣，握拳時掌橫紋尺側端赤白肉際處" },
  { name: "中衝穴", code: "PC9", side: "palm", ref: "zhongchong.png",
    locate: "中指末節尖端中央，距指甲游離緣約 0.1 寸" },
  { name: "魚際穴", code: "LU10", side: "palm", ref: "yuji.png",
    locate: "第 1 掌指關節後凹陷處，第 1 掌骨中點橈側赤白肉際" },
  { name: "神門穴", code: "HT7", side: "palm", ref: "shenmen.png",
    locate: "腕掌橫紋上，尺側腕屈肌腱橈側凹陷處，豌豆骨後方" },
  { name: "太淵穴", code: "LU9", side: "palm", ref: "taiyuan.png",
    locate: "腕掌側橫紋橈側，橈動脈搏動處；舟骨結節外上方，橈側腕屈肌腱與拇長展肌腱之間" },
  { name: "四縫穴", code: "", side: "palm", ref: "sifeng.png",
    locate: "第 2～5 指掌側，近端指間關節橫紋中央，一手四穴" },

  // 新增穴道（6 個，2026-07-12 新加，公式未定案）
  // 甲角旁的 5 個指尖穴都在指甲那一面 → side = dorsal（含少衝穴，雖屬心經）
  { name: "少商穴", code: "LU11", side: "dorsal", type: "new", skipHullClamp: true },
  { name: "商陽穴", code: "LI1", side: "dorsal", type: "new", skipHullClamp: true },
  { name: "少衝穴", code: "HT9", side: "dorsal", type: "new", skipHullClamp: true },
  { name: "少澤穴", code: "SI1", side: "dorsal", type: "new", skipHullClamp: true },
  { name: "關衝穴", code: "TE1", side: "dorsal", type: "new", skipHullClamp: true },
  { name: "勞宮穴", code: "PC8", side: "palm", type: "new" },
];

let selectedAcupoint = "合谷穴";

// ── ACUPOINT MATH ─────────────────────────────────────────────────────────────

const FORMULA_VERSION = "v35";

// ── VERSION PRESETS (v5–v25 parameter snapshots) ──────────────────────────────
// Coverage rates are against 14 standard test photos (學長 dataset, threshold 5mm).
const VERSION_PRESETS = {
  v5: {
    label: "v5（42.9%）",
    HG_CUN: 0.4,
    YC_T: 0.78,
    YX_T: 0.28,
    YG_T: 0.38,
    YM_D: 0.06,
    ZZ_T: 0.28,
    TY_T: 0.2,
    SM_T: 0.12,
    YJ_T: 0.5,
    DG_EXT: 0,
    ZC_EXT: 0.25,
  },
  v10: {
    label: "v10（64.3%）",
    HG_CUN: 0.4,
    YC_T: 0.78,
    YX_T: 0.55,
    YG_T: 0.55,
    YM_D: 0.18,
    ZZ_T: 0.28,
    TY_T: 0.55,
    SM_T: 0.55,
    YJ_T: 0.29,
    DG_EXT: 0.25,
    ZC_EXT: 0.25,
  },
  v15: {
    label: "v15（71.4%）",
    HG_CUN: 0.4,
    YC_T: 0.78,
    YX_T: 0.4,
    YG_T: 0.35,
    YM_D: 0.18,
    ZZ_T: 0.28,
    TY_T: 0.42,
    SM_T: 0.36,
    YJ_T: 0.35,
    DG_EXT: 0.25,
    ZC_EXT: 0.25,
  },
  v20: {
    label: "v20（85.7%）",
    HG_CUN: 0.4,
    YC_T: 0.78,
    YX_T: 0.4,
    YG_T: 0.45,
    YM_D: 0.18,
    ZZ_T: 0.28,
    TY_T: 0.42,
    SM_T: 0.36,
    YJ_T: 0.55,
    DG_EXT: 0.25,
    ZC_EXT: 0.25,
    YX_BACK: 0.12,
    TY_BACK: 0.12,
    YG_PERP: 0,
    YJ_PERP: 0,
  },
  v25: {
    label: "v25（92.9%）",
    HG_CUN: 0.4,
    YC_T: 0.78,
    YX_T: 0.4,
    YG_T: 0.5,
    YM_D: 0.18,
    ZZ_T: 0.28,
    TY_T: 0.42,
    SM_T: 0.36,
    YJ_T: 0.5,
    DG_EXT: 0.25,
    ZC_EXT: 0.25,
    YX_BACK: 0.12,
    TY_BACK: 0.12,
    YG_PERP: 0,
    YJ_PERP: -0.2,
  },
  v34: "v34_raw", // v34 raw formula with v34 params
  v35: null,      // v35 current formula (latest)
};

// v34 parameter snapshot (ten+han calibrated, 2026-05-20)
const V34_PARAMS = {
  YX_CUN: 1.75,
  WG_T: 0.35,
  WG_ULNAR: 0.59,
  HX_T: 0.15,
  HX_ULNAR: 0.46,
};

let selectedFormulaVersion =
  localStorage.getItem("formulaVersion") || "v35";

// 資料來源標記（self/friend/dataset/doctor/internet）——標注記錄用這個分辨
// GT 的可信等級，避免不同來源的資料混在一起看不出哪筆該信。
let selectedDataSource = localStorage.getItem("dataSource") || "self";

// 盲測模式：開啟時批量流程先進標注、不先跑 AI，避免標注者看過 AI 點位後
// 下意識往那個點靠（anchoring），汙染 GT 獨立性。只影響單點穴道的批量自動流程，
// 多點穴道（如八邪穴）在標注前需要先知道 AI 給幾個點才能收集，不支援盲測。
let blindMode = localStorage.getItem("blindMode") === "1";

// 略過傾角擋下：照片模式預設在傾角 > TILT_MAX_DEG 時擋下不定位（避免拿角度失真的輸入硬湊精度）。
// 開啟此開關後照樣定位，供「奇異手勢/大傾角穴道偏差實驗」使用。傾角仍會記錄進 photo.tiltDeg，
// 方便事後按角度分層分析。⚠ 開啟時算出的座標角度失真、不可信，只用於偏差研究，勿當正式精度。
let ignoreTiltGate = localStorage.getItem("ignoreTiltGate") === "1";

// ── 局部視角信心度（2026-07-24 新增）──────────────────────────────────────────
//
// 為什麼需要這個：`computeHandTiltDeg()` 算的是「整隻手掌」歪多少，但每個穴道
// 所在的那一小塊皮膚，朝向根本不一樣。2026-07-24 實測 ten/han/lun 三隻手：
//
//     照片        整體掌面傾角      二間穴所在皮膚的朝向
//     ten_back        6.4°                87.0°
//     han_back        8.7°                89.1°
//     lun_back       12.3°                87.1°
//
// 右邊那欄的意思是：手明明正對鏡頭，但二間穴那塊皮膚是「切著看」的——像你看
// 一根圓柱，正面很清楚，但最側邊那條輪廓線永遠看不清。二間就在那條線上。
// 現行系統只有一個全域 TILT_MAX_DEG = 25° 門檻，對所有穴道一視同仁，
// 完全反映不出這件事。
//
// 這張表給每個穴道定義它自己的「皮膚法向量」怎麼算：
//   kind:"palm"（預設，不用寫）── 法向 = 手掌平面法向量。手背/手心正中的穴道用這個。
//   kind:"side"                ── 法向 = 側向量（垂直於手掌法向、也垂直於指定的骨軸）。
//                                 位於手指/手掌「側緣」的穴道用這個。
//   axis:[a, b]                ── 算側向量時用哪根骨軸，值是兩個 landmark 編號。
//
// ⚠ 這裡的分類依據是穴道的解剖位置（側緣 vs 正面），不是實測擬合出來的。
const ACU_NORMAL_SPEC = {
  // ── 橈側緣（拇指那一側）────────────────────────────────
  二間穴: { kind: "side", axis: [5, 6] }, // 食指橈側緣，第2掌指關節前
  三間穴: { kind: "side", axis: [5, 6] }, // 食指橈側，第2掌指關節後
  商陽穴: { kind: "side", axis: [7, 8] }, // 食指遠節橈側甲角
  少商穴: { kind: "side", axis: [3, 4] }, // 拇指橈側甲角
  陽溪穴: { kind: "side", axis: [0, 9] }, // 腕背橈側「鼻煙窩」

  // ── 尺側緣（小指那一側）────────────────────────────────
  前谷穴: { kind: "side", axis: [17, 18] }, // 小指尺側，第5掌指關節前
  後溪穴: { kind: "side", axis: [17, 18] }, // 小指尺側，第5掌指關節後
  腕谷穴: { kind: "side", axis: [0, 17] }, // 手掌尺側緣，第5掌骨基底
  少澤穴: { kind: "side", axis: [19, 20] }, // 小指遠節尺側甲角
  少衝穴: { kind: "side", axis: [19, 20] }, // 小指遠節橈側甲角（同軸，側緣性質相同）
  關衝穴: { kind: "side", axis: [15, 16] }, // 無名指尺側甲角
  陽谷穴: { kind: "side", axis: [0, 9] }, // 腕背尺側，尺骨莖突與三角骨間

  // 其餘穴道（合谷/陽池/液門/中渚/八邪/大骨空/小骨空/中魁/手心各穴）
  // 沒列在這裡 → 預設 kind:"palm"，法向就是手掌平面法向量。
};

// ── 兩面皆可定位的穴道（2026-07-26 修正）─────────────────────────────────────
//
// 這些穴道長在手指/手掌的「側緣」——像書脊那一面。書脊不屬於封面也不屬於封底，
// 從哪一面看都在那裡，所以手背朝鏡頭或手心朝鏡頭都應該能定位。
//
// 原本它們在 ACUPOINTS 裡全標 side:"dorsal"，被正反面閘門擋成只有手背能用。
// 用 2026-07-26 第2份錄製（316 幀，含 78 幀手心）實測驗證：
//   手掌正對鏡頭時，手心 32/32 幀(100%)、手背 140/143 幀(98%) 方向正確。
//   少數算錯的集中在手轉到大角度時（食指根到中指根在畫面上只剩 10px，方向糊掉），
//   與看哪一面無關。
// 之所以能兩面通用，是因為這些公式的方向向量（如二間的 lm[5]−lm[9]）是從 landmark
// 自己算出來的純幾何量，手翻面時 landmark 一起翻，方向自動跟著對。
//
// ⚠ 沒列進來的兩個側緣穴：
//   陽溪、陽谷 —— 這兩個是腕背的凹陷（鼻煙壺那類），是手背側的立體結構，
//   從手心看被手掌擋住，不是單純的側緣。維持只有手背可定位。
// ⚠ 合谷等 palm 類穴道更不能列進來：虎口肌肉隆起是手背側結構，從手心看不到。
const BILATERAL_ACUPOINTS = new Set([
  "二間穴", "三間穴", "商陽穴", "少商穴", // 橈側（食指、拇指）
  "前谷穴", "後溪穴", "少澤穴", "少衝穴", "關衝穴", "腕谷穴", // 尺側（小指、無名指、手掌尺緣）
]);

// 信心度分級門檻（facing = |法向量的 z 分量|，1=正對鏡頭、0=完全切面）
//   高 conf ≥ 0.70（夾角 ≤ 45°）── 這塊皮膚大致攤平面對鏡頭，定位可信
//   中 conf ≥ 0.40（夾角 ≤ 66°）── 已明顯斜看，定位開始失真
//   低 conf <  0.40（夾角 > 66°）── 切著看，定位不可信
// ⚠ 這兩個門檻是依幾何直覺訂的，尚未用「角度 vs 實測誤差」曲線校準過。
//   要校準需拍 A 序列（手背慢慢轉到手刀，每個角度都標注真值）。
const CONF_HIGH = 0.7;
const CONF_MID = 0.4;

// 信心圓盤半徑（單位：寸）。沿用 houxi_3d_demo.py 的 0.42，實際畫出來約 0.42×cunPx 像素。
const CONF_DISC_CUN = 0.42;

// 信心測試模式：開啟後（①攝像頭/照片模式畫出信心圓盤 ②顯示逐穴道信心面板
// ③後台每 100ms 記一筆到 confLog，可匯出 JSON）。預設關閉，不影響現有流程。
let confidenceMode = localStorage.getItem("confidenceMode") === "1";

// 後台即時記錄緩衝區。放記憶體不放 localStorage：即時錄製一分鐘就上千筆，
// localStorage 只有 ~5MB 會爆；且這是實驗數據，用完匯出即可，不需要跨 session 保留。
// ⚠ 重新整理頁面會清空，錄完記得按「匯出」。
let confLog = [];
const CONF_LOG_MAX = 20000; // 上限，避免長時間錄製吃爆記憶體（約 33 分鐘 @10Hz）
const CONF_LOG_INTERVAL_MS = 100; // 限流：最快 10Hz，不然每幀都記會塞太多重複資料

// ── 360° 角度覆蓋（2026-07-26 新增）─────────────────────────────────────────
//
// ⚠ 為什麼要有這個：conf = |法向量 z|、angleDeg = acos(conf)，這兩個是同一個數字
//   的兩種寫法（恆等式）。畫「angleDeg vs conf」保證得到一條完美 cos 曲線，
//   跟手、跟 MediaPipe 表現、跟準不準完全無關 —— 那不是「信任值」，是幾何量。
//
//   真正能當信任值的是下面三個「模型自己會露餡」的訊號，全部在 confLog 逐筆記錄：
//     ① handScore  — MediaPipe 自報的 handedness 信心（模型說它有多確定）
//     ② lm 21 點原始座標 — 拿去離線算「手停住時點抖多少」（點在抖＝模型在猜）
//     ③ 骨長比例   — 同一隻手骨長比不該隨角度變，變了就是 landmark 在漂
//   ①②③ 對角度的關係才是實驗要找的東西，而且都不需要人工真值。
//
// 覆蓋格：極角(polar) 0~180° 每 15° 一箱共 12 箱 × 方位(azimuth) 每 30° 一箱共 12 箱。
// 面板即時顯示每格已錄幾筆，錄製時就知道哪個角度還沒轉到，不用錄完才發現有洞。
const CONF_POLAR_BIN_DEG = 15;
const CONF_AZIM_BIN_DEG = 30;
const CONF_BIN_TARGET = 10; // 每格至少幾筆才算「錄夠」（10 筆 @10Hz = 停留 1 秒）
let confCoverage = {}; // key = "polarBin_azimBin" → 筆數

// ── 手掌信任值基準（2026-07-26）─────────────────────────────────────────────
//
// 骨長比例是「這隻手」的固有性質，每個人不同，所以要逐人校準一次。
// 校準結果存 localStorage：同一個人下次開網頁不用重新校（除非換人）。
// 校準方式見 calibrateHandBaseline()：手正對鏡頭停 2 秒。
let handBaseline = null;
try {
  const _hb = localStorage.getItem("handBaseline");
  if (_hb) handBaseline = JSON.parse(_hb);
} catch (e) {
  handBaseline = null; // 存壞了就當沒校準過，重校即可
}
// 校準要收集幾幀，以及每幀至少間隔多久。
// ⚠ 間隔很重要：2026-07-26 實測，收「連續 2 秒」的幀會讓雜訊底線被低估到 2.0%
//   （只看到一個瞬間的姿勢），結果所有信任值被壓低、曲線還會反轉（0° 只剩 0.58）。
//   改成分散取樣後底線回到 8.3%，曲線單調遞減、0° = 1.00。
//   所以校準時要請使用者「手輕輕小幅度移動」，不是完全靜止。
const TRUST_CALIB_FRAMES = 30;
const TRUST_CALIB_INTERVAL_MS = 150; // 30 幀 × 150ms ≈ 4.5 秒

// ── FORMULA PARAMETERS (v35) ──────────────────────────────────────────────────
//
// 縮寫對照（參數名後綴含義）：
//   _T     = lerp ratio（0–1 插值比，無單位，不受手大小/距離影響）
//   _CUN   = 寸數偏移（以 cunPx 為基準單位，見 computeCunPx）
//   _U     = ulnar direction（尺側方向分量）
//   _F     = forward direction（手指方向，lm0→lm9）
//   _RAD   = radial direction（橈側方向，lm17→lm5）
//   _PROX  = proximal direction（近腕方向）
//   _EXT   = extension ratio（超過 landmark 的延伸比例）
//   _PERP  = perpendicular offset（垂直主方向偏移，單位：cun）
//   _FWD   = forward offset（八邪穴用，lm0→lm9 方向）
//
// 座標系：MediaPipe 正規化座標（0–1），* W 或 * H 轉為畫布像素。
// 同身寸換算：cunPx = dist(lm[2], lm[3]) in pixels ≈ 1 寸。

// ── 手背穴（dorsal）──────────────────────────────────────────────────────────

// 合谷穴 LI4 — 起點 mid(lm[0],lm[5])，往 lm[2] 方向偏移 HG_CUN 寸
const HG_CUN = 0.826;   // 中指換尺×1.132保位 2026-07-18；拇指舊值 0.73（refit對照 0.81）

// 陽池穴 SJ4 — lerp( mid(lm[9],lm[13]), lm[0] )
const YC_T = 0.78;

// 陽溪穴 LI5 — lm[0] + 橈側 unit-vector × YX_CUN 寸
const YX_CUN = 1.835;   // cun radial；中指換尺×1.132保位；拇指舊值 1.621（refit對照 1.491）

// 陽谷穴 SI5 — lm[0] + 純尺側方向(⊥手軸) × YG_U + 手軸前向 × YG_F
const YG_U = 1.076;     // cun ulnar；中指換尺×1.132保位；拇指舊值 0.95（refit對照 1.18）
const YG_F = 0.476;     // cun forward (lm[0]→lm[9])；中指換尺×1.132保位；拇指舊值 0.42

// 液門穴 SJ2 — mid(lm[13],lm[17]) 向 lm[0] 方向前推 YM_CUN 寸
const YM_D = 0.18;      // legacy only（v5–v25 用的 lerp ratio）
const YM_CUN = 0.41;    // cun forward；⚠例外採 refit（中指81筆GT）非縮放——因拇指舊值 0.55 是未校準猜測，縮放無意義。對比見 記錄控制/縮放vs重擬對比_20260718.md

// 中渚穴 SJ3 — lerp( mid(lm[13],lm[17]), lm[0] )
const ZZ_T = 0.12;

// 大骨空 — lm[3] + (lm[3]-lm[2]) × DG_EXT（0 = 直接取 lm[3]）
const DG_EXT = 0.0;

// 八邪穴 — 四個指縫節點
const BX1_T = 0.25;     // lerp(lm[2], lm[5])，拇-食指縫，calibrated ten_back 5-19
const BX_FWD = 0.611;   // cun forward，食/中/無名指縫共用；中指換尺×1.132保位；拇指舊值 0.54（refit對照 0.61）
const BX4_ULNAR = 0.362;// cun ulnar，無名-小指縫額外偏移；中指換尺×1.132保位；拇指舊值 0.32（refit對照 0.39）

// 二間穴 LI2 — lerp(lm[5],lm[6]) + 橈側偏移
const EJ_T = 0.45;      // lerp(lm[5], lm[6]), calibrated ten_back 5-19
const EJ_RAD = 0.476;   // cun radial；中指換尺×1.132保位；拇指舊值 0.42（refit對照 0.37）

// 三間穴 LI3 — lm[5] + 橈側 × SJ3_CUN + 近腕 × SJ3_PROX
const SJ3_CUN = 0.645;  // cun radial；中指換尺×1.132保位；拇指舊值 0.57（refit對照 0.55）
const SJ3_PROX = 0.215; // cun proximal；中指換尺×1.132保位；拇指舊值 0.19（refit對照 0.22）

// 前谷穴 SI2 — lerp(lm[17],lm[18]) + CCW 垂直尺側偏移
const QG_T = 0.96;      // lerp(lm[17], lm[18]), calibrated ten_back 5-19
const QG_ULNAR = 0.34;  // cun ulnar (CCW perp)；中指換尺×1.132保位；拇指舊值 0.3（refit對照 0.3）

// 腕谷穴 SI4 — lerp(lm[17],lm[0]) + CW 垂直尺側偏移
const WG_T = 0.502;
const WG_ULNAR = 0.750; // cun ulnar；中指換尺×1.132保位；拇指舊值 0.662（refit對照 0.712）

// 後溪穴 SI3 — lerp(lm[17],lm[0]) + CW 垂直尺側偏移（起點比腕谷更靠 lm[17]）
const HX_T = 0.041;
const HX_ULNAR = 0.473; // cun ulnar；中指換尺×1.132保位；拇指舊值 0.418（refit對照 0.468）

// ── 手心穴（palm）────────────────────────────────────────────────────────────

// 中衝穴 PC9 — WHO：指端中央 = lm[12]，無需延伸
const ZC_EXT = 0;

// 魚際穴 LU10 — lerp(lm[0],lm[2]) + 向掌心 CW 垂直偏移
const YJ_T = 0.72;      // lerp(lm[0], lm[2])；v34 改用 lm[0]（lm[1] 拇指根活動量大）
const YJ_PERP = -0.226; // cun perp (CW, toward palm center)；中指換尺×1.132保位（無GT）；拇指舊值 -0.2

// 神門穴 HT7 — lm[0] + 尺側 unit-vector × SM_CUN 寸
const SM_CUN = 0.838;   // cun ulnar (lm[17]-lm[5] dir)；中指換尺×1.132保位（無GT）；拇指舊值 0.74

// 太淵穴 LU9 — lm[0] + 橈側 × TY_CUN 寸 + 近腕 × TY_BCUN 寸
const TY_CUN = 0.985;   // cun radial；中指換尺×1.132保位（無GT）；拇指舊值 0.87
const TY_BCUN = 0.419;  // cun back-wrist；中指換尺×1.132保位（無GT）；拇指舊值 0.37

// ── 待定穴道（新增 2026-07-12，公式未定案）─────────────────────────────────────
//
// 指尖穴（甲角旁）共用框架：位置 = 指尖 landmark
//                             + 指軸方向(tip→dip) × _PROX 寸
//                             + 橈側方向(lm[9]→lm[5]) × _LAT 寸（負值 = 尺側）
// _LAT 目前是硬編常數；長期規劃改用 CV 皮膚輪廓量出手指實際側緣，取「指軸點↔輪廓邊緣」中點，
// 讓橫向偏移自動隨手指粗細調整，不需為每個人調常數（同八邪穴 CV 谷底的做法）。

// 少商穴 LU11 — 拇指橈側甲角旁（⚠ 無 GT，數值沿用商陽穴，純猜測）
const SS_PROX = 0.408;  // 中指換尺×1.132保位（無GT）；拇指舊值 0.36
const SS_LAT = 0.125;   // 中指換尺×1.132保位；拇指舊值 0.11

// 商陽穴 LI1 — 食指橈側甲角旁
const SY_PROX = 0.408;  // 中指換尺×1.132保位（原 calibrated ten_back 1筆 overfit）；拇指舊值 0.36
const SY_LAT = 0.125;   // 橈側；中指換尺×1.132保位；拇指舊值 0.11

// 少衝穴 HT9 — 小指橈側甲角旁（⚠ 無 GT，純猜測）
const SC_PROX = 0.408;  // 中指換尺×1.132保位（無GT）；拇指舊值 0.36
const SC_LAT = 0.125;   // 橈側；中指換尺×1.132保位；拇指舊值 0.11

// 少澤穴 SI1 — 小指尺側甲角旁（⚠ 無 GT，純猜測）
const SZ_PROX = 0.408;  // 中指換尺×1.132保位（無GT）；拇指舊值 0.36
const SZ_LAT = -0.125;  // 尺側；中指換尺×1.132保位；拇指舊值 -0.11

// 關衝穴 TE1 — 無名指尺側甲角旁（⚠ 無 GT，純猜測）
const GC_PROX = 0.408;  // 中指換尺×1.132保位（無GT）；拇指舊值 0.36
const GC_LAT = -0.125;  // 尺側；中指換尺×1.132保位；拇指舊值 -0.11

// 勞宮穴 PC8 — 掌心，lerp(lm[0], lm[9])（⚠ 無 GT，t=0.5 為暫定值，解剖上約 0.55–0.60）
const LG_T = 0.5;

// ── 命中閾值 ─────────────────────────────────────────────────────────────────

// 一寸的實際長度（mm），用於 px → mm 換算
// ⚠ 暫定值，非實測（見 記錄控制/交接文件_20260718 §1：從來沒有物理參考量過真 mm）。
// 中指換尺後 = 20 × mean(中指cunPx/拇指cunPx=0.8832) = 17.66，保持與拇指時代相同物理尺度，
// 使命中率不因換尺假摔。真 mm 待拍照放實體參考物或改報掌寬正規化誤差後再定。
// 拇指時代舊值：20（同樣暫定，量的是拇指近節指骨長 ~30mm 卻宣告 20mm）。
const CUN_MM = 17.66;

// AI 定位與人工標注距離 ≤ 此值視為命中
// 沿革：5mm（2026-05-16）→ 4mm → 2mm（2026-07-12，用戶要求收緊）
// ⚠ 舊記錄裡存的 hit 欄位是用當時的閾值算的，驗證報告的覆蓋率會混到舊標準
const HIT_MM = 2;

// ── 傾斜閾值 ─────────────────────────────────────────────────────────────────

// 手掌法向量與相機 z 軸夾角超過此值時暫停定位
// MediaPipe z 精度約 ±5-10°，設 5° 太嚴會誤觸發，取 25°
const TILT_MAX_DEG = 25;

// ── SYMPTOM / ACUPOINT DATA ───────────────────────────────────────────────────

const IMPLEMENTED = new Set([
  "合谷穴",
  "陽池穴",
  "陽溪穴",
  "陽谷穴",
  "液門穴",
  "中渚穴",
  "小骨空",
  "中魁穴",
  "大骨空",
  "中衝穴",
  "魚際穴",
  "神門穴",
  "太淵穴",
  "四縫穴",
  "八邪穴",
  "二間穴",
  "三間穴",
  "前谷穴",
  "腕谷穴",
  "後溪穴",
]);

const SYMPTOM_MAP = [
  {
    name: "緩解目痛",
    icon: "eye",
    acupoints: ["大骨空", "小骨空", "陽溪穴", "三間穴"],
  },
  {
    name: "緩解感冒症狀",
    icon: "thermometer",
    acupoints: [
      "合谷穴",
      "四縫穴",
      "太淵穴",
      "魚際穴",
      "前谷穴",
      "三間穴",
      "二間穴",
    ],
  },
  {
    name: "腸胃不適",
    icon: "activity",
    acupoints: ["合谷穴", "四縫穴", "中魁穴"],
  },
  {
    name: "緩解牙痛",
    icon: "zap",
    acupoints: ["合谷穴", "陽溪穴", "二間穴", "三間穴"],
  },
  {
    name: "緩解頭痛",
    icon: "brain",
    acupoints: [
      "合谷穴",
      "陽池穴",
      "陽溪穴",
      "液門穴",
      "中渚穴",
      "前谷穴",
      "腕谷穴",
    ],
  },
  { name: "改善失眠", icon: "moon", acupoints: ["神門穴", "後溪穴"] },
  { name: "緩解胸痛", icon: "heart", acupoints: ["太淵穴"] },
  {
    name: "緩解耳鳴",
    icon: "volume-x",
    acupoints: [
      "陽池穴",
      "陽溪穴",
      "陽谷穴",
      "液門穴",
      "中渚穴",
      "後溪穴",
    ],
  },
  {
    name: "緩解腕痛",
    icon: "move",
    acupoints: ["陽池穴", "陽溪穴", "陽谷穴", "腕谷穴"],
  },
  { name: "昏迷急救", icon: "shield", acupoints: ["中衝穴"] },
  { name: "中暑", icon: "sun", acupoints: ["中衝穴"] },
  { name: "放鬆手指", icon: "hand", acupoints: ["八邪穴"] },
  {
    name: "緩解喉嚨痛",
    icon: "mic-off",
    acupoints: ["二間穴", "三間穴"],
  },
];

const ACUPOINT_DETAIL = {
  合谷穴: { en: "Hegu", side: "dorsal", note: "懷孕忌按" },
  陽池穴: { en: "Yangchi", side: "dorsal" },
  陽溪穴: { en: "Yangxi", side: "dorsal" },
  陽谷穴: { en: "Yanggu", side: "dorsal" },
  液門穴: { en: "Yemen", side: "dorsal" },
  中渚穴: { en: "Zhongzhu", side: "dorsal" },
  小骨空: { en: "Xiaogukong", side: "dorsal" },
  中魁穴: { en: "Zhongkui", side: "dorsal" },
  大骨空: { en: "Dagukong", side: "dorsal" },
  中衝穴: { en: "Zhongchong", side: "palm" },
  魚際穴: { en: "Yuji", side: "palm" },
  神門穴: { en: "Shenmen", side: "palm" },
  太淵穴: { en: "Taiyuan", side: "palm" },
  四縫穴: { en: "Sifeng", side: "palm", note: "從食指開始輪流按壓" },
  三間穴: { en: "Sanjian", side: "dorsal" },
  二間穴: { en: "Erjian", side: "dorsal" },
  前谷穴: { en: "Qiangu", side: "dorsal" },
  腕谷穴: { en: "Wangu", side: "dorsal" },
  後溪穴: { en: "Houxi", side: "dorsal" },
  八邪穴: { en: "Baxie", side: "dorsal" },
};

let currentSymptom = null;
let cameraBackTo = "symptoms";
