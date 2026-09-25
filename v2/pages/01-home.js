// 首頁是流程入口：症狀有選取上限。
// 2026-09-25（網頁v2 批 A）：拿掉標題旁的站位小人（網頁小人只留慶祝）與桌面「系統概要」卡。
// ⭐ 2026-09-17 用戶把上限從 5 改成 3（App 的 HomeScreen.kt 同步改了）。
//    這個常數同時決定：選滿的門檻、那句提示裡的數字 —— 改這裡就好。
// 2026-09-25（網頁v2 批 B，App A1）：拿掉「已選 N / 3」那行；選滿後再點 → 頂部浮出警示條 2 秒
//    （App LimitToast：浮在「主訴」那行上面、不佔位，不會把整頁往下推）。
const MAX_SYMPTOMS = 3;
let homeLimitTimer = null;

registerPage('home', {
  tab: 'home',
  step: 0,
  onEnter: () => initSymptomGrid(),
  onLanguage: () => initSymptomGrid(),
  onLeave: () => { clearTimeout(homeLimitTimer); const b = document.getElementById('home-limit'); if (b) b.hidden = true; },
  html: `
  <div id="page-home" class="page">
    <div class="stack">
      <div class="home-top">
        <div class="home-head">
          <!-- 深藍帶的下半段（2026-09-19 同步 App）：上半段是 header 那條，
               這裡接到 lede 為止。出血的負 margin 在 css/responsive.css。 -->
          <div class="hero-band">
            <p class="eyebrow" data-i18n="eyebrow-home">主訴</p>
            <div class="home-heading">
              <h2 data-i18n="home-title">選擇你的症狀</h2>
            </div>
            <p class="lede" data-i18n="home-desc">最多選擇三個症狀，查看相關穴道</p>
          </div>
          <p id="home-limit" class="home-limit" role="status" aria-live="polite" hidden></p>
        </div>
        <div class="symptom-grid" id="symptom-grid"></div>
      </div>
      <div class="home-foot">
        <p class="notice" data-i18n="disclaimer">本系統為穴位定位輔助工具，內容依據傳統中醫文獻整理，不構成醫療診斷或治療建議。身體不適請就醫。</p>
        <button class="btn wide" id="home-next" onclick="goToRecommendation()" data-i18n="btn-next" disabled>下一步</button>
      </div>
    </div>
  </div>`,
});

function initSymptomGrid() {
  const grid = document.getElementById('symptom-grid');
  grid.innerHTML = '';
  SYMPTOM_MAP.forEach((symptom, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'symptom-btn';
    btn.textContent = symptomLabel(symptom.name);
    btn.onclick = () => toggleSymptom(idx);
    grid.appendChild(btn);
  });
  renderHomeSelection();
}

function renderHomeSelection() {
  const count = state.selectedSymptoms.length;
  // 更新既有按鈕，保留鍵盤焦點。
  document.querySelectorAll('#symptom-grid button').forEach((btn, idx) => {
    const on = state.selectedSymptoms.includes(idx);
    btn.classList.toggle('selected', on);
    btn.setAttribute('aria-pressed', String(on));
    btn.setAttribute('aria-disabled', String(!on && count >= MAX_SYMPTOMS));
  });
  document.getElementById('home-next').disabled = count === 0;
}

/** 撞到上限：浮出警示條 2 秒。連點會重新計時（App 用 key 不用布林，同理） */
function showHomeLimit() {
  const bar = document.getElementById('home-limit');
  bar.textContent = t('home-limit-toast').replace('{n}', MAX_SYMPTOMS);
  bar.hidden = false;
  clearTimeout(homeLimitTimer);
  homeLimitTimer = setTimeout(() => { bar.hidden = true; }, 2000);
}

function toggleSymptom(idx) {
  if (state.selectedSymptoms.includes(idx)) {
    state.selectedSymptoms = state.selectedSymptoms.filter(i => i !== idx);
  } else if (state.selectedSymptoms.length >= MAX_SYMPTOMS) {
    showHomeLimit();
    return;
  } else {
    state.selectedSymptoms = [...state.selectedSymptoms, idx];
  }
  renderHomeSelection();
}
