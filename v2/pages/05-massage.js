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
// 最後一次對準的時間。掉幀（手指遮住被按的手）時，PRESS_GRACE_MS（js/vision.js）內照樣計時，
// 不讓計時與狀態文字每 0.1 秒閃一次。臉部也走這裡，一起受惠。
let massageLastOnAt = 0;
// 按壓判定關掉（齒輪選單，state.js pressCheck）時不看 onTarget，但開始計時前先給 3 秒準備 ——
// 用戶：「一旦取消功能就要給他們三秒的準備時間」。開始、暫停後繼續、計時中途關掉判定都重給一次。
const PRESS_OFF_PREP_MS = 3000;
let pressOffPrepUntil = 0;
function armPressOffPrep() { pressOffPrepUntil = performance.now() + PRESS_OFF_PREP_MS; }
function onPressCheckOff() { if (massageRunning && !massageUserPaused) armPressOffPrep(); if (massageRunning) syncMassageControls(); }
const pressOffPrepLeft = () => Math.max(0, pressOffPrepUntil - performance.now());
function massageHeld() {
  const now = performance.now();
  if (!pressCheck) return now >= pressOffPrepUntil;
  if (onTarget) massageLastOnAt = now;
  return onTarget || (now - massageLastOnAt < PRESS_GRACE_MS);
}

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
  // 臉部項目沒有定位頁（2026-09-25 網頁v2 批 E，同 App：認穴頁「開始定位」直接進按摩頁）→ 退回認穴頁
  backTo: () => (isFaceItem(curAcuName()) ? 'acu-detail' : 'camera'),
  hideTabbar: true,     // 按摩中手在鏡頭前，誤觸切頁會直接中斷計時
  keepsCamera: true,
  keepsFaceCamera: true,   // 臉部項目在這頁跑 FaceMesh（＋Hands 供閘門用）

  // 齒輪掛在返回列右邊（外殼的 #backbar-actions），不壓在取景框上。
  // 2026-09-25 起選單內容跟定位頁共用（js/session-menu.js），多了「按摩手指」。
  actions: sessionGearHtml('massage', {
    flip: true, flipFn: 'flipMassageCamera', discFn: 'toggleMassageDisc', skipFn: 'endMassageEarly',
  }),

  onEnter: () => {
    document.getElementById('massage-title').textContent = itemLabel(curAcuName());
    closeMassageMenu();
    syncDiscLabels();
    syncAdvanceLabels();
    resetMassageSession();
    syncMassageControls();
    startMassageCamera();
    startEntryCountdown();
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
      /* ── 輪次條（2026-09-25 網頁v2 批 C，App RoundBar）：一行小字 ● ○ 1/2 本輪 · 右手 ── */
      .roundbar {
        display: flex; align-items: center; gap: 8px;
        margin-bottom: 8px; font-size: 0.8125rem; color: var(--ink-soft);
      }
      .roundbar .pips { display: flex; gap: 5px; align-items: center; }
      .roundbar .pip {
        width: 8px; height: 8px; border-radius: 50%;
        border: 1px solid var(--brass); background: none;
      }
      .roundbar .pip.done, .roundbar .pip.now { background: var(--brass); }
      .roundbar .n {
        font-family: var(--font-mono); font-size: 0.75rem; color: var(--ink-soft);
        font-variant-numeric: tabular-nums; margin-left: 4px;
      }
      .roundbar .hand { color: var(--ink); font-weight: 600; }

      /* ── 取景框右上角計時（App TimerOverlay）：白底黑字，只在計時中出現；
            沒對準／自己暫停／判定關時的準備期變黃底 ── */
      .vp-timer {
        position: absolute; top: 8px; right: 8px; z-index: 2;
        min-width: 3.2ch; padding: 4px 10px; border-radius: var(--r);
        font-family: var(--font-mono); font-size: 1.5rem; font-weight: 600; line-height: 1.1;
        text-align: center; font-variant-numeric: tabular-nums;
        background: #fff; color: #111; box-shadow: 0 2px 8px rgba(0,0,0,.35);
        display: none;
      }
      .vp-timer.on { display: block; }
      .vp-timer.paused { background: #F2C14E; color: #111; }
      /* ── 取景框左上角放大鈕（App ZoomButton）：⤢ 放大／⤡ 縮小 ── */
      .vp-zoom {
        position: absolute; top: 8px; left: 8px; z-index: 3;
        width: 40px; height: 40px; border-radius: 50%;
        font-size: 1.125rem; line-height: 1; color: #fff; cursor: pointer;
        background: rgba(0,0,0,.5); border: 1px solid rgba(255,255,255,.5);
      }
      .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
      #round-switch[hidden] { display: none; }      #round-switch[hidden] { display: none; }

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
        /* 左邊讓出放大鈕（.vp-zoom）的位置 */
        padding: calc(12px + env(safe-area-inset-top, 0px)) 14px 12px 60px;
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

      /* 全螢幕時計時留在右上角，讓出暫停鈕那一列 */
      body.massage-fs .vp-timer { top: calc(58px + env(safe-area-inset-top, 0px)); font-size: 2.25rem; }
    </style>

    <div class="stack">
      <div>
        <p class="eyebrow" data-i18n="eyebrow-massage">步驟四 · 雙手確認</p>
        <h2 id="massage-title" class="acu-title"></h2>
      </div>

      <div class="massage-preview">
        <div class="roundbar">
          <div class="pips" id="round-pips"></div>
          <span><span data-i18n="round-label">本輪</span> · <span class="hand" id="round-hand">左手</span></span>
        </div>

        <div class="viewport" id="massage-viewport">
          <canvas id="massage-canvas" class="cam"></canvas>
          <!-- 2026-09-25（網頁v2 批 C）：計時疊在右上、放大鈕在左上（App TimerOverlay／ZoomButton）。
               全螢幕時整個取景框鋪滿視窗，這兩個與讀數條都留在原位，不再搬節點。 -->
          <div class="vp-timer" id="timer-display">30</div>
          <button type="button" class="vp-zoom" id="btn-massage-zoom" onclick="toggleMassageFullscreen()"
                  aria-label="放大顯示">⤢</button>
          <!-- 全螢幕時才看得到：本輪哪隻手＋暫停鈕 -->
          <div class="fs-hud" id="massage-hud">
            <div class="fs-top">
              <span class="fs-hand" id="fs-hand"></span>
              <button class="fs-btn fs-pause" id="fs-pause" onclick="toggleMassagePause()">暫停</button>
            </div>
          </div>
          <!-- ⭐ 2026-09-22：讀數條搬進 .viewport（原本在它外面）。理由同 04-camera.js。
               ⚠️ 全螢幕時這個節點會被 enterMassageFullscreen() **搬進** .fs-bottom，
                  那時它就不是 .viewport 的直接子節點了，所以 shell.css 那條
                  直接子選擇器自然不匹配，全螢幕那套樣式不受影響。
               🚨 這整頁是 JS 模板字串，註解裡**絕對不能出現反引號** —— 會提前
                  關掉模板字串，整頁靜默不生成（2026-09-22 踩過）。 -->
          <div class="readout gate-warn" id="massage-gate">用另一隻手的指尖對準穴道圓盤</div>
        </div>
      </div>

      <p class="notice warn" id="round-switch" hidden></p>
      <button class="btn ghost wide" id="btn-switch-now" hidden
              onclick="skipSwitchCountdown()" data-i18n="btn-ready-now">立即開始</button>

      <!-- 2026-09-25（網頁v2 批 C，App A10）：下方大計時面板、說明小字拿掉，只留主按鈕。
           秒數滑桿在認穴頁（批 B）；這顆藏起來的 input 仍是本頁計時的數值來源
           （armTimer 寫入、startMassage 讀出），不刪以免動到計時邏輯。
           timer-state 只給螢幕報讀用（role=status），畫面上不顯示。 -->
      <input type="range" class="timer-slider" id="timer-input" min="5" max="90" step="5" value="30"
             oninput="onPressSecChange()" hidden>
      <p class="sr-only" id="timer-state" role="status" aria-live="polite"></p>
      <button class="btn wide" id="btn-massage-start" onclick="toggleMassagePause()">開始按摩</button>
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
// 開關邏輯搬到 js/session-menu.js（定位頁共用）；這幾個名字留著，其他地方與測試都用它們
function toggleMassageMenu(e) { toggleGearMenu(e, 'massage'); }
function openMassageMenu() { openGearMenu('massage'); }
function closeMassageMenu() { closeGearMenu('massage'); }

// 提早結束：這一穴不算完成（不進完成頁、小人不慶祝、不列進總結）。
// 「按滿計時才算數」是本系統的核心主張，讓人跳過還記一筆等於自己拆自己的台。
function endMassageEarly() {
  closeMassageMenu();
  if (!confirm(t('confirm-end-early'))) return;

  stopMassageTimer();
  // 2026-09-25（網頁v2 批 D，同 App MassageScreen onSkip）：記一筆「跳過」→ 一律到完成頁（標題「這一穴跳過了」、沒有小人）
  sessionLog.push({ name: curAcuName(), ms: acuElapsedMs, completed: false });
  completeMassage(true);
}

// ── 全螢幕 ────────────────────────────────────────────────────────
// 2026-09-25（網頁v2 批 C）：計時與讀數條本來就疊在取景框裡，全螢幕只是把取景框鋪滿視窗，
// 不再把節點搬進 HUD（以前搬進 .fs-bottom，退出時再放回原位）。
let massageFsOn = false;

function enterMassageFullscreen() {
  if (massageFsOn) return;
  closeMassageMenu();            // 齒輪選單在 backbar 上，等一下會被蓋住
  renderFsHand();
  document.body.classList.add('massage-fs');
  document.addEventListener('keydown', onFsKey);
  massageFsOn = true;
  syncZoomBtn();
}

function exitMassageFullscreen() {
  if (!massageFsOn) return;
  document.body.classList.remove('massage-fs');
  document.removeEventListener('keydown', onFsKey);
  massageFsOn = false;
  syncZoomBtn();
}

function toggleMassageFullscreen() {
  if (massageFsOn) exitMassageFullscreen(); else enterMassageFullscreen();
}

// Esc 退出是瀏覽器的慣例，不照做的話使用者會以為卡住了
function onFsKey(e) { if (e.key === 'Escape') exitMassageFullscreen(); }

// 左上角那顆：一直都在（App ZoomButton），放大時變「縮小」
function syncZoomBtn() {
  const b = document.getElementById('btn-massage-zoom');
  if (!b) return;
  b.textContent = massageFsOn ? '⤡' : '⤢';
  b.setAttribute('aria-label', t(massageFsOn ? 'btn-shrink' : 'btn-zoom'));
}

// ── 計時 ──────────────────────────────────────────────────────────
function updateTimerDisplay() {
  const v = parseInt(document.getElementById('timer-input').value, 10);
  if (!massageRunning) massageRemainMs = v * 1000;
  document.getElementById('timer-display').textContent =
    massageRunning ? Math.ceil(massageRemainMs / 1000) : v;
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
  // 批 C 起右上角計時只在計時中顯示（.on 由 syncMassageControls 切）——
  // 停掉時也要同步一次，不然一輪按完、換手倒數期間計時框還掛著（本機檢查 e2e 抓到）
  syncMassageControls();
}

function syncMassageControls() {
  const btn = document.getElementById('btn-massage-start');
  const label = !massageRunning ? startLabel()
    : massageUserPaused ? (isZh() ? '繼續' : 'Resume') : (isZh() ? '暫停' : 'Pause');
  btn.textContent = label;
  document.getElementById('fs-pause').textContent = label;
  // 右上角計時只在計時中出現；準備期（判定關的 3 秒）也算「還沒在走」→ 黃底
  const disp = document.getElementById('timer-display');
  disp.classList.toggle('on', massageRunning);
  if (massageRunning && massageUserPaused) disp.classList.add('paused');
  if (massageRunning && !pressCheck && pressOffPrepLeft() > 0) disp.classList.add('paused');
  const status = document.getElementById('timer-state');
  const text = !massageRunning && switchTickId ? (isZh() ? '倒數完自動開始' : 'Starting after countdown')
    : !massageRunning ? (isZh() ? '準備好了就開始' : 'Start when ready')
    : massageUserPaused ? (isZh() ? '已暫停，保留剩餘時間' : 'Paused — remaining time saved')
    : !pressCheck && pressOffPrepLeft() > 0
      ? (isZh() ? `準備 ${Math.ceil(pressOffPrepLeft() / 1000)} 秒後開始計時` : `Get ready — timer starts in ${Math.ceil(pressOffPrepLeft() / 1000)}s`)
    : !pressCheck ? (isZh() ? '按壓判定已關閉，計時中' : 'Press check off — timer running')
    : !massageHeld() ? (isZh() ? '等待位置對準，計時暫停' : 'Waiting for alignment — timer paused')
    : (isZh() ? '位置已對準，計時中' : 'Aligned — timer running');
  if (status.textContent !== text) status.textContent = text;
}

function toggleMassagePause() {
  if (!massageRunning) { stopSwitchCountdown(); startMassage(); return; }
  massageUserPaused = !massageUserPaused;
  if (!massageUserPaused && !pressCheck) armPressOffPrep();
  syncMassageControls();
}

function startMassage() {
  if (massageRunning) return;
  stopSwitchCountdown();   // 從別處直接開始（如測試、全螢幕鈕）時，倒數要收掉、開始鈕要回來
  document.getElementById('round-switch').hidden = true;
  massageRemainMs = parseInt(document.getElementById('timer-input').value, 10) * 1000;
  massageRunning = true;
  massageUserPaused = false;
  massageLastOnAt = 0;
  if (!pressCheck) armPressOffPrep();
  document.getElementById('btn-massage-start').disabled = false;
  document.getElementById('timer-input').disabled = true;
  syncZoomBtn();
  syncMassageControls(); // 放大由使用者自行選擇，不隨開始計時跳全螢幕。

  massageTickId = setInterval(() => {
    const disp = document.getElementById('timer-display');
    syncMassageControls();
    if (massageUserPaused || document.hidden || !massageHeld()) { disp.classList.add('paused'); return; }   // 沒對準就不扣時間
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
  // 這一穴按完了，記進本次療程清單給總結頁（網頁不存長期紀錄）
  sessionLog.push({ name: curAcuName(), ms: acuElapsedMs, completed: true });
  completeMassage(false);
}

// ── 換手倒數 ──────────────────────────────────────────────────────
// 手還舉在鏡頭前，這時候要人再點一次「開始」是最難點的一下 ——
// 所以倒數完自己開始。想快一點就按「立即開始」。
// ⭐ 2026-09-25 用戶：「定位那裡開始按摩後，倒數三秒準備然後直接開始，不要再按一次開始」。
//    進頁就用換手倒數同一套（提示列＋「立即開始」），固定 3 秒；計時照舊走按壓判定（pressCheck 預設開）。
const ENTRY_PREP_SEC = 3;
function startEntryCountdown() {
  const box = document.getElementById('round-switch');
  const base = hasRounds()
    ? (isZh() ? `準備按${t(curHandKey())}。` : `Get ready: ${t(curHandKey()).toLowerCase()}.`)
    : (isZh() ? '準備開始。' : 'Get ready.');
  box.setAttribute('data-base', base);
  box.textContent = base;
  box.hidden = false;
  startSwitchCountdown(ENTRY_PREP_SEC);
  syncMassageControls();
}

function startSwitchCountdown(secOverride) {
  stopSwitchCountdown();
  const sec = secOverride != null ? secOverride : (Number(flow.switchSec) || 0);
  const btn = document.getElementById('btn-switch-now');

  if (sec <= 0) { skipSwitchCountdown(); return; }

  switchRemain = sec;
  if (btn) btn.hidden = false;
  // 倒數中「開始按摩」跟「立即開始」同義，藏起來只留一顆（2026-09-25 用戶）
  const startBtn = document.getElementById('btn-massage-start');
  if (startBtn) startBtn.hidden = true;
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
  const startBtn = document.getElementById('btn-massage-start');
  if (startBtn) startBtn.hidden = false;
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
