// ══ 設定 › 每日提醒 ═══════════════════════════════════════════════
//
// 三件事：要不要提醒、幾點提醒、提醒你按什麼。
//
// 「提醒你按什麼」分三種：
//   none      只提醒你來按，不指定
//   symptom   指定幾個症狀 → 點提醒會幫你把症狀勾好，落在推薦穴道那頁
//   acupoint  直接指定幾個穴道 → 點提醒直接排成今天的療程，落在認穴頁
//
// ⚠️ 誠實邊界：這一版沒有背景排程（沒有 Service Worker，也不是原生 App），
//    提醒只在網頁開著時會響。畫面上直接寫明，不做成看起來像系統提醒的樣子。
//    急症（昏迷急救／中暑）刻意不列進來 —— 那種情況要打 119，不是排程按摩。

registerPage('settings-notify', {
  tab: 'settings',
  backTo: 'settings',
  onEnter: () => renderNotifyPage(),
  onLanguage: () => renderNotifyPage(),

  html: `
  <div id="page-settings-notify" class="page">
    <style>
      #notify-time-row { display: flex; align-items: center; gap: 10px; padding: 11px 12px; }
      #notify-time-row .grow { flex: 1; font-size: 13.5px; }
      #notify-time {
        font-family: var(--font-mono); font-size: 14px;
        background: var(--surface); color: var(--ink);
        border: 1px solid var(--line); border-radius: var(--r); padding: 5px 7px;
      }
      #notify-plan-body { margin-top: 8px; }
      #notify-plan-body:empty { display: none; }
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

      <div>
        <p class="small" data-i18n="settings-notify-plan">提醒內容</p>
        <div class="seg" id="notify-mode-seg">
          <button type="button" data-mode="none" onclick="setNotifyMode('none')"
                  data-i18n="settings-notify-mode-none">不指定</button>
          <button type="button" data-mode="symptom" onclick="setNotifyMode('symptom')"
                  data-i18n="settings-notify-mode-symptom">依症狀</button>
          <button type="button" data-mode="acupoint" onclick="setNotifyMode('acupoint')"
                  data-i18n="settings-notify-mode-acupoint">直接選穴道</button>
        </div>
        <p class="small" id="notify-mode-desc"></p>
        <div id="notify-plan-body"></div>
      </div>

      <p class="notice" data-i18n="settings-notify-limit">提醒只在這個網頁開著的時候會響。瀏覽器關掉之後系統不會叫你——這一版沒有背景排程，我們不假裝有。</p>
    </div>
  </div>`,
});

// ── 畫面 ──────────────────────────────────────────────────────────
// key 寫成字面值而不是 't("...-" + mode)"：靜態檢查靠字面比對抓死掉的翻譯
const NOTIFY_MODE_DESC = {
  none:     'settings-notify-desc-none',
  symptom:  'settings-notify-desc-symptom',
  acupoint: 'settings-notify-desc-acupoint',
};

function renderNotifyPage() {
  const p = notifyPlan();
  document.getElementById('notify-enable').checked = jget(LS.notify, false);
  document.getElementById('notify-time').value = notifyTime();

  document.querySelectorAll('#notify-mode-seg button').forEach(b => {
    const on = b.getAttribute('data-mode') === p.mode;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  });
  document.getElementById('notify-mode-desc').textContent = t(NOTIFY_MODE_DESC[p.mode]);
  document.getElementById('notify-plan-body').innerHTML =
    p.mode === 'symptom'  ? notifySymptomList(p)
  : p.mode === 'acupoint' ? notifyAcuList(p)
  : '';
}

// 急症不列：排程「明天晚上八點來按中暑」本身就是錯的訊息
function notifySymptomList(p) {
  const rows = SYMPTOM_MAP
    .map((s, idx) => ({ s, idx }))
    .filter(({ s }) => !EMERGENCY_SYMPTOMS.has(s.name))
    .map(({ s, idx }) => `
      <label>
        <input type="checkbox" ${p.symptoms.includes(s.name) ? 'checked' : ''}
               onchange="toggleNotifySymptom(${idx})">
        <span class="grow">${symptomLabel(s.name)}</span>
      </label>`).join('');
  return `<div class="optlist">${rows}</div>
          <p class="small">${t('settings-notify-emergency')}</p>`;
}

// 只列已經算得出位置的穴道 —— 排一個按下去定位不了的穴，等於自己排一個失敗
function notifyAcuList(p) {
  const rows = ACUPOINTS
    .map((a, idx) => ({ a, idx }))
    .filter(({ a }) => IMPLEMENTED.has(a.name))
    .map(({ a, idx }) => `
      <label>
        <input type="checkbox" ${p.acupoints.includes(a.name) ? 'checked' : ''}
               onchange="toggleNotifyAcu(${idx})">
        <span class="grow">${acuLabel(a.name)}</span>
      </label>`).join('');
  return `<div class="optlist">${rows}</div>`;
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

function setNotifyMode(mode) {
  const p = notifyPlan();
  p.mode = mode;
  saveNotifyPlan(p);
  renderNotifyPage();
}

function toggleNotifySymptom(idx) {
  const name = SYMPTOM_MAP[idx].name;
  const p = notifyPlan();
  p.symptoms = p.symptoms.includes(name) ? p.symptoms.filter(n => n !== name) : [...p.symptoms, name];
  saveNotifyPlan(p);
}

function toggleNotifyAcu(idx) {
  const name = ACUPOINTS[idx].name;
  const p = notifyPlan();
  p.acupoints = p.acupoints.includes(name) ? p.acupoints.filter(n => n !== name) : [...p.acupoints, name];
  saveNotifyPlan(p);
}

// ── 摘要（設定目錄那一列的灰字，也是通知的內文）───────────────────
function notifySummary() {
  if (!jget(LS.notify, false)) return t('settings-notify-off');
  return notifyTime() + ' · ' + notifyPlanText();
}

function notifyPlanText() {
  const p = notifyPlan();
  const list = p.mode === 'symptom'  ? p.symptoms.map(symptomLabel)
             : p.mode === 'acupoint' ? p.acupoints.map(acuLabel)
             : [];
  if (!list.length) return t('settings-notify-mode-none');
  return list.length === 1 ? list[0] : `${list[0]} +${list.length - 1}`;
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
    body: notifyPlanText(),
    tag: 'acunavi-daily',        // 同一個 tag：漏看幾天也不會堆一疊通知
  });
  n.onclick = () => { window.focus(); startNotifyPlan(); };
}

// 點了通知之後要落在哪一頁。刻意不自動開始按摩：
// 幫你把東西準備好，但「開始」還是你自己按。
function startNotifyPlan() {
  const p = notifyPlan();

  if (p.mode === 'acupoint' && p.acupoints.length) {
    state.selectedAcupoints = p.acupoints.filter(n => IMPLEMENTED.has(n));
    if (state.selectedAcupoints.length) { goToAcuDetail(); return; }
  }
  if (p.mode === 'symptom' && p.symptoms.length) {
    state.selectedSymptoms = p.symptoms
      .map(n => SYMPTOM_MAP.findIndex(s => s.name === n))
      .filter(i => i >= 0);
    if (state.selectedSymptoms.length) { goToRecommendation(); return; }
  }
  goHome();
}

// 開站就排一次：使用者上次設好的提醒，這次打開網頁要繼續有效
document.addEventListener('DOMContentLoaded', scheduleReminder);
