// ══ 步驟四：定位 ═════════════════════════════════════════════════
// 相機、偵測、畫穴位都在 js/vision.js（跟按摩頁共用）。這支只負責這頁的 UI。

registerPage('camera', {
  tab: 'home',
  step: 4,
  stepLabel: 'step-4',
  backTo: 'acu-detail',
  backLabel: 'btn-stop',   // 這裡不是「返回」是「停止」，因為相機正在跑
  hideTabbar: true,     // 取景框需要空間，也避免定位到一半誤觸切頁
  keepsCamera: true,
  onEnter: () => {
    document.getElementById('camera-title').textContent = acuLabel(curAcuName());
    syncDiscLabels();
    startCamera('video-canvas', 'locate');
  },
  onLanguage: () => {
    document.getElementById('camera-title').textContent = acuLabel(curAcuName());
    syncDiscLabels();
  },

  html: `
  <div id="page-camera" class="page">
    <div class="stack">
      <div>
        <p class="eyebrow" data-i18n="eyebrow-camera">步驟四 · 即時定位</p>
        <h2 id="camera-title" class="acu-title"></h2>
      </div>
      <div>
        <div class="viewport"><canvas id="video-canvas" class="cam"></canvas></div>
        <div class="readout gate-warn" id="camera-gate" data-i18n="camera-hint">請舉起手，手背朝上</div>
      </div>
      <div class="btn-row">
        <button class="btn ghost" id="toggle-facing" onclick="switchCamera()" data-i18n="btn-flip">切換鏡頭</button>
        <button class="btn ghost" id="toggle-disc" data-disc-label onclick="toggleDisc()">隱藏信心圓盤</button>
      </div>
      <button class="btn wide" onclick="goToMassage()" data-i18n="btn-massage">現在開始按摩</button>
    </div>
  </div>`,
});

// 從認穴頁進來
function startLocate() {
  showPage('camera');
}

function toggleDisc() {
  showDisc = !showDisc;
  syncDiscLabels();
}

// 定位頁和按摩頁各有一顆圓盤開關，文字要一起換
// （所以這顆不吃 data-i18n，改用 data-disc-label 自己管）
function syncDiscLabels() {
  document.querySelectorAll('[data-disc-label]').forEach(el => {
    el.textContent = t(showDisc ? 'btn-disc-hide' : 'btn-disc-show');
  });
}
