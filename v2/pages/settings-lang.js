// ══ 設定 › 語言 ═══════════════════════════════════════════════════
//
// 一列一個語言，選中的右邊打勾（LINE 式）。
// 切了語言之後這一頁自己會重繪，所以打勾會跟著跳。

registerPage('settings-lang', {
  tab: 'settings',
  backTo: 'settings',
  onEnter: () => updateLangSeg(),
  onLanguage: () => updateLangSeg(),

  html: `
  <div id="page-settings-lang" class="page">
    <div class="stack">
      <div>
        <p class="eyebrow" data-i18n="eyebrow-settings">校正</p>
        <h2 data-i18n="settings-lang">語言</h2>
      </div>
      <div class="optlist" id="lang-seg">
        <button type="button" data-lang="zh" onclick="setLanguage('zh')">
          <span class="grow">中文</span><span class="tick">✓</span>
        </button>
        <button type="button" data-lang="en" onclick="setLanguage('en')">
          <span class="grow">English</span><span class="tick">✓</span>
        </button>
      </div>
      <p class="small" data-i18n="settings-lang-desc">穴道名稱與症狀名在英文模式下會顯示英文對照，沒有對照的仍顯示中文。</p>
    </div>
  </div>`,
});

function updateLangSeg() {
  document.querySelectorAll('#lang-seg button').forEach(b => {
    const on = b.getAttribute('data-lang') === currentLanguage;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  });
}
