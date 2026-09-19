// ══ 步驟四：按摩 ═════════════════════════════════════════════════
// 兩個核心規則：
//   ① 計時只在「指尖真的對準穴道」時前進（onTarget 每幀更新）
//   ② 同一個穴道左右手各一個，兩輪都按完才算完成這個穴道
//
// ⭐ 2026-09-04 起臉部穴道也走這一頁。這頁**不去問「這是不是臉部」**，
//    只問 js/regions.js 那層抽象（itemLabel / itemRounds / itemDetector），
//    差別集中在三處：標題用 itemLabel、輪數用 itemRounds（臉部正中穴＝1 輪、
//    沒有換手）、相機用 itemDetector 決定開 Hands 還是 FaceMesh。
//   ⚠️ onTarget 兩邊都有，但算法不同：手部在 js/vision.js（同模型兩點距離），
//      臉部在 js/face-vision.js + js/face-gate.js（跨模型，用表觀大小比值判深度）。
//      這一頁只讀那個旗標，不必知道是誰算的。

let massageRunning = false;
let massageUserPaused = false;
let massageRemainMs = 30000;
let massageTickId = null;
const TICK_MS = 100;

// 第幾輪。手部是 2（左右手各一輪），手序由設定決定（預設先右後左）；
// 臉部正中穴只有一個點，沒有左右之分 → 1 輪，也就沒有換手這回事。
// ⚠️ 寫成函式不是常數：同一次療程裡手部與臉部項目混著跑，換穴時輪數會變。
const totalRounds = () => itemRounds(curAcuName());
const roundHands = () =>
  (flow.handOrder === 'left') ? ['hand-left', 'hand-right'] : ['hand-right', 'hand-left'];
let massageRound = 1;
const curHandKey = () => roundHands()[massageRound - 1];
// 只有一輪的項目不談「哪隻手」—— 輪次條改成顯示部位
const hasRounds = () => totalRounds() > 1;

// 換手倒數：一隻手按滿之後不必再點一次「開始」，倒數完自己接上
let switchTickId = null;
let switchRemain = 0;

registerPage('massage', {
  tab: 'home',
  step: 4,
  stepLabel: 'step-4',
  backTo: 'camera',
  hideTabbar: true,     // 按摩中手在鏡頭前，誤觸切頁會直接中斷計時
  keepsCamera: true,
  keepsFaceCamera: true,   // 臉部項目在這頁跑 FaceMesh（＋Hands 供閘門用）

  // 齒輪掛在返回列右邊（外殼的 #backbar-actions），不壓在取景框上
  actions: `
    <button class="gear-btn" id="massage-gear" onclick="toggleMassageMenu(event)"
            aria-haspopup="true" aria-expanded="false">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="3"/>
        <path d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2 5.5 5.5"/>
      </svg>
    </button>
    <div class="gear-menu" id="massage-menu" hidden role="menu">
      <button type="button" role="menuitem" onclick="flipMassageCamera()" data-i18n="btn-flip">切換鏡頭</button>
      <button type="button" role="menuitem" data-disc-label onclick="toggleMassageDisc()">隱藏信心圓盤</button>
      <button type="button" role="menuitem" data-advance-label onclick="toggleAutoAdvance()">換穴：自動</button>
      <hr>
      <button type="button" role="menuitem" class="danger" onclick="endMassageEarly()">
        <span data-i18n="menu-end-early">提早結束</span>
        <small data-i18n="menu-end-early-desc">本穴不計入紀錄與圖冊</small>
      </button>
    </div>`,

  onEnter: () => {
    document.getElementById('massage-title').textContent = itemLabel(curAcuName());
    closeMassageMenu();
    syncDiscLabels();
    syncAdvanceLabels();
    resetMassageSession();
    syncMassageControls();
    startMassageCamera();
  },
  onLeave: () => { stopMassageTimer(); stopSwitchCountdown(); closeMassageMenu(); },
  onLanguage: () => {
    document.getElementById('massage-title').textContent = itemLabel(curAcuName());
    syncDiscLabels();
    syncAdvanceLabels();
    updateTimerDisplay();
    renderRound();
    syncMassageControls();
  },

  html: `
  <div id="page-massage" class="page">
    <style>
      /* ── 輪次條：現在該按哪隻手，這是這一頁最需要一眼看到的資訊 ── */
      .roundbar {
        display: flex; align-items: center; gap: 10px;
        border: 1px solid var(--brass);
        border-radius: var(--r);
        background: var(--surface-2);
        padding: 9px 12px;
        margin-bottom: 10px;
      }
      .roundbar .k {
        font-family: var(--font-mono); font-size: 0.59375rem;
        letter-spacing: .14em; text-transform: uppercase; color: var(--brass);
      }
      .roundbar .hand {
        font-family: var(--font-ming); font-size: 1.1875rem; font-weight: 600;
        color: var(--ink); line-height: 1.2;
      }
      .roundbar .pips { margin-left: auto; display: flex; gap: 5px; align-items: center; }
      .roundbar .pip {
        width: 9px; height: 9px; border-radius: 50%;
        border: 1px solid var(--brass); background: none;
      }
      .roundbar .pip.done { background: var(--brass); }
      .roundbar .pip.now  { box-shadow: 0 0 0 3px var(--warn-bg); background: var(--brass); }
      .roundbar .n {
        font-family: var(--font-mono); font-size: 0.6875rem; color: var(--ink-soft);
        font-variant-numeric: tabular-nums; margin-left: 4px;
      }

      .meter {
        border: 1px solid var(--line);
        border-radius: var(--r);
        padding: 16px;
        text-align: center;
        background: var(--surface);
      }
      .meter .label {
        font-family: var(--font-mono); font-size: 0.625rem; letter-spacing: .16em;
        text-transform: uppercase; color: var(--brass);
      }
      .timer-display {
        font-family: var(--font-mono);
        font-size: 3.375rem;
        font-weight: 600;
        line-height: 1;
        margin: 10px 0 4px;
        color: var(--ink);
        font-variant-numeric: tabular-nums;
        transition: color .2s;
      }
      /* 指尖離開穴道時變灰：計時暫停這件事要看得出來 */
      .timer-display.paused { color: var(--ink-soft); }
      .timer-slider { width: 100%; margin: 12px 0 4px; accent-color: var(--brass); }
      .hint { font-family: var(--font-mono); font-size: 0.65625rem; color: var(--ink-soft); letter-spacing: .04em; }
      #round-switch[hidden] { display: none; }
      #btn-massage-zoom { margin-top: 8px; }
      #btn-massage-zoom[hidden] { display: none; }

      /* ── 全螢幕按摩（2026-08-13）────────────────────────────────
         按下「開始按摩」之後滑桿與按鈕都鎖住了，底下那塊面板就變成佔位子的死角；
         而這時使用者真正要盯的只剩兩件事：穴道圓盤、指尖有沒有對準。
         所以整個取景框跳出手機外框鋪滿視窗，計時與讀數條**搬**進畫面下緣
         （搬 DOM 而不是複製一份，才不會有兩個計時器要同步）。
         一輪結束時 stopMassageTimer() 會自動退回，Esc 或「縮小」也能手動退。 */
      #massage-viewport { position: relative; }
      .fs-hud { display: none; }

      body.massage-fs { overflow: hidden; }
      body.massage-fs #massage-viewport {
        position: fixed; inset: 0; z-index: 60;
        border: 0; border-radius: 0; background: #000;
      }
      body.massage-fs #massage-canvas {
        width: 100%; height: 100%;
        aspect-ratio: auto;          /* 蓋掉 canvas.cam 的 4/3，改由 object-fit 決定 */
        object-fit: contain;
      }
      body.massage-fs .fs-hud {
        display: block;
        position: absolute; inset: 0;
        pointer-events: none;        /* 只有按鈕收點擊，其餘讓影像透出來 */
      }

      .fs-top {
        position: absolute; top: 0; left: 0; right: 0;
        display: flex; align-items: center; gap: 10px;
        padding: calc(12px + env(safe-area-inset-top, 0px)) 14px 12px;
        background: linear-gradient(rgba(0,0,0,.55), transparent);
      }
      .fs-hand {
        font-family: var(--font-ming); font-size: 1.0625rem; font-weight: 600;
        color: #fff; text-shadow: 0 1px 6px rgba(0,0,0,.7);
      }
      .fs-btn {
        margin-left: auto; pointer-events: auto;
        font-family: var(--font-mono); font-size: 0.71875rem; letter-spacing: .08em;
        color: #fff; background: rgba(0,0,0,.45);
        border: 1px solid rgba(255,255,255,.45); border-radius: var(--r);
        padding: 7px 11px; cursor: pointer;
      }
      .fs-btn:hover { border-color: var(--brass); color: var(--brass); }

      .fs-bottom {
        position: absolute; left: 0; right: 0; bottom: 0;
        display: flex; align-items: flex-end; gap: 12px;
        padding: 16px 14px calc(16px + env(safe-area-inset-bottom, 0px));
        background: linear-gradient(transparent, rgba(0,0,0,.72));
      }
      /* 搬進來的那兩個元件要改裝成「疊在影像上」的樣子 */
      .fs-bottom .timer-display {
        flex: none; margin: 0; font-size: 3.25rem; color: #fff;
        text-shadow: 0 2px 14px rgba(0,0,0,.75);
      }
      .fs-bottom .timer-display.paused { color: rgba(255,255,255,.4); }
      .fs-bottom .readout { flex: 1; margin: 0; border-radius: var(--r); }
    </style>

    <div class="stack">
      <div>
        <p class="eyebrow" data-i18n="eyebrow-massage">步驟四 · 雙手確認</p>
        <h2 id="massage-title" class="acu-title"></h2>
      </div>

      <div class="massage-preview">
        <div class="roundbar">
          <div>
            <div class="k" data-i18n="round-label">本輪</div>
            <div class="hand" id="round-hand">左手</div>
          </div>
          <div class="pips" id="round-pips"></div>
        </div>

        <div class="viewport" id="massage-viewport">
          <canvas id="massage-canvas" class="cam"></canvas>
          <!-- 全螢幕時才看得到；計時與讀數條會被搬進 .fs-bottom（見 enterMassageFullscreen） -->
          <div class="fs-hud" id="massage-hud">
            <div class="fs-top">
              <span class="fs-hand" id="fs-hand"></span>
              <button class="fs-btn fs-pause" id="fs-pause" onclick="toggleMassagePause()">暫停</button>
              <button class="fs-btn" onclick="exitMassageFullscreen()" data-i18n="btn-shrink">⤡ 縮小</button>
            </div>
            <div class="fs-bottom" id="massage-hud-slot"></div>
          </div>
        </div>
        <div class="readout gate-warn" id="massage-gate">用另一隻手的指尖對準穴道圓盤</div>
      </div>

      <p class="notice warn" id="round-switch" hidden></p>
      <button class="btn ghost wide" id="btn-switch-now" hidden
              onclick="skipSwitchCountdown()" data-i18n="btn-ready-now">立即開始</button>

      <div class="meter">
        <p class="label" data-i18n="massage-timer">按摩時間（每隻手）</p>
        <div class="timer-display" id="timer-display">30</div>
        <p class="hint" id="timer-label"></p>
        <p class="timer-state" id="timer-state" role="status" aria-live="polite"></p>
        <input type="range" class="timer-slider" id="timer-input" min="5" max="120" step="5" value="30"
               oninput="onPressSecChange()">
        <button class="btn wide" id="btn-massage-start" onclick="toggleMassagePause()">開始按摩</button>
        <!-- 只在「計時中但已經縮小」時出現，讓人能再放大回去 -->
        <button class="btn ghost wide" id="btn-massage-zoom" hidden
                onclick="enterMassageFullscreen()" data-i18n="btn-zoom">⤢ 放大顯示</button>
        <p class="hint" id="timer-tip" style="margin-top:10px" data-i18n="timer-tip">計時只在指尖對準穴道時前進</p>
        <p class="hint" style="margin-top:4px" id="round-tip">同一個穴道左右手各有一個，兩隻手都按完才算完成。</p>
      </div>
    </div>
  </div>`,
});

// 從定位頁進來
function goToMassage() {
  showPage('massage');
}

// ── 輪次 ──────────────────────────────────────────────────────────
function resetMassageSession() {   // 整個穴道重來（進頁時）
  massageRound = 1;
  acuElapsedMs = 0;
  stopSwitchCountdown();
  armTimer();
  renderRound();
}

// 這一穴實際按滿了多少毫秒（左右兩輪相加），完成時寫進 sessionLog 給總結頁
let acuElapsedMs = 0;

function armTimer() {              // 準備下一輪的計時，不動輪次
  stopMassageTimer();
  const btn = document.getElementById('btn-massage-start');
  btn.disabled = false;
  btn.textContent = startLabel();
  const input = document.getElementById('timer-input');
  input.disabled = false;
  input.value = acuSecOf(curAcuName());   // 這一穴的秒數（選穴頁拉的），不是滑桿上次停的位置
  document.getElementById('timer-display').classList.remove('paused');
  updateTimerDisplay();
}

function startLabel() {
  if (massageRound === 1 || !hasRounds()) return t('btn-massage-start');
  return isZh() ? `開始按${t(curHandKey())}` : `Start (${t(curHandKey()).toLowerCase()})`;
}

function renderRound() {
  // 臉部只有一輪，講「右手／左手」是錯的（按臉用哪隻手都行）
  document.getElementById('round-hand').textContent =
    hasRounds() ? t(curHandKey()) : t('round-face');

  const pips = document.getElementById('round-pips');
  pips.innerHTML = '';
  for (let i = 1; i <= totalRounds(); i++) {
    const p = document.createElement('span');
    p.className = 'pip' + (i < massageRound ? ' done' : i === massageRound ? ' now' : '');
    pips.appendChild(p);
  }
  const n = document.createElement('span');
  n.className = 'n';
  n.textContent = `${massageRound}/${totalRounds()}`;
  pips.appendChild(n);

  document.getElementById('btn-massage-start').textContent = startLabel();
  renderFsHand();
  syncMassageHints();
}

// 輪次說明與讀數條的初始提示：手部講「左右手兩輪」，臉部講「只有一輪」。
// ⚠️ 不用 data-i18n：那是「一個元素固定一個 key」，這兩處的 key 會隨項目變。
function syncMassageHints() {
  const tip = document.getElementById('round-tip');
  if (tip) tip.textContent = t(hasRounds() ? 'round-tip' : 'round-tip-face');
  // 讀數條：這裡寫的是「還沒偵測到之前」的那句。模型一活起來，
  // setGate / setFaceGate 每幀都會蓋掉它，所以不必判斷現在是不是空的。
  const gate = document.getElementById('massage-gate');
  if (gate) gate.textContent = t(massageDetector() === 'face' ? 'massage-hint-face' : 'massage-hint');
}

// 全螢幕時輪次條被蓋住了，所以那個資訊要在 HUD 左上角再出現一次
function renderFsHand() {
  const el = document.getElementById('fs-hand');
  if (!el) return;
  el.textContent = hasRounds()
    ? `${t(curHandKey())}　${massageRound}/${totalRounds()}`
    : t('round-face');
}

// 換手提示：寫在頁面上而不是讀數條，因為讀數條下一幀就會被偵測結果蓋掉
function showSwitchHint(doneHandKey) {
  const box = document.getElementById('round-switch');
  const base = isZh()
    ? `${t(doneHandKey)}完成！請換成${t(curHandKey())}。`
    : `${t(doneHandKey)} done. Switch to your ${t(curHandKey()).toLowerCase()}.`;
  box.setAttribute('data-base', base);
  box.textContent = base;
  box.hidden = false;
}

// ── 畫面上的設定選單 ──────────────────────────────────────────────
function toggleMassageMenu(e) {
  // 擋掉冒泡，否則這一下會馬上被下面的「點別處就關」接到，選單開了又關
  if (e) e.stopPropagation();
  const menu = document.getElementById('massage-menu');
  if (!menu) return;
  menu.hidden ? openMassageMenu() : closeMassageMenu();
}

function openMassageMenu() {
  document.getElementById('massage-menu').hidden = false;
  document.getElementById('massage-gear').setAttribute('aria-expanded', 'true');
  document.addEventListener('click', onDocClickCloseMenu);
}

function closeMassageMenu() {
  const menu = document.getElementById('massage-menu');
  if (menu) menu.hidden = true;
  const gear = document.getElementById('massage-gear');
  if (gear) {
    gear.setAttribute('aria-expanded', 'false');
    gear.setAttribute('aria-label', t('menu-open'));
  }
  document.removeEventListener('click', onDocClickCloseMenu);
}

function onDocClickCloseMenu(e) {
  const menu = document.getElementById('massage-menu');
  const gear = document.getElementById('massage-gear');
  if (menu && !menu.contains(e.target) && gear && !gear.contains(e.target)) closeMassageMenu();
}

// 提早結束：不寫紀錄。
// 「按滿計時才算數」是本系統的核心主張，讓人跳過還記一筆等於自己拆自己的台。
function endMassageEarly() {
  closeMassageMenu();
  if (!confirm(t('confirm-end-early'))) return;

  stopMassageTimer();
  if (state.currentAcupointIndex < state.selectedAcupoints.length - 1) {
    state.currentAcupointIndex++;
    showPage('acu-detail');
  } else {
    goHome();
  }
}

// ── 全螢幕 ────────────────────────────────────────────────────────
// 計時器與讀數條是「搬」進 HUD 的，不是複製一份 —— 兩份就會有同步問題，
// 而且 updateTimerDisplay / setGate 都是靠 id 找元件，搬走了照樣寫得到。
let massageFsOn = false;
let fsMoved = null;              // [{ el, parent, next }]：退出時放回原位用

function enterMassageFullscreen() {
  if (massageFsOn) return;
  const slot = document.getElementById('massage-hud-slot');
  const els = ['timer-display', 'massage-gate'].map(id => document.getElementById(id));
  if (!slot || els.some(el => !el)) return;

  closeMassageMenu();            // 齒輪選單在 backbar 上，等一下會被蓋住
  fsMoved = els.map(el => ({ el, parent: el.parentNode, next: el.nextSibling }));
  els.forEach(el => slot.appendChild(el));
  renderFsHand();
  document.body.classList.add('massage-fs');
  document.addEventListener('keydown', onFsKey);
  massageFsOn = true;
  syncZoomBtn();
}

function exitMassageFullscreen() {
  if (!massageFsOn) return;
  fsMoved.forEach(({ el, parent, next }) => parent.insertBefore(el, next));
  fsMoved = null;
  document.body.classList.remove('massage-fs');
  document.removeEventListener('keydown', onFsKey);
  massageFsOn = false;
  syncZoomBtn();
}

// Esc 退出是瀏覽器的慣例，不照做的話使用者會以為卡住了
function onFsKey(e) { if (e.key === 'Escape') exitMassageFullscreen(); }

// 縮小之後計時還在跑，要留一個回得去的入口
function syncZoomBtn() {
  const b = document.getElementById('btn-massage-zoom');
  if (b) b.hidden = !(massageRunning && !massageFsOn);
}

// ── 計時 ──────────────────────────────────────────────────────────
function updateTimerDisplay() {
  const v = parseInt(document.getElementById('timer-input').value, 10);
  if (!massageRunning) massageRemainMs = v * 1000;
  document.getElementById('timer-display').textContent =
    massageRunning ? Math.ceil(massageRemainMs / 1000) : v;
  document.getElementById('timer-label').textContent = isZh() ? `${v} 秒` : `${v} SEC`;
}

// 滑桿改的是**這一穴**的秒數，不是全域設定（2026-09-08 改）。
// 以前這裡寫 setFlow('pressSec', v)，等於在按摩頁隨手一拉就把之後每一穴、
// 每一次療程都改掉 —— 想讓這一穴慢一點的人不會預期那個副作用。
// 全域值現在只當「沒特別調過時的預設」，在設定 › 療程節奏那頁改。
function onPressSecChange() {
  const v = parseInt(document.getElementById('timer-input').value, 10);
  setAcuSec(curAcuName(), v);
  updateTimerDisplay();
}

// ── 相機：手部跑 Hands、臉部跑 FaceMesh（＋Hands 供閘門用）─────────
// 沿用定位頁 pages/04-camera.js 的分流寫法，兩套模型共用同一個 <video>，
// 開一邊之前一定要把另一邊關掉。
const massageDetector = () => itemDetector(curAcuName());

function startMassageCamera() {
  const id = curAcuName();
  if (itemDetector(id) === 'face') {
    stopCamera();                       // 手部那邊可能還開著（定位頁過來）
    faceSelected = [id];                // 按摩頁只畫現在這一穴
    // 第三個參數 'massage' 才會連 Hands 一起跑 —— 那是對準閘門的來源
    startFaceCamera('massage-canvas', 'massage-gate', 'massage');
  } else {
    stopFaceCamera();
    startCamera('massage-canvas', 'massage');
  }
}

// 齒輪選單那兩顆要分流，否則在臉部項目上按會去動已經關掉的手部相機
function flipMassageCamera() {
  if (massageDetector() === 'face') switchFaceCamera(); else switchCamera();
}

function toggleMassageDisc() {
  if (massageDetector() === 'face') { toggleFaceDisc(); syncDiscLabels(); return; }
  toggleDisc();
}

function stopMassageTimer() {
  massageRunning = false;
  massageUserPaused = false;
  if (massageTickId) { clearInterval(massageTickId); massageTickId = null; }
  // 一輪按完就要退回來 —— 換手提示、開始鈕都在小畫面上，蓋著就看不到
  exitMassageFullscreen();
  syncZoomBtn();
}

function syncMassageControls() {
  const btn = document.getElementById('btn-massage-start');
  const label = !massageRunning ? startLabel()
    : massageUserPaused ? (isZh() ? '繼續' : 'Resume') : (isZh() ? '暫停' : 'Pause');
  btn.textContent = label;
  document.getElementById('fs-pause').textContent = label;
  const status = document.getElementById('timer-state');
  const text = !massageRunning ? (isZh() ? '準備好了就開始' : 'Start when ready')
    : massageUserPaused ? (isZh() ? '已暫停，保留剩餘時間' : 'Paused — remaining time saved')
    : !onTarget ? (isZh() ? '等待位置對準，計時暫停' : 'Waiting for alignment — timer paused')
    : (isZh() ? '位置已對準，計時中' : 'Aligned — timer running');
  if (status.textContent !== text) status.textContent = text;
}

function toggleMassagePause() {
  if (!massageRunning) { stopSwitchCountdown(); startMassage(); return; }
  massageUserPaused = !massageUserPaused;
  syncMassageControls();
}

function startMassage() {
  if (massageRunning) return;
  document.getElementById('round-switch').hidden = true;
  massageRemainMs = parseInt(document.getElementById('timer-input').value, 10) * 1000;
  massageRunning = true;
  massageUserPaused = false;
  document.getElementById('btn-massage-start').disabled = false;
  document.getElementById('timer-input').disabled = true;
  syncZoomBtn();
  syncMassageControls(); // 放大由使用者自行選擇，不隨開始計時跳全螢幕。

  massageTickId = setInterval(() => {
    const disp = document.getElementById('timer-display');
    syncMassageControls();
    if (massageUserPaused || document.hidden || !onTarget) { disp.classList.add('paused'); return; }   // 沒對準就不扣時間
    disp.classList.remove('paused');
    massageRemainMs -= TICK_MS;
    acuElapsedMs += TICK_MS;                                   // 只算「真的對準」的時間
    disp.textContent = Math.max(0, Math.ceil(massageRemainMs / 1000));
    if (massageRemainMs <= 0) { stopMassageTimer(); finishRound(); }
  }, TICK_MS);
}

function finishRound() {
  // 還有下一隻手就換手再來一輪，兩輪都完成才算完成這個穴道
  if (massageRound < totalRounds()) {
    const done = curHandKey();
    massageRound++;
    armTimer();
    renderRound();
    showSwitchHint(done);
    startSwitchCountdown();
    return;
  }
  // 這一穴按完了，把實際時間留給總結頁（完成頁才會寫進長期紀錄）
  sessionLog.push({ name: curAcuName(), ms: acuElapsedMs });
  completeMassage();
}

// ── 換手倒數 ──────────────────────────────────────────────────────
// 手還舉在鏡頭前，這時候要人再點一次「開始」是最難點的一下 ——
// 所以倒數完自己開始。想快一點就按「立即開始」。
function startSwitchCountdown() {
  stopSwitchCountdown();
  const sec = Number(flow.switchSec) || 0;
  const btn = document.getElementById('btn-switch-now');

  if (sec <= 0) { skipSwitchCountdown(); return; }

  switchRemain = sec;
  if (btn) btn.hidden = false;
  renderSwitchCountdown();

  switchTickId = setInterval(() => {
    switchRemain--;
    if (switchRemain <= 0) { skipSwitchCountdown(); return; }
    renderSwitchCountdown();
  }, 1000);
}

function stopSwitchCountdown() {
  if (switchTickId) { clearInterval(switchTickId); switchTickId = null; }
  const btn = document.getElementById('btn-switch-now');
  if (btn) btn.hidden = true;
}

function skipSwitchCountdown() {
  stopSwitchCountdown();
  const box = document.getElementById('round-switch');
  if (box) box.hidden = true;
  startMassage();
}

// 換手提示那一行後面接上「X 秒後自動開始」
function renderSwitchCountdown() {
  const box = document.getElementById('round-switch');
  if (!box || box.hidden) return;
  const base = box.getAttribute('data-base') || box.textContent;
  box.setAttribute('data-base', base);
  box.textContent = isZh()
    ? `${base}（${switchRemain} 秒後自動開始）`
    : `${base} (auto-start in ${switchRemain}s)`;
}

// ── 換穴模式（齒輪選單）────────────────────────────────────────────
function toggleAutoAdvance() {
  setFlow('autoAdvance', !flow.autoAdvance);
  syncAdvanceLabels();
  closeMassageMenu();
}

function syncAdvanceLabels() {
  document.querySelectorAll('[data-advance-label]').forEach(el => {
    el.textContent = t(flow.autoAdvance ? 'menu-advance-auto' : 'menu-advance-manual');
  });
}
