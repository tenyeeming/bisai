// ═══════════════════════════════════════════════════════════════════
// 頁面註冊表與導覽
//
// 每一頁在自己的 pages/*.js 裡呼叫 registerPage() 報到，這支負責：
//   ① 開站時把各頁的 html 串起來塞進 <main>
//   ② 切頁（showPage）、步驟軌、底部分頁列
//
// 想新增一頁：建 pages/xx.js，在裡面 registerPage（含 html），
// 然後到 acunavi-ideal.html 加一行 <script>。不用改這支。
//
// ⚠️ 為什麼 html 是寫在 .js 裡而不是獨立的 .html 檔？
//    因為要能直接雙擊開（file://）。那個來源下 fetch 讀鄰居檔案會被
//    CORS 擋掉，但 <script src> 不會 —— 所以片段得搭 script 的順風車。
// ═══════════════════════════════════════════════════════════════════

const PAGES = {};        // 頁名 → 設定
const PAGE_ORDER = [];   // 註冊順序（＝<script> 標籤的順序）
let STEP_ORDER = [];     // 療程五步，由 step 欄位排出來
let currentPage = null;

/**
 * @param name        頁名。DOM 裡對應 id="page-<name>"
 * @param cfg.html    這頁的 HTML（含專屬 <style>），寫在頁面檔最下面
 * @param cfg.tab     屬於底部哪個分頁（預設同頁名）
 * @param cfg.step    療程第幾步；0 = 不在步驟軌上
 * @param cfg.stepLabel  步驟軌上的字（i18n key）
 * @param cfg.backTo   返回列要退到哪一頁；沒填就不顯示返回鈕。也可以是函式（按下時才決定，
 *                     例：按摩頁的臉部項目退回認穴頁，因為臉部沒有定位頁 —— 批 E）
 * @param cfg.backLabel 返回列的字（i18n key），預設 'btn-back'
 * @param cfg.actions  掛在返回列右邊的 HTML（如按摩頁的齒輪選單）
 * @param cfg.hideTabbar 進這頁要不要把分頁列收起來
 * @param cfg.keepsCamera 這頁需要「手部」相機（切到不需要的頁時會自動關）
 * @param cfg.keepsFaceCamera 這頁需要「臉部」相機。兩套模型不同、共用同一個
 *        <video>，所以分開管；同一時間只會有一邊在跑
 * @param cfg.onEnter / onLeave / onLanguage  生命週期
 */
function registerPage(name, cfg) {
  PAGES[name] = Object.assign({
    name, html: '', tab: name, step: 0, stepLabel: null,
    backTo: null, backLabel: 'btn-back', actions: '',
    hideTabbar: false, keepsCamera: false, keepsFaceCamera: false,
    onEnter: null, onLeave: null, onLanguage: null,
  }, cfg);
  PAGE_ORDER.push(name);
}

// ── 步驟軌 ────────────────────────────────────────────────────────
function buildStepRail() {
  const steps = PAGE_ORDER
    .filter(n => PAGES[n].step > 0)
    .sort((a, b) => PAGES[a].step - PAGES[b].step);
  STEP_ORDER = steps;

  const rail = document.getElementById('steprail');
  rail.style.gridTemplateColumns = `repeat(${steps.length}, 1fr)`;
  rail.innerHTML = steps.map(n => {
    const p = PAGES[n];
    const num = String(p.step).padStart(2, '0');
    return `<li data-step="${n}"><span class="n">${num}</span>` +
           `<span data-i18n="${p.stepLabel}">${t(p.stepLabel)}</span></li>`;
  }).join('');
}

function updateStepRail(page) {
  const idx = STEP_ORDER.indexOf(page);
  document.querySelectorAll('#steprail li').forEach(li => {
    const i = STEP_ORDER.indexOf(li.getAttribute('data-step'));
    li.classList.toggle('on', i === idx);
    li.classList.toggle('done', idx >= 0 && i < idx);
  });
  document.getElementById('steprail').style.display = idx >= 0 ? '' : 'none';
  const progress = document.getElementById('step-progress');
  progress.hidden = idx < 0;
  if (idx >= 0) {
    document.getElementById('step-title').textContent = t(PAGES[page].stepLabel);
    document.getElementById('step-count').textContent = `${idx + 1} / ${STEP_ORDER.length}`;
    document.getElementById('step-fill').style.width = `${(idx + 1) / STEP_ORDER.length * 100}%`;
    const track = document.getElementById('step-track');
    track.setAttribute('aria-label', isZh() ? '療程進度' : 'Session progress');
    track.setAttribute('aria-valuemax', STEP_ORDER.length);
    track.setAttribute('aria-valuenow', idx + 1);
    track.setAttribute('aria-valuetext', t(PAGES[page].stepLabel));
  }
}

// ── 返回列 ────────────────────────────────────────────────────────
function updateBackbar(page) {
  const cfg = PAGES[page];
  const bar = document.getElementById('backbar');
  const btn = document.getElementById('back-btn');
  const actions = document.getElementById('backbar-actions');

  // 有返回目標或有動作按鈕，這條就要在
  bar.style.display = (cfg && (cfg.backTo || cfg.actions)) ? '' : 'none';
  btn.style.visibility = (cfg && cfg.backTo) ? '' : 'hidden';

  if (cfg && cfg.backTo) {
    // 換 data-i18n 讓 updateLanguage() 之後也能自己翻（定位頁是「← 停止」）
    btn.setAttribute('data-i18n', cfg.backLabel);
    btn.textContent = t(cfg.backLabel);
  }

  // 每次切頁重新插一次，順便把上一頁的按鈕（與展開的選單）清掉
  actions.innerHTML = (cfg && cfg.actions) || '';
  applyI18n(actions);
}

function goBack() {
  const cfg = PAGES[currentPage];
  if (cfg && cfg.backTo) showPage(typeof cfg.backTo === 'function' ? cfg.backTo() : cfg.backTo);
}

// ── 底部分頁列 ────────────────────────────────────────────────────
function updateTabbar(page) {
  const tab = PAGES[page] ? PAGES[page].tab : null;
  document.querySelectorAll('#tabbar button').forEach(b => {
    const on = b.getAttribute('data-tab') === tab;
    b.classList.toggle('on', on);
    b.setAttribute('aria-current', on ? 'page' : 'false');
  });
  const hide = !!(PAGES[page] && PAGES[page].hideTabbar);
  document.getElementById('tabbar').style.display = hide ? 'none' : '';
  // 2026-09-20：桌面版型（≥1024px）把分頁列改成**左側導覽欄**。療程流程中分頁列是藏起來的，
  // 左欄就會變成一條空白 —— 所以這裡把狀態掛到外殼上，CSS 才收得掉那一欄（見 responsive.css）。
  // ⚠️ 用 class 而不是讓 CSS 去嗅 inline style（`[style*="none"]`）：那種寫法綁死字串序列化，
  //    哪天有人改成 hidden 屬性或 class 就會靜靜失效。
  document.querySelector('.device').classList.toggle('in-flow', hide);
}

// ── 電腦版左側欄（2026-10-31 方案 D）─────────────────────────────────
// 用戶選的「側欄導覽」：左邊深藍欄常駐，放 首頁／圖冊／設定，下面依分頁換內容：
//   首頁（療程）→ 療程四步（選症狀＋步驟軌那四頁）；認穴之後多一份「這次療程」穴道清單
//   設定 → 設定目錄（點了直接進子頁）
//   圖冊 → 只有分頁鈕
// 手機／平板這個 <aside> 是 display:none（css/desktop.css），畫了也看不到，所以不必判斷螢幕。
// 預覽稿：比賽專區 介面討論（Artifact「AcuNavi 方案 D」）。
function renderSidenav(page) {
  const box = document.getElementById('sidenav');
  if (!box || !PAGES[page]) return;
  const tab = PAGES[page].tab;
  const tabs = [['home', 'nav-home'], ['gallery', 'nav-gallery'], ['settings', 'nav-settings']];
  let html = `<div class="sn-brand wordmark">Acu<span>Navi</span></div>
    <nav class="sn-tabs">${tabs.map(([k, key]) =>
      `<button type="button" class="${k === tab ? 'on' : ''}" ${k === tab ? 'aria-current="page"' : ''}
        onclick="goTab('${k}')">${t(key)}</button>`).join('')}</nav>`;

  if (tab === 'home') {
    // 療程步驟：選症狀（首頁，不在步驟軌上）＋ 步驟軌四頁。完成頁、總結頁算在按摩之後
    const flow = ['home', ...STEP_ORDER];
    let idx = flow.indexOf(page);
    if (idx < 0) idx = flow.length;                 // complete／summary：四步都做完了
    const label = (n) => n === 'home' ? t('side-step-home') : t(PAGES[n].stepLabel);
    html += `<div class="sn-sec"><p class="sn-k">${t('side-steps')}</p><ol class="sn-steps">${flow.map((n, i) => {
      const cls = i < idx ? 'ok' : i === idx ? 'on' : '';
      // 只有「選症狀」「選穴」做過了可以點回去（之後的頁面要靠療程狀態，用返回鈕退）
      const go = i < idx && (n === 'home' || n === 'recommend') ? ` onclick="showPage('${n}')" role="button" tabindex="0"` : '';
      return `<li class="${cls}"${go}><b>${i < idx ? '✓' : i + 1}</b><span>${label(n)}</span></li>`;
    }).join('')}</ol></div>`;
    // 這次療程：認穴之後才有清單
    const list = state.selectedAcupoints || [];
    if (list.length && ['acu-detail', 'camera', 'massage', 'complete', 'summary'].includes(page)) {
      const cur = state.currentAcupointIndex || 0, done = page === 'summary';
      html += `<div class="sn-sec"><p class="sn-k">${t('side-session')}</p><ol class="sn-steps">${list.map((n, i) => {
        const cls = done || i < cur || (page === 'complete' && i === cur) ? 'ok' : i === cur ? 'on' : '';
        return `<li class="${cls}"><b>${cls === 'ok' ? '✓' : i + 1}</b><span>${itemLabel(n)}</span></li>`;
      }).join('')}</ol></div>`;
    }
  } else if (tab === 'settings') {
    const rows = [['settings-lang', 'settings-lang'], ['settings-display', 'settings-display'],
                  ['settings-flow', 'settings-flow'], ['settings-notify', 'settings-notify']];
    html += `<div class="sn-sec"><p class="sn-k">${t('nav-settings')}</p><ol class="sn-steps sn-menu">${rows.map(([p, key]) =>
      `<li class="${p === page ? 'on' : ''}" onclick="showPage('${p}')" role="button" tabindex="0"><span>${t(key)}</span></li>`).join('')}</ol></div>`;
  }
  html += `<p class="sn-disc">${t('side-disclaimer')}</p>`;
  box.innerHTML = html;
  box.querySelectorAll('[role="button"]').forEach(el => {
    el.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); } };
  });
}

// 點分頁列的「首頁」＝回到療程起點，跟 LINE 點回同一分頁會回到頂端一樣
function goTab(tab) {
  if (tab === 'home') goHome();
  else showPage(tab);
}

// ── 切頁 ──────────────────────────────────────────────────────────
function showPage(name) {
  const cfg = PAGES[name];
  if (!cfg) { console.error('no such page:', name); return; }

  const el = document.getElementById(`page-${name}`);
  if (!el) { console.error('page not loaded:', name); return; }

  // 離開前先讓上一頁收尾（例如按摩頁停計時）
  if (currentPage && currentPage !== name && PAGES[currentPage].onLeave) {
    PAGES[currentPage].onLeave();
  }
  // 新頁不需要相機就一定要關，否則背景持續佔用鏡頭。兩套模型各關各的。
  // 「啟動中」也要關（2026-09-23）：權限視窗還沒按就切頁，不關的話啟動完會在背景佔住鏡頭
  if (typeof camRunning !== 'undefined' && (camRunning || camStarting) && !cfg.keepsCamera) stopCamera();
  if (typeof faceCamRunning !== 'undefined' && (faceCamRunning || faceCamStarting) && !cfg.keepsFaceCamera) stopFaceCamera();
  if (typeof faCamRunning !== 'undefined' && (faCamRunning || faCamStarting) && !cfg.keepsCamera) stopForearmCamera();

  const previous = currentPage;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active', 'page-enter'));
  el.style.setProperty('--enter-x', previous && PAGES[previous].tab === cfg.tab
    ? (PAGE_ORDER.indexOf(name) >= PAGE_ORDER.indexOf(previous) ? '18px' : '-18px') : '0px');
  if (previous !== name) el.classList.add('page-enter');
  el.classList.add('active');
  currentPage = name;
  // ⭐ 2026-09-20：把目前頁面標在 <body> 上，讓 CSS 能「只在某一頁」做事。
  //    第一個用途是首頁的草地背景（css/shell.css 的 .device::before）——
  //    背景要鋪到**整個殼的最底**（含分頁列後面），
  //    畫在 #page-home 裡面只能鋪到內容區，四周還是一圈白邊。
  document.body.dataset.page = name;

  updateBackbar(name);
  updateStepRail(name);
  updateTabbar(name);
  renderSidenav(name);
  window.scrollTo(0, 0);

  if (cfg.onEnter) cfg.onEnter();
  // onEnter 可因缺少療程而轉回首頁，不能把焦點送到已隱藏的舊頁。
  if (currentPage === name && previous && previous !== name) {
    const title = el.querySelector('h2');
    if (title) { title.tabIndex = -1; title.focus({ preventScroll: true }); }
  }
}

function goHome() {
  if (typeof practiceFromGallery !== 'undefined') practiceFromGallery = false;
  state.selectedSymptoms = [];
  state.selectedAcupoints = [];
  // 臉部另外存，也要清。不清的話從圖冊「練這一穴」進去時，buildTreatmentList
  // 會把上一次殘留的臉部穴道一起排進療程（2026-09-08 接預設流程時發現）。
  state.selectedFace = [];
  state.selectedForearm = [];
  state.acuSecs = {};          // 逐穴秒數也是這一次療程的事
  state.recommendedAcupoints = [];
  state.currentAcupointIndex = 0;
  if (typeof sessionLog !== 'undefined') sessionLog = [];   // 這一次療程的紀錄跟著清掉
  showPage('home');
}

// 切語言時只重繪「當前這頁」——重繪別頁會把使用者選到一半的東西清掉
function notifyLanguageChange() {
  buildStepRail();
  updateStepRail(currentPage);
  updateBackbar(currentPage);
  renderSidenav(currentPage);
  const cfg = PAGES[currentPage];
  if (cfg && cfg.onLanguage) cfg.onLanguage();
}

// ── 開站 ──────────────────────────────────────────────────────────
function boot() {
  const main = document.getElementById('pages');
  const missing = PAGE_ORDER.filter(n => !PAGES[n].html);
  if (missing.length) console.error('這些頁沒有 html：', missing);

  // innerHTML 插進來的 <style> 瀏覽器會照常套用（只有 <script> 不會執行），
  // 所以各頁的專屬樣式可以跟著自己的 html 走
  main.innerHTML = PAGE_ORDER.map(n => PAGES[n].html).join('\n');

  buildStepRail();
  updateLanguage();
  showPage('home');

  // 開場動畫（2026-09-20）。**放在最後**：下面的頁面已經組好了，
  // 開場只是蓋在上面 —— 收掉的瞬間首頁是完整的，不會先閃一下空白。
  // 見 js/splash.js（使用者要求減少動態時這一層根本不會建出來）。
  if (typeof showSplash === 'function') showSplash();
}

// 所有 pages/*.js 都是一般 <script>，會在 DOMContentLoaded 之前跑完，
// 所以這時候註冊表一定已經齊了
document.addEventListener('DOMContentLoaded', boot);
