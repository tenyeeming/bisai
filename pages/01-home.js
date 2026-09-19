// 首頁是流程入口：症狀有選取上限，角色只呈現目前選擇數。
// ⭐ 2026-09-17 用戶把上限從 5 改成 3（App 的 HomeScreen.kt 同步改了）。
//    這個常數同時決定：選滿的門檻、角色站位數、那句提示裡的數字 —— 改這裡就好。
const MAX_SYMPTOMS = 3;
let homeLimitTimer = null;

registerPage('home', {
  tab: 'home',
  step: 0,
  onEnter: () => initSymptomGrid(),
  onLanguage: () => initSymptomGrid(),
  onLeave: () => { clearTimeout(homeLimitTimer); },
  html: `
  <div id="page-home" class="page">
    <div class="stack">
      <div class="home-top">
        <div>
          <!-- 深藍帶的下半段（2026-09-19 同步 App）：上半段是 header 那條，
               這裡接到 lede 為止。#home-selection 刻意留在帶外 —— App 也沒把
               「已選 N / 3」放進藍帶裡。出血的負 margin 在 css/responsive.css。 -->
          <div class="hero-band">
            <p class="eyebrow" data-i18n="eyebrow-home">主訴</p>
            <div class="home-heading">
              <h2 data-i18n="home-title">選擇你的症狀</h2>
              <div class="home-cast" id="home-cast" aria-hidden="true"></div>
            </div>
            <p class="lede" data-i18n="home-desc">最多選擇三個症狀，查看相關穴道</p>
          </div>
          <p id="home-selection" role="status" aria-live="polite"></p>
        </div>
        <div class="symptom-grid" id="symptom-grid"></div>
      </div>
      <div class="home-foot">
        <img class="handmark" src="assets/hand.png" alt="" aria-hidden="true">
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

function renderHomeSelection(limited = false) {
  const count = state.selectedSymptoms.length;
  // 更新既有按鈕，保留鍵盤焦點。
  document.querySelectorAll('#symptom-grid button').forEach((btn, idx) => {
    const on = state.selectedSymptoms.includes(idx);
    btn.classList.toggle('selected', on);
    btn.setAttribute('aria-pressed', String(on));
    btn.setAttribute('aria-disabled', String(!on && count >= MAX_SYMPTOMS));
  });
  const cast = document.getElementById('home-cast');
  cast.replaceChildren();
  for (let i = 0; i < MAX_SYMPTOMS; i++) {
    const slot = document.createElement('span');
    slot.className = 'cast-slot';
    if (i < count) slot.appendChild(castImage(i));
    cast.appendChild(slot);
  }
  const label = document.getElementById('home-selection');
  label.classList.toggle('limit', limited);
  label.textContent = limited
    ? (isZh() ? `最多選 ${MAX_SYMPTOMS} 項；取消一項後就能改選。`
              : `Choose up to ${MAX_SYMPTOMS}. Deselect one to change your choice.`)
    : (isZh() ? `已選 ${count} / ${MAX_SYMPTOMS} 項` : `${count} / ${MAX_SYMPTOMS} selected`);
  document.getElementById('home-next').disabled = count === 0;
}

function toggleSymptom(idx) {
  clearTimeout(homeLimitTimer);
  if (state.selectedSymptoms.includes(idx)) {
    state.selectedSymptoms = state.selectedSymptoms.filter(i => i !== idx);
  } else if (state.selectedSymptoms.length >= MAX_SYMPTOMS) {
    renderHomeSelection(true);
    homeLimitTimer = setTimeout(() => {
      if (currentPage === 'home') renderHomeSelection();
    }, 2500);
    return;
  } else {
    state.selectedSymptoms = [...state.selectedSymptoms, idx];
  }
  renderHomeSelection();
}
