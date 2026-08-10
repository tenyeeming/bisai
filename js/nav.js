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
 * @param cfg.backTo   返回列要退到哪一頁；沒填就不顯示返回鈕
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
  if (cfg && cfg.backTo) showPage(cfg.backTo);
}

// ── 底部分頁列 ────────────────────────────────────────────────────
function updateTabbar(page) {
  const tab = PAGES[page] ? PAGES[page].tab : null;
  document.querySelectorAll('#tabbar button').forEach(b => {
    const on = b.getAttribute('data-tab') === tab;
    b.classList.toggle('on', on);
    b.setAttribute('aria-current', on ? 'page' : 'false');
  });
  document.getElementById('tabbar').style.display =
    (PAGES[page] && PAGES[page].hideTabbar) ? 'none' : '';
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
  if (typeof camRunning !== 'undefined' && camRunning && !cfg.keepsCamera) stopCamera();
  if (typeof faceCamRunning !== 'undefined' && faceCamRunning && !cfg.keepsFaceCamera) stopFaceCamera();

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  currentPage = name;

  updateBackbar(name);
  updateStepRail(name);
  updateTabbar(name);
  window.scrollTo(0, 0);

  if (cfg.onEnter) cfg.onEnter();
}

function goHome() {
  state.selectedSymptoms = [];
  state.selectedAcupoints = [];
  state.recommendedAcupoints = [];
  state.currentAcupointIndex = 0;
  showPage('home');
}

// 切語言時只重繪「當前這頁」——重繪別頁會把使用者選到一半的東西清掉
function notifyLanguageChange() {
  buildStepRail();
  updateStepRail(currentPage);
  updateBackbar(currentPage);
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
}

// 所有 pages/*.js 都是一般 <script>，會在 DOMContentLoaded 之前跑完，
// 所以這時候註冊表一定已經齊了
document.addEventListener('DOMContentLoaded', boot);
