// ══ 步驟二：選穴 ═════════════════════════════════════════════════
// 症狀 → 穴道的對應表在 js/acu-data.js 的 SYMPTOM_MAP。

registerPage('recommend', {
  tab: 'home',
  step: 2,
  stepLabel: 'step-2',
  backTo: 'home',
  onEnter: () => initRecommendList(),
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
        font-size: 15px;
        transition: border-color .15s, background .15s;
        user-select: none;
      }
      .acu-item:hover { border-color: var(--brass); }
      .acu-item .dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
      .acu-item .tick {
        margin-left: auto; font-family: var(--font-mono); font-size: 12px;
        color: var(--brass); opacity: 0;
      }
      .acu-item.checked {
        border-color: var(--brass); background: var(--surface-2);
        box-shadow: inset 2px 0 0 var(--brass);
      }
      .acu-item.checked .tick { opacity: 1; }
    </style>

    <div class="stack">
      <div>
        <p class="eyebrow" data-i18n="eyebrow-recommend">步驟二 · 配穴</p>
        <h2 data-i18n="recommend-title">推薦穴道</h2>
        <p class="lede" data-i18n="recommend-desc">系統推薦了下列穴道，請勾選你要按摩的穴道</p>
      </div>
      <div id="emergency-warn"></div>
      <div class="seg" id="region-seg"></div>
      <div class="acupoint-list" id="recommend-list"></div>
      <button class="btn wide" onclick="goToAcuDetail()" data-i18n="btn-start">開始療程</button>
    </div>
  </div>`,
});

// 從首頁進來：把選到的症狀展開成穴道清單
function goToRecommendation() {
  if (state.selectedSymptoms.length === 0) {
    alert(isZh() ? '請至少選一個症狀' : 'Please select at least one symptom');
    return;
  }
  const rec = new Set();
  state.selectedSymptoms.forEach(i => SYMPTOM_MAP[i].acupoints.forEach(n => rec.add(n)));
  // 只留公式已實作的穴道，避免推薦一個按下去必定失敗的穴
  state.recommendedAcupoints = [...rec].filter(n => IMPLEMENTED.has(n));
  showPage('recommend');
}

// 現在看的是哪個部位（手部 / 手肘 / 臉部，見 js/regions.js）
let currentRegion = 'hand';

// 進頁：整個重來
function initRecommendList() {
  currentRegion = 'hand';
  state.selectedAcupoints = [];
  state.selectedFace = [];
  renderEmergencyWarning();
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
      const codes = faceRecommend(symptomNames);
      count = codes.filter(c => FACE_IMPLEMENTED.has(c)).length;
      // 這症狀有臉部穴道、但一個都還沒實作定位 → 標「準備中」而不是 0，
      // 0 會被讀成「這症狀根本沒有臉部穴道」，那是兩件不同的事
      badge = count > 0 ? String(count) : (codes.length ? (isZh() ? '準備中' : 'SOON') : '0');
    } else {
      count = state.recommendedAcupoints.filter(n => acuRegion(n) === r.key).length;
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

  const region = regionOf(currentRegion);
  if (region && !region.ready) {
    list.appendChild(notice('notice', t('region-soon')));
    return;
  }

  // 臉部走另一套資料與公式（見 js/regions.js 的說明），清單也另外畫
  if (currentRegion === 'face') { renderFaceList(list); return; }

  const names = state.recommendedAcupoints.filter(n => acuRegion(n) === currentRegion);
  if (names.length === 0) {
    list.appendChild(notice('small', state.recommendedAcupoints.length
      ? t('region-empty')
      : (isZh() ? '此症狀對應的穴道尚未支援定位。' : 'No locatable acupoints for this symptom yet.')));
    return;
  }

  names.forEach(acuName => {
    const checked = state.selectedAcupoints.includes(acuName);
    const item = document.createElement('div');
    item.className = 'acu-item' + (checked ? ' checked' : '');
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

    item.append(dot, nm, tick);
    const toggle = () => toggleAcupoint(acuName, item);
    item.onclick = toggle;
    item.onkeydown = (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); } };
    list.appendChild(item);
  });
}

// 清單區塊要橫跨兩欄，所以自帶 grid-column
function notice(cls, text) {
  const p = document.createElement('p');
  p.className = cls;
  p.style.gridColumn = '1 / -1';
  p.textContent = text;
  return p;
}

// 急症警示：中衝穴掛在「昏迷急救 / 中暑」下，這裡必須擋話，不能讓人以為按穴道就夠了
function renderEmergencyWarning() {
  const emer = state.selectedSymptoms.map(i => SYMPTOM_MAP[i].name)
    .filter(n => EMERGENCY_SYMPTOMS.has(n));
  const warnBox = document.getElementById('emergency-warn');
  warnBox.innerHTML = '';
  if (!emer.length) return;

  const d = document.createElement('p');
  d.className = 'notice bad';
  d.textContent = isZh()
    ? `你選了「${emer.map(symptomLabel).join('、')}」。這是急症 — 請立即撥打 119 或就近就醫。穴位按壓不能取代急救。`
    : `You selected "${emer.map(symptomLabel).join(', ')}". This is a medical emergency — call emergency services immediately. Acupressure is not a substitute for emergency care.`;
  warnBox.appendChild(d);
}

function toggleAcupoint(name, item) {
  const on = !state.selectedAcupoints.includes(name);
  state.selectedAcupoints = on
    ? [...state.selectedAcupoints, name]
    : state.selectedAcupoints.filter(n => n !== name);
  item.classList.toggle('checked', on);
  item.setAttribute('aria-checked', String(on));
}
