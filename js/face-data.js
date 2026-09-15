// ═══════════════════════════════════════════════════════════════════
// 臉部穴道資料表
//
// 穴道名單：Su et al. (2023) 論文所列臉部 23 穴。
// 定位文字：WHO Standard Acupuncture Point Locations（中譯見
//           `資料存放區/WHO臉部穴道定位_中文版.xlsx`）。
//           球後 / 魚腰 / 太陽 / 印堂 為經外奇穴，該版 WHO 未收錄。
//
// ⚠️ 這支只有「穴道是什麼」，公式在 js/face-math.js。
// ⚠️ 目前 15 / 23 個穴道已實作（眼周 4 + 眉區 5 + 鼻 2 + 口周 4）。要開新穴道：
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
  // 眉「下緣」與「梢端上緣」—— 2026-08-23 補眉區 5 穴時加入。
  // 上面 107/105/46 那組是眉的上緣輪廓，對眉區穴道普遍偏高
  //（魚腰用上緣 8.04% vs 用下緣 1.67%，差 5 倍）。
  browInBotR: 55,  browInBotL: 285,      // 眉頭下緣
  browMidBotR: 65, browMidBotL: 295,     // 眉中下緣（魚腰／陽白的高度基準）
  browTailR: 70,   browTailL: 300,       // 眉梢外端上緣（絲竹空幾乎正落在此）
  mouthR: 61, mouthL: 291, lipTop: 0, lipBot: 17,
  // 鼻／口周 6 穴（2026-08-27 補）。兩個「名字看起來對、實測卻爛」的坑：
  //   noseApex 用 4 不是 noseTip(1) —— lm1 離素髎 8.93%，lm4 只有 1.68%
  //   mentolabial 從 200 改成 18   —— lm200 離承漿 11.65%，lm18 只有 2.12%
  noseApex: 4,       // 鼻尖最凸點（素髎）
  mentolabial: 18,   // 頦唇溝中央（承漿）

  faceR: 234, faceL: 454, jawR: 172, jawL: 397, chin: 152,
  // ⚠️ zygoL 原本寫 345，那是錯的 —— 2026-09-15 用鏡像幾何驗過，
  //    lm116 的左右對稱點是 **447**（345 是另一個點）。之前沒有公式用到它，
  //    所以一直沒被抓到；側臉 6 穴進來後就會踩到。
  zygoR: 116, zygoL: 447, tragusR: 127, tragusL: 356,
  // 側臉 6 穴（2026-09-15 補）。全部用鏡像幾何驗過是真的左右對。
  cheekR: 50,  cheekL: 280,      // 顴部外側（顴髎）
  mandR: 135,  mandL: 364,       // 下頜體（大迎）
  tempR: 139,  tempL: 389,       // 顳部（上關）
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

// ── 白話資料：定位方式 / 按壓方式 / 功效（2026-09-11）────────────────
//
// 來源：`資料存放區/臉部穴道.pdf`（21 穴 / 36 條用法 / 21 張示意圖）。
// 跟上面的 `who` 欄位是**兩回事，都要留**：
//   who    — WHO 標準定位，解剖術語，是公式的依據，寫論文引用這個
//   locate — 白話定位（「眼平視時，瞳孔往下兩公分處」），給使用者看的
//
// 一個穴道有多條 `uses`：同一個穴道按不同的方式、達到不同的功效。
// 例：印堂有三條（改善鼻子不適 / 緩解頭痛 / 改善失眠），按法與時間都不同。
//
// ⚠️ PDF 把「瞳子髎」打成「瞳子膠」，轉檔時已對正成 GB1。
// ⚠️ PDF 只有 21 穴，現有 23 穴裡的**球後（EX-HN7）、兌端（GV27）沒有資料**。
//    faceDetail() 查不到會回 null，UI 要自己處理，不要拿別穴的頂替。
const FACE_DETAIL = {
  'ST1': {
    locate: '眼平視時，瞳孔往下兩公分處',
    uses: [
      { func: '眼睛保健', press: '順著下眼瞼眼周按壓10秒鐘。',
        note: '可改善眼睛紅痛、癢。' },
      { func: '臉部美容', press: '順著下眼瞼眼周按壓10秒鐘。',
        note: '淡化黑眼圈、預防眼袋鬆弛，促進眼部周圍的氣血循環。' },
    ],
  },
  'ST2': {
    locate: '瞳孔直下，眼眶下孔凹陷處',
    uses: [
      { func: '眼睛保健', press: '將雙手食指伸直，以食指指腹揉按左右穴位，每次1~3分鐘。',
        note: '緩解眼部疲勞，對眼睛有很好的保健作用。' },
    ],
  },
  'ST3': {
    locate: '瞳孔直下與平鼻翼下緣處交點處。',
    uses: [
      { func: '臉部美容', press: '用雙手指腹輕輕重覆按揉穴道，每次按摩約2~3分鐘。',
        note: '有改善臉頰浮腫、青春痘、臉頰鬆弛等作用功效。' },
      { func: '改善鼻子不適', press: '用雙手指腹輕輕重覆按揉穴道，每次按摩約2~3分鐘。',
        note: '祛風、通竅，具有緩解鼻炎、鼻塞等功效。' },
    ],
  },
  'BL1': {
    locate: '雙眼內眼角稍靠上的凹陷處',
    uses: [
      { func: '眼睛保健', press: '用大拇指和食指指腹以畫圈的方式按壓此穴位，每次2分鐘。',
        note: '解除眼睛疲勞。' },
    ],
  },
  'GB1': {
    locate: '眼眶外側緣處',
    uses: [
      { func: '臉部美容', press: '用大拇指腹按壓穴位，按壓同時吐氣，每回6秒鐘重複6次，早晚各一次。',
        note: '去除眼角皺紋。' },
      { func: '眼睛保健', press: '用大拇指腹按壓穴位，按壓同時吐氣，每回6秒鐘重複6次，早晚各一次。',
        note: '促進眼部血液迴圈。' },
    ],
  },
  'BL2': {
    locate: '眉頭',
    uses: [
      { func: '眼睛保健', press: '食指關節輕扣，10秒鐘。',
        note: '可消除眼睛水腫、改善流淚、目眩赤痛、明目醒腦，頰熱面痛、眼瞼跳動。' },
    ],
  },
  'TE23': {
    locate: '眉梢凹陷處',
    uses: [
      { func: '緩解頭痛', press: '用大拇指指腹向內揉按。',
        note: '明目鎮痛，具舒緩頭痛、偏頭痛、目眩等症狀。' },
      { func: '臉部美容', press: '用大拇指、食指或中指腹按壓穴位，按壓同時吐氣，每回6秒鐘重複6次，早晚各一次。',
        note: '促進血液循環，改善細胞代謝，消除眼部魚尾皺紋及眼睛保健作用。' },
    ],
  },
  'GB14': {
    locate: '瞳孔直上，眉上三公分的位置',
    uses: [
      { func: '眼睛保健', press: '將雙手搓暖後用大拇指指腹按壓，力度由輕到重，速度緩和不要太快。',
        note: '對眼睛酸痛有相當程度改善效果，治目眩、目痛。' },
      { func: '臉部美容', press: '將雙手搓暖後用大拇指指腹按壓，力度由輕到重，速度緩和不要太快。',
        note: '改善面部的血液循環，改善額上的細紋、眼瞼下垂及黑眼圈。' },
    ],
  },
  'EX-HN4': {
    locate: '眉中',
    uses: [
      { func: '眼睛保健', press: '順著眉毛生長方向輕壓，10秒鐘。',
        note: '防治近視、砂眼、青光眼、角膜炎、視神經炎等眼部疾病。' },
    ],
  },
  'EX-HN3': {
    locate: '在額部，當兩眉頭之中間',
    uses: [
      { func: '改善鼻子不適', press: '把右手的中指伸直，其他手指彎曲，將中指的指腹放眉中心處，用指腹揉按穴位，用力適度，每次大約2~3分鐘，每天早晚各揉按一次。',
        note: '清頭明目，通鼻開竅，且能增強鼻粘膜上皮細胞的增生能力。' },
      { func: '緩解頭痛', press: '慢慢輕揉2分鐘，感覺微麻、發脹為宜。',
        note: '治療頭痛、頭暈、前頭痛。' },
      { func: '改善失眠', press: '用中指以較強的力點按10次。然後再順時針揉動20-30圈，逆時針揉動20-30圈。',
        note: '鎮靜安神。' },
    ],
  },
  'LI20': {
    locate: '鼻孔旁，從鼻孔向外與法令紋（笑紋、鼻唇溝）相交之處',
    uses: [
      { func: '改善鼻子不適', press: '以食指腹垂直按壓迎香，力量適中，每次1-3分鐘即可。',
        note: '通鼻竅，可改善鼻子過敏、鼻塞不通。' },
    ],
  },
  'GV25': {
    locate: '鼻尖的正中央處',
    uses: [
      { func: '改善鼻子不適', press: '以右手掌心輕柔按貼，先以逆時針方向壓揉50下，再用左手掌心按鼻尖順時針方向壓揉50下。',
        note: '通利鼻竅，可緩解鼻炎、鼻塞等。' },
    ],
  },
  'ST4': {
    locate: '口角外側，上直瞳孔處',
    uses: [
      { func: '緩解顔面神經麻痺', press: '將雙手直指伸直，以食指指腹揉按左右穴位，每次1~3分鐘。',
        note: '治療小孩子口角流水，口角炎，且可改善面神經麻痺，緩解三叉神經痛。' },
    ],
  },
  'GV26': {
    locate: '鼻唇溝上1/3與中1/3交點處。',
    uses: [
      { func: '昏迷急救', press: '以指尖垂直按壓。',
        note: '又稱人中穴，是一個重要的急救穴位，用於昏迷、暈厥。' },
    ],
  },
  'CV24': {
    locate: '下嘴唇之下，正中的凹陷處',
    uses: [
      { func: '改善口腔衛生', press: '用食指用力壓揉。',
        note: '增加唾液分泌，緩解口腔炎、口角炎的疼痛。' },
      { func: '臉部美容', press: '用中指指腹按揉並做環狀運動，每次2分鐘。',
        note: '緊緻臉部、消除臉部浮腫、保養皮膚。' },
    ],
  },
  'ST5': {
    locate: '在下頜角前方，咬肌附著部的前緣',
    uses: [
      { func: '臉部美容', press: '用雙手指腹輕輕重覆按揉穴道，每次按摩約2~3分鐘。',
        note: '增進臉部血液循環，消除雙下巴。' },
      { func: '緩解牙痛', press: '用雙手指腹輕輕重覆按揉穴道，每次按摩約2~3分鐘。',
        note: '齒痛時，牙關緊閉，消腫止痛。' },
    ],
  },
  'ST6': {
    locate: '下頜角前上方約一橫指（中指），當咀嚼時咬肌隆起，按之凹陷處。',
    uses: [
      { func: '臉部美容', press: '每天早中晚以手指順逆時鐘方向各按摩50下。',
        note: '有放鬆嚼肌，修飾臉型的功效。' },
      { func: '緩解牙痛', press: '輕按數分鐘。',
        note: '活絡止痛，消腫，可治療面神經麻痺、三叉神經痛、顳頜關節炎、腮腺炎。' },
      { func: '緩解顔面神經麻痺', press: '食指彎曲沿著嘴角往外刺激。',
        note: '開關通絡，活絡面部神經。' },
    ],
  },
  'ST7': {
    locate: '在耳朵前方，顴骨與下頜之間的凹陷處。',
    uses: [
      { func: '緩解牙痛', press: '用雙手中指或食指指腹，按揉約l分鐘。',
        note: '可緩解牙痛、牙齦腫痛，對於咬合不正造成的問題也有改善的效果。' },
      { func: '臉部美容', press: '以食指按壓穴道，順時鐘方向揉按100次，反方向100次，每日三次。',
        note: '促進面部皮膚、肌肉的血液循環和新陳代謝。' },
      { func: '緩解耳鳴', press: '用雙手中指或食指指腹，適當用力按揉2~3分鐘，使局部產生酸脹痛感，每日兩次。',
        note: '促進耳部的氣血循環，改善耳聾、耳鳴。' },
    ],
  },
  'SI18': {
    locate: '由外眼角直下，在顴骨尖處下緣的凹陷處。',
    uses: [
      { func: '臉部美容', press: '用大拇指按壓100~200次，可每天按揉。',
        note: '改善面腫、黑眼圈。' },
      { func: '緩解牙痛', press: '用大拇指指尖按壓，掌心朝臉，力道由下往上垂直按揉。',
        note: '清熱消腫，可緩解牙痛、三叉神經痛等。' },
      { func: '緩解顔面神經麻痺', press: '每天以手輕柔向上的按摩數次。',
        note: '增加臉部血液循環、減輕麻痺肌肉的僵硬感。' },
    ],
  },
  'GB3': {
    locate: '耳前，下關穴直上，當顴弓的上緣凹陷處。',
    uses: [
      { func: '緩解耳鳴', press: '用手指按壓2秒鐘，一面緩緩吐氣，反覆做5次。',
        note: '開竅益聰，具治療耳鳴、耳聾等功效。' },
    ],
  },
  'EX-HN5': {
    locate: '眉梢與外眼角之間向後約三公分凹陷處',
    uses: [
      { func: '緩解頭痛', press: '用雙手中指指腹順時針或逆時針按揉，每個方向按摩1次，每次按摩1分鐘，每日可以做10次左右。',
        note: '給予大腦良性刺激，能夠解除疲勞、振奮精神、止痛醒腦，可緩解血管神經性頭痛、偏頭痛造成的不適感。' },
    ],
  },
};

/** 白話資料；沒有就回 null（球後、兌端目前沒有） */
const faceDetail = (code) => FACE_DETAIL[code] || null;

/** 這個穴道 PDF 列了哪些功效 */
const faceFuncs = (code) => {
  const d = faceDetail(code);
  return d ? [...new Set(d.uses.map(u => u.func))] : [];
};

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

/** 這些穴道的定位公式已經寫好（見 js/face-math.js）。
 *  ⚠️ 「寫好」不等於「驗過」—— 沒有 GT 可驗的列在下面的 FACE_NO_GT。 */
const FACE_IMPLEMENTED = new Set([
  'BL1', 'ST1', 'ST2', 'ST3',                          // 眼周（2026-08-09）
  'EX-HN7',                                            // 球後（2026-09-13，用戶指定定義）
  'GB1',                                               // 瞳子髎（2026-09-15，WHO 字面 0 擬合）
  'EX-HN5', 'GB3', 'SI18', 'ST5', 'ST6', 'ST7',        // 側臉 6 穴（2026-09-15，⚠️ 全部無 GT）
  'EX-HN3', 'BL2', 'EX-HN4', 'GB14', 'TE23',           // 眉區（2026-08-23）
  'LI20', 'GV25',                                      // 鼻（2026-08-27）
  'ST4', 'GV26', 'GV27', 'CV24',                       // 口周（2026-08-27）
]);

/** ⭐ 固定做法（2026-09-14 定）：用戶口頭指定的定義**先照寫並固定住**，
 *  但必須列進這裡標明「沒有 GT、誤差未知」，並同步寫進
 *  `記錄控制\待驗證清單.md`，之後主動提醒補驗證。
 *  列在這裡的穴道：tests/face.js 不拿標注去比它的誤差（比了也沒意義）。 */
const FACE_NO_GT = new Map([
  ['EX-HN7', '用戶 2026-09-13 指定定義；已指示標注檔裡的球後不作為 GT'],
  // 側臉 6 穴：常數就是拿唯一那 2 筆挑出來的，沒有任何獨立樣本可驗。
  // 兩側來自不同照片，所以「兩側差」是目前唯一的交叉訊號（換算 mm 附在後面）。
  // 🚨 而且常數是從**側臉照**量的 —— 2026-09-15 實測，套到正臉時 12 個落點
  //    只有 3 個對到同一個解剖點。正臉鏡頭下這 6 個只能當「大概位置」。
  ['EX-HN5', '側臉 n=1人/每側1筆；兩側差 2.8mm。正臉補標後必須重做'],
  ['GB3',    '側臉 n=1人/每側1筆；兩側差 11.7mm ⚠️ 偏大。WHO 是觸診定義'],
  ['SI18',   '側臉 n=1人/每側1筆；兩側差 15.5mm ⚠️⚠️ 6 個裡最差'],
  ['ST5',    '側臉 n=1人/每側1筆；兩側差 6.6mm'],
  ['ST6',    '側臉 n=1人/每側1筆；兩側差 6.0mm'],
  ['ST7',    '側臉 n=1人/每側1筆；兩側差 8.8mm。WHO 是觸診定義'],
]);

/** 有公式、也有標注，但**標注本身不可信**的穴道 —— 跟 FACE_NO_GT 不同：
 *  NO_GT 是根本沒有 GT；這裡是有 GT 但幾份標注彼此矛盾，比誤差沒有意義。
 *  ⚠️ 這不是放寬標準 —— 這些穴道的誤差數字**不計入**統計，等重標後才算數，
 *     每一筆都登記在 記錄控制/待驗證清單.md。 */
const FACE_GT_DISPUTED = new Map([
  ['GB1', '三份標注解讀差 2.4 倍（外眥→穴 換算成寸：self 09-01 標 0.556/0.497、'
        + 'duke 09-12 標 0.289/0.300、ten_2 09-14 標 0.226/0.230）。'
        + '每人自己左右一致，三份之間差兩倍多，而三份都是同一個標注者 → 解讀隨時間漂移。'
        + '待統一解讀重標'],
  ['GB14', '2026-09-14 用戶改了定義（眉上緣→髮際的 1/3），與舊標注差 12.8% IPD ≈ 8mm。'
         + '舊標注已停用為 GT，待重標'],
]);
// ⚠️ GB14 陽白不列在這裡，但狀況特殊：用戶 2026-09-14 另給了新定義
//    （x 與承泣同垂線、y 取「眉上緣→髮際」的 1/3），已寫進 `臉部/face_acu.py` 的 HF 法。
//    新定義需要髮際線，網頁端還沒有髮際偵測 → **這裡跑的仍是舊的 PV 擬合值**，
//    與 Python 在「沒傳 hairline」時的 fallback 完全一致。詳見 記錄控制\待驗證清單.md。

/** 由選到的症狀展開成臉部穴道代碼（含未實作的，讓介面能誠實顯示） */
function faceRecommend(symptomNames) {
  const out = [];
  symptomNames.forEach(n => (FACE_SYMPTOM_MAP[n] || []).forEach(c => {
    if (!out.includes(c)) out.push(c);
  }));
  return out;
}
