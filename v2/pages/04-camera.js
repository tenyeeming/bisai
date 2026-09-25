// ══ 步驟三：定位 ═════════════════════════════════════════════════
// 相機、偵測、畫穴位都在 js/vision.js（跟按摩頁共用）。這支只負責這頁的 UI。

registerPage('camera', {
  tab: 'home',
  step: 3,
  stepLabel: 'step-3',
  backTo: 'acu-detail',
  backLabel: 'btn-stop',   // 這裡不是「返回」是「停止」，因為相機正在跑
  hideTabbar: true,     // 取景框需要空間，也避免定位到一半誤觸切頁
  // ⚠️ 兩個都要 true：這一頁可能跑手部（Hands）也可能跑臉部（FaceMesh），
  //    nav.js 的 showPage 會把「這頁不需要的」那一套關掉 —— 只寫一個的話，
  //    切到臉部項目時 nav 會在進頁的瞬間把剛開起來的臉部相機關掉
  keepsCamera: true,
  keepsFaceCamera: true,
  // 2026-09-25 用戶：「從定位開始，返回那行的最右邊加入一個設定」——
  // 跟按摩頁同一份選單（js/session-menu.js）；切換鏡頭留在取景框下面的按鈕列。
  actions: sessionGearHtml('locate', { discFn: 'toggleLocateDisc', skipFn: 'skipFromLocate' }),
  onEnter: () => { closeGearMenu('locate'); syncAdvanceLabels(); enterLocate(); },
  onLeave: () => { closeGearMenu('locate'); stopCamera(); stopFaceCamera(); },
  onLanguage: () => {
    document.getElementById('camera-title').textContent = itemLabel(curAcuName());
    syncDiscLabels();
    syncLocateHint();
  },

  html: `
  <div id="page-camera" class="page">
    <div class="stack">
      <div>
        <p class="eyebrow" data-i18n="eyebrow-camera">步驟三 · 即時定位</p>
        <h2 id="camera-title" class="acu-title"></h2>
      </div>
      <div class="camera-preview">
        <!-- ⭐ 2026-09-22：讀數條**搬進 .viewport 裡面**（原本是它的兄弟節點）。
             用戶：「那些提示在鏡頭畫面下方，他會壓縮到我的鏡頭畫面」。
             ⚠️ 定位基準一定要是 .viewport 而不是外層的 .camera-preview ——
                桌面橫式時 .viewport 被 responsive.css 的 max-width 限寬，
                而外層沒有，疊上去會**超出畫面右緣約 30px**（實際踩過，
                截圖在 比賽專區/介面討論/提示疊加取景框_20260922/）。
             🚨 這整頁是 JS 模板字串，註解裡**絕對不能出現反引號** —— 會提前
                關掉模板字串，整頁靜默不生成（2026-09-22 踩過）。 -->
        <div class="viewport">
          <canvas id="video-canvas" class="cam"></canvas>
          <div class="readout gate-warn" id="camera-gate" data-i18n="camera-hint">請舉起手，手背朝上</div>
        </div>
      </div>
      <!-- 隱藏信心圓盤 09-25 收進右上角齒輪（用戶要求），這裡只剩切換鏡頭 -->
      <button class="btn ghost wide" id="toggle-facing" onclick="flipLocateCamera()" data-i18n="btn-flip">切換鏡頭</button>
      <button class="btn wide" onclick="goToMassage()" data-i18n="btn-massage">現在開始按摩</button>
    </div>
  </div>`,
});

// 從認穴頁進來
// 2026-09-25（網頁v2 批 E，同 App AcuApp onLocate）：臉部項目**省掉定位頁**，直接進按摩頁 ——
//   臉部在按摩頁本來就畫穴位、判對準、有進頁 3 秒倒數；多一頁定位只是多開一次相機。手部維持兩步。
function startLocate() {
  showPage(isFaceItem(curAcuName()) ? 'massage' : 'camera');
}

// ── 這一頁跑哪一套偵測（2026-09-04）──────────────────────────────
// 手部項目跑 Hands、臉部項目跑 FaceMesh，畫進同一塊 <canvas id="video-canvas">。
// 兩套模型共用同一個 <video>，所以開一邊之前一定要先把另一邊關掉。

/** 現在這一項要用哪套偵測 */
const locateDetector = () => itemDetector(curAcuName());

function enterLocate() {
  const id = curAcuName();
  if (!id) { goHome(); return; }
  document.getElementById('camera-title').textContent = itemLabel(id);
  syncDiscLabels();
  syncLocateHint();

  if (itemDetector(id) === 'face') {
    stopCamera();                       // 手部那邊可能還開著
    faceSelected = [id];                // 這一頁只畫現在這一穴，不是全部
    startFaceCamera('video-canvas', 'camera-gate');
  } else {
    stopFaceCamera();
    startCamera('video-canvas', 'locate');
  }
}

/** 讀數列的初始提示：手部是「舉起手」，臉部是「正對鏡頭」 */
function syncLocateHint() {
  const el = document.getElementById('camera-gate');
  if (!el) return;
  el.textContent = t(locateDetector() === 'face' ? 'face-hint' : 'camera-hint');
}

// 兩顆按鈕要按目前跑的是哪一套來分流，否則在臉部項目上按「切換鏡頭」
// 會去動手部那台已經關掉的相機（沒有反應，但看起來就是壞了）
function flipLocateCamera() {
  if (locateDetector() === 'face') switchFaceCamera(); else switchCamera();
}

// 定位頁的「跳過這一穴」：還沒開始按，記一筆跳過（去向見函式內，同 App）。
// 跟按摩頁的跳過一樣要確認、一樣不算完成 —— 同一個選單項目，行為不該因頁而異。
// 確認文案不同：按摩頁的那句講「沒有按滿時間」，定位頁根本還沒開始按。
function skipFromLocate() {
  closeGearMenu('locate');
  if (!confirm(t('confirm-skip-locate'))) return;
  // 2026-09-25（網頁v2 批 D，同 App AcuApp CameraScreen.onSkip 的三岔路）：記一筆「跳過」，
  //   手動換穴 → 完成頁（「這一穴跳過了」）；自動換穴 → 直接下一穴，最後一穴 → 總結。
  sessionLog.push({ name: curAcuName(), ms: 0, completed: false });
  if (!flow.autoAdvance) { completeMassage(true); return; }
  if (state.currentAcupointIndex < state.selectedAcupoints.length - 1) {
    state.currentAcupointIndex++;
    showPage('acu-detail');
  } else {
    showPage('summary');
  }
}

function toggleLocateDisc() {
  if (locateDetector() === 'face') { toggleFaceDisc(); syncDiscLabels(); return; }
  toggleDisc();
}

function toggleDisc() {
  showDisc = !showDisc;
  syncDiscLabels();
}

// 定位頁和按摩頁各有一顆圓盤開關，文字要一起換
// （所以這顆不吃 data-i18n，改用 data-disc-label 自己管）
function syncDiscLabels() {
  // 臉部有自己的圓盤開關（faceShowDisc），在臉部項目上要讀那一個。
  // 定位頁與按摩頁都可能是臉部項目 —— 兩頁共用這顆按鈕的文字。
  const onFace = (currentPage === 'camera' || currentPage === 'massage')
    && itemDetector(curAcuName()) === 'face';
  const on = onFace ? faceShowDisc : showDisc;
  document.querySelectorAll('[data-disc-label]').forEach(el => {
    el.textContent = t(on ? 'btn-disc-hide' : 'btn-disc-show');
  });
}
