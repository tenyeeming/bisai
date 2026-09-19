// ══ 步驟二：認穴 ═════════════════════════════════════════════════
// 定位文字來自 ACUPOINTS[].locate，安全警語來自 ACUPOINT_DETAIL[].note，
// 兩者都在 js/acu-data.js。

registerPage('acu-detail', {
  tab: 'home',
  step: 2,
  stepLabel: 'step-2',
  backTo: 'recommend',
  // 下一步就是定位頁，趁使用者在這頁讀說明時，先把 MediaPipe 在背景載好
  // （~16MB，不預熱的話會卡在「開始定位」那一下）。見 js/vision.js warmUpHands。
  onEnter: () => { closeTutorial(); renderAcuDetail(); warmUpHands(); startReadyCountdown(); },
  onLeave: () => { stopReadyCountdown(); closeTutorial(); },
  onLanguage: () => { renderAcuDetail(); renderReadyBar(); },

  html: `
  <div id="page-acu-detail" class="page">
    <style>
      /* 參考圖 + 定位文字並排，像教科書的圖說 */
      .ref-row { display: flex; gap: 12px; align-items: flex-start; }
      .ref-frame {
        flex: none; width: 42%;
        background: #fff;            /* 圖是白底線稿，深色主題下要自己帶底 */
        border: 1px solid var(--line);
        border-radius: var(--r);
        padding: 4px;
      }
      .ref-frame img { width: 100%; height: auto; display: block; border-radius: 2px; }
      .ref-frame .cap {
        font-family: var(--font-mono); font-size: 0.5625rem; letter-spacing: .1em;
        color: #7a8580; text-align: center; padding: 3px 0 1px;
      }
      .ref-none {
        flex: none; width: 42%;
        border: 1px dashed var(--line); border-radius: var(--r);
        padding: 18px 8px; text-align: center;
        font-size: 0.71875rem; color: var(--ink-soft);
      }
      /* ── 認穴倒數（2026-09-02）─────────────────────────────
         倒數到 0 就自己翻到定位頁，使用者不必點。但人可能還在讀定位說明，
         所以「手指按住畫面就停住」—— 不另外做暫停鈕，按住是最不用學的動作。 */
      .readybar {
        display: flex; align-items: center; gap: 10px;
        border: 1px solid var(--brass); border-radius: var(--r);
        background: var(--surface-2); padding: 9px 12px;
      }
      .readybar .num {
        font-family: var(--font-mono); font-size: 1.375rem; font-weight: 600;
        color: var(--brass); font-variant-numeric: tabular-nums; min-width: 2ch; text-align: center;
      }
      .readybar .txt { font-size: 0.78125rem; color: var(--ink-soft); line-height: 1.5; }
      .readybar.held { border-color: var(--line); }
      .readybar.held .num { color: var(--ink-soft); }
      .readybar button {
        margin-left: auto; flex: none;
        font-family: var(--font-mono); font-size: 0.6875rem; letter-spacing: .06em;
        color: var(--ink-soft); background: none;
        border: 1px solid var(--line); border-radius: var(--r);
        padding: 6px 10px; cursor: pointer;
      }
      .readybar button:hover { border-color: var(--brass); color: var(--brass); }
      #ready-bar[hidden] { display: none; }

      #tutorial-box { display: none; }
      /* ── 教學影片（2026-09-05）─────────────────────────────
         內嵌小框試過，用戶說「不太好」（手機上那塊只有一指寬）→ 改成
         這顆按鈕點了開全螢幕播放器，播放器本身是 .vid-overlay。 */
      .vid-open {
        display: flex; align-items: center; gap: 9px; width: 100%;
        border: 1px solid var(--brass); border-radius: var(--r);
        background: var(--surface-2); color: var(--brass);
        font-family: inherit; font-size: 0.8125rem; text-align: left;
        padding: 10px 12px; margin-bottom: 4px; cursor: pointer;
      }
      .vid-open .play {
        font-size: 0.6875rem; line-height: 1;
        border: 1px solid var(--brass); border-radius: 50%;
        padding: 5px 5px 5px 7px;
      }
      .vid-open:hover { background: var(--surface-3, var(--surface-2)); }
      /* 覆蓋層貼在 <body> 上（不在 .page 裡），所以要蓋過所有東西 */
      .vid-overlay {
        position: fixed; inset: 0; z-index: 900;
        display: flex; align-items: center; justify-content: center;
        background: #000;
      }
      .vid-overlay video { max-width: 100%; max-height: 100%; }
      /* 跳轉鈕：左右兩側垂直置中，不擋影片底緣的原生控制列（進度條在那裡） */
      .vid-seek {
        position: absolute; top: 50%; transform: translateY(-50%); z-index: 1;
        min-width: 52px; height: 44px;      /* 手指點得到 */
        font-family: var(--font-mono); font-size: 0.8125rem;
        color: #fff; background: rgba(0,0,0,.55);
        border: 1px solid rgba(255,255,255,.45); border-radius: 22px;
        cursor: pointer;
      }
      .vid-seek.back { left: 10px; }
      .vid-seek.fwd { right: 10px; }
      .vid-close {
        position: absolute; top: 10px; right: 10px; z-index: 1;
        width: 40px; height: 40px;          /* 手指點得到的大小 */
        font-size: 1.125rem; line-height: 1;
        color: #fff; background: rgba(0,0,0,.55);
        border: 1px solid rgba(255,255,255,.45); border-radius: 50%;
        cursor: pointer;
      }
      #tutorial-box p {
        font-size: 0.8125rem; color: var(--ink-soft);
        margin-top: 7px; padding-left: 12px;
        border-left: 1px solid var(--line);
      }
    </style>

    <div class="stack">
      <div>
        <p class="eyebrow">
          <span data-i18n="eyebrow-detail">步驟二 · 定位說明</span> ·
          <span id="acu-progress" class="mono-sm"></span>
        </p>
        <h2 id="acu-name" class="acu-title"></h2>
      </div>
      <div id="acu-note"></div>
      <div class="ref-row">
        <div id="acu-ref"></div>
        <p class="small" id="acu-detail"></p>
      </div>
      <p class="notice" id="acu-side-hint"></p>
      <div class="readybar" id="ready-bar" hidden>
        <span class="num" id="ready-num">5</span>
        <span class="txt" id="ready-txt"></span>
        <button type="button" onclick="skipReadyCountdown()" data-i18n="btn-ready-now">立即開始</button>
      </div>
      <div class="btn-row">
        <button class="btn ghost" onclick="toggleTutorial()" data-i18n="btn-tutorial">看教學</button>
        <button class="btn" onclick="startLocate()" data-i18n="btn-locate">開始定位</button>
      </div>
      <div id="tutorial-box"></div>
    </div>
  </div>`,
});

// ── 認穴倒數 ──────────────────────────────────────────────────────
// flow.readySec = 0 代表「跳過認穴」：進頁就直接翻到定位頁。
// ⚠️ 跳過的代價：MediaPipe（~16MB）原本靠使用者讀說明那幾秒在背景載完，
//    設 0 會讓定位頁開頭卡一下。這是使用者自己選的，不擋。
let readyTickId = null;
let readyRemain = 0;
let readyHeld = false;

function startReadyCountdown() {
  stopReadyCountdown();
  const bar = document.getElementById('ready-bar');
  const sec = Number(flow.readySec) || 0;

  if (sec <= 0) { bar.hidden = true; setTimeout(() => { if (currentPage === 'acu-detail') startLocate(); }, 0); return; }

  readyRemain = sec;
  readyHeld = false;
  bar.hidden = false;
  bar.classList.remove('held');
  renderReadyBar();

  // 按住畫面 = 我還在讀，別翻頁。放開就繼續倒數。
  document.addEventListener('pointerdown', onReadyHold);
  document.addEventListener('pointerup', onReadyRelease);
  document.addEventListener('pointercancel', onReadyRelease);

  readyTickId = setInterval(() => {
    if (readyHeld) return;
    readyRemain--;
    renderReadyBar();
    if (readyRemain <= 0) { stopReadyCountdown(); startLocate(); }
  }, 1000);
}

function stopReadyCountdown() {
  if (readyTickId) { clearInterval(readyTickId); readyTickId = null; }
  readyHeld = false;
  document.removeEventListener('pointerdown', onReadyHold);
  document.removeEventListener('pointerup', onReadyRelease);
  document.removeEventListener('pointercancel', onReadyRelease);
  const bar = document.getElementById('ready-bar');
  if (bar) { bar.hidden = true; bar.classList.remove('held'); }
}

// 「立即開始」按鈕自己會處理，按到它不要當成「按住暫停」
function onReadyHold(e) {
  if (e.target.closest && e.target.closest('#ready-bar button')) return;
  readyHeld = true;
  const bar = document.getElementById('ready-bar');
  if (bar) bar.classList.add('held');
  renderReadyBar();
}

function onReadyRelease() {
  readyHeld = false;
  const bar = document.getElementById('ready-bar');
  if (bar) bar.classList.remove('held');
  renderReadyBar();
}

function renderReadyBar() {
  const num = document.getElementById('ready-num');
  const txt = document.getElementById('ready-txt');
  if (!num || !txt) return;
  num.textContent = readyHeld ? '‖' : readyRemain;
  txt.textContent = readyHeld
    ? (isZh() ? '已暫停，放開手指繼續倒數' : 'Paused — release to resume')
    : (isZh() ? '秒後自動進入定位。按住畫面可暫停。' : 'sec until locating starts. Hold the screen to pause.');
}

function skipReadyCountdown() {
  stopReadyCountdown();
  startLocate();
}

// 從選穴頁進來：排序後從第一個穴道開始
function goToAcuDetail() {
  buildTreatmentList();
  if (state.selectedAcupoints.length === 0) {
    alert(isZh() ? '請選擇至少一個穴道' : 'Please select at least one acupoint');
    return;
  }
  state.currentAcupointIndex = 0;
  showPage('acu-detail');
}

/**
 * 把手部與臉部的勾選合成一條療程清單（2026-09-04）。
 *
 * ⭐ **臉部一律排在最後**，這是整個「臉部加入療程」最關鍵的一行。
 *    Hands 與 FaceMesh 共用同一個 <video>，一次只能跑一邊（見 js/face-vision.js
 *    開頭），切換要關掉相機串流再重開 —— 是有感的黑畫面。
 *    同類相鄰的話，不管選了幾個臉部穴道，**整場療程只切一次**；
 *    交錯排的話就是切 N 次。這不是美觀問題，是能不能用的問題。
 *
 * 手部內部照 ACUPOINTS 的順序（遠端 → 近端），臉部內部照 FACE_ACUPOINTS 的順序。
 */
function buildTreatmentList() {
  const handOrder = ACUPOINTS.map(a => a.name);
  const faceOrder = FACE_ACUPOINTS.map(a => a.code);

  // 進到這裡時 selectedAcupoints 只有手部（臉部勾在 selectedFace），
  // 但保險起見還是濾一次 —— 從圖冊「練這一穴」等入口進來的形狀可能不同
  const hands = state.selectedAcupoints.filter(n => !isFaceItem(n))
    .sort((a, b) => handOrder.indexOf(a) - handOrder.indexOf(b));

  // 只收公式做得出來的臉部穴道。選穴頁本來就擋著「準備中」那些，
  // 這裡是第二道 —— 排進療程卻算不出位置的話，人會卡在定位頁不知道為什麼
  const faces = (state.selectedFace || []).filter(c => FACE_IMPLEMENTED.has(c))
    .sort((a, b) => faceOrder.indexOf(a) - faceOrder.indexOf(b));

  state.selectedAcupoints = [...hands, ...faces];
}

/**
 * 換掉認穴頁的參考圖區塊。
 *
 * 🚨 為什麼要自己寫一個函式：原本是
 *      document.querySelector('.ref-row > :first-child').id = 'acu-ref';
 *    那是**全域**查詢，而選穴頁的 ⓘ 詳情面板（02-recommend.js 的 openAcuInfo）
 *    裡也有一個 .ref-row，在 DOM 裡還排更前面。只要使用者開過一次 ⓘ，
 *    這行就會把 id 蓋到面板那塊上，之後 getElementById('acu-ref') 拿到的
 *    是藏起來的面板元素 —— 認穴頁的圖就換不動了。
 *    2026-09-04 接臉部時踩到（臉部的「沒有參考圖」說明沒出現）。
 *    → 一律把查詢限縮在 #page-acu-detail 裡面。
 */
function swapRefBlock(el) {
  const row = document.querySelector('#page-acu-detail .ref-row');
  if (!row) return;
  el.id = 'acu-ref';
  row.replaceChild(el, row.firstElementChild);
}

function renderAcuDetail() {
  const name = curAcuName();
  if (!name) { goHome(); return; }
  if (isFaceItem(name)) { renderFaceAcuDetail(name); return; }
  const acu = ACUPOINTS.find(a => a.name === name);
  const detail = ACUPOINT_DETAIL[name] || {};

  document.getElementById('acu-name').textContent = acuLabel(name);
  document.getElementById('acu-progress').textContent =
    `${state.currentAcupointIndex + 1} / ${state.selectedAcupoints.length}`;

  // 安全警語（如合谷穴「懷孕忌按」）— 一定要顯示
  const noteBox = document.getElementById('acu-note');
  noteBox.innerHTML = '';
  if (detail.note) {
    const d = document.createElement('p');
    d.className = 'notice warn';
    d.textContent = detail.note;
    noteBox.appendChild(d);
  }

  swapRefBlock(acuRefBlock(name));

  document.getElementById('acu-detail').textContent =
    acu && acu.locate ? acu.locate : (isZh() ? '（尚無定位描述）' : '(no description yet)');

  const dorsal = acu && acu.side === 'dorsal';
  document.getElementById('acu-side-hint').textContent = BILATERAL_ACUPOINTS.has(name)
    ? (isZh() ? '此穴在手側緣，手背或手心朝鏡頭都可定位。' : 'Side-edge point: either hand side works.')
    : (isZh() ? `請將${dorsal ? '手背' : '手心'}朝向鏡頭。` : `Face your ${dorsal ? 'back of hand' : 'palm'} to the camera.`);

  document.getElementById('tutorial-box').style.display = 'none';
}

/**
 * 臉部項目的認穴頁（2026-09-04）。
 *
 * 跟手部同一頁、同一組 DOM，只是填不同的東西：
 *   定位說明 → WHO 原文（`faceWho`）。臉部刻意不編白話版 —— 這條線的公式
 *              就是照 WHO 字面實作的，改寫成白話等於偷偷加入沒驗過的詮釋。
 *   參考圖   → 沒有。臉部這條線只有 `臉部/對照圖/` 的研究用圖，不是給使用者看的
 *   正反面   → 換成「請正面對鏡頭」
 */
function renderFaceAcuDetail(code) {
  document.getElementById('acu-name').textContent = faceLabel(code);
  document.getElementById('acu-progress').textContent =
    `${state.currentAcupointIndex + 1} / ${state.selectedAcupoints.length}`;

  // 臉部目前沒有安全警語資料（ACUPOINT_DETAIL 是手部的表），但誠實話要講：
  // 這條線只有 1 人 1 張照片的資料基礎
  const noteBox = document.getElementById('acu-note');
  noteBox.innerHTML = '';
  const d = document.createElement('p');
  d.className = 'notice';
  d.textContent = t('face-honest-short');
  noteBox.appendChild(d);

  // 參考圖區塊換成「臉部沒有參考圖」的說明，不要借手部的圖
  const none = document.createElement('div');
  none.className = 'ref-none';
  none.textContent = t('face-ref-none');
  swapRefBlock(none);

  document.getElementById('acu-detail').textContent =
    faceWho(code) || (isZh() ? '（尚無定位描述）' : '(no description yet)');

  document.getElementById('acu-side-hint').textContent = t('face-side-hint');
  document.getElementById('tutorial-box').style.display = 'none';
}

/**
 * 臉部版的「怎麼做」四步。
 * ⚠️ 第 4 步刻意**不寫**「要真的碰到皮膚才算」——
 *    深度判定目前是關的（js/face-gate.js 的 FACE_DEPTH_CHECK），
 *    寫了就是承諾一個沒在跑的檢查。現在的判準就是畫面上對準，照實說。
 */
function renderFaceTutorial(box) {
  const steps = isZh()
    ? ['把臉擺進畫面，正對鏡頭，不要低頭或側頭。',
       '前鏡頭是鏡像的，畫面裡的左右跟你自己的左右相反 —— 看點的位置就好，不要用左右判斷。',
       '圓盤接近正圓代表臉正對鏡頭、定位可信；被壓扁代表轉太多，讀數會標出信心百分比。',
       '把指尖移到畫面上的穴位標記，計時才會前進。畫面是鏡像的，跟著標記走就好。']
    : ['Put your face in frame and look straight at the camera.',
       'The front camera is mirrored, so left and right are flipped — go by the marker, not by side.',
       'A near-circular disc means you are facing the camera and the position is reliable; a flattened disc means you have turned too far.',
       'Move your fingertip onto the marker on screen and the timer will run. The view is mirrored, so just follow the marker.'];

  fillTutorial(box, curAcuName(), steps);
}

// 教學區塊 = 影片（有的話）＋ 編號文字步驟。
// 影片放最上面：會看的人一眼看到，不看的人往下讀文字，兩邊都不用捲。
function fillTutorial(box, name, steps) {
  box.innerHTML = '';
  const vidBtn = acuVideoButton(name);
  if (vidBtn) box.appendChild(vidBtn);
  steps.forEach((s, i) => {
    const p = document.createElement('p');
    p.textContent = `${i + 1}. ${s}`;
    box.appendChild(p);
  });
  box.style.display = 'block';
}

// 收起教學區塊並停掉影片。換穴、離頁都要叫，否則下一穴會看到上一穴的片還開著。
function closeTutorial() {
  if (typeof closeTutorialVideo === 'function') closeTutorialVideo(); // 播放器腳本未載入時仍可安全離開
  const box = document.getElementById('tutorial-box');
  if (!box) return;
  box.innerHTML = '';
  box.style.display = 'none';
}

function toggleTutorial() {
  const box = document.getElementById('tutorial-box');
  if (box.style.display !== 'none') { closeTutorial(); return; }

  // ⭐ 展開教學 = 停掉自動翻頁（2026-09-05 用戶要求）。
  //    倒數本來是為了「讀完說明就自動進定位頁」，但按了看教學代表還要再讀一段，
  //    倒數繼續走的話會看到一半被翻走。停了就不再自己重啟 —— 使用者自己按「開始定位」。
  stopReadyCountdown();

  const cur = curAcuName();
  if (isFaceItem(cur)) { renderFaceTutorial(box); return; }
  const acu = ACUPOINTS.find(a => a.name === cur);
  const dorsal = acu && acu.side === 'dorsal';
  const steps = isZh()
    ? ['把手舉到鏡頭前，保持手掌平整、不要傾斜。',
       `依提示讓${dorsal ? '手背' : '手心'}朝向鏡頭。`,
       '圓盤接近正圓代表這塊皮膚正對鏡頭、定位可信；被壓扁成細線代表角度太斜。',
       '用另一隻手的食指或拇指指尖對準圓盤中心，計時才會前進。']
    : ['Raise your hand to the camera and keep the palm flat.',
       `Face your ${dorsal ? 'back of hand' : 'palm'} to the camera.`,
       'A near-circular disc means the skin faces the camera and the position is reliable; a flattened disc means the angle is too steep.',
       'Aim your other hand\'s index or thumb tip at the disc centre to advance the timer.'];

  fillTutorial(box, cur, steps);
}
