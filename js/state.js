// ═══════════════════════════════════════════════════════════════════
// 全站狀態與存檔
//
// 分兩種：
//   state.selected*     → 這一次療程的暫時選擇，關掉分頁就沒了
//   state.history/...   → 存進 localStorage 的長期紀錄（圖冊、連續天數靠它）
// ═══════════════════════════════════════════════════════════════════

const LS = {
  history: 'acuHistory',   // { 穴名: { times, lastDate } }
  streak:  'acuStreak',    // { date, count }
  minions: 'minions',      // { 穴名: { level, times } }
  notify:  'notifyEnabled',
  strict:  'strictGate',
};

// localStorage 讀 JSON，壞掉就回預設值（不要讓一筆爛資料炸掉整頁）
const jget = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } };

let state = {
  selectedSymptoms: [],       // 選了哪幾個症狀（存 SYMPTOM_MAP 的索引）
  recommendedAcupoints: [],   // 系統推薦的穴道
  selectedAcupoints: [],      // 使用者勾選、實際要按的穴道（已排序）
  selectedFace: [],           // 臉部穴道另外存：走另一套資料（代碼如 'BL1'），見 js/face-data.js
  currentAcupointIndex: 0,    // 現在按到第幾個
  history: jget(LS.history, {}),
  streak:  jget(LS.streak, { date: null, count: 0 }),
  minions: jget(LS.minions, {}),
};

// 嚴格模式：角度不佳時要不要乾脆不畫穴位（設定頁可關）
let strictGate = jget(LS.strict, true);

function saveState() {
  localStorage.setItem(LS.history, JSON.stringify(state.history));
  localStorage.setItem(LS.streak,  JSON.stringify(state.streak));
  localStorage.setItem(LS.minions, JSON.stringify(state.minions));
}

// 現在正在處理哪一個穴道
const curAcuName = () => state.selectedAcupoints[state.currentAcupointIndex];

const todayStr = () => new Date().toISOString().split('T')[0];
const daysBetween = (a, b) =>
  Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);

// ── 小人顏色：依部位分四色系 ──────────────────────────────
const FINGERTIP = new Set(['少商穴','商陽穴','少衝穴','少澤穴','關衝穴','中衝穴']);
const WRIST     = new Set(['合谷穴','陽池穴','陽溪穴','陽谷穴','後溪穴','腕谷穴']);
const PALM      = new Set(['四縫穴','魚際穴','神門穴','太淵穴','勞宮穴']);

function acuColor(name) {
  const idx = ACUPOINTS.findIndex(a => a.name === name);
  const hue = FINGERTIP.has(name) ? 6 : WRIST.has(name) ? 200 : PALM.has(name) ? 158 : 34;
  return `hsl(${(hue + (idx % 5) * 9) % 360}, 46%, 44%)`;
}

// 這兩個症狀是急症：App 不能取代 119，選到就要擋話（見 02-recommend.js）
const EMERGENCY_SYMPTOMS = new Set(['昏迷急救', '中暑']);
