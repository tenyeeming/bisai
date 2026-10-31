// ══ 設定 › 每日提醒 ═══════════════════════════════════════════════
//
// 2026-10-31 照 App 批 112：只剩「要不要提醒」「幾點提醒」兩件事。
//   用戶（對 App）：「提醒內容如下面全部刪掉」。以前存的 notifyPlan 沒刪，但不再讀它：
//   通知一律是「該按摩了」，點了回首頁（App 那邊舊內容會照舊帶著，網頁這裡直接不用）。
//
// 以下是 2026-10-31 以前的設計（留著當歷史）：三件事：要不要提醒、幾點提醒、提醒你按什麼。
//
// 「提醒你按什麼」分三種：
//   none      只提醒你來按，不指定
//   symptom   指定幾個症狀 → 點提醒會幫你把症狀勾好，落在推薦穴道那頁
//   acupoint  直接指定幾個穴道 → 點提醒直接排成今天的療程，落在認穴頁
//
// ⚠️ 誠實邊界：這一版沒有背景排程（沒有 Service Worker，也不是原生 App），
//    提醒只在網頁開著時會響。畫面上直接寫明，不做成看起來像系統提醒的樣子。

registerPage('settings-notify', {
  tab: 'settings',
  backTo: 'settings',
  onEnter: () => renderNotifyPage(),
  onLanguage: () => renderNotifyPage(),

  html: `
  <div id="page-settings-notify" class="page">
    <style>
      #notify-time-row { display: flex; align-items: center; gap: 10px; padding: 11px 12px; }
      #notify-time-row .grow { flex: 1; font-size: 0.84375rem; }
      #notify-time {
        font-family: var(--font-mono); font-size: 0.875rem;
        background: var(--surface); color: var(--ink);
        border: 1px solid var(--line); border-radius: var(--r); padding: 5px 7px;
      }
    </style>

    <div class="stack">
      <div>
        <p class="eyebrow" data-i18n="eyebrow-settings">校正</p>
        <h2 data-i18n="settings-notify">每日提醒</h2>
      </div>

      <div class="optlist">
        <label>
          <input type="checkbox" id="notify-enable" onchange="onNotifyChange(this.checked)">
          <span class="grow" data-i18n="settings-notify-enable">啟用每日提醒</span>
        </label>
        <div id="notify-time-row">
          <span class="grow" data-i18n="settings-notify-time">提醒時間</span>
          <input type="time" id="notify-time" onchange="onNotifyTimeChange(this.value)">
        </div>
      </div>

      <p class="notice" data-i18n="settings-notify-limit">提醒只在這個網頁開著的時候會響。瀏覽器關掉之後系統不會叫你——這一版沒有背景排程，我們不假裝有。</p>
    </div>
  </div>`,
});

// ── 畫面 ──────────────────────────────────────────────────────────
function renderNotifyPage() {
  document.getElementById('notify-enable').checked = jget(LS.notify, false);
  document.getElementById('notify-time').value = notifyTime();
}

// ── 存檔 ──────────────────────────────────────────────────────────
function onNotifyChange(on) {
  localStorage.setItem(LS.notify, JSON.stringify(on));
  if (on && typeof Notification !== 'undefined' && Notification.permission === 'default') {
    Notification.requestPermission();
  }
  scheduleReminder();
}

function onNotifyTimeChange(v) {
  if (!/^\d{2}:\d{2}$/.test(v)) return;      // 清空輸入框時瀏覽器會給空字串
  localStorage.setItem(LS.notifyTime, v);
  scheduleReminder();
}

// ── 摘要（設定目錄那一列的灰字，也是通知的內文）───────────────────
// 同 App：目錄那一列只寫時間
function notifySummary() {
  return jget(LS.notify, false) ? notifyTime() : t('settings-notify-off');
}

// ── 排程 ──────────────────────────────────────────────────────────
// 只排「下一次」，響完再排下一次。用 setTimeout 不用 setInterval，
// 因為換日、改時間、關掉再開都只要重排一次就對，不必自己算漂移。
let reminderTimer = null;

function scheduleReminder() {
  if (reminderTimer) { clearTimeout(reminderTimer); reminderTimer = null; }
  if (!jget(LS.notify, false)) return;

  const [hh, mm] = notifyTime().split(':').map(Number);
  const now = new Date();
  const at = new Date(now);
  at.setHours(hh, mm, 0, 0);
  if (at <= now) at.setDate(at.getDate() + 1);   // 今天這個點過了就約明天

  reminderTimer = setTimeout(() => { fireReminder(); scheduleReminder(); }, at - now);
}

function fireReminder() {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const n = new Notification(isZh() ? 'AcuNavi · 該按摩了' : 'AcuNavi · Time to massage', {
    body: isZh() ? '花幾分鐘按一按，打開 AcuNavi 開始' : 'Take a few minutes — open AcuNavi to start',
    tag: 'acunavi-daily',        // 同一個 tag：漏看幾天也不會堆一疊通知
  });
  n.onclick = () => { window.focus(); goHome(); };
}

// 開站就排一次：使用者上次設好的提醒，這次打開網頁要繼續有效
document.addEventListener('DOMContentLoaded', scheduleReminder);
