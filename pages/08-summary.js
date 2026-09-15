// ══ 總結（2026-09-02）══════════════════════════════════════════════
//
// 全部穴道都按完才會到這頁。單穴的完成頁（06-complete）在自動模式下不停留，
// 小人獎勵改在這裡一次看完 —— 使用者要的是「按完自己接下去」，
// 中間每一穴都停一次會把那個流暢感打斷。
//
// 資料來自 sessionLog（js/state.js），只記這一次療程，關掉分頁就沒了。
// 長期紀錄（圖冊、連續天數）仍然由 06-complete.js 的 completeMassage() 寫入。
//
// ⚠️ 時間是「實際按滿的秒數」不是「經過的秒數」——
//    計時只在指尖真的對準時前進，所以這個數字是有意義的，不是碼錶。

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
        font-family: var(--font-ming); font-size: 15px; letter-spacing: .04em;
      }
      #summary-list .sec {
        margin-left: auto;
        font-family: var(--font-mono); font-size: 13px; color: var(--ink-soft);
        font-variant-numeric: tabular-nums;
      }
      .total {
        display: flex; align-items: baseline; gap: 10px;
        border: 1px solid var(--brass); border-radius: var(--r);
        background: var(--surface-2); padding: 13px 14px;
      }
      .total .k {
        font-family: var(--font-mono); font-size: 10px; letter-spacing: .16em;
        text-transform: uppercase; color: var(--brass);
      }
      .total .v {
        margin-left: auto;
        font-family: var(--font-mono); font-size: 30px; font-weight: 600;
        color: var(--ink); font-variant-numeric: tabular-nums; line-height: 1;
      }
    </style>

    <div class="stack">
      <div>
        <p class="eyebrow" data-i18n="eyebrow-summary">療程總結</p>
        <h2 data-i18n="summary-title">今天按了這些</h2>
      </div>

      <div id="summary-list"></div>

      <div class="total">
        <span class="k" data-i18n="summary-total">總時長</span>
        <span class="v" id="summary-total">0:00</span>
      </div>

      <p class="hint mono-sm" data-i18n="summary-note">時間只計「指尖真的對準穴道」的秒數，離開穴道時計時是停住的。</p>

      <div class="btn-row">
        <button class="btn" onclick="goHome()" data-i18n="btn-home">回首頁</button>
        <button class="btn ghost" onclick="showPage('gallery')" data-i18n="btn-gallery">圖冊</button>
      </div>
    </div>
  </div>`,
});

// mm:ss。超過一小時不處理 —— 一次療程按到一小時的話，問題不在這個函式
function fmtDuration(ms) {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function renderSummary() {
  const list = document.getElementById('summary-list');
  if (!list) return;

  // 沒紀錄還跑到這頁（例如重新整理），回首頁比顯示一張空表誠實
  if (!sessionLog.length) { goHome(); return; }

  list.innerHTML = sessionLog.map(r => `
    <div class="row">
      <span class="dot" style="background:${acuColor(r.name)}"></span>
      <span class="nm">${acuLabel(r.name)}</span>
      <span class="sec">${fmtDuration(r.ms)}</span>
    </div>`).join('');

  document.getElementById('summary-total').textContent =
    fmtDuration(sessionLog.reduce((a, r) => a + r.ms, 0));
}
