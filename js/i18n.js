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
    // 電腦版左側欄（2026-10-31 方案 D）
    'side-steps': '療程步驟', 'side-session': '這次療程', 'side-step-home': '選症狀',
    'side-disclaimer': '本系統為穴位定位輔助工具，不構成醫療診斷或治療建議。',
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
    'menu-refresh-cam': '重新整理鏡頭',
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
    // 前臂內關（js/forearm-vision.js，文字同 App strings forearm_*）
    'fa-calib-title': '整段前臂（手腕到手肘）放進框裡，手心朝鏡頭、手放平',
    'fa-no-elbow': '手肘要入鏡',
    'fa-out-box': '手腕和手肘都要在框裡',
    'fa-dorsal': '現在是手背，請翻成手心朝鏡頭',
    'fa-calib-title-dorsal': '整段前臂（手腕到手肘）放進框裡，手背朝鏡頭、手放平',
    'fa-palm': '現在是手心，請翻成手背朝鏡頭',
    'fa-no-hand-dorsal': '找不到手：手背朝鏡頭，整段前臂入鏡',
    'fa-twist-dorsal': '手腕扭太多了，轉回手背正對鏡頭',
    'fa-moving': '手別動，再停一下',
    'fa-calib-hold': '很好，停住別動…',
    'fa-calib-done': '已記住你的手肘 ✓',
    // ── 定位前檢測（2026-11-01，App calib_* 照搬；js/calib.js）──
    'calib-title': '先記住你的{hand}：{side}、攤平、手指張開，放進框裡',
    'calib-tilted': '手有點斜，攤平一點、正對鏡頭',
    'calib-fingers': '手指張開伸直',
    'calib-moving': '手先別動',
    'calib-out-box': '整隻手放進框裡（手腕到指尖都要在框內）',
    'calib-wrong': '這一輪是{hand}，請換那隻手',
    'calib-wrong-side': '翻過來，{side}',
    'calib-done': '已記住你的{hand} ✓',
    'calib-side-back': '手背朝鏡頭',
    'calib-side-palm': '手心朝鏡頭',
    'calib-skip': '略過檢測',
    'calib-face-title': '先記住你的臉：正對鏡頭，整張臉放進框裡',
    'calib-face-out-box': '整張臉放進框裡（額頭到下巴都要在框內）',
    'calib-face-turned': '臉轉正一點，正對鏡頭',
    'calib-face-moving': '頭先別動',
    'calib-face-done': '已記住你的臉部 ✓',
    'menu-recalib': '重新檢測手部',
    'menu-recalib-desc': '清掉量過的手，馬上重新量',
    'fa-no-hand': '找不到手：手心朝鏡頭，整段前臂入鏡',
    'fa-twist-pinky': '手腕扭太多了，往小指側轉回來',
    'fa-twist-thumb': '手腕扭太多了，往拇指側轉回來',
    'fa-twist-back': '手腕扭太多了，轉回手心正對鏡頭',
    'fa-not-parallel': '前臂跟螢幕保持平行，不要往前或往後斜',
    'fa-loading': '載入辨識模型中…（第一次較久）',
    'fa-on': '按對了　計時進行中',
    'fa-off': '指尖離開穴道　計時暫停',
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
    // 手部角度閘門擋下（2026-11-05 照 App strings gate_angle_* / twist_turn_*）
    'gate-angle-tilt': '手太傾斜了（{a}°），請把手轉正、正面對著鏡頭。',
    'gate-angle-palm': '這一穴偏離鏡頭 {a}°（上限 {l}°），請把這一面攤平朝向鏡頭。',
    'gate-angle-side': '這一穴偏離鏡頭 {a}°（上限 {l}°），請把手轉成手刀、側緣朝向鏡頭。',
    'twist-turn-pinky': '往小指側轉回來。',
    'twist-turn-index': '往食指側轉回來。',
    'face-pitch-back': '頭抬太高或低太多了，請往箭頭方向轉回來',
    'settings-skeleton': '顯示手部節點',
    'settings-skeleton-desc': '關閉時取景框只留穴道位置，不畫手上那 21 個白點，按摩那隻手的指尖點也一併隱藏。不影響定位精度與按壓判定。',
    'settings-acu-names': '鏡頭中顯示穴位名稱',
    'settings-acu-names-desc': '關閉時取景框只畫穴位的點，不寫名字（手部與臉部都一樣）。不影響定位與按壓判定。',
    'settings-fa-hold': '手肘定位',
    'settings-fa-hold-desc': '鎖定：手穩住 1 秒後點就鎖住，手腕移動點跟著走，手轉動或縮放點不動；手轉太多會先藏起來，轉回來點還在原位。定格：手穩住 1 秒後點釘在畫面上，手腕一移開就重新定位。即時：每一幀重新計算（以前的做法）。',
    'fa-hold-lock': '鎖定',
    'fa-hold-freeze': '定格',
    'fa-hold-live': '即時',
    'fa-hold-seek': '定位中：手穩住 1 秒',
    'fa-hold-locked': '已鎖定',
    'fa-hold-frozen': '已定格',
    'fa-hold-moved': '手回到原本的姿勢',
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

    // ── 圖冊 ──
    'splash-skip': '點一下跳過',
    'eyebrow-gallery': '圖鑑',
    'gallery-title': '穴道圖冊',
    // 分組標題（2026-09-20 圖冊納入臉部）。%n 換成這一組有幾穴
    'gallery-group-hand': '手部穴道 · %n',
    'gallery-group-face': '臉部穴道 · %n',
    'gallery-group-forearm': '前臂穴道 · %n',
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
    'btn-play-video-pending': '教學影片',
    'side-dorsal': '手背',
    'side-palm': '手心',
    'side-both': '手側緣（正反面皆可）',

    // ── 設定（目錄 + 四個子頁）──
    'eyebrow-settings': '校正',
    'settings-title': '設定',
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
    'settings-notify-limit': '提醒只在這個網頁開著的時候會響。瀏覽器關掉之後系統不會叫你——這一版沒有背景排程，我們不假裝有。',
    // 療程節奏
    'settings-flow': '療程節奏',
    'settings-ready': '認穴停留',
    'settings-ready-desc': '開著：認穴頁停留幾秒後自動進入定位。關掉：不自動跳，讀完自己按「開始定位」。',
    'settings-sec': '秒數',
    'toggle-on': '開',
    'toggle-off': '關',
    'settings-handorder': '手序',
    'settings-handorder-desc': '同一個穴道左右手各按一輪，這裡決定先按哪一隻。',
    'settings-switch': '換手倒數',
    'settings-switch-desc': '一隻手按滿後，下一隻手檢測好就倒數自動開始。開著：倒數照下面的秒數；關掉：固定倒數 3 秒。',
    // 這兩項按摩頁也調得到（齒輪／滑桿），這裡是同一份設定的另一個入口（2026-09-02 用戶要）
    'settings-advance': '換穴',
    'settings-advance-desc': '一個穴道左右手都按完之後，要不要自動接下一個穴道。「自動」會在完成頁倒數 4 秒再接下一穴；「手動」就停在完成頁等你點。定位頁與按摩頁的齒輪也調得到，改的是同一項。',
    'settings-hand-calib': '定位前檢測',
    'settings-hand-calib-desc': '開著：每一穴開始前先量一次（約 2 秒）。手部量你的手的尺寸與正面基準，扭轉手腕時點位比較不會漂，這一穴那一面要朝鏡頭；臉部讓穴位記住你的正臉。關掉之後不再每穴檢測，改用這個瀏覽器最近一次量到的數字（沒量過就照原本做法）。手肘（內關）每次都會量，不受這個開關影響。',
    'settings-calib-saved': '已存檔（{date}）：{what}',
    'settings-calib-saved-none': '目前沒有存檔，關掉時定位照原本做法',
    'settings-press': '單手秒數',
    'settings-press-desc': '一隻手按幾秒。左右各一輪，所以一個穴道的實際時間是這個數字的兩倍。這是「沒特別調過時」的預設值 —— 想讓某一穴久一點，在認穴頁拉那一穴的滑桿，只會影響那一穴。',
    'advance-auto': '自動',
    'advance-manual': '手動',
    // 我的流程（2026-09-08）
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
    'side-steps': 'Session steps', 'side-session': 'This session', 'side-step-home': 'Symptoms',
    'side-disclaimer': 'A locating aid only — not medical diagnosis or treatment advice.',
    'step-1': 'Points', 'step-2': 'Anatomy', 'step-3': 'Locate', 'step-4': 'Massage',

    'btn-back': '← Back',
    'btn-stop': '← Stop',
    'btn-next': 'Next',
    'btn-home': 'Home',
    'btn-gallery': 'Atlas',

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
    'menu-refresh-cam': 'Restart Camera',
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
    'fa-calib-title': 'Fit your whole forearm (wrist to elbow) in the box, palm to the camera, hand flat',
    'fa-no-elbow': 'Keep your elbow in view',
    'fa-out-box': 'Both wrist and elbow need to be inside the box',
    'fa-dorsal': 'That\'s the back of your hand — turn your palm to the camera',
    'fa-calib-title-dorsal': 'Fit your whole forearm (wrist to elbow) in the box, back of hand to the camera, hand flat',
    'fa-palm': 'That\'s your palm — turn the back of your hand to the camera',
    'fa-no-hand-dorsal': 'Can\'t see your hand — back of hand to the camera, whole forearm in view',
    'fa-twist-dorsal': 'Wrist twisted too far — turn the back of your hand to face the camera',
    'fa-moving': 'Hold still a moment',
    'fa-calib-hold': 'Good — hold still…',
    'fa-calib-done': 'Got your forearm ✓',
    // ── Measure before locating (2026-11-01, App calib_*; js/calib.js) ──
    'calib-title': 'First, let me learn your {hand}: {side}, flat, fingers spread, inside the frame',
    'calib-tilted': 'Hand is tilted — flatten it and face the camera',
    'calib-fingers': 'Spread and straighten your fingers',
    'calib-moving': 'Hold still for a moment',
    'calib-out-box': 'Fit your whole hand inside the frame, wrist to fingertips',
    'calib-wrong': 'This round is your {hand} — switch hands',
    'calib-wrong-side': 'Turn your hand over: {side}',
    'calib-done': 'Got your {hand} ✓',
    'calib-side-back': 'back of the hand to the camera',
    'calib-side-palm': 'palm to the camera',
    'calib-skip': 'Skip measuring',
    'calib-face-title': 'Let the app learn your face: look straight at the camera and fit your whole face inside the frame',
    'calib-face-out-box': 'Fit your whole face inside the frame (forehead to chin)',
    'calib-face-turned': 'Turn your face a little toward the camera',
    'calib-face-moving': 'Hold your head still',
    'calib-face-done': 'Got your face ✓',
    'menu-recalib': 'Re-measure hands',
    'menu-recalib-desc': 'Clears the measured hands and measures them again right now',
    'fa-no-hand': 'Can\'t see your hand — palm to the camera, whole forearm in view',
    'fa-twist-pinky': 'Wrist twisted too far — rotate back toward your little finger',
    'fa-twist-thumb': 'Wrist twisted too far — rotate back toward your thumb',
    'fa-twist-back': 'Wrist twisted too far — turn your palm back to face the camera',
    'fa-not-parallel': 'Keep your forearm parallel to the screen, not tilted toward or away from it',
    'fa-loading': 'Loading detection models… (slower the first time)',
    'fa-on': 'On target · timing',
    'fa-off': 'Off target · timer paused',
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
    'gate-angle-tilt': 'Your hand is tilted {a}°. Turn it to face the camera.',
    'gate-angle-palm': 'This point is {a}° away from the camera (limit {l}°). Lay this side flat toward the camera.',
    'gate-angle-side': 'This point is {a}° away from the camera (limit {l}°). Turn your hand edge-on to the camera.',
    'twist-turn-pinky': 'Roll your hand back toward the little-finger side.',
    'twist-turn-index': 'Roll your hand back toward the index-finger side.',
    'face-pitch-back': 'Head tilted too far up or down — tilt back toward the arrow',
    'settings-skeleton': 'Show hand landmarks',
    'settings-skeleton-desc': 'When off, the viewfinder shows only the acupoint — the 21 white dots and the pressing fingertip marker are hidden. Accuracy and press detection are unaffected.',
    'settings-acu-names': 'Show acupoint names in camera',
    'settings-acu-names-desc': 'When off, the viewfinder shows only the dots, without names (hand and face). Locating and press detection are unaffected.',
    'settings-fa-hold': 'Forearm locating',
    'settings-fa-hold-desc': 'Lock: after your hand is still for 1 second the point locks — it follows your wrist but ignores hand rotation and scaling; turn too far and it hides until you turn back. Freeze: after 1 second still the point is pinned to the screen; move your wrist away and it relocates. Live: recalculated every frame (the old way).',
    'fa-hold-lock': 'Lock',
    'fa-hold-freeze': 'Freeze',
    'fa-hold-live': 'Live',
    'fa-hold-seek': 'Locating: hold still for 1 s',
    'fa-hold-locked': 'Locked',
    'fa-hold-frozen': 'Frozen',
    'fa-hold-moved': 'Return your hand to its original pose',
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

    'splash-skip': 'Tap to skip',
    'eyebrow-gallery': 'Atlas',
    'gallery-title': 'Acupoint Atlas',
    'gallery-group-hand': 'Hand · %n',
    'gallery-group-face': 'Face · %n',
    'gallery-group-forearm': 'Forearm · %n',
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
    'btn-play-video-pending': 'Tutorial video',
    'side-dorsal': 'Back of hand',
    'side-palm': 'Palm',
    'side-both': 'Side edge (either face works)',

    'eyebrow-settings': 'Calibration',
    'settings-title': 'Settings',
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
    'settings-notify-limit': 'The reminder only fires while this page is open. Once you close the browser nothing will call you — this version has no background scheduling, and we are not going to pretend otherwise.',
    'settings-flow': 'Session Pacing',
    'settings-ready': 'Anatomy Dwell',
    'settings-ready-desc': 'On: locating starts automatically after this many seconds on the anatomy page. Off: no auto-advance — tap Start Locating when you’re ready.',
    'settings-sec': 'Seconds',
    'toggle-on': 'On',
    'toggle-off': 'Off',
    'settings-handorder': 'Hand Order',
    'settings-handorder-desc': 'Each acupoint is pressed on both hands. This decides which one goes first.',
    'settings-switch': 'Hand-Switch Countdown',
    'settings-switch-desc': 'After one hand is done, the next hand starts automatically once it is checked. On: counts down the seconds below. Off: a fixed 3-second countdown.',
    'settings-advance': 'Next point',
    'settings-advance-desc': 'Whether to continue to the next acupoint automatically once both hands are done. Auto counts down 4 seconds on the completion page first; Manual stops there. The gear menu on the locating and massage pages changes the same setting.',
    'settings-hand-calib': 'Measure before locating',
    'settings-hand-calib-desc': 'On: measure once before each point (about 2 s). Hand: the size and front-facing baseline of your hand, so points drift less when you twist your wrist; the side of this point must face the camera. Face: the points lock onto your front-facing face. Off: no measuring at each point; the numbers this browser measured last time are used instead (or the original way if none). The forearm (Neiguan) is always measured, whatever this switch says.',
    'settings-calib-saved': 'Saved ({date}): {what}',
    'settings-calib-saved-none': 'Nothing saved; when off, locating works the original way',
    'settings-press': 'Seconds per hand',
    'settings-press-desc': 'How long each hand presses. Both hands get a round, so one acupoint takes twice this. This is the default for points you have not tuned - to give one point longer, drag its slider on the anatomy page.',
    'advance-auto': 'Auto',
    'advance-manual': 'Manual',
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
