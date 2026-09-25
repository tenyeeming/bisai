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
    'nav-home': '首頁', 'nav-gallery': '圖冊', 'nav-settings': '設定',
    // ── 步驟軌 ──
    // 首頁（選症狀）是進入點不是步驟，不上軌；療程從選穴才開始算 01。
    'step-1': '選穴', 'step-2': '認穴', 'step-3': '定位', 'step-4': '按摩',

    // ── 共用按鈕 ──
    'btn-back': '← 返回',
    'btn-stop': '← 停止',
    'btn-next': '下一步',
    'btn-home': '回首頁',
    'btn-gallery': '圖冊',

    // ── 01 症狀 ──
    'eyebrow-home': '主訴',
    'home-title': '選擇你的症狀',
    'home-desc': '最多選擇三個症狀，查看相關穴道',
    'disclaimer': '本系統為穴位定位輔助工具，內容依據傳統中醫文獻整理，不構成醫療診斷或治療建議。身體不適請就醫。',

    // ── 02 選穴 ──
    'eyebrow-recommend': '步驟一 · 配穴',
    'recommend-title': '推薦穴道',
    'recommend-desc': '系統推薦了下列穴道，請勾選你要按摩的穴道',
    'btn-start': '開始療程',
    // 選穴頁的 ⓘ：不用選完進到下一頁才知道這穴道是什麼（2026-09-02 用戶提）
    'a11y-info': '查看詳情',
    // ▾ 逐穴按壓秒數（2026-09-08）
    'a11y-time': '調整這一穴的按壓時間',
    'time-per-hand': '單手按壓',
    'time-need-pick': '先勾選這個穴道，才能調它的時間',
    'time-reset': '⟲ 跟著預設',
    'info-locate': '定位',
    'info-side': '朝向',
    'btn-close': '關閉',
    'region-hand': '手部',
    'region-elbow': '手肘',
    'region-face': '臉部',
    'region-soon': '這個部位還在開發中。手部與臉部已可定位，手肘會在後續版本開放。',
    'region-empty': '你選的症狀在這個部位沒有對應的穴道。',

    // ── 03 認穴 ──
    'eyebrow-detail': '步驟二 · 定位說明',
    'btn-tutorial': '看教學',
    'btn-locate': '開始定位',

    // ── 04 定位 ──
    'eyebrow-camera': '步驟三 · 即時定位',
    'camera-hint': '請舉起手，手背朝上',
    // 即時數據面板（2026-09-20，桌面版型）
    'btn-flip': '切換鏡頭',
    'btn-disc-hide': '隱藏信心圓盤',
    'btn-disc-show': '顯示信心圓盤',
    'btn-massage': '現在開始按摩',

    // ── 05 按摩 ──
    'eyebrow-massage': '步驟四 · 雙手確認',
    'massage-hint': '用另一隻手的指尖對準穴道圓盤',
    'massage-timer': '按摩時間（每隻手）',
    'btn-massage-start': '開始按摩',
    'btn-shrink': '⤡ 縮小',
    'btn-zoom': '⤢ 放大顯示',
    'round-label': '本輪',
    'hand-left': '左手',
    'hand-right': '右手',
    'round-face': '臉部',
    'massage-hint-face': '用指尖對準畫面上的穴位圓盤',
    'btn-ready-now': '立即開始',
    'menu-advance-auto': '換穴：自動',
    'menu-advance-manual': '換穴：手動',
    'menu-open': '療程設定',
    'menu-end-early': '跳過這一穴',
    'menu-end-early-desc': '這一穴不算完成',
    'menu-fingers': '按摩手指',
    'menu-press-on': '按壓判定：開',
    'menu-press-off': '按壓判定：關',
    'finger-thumb': '拇指', 'finger-index': '食指', 'finger-middle': '中指', 'finger-ring': '無名指',
    'finger-need-one': '至少要留一根手指，不然按壓永遠判定不到。',
    'confirm-skip-locate': '跳過這一穴？\n\n這一穴不按，直接換下一穴。',
    'confirm-end-early': '跳過這一穴？\n\n因為沒有按滿時間，這一穴不算完成，小人也不會出來慶祝。',

    // ── 06 完成 ──
    'home-limit-toast': '已經選了 {n} 個，是這一次的上限。要換的話先取消一個。',
    'face-sheet-press': '按壓方式',
    'face-sheet-desc': '說明',
    'face-turn-back': '臉轉太多了，請往箭頭方向轉回來',
    'preset-time-per-hand': '這一穴每隻手按幾秒',
    'preset-time-total': '左右各一輪，這一穴共 {n} 秒',
    'preset-time-reset': '跟回預設',
    'preset-time-need-pick': '先勾這個穴道才能調時間',
    'preset-time-default': '未調整，跟著這一組的預設 {n} 秒',
    'settings-skeleton': '顯示手部節點',
    'settings-skeleton-desc': '關閉時取景框只留穴道位置，不畫手上那 21 個白點，按摩那隻手的指尖點也一併隱藏（指引箭頭照畫）。不影響定位精度與按壓判定。',
    'settings-acu-names': '鏡頭中顯示穴位名稱',
    'settings-acu-names-desc': '關閉時取景框只畫穴位的點，不寫名字（手部與臉部都一樣）。不影響定位與按壓判定。',
    'gate-need-presser': '請把另一隻手也放進畫面 — 要用它的指尖去按。',
    'gate-on-target': '按對了，保持住。',
    'gate-off-target': '還沒對準，把指尖移到綠點上。',
    'gate-off-target-mm': '還差 {n} mm，把指尖移到綠點上。',
    'eyebrow-complete': '完成',
    'btn-next-acu': '下一穴',
    // 2026-09-25（網頁v2 批 D）照 App strings：跳過的說明拿掉「紀錄」那半句（網頁不存紀錄）
    'complete-title': '這一穴完成',
    'complete-title-skipped': '這一穴跳過了',
    'complete-desc': '休息一下，準備下一穴。',
    'complete-desc-skipped': '沒按完也沒關係，這一穴不算完成。',
    'complete-auto-next': '{n} 秒後自動接下一穴',
    'btn-finish': '結束並看總結',

    // ── 08 總結 ──（App 沒有標題：舞台自己就說明了這是結束畫面）
    'summary-skipped': '跳過',
    'summary-empty': '這次沒有完成任何一穴。',

    // ── 07 臉部定位 ──
    'eyebrow-face': '臉部 · 即時定位',
    'face-title': '臉部穴道',
    'face-hint': '請正對鏡頭',
    'face-btn-refs': '顯示參考點',
    'face-btn-refs-hide': '隱藏參考點',
    'face-honest': '目前 23 個臉部穴道完成 15 個的定位公式，且參數只建立在 1 人 1 張照片上，位置僅供參考。其餘穴道在選穴頁標為「準備中」，不會假裝算得出來。',
    'face-honest-short': '臉部定位的參數只建立在 1 人 1 張照片上，位置僅供參考。',

    // ── 圖冊 ──
    'splash-skip': '點一下跳過',
    'eyebrow-gallery': '圖鑑',
    'gallery-title': '穴道圖冊',
    // 分組標題（2026-09-20 圖冊納入臉部）。%n 換成這一組有幾穴
    'gallery-group-hand': '手部穴道 · %n',
    'gallery-group-face': '臉部穴道 · %n',
    'gallery-group-forearm': '前臂穴道 · %n（尚未開放定位）',
    'info-locate': '定位',
    'info-symptoms': '主治',
    'info-nosymptom': '尚未對應症狀',
    'info-symptom-go': '以這個症狀開始一次療程',
    'info-nolocate': '尚未支援定位',
    'btn-practice': '練習',
    'ref-title': '參考圖',
    'ref-cap': '自製參考圖',
    'ref-none': '尚無參考圖',
    'btn-play-video': '教學影片',
    'side-dorsal': '手背',
    'side-palm': '手心',
    'side-both': '手側緣（正反面皆可）',

    // ── 設定（目錄 + 四個子頁）──
    'eyebrow-settings': '校正',
    'settings-title': '設定',
    'settings-group-general': '一般',
    // 2026-09-21：組名對齊 App 的 settings_group_flow（「療程」）。
    // 舊 key 'settings-group-locate'（「定位」）已停用 —— App 的設定目錄沒有這一組。
    'settings-group-flow': '療程',
    // 顯示（字體大小）。對齊 App 的 settings_display 那一組字串
    'settings-display': '顯示',
    'settings-fontsize': '字體大小',
    'settings-fontsize-desc': '只改字的大小，邊框與間距不變。改完立刻套用到整個網站。',
    'settings-fontsize-preview': '這一行是最小的內文字級，選「小」之後看得清楚嗎？',
    'settings-fontsize-sys': '這個設定是乘在瀏覽器字體大小上的。若還是不夠大，可再到瀏覽器或手機的字體設定一起調。',
    'font-small': '小',
    'font-medium': '中',
    'font-large': '大',
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
    'settings-notify-limit': '提醒只在這個網頁開著的時候會響。瀏覽器關掉之後系統不會叫你——這一版沒有背景排程，我們不假裝有。',
    // 療程節奏
    'settings-flow': '療程節奏',
    'settings-ready': '認穴停留',
    'settings-ready-desc': '認穴頁停留幾秒後自動進入定位。設 0 就不倒數、也不自動翻頁，讀完自己按「開始定位」。',
    'settings-handorder': '手序',
    'settings-handorder-desc': '同一個穴道左右手各按一輪，這裡決定先按哪一隻。',
    'settings-switch': '換手倒數',
    'settings-switch-desc': '一隻手按滿之後，倒數幾秒自動開始下一隻手。手還舉在鏡頭前的時候很難再點一次按鈕，所以預設是自動接上。',
    // 這兩項按摩頁也調得到（齒輪／滑桿），這裡是同一份設定的另一個入口（2026-09-02 用戶要）
    'settings-advance': '換穴',
    'settings-advance-desc': '一個穴道左右手都按完之後，要不要自動接下一個穴道。「自動」會在完成頁倒數 4 秒再接下一穴；「手動」就停在完成頁等你點。定位頁與按摩頁的齒輪也調得到，改的是同一項。',
    'settings-press': '單手秒數',
    'settings-press-desc': '一隻手按幾秒。左右各一輪，所以一個穴道的實際時間是這個數字的兩倍。這是「沒特別調過時」的預設值 —— 想讓某一穴久一點，在認穴頁拉那一穴的滑桿，只會影響那一穴。',
    'advance-auto': '自動',
    'advance-manual': '手動',
    // 我的流程（2026-09-08）
    'settings-presets': '我的流程',
    'settings-presets-desc': '把常按的一組穴道存起來，下次點一下就直接開始，不用再走一次選症狀。',
    'preset-none': '尚未建立',
    'preset-empty': '還沒有任何流程。按下面的「新增流程」，把你常按的那幾個穴道存成一組。',
    'preset-new': '＋ 新增流程',
    'preset-start': '開始',
    'preset-untitled': '未命名流程',
    'preset-name': '名稱',
    'preset-name-ph': '例：睡前這組',
    'preset-acu': '手部穴道',
    'preset-acu-desc': '只列得出算得出位置的穴道 —— 排一個定位不了的穴，等於自己排一個失敗。',
    'preset-face': '臉部穴道',
    'preset-face-desc': '臉部一律排在療程最後：手部與臉部用不同模型、共用同一個鏡頭，中途來回切換要重載。',
    'preset-flow': '這組的節奏',
    'preset-flow-desc': '這套節奏只在跑這組流程時生效，回首頁就還原成「療程節奏」那頁的設定，不會改到你的預設值。',
    'preset-est-none': '還沒選穴道。',
    'preset-save': '儲存',
    'btn-cancel': '取消',
    'preset-delete': '刪除這組流程',
    'preset-delete-confirm': '刪除這組流程？',
    'preset-need-acu': '至少要選一個穴道。',
    'preset-full': '流程數量已達上限。',
    // 定位精度。⚠️ 設定目錄 2026-09-21 起不再有這個入口（對齊 App，行為固定嚴格），
    //    頁面本身還在，所以這幾個 key 留著。'settings-strict-on/off' 那兩個
    //    只有目錄的摘要欄用得到，入口拿掉後沒人用，已刪。
    'settings-accuracy': '定位精度',
    'settings-strict': '嚴格模式：角度不佳時不顯示穴位',
    'settings-strict-desc': '關閉後，即使手掌傾斜過大也會畫出穴位，但位置誤差可能很大。',
    'settings-strict-why': '系統寧可少標一個點，也不給一個看起來很篤定、其實是猜的紅點。關掉這個開關不會讓定位變準，只會讓系統不再把不確定的結果擋下來。',
  },

  en: {
    'nav-home': 'Home', 'nav-gallery': 'Atlas', 'nav-settings': 'Settings',
    'step-1': 'Points', 'step-2': 'Anatomy', 'step-3': 'Locate', 'step-4': 'Massage',

    'btn-back': '← Back',
    'btn-stop': '← Stop',
    'btn-next': 'Next',
    'btn-home': 'Home',
    'btn-gallery': 'Atlas',

    'eyebrow-home': 'Complaint',
    'home-title': 'Select Your Symptoms',
    'home-desc': 'Choose up to three symptoms to see related acupoints',
    'disclaimer': 'This is an acupoint locating aid based on traditional Chinese medicine literature. It is NOT medical diagnosis or treatment advice. See a doctor if unwell.',

    'eyebrow-recommend': 'Step 1 · Point Selection',
    'recommend-title': 'Recommended Acupoints',
    'recommend-desc': 'Select the acupoints you want to massage',
    'btn-start': 'Start Treatment',
    'a11y-info': 'View details',
    'a11y-time': 'Adjust press time for this point',
    'time-per-hand': 'Per hand',
    'time-need-pick': 'Select this acupoint first to adjust its time',
    'time-reset': '⟲ Use default',
    'info-locate': 'Location',
    'info-side': 'Facing',
    'btn-close': 'Close',
    'region-hand': 'Hand',
    'region-elbow': 'Elbow',
    'region-face': 'Face',
    'region-soon': 'This region is still in development. Hand and face acupoints can be located; elbow is planned for a later version.',
    'region-empty': 'No acupoints in this region for the symptoms you selected.',

    'eyebrow-detail': 'Step 2 · Anatomy',
    'btn-tutorial': 'Tutorial',
    'btn-locate': 'Start Locating',

    'eyebrow-camera': 'Step 3 · Live Locating',
    'camera-hint': 'Raise your hand, back of hand facing the camera',
    // Live readout panel (2026-09-20, desktop layout)
    'btn-flip': 'Switch Camera',
    'btn-disc-hide': 'Hide Confidence Disc',
    'btn-disc-show': 'Show Confidence Disc',
    'btn-massage': 'Start Massage',

    'eyebrow-massage': 'Step 4 · Two-Hand Check',
    'massage-hint': 'Point your other hand\'s fingertip at the disc',
    'massage-timer': 'Duration (per hand)',
    'btn-massage-start': 'Start',
    'btn-shrink': '⤡ Exit fullscreen',
    'btn-zoom': '⤢ Fullscreen',
    'round-label': 'Round',
    'hand-left': 'Left hand',
    'hand-right': 'Right hand',
    'round-face': 'Face',
    'massage-hint-face': 'Put your fingertip on the marker on screen',
    'btn-ready-now': 'Start Now',
    'menu-advance-auto': 'Next point: auto',
    'menu-advance-manual': 'Next point: manual',
    'menu-open': 'Session settings',
    'menu-end-early': 'Skip this point',
    'menu-end-early-desc': 'This point won\'t count as done',
    'menu-fingers': 'Pressing fingers',
    'menu-press-on': 'Press check: on',
    'menu-press-off': 'Press check: off',
    'finger-thumb': 'Thumb', 'finger-index': 'Index', 'finger-middle': 'Middle', 'finger-ring': 'Ring',
    'finger-need-one': 'Keep at least one finger, or a press can never be detected.',
    'confirm-skip-locate': 'Skip this acupoint?\n\nIt will not be pressed; moving on to the next one.',
    'confirm-end-early': 'Skip this acupoint?\n\nSince the timer did not finish, this point will not count as done and its minion will not celebrate.',

    'home-limit-toast': '{n} is the limit for one session. Deselect one to swap.',
    'face-sheet-press': 'How to press',
    'face-sheet-desc': 'About',
    'face-turn-back': 'Face turned too far — turn back toward the arrow',
    'preset-time-per-hand': 'Seconds per hand for this point',
    'preset-time-total': 'Both hands - {n}s for this point',
    'preset-time-reset': 'Back to default',
    'preset-time-need-pick': 'Select this point first to set its time',
    'preset-time-default': 'Not adjusted - follows the routine default of {n}s',
    'settings-skeleton': 'Show hand landmarks',
    'settings-skeleton-desc': 'When off, the viewfinder shows only the acupoint — the 21 white dots and the pressing fingertip marker are hidden (the guide arrow stays). Accuracy and press detection are unaffected.',
    'settings-acu-names': 'Show acupoint names in camera',
    'settings-acu-names-desc': 'When off, the viewfinder shows only the dots, without names (hand and face). Locating and press detection are unaffected.',
    'gate-need-presser': 'Bring your other hand into view — you press with its fingertip.',
    'gate-on-target': 'On target — hold it.',
    'gate-off-target': 'Not aligned yet. Move your fingertip onto the green dot.',
    'gate-off-target-mm': '{n} mm to go. Move your fingertip onto the green dot.',
    'eyebrow-complete': 'Complete',
    'btn-next-acu': 'Next Acupoint',
    'complete-title': 'Point complete',
    'complete-title-skipped': 'Point skipped',
    'complete-desc': 'Take a breath, then the next point.',
    'complete-desc-skipped': 'That is fine. This point is not counted as done.',
    'complete-auto-next': 'Next point in {n}s',
    'btn-finish': 'Finish and see summary',

    'summary-skipped': 'Skipped',
    'summary-empty': 'No point was completed this session.',

    'eyebrow-face': 'Face · Live Locating',
    'face-title': 'Facial Acupoints',
    'face-hint': 'Face the camera',
    'face-btn-refs': 'Show Reference Points',
    'face-btn-refs-hide': 'Hide Reference Points',
    'face-honest': 'So far 15 of the 23 facial acupoints have a locating formula, and the parameters come from a single photo of one person. Positions are indicative only. The rest are marked "SOON" on the selection page rather than faked.',
    'face-honest-short': 'Facial locating parameters come from a single photo of one person. Positions are indicative only.',

    'splash-skip': 'Tap to skip',
    'eyebrow-gallery': 'Atlas',
    'gallery-title': 'Acupoint Atlas',
    'gallery-group-hand': 'Hand · %n',
    'gallery-group-face': 'Face · %n',
    'gallery-group-forearm': 'Forearm · %n (no locating yet)',
    'info-locate': 'Location',
    'info-symptoms': 'Used For',
    'info-nosymptom': 'No symptom mapped yet',
    'info-symptom-go': 'Start a session for this symptom',
    'info-nolocate': 'Locating not supported yet',
    'btn-practice': 'Practise',
    'ref-title': 'Reference',
    'ref-cap': 'in-house drawing',
    'ref-none': 'No reference drawing yet',
    'btn-play-video': 'Tutorial video',
    'side-dorsal': 'Back of hand',
    'side-palm': 'Palm',
    'side-both': 'Side edge (either face works)',

    'eyebrow-settings': 'Calibration',
    'settings-title': 'Settings',
    'settings-group-general': 'General',
    'settings-group-flow': 'Treatment',
    'settings-display': 'Display',
    'settings-fontsize': 'Text Size',
    'settings-fontsize-desc': 'Only the text size changes; borders and spacing stay the same. Applies to the whole site immediately.',
    'settings-fontsize-preview': 'This line uses the smallest body size — is it still readable on "Small"?',
    'settings-fontsize-sys': 'This setting multiplies your browser text size. If it is still too small, adjust your browser or phone text size as well.',
    'font-small': 'Small',
    'font-medium': 'Medium',
    'font-large': 'Large',
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
    'settings-notify-limit': 'The reminder only fires while this page is open. Once you close the browser nothing will call you — this version has no background scheduling, and we are not going to pretend otherwise.',
    'settings-flow': 'Session Pacing',
    'settings-ready': 'Anatomy Dwell',
    'settings-ready-desc': 'Seconds to stay on the anatomy page before locating starts. Set 0 for no countdown and no automatic page turn — press Start Locating yourself.',
    'settings-handorder': 'Hand Order',
    'settings-handorder-desc': 'Each acupoint is pressed on both hands. This decides which one goes first.',
    'settings-switch': 'Hand-Switch Countdown',
    'settings-switch-desc': 'Seconds before the next hand starts automatically. Tapping a button is awkward with your hand still up at the camera, so it continues on its own by default.',
    'settings-advance': 'Next point',
    'settings-advance-desc': 'Whether to continue to the next acupoint automatically once both hands are done. Auto counts down 4 seconds on the completion page first; Manual stops there. The gear menu on the locating and massage pages changes the same setting.',
    'settings-press': 'Seconds per hand',
    'settings-press-desc': 'How long each hand presses. Both hands get a round, so one acupoint takes twice this. This is the default for points you have not tuned - to give one point longer, drag its slider on the anatomy page.',
    'advance-auto': 'Auto',
    'advance-manual': 'Manual',
    'settings-presets': 'My Routines',
    'settings-presets-desc': 'Save the set of acupoints you press regularly. Next time it is one tap - no walking through the symptom list again.',
    'preset-none': 'None yet',
    'preset-empty': 'No routines yet. Tap Add Routine below to save the acupoints you press most often as one set.',
    'preset-new': '+ Add Routine',
    'preset-start': 'Start',
    'preset-untitled': 'Untitled routine',
    'preset-name': 'Name',
    'preset-name-ph': 'e.g. Before bed',
    'preset-acu': 'Hand acupoints',
    'preset-acu-desc': 'Only acupoints we can actually locate are listed - queueing one we cannot locate is queueing a failure.',
    'preset-face': 'Face acupoints',
    'preset-face-desc': 'Face points always run last: hands and face use different models on the same camera, and switching back and forth means reloading.',
    'preset-flow': 'Pacing for this routine',
    'preset-flow-desc': 'This pacing applies only while this routine runs. Going home restores whatever Session Pacing says - your defaults are left alone.',
    'preset-est-none': 'No acupoints selected yet.',
    'preset-save': 'Save',
    'btn-cancel': 'Cancel',
    'preset-delete': 'Delete this routine',
    'preset-delete-confirm': 'Delete this routine?',
    'preset-need-acu': 'Pick at least one acupoint.',
    'preset-full': 'You have reached the maximum number of routines.',
    'settings-accuracy': 'Locating Accuracy',
    'settings-strict': 'Strict mode: hide acupoint when angle is poor',
    'settings-strict-desc': 'When off, acupoints are drawn even at large tilt, but positional error may be large.',
    'settings-strict-why': 'We would rather skip a point than draw a confident-looking red dot that is really a guess. Turning this off does not make locating more accurate — it only stops the system from holding back uncertain results.',
  }
};

const SYMPTOM_EN = {
  '緩解目痛': 'Eye Pain', '緩解感冒症狀': 'Cold Symptoms', '腸胃不適': 'Digestive Upset',
  '緩解牙痛': 'Toothache', '緩解頭痛': 'Headache', '改善失眠': 'Insomnia',
  '緩解胸痛': 'Chest Discomfort', '緩解耳鳴': 'Tinnitus', '緩解腕痛': 'Wrist Pain', '中暑': 'Heatstroke',
  '放鬆手指': 'Finger Relaxation', '緩解喉嚨痛': 'Sore Throat',
  // 臉部專屬四項（2026-09-20 併入，名稱照資料庫原文）
  '美容': 'Facial Beauty', '鼻子不適': 'Nasal Discomfort',
  '顏面神經麻痺': 'Facial Paralysis', '口腔衛生': 'Oral Hygiene',
  '肘臂痠痛': 'Arm / Elbow Soreness', '聲音沙啞': 'Hoarseness',
  '便祕': 'Constipation', '肩頸痠痛': 'Neck / Shoulder Soreness',
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
