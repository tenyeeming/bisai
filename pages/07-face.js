// ══ 臉部即時定位 ═════════════════════════════════════════════════
// 相機與偵測在 js/face-vision.js，公式在 js/face-math.js，資料在 js/face-data.js。
// 這支只負責這一頁的 UI，外加選穴頁「臉部」分頁的清單（renderFaceList）。
//
// ⚠️ 臉部目前沒有按摩流程 —— 23 穴只完成 4 穴定位，先把定位做對再談計時。
//    所以這頁不接步驟軌（step: 0），是獨立的一頁。

registerPage('face', {
  tab: 'home',
  step: 0,
  backTo: 'recommend',
  backLabel: 'btn-stop',
  hideTabbar: true,
  keepsFaceCamera: true,      // 進別頁時 nav.js 會據此關掉臉部相機
  onEnter: () => {
    renderFaceChips();
    syncFaceButtons();
    startFaceCamera('face-canvas');
  },
  onLeave: () => stopFaceCamera(),
  onLanguage: () => { renderFaceChips(); syncFaceButtons(); },

  html: `
  <div id="page-face" class="page">
    <style>
      .face-chips { display: flex; flex-wrap: wrap; gap: 6px; }
      .face-chip {
        font-family: var(--font-ming); font-size: 14px;
        padding: 6px 11px;
        background: var(--surface); color: var(--ink);
        border: 1px solid var(--line); border-radius: var(--r);
        cursor: pointer; user-select: none;
        transition: border-color .15s, background .15s;
      }
      .face-chip:hover { border-color: var(--brass); }
      .face-chip.on {
        border-color: var(--brass); background: var(--surface-2);
        box-shadow: inset 2px 0 0 var(--brass); font-weight: 600;
      }
      .face-chip .code {
        font-family: var(--font-mono); font-size: 10px;
        color: var(--ink-soft); margin-left: 5px;
      }
      .face-who {
        font-size: 12px; line-height: 1.75; color: var(--ink-soft);
        border-left: 2px solid var(--line); padding-left: 9px;
      }
      .face-who b { color: var(--ink); font-family: var(--font-ming); font-weight: 600; }
      .face-src {
        font-family: var(--font-mono); font-size: 10.5px;
        color: var(--ink-soft); margin-top: 3px;
      }
    </style>

    <div class="stack">
      <div>
        <p class="eyebrow" data-i18n="eyebrow-face">臉部 · 即時定位</p>
        <h2 class="acu-title" data-i18n="face-title">臉部穴道</h2>
      </div>

      <div class="face-chips" id="face-chips"></div>

      <div>
        <div class="viewport"><canvas id="face-canvas" class="cam"></canvas></div>
        <div class="readout gate-warn" id="face-gate" data-i18n="face-hint">請正對鏡頭</div>
      </div>

      <div class="btn-row">
        <button class="btn ghost" onclick="switchFaceCamera()" data-i18n="btn-flip">切換鏡頭</button>
        <button class="btn ghost" id="face-disc-btn" onclick="toggleFaceDisc()">隱藏信心圓盤</button>
      </div>
      <div class="btn-row">
        <button class="btn ghost" id="face-refs-btn" onclick="toggleFaceRefs()" data-i18n="face-btn-refs">顯示參考點</button>
      </div>

      <div class="face-who" id="face-who"></div>

      <p class="notice" data-i18n="face-honest">目前 23 個臉部穴道只完成 4 個的定位公式，且參數只建立在 1 人 1 張照片上，位置僅供參考。其餘穴道在選穴頁會標為「準備中」，不會假裝算得出來。</p>
      <p class="notice" data-i18n="disclaimer">本系統為穴位定位輔助工具，內容依據傳統中醫文獻整理，不構成醫療診斷或治療建議。身體不適請就醫。</p>
    </div>
  </div>`,
});

// ── 這一頁：穴道開關 ──────────────────────────────────────────────
function renderFaceChips() {
  const box = document.getElementById('face-chips');
  if (!box) return;
  box.innerHTML = '';

  // 從選穴頁帶過來的；沒帶就顯示全部已實作的
  const codes = (state.selectedFace && state.selectedFace.length)
    ? state.selectedFace
    : [...FACE_IMPLEMENTED];

  codes.forEach(code => {
    const on = faceSelected.includes(code);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'face-chip' + (on ? ' on' : '');
    b.setAttribute('aria-pressed', String(on));
    b.innerHTML = `${faceLabel(code)}<span class="code">${code}</span>`;
    b.onclick = () => {
      faceSelected = on ? faceSelected.filter(c => c !== code) : [...faceSelected, code];
      renderFaceChips();
      renderFaceWho();
    };
    box.appendChild(b);
  });

  // 進頁時預設全開，不然畫面空空的看不出在幹嘛
  if (!faceSelected.length && codes.length) {
    faceSelected = codes.filter(c => FACE_IMPLEMENTED.has(c));
    if (faceSelected.length) { renderFaceChips(); return; }
  }
  renderFaceWho();
}

// 顯示目前選到的穴道的 WHO 定位文字 + 這條公式的參數來源（誠實面）
function renderFaceWho() {
  const el = document.getElementById('face-who');
  if (!el) return;
  if (!faceSelected.length) {
    el.textContent = isZh() ? '選一個穴道，這裡會顯示 WHO 的定位定義。'
                            : 'Select an acupoint to see its WHO definition.';
    return;
  }
  el.innerHTML = faceSelected.map(code => {
    const f = FACE_FORMULA[code];
    return `<div style="margin-bottom:7px">
        <b>${faceLabel(code)}</b> <span class="code">${code}</span><br>${faceWho(code)}
        ${f ? `<div class="face-src">${isZh() ? '參數來源' : 'Source'}：${f.src}</div>` : ''}
      </div>`;
  }).join('');
}

function toggleFaceDisc() {
  faceShowDisc = !faceShowDisc;
  syncFaceButtons();
}

function toggleFaceRefs() {
  faceShowRefs = !faceShowRefs;
  syncFaceButtons();
}

function syncFaceButtons() {
  const d = document.getElementById('face-disc-btn');
  if (d) d.textContent = t(faceShowDisc ? 'btn-disc-hide' : 'btn-disc-show');
  const r = document.getElementById('face-refs-btn');
  if (r) r.textContent = t(faceShowRefs ? 'face-btn-refs-hide' : 'face-btn-refs');
}

// ── 選穴頁的「臉部」分頁 ──────────────────────────────────────────
// 由 pages/02-recommend.js 的 renderAcuList() 在 currentRegion==='face' 時呼叫。
// 臉部沒有按摩流程，所以自帶一顆「開始臉部定位」，不共用手部那顆「開始療程」。
function renderFaceList(list) {
  const symptoms = state.selectedSymptoms.map(i => SYMPTOM_MAP[i].name);
  const codes = faceRecommend(symptoms);

  if (!codes.length) {
    list.appendChild(notice('small', isZh()
      ? '你選的症狀沒有對應的臉部穴道。'
      : 'No facial acupoints for the selected symptoms.'));
    return;
  }

  codes.forEach(code => {
    const ready = FACE_IMPLEMENTED.has(code);
    const checked = ready && state.selectedFace.includes(code);
    const item = document.createElement('div');
    item.className = 'acu-item' + (checked ? ' checked' : '');
    item.setAttribute('role', 'checkbox');
    item.setAttribute('aria-checked', String(checked));
    item.setAttribute('aria-disabled', String(!ready));
    if (!ready) item.style.opacity = '.45';
    item.tabIndex = ready ? 0 : -1;

    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = ready ? 'var(--good)' : 'var(--line)';

    const nm = document.createElement('span');
    nm.textContent = faceLabel(code);

    const tick = document.createElement('span');
    tick.className = 'tick';
    // 沒做的標「準備中」，不要留白讓人以為是可以選的
    tick.style.opacity = '1';
    tick.textContent = ready ? (checked ? '✓' : '') : (isZh() ? '準備中' : 'SOON');
    if (!ready) tick.style.color = 'var(--ink-soft)';

    item.append(dot, nm, tick);

    if (ready) {
      const toggle = () => {
        const on = !state.selectedFace.includes(code);
        state.selectedFace = on
          ? [...state.selectedFace, code]
          : state.selectedFace.filter(c => c !== code);
        renderAcuList();
      };
      item.onclick = toggle;
      item.onkeydown = (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); } };
    }
    list.appendChild(item);
  });

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn wide';
  btn.style.gridColumn = '1 / -1';
  btn.textContent = t('face-btn-start');
  btn.onclick = () => {
    if (!state.selectedFace.length) {
      alert(isZh() ? '請至少選一個臉部穴道' : 'Please select at least one facial acupoint');
      return;
    }
    faceSelected = [...state.selectedFace];
    showPage('face');
  };
  list.appendChild(btn);
}
