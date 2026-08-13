// ══ 設定 › 定位精度 ═══════════════════════════════════════════════
//
// 只有一個開關，但它是全站最需要解釋的一個，所以獨立一頁把話講完。
// 嚴格模式關掉 = 角度爛也照畫，但讀數條會標「僅供參考」（見 js/vision.js）。

registerPage('settings-accuracy', {
  tab: 'settings',
  backTo: 'settings',
  onEnter: () => { document.getElementById('strict-gate').checked = strictGate; },

  html: `
  <div id="page-settings-accuracy" class="page">
    <div class="stack">
      <div>
        <p class="eyebrow" data-i18n="eyebrow-settings">校正</p>
        <h2 data-i18n="settings-accuracy">定位精度</h2>
      </div>

      <div class="optlist">
        <label>
          <input type="checkbox" id="strict-gate" checked onchange="onStrictChange(this.checked)">
          <span class="grow" data-i18n="settings-strict">嚴格模式：角度不佳時不顯示穴位</span>
        </label>
      </div>

      <p class="small" data-i18n="settings-strict-desc">關閉後，即使手掌傾斜過大也會畫出穴位，但位置誤差可能很大。</p>
      <p class="notice" data-i18n="settings-strict-why">系統寧可少標一個點，也不給一個看起來很篤定、其實是猜的紅點。關掉這個開關不會讓定位變準，只會讓系統不再把不確定的結果擋下來。</p>
    </div>
  </div>`,
});

function onStrictChange(on) {
  strictGate = on;
  localStorage.setItem(LS.strict, JSON.stringify(on));
}
