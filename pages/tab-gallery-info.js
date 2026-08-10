// ══ 圖冊 → 單穴介紹 ══════════════════════════════════════════════
// 從圖冊點任一格進來。未解鎖的也能看（不然收集不到的穴道就沒法先認識），
// 只是小人維持剪影。

let infoAcuName = null;

registerPage('acu-info', {
  tab: 'gallery',
  backTo: 'gallery',
  onEnter: () => renderAcuInfo(),
  onLanguage: () => renderAcuInfo(),

  html: `
  <div id="page-acu-info" class="page">
    <style>
      .info-head { display: flex; gap: 14px; align-items: center; }
      .info-portrait {
        flex: none; width: 92px; height: 92px; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        overflow: hidden; position: relative;
      }
      .info-portrait .minion { width: 84%; height: auto; display: block; }
      .info-portrait.locked .minion { filter: grayscale(1) brightness(.35) contrast(.85); opacity: .3; }
      .info-code {
        font-family: var(--font-mono); font-size: 11px; letter-spacing: .1em;
        color: var(--brass);
      }
      .info-meta { font-size: 12.5px; color: var(--ink-soft); margin-top: 3px; }

      .info-stat {
        display: flex; gap: 1px; background: var(--line);
        border: 1px solid var(--line); border-radius: var(--r); overflow: hidden;
      }
      .info-stat > div { flex: 1; background: var(--surface); padding: 9px 11px; }
      .info-stat .k {
        font-family: var(--font-mono); font-size: 9px; letter-spacing: .12em;
        text-transform: uppercase; color: var(--ink-soft);
      }
      .info-stat .v {
        font-family: var(--font-mono); font-size: 19px; margin-top: 2px;
        font-variant-numeric: tabular-nums; color: var(--ink);
      }

      .info-sec + .info-sec { margin-top: 13px; }
      .info-sec h3 {
        font-family: var(--font-mono); font-size: 10px; letter-spacing: .16em;
        text-transform: uppercase; color: var(--brass); font-weight: 500;
        margin-bottom: 5px;
      }
      .info-sec p { font-size: 13px; color: var(--ink); }

      .tag-row { display: flex; flex-wrap: wrap; gap: 5px; }
      .tag {
        font-size: 12px; padding: 4px 9px;
        border: 1px solid var(--line); border-radius: 999px;
        color: var(--ink-soft); background: var(--surface);
      }

      /* 這頁的參考圖給整塊寬度，比認穴頁那張大 */
      #info-ref .ref-frame, #info-ref .ref-none { width: 100%; }
      #info-ref .ref-frame img { max-height: 340px; object-fit: contain; }
    </style>

    <div class="stack">
      <div class="info-head">
        <div class="info-portrait" id="info-portrait"></div>
        <div>
          <p class="info-code" id="info-code"></p>
          <h2 class="acu-title" id="info-name"></h2>
          <p class="info-meta" id="info-meta"></p>
        </div>
      </div>

      <div class="info-stat" id="info-stat"></div>
      <div id="info-note"></div>

      <div>
        <div class="info-sec">
          <h3 data-i18n="info-locate">定位</h3>
          <p id="info-locate"></p>
        </div>
        <div class="info-sec" id="info-ref"></div>
        <div class="info-sec">
          <h3 data-i18n="info-symptoms">主治</h3>
          <div class="tag-row" id="info-symptoms"></div>
        </div>
      </div>

      <button class="btn wide" id="btn-practice" onclick="practiceThisAcu()" data-i18n="btn-practice">練這一穴</button>
    </div>
  </div>`,
});

// 從圖冊點某一格
function showAcuInfo(name) {
  infoAcuName = name;
  showPage('acu-info');
}

function renderAcuInfo() {
  const name = infoAcuName;
  if (!name) { showPage('gallery'); return; }

  const acu = ACUPOINTS.find(a => a.name === name) || {};
  const detail = ACUPOINT_DETAIL[name] || {};
  const m = state.minions[name];
  const hist = state.history[name];

  // ── 頭像 ──
  const portrait = document.getElementById('info-portrait');
  portrait.innerHTML = '';
  portrait.className = 'info-portrait' + (m ? '' : ' locked');
  portrait.style.background = acuColor(name);
  portrait.appendChild(minionImg(name));

  document.getElementById('info-code').textContent = acu.code || '';
  document.getElementById('info-name').textContent = acuLabel(name);

  // ── 部位 + 正反面 ──
  const region = regionOf(acuRegion(name));
  const sideKey = BILATERAL_ACUPOINTS.has(name) ? 'side-both'
    : acu.side === 'palm' ? 'side-palm' : 'side-dorsal';
  const implemented = IMPLEMENTED.has(name);
  document.getElementById('info-meta').textContent =
    `${t(region.label)}　·　${t(sideKey)}` + (implemented ? '' : `　·　${t('info-nolocate')}`);

  // ── 收集狀態 ──
  document.getElementById('info-stat').innerHTML = [
    [t('info-level'), m ? 'Lv.' + m.level : '—'],
    [t('info-times'), hist ? hist.times : 0],
    [t('info-last'),  hist && hist.lastDate ? hist.lastDate.slice(5) : '—'],
  ].map(([k, v]) => `<div><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');

  // ── 安全警語 ──
  const noteBox = document.getElementById('info-note');
  noteBox.innerHTML = '';
  if (detail.note) {
    const p = document.createElement('p');
    p.className = 'notice warn';
    p.textContent = detail.note;
    noteBox.appendChild(p);
  }

  document.getElementById('info-locate').textContent =
    acu.locate || (isZh() ? '（尚無定位描述）' : '(no description yet)');

  // ── 參考圖 ──
  const refSec = document.getElementById('info-ref');
  refSec.innerHTML = `<h3>${t('ref-title')}</h3>`;
  refSec.appendChild(acuRefBlock(name));

  // ── 主治：從症狀表反查 ──
  const sym = SYMPTOM_MAP.filter(s => s.acupoints.includes(name));
  const symBox = document.getElementById('info-symptoms');
  symBox.innerHTML = '';
  if (!sym.length) {
    symBox.innerHTML = `<span class="tag">${t('info-nosymptom')}</span>`;
  } else {
    sym.forEach(s => {
      const el = document.createElement('span');
      el.className = 'tag';
      el.textContent = symptomLabel(s.name);
      symBox.appendChild(el);
    });
  }

  // 沒有定位公式的穴道不能練，按了只會失敗
  const btn = document.getElementById('btn-practice');
  btn.disabled = !implemented;
  btn.textContent = implemented ? t('btn-practice') : t('info-nolocate');
}

// 從圖冊直接練單穴：跳過症狀與選穴，直接進認穴
function practiceThisAcu() {
  if (!infoAcuName || !IMPLEMENTED.has(infoAcuName)) return;
  state.selectedSymptoms = [];
  state.recommendedAcupoints = [infoAcuName];
  state.selectedAcupoints = [infoAcuName];
  state.currentAcupointIndex = 0;
  showPage('acu-detail');
}
