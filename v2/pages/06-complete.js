// ══ 完成 / 慶祝 ══════════════════════════════════════════════════
// 按完（或跳過）一穴都會先到這頁。按滿的由這一穴的專屬小人落地慶祝，跳過的沒有小人。
// 2026-09-24 起**不寫任何紀錄**（網頁不做連續天數／等級／收集，見 js/state.js 開頭）。
//
// 2026-09-25（網頁v2 批 D）照 App CompleteScreen：
//   · 標題「這一穴完成」／「這一穴跳過了」＋ 一句說明；穴名改放在下面的穴名條（色點＋穴名）。
//     App 穴名條右側有秒數、下面有「累計／連續天數」兩格 —— 網頁不放（不存紀錄、不顯示時間）。
//   · 小人 96px 從下方落地彈一下（只一次），不再有圓形色塊徽章。
//   · 自動換穴開著、且不是最後一穴：倒數 4 秒自動接下一穴（以前自動模式直接跳過這頁）。
//   · 按鈕只剩「下一穴」（最後一穴不出現）＋「結束並看總結」。

let lastCompleted = null;   // 剛完成（或跳過）的那一穴：{ name, skipped }

/** 自動換穴時，完成頁停幾秒再接下一穴（同 App AUTO_NEXT_SEC） */
const AUTO_NEXT_SEC = 4;
let autoNextTimer = null;
let autoNextLeft = 0;

function stopAutoNext() {
  if (autoNextTimer) { clearInterval(autoNextTimer); autoNextTimer = null; }
}

registerPage('complete', {
  tab: 'home',
  onEnter: () => renderComplete(),
  onLeave: () => stopAutoNext(),
  onLanguage: () => { renderCompleteText(); renderAutoNext(); },

  html: `
  <div id="page-complete" class="page">
    <style>
      .done-minion { display: flex; justify-content: center; }
      .done-minion img { width: 96px; height: 96px; object-fit: contain; display: block; }
      /* 落地 → 輕輕彈一下（App：tween 620ms、overshoot 曲線、從下方 26dp）。只播一次。 */
      @media (prefers-reduced-motion: no-preference) {
        .done-minion.land img { animation: done-land .62s cubic-bezier(.2, 1.5, .4, 1) both; }
        @keyframes done-land { from { translate: 0 26px; } to { translate: 0 0; } }
      }
      .done-bar {
        display: flex; align-items: center; gap: 10px;
        padding: 14px; border: 1px solid var(--brass); border-radius: var(--r);
        background: var(--surface-2);
      }
      .done-bar .dot { width: 14px; height: 14px; border-radius: 50%; flex: none; }
      .done-bar .nm { font-family: var(--font-ming); font-size: 1.25rem; letter-spacing: .04em; }
      .auto-next { color: var(--ink-soft); font-size: 0.8125rem; }
      #page-complete [hidden] { display: none !important; }
    </style>

    <div class="stack">
      <div>
        <p class="eyebrow" data-i18n="eyebrow-complete">完成</p>
        <h2 id="complete-title"></h2>
        <p class="lede" id="complete-desc"></p>
      </div>
      <div class="done-minion" id="done-minion" aria-hidden="true"></div>
      <div class="done-bar">
        <span class="dot" id="complete-dot"></span>
        <span class="nm" id="complete-acu"></span>
      </div>
      <p class="auto-next" id="complete-auto-next" hidden></p>
      <button class="btn" id="btn-next-acu" onclick="goToNextAcu()" data-i18n="btn-next-acu">下一穴</button>
      <button class="btn ghost" onclick="showPage('summary')" data-i18n="btn-finish">結束並看總結</button>
    </div>
  </div>`,
});

/**
 * 按滿或跳過之後都走這裡（App：按摩頁 onComplete 一律到完成頁，批 72）。
 * 呼叫前要先把這一穴 push 進 sessionLog（completed 標好）。
 */
function completeMassage(skipped) {
  lastCompleted = { name: curAcuName(), skipped: !!skipped };
  showPage('complete');
}

const completeIsLast = () => state.currentAcupointIndex >= state.selectedAcupoints.length - 1;

function renderComplete() {
  stopAutoNext();
  if (!lastCompleted) { goHome(); return; }
  const { name, skipped } = lastCompleted;

  renderCompleteText();
  document.getElementById('complete-dot').style.background = itemColor(name);

  // 小人是獎勵：跳過就不給（App 同）。換一穴就重播一次落地。
  const box = document.getElementById('done-minion');
  box.classList.remove('land');
  box.replaceChildren();
  if (!skipped) {
    const img = celebrantImg(name, 0);
    img.className = '';
    box.appendChild(img);
    void box.offsetWidth;
    box.classList.add('land');
  }

  const isLast = completeIsLast();
  document.getElementById('btn-next-acu').hidden = isLast;

  // 自動換穴：最後一穴不自動走，讓人自己按「結束並看總結」
  if (!isLast && flow.autoAdvance) {
    autoNextLeft = AUTO_NEXT_SEC;
    autoNextTimer = setInterval(() => {
      autoNextLeft--;
      if (autoNextLeft <= 0) { stopAutoNext(); goToNextAcu(); return; }
      renderAutoNext();
    }, 1000);
  }
  renderAutoNext();
}

function renderCompleteText() {
  if (!lastCompleted) return;
  const { name, skipped } = lastCompleted;
  document.getElementById('complete-title').textContent = t(skipped ? 'complete-title-skipped' : 'complete-title');
  document.getElementById('complete-desc').textContent = t(skipped ? 'complete-desc-skipped' : 'complete-desc');
  document.getElementById('complete-acu').textContent = itemLabel(name);
}

function renderAutoNext() {
  const el = document.getElementById('complete-auto-next');
  if (!el) return;
  el.hidden = !autoNextTimer;
  if (autoNextTimer) el.textContent = t('complete-auto-next').replace('{n}', autoNextLeft);
}

function goToNextAcu() {
  stopAutoNext();
  if (!completeIsLast()) {
    state.currentAcupointIndex++;
    showPage('acu-detail');
  } else {
    showPage('summary');
  }
}
