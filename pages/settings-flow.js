// ══ 設定 › 療程節奏（2026-09-02）═══════════════════════════════════
//
// 這裡放的三項都有同一個共通點：**療程開始後才想改就來不及了**。
//   認穴倒數 —— 認穴頁已經翻過去了
//   手序     —— 手都舉起來了
//   換手倒數 —— 正在換手
// 另外兩項（換穴自動/手動、單手秒數）改了立刻有感，所以留在按摩頁的齒輪與滑桿上。

registerPage('settings-flow', {
  tab: 'settings',
  backTo: 'settings',
  onEnter: () => renderFlowSettings(),
  onLanguage: () => renderFlowSettings(),

  html: `
  <div id="page-settings-flow" class="page">
    <style>
      .seg { display: flex; gap: 0; border: 1px solid var(--line); border-radius: var(--r); overflow: hidden; }
      .seg button {
        flex: 1; padding: 10px 8px; background: none; color: var(--ink-soft);
        border: 0; border-left: 1px solid var(--line);
        font-family: var(--font-sans); font-size: 13px; cursor: pointer;
      }
      .seg button:first-child { border-left: 0; }
      .seg button.on { background: var(--surface-2); color: var(--ink); font-weight: 600; }
      .seg button:hover { background: var(--surface-2); }
      .fieldrow { margin-bottom: 18px; }
      .fieldrow .k {
        font-family: var(--font-mono); font-size: 10.5px; letter-spacing: .1em;
        text-transform: uppercase; color: var(--ink-soft); margin-bottom: 6px;
      }
      .fieldrow .d { font-size: 12px; color: var(--ink-soft); line-height: 1.6; margin-top: 6px; }
    </style>

    <div class="stack">
      <div>
        <p class="eyebrow" data-i18n="eyebrow-settings">校正</p>
        <h2 data-i18n="settings-flow">療程節奏</h2>
      </div>

      <div class="fieldrow">
        <p class="k" data-i18n="settings-ready">認穴停留</p>
        <div class="seg" id="seg-ready"></div>
        <p class="d" data-i18n="settings-ready-desc">認穴頁停留幾秒後自動進入定位。設 0 就直接跳過認穴 —— 但定位模型原本是趁你讀說明時在背景載的，跳過會讓定位頁開頭卡一下。</p>
      </div>

      <div class="fieldrow">
        <p class="k" data-i18n="settings-handorder">手序</p>
        <div class="seg" id="seg-hand"></div>
        <p class="d" data-i18n="settings-handorder-desc">同一個穴道左右手各按一輪，這裡決定先按哪一隻。</p>
      </div>

      <div class="fieldrow">
        <p class="k" data-i18n="settings-switch">換手倒數</p>
        <div class="seg" id="seg-switch"></div>
        <p class="d" data-i18n="settings-switch-desc">一隻手按滿之後，倒數幾秒自動開始下一隻手。手還舉在鏡頭前的時候很難再點一次按鈕，所以預設是自動接上。</p>
      </div>

      <hr class="rule">

      <div class="fieldrow">
        <p class="k" data-i18n="settings-advance">換穴</p>
        <div class="seg" id="seg-advance"></div>
        <p class="d" data-i18n="settings-advance-desc">一個穴道左右手都按完之後，要不要自動接下一個穴道。設「手動」就會停在完成頁等你點。按摩頁的齒輪也調得到，改的是同一項。</p>
      </div>

      <div class="fieldrow">
        <p class="k" data-i18n="settings-press">單手秒數</p>
        <div class="seg" id="seg-press"></div>
        <p class="d" data-i18n="settings-press-desc">一隻手按幾秒。左右各一輪，所以一個穴道的實際時間是這個數字的兩倍。按摩頁的滑桿也調得到，改的是同一項。</p>
      </div>
    </div>
  </div>`,
});

function renderFlowSettings() {
  seg('seg-ready', [0, 3, 5, 10],
      v => (v === 0 ? (isZh() ? '跳過' : 'Skip') : `${v}s`),
      () => flow.readySec, v => setFlow('readySec', v));

  seg('seg-hand', ['right', 'left'],
      v => t(v === 'right' ? 'hand-right' : 'hand-left'),
      () => flow.handOrder, v => setFlow('handOrder', v));

  seg('seg-switch', [0, 3, 5, 10],
      v => (v === 0 ? (isZh() ? '不等' : 'None') : `${v}s`),
      () => flow.switchSec, v => setFlow('switchSec', v));

  // 下面兩項在按摩頁也調得到（齒輪、滑桿）。它們讀寫的是同一個 flow，
  // 所以兩邊不會各記一份、也不需要同步 —— 只是多一個「開始前就找得到」的入口。
  seg('seg-advance', [true, false],
      v => t(v ? 'advance-auto' : 'advance-manual'),
      () => flow.autoAdvance, v => setFlow('autoAdvance', v));

  // 秒數選 15/30/45/60：按摩頁那支滑桿是連續的，但設定頁給幾個常用值就夠，
  // 真要微調在按摩頁拉滑桿更直覺（拉的時候畫面上就在倒數）。
  seg('seg-press', [15, 30, 45, 60],
      v => `${v}s`,
      () => flow.pressSec, v => setFlow('pressSec', v));
}

// 分段選擇器：值一律存進 flow，按下去就生效（沒有「儲存」鈕，那多一步沒有意義）
function seg(id, values, label, get, set) {
  const box = document.getElementById(id);
  if (!box) return;
  box.innerHTML = '';
  values.forEach(v => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label(v);
    if (get() === v) b.classList.add('on');
    b.onclick = () => { set(v); renderFlowSettings(); };
    box.appendChild(b);
  });
}

// 設定目錄右邊那行灰字：不點進來也看得到現在設成什麼
function flowSummary() {
  const ready = flow.readySec === 0 ? (isZh() ? '跳過認穴' : 'Skip') : `${flow.readySec}s`;
  // 單手秒數也擺進來 —— 這是最常被問「一次要按多久」的那個數字
  return `${ready} · ${t(flow.handOrder === 'right' ? 'hand-right' : 'hand-left')} · ${flow.pressSec}s`;
}
