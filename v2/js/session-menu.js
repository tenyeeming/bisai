// ══ 療程齒輪選單（定位頁、按摩頁共用）══════════════════════════════
// 2026-09-25 用戶：「從定位開始，返回那行的最右邊加入一個設定，
//   設定裏面可以調整想要按摩的手指，開始按摩后也要可以選擇」
//   「換穴、隱藏信心圓盤、跳過這一穴都加入到這個右上角的設定裏面」
//
// 兩頁的選單內容一樣：按摩手指 → 信心圓盤 → 換穴模式 → 跳過這一穴。
// 按摩頁多一項「切換鏡頭」（它沒有外面的按鈕列；定位頁的切換鏡頭留在取景框下面）。
// id 用前綴分開（locate-*／massage-*），因為返回列一次只掛一頁的選單，
// 但 e2e 與既有程式都是用 massage-gear／massage-menu 找按摩頁那顆，不能改名。

// 翻譯 key 寫成字面值：tests/check.js 靠掃字串找「有人用的 key」，拼出來的它看不到
const FINGER_I18N = {
  thumb: 'finger-thumb', index: 'finger-index', middle: 'finger-middle', ring: 'finger-ring',
};

/**
 * @param prefix  'locate' | 'massage'
 * @param opts.flip   選單頂端要不要有「切換鏡頭」
 * @param opts.flipFn 切換鏡頭呼叫的函式名
 * @param opts.discFn 信心圓盤開關呼叫的函式名
 * @param opts.skipFn 跳過這一穴呼叫的函式名
 */
function sessionGearHtml(prefix, opts) {
  const flip = opts.flip
    ? `<button type="button" role="menuitem" onclick="${opts.flipFn}()" data-i18n="btn-flip">切換鏡頭</button>`
    : '';
  return `
    <button class="gear-btn" id="${prefix}-gear" onclick="toggleGearMenu(event, '${prefix}')"
            aria-haspopup="true" aria-expanded="false">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <!-- 2026-09-25 用戶：舊的（圓＋八根放射線）像太陽 → 改成八齒齒輪外框＋中心孔。
             齒外半徑 10、齒根 7.4，App SessionGear.kt 用同一組數字畫。 -->
        <path d="M10.08 4.85L10.44 2.12L13.56 2.12L13.92 4.85L15.7 5.59L17.88 3.91L20.09 6.12L18.41 8.3L19.15 10.08L21.88 10.44L21.88 13.56L19.15 13.92L18.41 15.7L20.09 17.88L17.88 20.09L15.7 18.41L13.92 19.15L13.56 21.88L10.44 21.88L10.08 19.15L8.3 18.41L6.12 20.09L3.91 17.88L5.59 15.7L4.85 13.92L2.12 13.56L2.12 10.44L4.85 10.08L5.59 8.3L3.91 6.12L6.12 3.91L8.3 5.59Z"/>
        <circle cx="12" cy="12" r="3.2"/>
      </svg>
    </button>
    <div class="gear-menu" id="${prefix}-menu" hidden role="menu">
      <div class="finger-pick" role="group" aria-labelledby="${prefix}-finger-title">
        <p class="finger-title" id="${prefix}-finger-title" data-i18n="menu-fingers">按摩手指</p>
        <div class="finger-chips">
          ${FINGER_ORDER.map(f =>
            `<button type="button" class="finger-chip" data-finger="${f}" aria-pressed="false"
                     onclick="toggleFingerChip(event, '${f}')" data-i18n="${FINGER_I18N[f]}">${f}</button>`).join('')}
        </div>
      </div>
      <hr>
      ${flip}
      <button type="button" role="menuitem" data-disc-label onclick="${opts.discFn}()">隱藏信心圓盤</button>
      <button type="button" role="menuitem" data-advance-label onclick="toggleAutoAdvance()">換穴：自動</button>
      <button type="button" role="menuitem" data-presscheck-label onclick="togglePressCheck()">按壓判定：開</button>
      <hr>
      <button type="button" role="menuitem" class="danger" onclick="${opts.skipFn}()">
        <span data-i18n="menu-end-early">跳過這一穴</span>
        <small data-i18n="menu-end-early-desc">這一穴不算完成</small>
      </button>
    </div>`;
}

// ── 開關 ──────────────────────────────────────────────────────────
function toggleGearMenu(e, prefix) {
  // 擋掉冒泡，否則這一下會馬上被下面的「點別處就關」接到，選單開了又關
  if (e) e.stopPropagation();
  const menu = document.getElementById(prefix + '-menu');
  if (!menu) return;
  menu.hidden ? openGearMenu(prefix) : closeGearMenu(prefix);
}

function openGearMenu(prefix) {
  syncFingerChips();
  syncPressCheckLabels();
  document.getElementById(prefix + '-menu').hidden = false;
  document.getElementById(prefix + '-gear').setAttribute('aria-expanded', 'true');
  gearOpenPrefix = prefix;
  document.addEventListener('click', onDocClickCloseGear);
}

function closeGearMenu(prefix) {
  const menu = document.getElementById(prefix + '-menu');
  if (menu) menu.hidden = true;
  const gear = document.getElementById(prefix + '-gear');
  if (gear) {
    gear.setAttribute('aria-expanded', 'false');
    gear.setAttribute('aria-label', t('menu-open'));
  }
  if (gearOpenPrefix === prefix) gearOpenPrefix = null;
  document.removeEventListener('click', onDocClickCloseGear);
}

let gearOpenPrefix = null;
function onDocClickCloseGear(e) {
  const p = gearOpenPrefix;
  if (!p) return;
  const menu = document.getElementById(p + '-menu');
  const gear = document.getElementById(p + '-gear');
  if (menu && !menu.contains(e.target) && gear && !gear.contains(e.target)) closeGearMenu(p);
}

// ── 按摩手指 ─────────────────────────────────────────────────────
// 點手指**不關選單**：常常是一次要勾兩三根，每點一下就收起來很煩。
function toggleFingerChip(e, finger) {
  if (e) e.stopPropagation();
  const on = !pressFingers.includes(finger);
  if (!setPressFinger(finger, on)) {
    // 最後一根不能取消 —— 一根都不收，按摩頁就永遠不會扣秒
    alert(t('finger-need-one'));
  }
  syncFingerChips();
}

// ── 按壓判定開關 ─────────────────────────────────────────────────
// 關掉時手指選擇沒意義，但不藏：之後打開還是照原本勾的。
function togglePressCheck() {
  setPressCheck(!pressCheck);
  if (!pressCheck && typeof onPressCheckOff === 'function') onPressCheckOff();   // 計時中關掉 → 也給 3 秒準備
  syncPressCheckLabels();
  if (gearOpenPrefix) closeGearMenu(gearOpenPrefix);
}

function syncPressCheckLabels() {
  document.querySelectorAll('[data-presscheck-label]').forEach(el => {
    el.textContent = t(pressCheck ? 'menu-press-on' : 'menu-press-off');
  });
}

function syncFingerChips() {
  document.querySelectorAll('.finger-chip').forEach(b => {
    const on = pressFingers.includes(b.getAttribute('data-finger'));
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}
