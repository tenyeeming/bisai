// ══ 開場動畫 ═════════════════════════════════════════════════════
//
// 用戶 2026-09-20：「把這個當作進入 app 后的開場動畫」。
// 素材原檔：`比賽專區/素材/界面設計/Codex 图像 2026年9月20日 20_37_53.gif`
// （468×832、27 幀、約 3.2 秒、**5.27 MB**）。
//
// ⭐ 網站上放的是**轉檔後的 animated WebP**（`assets/splash/opening.webp`，816 KB）——
//    同樣的畫面小了 85%。GIF 對這種有漸層天空的插畫效率極差；
//    5 MB 的「開場」等於開場自己變成等待，線上版（GitHub Pages）尤其明顯。
//    原始 GIF 留在素材資料夾，不進網站。
//
// ⚠️ animated WebP：Chrome 32+／Safari 14+／Firefox 65+ 都支援。
//    真的載不出來（`onerror`）就退回最後一幀的靜態圖，再不行就直接跳過 ——
//    開場動畫**永遠不可以擋住人進 App**，這是這支唯一的硬規則。
//
// ⚠️ 不用 `<video>`：要自動播就得 muted+playsinline，iOS 上仍有低電量模式不給播的情況；
//    `<img>` 沒有這些限制，而且 3 秒的短片用影片編碼省不了多少。
// ═══════════════════════════════════════════════════════════════════

/** 動畫本身的長度（ms）。轉檔時逐幀加總出來的，改素材要一起改 */
const SPLASH_MS = 3170;

/** 淡出時間。跟 CSS 的 transition 是同一個值 */
const SPLASH_FADE_MS = 420;

/**
 * 保險絲：素材再慢也不能讓人卡在開場。
 * 從「開始顯示」算起超過這個時間就強制收掉，不管圖載好了沒。
 */
const SPLASH_MAX_MS = 5000;

let splashTimer = null;
/**
 * 開場層本身，null = 沒有在畫。
 *
 * 刻意用模組變數而不是每次 getElementById —— 這一層是動態建出來的，
 * 不在 shell 的 HTML 裡（同 js/acu-video.js 的播放器）。
 *
 * ⭐ 「收過了沒」就看這一個，**不另外留一個已完成旗標**：
 *    兩個狀態就會有「旗標說收了、層卻還在」的不一致，
 *    而那一種不一致的後果是一張圖永遠蓋在 App 上面。
 */
let splashLayer = null;

/** 會不會播開場：使用者要求減少動態時就不播（無障礙，同系統設定） */
function splashWanted() {
  try {
    return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) {
    return true;       // 查不到就當作可以播
  }
}

/**
 * 開場動畫。boot() 之前呼叫 —— 底下的頁面照常組起來，
 * 只是被這一層蓋住，所以收掉的瞬間首頁已經是完整的，不會閃一下空白。
 */
function showSplash() {
  if (!splashWanted()) return;

  const layer = document.createElement('div');
  layer.id = 'splash';
  layer.setAttribute('role', 'presentation');

  const img = document.createElement('img');
  img.id = 'splash-img';
  img.src = 'assets/splash/opening.webp';
  img.alt = '';
  // 載不出來就退靜態圖；靜態圖也不行就直接結束，不要讓人對著破圖等
  img.onerror = () => {
    if (img.dataset.fallback) { endSplash(); return; }
    img.dataset.fallback = '1';
    img.src = 'assets/splash/opening-still.webp';
  };

  // 點一下就跳過。不畫「跳過」按鈕：整片都能點，比一顆小按鈕好按得多，
  // 也不必為那顆按鈕想中英文案與擺放位置。
  layer.onclick = endSplash;

  const hint = document.createElement('p');
  hint.className = 'splash-hint';
  hint.textContent = t('splash-skip');

  layer.append(img, hint);
  document.body.appendChild(layer);
  splashLayer = layer;

  splashTimer = setTimeout(endSplash, Math.min(SPLASH_MS + 260, SPLASH_MAX_MS));
}

/** 收掉開場層。重複呼叫是安全的（點擊與計時器會搶） */
function endSplash() {
  if (splashTimer) { clearTimeout(splashTimer); splashTimer = null; }

  const layer = splashLayer;
  if (!layer) return;
  splashLayer = null;
  layer.classList.add('out');
  // 淡出結束才真的移除。用 setTimeout 而不是 transitionend ——
  // 分頁在背景時 transition 不一定會觸發，那樣這一層會永遠留著擋住畫面。
  setTimeout(() => layer.remove(), SPLASH_FADE_MS);
}
