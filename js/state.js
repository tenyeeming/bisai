// ═══════════════════════════════════════════════════════════════════
// 全站狀態與存檔
//
// 分兩種：
//   state.selected*     → 這一次療程的暫時選擇，關掉分頁就沒了
//   偏好設定（提醒、節奏、預設流程、字級）→ localStorage
//
// ⚠️ 2026-09-24 起網頁**不存按摩紀錄**：連續天數、小人等級、圖冊收集解鎖全部拿掉。
//    理由（用戶）：網頁沒有資料庫，localStorage 只活在單一瀏覽器，換裝置／清快取就不見，
//    而本系統的核心是多設備使用 —— 留著只會讓人問「我昨天按的怎麼沒了」。
//    養成系統只在 App 有。偏好設定不同：換裝置沒了只是回預設，不會誤導，所以保留。
// ═══════════════════════════════════════════════════════════════════

const LS = {
  notify:  'notifyEnabled',
  notifyTime: 'notifyTime',// 'HH:MM'
  notifyPlan: 'notifyPlan',// { mode, symptoms, region }：每天提醒你按什麼
  strict:  'strictGate',
  flow:    'flowSettings', // 療程節奏（見下）
  presets: 'acuPresets',   // 預設流程：一組穴道＋一套節奏（見下）
  fontScale: 'fontScale',  // 'small' | 'medium' | 'large'（見下）
};

// localStorage 讀 JSON，壞掉就回預設值（不要讓一筆爛資料炸掉整頁）
const jget = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } };

// ── 防呆：存進去的東西不一定還是原來的形狀 ───────────────────────
// jget 只擋得住「JSON 壞掉」，擋不住「JSON 好好的、但型別不對」——
// 舊版本存的格式、使用者自己改過 localStorage、或兩個分頁同時寫，
// 都會讓清單變成物件、秒數變成字串。這些不會丟例外，
// 只會安安靜靜地讓計數變 NaN 或整頁畫不出來，比報錯還難查。
// 所以一律在「讀進來的那一刻」洗乾淨，下游各頁就不必各自防一次。

const isPlainObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** 讀一個「穴名 → 物件」的表；不是物件就整份丟掉回預設 */
const jgetMap = (k, d) => { const v = jget(k, d); return isPlainObj(v) ? v : d; };

/** 夾在範圍內的整數；非數字（含 NaN、字串、null）回 fallback */
function intIn(v, lo, hi, fallback) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
}

// ── 每日提醒的「內容」──────────────────────────────
// mode: 'none'      只提醒你來按，不指定按什麼
//       'symptom'   指定幾個症狀 → 提醒點進去會幫你把症狀勾好
//       'acupoint'  直接指定幾個穴道 → 提醒點進去直接排成今天的療程
// 一律存「名字」不存索引：索引會被 SYMPTOM_MAP / ACUPOINTS 的增刪弄歪，名字不會。
const NOTIFY_TIME_DEFAULT = '20:00';
const notifyTime = () => localStorage.getItem(LS.notifyTime) || NOTIFY_TIME_DEFAULT;
// 三個欄位都要洗：mode 只收這三種，兩個清單一定要是「字串陣列」——
// 不然設定頁的 p.symptoms.includes(...) 會直接丟例外，整頁畫不出來。
const NOTIFY_MODES = ['none', 'symptom', 'acupoint'];
const strList = (v) => Array.isArray(v) ? v.filter(x => typeof x === 'string') : [];
function notifyPlan() {
  const raw = jgetMap(LS.notifyPlan, {});
  return {
    mode:      NOTIFY_MODES.includes(raw.mode) ? raw.mode : 'none',
    symptoms:  strList(raw.symptoms),
    acupoints: strList(raw.acupoints),
  };
}
const saveNotifyPlan = (p) => localStorage.setItem(LS.notifyPlan, JSON.stringify(p));

let state = {
  selectedSymptoms: [],       // 選了哪幾個症狀（存 SYMPTOM_MAP 的索引）
  recommendedAcupoints: [],   // 系統推薦的穴道
  selectedAcupoints: [],      // 使用者勾選、實際要按的穴道（已排序）
  selectedFace: [],           // 臉部穴道另外存：走另一套資料（代碼如 'BL1'），見 js/face-data.js
  acuSecs: {},                // 逐穴的單手秒數（選穴頁拉的滑桿）。沒有那一筆＝跟著全域 flow.pressSec
  currentAcupointIndex: 0,    // 現在按到第幾個
};

// 舊版（2026-09-24 以前）存下的按摩紀錄：已經沒有任何地方讀它，開站時順手清掉。
['acuHistory', 'acuStreak', 'minions'].forEach(k => { try { localStorage.removeItem(k); } catch {} });

// 嚴格模式：角度不佳時要不要乾脆不畫穴位（設定頁可關）
let strictGate = jget(LS.strict, true);

// ── 字級（2026-09-21 補上，對齊 App 的「設定 › 顯示」）──────────────
// 倍率與 App 的 `FontScale`（data/Progress.kt）是同一組數字，兩端要一起改。
// ⭐ 做法是改 <html> 的 font-size，全站的 rem 跟著縮放 ——
//    所以**只有字在變**，邊框、間距這些寫 px 的維持原樣（跟 App 一樣）。
//    這也是為什麼 css 裡的字級一律用 rem：寫 px 的字不會跟著這個設定跑。
// ⚠️ 不要改成縮放 body：<html> 的 font-size 才是 rem 的基準，
//    改 body 只會讓 em 動、rem 不動，畫面會只縮一半。
const FONT_SCALES = { small: 0.85, medium: 1, large: 1.15 };
let fontScale = (() => {
  const v = localStorage.getItem(LS.fontScale);
  return FONT_SCALES[v] ? v : 'medium';
})();

/** 把目前的字級套到整頁。中等就把 inline style 清掉，不留 100% 這種噪音 */
function applyFontScale() {
  const s = FONT_SCALES[fontScale] || 1;
  // 整數百分比：0.85 → 85%、1.15 → 115%。
  // ⚠️ 不要寫 toFixed(1)（115.0%）—— 瀏覽器與 jsdom 會各自正規化，讀回來的字串對不上。
  document.documentElement.style.fontSize = s === 1 ? '' : `${Math.round(s * 100)}%`;
}

function setFontScale(key) {
  if (!FONT_SCALES[key]) return;
  fontScale = key;
  localStorage.setItem(LS.fontScale, key);
  applyFontScale();
}

// ⭐ 立刻套用，不等 boot()：這支是 <head> 裡的一般 script，
//    這時候 <html> 已經在了但畫面還沒畫 —— 等到 DOMContentLoaded 才套，
//    設「大」的人每次開站都會先看到一眼中等字再跳大。
applyFontScale();

// ── 療程節奏（2026-09-02）────────────────────────────────────────
// 原本每換一次手、每換一個穴道都要手動點一下。手還舉在鏡頭前的時候，
// 那一下很難點 —— 所以改成可以全自動跑完，手動模式保留給想自己控節奏的人。
//
// 分兩處調整，依「來不來得及改」決定：
//   首頁設定  readySec / handOrder / switchSec —— 療程開始後才想改就來不及了
//   按摩頁    autoAdvance / pressSec           —— 按到一半會想改，改了立刻有感
const FLOW_DEFAULT = {
  readySec:    5,        // 認穴頁停留幾秒後自動進定位；0 = 不停留直接跳過
  handOrder:   'right',  // 'right' = 先右後左；'left' = 先左後右
  switchSec:   5,        // 一隻手按完，換手倒數幾秒後自動開始下一輪
  autoAdvance: true,     // 一個穴道按完自動接下一個，不用點
  pressSec:    30,       // 單手按壓秒數。左右各一輪，所以一個穴道是這個數字的兩倍
};
// 節奏設定同樣要洗：pressSec 變成字串或 0，按摩頁的倒數就會卡住不動或直接跳過。
// 上限刻意寬鬆（只擋離譜值），使用者想設長一點是他的自由。
function cleanFlow() {
  const raw = jgetMap(LS.flow, {});
  return {
    readySec:    intIn(raw.readySec,    0, 60,  FLOW_DEFAULT.readySec),
    switchSec:   intIn(raw.switchSec,   0, 60,  FLOW_DEFAULT.switchSec),
    pressSec:    intIn(raw.pressSec,    5, 300, FLOW_DEFAULT.pressSec),
    handOrder:   raw.handOrder === 'left' ? 'left' : 'right',
    autoAdvance: typeof raw.autoAdvance === 'boolean' ? raw.autoAdvance : FLOW_DEFAULT.autoAdvance,
  };
}
let flow = cleanFlow();
function saveFlow() { localStorage.setItem(LS.flow, JSON.stringify(flow)); }
function setFlow(k, v) {
  flow[k] = v;
  // 🚨 流程進行中改的節奏只算這一次，不寫回全域（見下方 applyPresetFlow）。
  //    不擋的話，按摩頁那支滑桿會把流程自己的秒數靜靜地存成使用者的預設值。
  if (!flowSaved) saveFlow();
}

// ── 預設流程（2026-09-08）────────────────────────────────────────
// 常按的人每次都要重走一次「選症狀 → 勾穴道」，而每次勾的其實是同一組。
// 一組流程 = 一組穴道（手部＋臉部）＋ 一套節奏，存在設定裡，點一下直接排成療程。
//
// ⭐ 節奏是**覆蓋層，不是覆蓋**：跑流程時暫時換上流程自己的那套，回首頁還原。
//    不這樣做的話，「睡前那組拉到 45 秒」會靜靜地把之後每一次手動療程也變成 45 秒 ——
//    設定頁顯示的數字跟實際跑的不一樣，是最難查的那種不一致。
const PRESET_MAX = 20;          // 再多就變成另一個要管理的清單，那不是這功能要解的問題
const PRESET_NAME_MAX = 20;

function cleanPresetFlow(raw) {
  const r = isPlainObj(raw) ? raw : {};
  return {
    readySec:    intIn(r.readySec,  0, 60,  FLOW_DEFAULT.readySec),
    switchSec:   intIn(r.switchSec, 0, 60,  FLOW_DEFAULT.switchSec),
    pressSec:    intIn(r.pressSec,  5, 300, FLOW_DEFAULT.pressSec),
    handOrder:   r.handOrder === 'left' ? 'left' : 'right',
    autoAdvance: typeof r.autoAdvance === 'boolean' ? r.autoAdvance : FLOW_DEFAULT.autoAdvance,
  };
}

// 洗法跟 minions 一樣是「壞的丟掉那一筆」而不是整份丟掉 —— 流程是使用者自己排的。
// 順便濾掉算不出位置的穴道：留著只會讓人按下開始才發現排了一個定位不了的穴。
// 濾完空掉的那一組整筆丟掉（一個穴道都不剩的流程沒有意義，只會佔一列）。
function cleanPresets() {
  const raw = jget(LS.presets, []);
  if (!Array.isArray(raw)) return [];
  return raw.filter(isPlainObj).map((p, i) => ({
    id:        typeof p.id === 'string' && p.id ? p.id : 'p' + i + '_' + Date.now(),
    name:      (typeof p.name === 'string' ? p.name : '').trim().slice(0, PRESET_NAME_MAX),
    acupoints: strList(p.acupoints).filter(n => IMPLEMENTED.has(n)),
    face:      strList(p.face).filter(c => FACE_IMPLEMENTED.has(c)),
    flow:      cleanPresetFlow(p.flow),
  })).filter(p => p.acupoints.length + p.face.length > 0).slice(0, PRESET_MAX);
}

let presets = cleanPresets();
const savePresets = () => localStorage.setItem(LS.presets, JSON.stringify(presets));
const findPreset = (id) => presets.find(p => p.id === id) || null;

/** 一組流程大概要跑多久（秒）。
 *  手部：認穴停留 + 左右各按一輪 + 中間換手倒數。
 *  臉部：正中穴只有一個點，1 輪、沒有換手（見 js/regions.js 的 itemRounds）。 */
function presetSeconds(p) {
  const f = p.flow;
  return p.acupoints.length * (f.readySec + f.pressSec * 2 + f.switchSec)
       + p.face.length      * (f.readySec + f.pressSec);
}

// ── 節奏覆蓋層 ───────────────────────────────────────────────
// flowSaved 不是 null 就代表「現在有一組流程在跑」。setFlow 靠它決定要不要寫檔。
let flowSaved = null;

function applyPresetFlow(f) {
  if (!flowSaved) flowSaved = Object.assign({}, flow);
  Object.assign(flow, cleanPresetFlow(f));
}

/** 還原成使用者的全域節奏。goHome() 會叫（療程的唯一出口）。 */
function restorePresetFlow() {
  if (!flowSaved) return;
  Object.assign(flow, flowSaved);
  flowSaved = null;
}

// ── 逐穴秒數（2026-09-08）────────────────────────────────────────
// 原本「一隻手按幾秒」是一個全域數字，整場療程所有穴道共用。
// 但合谷跟少商需要的時間本來就不一樣，而設定頁只給 15/30/45/60 四個選項。
// → 改成在選穴頁逐穴用滑桿拉，全域那個值退化成「沒特別調過時的預設」。
//
// ⭐ 只記「調過的那幾穴」，不是進頁就把每一穴都填一份：
//    沒被調過的穴道要能跟著全域設定跑，都填滿的話全域設定就再也影響不了任何東西。
//
// 跟 selectedAcupoints 一樣是這一次療程的暫時選擇，不進 localStorage。
const PRESS_MIN = 5, PRESS_MAX = 120, PRESS_STEP = 5;

/** 這一穴實際要按幾秒。沒調過就回全域值。 */
const acuSecOf = (id) => (id in state.acuSecs)
  ? intIn(state.acuSecs[id], PRESS_MIN, PRESS_MAX, flow.pressSec)
  : flow.pressSec;

/** 調過就一律記下來 —— 「剛好跟全域一樣」也是使用者的明確選擇，
 *  不記的話他之後改全域設定，這一穴會跟著跑掉。要跟回全域請用 clearAcuSec()。 */
function setAcuSec(id, v) {
  state.acuSecs[id] = intIn(v, PRESS_MIN, PRESS_MAX, flow.pressSec);
}
function clearAcuSec(id) { delete state.acuSecs[id]; }
const acuSecIsCustom = (id) => (id in state.acuSecs);

// 這一次療程按了什麼、各按多久（總結頁用）。關掉分頁就沒了，不進 localStorage。
let sessionLog = [];

// 現在正在處理哪一個穴道
const curAcuName = () => state.selectedAcupoints[state.currentAcupointIndex];

// ── 小人顏色：依部位分四色系 ──────────────────────────────
const FINGERTIP = new Set(['少商穴','商陽穴','少衝穴','少澤穴','關衝穴','中衝穴']);
const WRIST     = new Set(['合谷穴','陽池穴','陽溪穴','陽谷穴','後溪穴','腕谷穴']);
const PALM      = new Set(['四縫穴','魚際穴','神門穴','太淵穴','勞宮穴']);

function acuColor(name) {
  // 認不得的穴名 → findIndex 給 -1，(-1 % 5) 是負的，算出來會是 hsl(-3,...) 這種無效色。
  // 退回 0 讓它至少畫得出東西。
  const idx = Math.max(0, ACUPOINTS.findIndex(a => a.name === name));
  const hue = FINGERTIP.has(name) ? 6 : WRIST.has(name) ? 200 : PALM.has(name) ? 158 : 34;
  return `hsl(${(hue + (idx % 5) * 9) % 360}, 46%, 44%)`;
}

// 🔴 2026-09-20：EMERGENCY_SYMPTOMS 整個常數刪除（對齊 App 09-17 那批）。
//    「昏迷急救」已從症狀表移除，中暑降為一般症狀 ——
//    本系統定位為日常自我保健，不作為急救、診斷或治療工具，不再做急症擋話。
