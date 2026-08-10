// ═══════════════════════════════════════════════════════════════════
// 臉部穴道資料表
//
// 穴道名單：Su et al. (2023) 論文所列臉部 23 穴。
// 定位文字：WHO Standard Acupuncture Point Locations（中譯見
//           `資料存放區/WHO臉部穴道定位_中文版.xlsx`）。
//           球後 / 魚腰 / 太陽 / 印堂 為經外奇穴，該版 WHO 未收錄。
//
// ⚠️ 這支只有「穴道是什麼」，公式在 js/face-math.js。
// ⚠️ 目前只有 4 個穴道 implemented:true。要開新穴道：
//    ① 在 `臉部/標注工具.html` 標注 ② 用 `臉部/驗證.py` 定參數
//    ③ 把參數寫進 face-math.js 的 FACE_FORMULA ④ 這裡改 implemented:true
//    順序不能反 —— 先寫公式再收資料就是手部那條線踩過的坑。
// ═══════════════════════════════════════════════════════════════════

// ── MediaPipe Face Mesh 參考點（refineLandmarks 後共 478 點）──────────
// R/L 以 canonical face mesh 為準。前鏡頭是鏡像的，畫面上的左右與
// 受試者自己的左右相反 —— 顯示時才翻，座標一律用原始值（同手部的做法）。
const FLM = {
  irisR: 468, irisL: 473,          // 虹膜中心
  innerR: 133, innerL: 362,        // 內眥
  outerR: 33,  outerL: 263,        // 外眥
  eyeBotR: 145, eyeBotL: 374,      // 下眼瞼緣
  eyeTopR: 159, eyeTopL: 386,
  alaR: 129, alaL: 358,            // 鼻翼（WHO「與鼻翼下緣同高」用這兩點）
  nostrilR: 98, nostrilL: 327,
  noseTip: 1, noseRoot: 168, subnasale: 2,
  glabella: 9, foreheadTop: 10,    // ⚠ foreheadTop 只是前髮際的近似
  browInR: 107, browMidR: 105, browOutR: 46,
  browInL: 336, browMidL: 334, browOutL: 276,
  mouthR: 61, mouthL: 291, lipTop: 0, lipBot: 17, mentolabial: 200,
  faceR: 234, faceL: 454, jawR: 172, jawL: 397, chin: 152,
  zygoR: 116, zygoL: 345, tragusR: 127, tragusL: 356,
};

// ── 23 個臉部穴道 ────────────────────────────────────────────────────
const FACE_ACUPOINTS = [
  // 眼周
  { code: 'ST1', name: '承泣', en: 'Chengqi', group: 'eye', bilateral: true, inWHO: true,
    who: '在面部，眼球與眶下緣之間，瞳孔正下方。',
    whoEn: 'On the face, between the eyeball and the infraorbital margin.' },
  { code: 'ST2', name: '四白', en: 'Sibai', group: 'eye', bilateral: true, inWHO: true,
    who: '在面部，眶下孔處。', whoEn: 'On the face, in the infraorbital foramen.' },
  { code: 'ST3', name: '巨髎', en: 'Juliao', group: 'eye', bilateral: true, inWHO: true,
    who: '在面部，瞳孔正下方，與鼻翼下緣同高。',
    whoEn: 'On the face, directly inferior to the pupil, at the same level as the inferior border of ala nasi.' },
  { code: 'BL1', name: '睛明', en: 'Jingming', group: 'eye', bilateral: true, inWHO: true,
    who: '在面部，內眥上內方與眶內側壁之間的凹陷處。',
    whoEn: 'On the face, in the depression between the superomedial part of the inner canthus and the medial orbital wall.' },
  { code: 'GB1', name: '瞳子髎', en: 'Tongziliao', group: 'eye', bilateral: true, inWHO: true,
    who: '在頭部，外眥外側 0.5 骨度寸的凹陷處。',
    whoEn: 'On the head, in the depression 0.5 B-cun lateral to the outer canthus.' },
  { code: 'EX-HN7', name: '球後', en: 'Qiuhou', group: 'eye', bilateral: true, inWHO: false,
    who: '（經外奇穴）眶下緣外 1/4 與內 3/4 交界處。',
    whoEn: '(Extra point) At the junction of the lateral 1/4 and medial 3/4 of the infraorbital margin.' },

  // 眉
  { code: 'BL2', name: '攢竹', en: 'Cuanzhu', group: 'brow', bilateral: true, inWHO: true,
    who: '在頭部，眉毛內側端的凹陷處。',
    whoEn: 'On the head, in the depression at the medial end of the eyebrow.' },
  { code: 'TE23', name: '絲竹空', en: 'Sizhukong', group: 'brow', bilateral: true, inWHO: true,
    who: '在頭部，眉毛外側端的凹陷處。',
    whoEn: 'On the head, in the depression at the lateral end of the eyebrow.' },
  { code: 'GB14', name: '陽白', en: 'Yangbai', group: 'brow', bilateral: true, inWHO: true,
    who: '在頭部，眉毛上方 1 骨度寸，瞳孔中心正上方。',
    whoEn: 'On the head, 1 B-cun superior to the eyebrow, directly superior to the pupil.' },
  { code: 'EX-HN4', name: '魚腰', en: 'Yuyao', group: 'brow', bilateral: true, inWHO: false,
    who: '（經外奇穴）眉毛中點，瞳孔直上。',
    whoEn: '(Extra point) At the midpoint of the eyebrow, directly above the pupil.' },
  { code: 'EX-HN3', name: '印堂', en: 'Yintang', group: 'brow', bilateral: false, inWHO: false,
    who: '（經外奇穴）兩眉頭連線中點。',
    whoEn: '(Extra point) At the midpoint between the medial ends of the two eyebrows.' },

  // 鼻
  { code: 'LI20', name: '迎香', en: 'Yingxiang', group: 'nose', bilateral: true, inWHO: true,
    who: '在面部，鼻唇溝中，與鼻翼外緣中點同高。',
    whoEn: 'On the face, in the nasolabial sulcus, at the same level as the midpoint of the lateral border of ala nasi.' },
  { code: 'GV25', name: '素髎', en: 'Suliao', group: 'nose', bilateral: false, inWHO: true,
    who: '在面部，鼻尖處。', whoEn: 'On the face, at the tip of the nose.' },

  // 口周
  { code: 'ST4', name: '地倉', en: 'Dicang', group: 'mouth', bilateral: true, inWHO: true,
    who: '在面部，口角外側 0.4 指寸。',
    whoEn: 'On the face, 0.4 F-cun lateral to the angle of the mouth.' },
  { code: 'GV26', name: '水溝', en: 'Shuigou', group: 'mouth', bilateral: false, inWHO: true,
    who: '在面部，人中溝中線的中點。',
    whoEn: 'On the face, at the midpoint of the philtrum midline.' },
  { code: 'GV27', name: '兌端', en: 'Duiduan', group: 'mouth', bilateral: false, inWHO: true,
    who: '在面部，上唇結節的中點。',
    whoEn: 'On the face, at the midpoint of the tubercle of the upper lip.' },
  { code: 'CV24', name: '承漿', en: 'Chengjiang', group: 'mouth', bilateral: false, inWHO: true,
    who: '在面部，頦唇溝中央的凹陷處。',
    whoEn: 'On the face, in the depression in the centre of the mentolabial sulcus.' },

  // 臉側
  { code: 'ST5', name: '大迎', en: 'Daying', group: 'side', bilateral: true, inWHO: true,
    who: '在面部，下頜角前方，咬肌附著部前緣的凹陷處，面動脈搏動處。',
    whoEn: 'On the face, anterior to the angle of the mandible, over the facial artery.' },
  { code: 'ST6', name: '頰車', en: 'Jiache', group: 'side', bilateral: true, inWHO: true,
    who: '在面部，下頜角前上方一橫指（中指）處。',
    whoEn: 'On the face, one fingerbreadth anterosuperior to the angle of the mandible.' },
  { code: 'ST7', name: '下關', en: 'Xiaguan', group: 'side', bilateral: true, inWHO: true,
    who: '在面部，顴弓下緣中點與下頜切跡之間的凹陷處。',
    whoEn: 'On the face, in the depression between the midpoint of the inferior border of the zygomatic arch and the mandibular notch.' },
  { code: 'SI18', name: '顴髎', en: 'Quanliao', group: 'side', bilateral: true, inWHO: true,
    who: '在面部，顴骨下方，外眥正下方的凹陷處。',
    whoEn: 'On the face, inferior to the zygomatic bone, in the depression directly inferior to the outer canthus.' },
  { code: 'GB3', name: '上關', en: 'Shangguan', group: 'side', bilateral: true, inWHO: true,
    who: '在頭部，顴弓中點上方的凹陷處。',
    whoEn: 'On the head, in the depression superior to the midpoint of the zygomatic arch.' },
  { code: 'EX-HN5', name: '太陽', en: 'Taiyang', group: 'side', bilateral: true, inWHO: false,
    who: '（經外奇穴）眉梢與外眥之間，向後約一橫指的凹陷處。',
    whoEn: '(Extra point) In the depression about one fingerbreadth posterior to the midpoint between the lateral end of the eyebrow and the outer canthus.' },
];

const FACE_BY_CODE = Object.fromEntries(FACE_ACUPOINTS.map(a => [a.code, a]));
const faceAcu = (code) => FACE_BY_CODE[code];
const faceLabel = (code) => {
  const a = FACE_BY_CODE[code];
  return a ? (isZh() ? a.name : a.en) : code;
};
const faceWho = (code) => {
  const a = FACE_BY_CODE[code];
  return a ? (isZh() ? a.who : a.whoEn) : '';
};

// ── 症狀 → 臉部穴道 ───────────────────────────────────────────────────
// 症狀名沿用 js/acu-data.js 的 SYMPTOM_MAP，才能跟手部併在同一個療程裡。
// 只列 WHO / 教科書上該症狀確實會用的臉部穴道；還沒實作定位的也列，
// 選穴頁會標成「準備中」而不是假裝有。
const FACE_SYMPTOM_MAP = {
  '緩解目痛':   ['BL1', 'ST1', 'ST2', 'GB1', 'BL2', 'TE23', 'EX-HN4', 'EX-HN7', 'GB14', 'EX-HN5'],
  '緩解頭痛':   ['EX-HN5', 'EX-HN3', 'GB14', 'BL2', 'GB3'],
  '緩解牙痛':   ['ST6', 'ST7', 'ST4', 'ST5', 'ST3'],
  '緩解感冒症狀': ['LI20', 'GV25', 'EX-HN3', 'ST3'],
  '緩解耳鳴':   ['ST7', 'GB3'],
  '改善失眠':   ['EX-HN3', 'EX-HN5'],
  '昏迷急救':   ['GV26'],
};

/** 這些穴道的定位公式已經寫好、有標注資料支撐（見 js/face-math.js） */
const FACE_IMPLEMENTED = new Set(['BL1', 'ST1', 'ST2', 'ST3']);

/** 由選到的症狀展開成臉部穴道代碼（含未實作的，讓介面能誠實顯示） */
function faceRecommend(symptomNames) {
  const out = [];
  symptomNames.forEach(n => (FACE_SYMPTOM_MAP[n] || []).forEach(c => {
    if (!out.includes(c)) out.push(c);
  }));
  return out;
}
