// ══ 設定 › 資料與紀錄 ═════════════════════════════════════════════
//
// 危險動作單獨一頁，而且先講清楚會刪掉什麼、不會刪掉什麼，再放按鈕。

registerPage('settings-data', {
  tab: 'settings',
  backTo: 'settings',

  html: `
  <div id="page-settings-data" class="page">
    <div class="stack">
      <div>
        <p class="eyebrow" data-i18n="eyebrow-settings">校正</p>
        <h2 data-i18n="settings-data">資料與紀錄</h2>
      </div>

      <p class="small" data-i18n="settings-data-where">所有紀錄都只存在這台裝置的瀏覽器裡，不會上傳。攝影機影像全程在本機運算，一幀都沒有離開過這台電腦。</p>
      <p class="notice" data-i18n="settings-reset-desc">清除會刪掉按摩紀錄、圖冊收集與連續天數。語言、每日提醒與定位設定不受影響。這個動作無法復原。</p>

      <button class="btn ghost wide" onclick="resetProgress()" data-i18n="settings-reset">清除所有紀錄</button>
    </div>
  </div>`,
});

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
