// ══ 設定分頁 ═════════════════════════════════════════════════════

registerPage('settings', {
  tab: 'settings',
  onEnter: () => {
    updateLangSeg();
    document.getElementById('notify-enable').checked = jget(LS.notify, false);
    document.getElementById('strict-gate').checked = strictGate;
  },
  onLanguage: () => updateLangSeg(),

  html: `
  <div id="page-settings" class="page">
    <style>
      label.row { display: flex; align-items: center; gap: 9px; padding: 9px 0; cursor: pointer; font-size: 13.5px; }
      label.row input { accent-color: var(--brass); width: 15px; height: 15px; }
      /* .seg 在 css/shell.css，跟選穴頁的部位切換共用 */
      #lang-seg { margin-top: 7px; }
    </style>

    <div class="stack">
      <div>
        <p class="eyebrow" data-i18n="eyebrow-settings">校正</p>
        <h2 data-i18n="settings-title">設定</h2>
      </div>
      <div>
        <p class="small" data-i18n="settings-lang">語言</p>
        <div class="seg" id="lang-seg">
          <button type="button" data-lang="zh" onclick="setLanguage('zh')">中文</button>
          <button type="button" data-lang="en" onclick="setLanguage('en')">English</button>
        </div>
      </div>
      <hr class="rule">
      <div>
        <label class="row">
          <input type="checkbox" id="notify-enable" onchange="onNotifyChange(this.checked)">
          <span data-i18n="settings-notify">啟用每日提醒</span>
        </label>
        <hr class="rule">
        <label class="row">
          <input type="checkbox" id="strict-gate" checked onchange="onStrictChange(this.checked)">
          <span data-i18n="settings-strict">嚴格模式：角度不佳時不顯示穴位</span>
        </label>
        <p class="small" data-i18n="settings-strict-desc">關閉後，即使手掌傾斜過大也會畫出穴位，但位置誤差可能很大。</p>
      </div>
      <hr class="rule">
      <button class="btn ghost wide" onclick="resetProgress()" data-i18n="settings-reset">清除所有紀錄</button>
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

function onNotifyChange(on) {
  localStorage.setItem(LS.notify, JSON.stringify(on));
  if (on && 'Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

// 嚴格模式關掉 = 角度爛也照畫，但讀數條會標「僅供參考」（見 js/vision.js）
function onStrictChange(on) {
  strictGate = on;
  localStorage.setItem(LS.strict, JSON.stringify(on));
}

function resetProgress() {
  if (!confirm(isZh() ? '確定要清除所有按摩紀錄與圖冊嗎？' : 'Clear all progress and collection?')) return;
  [LS.history, LS.streak, LS.minions].forEach(k => localStorage.removeItem(k));
  state.history = {};
  state.streak = { date: null, count: 0 };
  state.minions = {};
  lastCompleted = null;
  initCollectionGrid();
  initProfile();
}
