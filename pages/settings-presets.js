// ══ 設定 › 我的流程（2026-09-08）══════════════════════════════════
//
// 常按的人每次都要重走一次「選症狀 → 勾穴道」，而每次勾的其實是同一組。
// 一組流程 = 一組穴道（手部＋臉部）＋ 一套節奏，點一下直接排成療程。
//
// 為什麼入口在設定不在首頁：首頁那一頁是「我今天哪裡不舒服」的問診口氣，
// 塞一排「我的流程」進去會變成兩種不同的心智模型擠在同一頁。設定是「我平常怎麼用」，
// 流程屬於後者。→ 這也代表**開始的按鈕也在這一頁**，不是只做管理。
//
// ⭐ 節奏跟著流程走，但只在這一次有效（見 js/state.js 的 applyPresetFlow）：
//    回首頁就還原成全域設定，不會讓「睡前那組 45 秒」污染之後每一次手動療程。
//
// 資料存 localStorage 的 acuPresets，形狀與清洗都在 state.js。

registerPage('settings-presets', {
  tab: 'settings',
  backTo: 'settings',
  onEnter: () => renderPresetsPage(),
  onLanguage: () => renderPresetsPage(),

  html: `
  <div id="page-settings-presets" class="page">
    <style>
      /* 一列 = 一組流程。左邊點名字進去編輯，右邊「開始」是獨立按鈕 ——
         合成同一個可點區域的話，想改名的人會不小心開始一整段療程。 */
      #preset-list .row {
        display: flex; align-items: center; gap: 10px; width: 100%;
        padding: 0; background: none; border: 0;
        border-top: 1px solid var(--line-soft);
      }
      #preset-list .row:first-child { border-top: 0; }
      #preset-list .open {
        flex: 1; display: block; padding: 11px 12px; min-width: 0;
        background: none; border: 0; color: var(--ink); cursor: pointer;
        font-family: var(--font-sans); font-size: 13.5px; text-align: left;
      }
      #preset-list .open:hover { background: var(--surface-2); }
      #preset-list .nm { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      #preset-list .sub {
        display: block; margin-top: 2px; font-size: 11.5px; color: var(--ink-soft);
        font-variant-numeric: tabular-nums;
      }
      #preset-list .go {
        flex: none; margin-right: 10px; padding: 7px 13px; cursor: pointer;
        font-family: var(--font-sans); font-size: 12.5px;
        border: 1px solid var(--brass); border-radius: var(--r);
        background: var(--brass); color: #fff;
      }

      /* 編輯區：新增與修改共用同一塊，差別只在標題與有沒有刪除鈕 */
      #preset-edit[hidden] { display: none; }
      #preset-name {
        width: 100%; padding: 9px 10px;
        font-family: var(--font-sans); font-size: 14px;
        background: var(--surface); color: var(--ink);
        border: 1px solid var(--line); border-radius: var(--r);
      }
      .pfield { margin-bottom: 16px; }
      .pfield .k {
        font-family: var(--font-mono); font-size: 10.5px; letter-spacing: .1em;
        text-transform: uppercase; color: var(--ink-soft); margin-bottom: 6px;
      }
      .pfield .d { font-size: 12px; color: var(--ink-soft); line-height: 1.6; margin-top: 6px; }
      /* 穴道清單很長，收在固定高度裡捲動，不然節奏設定會被推到看不見的地方 */
      .picker { max-height: 232px; overflow-y: auto; }
      #preset-edit .btnrow { display: flex; flex-direction: column; gap: 9px; }
      #preset-edit .btnrow button {
        width: 100%; padding: 11px 16px; cursor: pointer;
        font-family: var(--font-sans); font-size: 14px;
        border: 1px solid var(--brass); border-radius: var(--r);
        background: var(--brass); color: #fff;
      }
      #preset-edit .btnrow button.ghost { background: transparent; color: var(--ink); border-color: var(--line); }
      #preset-edit .btnrow button.danger { background: transparent; color: var(--bad); border-color: var(--bad); }
      #preset-est {
        font-family: var(--font-mono); font-size: 12px; color: var(--ink-soft);
        font-variant-numeric: tabular-nums;
      }
    </style>

    <div class="stack">
      <div>
        <p class="eyebrow" data-i18n="eyebrow-settings">校正</p>
        <h2 data-i18n="settings-presets">我的流程</h2>
        <p class="small" data-i18n="settings-presets-desc">把常按的一組穴道存起來，下次點一下就直接開始，不用再走一次選症狀。</p>
      </div>

      <div id="preset-list" class="optlist"></div>

      <div class="btnrow" id="preset-new-row">
        <button type="button" class="ghost" onclick="openPresetEditor(null)"
                data-i18n="preset-new">＋ 新增流程</button>
      </div>

      <div id="preset-edit" hidden>
        <hr class="rule">

        <div class="pfield">
          <p class="k" data-i18n="preset-name">名稱</p>
          <input type="text" id="preset-name" maxlength="20" oninput="onPresetNameInput()">
        </div>

        <div class="pfield">
          <p class="k" data-i18n="preset-acu">手部穴道</p>
          <div class="optlist picker" id="preset-acu-list"></div>
          <p class="d" data-i18n="preset-acu-desc">只列得出算得出位置的穴道 —— 排一個定位不了的穴，等於自己排一個失敗。</p>
        </div>

        <div class="pfield">
          <p class="k" data-i18n="preset-face">臉部穴道</p>
          <div class="optlist picker" id="preset-face-list"></div>
          <p class="d" data-i18n="preset-face-desc">臉部一律排在療程最後：手部與臉部用不同模型、共用同一個鏡頭，中途來回切換要重載。</p>
        </div>

        <div class="pfield">
          <p class="k" data-i18n="preset-flow">這組的節奏</p>
          <div class="pfield"><p class="k" data-i18n="settings-ready">認穴停留</p><div class="seg" id="pseg-ready"></div></div>
          <div class="pfield"><p class="k" data-i18n="settings-handorder">手序</p><div class="seg" id="pseg-hand"></div></div>
          <div class="pfield"><p class="k" data-i18n="settings-switch">換手倒數</p><div class="seg" id="pseg-switch"></div></div>
          <div class="pfield"><p class="k" data-i18n="settings-advance">換穴</p><div class="seg" id="pseg-advance"></div></div>
          <div class="pfield"><p class="k" data-i18n="settings-press">單手秒數</p><div class="seg" id="pseg-press"></div></div>
          <p class="d" data-i18n="preset-flow-desc">這套節奏只在跑這組流程時生效，回首頁就還原成「療程節奏」那頁的設定。</p>
        </div>

        <p id="preset-est"></p>

        <div class="btnrow">
          <button type="button" onclick="savePresetEditor()" data-i18n="preset-save">儲存</button>
          <button type="button" class="ghost" onclick="closePresetEditor()" data-i18n="btn-cancel">取消</button>
          <button type="button" class="danger" id="preset-del" onclick="deletePresetEditor()"
                  data-i18n="preset-delete">刪除這組流程</button>
        </div>
      </div>
    </div>
  </div>`,
});

// ── 編輯中的那一份 ────────────────────────────────────────────────
// 刻意是「草稿」而不是直接改 presets 裡那筆：按取消要真的取消得掉。
// null = 現在沒在編輯。
let presetDraft = null;

function renderPresetsPage() {
  renderPresetList();
  if (presetDraft) renderPresetEditor(); else closePresetEditor();
}

function presetSummaryLine(p) {
  const n = p.acupoints.length + p.face.length;
  const min = Math.round(presetSeconds(p) / 60);
  return isZh() ? `${n} 穴 · 約 ${min} 分`
                : `${n} point${n > 1 ? 's' : ''} · ~${min} min`;
}

function renderPresetList() {
  const box = document.getElementById('preset-list');
  if (!box) return;

  if (!presets.length) {
    // 空狀態寫在清單裡而不是整頁換掉：新增鈕的位置不會因為有沒有資料而跳動
    box.innerHTML = `<div style="padding:14px 12px" class="small">${t('preset-empty')}</div>`;
    return;
  }

  box.innerHTML = presets.map(p => `
    <div class="row">
      <button type="button" class="open" onclick="openPresetEditor('${p.id}')">
        <span class="nm">${escapeHtml(p.name) || t('preset-untitled')}</span>
        <span class="sub">${presetSummaryLine(p)}</span>
      </button>
      <button type="button" class="go" onclick="startPreset('${p.id}')">${t('preset-start')}</button>
    </div>`).join('');
}

// 名稱是使用者自己打的字，會進 innerHTML —— 不擋的話打一個 < 就把整份清單的
// HTML 結構弄壞（不是資安問題，是「打了字之後清單就不見了」這種靜默故障）。
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ── 編輯器 ────────────────────────────────────────────────────────
function openPresetEditor(id) {
  const src = id ? findPreset(id) : null;
  presetDraft = src
    ? { id: src.id, name: src.name, acupoints: [...src.acupoints], face: [...src.face], flow: { ...src.flow } }
    // 新的一組預帶全域節奏：多數人不會改，帶目前設定比帶出廠值更接近他要的
    : { id: null, name: '', acupoints: [], face: [], flow: { ...flow } };
  renderPresetEditor();
  // 編輯區在清單下面，展開時要自己捲過去，不然使用者按了「新增」畫面看起來沒反應。
  // jsdom 沒有這個方法（測試會炸），所以先問再用。
  const box = document.getElementById('preset-edit');
  if (box.scrollIntoView) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closePresetEditor() {
  presetDraft = null;
  const box = document.getElementById('preset-edit');
  if (box) box.hidden = true;
  const row = document.getElementById('preset-new-row');
  if (row) row.hidden = false;
}

function renderPresetEditor() {
  const box = document.getElementById('preset-edit');
  if (!box || !presetDraft) return;
  box.hidden = false;
  document.getElementById('preset-new-row').hidden = true;
  document.getElementById('preset-del').hidden = !presetDraft.id;

  const nameEl = document.getElementById('preset-name');
  // 只在值真的不同時才寫回去：使用者正在打字時重寫 value 會把游標踢到最後面
  if (nameEl.value !== presetDraft.name) nameEl.value = presetDraft.name;
  nameEl.placeholder = t('preset-name-ph');

  document.getElementById('preset-acu-list').innerHTML = ACUPOINTS
    .filter(a => IMPLEMENTED.has(a.name))
    .map(a => `
      <label>
        <input type="checkbox" ${presetDraft.acupoints.includes(a.name) ? 'checked' : ''}
               onchange="togglePresetAcu('${a.name}')">
        <span class="grow">${acuLabel(a.name)}</span>
      </label>`).join('');

  document.getElementById('preset-face-list').innerHTML = FACE_ACUPOINTS
    .filter(a => FACE_IMPLEMENTED.has(a.code))
    .map(a => `
      <label>
        <input type="checkbox" ${presetDraft.face.includes(a.code) ? 'checked' : ''}
               onchange="togglePresetFace('${a.code}')">
        <span class="grow">${faceLabel(a.code)}</span>
      </label>`).join('');

  // seg() 是 settings-flow.js 的共用分段選擇器，這裡讀寫的是草稿而不是全域 flow
  const f = presetDraft.flow;
  const set = (k) => (v) => { f[k] = v; renderPresetEditor(); };
  seg('pseg-ready',   [0, 3, 5, 10], v => (v === 0 ? (isZh() ? '跳過' : 'Skip') : `${v}s`), () => f.readySec, set('readySec'));
  seg('pseg-hand',    ['right', 'left'], v => t(v === 'right' ? 'hand-right' : 'hand-left'), () => f.handOrder, set('handOrder'));
  seg('pseg-switch',  [0, 3, 5, 10], v => (v === 0 ? (isZh() ? '不等' : 'None') : `${v}s`), () => f.switchSec, set('switchSec'));
  seg('pseg-advance', [true, false], v => t(v ? 'advance-auto' : 'advance-manual'), () => f.autoAdvance, set('autoAdvance'));
  seg('pseg-press',   [15, 30, 45, 60], v => `${v}s`, () => f.pressSec, set('pressSec'));

  // 預估時長就擺在存檔鈕上面：勾到第七個穴才發現要八分鐘，太晚了
  const n = presetDraft.acupoints.length + presetDraft.face.length;
  const sec = presetSeconds(presetDraft);
  document.getElementById('preset-est').textContent = n
    ? (isZh() ? `共 ${n} 穴 · 預估 ${Math.floor(sec / 60)} 分 ${sec % 60} 秒`
              : `${n} points · about ${Math.floor(sec / 60)}m ${sec % 60}s`)
    : t('preset-est-none');
}

function onPresetNameInput() {
  if (!presetDraft) return;
  presetDraft.name = document.getElementById('preset-name').value.slice(0, PRESET_NAME_MAX);
}

function togglePresetAcu(name) {
  if (!presetDraft) return;
  const on = !presetDraft.acupoints.includes(name);
  presetDraft.acupoints = on
    ? [...presetDraft.acupoints, name]
    : presetDraft.acupoints.filter(x => x !== name);
  renderPresetEditor();
}

function togglePresetFace(code) {
  if (!presetDraft) return;
  const on = !presetDraft.face.includes(code);
  presetDraft.face = on
    ? [...presetDraft.face, code]
    : presetDraft.face.filter(x => x !== code);
  renderPresetEditor();
}

function savePresetEditor() {
  if (!presetDraft) return;

  if (!presetDraft.acupoints.length && !presetDraft.face.length) {
    alert(t('preset-need-acu'));
    return;
  }
  // 名字空著就給一個 —— 逼使用者想名字只是多一道關卡，清單靠「N 穴 · 約 X 分」也認得出來
  const name = presetDraft.name.trim() || defaultPresetName();

  if (presetDraft.id) {
    const i = presets.findIndex(p => p.id === presetDraft.id);
    if (i >= 0) presets[i] = { ...presetDraft, name };
  } else {
    if (presets.length >= PRESET_MAX) { alert(t('preset-full')); return; }
    presets.push({ ...presetDraft, name, id: 'p_' + Date.now() });
  }
  savePresets();
  closePresetEditor();
  renderPresetList();
}

// 「流程 1」「流程 2」…：找沒被用過的最小號，刪掉中間那組之後不會一直往上長
function defaultPresetName() {
  const base = isZh() ? '流程 ' : 'Routine ';
  for (let i = 1; i <= PRESET_MAX + 1; i++) {
    const n = base + i;
    if (!presets.some(p => p.name === n)) return n;
  }
  return base;
}

function deletePresetEditor() {
  if (!presetDraft || !presetDraft.id) return;
  if (!confirm(t('preset-delete-confirm'))) return;
  presets = presets.filter(p => p.id !== presetDraft.id);
  savePresets();
  closePresetEditor();
  renderPresetList();
}

// ── 開始 ──────────────────────────────────────────────────────────
// 走 goToAcuDetail 而不是自己排頁：排序（手部在前、臉部在後）與
// 「一個穴道都算不出來」的擋話都在 buildTreatmentList 裡，不要複製第二份。
function startPreset(id) {
  const p = findPreset(id);
  if (!p) return;
  applyPresetFlow(p.flow);
  state.selectedSymptoms = [];
  state.recommendedAcupoints = [];
  state.selectedAcupoints = [...p.acupoints];
  state.selectedFace = [...p.face];
  goToAcuDetail();
}

// 設定目錄右邊那行灰字
function presetsSummary() {
  if (!presets.length) return t('preset-none');
  return isZh() ? `${presets.length} 組` : `${presets.length}`;
}
