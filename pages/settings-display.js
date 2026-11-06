// ══ 設定 › 顯示 ═══════════════════════════════════════════════════
//
// 2026-09-21 補上，對齊 App 的 `SettingsDisplayScreen`（SettingsScreen.kt）——
// 用戶：「設定那些好像還沒有同步到」。在那之前網頁的設定目錄裡**沒有這一頁**。
//
// App 的這一頁三樣東西，2026-09-25（網頁v2 批 C）起網頁都有了：
//   ① 字體大小（小／中／大）—— 倍率與 App 的 FontScale 同一組數字
//   ② 顯示手部節點（預設關）—— 21 點＋按摩手指尖點（js/vision.js、js/face-vision.js 照這個畫）
//   ③ 鏡頭中顯示穴位名稱（預設關，11-07；原預設開，App 批 65）

registerPage('settings-display', {
  tab: 'settings',
  backTo: 'settings',
  onEnter: () => { collapseInfo('page-settings-display'); updateFontSeg(); renderDisplayToggles(); },
  onLanguage: () => { updateFontSeg(); renderDisplayToggles(); },

  html: `
  <div id="page-settings-display" class="page">
    <div class="stack">
      <div>
        <p class="eyebrow" data-i18n="eyebrow-settings">校正</p>
        <h2 data-i18n="settings-display">顯示</h2>
      </div>

      <!-- 2026-10-31 照 App 批 112：「字體大小」放大、旁邊「!」，兩段說明點了才出現（原本常駐） -->
      <div class="set-head">
        <h3 class="set-title" data-i18n="settings-fontsize">字體大小</h3>${infoMark('font-info')}
      </div>
      <div id="font-info" class="set-info" hidden>
        <p class="small" data-i18n="settings-fontsize-desc">只改字的大小，邊框與間距不變。改完立刻套用到整個網站。</p>
        <p class="small" data-i18n="settings-fontsize-sys">這個設定是乘在瀏覽器字體大小上的。若還是不夠大，可再到瀏覽器或手機的字體設定一起調。</p>
      </div>
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

      <!-- ⭐ 預覽刻意用最小的內文級距（同 App）：選「小」會不會小到讀不動，
           看這一行就知道，不必自己去別頁找 -->
      <p class="small" data-i18n="settings-fontsize-preview">這一行是最小的內文字級，選「小」之後看得清楚嗎？</p>

      <div class="fieldrow">
        <div class="set-head"><p class="k" data-i18n="settings-skeleton">顯示手部節點</p>${infoMark('skeleton-info')}</div>
        <div class="seg" id="seg-skeleton"></div>
        <p class="d" id="skeleton-info" hidden data-i18n="settings-skeleton-desc"></p>
      </div>
      <div class="fieldrow">
        <div class="set-head"><p class="k" data-i18n="settings-acu-names">鏡頭中顯示穴位名稱</p>${infoMark('acu-names-info')}</div>
        <div class="seg" id="seg-acu-names"></div>
        <p class="d" id="acu-names-info" hidden data-i18n="settings-acu-names-desc"></p>
      </div>
      <!-- 2026-11-01 用戶：「定版手肘的定位」「兩種都寫給我看」→ 三種並排給用戶比，選定後再定版 -->
      <div class="fieldrow">
        <div class="set-head"><p class="k" data-i18n="settings-fa-hold">手肘定位</p>${infoMark('fa-hold-info')}</div>
        <div class="seg" id="seg-fa-hold"></div>
        <p class="d" id="fa-hold-info" hidden data-i18n="settings-fa-hold-desc"></p>
      </div>
    </div>
  </div>`,
});

// 開／關兩格（同設定 › 治療流程的 seg 樣式）
function renderDisplayToggles() {
  const two = (id, get, set) => {
    const box = document.getElementById(id);
    if (!box) return;
    box.innerHTML = '';
    [true, false].forEach(v => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = v ? (isZh() ? '開' : 'On') : (isZh() ? '關' : 'Off');
      b.classList.toggle('on', get() === v);
      b.setAttribute('aria-pressed', String(get() === v));
      b.onclick = () => { set(v); renderDisplayToggles(); };
      box.appendChild(b);
    });
  };
  two('seg-skeleton', () => showSkeleton, setShowSkeleton);
  two('seg-acu-names', () => showAcuNames, setShowAcuNames);
  const hold = document.getElementById('seg-fa-hold');
  if (hold) {
    hold.innerHTML = '';
    [['lock', 'fa-hold-lock'], ['freeze', 'fa-hold-freeze'], ['live', 'fa-hold-live']].forEach(([m, key]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = t(key);
      b.classList.toggle('on', faHoldMode === m);
      b.setAttribute('aria-pressed', String(faHoldMode === m));
      b.onclick = () => { setFaHoldMode(m); renderDisplayToggles(); };
      hold.appendChild(b);
    });
  }
}

function updateFontSeg() {
  document.querySelectorAll('#font-seg button').forEach(b => {
    const on = b.getAttribute('data-font') === fontScale;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  });
}
