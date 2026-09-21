// ══ 設定 › 顯示 ═══════════════════════════════════════════════════
//
// 2026-09-21 補上，對齊 App 的 `SettingsDisplayScreen`（SettingsScreen.kt）——
// 用戶：「設定那些好像還沒有同步到」。在那之前網頁的設定目錄裡**沒有這一頁**。
//
// ⚠️ App 的這一頁有兩個東西，網頁只做得到第一個：
//   ① 字體大小（小／中／大）  → 做了，倍率與 App 的 FontScale 同一組數字
//   ② 顯示手部節點（21 點骨架）→ **沒做**。網頁端的 js/vision.js 本來就不畫骨架，
//      沒有東西可以關 —— 放一個關不掉任何東西的開關比沒有還糟。
//      哪天網頁也畫骨架了，開關補在這一頁。

registerPage('settings-display', {
  tab: 'settings',
  backTo: 'settings',
  onEnter: () => updateFontSeg(),
  onLanguage: () => updateFontSeg(),

  html: `
  <div id="page-settings-display" class="page">
    <div class="stack">
      <div>
        <p class="eyebrow" data-i18n="eyebrow-settings">校正</p>
        <h2 data-i18n="settings-display">顯示</h2>
      </div>

      <p class="k" data-i18n="settings-fontsize">字體大小</p>
      <div class="optlist" id="font-seg">
        <button type="button" data-font="small" onclick="setFontScale('small'); updateFontSeg();">
          <span class="grow" data-i18n="font-small">小</span><span class="tick">✓</span>
        </button>
        <button type="button" data-font="medium" onclick="setFontScale('medium'); updateFontSeg();">
          <span class="grow" data-i18n="font-medium">中</span><span class="tick">✓</span>
        </button>
        <button type="button" data-font="large" onclick="setFontScale('large'); updateFontSeg();">
          <span class="grow" data-i18n="font-large">大</span><span class="tick">✓</span>
        </button>
      </div>

      <p class="small" data-i18n="settings-fontsize-desc">只改字的大小，邊框與間距不變。改完立刻套用到整個網站。</p>
      <!-- ⭐ 預覽刻意用最小的內文級距（同 App）：選「小」會不會小到讀不動，
           看這一行就知道，不必自己去別頁找 -->
      <p class="small" data-i18n="settings-fontsize-preview">這一行是最小的內文字級，選「小」之後看得清楚嗎？</p>
      <p class="notice" data-i18n="settings-fontsize-sys">這個設定是乘在瀏覽器字體大小上的。若還是不夠大，可再到瀏覽器或手機的字體設定一起調。</p>
    </div>
  </div>`,
});

function updateFontSeg() {
  document.querySelectorAll('#font-seg button').forEach(b => {
    const on = b.getAttribute('data-font') === fontScale;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  });
}
