// ══ 總結（2026-09-02）══════════════════════════════════════════════
//
// 療程結束（完成頁按「結束並看總結」，或最後一穴按完）來到這頁。
// 資料來自 sessionLog（js/state.js），只記這一次療程，關掉分頁就沒了。
//
// 2026-09-24（用戶）：拿掉各穴時間、總時長、連續天數、Lv. 標籤。
// 2026-09-25（網頁v2 批 D）照 App SummaryScreen：
//   · 沒有標題 —— 最上面直接是小人舞台（只站按滿的穴，按最久的排前面）＋整頁撒紙屑。
//   · 清單列出這次每一穴：按滿的打 ✓，跳過的標「跳過」（不然這張清單就是在報假帳）。
//     App 右側有 mm:ss —— 網頁不放時間（批 68）。
//   · 一穴都沒有（例如重新整理）顯示「這次沒有完成任何一穴。」，不再直接跳回首頁。
//   · 「回首頁」「圖冊」都會清掉這次療程（App 同：不清的話返回總結頁會再慶祝一次）。

registerPage('summary', {
  tab: 'home',

  onEnter: () => renderSummary(),
  onLanguage: () => renderSummary(),

  html: `
  <div id="page-summary" class="page">
    <style>
      #summary-list {
        border: 1px solid var(--line); border-radius: var(--r);
        overflow: hidden; background: var(--surface);
      }
      #summary-list[hidden], #summary-empty[hidden] { display: none; }
      #summary-list .row {
        display: flex; align-items: center; gap: 10px;
        padding: 11px 13px; border-top: 1px solid var(--line-soft);
      }
      #summary-list .row:first-child { border-top: 0; }
      #summary-list .dot {
        width: 9px; height: 9px; border-radius: 50%; flex: none;
      }
      #summary-list .nm {
        font-family: var(--font-ming); font-size: 0.9375rem; letter-spacing: .04em;
      }
      #summary-list .skip { color: var(--brass); font-size: 0.75rem; letter-spacing: .08em; }
      #summary-list .ok {
        margin-left: auto; color: var(--accent-text); font-size: 0.875rem;
      }
    </style>

    <div class="stack">
      <div id="summary-stage" class="reward-stage" aria-hidden="true"></div>
      <p class="notice" id="summary-empty" data-i18n="summary-empty" hidden>這次沒有完成任何一穴。</p>
      <div id="summary-list"></div>

      <button class="btn" onclick="leaveSummary('home')" data-i18n="btn-home">回首頁</button>
      <button class="btn ghost" onclick="leaveSummary('gallery')" data-i18n="btn-gallery">圖冊</button>
    </div>
  </div>`,
});

let celebratedSession = null;
let celebratedEntries = 0;

/** 同一穴只列一次（保險）：留最後一筆 —— 跳過後又回來按滿，算按滿 */
function summaryEntries() {
  const byName = new Map();
  sessionLog.forEach(r => { byName.delete(r.name); byName.set(r.name, r); });
  return [...byName.values()];
}

function renderSummary() {
  const list = document.getElementById('summary-list');
  if (!list) return;

  const entries = summaryEntries();
  const empty = document.getElementById('summary-empty');
  empty.hidden = entries.length > 0;
  list.hidden = !entries.length;

  list.innerHTML = entries.map(r => {
    const skipped = r.completed === false;
    return `
    <div class="row">
      <span class="dot" style="background:${itemColor(r.name)}"></span>
      <span class="nm">${itemLabel(r.name)}</span>
      ${skipped ? `<span class="skip">${t('summary-skipped')}</span>` : ''}
      ${skipped ? '' : `<span class="ok" aria-label="${isZh() ? '完成' : 'done'}">✓</span>`}
    </div>`;
  }).join('');

  // 舞台只站按滿的，按最久的排前面（App 同）
  const done = entries.filter(r => r.completed !== false)
    .sort((a, b) => (b.ms || 0) - (a.ms || 0))
    .map(r => r.name);
  const seed = sessionLog.length * 1000 + Math.round(sessionLog.reduce((s, r) => s + (r.ms || 0), 0) / 1000);

  // 只有第一次進來才跳、才撒紙屑；回到這頁、切語言都只重繪，不重播慶祝。
  const firstVisit = celebratedSession !== sessionLog || celebratedEntries !== sessionLog.length;
  renderRewardStage('summary-stage', firstVisit, done, seed);
  if (firstVisit && entries.length) {
    playConfetti([...new Set(entries.map(r => itemColor(r.name)))].concat('#C79A5B'), seed);
  }
  celebratedSession = sessionLog;
  celebratedEntries = sessionLog.length;
}

/** 回首頁／去圖冊：兩個出口都清掉這次療程（goHome 負責清） */
function leaveSummary(page) {
  document.querySelectorAll('.confetti-layer').forEach(el => el.remove());
  goHome();
  if (page !== 'home') showPage(page);
}
