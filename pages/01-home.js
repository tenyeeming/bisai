// ══ 步驟一：選症狀 ═══════════════════════════════════════════════
// 這一頁的行為（上半）與長相（下半 html）都在這個檔案裡。
// 症狀清單來自 js/acu-data.js 的 SYMPTOM_MAP，要加症狀去那裡加。

registerPage('home', {
  tab: 'home',
  step: 1,
  stepLabel: 'step-1',
  onEnter: () => initSymptomGrid(),
  onLanguage: () => initSymptomGrid(),

  html: `
  <div id="page-home" class="page">
    <style>
      .symptom-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 7px; }
      .symptom-btn {
        font-family: var(--font-sans);
        padding: 12px 10px;
        background: var(--surface);
        color: var(--ink);
        border: 1px solid var(--line);
        border-radius: var(--r);
        cursor: pointer;
        font-size: 13px;
        text-align: left;
        transition: border-color .15s, background .15s;
      }
      .symptom-btn:hover { border-color: var(--brass); }
      .symptom-btn.selected {
        border-color: var(--brass);
        background: var(--surface-2);
        box-shadow: inset 2px 0 0 var(--brass);
        font-weight: 600;
      }
    </style>

    <div class="stack">
      <div>
        <p class="eyebrow" data-i18n="eyebrow-home">步驟一 · 主訴</p>
        <h2 data-i18n="home-title">選擇你的症狀</h2>
        <p class="lede" data-i18n="home-desc">可複選多個症狀，系統會推薦相關穴道</p>
      </div>
      <div class="symptom-grid" id="symptom-grid"></div>
      <button class="btn wide" onclick="goToRecommendation()" data-i18n="btn-next">下一步</button>
      <p class="notice" data-i18n="disclaimer">本系統為穴位定位輔助工具，內容依據傳統中醫文獻整理，不構成醫療診斷或治療建議。身體不適請就醫。</p>
    </div>
  </div>`,
});

function initSymptomGrid() {
  const grid = document.getElementById('symptom-grid');
  grid.innerHTML = '';
  SYMPTOM_MAP.forEach((symptom, idx) => {
    const on = state.selectedSymptoms.includes(idx);
    const btn = document.createElement('button');
    btn.className = 'symptom-btn' + (on ? ' selected' : '');
    btn.type = 'button';
    btn.setAttribute('aria-pressed', String(on));
    btn.textContent = symptomLabel(symptom.name);
    btn.onclick = () => toggleSymptom(idx);
    grid.appendChild(btn);
  });
}

function toggleSymptom(idx) {
  state.selectedSymptoms = state.selectedSymptoms.includes(idx)
    ? state.selectedSymptoms.filter(i => i !== idx)
    : [...state.selectedSymptoms, idx];
  initSymptomGrid();
}
