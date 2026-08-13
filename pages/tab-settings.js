// ══ 設定分頁 ═════════════════════════════════════════════════════
//
// 這一頁只是「目錄」：一個功能一列，點進去才調整（LINE 的設定就是這樣）。
// 實際的開關都在子頁：
//   settings-lang      語言
//   settings-notify    每日提醒（含每天要按什麼）
//   settings-accuracy  定位精度（嚴格模式）
//   settings-data      資料與紀錄（清除）
//
// 每列右邊那個灰字是「現在設成什麼」，不用點進去就看得到。

registerPage('settings', {
  tab: 'settings',
  onEnter: () => renderSettingsMenu(),
  onLanguage: () => renderSettingsMenu(),

  html: `
  <div id="page-settings" class="page">
    <style>
      #settings-menu { display: flex; flex-direction: column; gap: 18px; }
      #settings-menu .grp-title {
        font-family: var(--font-mono); font-size: 10.5px; letter-spacing: .1em;
        text-transform: uppercase; color: var(--ink-soft); margin-bottom: 6px; padding-left: 2px;
      }
      #settings-menu .grp-rows {
        border: 1px solid var(--line); border-radius: var(--r);
        overflow: hidden; background: var(--surface);
      }
      #settings-menu button {
        display: flex; align-items: center; gap: 10px; width: 100%;
        padding: 12px; background: none; color: var(--ink); border: 0;
        border-top: 1px solid var(--line-soft);
        font-family: var(--font-sans); font-size: 13.5px; text-align: left; cursor: pointer;
      }
      #settings-menu button:first-child { border-top: 0; }
      #settings-menu button:hover { background: var(--surface-2); }
      #settings-menu .label { flex: 1; }
      #settings-menu .value { color: var(--ink-soft); font-size: 12.5px; }
      #settings-menu .chev { color: var(--ink-soft); font-size: 15px; line-height: 1; }
    </style>

    <div class="stack">
      <div>
        <p class="eyebrow" data-i18n="eyebrow-settings">校正</p>
        <h2 data-i18n="settings-title">設定</h2>
      </div>
      <div id="settings-menu"></div>
    </div>
  </div>`,
});

// 目錄是渲染出來的，因為右邊的「現在設成什麼」要跟著設定跑
function renderSettingsMenu() {
  const groups = [
    { title: t('settings-group-general'), rows: [
      { page: 'settings-lang',   label: t('settings-lang'),   value: isZh() ? '中文' : 'English' },
      { page: 'settings-notify', label: t('settings-notify'), value: notifySummary() },
    ]},
    { title: t('settings-group-locate'), rows: [
      { page: 'settings-accuracy', label: t('settings-accuracy'),
        value: t(strictGate ? 'settings-strict-on' : 'settings-strict-off') },
    ]},
    { title: t('settings-group-data'), rows: [
      { page: 'settings-data', label: t('settings-data'), value: '' },
    ]},
  ];

  document.getElementById('settings-menu').innerHTML = groups.map(g => `
    <div>
      <p class="grp-title">${g.title}</p>
      <div class="grp-rows">
        ${g.rows.map(r => `
          <button type="button" onclick="showPage('${r.page}')">
            <span class="label">${r.label}</span>
            <span class="value">${r.value}</span>
            <span class="chev" aria-hidden="true">›</span>
          </button>`).join('')}
      </div>
    </div>`).join('');
}
