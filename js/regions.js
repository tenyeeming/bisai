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

// ═══════════════════════════════════════════════════════════════════
// 療程項目（2026-09-04）
//
// 起點是這個觀察：臉部穴道要「加入」療程，而不是另外接一條平行的臉部流程。
// 所以療程清單 state.selectedAcupoints 變成混裝 —— 手部放穴名（'合谷穴'），
// 臉部放代碼（'EX-HN3'）—— 各頁不去問「這是不是臉部」，只問下面這幾件事。
//
// ⚠️ 判別靠 faceAcu()：代碼查得到就是臉部項目。所以手部穴名絕不能取成
//    'BL1' 這種樣子（現在也不會，手部一律是中文穴名）。
// ═══════════════════════════════════════════════════════════════════

const isFaceItem = (id) => !!faceAcu(id);

/** 這一項屬於哪個部位（給步驟提示、相機切換用） */
const itemRegion = (id) => isFaceItem(id) ? 'face' : acuRegion(id);

/** 顯示名。兩邊都會跟著語言切換 */
const itemLabel = (id) => isFaceItem(id) ? faceLabel(id) : acuLabel(id);

/** 定位說明。臉部用 WHO 原文（沒有自己的白話版，也刻意不編） */
const itemLocate = (id) => {
  if (isFaceItem(id)) return faceWho(id);
  const a = ACUPOINTS.find(x => x.name === id);
  return a && a.locate ? a.locate : '';
};

/** 這一項的定位公式做出來了沒 */
const itemImplemented = (id) =>
  isFaceItem(id) ? FACE_IMPLEMENTED.has(id) : IMPLEMENTED.has(id);

/**
 * 按摩要跑幾輪。
 * 手部是 2（左右手各一輪）；臉部正中穴只有一個點，沒有左右之分 → 1。
 * ⚠️ 雙側臉部穴（如攢竹）之後要接時，這裡要改成看 faceAcu(id).bilateral。
 *    現在只有印堂（bilateral: false）走這條，先不預先寫沒驗過的分支。
 */
const itemRounds = (id) => isFaceItem(id) ? 1 : 2;

/**
 * 計時要不要靠「指尖對準」把關。
 *
 * ⭐ 2026-09-04 起兩邊都是 true，但**成立的理由不同**：
 *    手部靠「同一個 HandLandmarker 裡兩點的距離」；
 *    臉部跨兩個模型，2D 距離分不出「碰到」與「浮在臉前 15cm」，
 *    改用手/臉表觀大小比值當深度代理（js/face-gate.js，實驗見
 *    記錄控制/PROGRESS.md 2026-09-04 續 3）。
 *
 * ⚠️ 臉部的閘門**有距離前提**：人離鏡頭太遠時判定會失效，那時退回純倒數
 *    並在讀數條講明「無法驗證有沒有按對」。所以這個 true 的意思是
 *    「會嘗試把關」，不是「保證把關」。
 */
const itemGated = (id) => true;

/** 這一項要用哪一套偵測（'hand' | 'face'）。相機頁據此決定開哪個模型 */
const itemDetector = (id) => isFaceItem(id) ? 'face' : 'hand';

/**
 * 這一項的代表色。手部走 `acuColor()`（依指尖／腕／掌分群），
 * 臉部走 `faceColor()`（依眼／眉／鼻／口／側臉分群）。
 *
 * 2026-09-20 圖冊納入臉部時加。在這之前所有色點都直接呼叫 `acuColor()` ——
 * 那支對臉部代碼會回同一個土黃色，所以凡是「可能拿到臉部代碼」的地方都改走這裡。
 */
const itemColor = (id) => isFaceItem(id) ? faceColor(id) : acuColor(id);
