// ══ 步驟五：按摩 ═════════════════════════════════════════════════
// 兩個核心規則：
//   ① 計時只在「另一隻手的指尖真的對準穴道」時前進（onTarget 由 js/vision.js 每幀更新）
//   ② 同一個穴道左右手各一個，兩輪都按完才算完成這個穴道

let massageRunning = false;
let massageRemainMs = 30000;
let massageTickId = null;
const TICK_MS = 100;

// 第幾輪（1 = 左手，2 = 右手）。順序固定，使用者照著換手就好
const ROUND_HANDS = ['hand-left', 'hand-right'];
const TOTAL_ROUNDS = ROUND_HANDS.length;
let massageRound = 1;
const curHandKey = () => ROUND_HANDS[massageRound - 1];

registerPage('massage', {
  tab: 'home',
  step: 5,
  stepLabel: 'step-5',
  backTo: 'camera',
  hideTabbar: true,     // 按摩中手在鏡頭前，誤觸切頁會直接中斷計時
  keepsCamera: true,

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
      <button type="button" role="menuitem" onclick="switchCamera()" data-i18n="btn-flip">切換鏡頭</button>
      <button type="button" role="menuitem" data-disc-label onclick="toggleDisc()">隱藏信心圓盤</button>
      <hr>
      <button type="button" role="menuitem" class="danger" onclick="endMassageEarly()">
        <span data-i18n="menu-end-early">提早結束</span>
        <small data-i18n="menu-end-early-desc">本穴不計入紀錄與圖冊</small>
      </button>
    </div>`,

  onEnter: () => {
    document.getElementById('massage-title').textContent = acuLabel(curAcuName());
    closeMassageMenu();
    syncDiscLabels();
    resetMassageSession();
    startCamera('massage-canvas', 'massage');
  },
  onLeave: () => { stopMassageTimer(); closeMassageMenu(); },
  onLanguage: () => {
    document.getElementById('massage-title').textContent = acuLabel(curAcuName());
    syncDiscLabels();
    updateTimerDisplay();
    renderRound();
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
        font-family: var(--font-mono); font-size: 9.5px;
        letter-spacing: .14em; text-transform: uppercase; color: var(--brass);
      }
      .roundbar .hand {
        font-family: var(--font-ming); font-size: 19px; font-weight: 600;
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
        font-family: var(--font-mono); font-size: 11px; color: var(--ink-soft);
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
        font-family: var(--font-mono); font-size: 10px; letter-spacing: .16em;
        text-transform: uppercase; color: var(--brass);
      }
      .timer-display {
        font-family: var(--font-mono);
        font-size: 54px;
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
      .hint { font-family: var(--font-mono); font-size: 10.5px; color: var(--ink-soft); letter-spacing: .04em; }
      #round-switch[hidden] { display: none; }
    </style>

    <div class="stack">
      <div>
        <p class="eyebrow" data-i18n="eyebrow-massage">步驟五 · 雙手確認</p>
        <h2 id="massage-title" class="acu-title"></h2>
      </div>

      <div>
        <div class="roundbar">
          <div>
            <div class="k" data-i18n="round-label">本輪</div>
            <div class="hand" id="round-hand">左手</div>
          </div>
          <div class="pips" id="round-pips"></div>
        </div>

        <div class="viewport"><canvas id="massage-canvas" class="cam"></canvas></div>
        <div class="readout gate-warn" id="massage-gate" data-i18n="massage-hint">用另一隻手的指尖對準穴道圓盤</div>
      </div>

      <p class="notice warn" id="round-switch" hidden></p>

      <div class="meter">
        <p class="label" data-i18n="massage-timer">按摩時間（每隻手）</p>
        <div class="timer-display" id="timer-display">30</div>
        <p class="hint" id="timer-label"></p>
        <input type="range" class="timer-slider" id="timer-input" min="5" max="120" value="30"
               oninput="updateTimerDisplay()">
        <button class="btn wide" id="btn-massage-start" onclick="startMassage()" data-i18n="btn-massage-start">開始按摩</button>
        <p class="hint" id="timer-tip" style="margin-top:10px" data-i18n="timer-tip">計時只在指尖對準穴道時前進</p>
        <p class="hint" style="margin-top:4px" data-i18n="round-tip">同一個穴道左右手各有一個，兩隻手都按完才算完成。</p>
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
  armTimer();
  renderRound();
}

function armTimer() {              // 準備下一輪的計時，不動輪次
  stopMassageTimer();
  const btn = document.getElementById('btn-massage-start');
  btn.disabled = false;
  btn.textContent = startLabel();
  document.getElementById('timer-input').disabled = false;
  document.getElementById('timer-display').classList.remove('paused');
  updateTimerDisplay();
}

function startLabel() {
  if (massageRound === 1) return t('btn-massage-start');
  return isZh() ? `開始按${t(curHandKey())}` : `Start (${t(curHandKey()).toLowerCase()})`;
}

function renderRound() {
  document.getElementById('round-hand').textContent = t(curHandKey());

  const pips = document.getElementById('round-pips');
  pips.innerHTML = '';
  for (let i = 1; i <= TOTAL_ROUNDS; i++) {
    const p = document.createElement('span');
    p.className = 'pip' + (i < massageRound ? ' done' : i === massageRound ? ' now' : '');
    pips.appendChild(p);
  }
  const n = document.createElement('span');
  n.className = 'n';
  n.textContent = `${massageRound}/${TOTAL_ROUNDS}`;
  pips.appendChild(n);

  document.getElementById('btn-massage-start').textContent = startLabel();
}

// 換手提示：寫在頁面上而不是讀數條，因為讀數條下一幀就會被偵測結果蓋掉
function showSwitchHint(doneHandKey) {
  const box = document.getElementById('round-switch');
  box.textContent = isZh()
    ? `${t(doneHandKey)}完成！請換成${t(curHandKey())}，再按「${startLabel()}」。`
    : `${t(doneHandKey)} done. Switch to your ${t(curHandKey()).toLowerCase()}, then press “${startLabel()}”.`;
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

// ── 計時 ──────────────────────────────────────────────────────────
function updateTimerDisplay() {
  const v = parseInt(document.getElementById('timer-input').value, 10);
  if (!massageRunning) massageRemainMs = v * 1000;
  document.getElementById('timer-display').textContent =
    massageRunning ? Math.ceil(massageRemainMs / 1000) : v;
  document.getElementById('timer-label').textContent = isZh() ? `${v} 秒` : `${v} SEC`;
}

function stopMassageTimer() {
  massageRunning = false;
  if (massageTickId) { clearInterval(massageTickId); massageTickId = null; }
}

function startMassage() {
  if (massageRunning) return;
  document.getElementById('round-switch').hidden = true;
  massageRemainMs = parseInt(document.getElementById('timer-input').value, 10) * 1000;
  massageRunning = true;
  document.getElementById('btn-massage-start').disabled = true;
  document.getElementById('timer-input').disabled = true;

  massageTickId = setInterval(() => {
    const disp = document.getElementById('timer-display');
    if (!onTarget) { disp.classList.add('paused'); return; }   // 沒對準就不扣時間
    disp.classList.remove('paused');
    massageRemainMs -= TICK_MS;
    disp.textContent = Math.max(0, Math.ceil(massageRemainMs / 1000));
    if (massageRemainMs <= 0) { stopMassageTimer(); finishRound(); }
  }, TICK_MS);
}

function finishRound() {
  // 還有下一隻手就換手再來一輪，兩輪都完成才算完成這個穴道
  if (massageRound < TOTAL_ROUNDS) {
    const done = curHandKey();
    massageRound++;
    armTimer();
    renderRound();
    showSwitchHint(done);
    return;
  }
  completeMassage();
}
