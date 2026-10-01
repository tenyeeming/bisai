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
        font-family: var(--font-sans); font-size: 0.84375rem; text-align: left;
      }
      #preset-list .open:hover { background: var(--surface-2); }
      #preset-list .nm { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      #preset-list .sub {
        display: block; margin-top: 2px; font-size: 0.71875rem; color: var(--ink-soft);
        font-variant-numeric: tabular-nums;
      }
      #preset-list .go {
        flex: none; margin-right: 10px; padding: 7px 13px; cursor: pointer;
        font-family: var(--font-sans); font-size: 0.78125rem;
        border: 1px solid var(--brass); border-radius: var(--r);
        background: var(--brass); color: var(--on-brass);
      }

      /* 編輯區：新增與修改共用同一塊，差別只在有沒有節奏／逐穴秒數與刪除鈕 */
      #preset-edit[hidden] { display: none; }
      #preset-name {
        width: 100%; padding: 9px 10px;
        font-family: var(--font-sans); font-size: 0.875rem;
        background: var(--surface); color: var(--ink);
        border: 1px solid var(--line); border-radius: var(--r);
      }
      .pfield { margin-bottom: 16px; }
      .pfield[hidden], #preset-later[hidden] { display: none; }
      .pfield .k, #preset-chosen-box .k {
        font-family: var(--font-mono); font-size: 0.65625rem; letter-spacing: .1em;
        text-transform: uppercase; color: var(--ink-soft); margin-bottom: 6px;
      }
      .pfield .d { font-size: 0.75rem; color: var(--ink-soft); line-height: 1.6; margin-top: 6px; }

      /* ── 已選（2026-10-01 我的流程簡化）：常駐頂端，順序＝療程順序（手部 → 手肘 → 臉部）── */
      #preset-chosen-box {
        position: sticky; top: 0; z-index: 2;
        padding: 10px 12px; margin-bottom: 12px;
        background: var(--surface); border: 1px solid var(--brass); border-radius: var(--r);
      }
      #preset-chosen { display: flex; flex-wrap: wrap; gap: 6px; }
      #preset-chosen .chip {
        display: inline-flex; align-items: center; gap: 4px;
        padding: 3px 3px 3px 9px; border-radius: var(--r-pill);
        background: var(--surface-2); border: 1px solid var(--line);
        font-size: 0.8125rem; color: var(--ink);
      }
      #preset-chosen .chip .no { font-family: var(--font-mono); font-size: 0.6875rem; color: var(--ink-soft); }
      #preset-chosen .chip button {
        width: 26px; height: 26px; border: 0; border-radius: 50%; cursor: pointer;
        background: none; color: var(--ink-soft); font-size: 0.875rem; line-height: 1;
      }
      #preset-chosen .chip button:hover { color: var(--bad); }
      #preset-chosen .none { font-size: 0.78125rem; color: var(--ink-soft); }

      /* ── 依病症選：按鈕展開症狀格子，點一個就把推薦穴加進已選（不重複）── */
      #preset-sym-btn {
        width: 100%; margin-bottom: 10px; padding: 10px 16px; cursor: pointer;
        font-family: var(--font-sans); font-size: 0.875rem; font-weight: 600;
        background: transparent; color: var(--ink); border: 1px solid var(--brass); border-radius: var(--r);
      }
      /* 右邊箭頭：收著 ▲、展開 ▼（2026-10-01 用戶） */
      #preset-sym-btn { display: flex; align-items: center; justify-content: space-between; text-align: left; }
      #preset-sym-btn .arr { color: var(--brass); font-size: 0.8125rem; }
      #preset-sym[hidden] { display: none; }
      #preset-sym { display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); grid-auto-rows: 1fr; gap: 6px; margin-bottom: 8px; }
      #preset-sym button {
        min-height: 48px; display: flex; align-items: center; justify-content: center; text-align: center; line-height: 1.3;
        padding: 6px; cursor: pointer; font-family: var(--font-sans); font-size: 0.78125rem; font-weight: 600;
        background: var(--surface); color: var(--ink); border: 1px solid var(--line); border-radius: var(--r);
      }
      #preset-sym button:hover { border-color: var(--brass); }
      #preset-sym button.on { border-color: var(--brass); background: var(--brass); color: var(--on-brass); }
      /* 點了症狀 → 列出那個症狀可以選的穴道，使用者自己勾（2026-10-01 用戶：不要直接幫我選完） */
      #preset-sym-pick[hidden] { display: none; }
      #preset-sym-pick { margin-bottom: 12px; }
      #preset-sym-pick .k { font-size: 0.78125rem; font-weight: 700; color: var(--ink); margin: 2px 0 6px; }
      #preset-sym-pick .tag { font-size: 0.6875rem; color: var(--ink-soft); }
      #preset-sym-pick .none { font-size: 0.78125rem; color: var(--ink-soft); }
      /* ⓘ 詳情：跟選穴頁同一個圓圈、同一個面板（02-recommend.js openAcuInfo／openForearmInfo／openFaceInfo） */
      #preset-edit .info {
        flex: none; width: 22px; height: 22px; padding: 0;
        border: 1px solid var(--line); border-radius: 50%;
        background: none; color: var(--ink-soft);
        font-family: var(--font-mono); font-size: 0.75rem; line-height: 1;
        cursor: pointer; display: grid; place-items: center;
      }
      #preset-edit .info:hover { border-color: var(--brass); color: var(--brass); }

      /* ── 依部位分組（手背／手心／手肘／臉部），可收合 ── */
      .pgroup { margin-bottom: 8px; }
      .pgroup > summary {
        display: flex; align-items: center; gap: 8px; cursor: pointer; list-style: none;
        padding: 8px 2px; font-size: 0.875rem; font-weight: 700; color: var(--ink);
      }
      .pgroup > summary::-webkit-details-marker { display: none; }
      .pgroup > summary::after { content: '▾'; margin-left: auto; color: var(--ink-soft); }
      .pgroup:not([open]) > summary::after { content: '▸'; }
      .pgroup > summary .n { font-family: var(--font-mono); font-size: 0.71875rem; font-weight: 400; color: var(--brass); }

      #preset-edit .btnrow { display: flex; flex-direction: column; gap: 9px; }
      #preset-edit .btnrow button {
        width: 100%; padding: 11px 16px; cursor: pointer;
        font-family: var(--font-sans); font-size: 0.875rem;
        border: 1px solid var(--brass); border-radius: var(--r);
        background: var(--brass); color: var(--on-brass);
      }
      #preset-edit .btnrow button:disabled { opacity: .45; cursor: not-allowed; }
      #preset-edit .btnrow button.ghost { background: transparent; color: var(--ink); border-color: var(--line); }
      #preset-edit .btnrow button.danger { background: transparent; color: var(--bad); border-color: var(--bad); }
      /* 逐穴秒數（只在編輯既有流程時有 ▾）：一列＝勾選 label ＋ 右邊 ▾；展開的面板接在該列下面 */
      .pgroup .optlist > .prow { display: flex; align-items: stretch; padding: 0; cursor: default; }
      .pgroup .prow label { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; padding: 11px 12px; cursor: pointer; }
      .pgroup .optlist > .ptime { display: block; cursor: default; }
      .pgroup .psec { font-family: var(--font-mono); font-size: 0.75rem; color: var(--brass); }
      .pgroup .pexp {
        flex: none; width: 40px; cursor: pointer; background: none; color: var(--ink-soft);
        border: 0; border-left: 1px solid var(--line-soft);
      }
      .pgroup .pexp:disabled { opacity: .3; cursor: not-allowed; }
      .pgroup .ptime {
        margin: 0; padding: 10px 12px; border: 0; border-top: 1px solid var(--line-soft);
        border-radius: var(--r); background: var(--surface-2);
      }
      .pgroup .ptime .k { font-size: 0.71875rem; color: var(--ink-soft); margin: 4px 0; }
      .pgroup .ptime-top { display: flex; align-items: baseline; justify-content: space-between; }
      .pgroup .ptime-top b { font-size: 1.25rem; color: var(--brass); }
      .pgroup .ptime input { width: 100%; accent-color: var(--brass); }
      .pgroup .ptime button {
        width: 100%; margin-top: 6px; padding: 8px; cursor: pointer; font-size: 0.8125rem;
        background: transparent; color: var(--ink); border: 1px solid var(--line); border-radius: var(--r-pill);
      }
      #preset-est {
        font-family: var(--font-mono); font-size: 0.75rem; color: var(--ink-soft);
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

        <!-- 2026-10-01 我的流程簡化（用戶確認：預設直接選穴、依病症選是另一顆鈕、手肘可排、順序手部→手肘→臉部）。
             規劃：比賽專區/介面討論/我的流程簡化_規劃_20261001.md -->
        <div id="preset-chosen-box">
          <p class="k" data-i18n="preset-chosen">已選（按療程順序）</p>
          <div id="preset-chosen"></div>
        </div>

        <button type="button" id="preset-sym-btn" onclick="togglePresetSym()" aria-expanded="false">
          <span data-i18n="preset-by-symptom">依病症選擇</span><span class="arr" aria-hidden="true">▲</span></button>
        <div id="preset-sym" hidden></div>
        <div id="preset-sym-pick" hidden></div>

        <!-- 手部不分手背／手心（2026-10-01 用戶：「手直接叫手就好」） -->
        <details class="pgroup" data-grp="hand" ontoggle="onPresetGroupToggle(this)">
          <summary><span data-i18n="region-hand">手部</span><span class="n"></span></summary>
          <div class="optlist" id="preset-acu-hand"></div></details>
        <details class="pgroup" data-grp="elbow" ontoggle="onPresetGroupToggle(this)">
          <summary><span data-i18n="region-elbow">手肘</span><span class="n"></span></summary>
          <div class="optlist" id="preset-forearm-list"></div></details>
        <details class="pgroup" data-grp="face" ontoggle="onPresetGroupToggle(this)">
          <summary><span data-i18n="region-face">臉部</span><span class="n"></span></summary>
          <div class="optlist" id="preset-face-list"></div></details>

        <!-- 節奏：新增時不出現（先帶目前的設定），存好後點進那組才調 -->
        <div class="pfield" id="preset-flow-box">
          <p class="k" data-i18n="preset-flow">這組的節奏</p>
          <div class="pfield"><p class="k" data-i18n="settings-ready">認穴停留</p><div class="seg" id="pseg-ready"></div></div>
          <div class="pfield"><p class="k" data-i18n="settings-handorder">手序</p><div class="seg" id="pseg-hand"></div></div>
          <div class="pfield"><p class="k" data-i18n="settings-switch">換手倒數</p><div class="seg" id="pseg-switch"></div></div>
          <div class="pfield"><p class="k" data-i18n="settings-advance">換穴</p><div class="seg" id="pseg-advance"></div></div>
          <div class="pfield"><p class="k" data-i18n="settings-press">單手秒數</p><div class="seg" id="pseg-press"></div></div>
          <p class="d" data-i18n="preset-flow-desc">這套節奏只在跑這組流程時生效，回首頁就還原成「療程節奏」那頁的設定。</p>
        </div>
        <p class="small" id="preset-later" data-i18n="preset-later">秒數與節奏先用目前的設定；存好之後點進這組就能調。</p>

        <div class="pfield">
          <p class="k" data-i18n="preset-name">名稱</p>
          <input type="text" id="preset-name" maxlength="20" oninput="onPresetNameInput()">
        </div>

        <p id="preset-est"></p>

        <div class="btnrow">
          <button type="button" id="preset-save" onclick="savePresetEditor()" data-i18n="preset-save">儲存</button>
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
  const n = presetCount(p);
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
    ? { id: src.id, name: src.name, acupoints: [...src.acupoints], forearm: [...(src.forearm || [])],
        face: [...src.face], flow: { ...src.flow }, perAcuSec: { ...(src.perAcuSec || {}) } }
    // 新的一組預帶全域節奏：多數人不會改，帶目前設定比帶出廠值更接近他要的
    : { id: null, name: '', acupoints: [], forearm: [], face: [], flow: { ...flow }, perAcuSec: {} };
  presetOpenTime = null;
  presetSymOpen = false;
  presetSymSel = null;
  // 分組預設：新增時只開手背（最常用、最長那組），其他收著；編輯時有勾到的那幾組打開
  presetGroupOpen = src
    ? { hand: true, elbow: presetDraft.forearm.length > 0, face: src.face.length > 0 }
    : { hand: true, elbow: false, face: false };
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

// ── 2026-10-01 我的流程簡化 ─────────────────────────────────────────
// 用戶確認：預設直接選穴（依部位分組、可收合）、「依病症選」是另一顆鈕、手肘可排、
// 順序固定手部 → 手肘 → 臉部（跟 buildTreatmentList 同一個排法，已選列照這個順序顯示）。
// 新增時不出現節奏與逐穴秒數（先帶目前的設定），存好後點進那組才調。
let presetSymOpen = false;
let presetSymSel = null;     // 依病症選：現在點開的是哪個症狀（SYMPTOM_MAP 索引）
let presetGroupOpen = { hand: true, elbow: false, face: false };

/** 已選，照療程順序：手部（ACUPOINTS 順序）→ 手肘 → 臉部 */
function presetChosenOrdered(d) {
  const by = (order) => (a, b) => order.indexOf(a) - order.indexOf(b);
  const hand = ACUPOINTS.map(a => a.name), fore = FOREARM_ACUPOINTS.map(a => a.name), face = FACE_ACUPOINTS.map(a => a.code);
  return [
    ...[...d.acupoints].sort(by(hand)).map(id => ({ kind: 'hand', id, label: acuLabel(id) })),
    ...[...d.forearm].sort(by(fore)).map(id => ({ kind: 'forearm', id, label: itemLabel(id) })),
    ...[...d.face].sort(by(face)).map(id => ({ kind: 'face', id, label: faceLabel(id) })),
  ];
}

/** 切換某一穴（已選列的 ✕、依病症選的勾選框共用） */
function removePresetItem(kind, id) {
  if (kind === 'hand') togglePresetAcu(id);
  else if (kind === 'forearm') togglePresetForearm(id);
  else togglePresetFace(id);
}

function onPresetGroupToggle(el) {
  if (presetDraft && el && el.dataset) presetGroupOpen[el.dataset.grp] = el.open;
}

function togglePresetSym() {
  presetSymOpen = !presetSymOpen;
  if (!presetSymOpen) presetSymSel = null;
  renderPresetEditor();
}

// 依病症選（2026-10-01 改）：用戶「不要直接給我選完，而是選那個症狀后就列出有那些可以選擇」
//   → 點症狀只**列出**那個症狀推薦的穴（只收定位得出來的），勾不勾由使用者決定；再點一次收起。
function selectPresetSymptom(i) {
  presetSymSel = presetSymSel === i ? null : i;
  renderPresetEditor();
}

/** 這個症狀可以選的穴：[{kind, id, label, tag}]，順序手部 → 手肘 → 臉部 */
function presetSymptomItems(i) {
  const s = SYMPTOM_MAP[i];
  if (!s) return [];
  const hand = s.acupoints.filter(n => IMPLEMENTED.has(n))
    .map(id => ({ kind: 'hand', id, label: acuLabel(id), tag: t('region-hand') }));
  const fore = forearmRecommend([s.name]).map(id => ({ kind: 'forearm', id, label: itemLabel(id), tag: t('region-elbow') }));
  const face = faceRecommend([s.name]).filter(c => FACE_IMPLEMENTED.has(c))
    .map(id => ({ kind: 'face', id, label: faceLabel(id), tag: t('region-face') }));
  return [...hand, ...fore, ...face];
}

// ⓘ：放在 <label> 裡，點它不能勾選 —— preventDefault 擋掉 label 的轉送
function presetInfoBtn(kind, id) {
  const fn = kind === 'hand' ? 'openAcuInfo' : kind === 'forearm' ? 'openForearmInfo' : 'openFaceInfo';
  return `<button type="button" class="info" aria-label="${t('a11y-info')}"
    onclick="event.preventDefault(); event.stopPropagation(); ${fn}('${id}')">ⓘ</button>`;
}

const presetHas = (kind, id) => kind === 'hand' ? presetDraft.acupoints.includes(id)
  : kind === 'forearm' ? presetDraft.forearm.includes(id) : presetDraft.face.includes(id);

function renderPresetEditor() {
  const box = document.getElementById('preset-edit');
  if (!box || !presetDraft) return;
  box.hidden = false;
  document.getElementById('preset-new-row').hidden = true;
  const editing = !!presetDraft.id;
  document.getElementById('preset-del').hidden = !editing;
  document.getElementById('preset-flow-box').hidden = !editing;
  document.getElementById('preset-later').hidden = editing;

  const nameEl = document.getElementById('preset-name');
  // 只在值真的不同時才寫回去：使用者正在打字時重寫 value 會把游標踢到最後面
  if (nameEl.value !== presetDraft.name) nameEl.value = presetDraft.name;
  nameEl.placeholder = t('preset-name-ph');

  // ── 已選 ──
  const chosen = presetChosenOrdered(presetDraft);
  document.getElementById('preset-chosen').innerHTML = chosen.length
    ? chosen.map((c, i) => `
      <span class="chip"><span class="no">${i + 1}</span>${c.label}
        <button type="button" aria-label="${t('preset-remove')} ${c.label}"
                onclick="removePresetItem('${c.kind}', '${c.id}')">✕</button></span>`).join('')
    : `<span class="none">${t('preset-chosen-none')}</span>`;

  // ── 依病症選 ──
  const symBtn = document.getElementById('preset-sym-btn');
  symBtn.setAttribute('aria-expanded', String(presetSymOpen));
  symBtn.querySelector('.arr').textContent = presetSymOpen ? '▼' : '▲';
  const sym = document.getElementById('preset-sym');
  sym.hidden = !presetSymOpen;
  sym.innerHTML = presetSymOpen ? SYMPTOM_MAP.map((s, i) =>
    `<button type="button" class="${presetSymSel === i ? 'on' : ''}" aria-pressed="${presetSymSel === i}"
             onclick="selectPresetSymptom(${i})">${symptomLabel(s.name)}</button>`).join('') : '';
  const pick = document.getElementById('preset-sym-pick');
  pick.hidden = !(presetSymOpen && presetSymSel != null);
  if (!pick.hidden) {
    const items = presetSymptomItems(presetSymSel);
    const nm = symptomLabel(SYMPTOM_MAP[presetSymSel].name);
    pick.innerHTML = `<p class="k">${isZh() ? `「${nm}」可以選` : `Points for ${nm}`}</p>` + (items.length
      ? `<div class="optlist">${items.map(it => `
        <label>
          <input type="checkbox" ${presetHas(it.kind, it.id) ? 'checked' : ''}
                 onchange="removePresetItem('${it.kind}', '${it.id}')">
          <span class="grow">${it.label}</span><span class="tag">${it.tag}</span>${presetInfoBtn(it.kind, it.id)}
        </label>`).join('')}</div>`
      : `<p class="none">${isZh() ? '這個症狀沒有可以定位的穴道。' : 'No locatable points for this symptom.'}</p>`);
  } else pick.innerHTML = '';

  // ── 依部位分組 ──
  // 逐穴秒數 ▾（批 E）只在編輯既有流程時給：新增這一步不調秒數
  const handRow = (a) => {
    const on = presetDraft.acupoints.includes(a.name);
    const custom = on && a.name in presetDraft.perAcuSec;
    const open = editing && on && presetOpenTime === a.name;
    return `
      <div class="prow">
        <label>
          <input type="checkbox" ${on ? 'checked' : ''} onchange="togglePresetAcu('${a.name}')">
          <span class="grow">${acuLabel(a.name)}</span>
          <span class="psec">${custom ? presetDraft.perAcuSec[a.name] + 's' : ''}</span>${presetInfoBtn('hand', a.name)}
        </label>
        ${editing ? `<button type="button" class="pexp" ${on ? '' : 'disabled'} aria-expanded="${open}"
                title="${on ? t('preset-time-per-hand') : t('preset-time-need-pick')}"
                onclick="togglePresetTime('${a.name}')">${open ? '▴' : '▾'}</button>` : ''}
      </div>
      ${open ? presetTimePanelHtml(a.name) : ''}`;
  };
  const hands = ACUPOINTS.filter(a => IMPLEMENTED.has(a.name));
  document.getElementById('preset-acu-hand').innerHTML = hands.map(handRow).join('');
  document.getElementById('preset-forearm-list').innerHTML = FOREARM_ACUPOINTS.map(a => `
      <label>
        <input type="checkbox" ${presetDraft.forearm.includes(a.name) ? 'checked' : ''}
               onchange="togglePresetForearm('${a.name}')">
        <span class="grow">${itemLabel(a.name)}</span>${presetInfoBtn('forearm', a.name)}
      </label>`).join('');
  document.getElementById('preset-face-list').innerHTML = FACE_ACUPOINTS
    .filter(a => FACE_IMPLEMENTED.has(a.code))
    .map(a => `
      <label>
        <input type="checkbox" ${presetDraft.face.includes(a.code) ? 'checked' : ''}
               onchange="togglePresetFace('${a.code}')">
        <span class="grow">${faceLabel(a.code)}</span>${presetInfoBtn('face', a.code)}
      </label>`).join('');
  const counts = {
    hand: presetDraft.acupoints.length,
    elbow: presetDraft.forearm.length, face: presetDraft.face.length,
  };
  document.querySelectorAll('#preset-edit .pgroup').forEach(g => {
    const k = g.dataset.grp;
    if (g.open !== !!presetGroupOpen[k]) g.open = !!presetGroupOpen[k];
    g.querySelector('summary .n').textContent = counts[k] ? `✓ ${counts[k]}` : '';
  });

  // 節奏（只在編輯既有流程時）。seg() 是 settings-flow.js 的共用分段選擇器，這裡讀寫的是草稿而不是全域 flow
  if (editing) {
    const f = presetDraft.flow;
    const set = (k) => (v) => { f[k] = v; renderPresetEditor(); };
    // App 批 93：開關＋開著才出現 1～15 秒滑桿（autoSecRow 在 settings-flow.js）
    autoSecRow('pseg-ready', () => f.readyAuto, set('readyAuto'), () => f.readySec, v => { f.readySec = v; updatePresetEst(); }, renderPresetEditor);
    seg('pseg-hand',    ['right', 'left'], v => t(v === 'right' ? 'hand-right' : 'hand-left'), () => f.handOrder, set('handOrder'));
    autoSecRow('pseg-switch', () => f.switchAuto, set('switchAuto'), () => f.switchSec, v => { f.switchSec = v; updatePresetEst(); }, renderPresetEditor);
    seg('pseg-advance', [true, false], v => t(v ? 'advance-auto' : 'advance-manual'), () => f.autoAdvance, set('autoAdvance'));
    seg('pseg-press',   [15, 30, 45, 60], v => `${v}s`, () => f.pressSec, set('pressSec'));
  }

  // 沒勾任何穴：儲存鈕按不下去（以前是按了跳 alert；App 本來就是停用，兩邊統一）
  document.getElementById('preset-save').disabled = presetCount(presetDraft) === 0;
  updatePresetEst();
}

// 預估時長就擺在存檔鈕上面：勾到第七個穴才發現要八分鐘，太晚了
// 拖秒數滑桿時只更新這一行，不整個編輯器重畫
function updatePresetEst() {
  if (!presetDraft) return;
  const n = presetCount(presetDraft);
  const sec = presetSeconds(presetDraft);
  document.getElementById('preset-est').textContent = n
    ? (isZh() ? `共 ${n} 穴 · 預估 ${Math.floor(sec / 60)} 分 ${sec % 60} 秒`
              : `${n} points · about ${Math.floor(sec / 60)}m ${sec % 60}s`)
    : t('preset-est-none');
}

function togglePresetForearm(name) {
  if (!presetDraft) return;
  presetDraft.forearm = presetDraft.forearm.includes(name)
    ? presetDraft.forearm.filter(x => x !== name)
    : [...presetDraft.forearm, name];
  renderPresetEditor();
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
  // 取消勾選：面板收起、秒數丟掉（App PresetRules.cleanOne 同）
  if (!on) { delete presetDraft.perAcuSec[name]; if (presetOpenTime === name) presetOpenTime = null; }
  renderPresetEditor();
}

// ── 逐穴秒數面板（App AcuTimePanel）──────────────────────────────────
let presetOpenTime = null;

function togglePresetTime(name) {
  if (!presetDraft || !presetDraft.acupoints.includes(name)) return;
  presetOpenTime = presetOpenTime === name ? null : name;
  renderPresetEditor();
}

function presetTimePanelHtml(name) {
  const sec = presetSecOf(presetDraft, name);
  const custom = name in presetDraft.perAcuSec;
  return `
      <div class="ptime">
        <div class="ptime-top"><span class="k">${t('preset-time-per-hand')}</span><b class="ptime-sec">${sec}s</b></div>
        <input type="range" min="${PRESS_MIN}" max="${PRESS_MAX}" step="${PRESS_STEP}" value="${sec}"
               oninput="onPresetTimeInput('${name}', this.value)" onchange="renderPresetEditor()">
        <p class="k ptime-total">${t('preset-time-total').replace('{n}', sec * 2)}</p>
        ${custom
          ? `<button type="button" class="ghost" onclick="resetPresetTime('${name}')">${t('preset-time-reset')}</button>`
          : `<p class="k">${t('preset-time-default').replace('{n}', presetDraft.flow.pressSec)}</p>`}
      </div>`;
}

// 拖動中只改數字，不整份重畫（重畫會把正在拖的滑桿換掉）；放開（change）再重畫
function onPresetTimeInput(name, v) {
  if (!presetDraft) return;
  presetDraft.perAcuSec[name] = intIn(v, PRESS_MIN, PRESS_MAX, presetDraft.flow.pressSec);
  const sec = presetDraft.perAcuSec[name];
  const s = document.querySelector('#preset-acu-list .ptime-sec'); if (s) s.textContent = sec + 's';
  const tt = document.querySelector('#preset-acu-list .ptime-total'); if (tt) tt.textContent = t('preset-time-total').replace('{n}', sec * 2);
}

function resetPresetTime(name) {
  if (!presetDraft) return;
  delete presetDraft.perAcuSec[name];
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

  if (!presetCount(presetDraft)) return;   // 儲存鈕本來就是停用的；這行防直接呼叫
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
  // 逐穴秒數：這一組調過的那幾穴帶進這次療程（沒調過的跟著這一組的 pressSec）
  state.acuSecs = { ...(p.perAcuSec || {}) };
  state.selectedSymptoms = [];
  state.recommendedAcupoints = [];
  state.selectedAcupoints = [...p.acupoints];
  state.selectedFace = [...p.face];
  state.selectedForearm = [...(p.forearm || [])];
  goToAcuDetail();
}

// 設定目錄右邊那行灰字
function presetsSummary() {
  if (!presets.length) return t('preset-none');
  return isZh() ? `${presets.length} 組` : `${presets.length}`;
}
