// ══ 總結（2026-09-02）══════════════════════════════════════════════
//
// 全部穴道都按完才會到這頁。單穴的完成頁（06-complete）在自動模式下不停留，
// 小人慶祝改在這裡一次看完 —— 使用者要的是「按完自己接下去」，
// 中間每一穴都停一次會把那個流暢感打斷。
//
// 資料來自 sessionLog（js/state.js），只記這一次療程，關掉分頁就沒了。
//
// 2026-09-24（用戶）：拿掉各穴時間、總時長、連續天數、Lv. 標籤。
//   這頁只剩「今天按了哪些」＋ 那幾穴的小人出來慶祝。

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
      #summary-list .ok {
        margin-left: auto; color: var(--accent-text); font-size: 0.875rem;
      }
    </style>

    <div class="stack">
      <div>
        <p class="eyebrow" data-i18n="eyebrow-summary">療程總結</p>
        <h2 data-i18n="summary-title">今天按了這些</h2>
      </div>

      <div id="summary-stage" class="reward-stage" aria-hidden="true"></div>
      <div id="summary-list"></div>

      <div class="btn-row">
        <button class="btn" onclick="goHome()" data-i18n="btn-home">回首頁</button>
        <button class="btn ghost" onclick="showPage('gallery')" data-i18n="btn-gallery">圖冊</button>
      </div>
    </div>
  </div>`,
});

let celebratedSession = null;
let celebratedEntries = 0;

function renderSummary() {
  const list = document.getElementById('summary-list');
  if (!list) return;

  // 沒紀錄還跑到這頁（例如重新整理），回首頁比顯示一張空表誠實
  if (!sessionLog.length) { goHome(); return; }

  // 保險起見去重：同一穴只列一次、只站一隻
  const names = [...new Set(sessionLog.map(r => r.name))];
  list.innerHTML = names.map(n => `
    <div class="row">
      <span class="dot" style="background:${acuColor(n)}"></span>
      <span class="nm">${itemLabel(n)}</span>
      <span class="ok" aria-label="${isZh() ? '完成' : 'done'}">✓</span>
    </div>`).join('');

  // 只有第一次進來才跳；回到這頁、切語言都只重繪，不重播慶祝。
  const firstVisit = celebratedSession !== sessionLog || celebratedEntries !== sessionLog.length;
  renderRewardStage('summary-stage', firstVisit, names);
  celebratedSession = sessionLog;
  celebratedEntries = sessionLog.length;
}
