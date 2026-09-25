// ══ 步驟一：選穴 ═════════════════════════════════════════════════
// 症狀 → 穴道的對應表在 js/acu-data.js 的 SYMPTOM_MAP。

registerPage('recommend', {
  tab: 'home',
  step: 1,
  stepLabel: 'step-1',
  backTo: 'home',
  onEnter: () => initRecommendList(),
  onLeave: () => closeInfoSheet(),   // 詳情面板是 fixed 的，不關會蓋在下一頁上
  onLanguage: () => initRecommendList(),

  html: `
  <div id="page-recommend" class="page">
    <style>
      .acupoint-list { display: grid; grid-template-columns: repeat(2, 1fr); gap: 7px; }
      .acu-item {
        display: flex; align-items: center; gap: 8px;
        padding: 11px 12px;
        background: var(--surface);
        border: 1px solid var(--line);
        border-radius: var(--r);
        cursor: pointer;
        font-family: var(--font-ming);
        font-size: 0.9375rem;
        transition: border-color .15s, background .15s;
        user-select: none;
      }
      .acu-item:hover { border-color: var(--brass); }
      .acu-item .dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
      .acu-item .tick {
        margin-left: auto; font-family: var(--font-mono); font-size: 0.75rem;
        color: var(--brass); opacity: 0;
      }
      .acu-item.checked {
        border-color: var(--brass); background: var(--surface-2);
        box-shadow: inset 2px 0 0 var(--brass);
      }
      .acu-item.checked .tick { opacity: 1; }

      /* ── ⓘ 詳情（2026-09-02 用戶提）─────────────────────────
         原本要選完、按「開始療程」進到認穴頁才看得到穴道說明，
         等於「先選再看」。這顆 ⓘ 讓人在勾之前就看得到，
         而且點它不會順手把穴道勾起來（onclick 有 stopPropagation）。 */
      .acu-item .info {
        flex: none; width: 18px; height: 18px; padding: 0;
        border: 1px solid var(--line); border-radius: 50%;
        background: none; color: var(--ink-soft);
        font-family: var(--font-mono); font-size: 0.6875rem; line-height: 1;
        cursor: pointer; display: grid; place-items: center;
      }
      .acu-item .info:hover { border-color: var(--brass); color: var(--brass); }
      .acu-item .tick { margin-left: auto; }
      .acu-item .tick + .info { margin-left: 0; }

      /* ── ▾ 展開：這一穴按幾秒（2026-09-08 用戶要）─────────────
         以前只有一個全域「單手秒數」，而且設定頁只給 15/30/45/60 四個選項。
         合谷跟少商需要的時間本來就不一樣 → 每一格旁邊多一顆 ▾，
         往下展開一條滑桿，逐穴拉。 */
      .acu-item .expand {
        flex: none; width: 18px; height: 18px; padding: 0;
        border: 1px solid var(--line); border-radius: 50%;
        background: none; color: var(--ink-soft);
        font-family: var(--font-mono); font-size: 0.625rem; line-height: 1;
        cursor: pointer; display: grid; place-items: center;
        transition: transform .15s, border-color .15s, color .15s;
      }
      .acu-item .expand:hover:not(:disabled) { border-color: var(--brass); color: var(--brass); }
      .acu-item .expand:disabled { opacity: .3; cursor: not-allowed; }
      .acu-item .expand.open { transform: rotate(180deg); border-color: var(--brass); color: var(--brass); }
      /* 調過秒數的穴道，收合狀態下也要看得出來 —— 不然拉完一合上就沒有痕跡了 */
      .acu-item .secs {
        font-family: var(--font-mono); font-size: 0.65625rem; color: var(--brass);
        letter-spacing: .04em; flex: none;
      }

      /* 面板橫跨兩欄，插在該格後面 —— 兩欄格線會把它推到下一列，
         也就是「從那一格往下展開」。 */
      .acu-time {
        grid-column: 1 / -1;
        border: 1px solid var(--brass); border-radius: var(--r);
        background: var(--surface-2); padding: 11px 13px 13px;
      }
      .acu-time .top { display: flex; align-items: baseline; gap: 8px; }
      .acu-time .k {
        font-family: var(--font-mono); font-size: 0.625rem; letter-spacing: .1em;
        text-transform: uppercase; color: var(--ink-soft);
      }
      .acu-time .v {
        margin-left: auto; font-family: var(--font-mono); font-size: 1.0625rem;
        color: var(--ink); font-variant-numeric: tabular-nums;
      }
      .acu-time .v span { font-size: 0.6875rem; color: var(--ink-soft); margin-left: 2px; }
      .acu-time input[type="range"] { width: 100%; margin: 9px 0 2px; accent-color: var(--brass); }
      .acu-time .foot {
        display: flex; align-items: center; gap: 10px;
        font-family: var(--font-mono); font-size: 0.65625rem; color: var(--ink-soft);
      }
      .acu-time .reset {
        margin-left: auto; padding: 3px 8px; cursor: pointer;
        font-family: var(--font-mono); font-size: 0.65625rem;
        border: 1px solid var(--line); border-radius: var(--r);
        background: none; color: var(--ink-soft);
      }
      .acu-time .reset:hover { border-color: var(--brass); color: var(--brass); }
      .acu-time .reset[hidden] { display: none; }

      /* 詳情面板：置中（2026-09-02 用戶定，原本貼在畫面下緣）。
         ⚠️ App 那邊不照抄這一版 —— 用戶要的是「從下往上滑出」的行動裝置作法。
            網頁在桌機上開的機率高，置中比較穩；手機是單手持握，下緣才好按。
            見 記錄控制/PROGRESS.md 2026-09-02 條的 App 待辦。 */
      .sheet-mask {
        position: fixed; inset: 0; z-index: 40;
        background: rgba(28, 37, 34, .42);
        display: flex; align-items: center; justify-content: center;
        padding: 20px;
      }
      .sheet-mask[hidden] { display: none; }
      .sheet {
        width: 100%; max-width: 420px;
        background: var(--surface);
        border: 1px solid var(--line);
        border-top: 3px solid var(--brass);   /* 黃銅鉻件：這是一塊被拉出來的面板 */
        border-radius: var(--r);
        padding: 16px 18px 20px;
        max-height: 78vh; overflow-y: auto;
      }
      @media (prefers-reduced-motion: no-preference) {
        .sheet { animation: sheet-in .16s ease-out; }
        @keyframes sheet-in { from { transform: scale(.98); opacity: 0; } to { transform: none; opacity: 1; } }
      }
      .sheet-head { display: flex; align-items: baseline; gap: 9px; margin-bottom: 10px; }
      .sheet-head .nm { font-family: var(--font-ming); font-size: 1.5rem; font-weight: 600; }
      .sheet-head .en { font-family: var(--font-mono); font-size: 0.6875rem; color: var(--ink-soft); }
      .sheet-head .x {
        margin-left: auto; flex: none;
        background: none; border: 1px solid var(--line); border-radius: var(--r);
        color: var(--ink-soft); font-family: var(--font-mono); font-size: 0.6875rem;
        padding: 5px 10px; cursor: pointer;
      }
      .sheet-head .x:hover { border-color: var(--brass); color: var(--brass); }
      .sheet .field { margin-top: 11px; }
      .sheet .field .k {
        font-family: var(--font-mono); font-size: 0.625rem; letter-spacing: .16em;
        text-transform: uppercase; color: var(--brass); margin-bottom: 3px;
      }
      .sheet .field .v { font-size: 0.84375rem; color: var(--ink); line-height: 1.6; }
      .sheet .ref-row { display: flex; gap: 12px; align-items: flex-start; margin-top: 12px; }
      .sheet .ref-frame {
        flex: none; width: 42%;
        background: #fff;             /* 線稿是白底，深色主題下要自己帶底 */
        border: 1px solid var(--line); border-radius: var(--r); padding: 4px;
      }
      .sheet .ref-frame img { width: 100%; height: auto; display: block; border-radius: 2px; }
      .sheet .ref-frame .cap {
        font-family: var(--font-mono); font-size: 0.5625rem; letter-spacing: .1em;
        color: #7a8580; text-align: center; padding: 3px 0 1px;
      }
      .sheet .ref-none {
        flex: none; width: 42%;
        border: 1px dashed var(--line); border-radius: var(--r);
        padding: 18px 8px; text-align: center;
        font-size: 0.71875rem; color: var(--ink-soft);
      }

      /* 臉部詳情：2026-09-25（網頁v2 批 B）起版面照手部，參考圖與定位並排、吃上面同一個 42%。
         以前單獨一塊 62% 的寬度規則、逐條用法（.face-use*）的樣式一併刪。 */

      /* 手機版跟 App 一樣從底部拉出；桌面仍保留原本的置中視窗。 */
      @media (max-width: 599px), ((max-height: 599px) and (pointer: coarse)) {
        .sheet-mask { align-items: flex-end; padding: 0; }
        .sheet {
          max-width: none; max-height: 90dvh;
          border-left: 0; border-right: 0; border-bottom: 0;
          border-radius: 14px 14px 0 0;
          padding: 16px 18px calc(20px + env(safe-area-inset-bottom));
        }
        @media (prefers-reduced-motion: no-preference) {
          .sheet { animation: sheet-up .2s ease-out; }
          @keyframes sheet-up { from { transform: translateY(18px); opacity: 0; } to { transform: none; opacity: 1; } }
        }
      }

      /* ── 症狀覆蓋條（2026-09-14）─────────────────────────────
         用戶提的問題：「選了 a 和 b 兩個症狀，穴道全列在一起，
         萬一我不小心只勾到治 a 的怎麼辦」。
         → 一個症狀一顆膠囊，右邊數字 = 這個症狀現在被幾個已勾的穴道覆蓋。
         點膠囊 = 只看這個症狀的穴道。0 的那顆標警示色。 */
      .cover-row { display: flex; flex-wrap: wrap; gap: 6px; }
      .cover-chip {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 5px 10px;
        border: 1px solid var(--line); border-radius: 999px;
        background: var(--surface);
        font-size: 0.78125rem; color: var(--ink-soft);
        cursor: pointer; user-select: none;
        transition: border-color .15s, color .15s, background .15s;
      }
      .cover-chip:hover { border-color: var(--brass); }
      .cover-chip .n {
        font-family: var(--font-mono); font-size: 0.6875rem;
        font-variant-numeric: tabular-nums; color: var(--brass);
      }
      /* 一穴都沒勾到 —— 這正是要提醒的那一種 */
      .cover-chip.miss { border-color: var(--bad); color: var(--ink); }
      .cover-chip.miss .n { color: var(--bad); }
      /* 這個症狀一個可定位的穴道都還沒有：不是使用者的錯，不能標成紅的 */
      .cover-chip.soon { opacity: .55; cursor: default; }
      .cover-chip.soon:hover { border-color: var(--line); }
      .cover-chip.on {
        border-color: var(--brass); background: var(--surface-2); color: var(--ink);
        box-shadow: inset 2px 0 0 var(--brass);
      }

      /* 「開始療程」前的軟提醒。⚠️ 不是 alert、也不擋路 —— 見 tryStartTreatment() */
      #start-warn:empty { display: none; }
      .start-warn {
        border: 1px solid var(--bad); border-radius: var(--r);
        background: color-mix(in srgb, var(--bad) 8%, transparent);
        padding: 11px 13px;
      }
      .start-warn p { margin: 0 0 9px; font-size: 0.8125rem; line-height: 1.6; }
      .start-warn .row { display: flex; gap: 7px; flex-wrap: wrap; }
      .start-warn button {
        padding: 6px 12px; cursor: pointer;
        border: 1px solid var(--line); border-radius: var(--r);
        background: var(--surface); color: var(--ink); font-size: 0.78125rem;
      }
      .start-warn button:hover { border-color: var(--brass); color: var(--brass); }
    </style>

    <div class="stack">
      <div>
        <p class="eyebrow" data-i18n="eyebrow-recommend">步驟一 · 配穴</p>
        <h2 data-i18n="recommend-title">推薦穴道</h2>
        <p class="lede" data-i18n="recommend-desc">系統推薦了下列穴道，請勾選你要按摩的穴道</p>
      </div>
      <div class="cover-row" id="coverage-row"></div>
      <div class="seg" id="region-seg"></div>
      <div class="acupoint-list" id="recommend-list"></div>
      <div id="start-warn"></div>
      <button class="btn wide" onclick="tryStartTreatment()" data-i18n="btn-start">開始療程</button>
    </div>

    <div class="sheet-mask" id="info-sheet" hidden onclick="closeInfoSheet(event)">
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="info-sheet-name"
           onclick="event.stopPropagation()">
        <div class="sheet-head">
          <span class="nm" id="info-sheet-name"></span>
          <span class="en" id="info-sheet-en"></span>
          <button type="button" class="x" onclick="closeInfoSheet()" data-i18n="btn-close">關閉</button>
        </div>
        <div id="info-sheet-body"></div>
      </div>
    </div>
  </div>`,
});

// 從首頁進來：把選到的症狀展開成穴道清單
function goToRecommendation() {
  if (state.selectedSymptoms.length === 0) {
    alert(isZh() ? '請至少選一個症狀' : 'Please select at least one symptom');
    return;
  }
  applySymptomRecommendation();
  showPage('recommend');
}

// 選到的症狀 → 推薦穴道。兩個入口共用（首頁的「下一步」、圖冊主治標籤），
// 免得兩邊各寫一份、日後只改到一邊。
function applySymptomRecommendation() {
  const rec = new Set();
  state.selectedSymptoms.forEach(i => {
    const s = SYMPTOM_MAP[i];
    if (s) s.acupoints.forEach(n => rec.add(n));   // 索引失效就跳過，不要整頁炸掉
  });
  // 只留公式已實作的穴道，避免推薦一個按下去必定失敗的穴
  state.recommendedAcupoints = [...rec].filter(n => IMPLEMENTED.has(n));
}

// 從圖冊單穴介紹的主治標籤進來（2026-09-04）：
// 以那一個症狀開一次新療程，人帶到選穴頁 —— 跟 App 端同一個互動。
// 刻意「開新的」而不是疊加：從圖冊點進來的人心裡想的是這一個症狀，
// 不是把它加進上次沒做完的那組。
function startFromSymptom(name) {
  const idx = SYMPTOM_MAP.findIndex(s => s.name === name);
  if (idx < 0) return;                     // 症狀被改名／刪掉：什麼都不做，別把人丟到空頁
  state.selectedSymptoms = [idx];
  state.selectedAcupoints = [];
  state.selectedFace = [];
  state.currentAcupointIndex = 0;
  if (typeof sessionLog !== 'undefined') sessionLog = [];   // 換一次療程，上一次的紀錄不要跟過來
  applySymptomRecommendation();
  showPage('recommend');
}

// 現在看的是哪個部位（手部 / 手肘 / 臉部，見 js/regions.js）
let currentRegion = 'hand';

/* ══ 症狀覆蓋（2026-09-14）══════════════════════════════════════════
 *
 * 用戶提的問題：「今天選了 a 和 b 兩個病症，選穴道是把它們全部列在一起讓我選，
 * 可是如果我不小心都只選到治療 a 的穴道該怎麼辦」。
 *
 * 病灶：`applySymptomRecommendation()` 把每個症狀的穴道**聯集成一份扁平清單**，
 * 「誰治誰」這個資訊在那一步就被丟掉了，使用者勾完看不出漏了哪個症狀。
 *
 * ⭐ 不需要任何新資料 —— SYMPTOM_MAP／FACE_SYMPTOM_MAP 本來就記著對應關係，
 *    這裡只是把它跟 selectedAcupoints／selectedFace 求個交集再顯示出來。
 *
 * 三個刻意的設計決定：
 *
 * ① **不按症狀分區列清單。** 穴道會重疊（合谷同時治感冒／腸胃／牙痛／頭痛），
 *    分區要嘛同一穴重複出現、要嘛只能歸一區，兩種都會讓人問「我勾的算哪一區」。
 *    改成清單維持一份，用膠囊條顯示覆蓋、點膠囊篩選。
 *
 * ② **不硬擋。** 使用者今天只想處理 a 是完全合理的。所以「開始療程」不是
 *    gate，是提醒 ＋ 一鍵看漏掉的那個症狀有哪些穴道。
 *
 * ③ **不自動勾。** 2026-09-09 用戶定過「不用預設讓使用者自己選」，
 *    自動補上等於把那個決定收回去。所以只帶人去看，勾還是他自己勾。
 * ═══════════════════════════════════════════════════════════════════ */

// 點了哪顆膠囊（= 只看這個症狀的穴道）。存的是 SYMPTOM_MAP 的索引，null = 不篩選
let filterSymptom = null;

/**
 * 每個選到的症狀現在被覆蓋幾穴。
 * 回傳 [{ idx, name, count, locatable }]
 *   count     ：已勾的穴道裡有幾個治這個症狀（手部＋臉部一起算）
 *   locatable ：這個症狀**有沒有任何一個定位得出來的穴道**。
 *               沒有的話 count 永遠是 0，那不是使用者的錯 —— 不標紅、也不進提醒。
 */
function symptomCoverage() {
  return state.selectedSymptoms.map(idx => {
    const s = SYMPTOM_MAP[idx];
    if (!s) return null;                                  // 索引失效就跳過，別整頁炸掉
    const hand = s.acupoints.filter(n => IMPLEMENTED.has(n));
    const face = (FACE_SYMPTOM_MAP[s.name] || []).filter(c => FACE_IMPLEMENTED.has(c));
    const count =
      hand.filter(n => state.selectedAcupoints.includes(n)).length +
      face.filter(c => state.selectedFace.includes(c)).length;
    return { idx, name: s.name, count, locatable: hand.length + face.length > 0 };
  }).filter(Boolean);
}

/** 覆蓋數為 0、而且**有穴道可選**的那些症狀 —— 提醒只針對這一種 */
function missingSymptoms() {
  return symptomCoverage().filter(c => c.locatable && c.count === 0);
}

function renderCoverage() {
  const row = document.getElementById('coverage-row');
  if (!row) return;
  row.innerHTML = '';
  const cov = symptomCoverage();
  // 只選一個症狀時整條藏起來：那種情況「漏掉某個症狀」不可能發生，
  // 多一條永遠顯示 1 的膠囊只是雜訊。
  if (cov.length < 2) return;

  cov.forEach(c => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'cover-chip' +
      (!c.locatable ? ' soon' : c.count === 0 ? ' miss' : '') +
      (filterSymptom === c.idx ? ' on' : '');
    chip.dataset.symptom = c.name;
    chip.setAttribute('aria-pressed', String(filterSymptom === c.idx));

    const label = document.createElement('span');
    label.textContent = symptomLabel(c.name);
    const n = document.createElement('span');
    n.className = 'n';
    n.textContent = !c.locatable ? (isZh() ? '準備中' : 'SOON') : String(c.count);
    chip.append(label, n);

    if (c.locatable) {
      chip.title = isZh()
        ? (c.count ? `已選 ${c.count} 個治「${c.name}」的穴道 — 點一下只看這些`
                   : `還沒選到治「${c.name}」的穴道 — 點一下看有哪些`)
        : (c.count ? `${c.count} selected for "${c.name}" — tap to filter`
                   : `Nothing selected for "${c.name}" — tap to see options`);
      chip.onclick = () => toggleSymptomFilter(c.idx);
    } else {
      chip.title = isZh() ? '這個症狀的穴道還沒支援定位' : 'No locatable acupoints yet';
      chip.disabled = true;
    }
    row.appendChild(chip);
  });
}

/** 點膠囊：只看這個症狀的穴道。再點一次取消。 */
function toggleSymptomFilter(idx) {
  filterSymptom = (filterSymptom === idx) ? null : idx;
  openTimeFor = null;          // 篩選會整批換掉清單，展開的滑桿留著會接到別的穴道上
  renderRegionSeg();
  renderAcuList();
}

/** 篩選中的話，這個症狀治得到的手部穴道有哪些（未篩選回 null＝全部） */
function filterHandNames() {
  if (filterSymptom === null) return null;
  const s = SYMPTOM_MAP[filterSymptom];
  return s ? s.acupoints : [];
}

/**
 * 進頁時要落在哪個部位分頁。
 *
 * 2026-09-20：臉部專屬症狀（美容／鼻子不適／顏面神經麻痺／口腔衛生）在手部
 * **一個穴道都沒有**，原本寫死 `'hand'` 會讓人進來就看到一片空清單，
 * 還得自己發現要去點臉部。→ 手部推薦不到任何穴、而臉部有可定位的，就直接落在臉部。
 * 兩邊都有（或兩邊都沒有）維持舊行為落在手部，不改既有觀感。
 */
function defaultRegion() {
  const hand = state.recommendedAcupoints.filter(n => acuRegion(n) === 'hand').length;
  if (hand > 0) return 'hand';
  const names = state.selectedSymptoms.map(i => SYMPTOM_MAP[i]).filter(Boolean).map(s => s.name);
  const face = faceRecommend(names).filter(c => FACE_IMPLEMENTED.has(c)).length;
  if (face > 0) return 'face';
  return forearmRecommend(names).length > 0 ? 'elbow' : 'hand';
}

// 進頁：整個重來
function initRecommendList() {
  currentRegion = defaultRegion();
  state.selectedAcupoints = [];
  state.selectedFace = [];
  state.acuSecs = {};        // 逐穴秒數跟著新療程重來
  openTimeFor = null;
  filterSymptom = null;      // 症狀篩選不要跨療程留著
  closeInfoSheet();          // 上次留在畫面上的詳情面板不要跟著新療程進來
  renderRegionSeg();
  renderAcuList();
}

// 換部位不清掉已勾的穴道 —— 使用者可能跨部位配穴
function selectRegion(key) {
  currentRegion = key;
  renderRegionSeg();
  renderAcuList();
}

function renderRegionSeg() {
  const seg = document.getElementById('region-seg');
  seg.innerHTML = '';
  const symptomNames = state.selectedSymptoms.map(i => SYMPTOM_MAP[i].name);
  REGIONS.forEach(r => {
    // 臉部的數量要從另一張表數（臉部穴道不在 recommendedAcupoints 裡），
    // 而且只數「公式已實作」的，數字才對得上實際點得下去的穴道
    let count, badge;
    if (!r.ready) {
      badge = isZh() ? '準備中' : 'SOON';           // 整個部位還沒開放
    } else if (r.key === 'face') {
      // 症狀膠囊篩選中，徽章要跟著縮 —— 否則寫 10 卻只列出 3 個，數字反而在騙人
      const fs = filterSymptom !== null && SYMPTOM_MAP[filterSymptom];
      const codes = fs
        ? faceRecommend([fs.name])
        : faceRecommend(symptomNames);
      count = codes.filter(c => FACE_IMPLEMENTED.has(c)).length;
      // 這症狀有臉部穴道、但一個都還沒實作定位 → 標「準備中」而不是 0，
      // 0 會被讀成「這症狀根本沒有臉部穴道」，那是兩件不同的事
      badge = count > 0 ? String(count) : (codes.length ? (isZh() ? '準備中' : 'SOON') : '0');
    } else if (r.key === 'elbow') {
      // 前臂資料已可閱讀，但定位尚未開放；跟 App 一樣以省略號表示不可選入療程。
      badge = '…';
    } else {
      const only = filterHandNames();          // 同上：篩選中徽章要跟著縮
      count = state.recommendedAcupoints
        .filter(n => acuRegion(n) === r.key)
        .filter(n => !only || only.includes(n)).length;
      badge = String(count);
    }

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = (r.key === currentRegion ? 'on' : '') + (r.ready ? '' : ' soon');
    btn.setAttribute('aria-pressed', String(r.key === currentRegion));
    btn.onclick = () => selectRegion(r.key);

    const label = document.createElement('span');
    label.textContent = t(r.label);
    const n = document.createElement('span');
    n.className = 'n';
    n.textContent = badge;

    btn.append(label, n);
    seg.appendChild(btn);
  });
}

function renderAcuList() {
  const list = document.getElementById('recommend-list');
  list.innerHTML = '';
  // 勾選／取消／換部位都會走到這裡 → 覆蓋條與提醒一起重算，
  // 不必在每個 toggle 各呼叫一次（臉部的 toggle 在 07-face.js，也是走這條）
  renderCoverage();
  clearStartWarn();

  const region = regionOf(currentRegion);
  if (region && !region.ready) {
    list.appendChild(notice('notice', t('region-soon')));
    return;
  }

  // 臉部走另一套資料與公式（見 js/regions.js 的說明），清單也另外畫
  if (currentRegion === 'face') { renderFaceList(list); return; }
  if (currentRegion === 'elbow') { renderForearmList(list); return; }

  let names = state.recommendedAcupoints.filter(n => acuRegion(n) === currentRegion);
  // 症狀膠囊篩選中：只留治那個症狀的
  const only = filterHandNames();
  if (only) names = names.filter(n => only.includes(n));
  if (names.length === 0) {
    // 篩選造成的空清單要講清楚是「這個部位沒有」，不然會被讀成「這症狀沒穴道」
    if (only) {
      list.appendChild(notice('small', isZh()
        ? `「${symptomLabel(SYMPTOM_MAP[filterSymptom].name)}」在這個部位沒有穴道 — 換個部位看看。`
        : 'No acupoints for this symptom in this region — try another region.'));
      return;
    }
    list.appendChild(notice('small', state.recommendedAcupoints.length
      ? t('region-empty')
      : (isZh() ? '此症狀對應的穴道尚未支援定位。' : 'No locatable acupoints for this symptom yet.')));
    return;
  }

  names.forEach(acuName => {
    const checked = state.selectedAcupoints.includes(acuName);
    const item = document.createElement('div');
    item.className = 'acu-item' + (checked ? ' checked' : '');
    item.dataset.acu = acuName;
    item.setAttribute('role', 'checkbox');
    item.setAttribute('aria-checked', String(checked));
    item.tabIndex = 0;

    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = acuColor(acuName);

    const nm = document.createElement('span');
    nm.textContent = acuLabel(acuName);

    const tick = document.createElement('span');
    tick.className = 'tick';
    tick.textContent = '✓';

    item.append(dot, nm, secsBadge(acuName), tick,
                infoButton(() => openAcuInfo(acuName)));
    const toggle = () => toggleAcupoint(acuName, item);
    item.onclick = toggle;
    item.onkeydown = (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); } };
    list.appendChild(item);
    // 秒數保留於按摩頁與我的流程，選穴階段不展開調整面板。
  });
}

function filterForearmNames() {
  if (filterSymptom === null) return null;
  const s = SYMPTOM_MAP[filterSymptom];
  return s ? (FOREARM_SYMPTOM_MAP[s.name] || []) : [];
}

function renderForearmList(list) {
  const selectedNames = state.selectedSymptoms.map(i => SYMPTOM_MAP[i]).filter(Boolean).map(s => s.name);
  let names = forearmRecommend(selectedNames);
  const only = filterForearmNames();
  if (only) names = names.filter(n => only.includes(n));

  list.appendChild(notice('notice', isZh()
    ? '前臂穴道目前可查看資料，但尚未開放相機定位。'
    : 'Forearm point information is available, but camera locating is not yet supported.'));

  if (!names.length) {
    list.appendChild(notice('small', isZh()
      ? '你選的症狀在前臂沒有對應穴道。'
      : 'No matching forearm points for the selected symptom.'));
    return;
  }

  names.forEach(name => {
    const acu = forearmAcu(name);
    const item = document.createElement('div');
    item.className = 'acu-item';
    item.tabIndex = 0;
    item.setAttribute('role', 'button');
    item.setAttribute('aria-label', `${itemLabel(name)} — ${t('a11y-info')}`);

    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = forearmColor(name);
    const nm = document.createElement('span');
    nm.textContent = itemLabel(name);
    const soon = document.createElement('span');
    soon.className = 'secs';
    soon.textContent = isZh() ? '準備中' : 'SOON';
    item.append(dot, nm, soon, infoButton(() => openForearmInfo(name)));

    const open = () => openForearmInfo(name);
    item.onclick = open;
    item.onkeydown = e => {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); open(); }
    };
    list.appendChild(item);
  });
}

// ── ▾ 這一穴按幾秒（2026-09-08）──────────────────────────────────
// 一次只展開一個：兩欄格線下同時開好幾片，每開一片下面的格子就整批位移，
// 拉到一半的滑桿會跟著跑掉。null = 全部收合。
let openTimeFor = null;

function toggleAcuTime(id) {
  openTimeFor = (openTimeFor === id) ? null : id;
  renderAcuList();
}

// ▾ 長在整格可點的 .acu-item 裡面，所以跟 ⓘ 一樣要 stopPropagation，
// 否則按「展開」會順手把這個穴道勾起來。
// ⭐ 未勾選的穴道不給調時間（2026-09-08 用戶定）：
//    調了時間卻沒把穴道排進療程，那個數字不會有任何效果 —— 使用者會以為自己設好了。
//    停用而不是整顆藏起來：藏起來的話「怎麼別的格子有、這格沒有」比停用更難懂。
function expandButton(id, enabled) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'expand' + (openTimeFor === id ? ' open' : '');
  b.textContent = '▾';
  b.disabled = !enabled;
  b.setAttribute('aria-label', t('a11y-time'));
  b.setAttribute('aria-expanded', String(openTimeFor === id));
  b.title = enabled ? t('a11y-time') : t('time-need-pick');
  b.onclick = (e) => { e.stopPropagation(); toggleAcuTime(id); };
  b.onkeydown = (e) => { if (e.key === ' ' || e.key === 'Enter') e.stopPropagation(); };
  return b;
}

// 收合狀態下的痕跡：只有調過的才顯示，沒調過的掛著「30s」會被讀成「我設過了」
function secsBadge(id) {
  const el = document.createElement('span');
  el.className = 'secs';
  el.textContent = acuSecIsCustom(id) ? acuSecOf(id) + 's' : '';
  return el;
}

/** 展開的那一片：大讀數 + 滑桿 + 「這一穴總共多久」+ 重設。
 *  rounds：手部左右各一輪＝2，臉部＝1（見 js/regions.js 的 itemRounds）。 */
function acuTimePanel(id) {
  const box = document.createElement('div');
  box.className = 'acu-time';
  box.onclick = (e) => e.stopPropagation();   // 面板長在清單裡，點它不該勾到任何穴道

  const rounds = itemRounds(id);

  const top = document.createElement('div');
  top.className = 'top';
  const k = document.createElement('span');
  k.className = 'k';
  k.textContent = t('time-per-hand');
  const v = document.createElement('span');
  v.className = 'v';
  top.append(k, v);

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = PRESS_MIN;
  slider.max = PRESS_MAX;
  slider.step = PRESS_STEP;
  slider.value = acuSecOf(id);
  slider.setAttribute('aria-label', t('time-per-hand'));

  const foot = document.createElement('div');
  foot.className = 'foot';
  const total = document.createElement('span');
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'reset';
  reset.textContent = t('time-reset');
  foot.append(total, reset);

  // 三處讀數（大字、總計、格子上的痕跡）都從同一個值算，不各自記一份
  const paint = () => {
    const sec = parseInt(slider.value, 10);
    v.innerHTML = '';
    v.append(document.createTextNode(String(sec)));
    const u = document.createElement('span');
    u.textContent = isZh() ? '秒' : 's';
    v.appendChild(u);

    const all = sec * rounds;
    total.textContent = rounds > 1
      ? (isZh() ? `左右各一輪，這一穴共 ${all} 秒` : `Both hands — ${all}s for this point`)
      : (isZh() ? `臉部只按一輪，共 ${all} 秒` : `Face, single round — ${all}s`);
    reset.hidden = !acuSecIsCustom(id);

    const badge = document.querySelector(`.acu-item[data-acu="${cssEscapeAttr(id)}"] .secs`);
    if (badge) badge.textContent = acuSecIsCustom(id) ? sec + 's' : '';
  };

  // input 而不是 change：拖的時候數字就要跟著動，放開才更新等於看不到自己在拉什麼
  slider.oninput = () => { setAcuSec(id, parseInt(slider.value, 10)); paint(); };
  reset.onclick = (e) => {
    e.stopPropagation();
    clearAcuSec(id);
    slider.value = acuSecOf(id);
    paint();
  };

  box.append(top, slider, foot);
  paint();
  return box;
}

// 穴名／臉部代碼都是自家資料表裡的字，但還是別直接串進選擇器 ——
// 哪天多一個帶引號的代碼，querySelector 會丟例外而不是回 null。
const cssEscapeAttr = (v) => String(v).replace(/["\\]/g, '\\$&');

// ── ⓘ 詳情 ────────────────────────────────────────────────────────
// 選穴之前就能看到這個穴道是什麼，不必先勾、再按「開始療程」翻頁才知道。

// 做一顆 ⓘ。它長在 .acu-item（整格可點＝勾選）裡面，
// 所以一定要 stopPropagation，否則點詳情會順手把穴道勾起來。
function infoButton(onOpen) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'info';
  b.textContent = 'ⓘ';
  b.setAttribute('aria-label', t('a11y-info'));
  b.onclick = (e) => { e.stopPropagation(); onOpen(); };
  b.onkeydown = (e) => { if (e.key === ' ' || e.key === 'Enter') e.stopPropagation(); };
  return b;
}

// 面板內的一欄：小標 + 內文
function infoField(label, text) {
  const box = document.createElement('div');
  box.className = 'field';
  const k = document.createElement('div');
  k.className = 'k';
  k.textContent = label;
  const v = document.createElement('div');
  v.className = 'v';
  v.textContent = text;
  box.append(k, v);
  return box;
}

// 手部／手肘穴道：資料跟認穴頁同一份（ACUPOINTS[].locate、ACUPOINT_DETAIL[].note），
// 所以這裡看到的內容跟等一下按摩前看到的一致，不會有兩套說法。
function openAcuInfo(name) {
  const acu = ACUPOINTS.find(a => a.name === name);
  const detail = ACUPOINT_DETAIL[name] || {};
  const body = document.getElementById('info-sheet-body');

  document.getElementById('info-sheet-name').textContent = acuLabel(name);
  document.getElementById('info-sheet-en').textContent = detail.en || '';
  body.innerHTML = '';

  // 安全警語（如合谷穴「懷孕忌按」）擺最上面 —— 這是選之前就該看到的
  if (detail.note) {
    const d = document.createElement('p');
    d.className = 'notice warn';
    d.textContent = detail.note;
    body.appendChild(d);
  }

  const row = document.createElement('div');
  row.className = 'ref-row';
  row.append(
    acuRefBlock(name),
    infoField(t('info-locate'),
      acu && acu.locate ? acu.locate : (isZh() ? '（尚無定位描述）' : '(no description yet)'))
  );
  body.appendChild(row);

  const dorsal = acu && acu.side === 'dorsal';
  body.appendChild(infoField(t('info-side'), BILATERAL_ACUPOINTS.has(name)
    ? (isZh() ? '手側緣，手背或手心朝鏡頭都可定位。' : 'Side edge — either hand side works.')
    : (isZh() ? `${dorsal ? '手背' : '手心'}朝向鏡頭。` : `Face your ${dorsal ? 'back of hand' : 'palm'} to the camera.`)));

  openInfoSheet();
}

// 臉部穴道 ⓘ（2026-09-25 網頁v2 批 B，照 App FaceInfoSheetLite／批 77）：
//   版面照手部 openAcuInfo：穴名＋英文名 → 備注警示 → 尚未開放 → 參考圖＋定位並排 → 按壓方式。
//   文字改讀 Excel（js/face-sheet.js），不再放 WHO 原文、逐條用法、資料來源。
function openFaceInfo(code) {
  const sheet = faceSheet(code);
  const body = document.getElementById('info-sheet-body');

  document.getElementById('info-sheet-name').textContent = faceLabel(code);
  document.getElementById('info-sheet-en').textContent = (sheet && sheet.en) || code;
  body.innerHTML = '';

  if (sheet && sheet.note) {
    const d = document.createElement('p');
    d.className = 'notice warn';
    d.textContent = sheet.note;
    body.appendChild(d);
  }

  if (!FACE_IMPLEMENTED.has(code)) {
    const d = document.createElement('p');
    d.className = 'notice';
    d.textContent = isZh()
      ? '這個穴道的定位公式還在開發中，目前無法在相機上導航。'
      : 'Locating for this point is still in development.';
    body.appendChild(d);
  }

  const row = document.createElement('div');
  row.className = 'ref-row';
  row.append(
    faceRefBlock(code),
    infoField(t('info-locate'),
      sheet && sheet.locate ? sheet.locate : (isZh() ? '（尚無定位描述）' : '(no description yet)'))
  );
  body.appendChild(row);

  // 手部這一格是「手背／手心」提示；臉部沒有正反面，放每穴不同的按壓方式
  if (sheet && sheet.press) body.appendChild(infoField(t('face-sheet-press'), sheet.press));

  openInfoSheet();
}

function openForearmInfo(name) {
  const acu = forearmAcu(name);
  if (!acu) return;
  const body = document.getElementById('info-sheet-body');
  document.getElementById('info-sheet-name').textContent = itemLabel(name);
  document.getElementById('info-sheet-en').textContent = `${acu.code} · ${acu.en}`;
  body.innerHTML = '';

  if (acu.caution) {
    const warning = document.createElement('p');
    warning.className = 'notice warn';
    warning.textContent = acu.caution;
    body.appendChild(warning);
  }

  const row = document.createElement('div');
  row.className = 'ref-row';
  row.append(forearmRefBlock(name), infoField(t('info-locate'), acu.locate));
  body.appendChild(row);
  body.appendChild(infoField(isZh() ? '用途' : 'Uses', acu.note));
  body.appendChild(infoField(isZh() ? '按法' : 'How to press', FOREARM_PRESS));

  const noticeBox = document.createElement('p');
  noticeBox.className = 'notice';
  noticeBox.textContent = isZh()
    ? '這個穴道目前可查看資料，但尚未開放相機定位。'
    : 'Information is available, but camera locating is not yet supported.';
  body.appendChild(noticeBox);
  openInfoSheet();
}

let infoReturnFocus = null;

function openInfoSheet() {
  infoReturnFocus = document.activeElement;
  document.getElementById('info-sheet').hidden = false;
  document.addEventListener('keydown', onInfoSheetKey);
  document.querySelector('#info-sheet .x').focus();
}

// 參數可有可無：點遮罩會帶 event 進來，點「關閉」鈕則沒有。
// 帶 event 的情況要確認真的點在遮罩上（面板自己已經 stopPropagation 了，這是保險）。
function closeInfoSheet(e) {
  if (e && e.target && e.target.id !== 'info-sheet') return;
  const box = document.getElementById('info-sheet');
  if (box) box.hidden = true;
  document.removeEventListener('keydown', onInfoSheetKey);
  if (infoReturnFocus && infoReturnFocus.isConnected) infoReturnFocus.focus({ preventScroll: true });
  infoReturnFocus = null;
}

function onInfoSheetKey(e) {
  if (e.key === 'Escape') closeInfoSheet();
  if (e.key === 'Tab') {
    const items = [...document.querySelectorAll('#info-sheet button, #info-sheet [href], #info-sheet [tabindex="0"]')].filter(el => !el.disabled);
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
}

/* ── 「開始療程」前的軟提醒（2026-09-14）───────────────────────────
 *
 * 有症狀一穴都沒勾到就先講一聲，**但不擋** —— 給兩條路：
 *   [看看有哪些] → 幫他把膠囊篩到那個症狀（還是他自己勾）
 *   [就這樣開始] → 直接走
 *
 * ⚠️ 刻意不用 alert：alert 只能「知道了」，沒辦法在同一個動作裡把人帶去補。
 * ⚠️ 刻意不做成「按兩次就過」：那種靜默的二次確認，使用者不知道自己按到了什麼。
 */
function clearStartWarn() {
  const box = document.getElementById('start-warn');
  if (box) box.innerHTML = '';
}

function tryStartTreatment() {
  const missing = missingSymptoms();
  // 一穴都沒勾 → 交給 goToAcuDetail() 原本那個「請選擇至少一個穴道」，
  // 不要在這裡再疊一層提醒，同一件事講兩次
  const nothingPicked = !state.selectedAcupoints.length && !state.selectedFace.length;
  if (!missing.length || nothingPicked) { goToAcuDetail(); return; }

  const box = document.getElementById('start-warn');
  box.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'start-warn';

  const names = missing.map(m => symptomLabel(m.name));
  const p = document.createElement('p');
  p.textContent = isZh()
    ? `你選的「${names.join('、')}」還沒選到對應的穴道 —— 這次療程不會處理到${names.length > 1 ? '它們' : '它'}。`
    : `Nothing selected for "${names.join(', ')}" — this session won't address ${names.length > 1 ? 'them' : 'it'}.`;

  const row = document.createElement('div');
  row.className = 'row';

  const look = document.createElement('button');
  look.type = 'button';
  look.textContent = isZh() ? '看看有哪些' : 'See options';
  look.onclick = () => {
    // 篩到第一個漏掉的症狀。它的穴道不一定在現在這個部位，所以順便切過去。
    filterSymptom = missing[0].idx;
    const s = SYMPTOM_MAP[missing[0].idx];
    const first = (s.acupoints || []).find(n => IMPLEMENTED.has(n));
    if (first) currentRegion = acuRegion(first);
    else if ((FACE_SYMPTOM_MAP[s.name] || []).some(c => FACE_IMPLEMENTED.has(c))) currentRegion = 'face';
    openTimeFor = null;
    renderRegionSeg();
    renderAcuList();          // 這一步會 clearStartWarn()
  };

  const go = document.createElement('button');
  go.type = 'button';
  go.textContent = isZh() ? '就這樣開始' : 'Start anyway';
  go.onclick = () => { clearStartWarn(); goToAcuDetail(); };

  row.append(look, go);
  wrap.append(p, row);
  box.appendChild(wrap);
}

// 清單區塊要橫跨兩欄，所以自帶 grid-column
function notice(cls, text) {
  const p = document.createElement('p');
  p.className = cls;
  p.style.gridColumn = '1 / -1';
  p.textContent = text;
  return p;
}

// 2026-09-20：急症擋話（119 紅框）整塊拿掉，對齊 App 09-17 那批。
// 「暈迷急救」已從症狀表刪除；中暑保留為一般症狀。
// 本系統定位為日常自我保健，不作為急救、診斷或治療工具。

function toggleAcupoint(name, item) {
  const on = !state.selectedAcupoints.includes(name);
  state.selectedAcupoints = on
    ? [...state.selectedAcupoints, name]
    : state.selectedAcupoints.filter(n => n !== name);
  item.classList.toggle('checked', on);
  item.setAttribute('aria-checked', String(on));

  // 取消勾選時把展開的那片收掉：留著一條調不出效果的滑桿在畫面上會誤導。
  // 秒數本身**不刪** —— 反悔再勾回來時，剛才拉的時間還在。
  if (!on && openTimeFor === name) openTimeFor = null;
  renderAcuList();   // ▾ 的停用狀態要跟著勾選變，所以整份重畫
}
