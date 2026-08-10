// ═══════════════════════════════════════════════════════════════════
// 部位分類
//
// 選穴頁用這個把穴道分成三個部位。目前 26 穴全在手部，
// 手肘與臉部先把框架做出來、內容留空（見 `比賽專區/理想版_功能規格`）。
//
// 臉部 2026-08-09 開通，但走的是**另一套**資料與公式（js/face-data.js /
// face-math.js），不併進 ACUPOINTS —— 兩邊模型不同（Hands vs FaceMesh），
// 穴道結構也不同（臉部用 code 不用穴名）。選穴頁在 currentRegion==='face'
// 時改呼叫 renderFaceList()（定義在 pages/07-face.js）。
// ═══════════════════════════════════════════════════════════════════

const REGIONS = [
  { key: 'hand',  label: 'region-hand',  ready: true  },
  { key: 'elbow', label: 'region-elbow', ready: false },
  { key: 'face',  label: 'region-face',  ready: true  },
];

// 穴名 → 部位。沒列到的一律當手部（現階段就是全部）
const ACU_REGION = {};

const acuRegion = (name) => ACU_REGION[name] || 'hand';
const regionOf = (key) => REGIONS.find(r => r.key === key);
