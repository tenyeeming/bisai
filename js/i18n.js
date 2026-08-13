// ═══════════════════════════════════════════════════════════════════
// 文案（中／英）
//
// 一律成對出現：新增中文就要補英文，反之亦然（測試會擋不成對的 key）。
// 按頁分區塊，改哪一頁的字就找那一區。
// 動態產生的字（穴名、症狀名、讀數）不走這裡，寫在各頁自己的 .js。
// ═══════════════════════════════════════════════════════════════════
const i18n = {
  zh: {
    // ── 底部分頁列 ──
    'nav-home': '首頁', 'nav-gallery': '圖冊', 'nav-settings': '設定', 'nav-profile': '個人',

    // ── 步驟軌 ──
    'step-1': '症狀', 'step-2': '選穴', 'step-3': '認穴', 'step-4': '定位', 'step-5': '按摩',

    // ── 共用按鈕 ──
    'btn-back': '← 返回',
    'btn-stop': '← 停止',
    'btn-next': '下一步',
    'btn-home': '回首頁',
    'btn-gallery': '圖冊',

    // ── 01 症狀 ──
    'eyebrow-home': '步驟一 · 主訴',
    'home-title': '選擇你的症狀',
    'home-desc': '可複選多個症狀，系統會推薦相關穴道',
    'disclaimer': '本系統為穴位定位輔助工具，內容依據傳統中醫文獻整理，不構成醫療診斷或治療建議。身體不適請就醫。',

    // ── 02 選穴 ──
    'eyebrow-recommend': '步驟二 · 配穴',
    'recommend-title': '推薦穴道',
    'recommend-desc': '系統推薦了下列穴道，請勾選你要按摩的穴道',
    'btn-start': '開始療程',
    'region-hand': '手部',
    'region-elbow': '手肘',
    'region-face': '臉部',
    'region-soon': '這個部位還在開發中。手部與臉部已可定位，手肘會在後續版本開放。',
    'region-empty': '你選的症狀在這個部位沒有對應的穴道。',

    // ── 03 認穴 ──
    'eyebrow-detail': '步驟三 · 定位說明',
    'btn-tutorial': '看教學',
    'btn-locate': '開始定位',

    // ── 04 定位 ──
    'eyebrow-camera': '步驟四 · 即時定位',
    'camera-hint': '請舉起手，手背朝上',
    'btn-flip': '切換鏡頭',
    'btn-disc-hide': '隱藏信心圓盤',
    'btn-disc-show': '顯示信心圓盤',
    'btn-massage': '現在開始按摩',

    // ── 05 按摩 ──
    'eyebrow-massage': '步驟五 · 雙手確認',
    'massage-hint': '用另一隻手的指尖對準穴道圓盤',
    'massage-timer': '按摩時間（每隻手）',
    'btn-massage-start': '開始按摩',
    'timer-tip': '計時只在指尖對準穴道時前進',
    'round-label': '本輪',
    'hand-left': '左手',
    'hand-right': '右手',
    'round-tip': '同一個穴道左右手各有一個，兩隻手都按完才算完成。',
    'menu-open': '相機與結束選項',
    'menu-end-early': '提早結束',
    'menu-end-early-desc': '本穴不計入紀錄與圖冊',
    'confirm-end-early': '提早結束這一穴？\n\n因為沒有按滿時間，這一次不會計入紀錄、圖冊與連續天數。',

    // ── 06 完成 ──
    'eyebrow-complete': '完成',
    'btn-next-acu': '下一穴',

    // ── 07 臉部定位 ──
    'eyebrow-face': '臉部 · 即時定位',
    'face-title': '臉部穴道',
    'face-hint': '請正對鏡頭',
    'face-btn-start': '開始臉部定位',
    'face-btn-refs': '顯示參考點',
    'face-btn-refs-hide': '隱藏參考點',
    'face-honest': '目前 23 個臉部穴道只完成 4 個的定位公式，且參數只建立在 1 人 1 張照片上，位置僅供參考。其餘穴道在選穴頁標為「準備中」，不會假裝算得出來。',

    // ── 圖冊 ──
    'eyebrow-gallery': '收集',
    'gallery-title': '穴道圖冊',
    'info-locate': '定位',
    'info-symptoms': '主治',
    'info-level': '等級',
    'info-times': '累計',
    'info-last': '最後一次',
    'info-nosymptom': '尚未對應症狀',
    'info-nolocate': '尚未支援定位',
    'btn-practice': '練這一穴',
    'ref-title': '參考圖',
    'ref-cap': '自製參考圖',
    'ref-none': '尚無參考圖',
    'side-dorsal': '手背',
    'side-palm': '手心',
    'side-both': '手側緣（正反面皆可）',

    // ── 設定（目錄 + 四個子頁）──
    'eyebrow-settings': '校正',
    'settings-title': '設定',
    'settings-group-general': '一般',
    'settings-group-locate': '定位',
    'settings-group-data': '資料',
    // 語言
    'settings-lang': '語言',
    'settings-lang-desc': '穴道名稱與症狀名在英文模式下會顯示英文對照，沒有對照的仍顯示中文。',
    // 每日提醒
    'settings-notify': '每日提醒',
    'settings-notify-off': '關閉',
    'settings-notify-enable': '啟用每日提醒',
    'settings-notify-time': '提醒時間',
    'settings-notify-plan': '提醒內容',
    'settings-notify-mode-none': '不指定',
    'settings-notify-mode-symptom': '依症狀',
    'settings-notify-mode-acupoint': '直接選穴道',
    'settings-notify-desc-none': '時間到了只提醒你來按，不指定按什麼。',
    'settings-notify-desc-symptom': '選幾個症狀。點提醒進來時會幫你把這些症狀勾好，直接落在推薦穴道那一頁。',
    'settings-notify-desc-acupoint': '直接指定要按的穴道。點提醒進來時會排成今天的療程，直接落在認穴頁。只列得出算得出位置的穴道。',
    'settings-notify-emergency': '昏迷急救與中暑是急症，不列入每日提醒——那種情況要打 119，不是排按摩。',
    'settings-notify-limit': '提醒只在這個網頁開著的時候會響。瀏覽器關掉之後系統不會叫你——這一版沒有背景排程，我們不假裝有。',
    // 定位精度
    'settings-accuracy': '定位精度',
    'settings-strict-on': '嚴格',
    'settings-strict-off': '寬鬆',
    'settings-strict': '嚴格模式：角度不佳時不顯示穴位',
    'settings-strict-desc': '關閉後，即使手掌傾斜過大也會畫出穴位，但位置誤差可能很大。',
    'settings-strict-why': '系統寧可少標一個點，也不給一個看起來很篤定、其實是猜的紅點。關掉這個開關不會讓定位變準，只會讓系統不再把不確定的結果擋下來。',
    // 資料與紀錄
    'settings-data': '資料與紀錄',
    'settings-data-where': '所有紀錄都只存在這台裝置的瀏覽器裡，不會上傳。攝影機影像全程在本機運算，一幀都沒有離開過這台電腦。',
    'settings-reset': '清除所有紀錄',
    'settings-reset-desc': '清除會刪掉按摩紀錄、圖冊收集與連續天數。語言、每日提醒與定位設定不受影響。這個動作無法復原。',

    // ── 個人 ──
    'eyebrow-profile': '紀錄',
    'profile-title': '個人',
    'profile-top': '最常按的穴道',
    'profile-levels': '小人等級分布',
    'profile-empty': '還沒有紀錄。完成一次按摩就會出現在這裡。',
    'stat-streak': '連續天數',
    'stat-total': '累計次數',
    'stat-unlocked': '已解鎖',
    'stat-today': '今日完成',
  },

  en: {
    'nav-home': 'Home', 'nav-gallery': 'Collection', 'nav-settings': 'Settings', 'nav-profile': 'Profile',

    'step-1': 'Symptom', 'step-2': 'Points', 'step-3': 'Anatomy', 'step-4': 'Locate', 'step-5': 'Massage',

    'btn-back': '← Back',
    'btn-stop': '← Stop',
    'btn-next': 'Next',
    'btn-home': 'Home',
    'btn-gallery': 'Collection',

    'eyebrow-home': 'Step 1 · Complaint',
    'home-title': 'Select Your Symptoms',
    'home-desc': 'Choose multiple symptoms; we\'ll recommend acupoints',
    'disclaimer': 'This is an acupoint locating aid based on traditional Chinese medicine literature. It is NOT medical diagnosis or treatment advice. See a doctor if unwell.',

    'eyebrow-recommend': 'Step 2 · Point Selection',
    'recommend-title': 'Recommended Acupoints',
    'recommend-desc': 'Select the acupoints you want to massage',
    'btn-start': 'Start Treatment',
    'region-hand': 'Hand',
    'region-elbow': 'Elbow',
    'region-face': 'Face',
    'region-soon': 'This region is still in development. Hand and face acupoints can be located; elbow is planned for a later version.',
    'region-empty': 'No acupoints in this region for the symptoms you selected.',

    'eyebrow-detail': 'Step 3 · Anatomy',
    'btn-tutorial': 'Tutorial',
    'btn-locate': 'Start Locating',

    'eyebrow-camera': 'Step 4 · Live Locating',
    'camera-hint': 'Raise your hand, back of hand facing the camera',
    'btn-flip': 'Switch Camera',
    'btn-disc-hide': 'Hide Confidence Disc',
    'btn-disc-show': 'Show Confidence Disc',
    'btn-massage': 'Start Massage',

    'eyebrow-massage': 'Step 5 · Two-Hand Check',
    'massage-hint': 'Point your other hand\'s fingertip at the disc',
    'massage-timer': 'Duration (per hand)',
    'btn-massage-start': 'Start',
    'timer-tip': 'The timer only advances while your fingertip is on target',
    'round-label': 'Round',
    'hand-left': 'Left hand',
    'hand-right': 'Right hand',
    'round-tip': 'This acupoint exists on both hands. It counts as done only after you finish both.',
    'menu-open': 'Camera and exit options',
    'menu-end-early': 'End Early',
    'menu-end-early-desc': 'Not counted toward your record',
    'confirm-end-early': 'End this acupoint early?\n\nSince the timer did not finish, this session will not count toward your record, collection or streak.',

    'eyebrow-complete': 'Complete',
    'btn-next-acu': 'Next Acupoint',

    'eyebrow-face': 'Face · Live Locating',
    'face-title': 'Facial Acupoints',
    'face-hint': 'Face the camera',
    'face-btn-start': 'Start Facial Locating',
    'face-btn-refs': 'Show Reference Points',
    'face-btn-refs-hide': 'Hide Reference Points',
    'face-honest': 'Only 4 of the 23 facial acupoints have a locating formula so far, and the parameters come from a single photo of one person. Positions are indicative only. The rest are marked "SOON" on the selection page rather than faked.',

    'eyebrow-gallery': 'Collection',
    'gallery-title': 'Acupoint Collection',
    'info-locate': 'Location',
    'info-symptoms': 'Used For',
    'info-level': 'Level',
    'info-times': 'Sessions',
    'info-last': 'Last',
    'info-nosymptom': 'No symptom mapped yet',
    'info-nolocate': 'Locating not supported yet',
    'btn-practice': 'Practise This Point',
    'ref-title': 'Reference',
    'ref-cap': 'in-house drawing',
    'ref-none': 'No reference drawing yet',
    'side-dorsal': 'Back of hand',
    'side-palm': 'Palm',
    'side-both': 'Side edge (either face works)',

    'eyebrow-settings': 'Calibration',
    'settings-title': 'Settings',
    'settings-group-general': 'General',
    'settings-group-locate': 'Locating',
    'settings-group-data': 'Data',
    'settings-lang': 'Language',
    'settings-lang-desc': 'In English mode, acupoint and symptom names show their English equivalents; those without one stay in Chinese.',
    'settings-notify': 'Daily Reminder',
    'settings-notify-off': 'Off',
    'settings-notify-enable': 'Enable Daily Reminder',
    'settings-notify-time': 'Reminder Time',
    'settings-notify-plan': 'What to Remind',
    'settings-notify-mode-none': 'Unspecified',
    'settings-notify-mode-symptom': 'By Symptom',
    'settings-notify-mode-acupoint': 'Pick Acupoints',
    'settings-notify-desc-none': 'Just remind you to practise, without naming anything.',
    'settings-notify-desc-symptom': 'Pick a few symptoms. Opening the reminder pre-selects them and drops you straight on the recommended acupoints page.',
    'settings-notify-desc-acupoint': 'Name the acupoints directly. Opening the reminder queues them as today\'s session and drops you on the anatomy page. Only acupoints we can actually locate are listed.',
    'settings-notify-emergency': 'Fainting and heatstroke are emergencies and are deliberately left out of daily reminders — those call for 119, not a scheduled massage.',
    'settings-notify-limit': 'The reminder only fires while this page is open. Once you close the browser nothing will call you — this version has no background scheduling, and we are not going to pretend otherwise.',
    'settings-accuracy': 'Locating Accuracy',
    'settings-strict-on': 'Strict',
    'settings-strict-off': 'Lenient',
    'settings-strict': 'Strict mode: hide acupoint when angle is poor',
    'settings-strict-desc': 'When off, acupoints are drawn even at large tilt, but positional error may be large.',
    'settings-strict-why': 'We would rather skip a point than draw a confident-looking red dot that is really a guess. Turning this off does not make locating more accurate — it only stops the system from holding back uncertain results.',
    'settings-data': 'Data & Records',
    'settings-data-where': 'Everything is stored in this device\'s browser only and never uploaded. Camera frames are processed locally — not one frame leaves this computer.',
    'settings-reset': 'Clear All Progress',
    'settings-reset-desc': 'Clearing removes your session history, collection and streak. Language, reminder and locating settings are untouched. This cannot be undone.',

    'eyebrow-profile': 'Record',
    'profile-title': 'Your Record',
    'profile-top': 'Most Massaged',
    'profile-levels': 'Minion Levels',
    'profile-empty': 'No records yet. Finish one session and it shows up here.',
    'stat-streak': 'Streak',
    'stat-total': 'Sessions',
    'stat-unlocked': 'Unlocked',
    'stat-today': 'Today',
  }
};

const SYMPTOM_EN = {
  '緩解目痛': 'Eye Pain', '緩解感冒症狀': 'Cold Symptoms', '腸胃不適': 'Digestive Upset',
  '緩解牙痛': 'Toothache', '緩解頭痛': 'Headache', '改善失眠': 'Insomnia',
  '緩解胸痛': 'Chest Discomfort', '緩解耳鳴': 'Tinnitus', '緩解腕痛': 'Wrist Pain',
  '昏迷急救': 'Fainting (Emergency)', '中暑': 'Heatstroke (Emergency)',
  '放鬆手指': 'Finger Relaxation', '緩解喉嚨痛': 'Sore Throat',
};

let currentLanguage = localStorage.getItem('language') || 'zh';

const t = (k) => (i18n[currentLanguage] && i18n[currentLanguage][k]) || i18n.zh[k] || k;
const isZh = () => currentLanguage === 'zh';

// 穴名的英文在 ACUPOINT_DETAIL[name].en，沒有就退回中文
function acuLabel(name) {
  if (isZh()) return name;
  const d = ACUPOINT_DETAIL[name];
  return d && d.en ? d.en : name;
}
const symptomLabel = (name) => isZh() ? name : (SYMPTOM_EN[name] || name);

// 把 root 底下所有 data-i18n 的靜態文字換掉。
// 動態插進來的 DOM（如返回列的動作區）要自己叫一次
function applyI18n(root) {
  root.querySelectorAll('[data-i18n]').forEach(el => {
    const val = i18n[currentLanguage] && i18n[currentLanguage][el.getAttribute('data-i18n')];
    if (val !== undefined) el.textContent = val;
  });
}

function updateLanguage() {
  applyI18n(document);
  document.documentElement.lang = isZh() ? 'zh-TW' : 'en';
}

// 切語言。入口在「設定」分頁（pages/tab-settings.js）
function setLanguage(lang) {
  if (lang === currentLanguage) return;
  currentLanguage = lang;
  localStorage.setItem('language', lang);
  updateLanguage();
  // 動態產生的文字不吃 data-i18n，要叫當前頁自己重繪（nav.js）
  notifyLanguageChange();
}
