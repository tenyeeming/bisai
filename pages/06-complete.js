// ══ 完成 / 獎勵 ══════════════════════════════════════════════════
// 這頁是唯一會寫入長期紀錄的地方：按滿計時才算數，中途離開不計。

let lastCompleted = null;   // 剛完成的那一穴，給這頁顯示用

registerPage('complete', {
  tab: 'home',
  onEnter: () => renderComplete(),
  onLanguage: () => renderComplete(),

  html: `
  <div id="page-complete" class="page">
    <style>
      .badge {
        position: relative;
        width: 118px; height: 118px; border-radius: 50%;
        margin: 16px auto 22px;
        display: flex; align-items: center; justify-content: center;
        border: 2px solid rgba(255,255,255,.25);
      }
      .badge .minion { width: 84%; height: auto; display: block; }
      .badge .lv {
        position: absolute; bottom: -9px; left: 50%; transform: translateX(-50%);
        font-family: var(--font-mono); font-size: 12px; font-weight: 700;
        color: #fff; padding: 2px 9px; border-radius: 999px;
        border: 1px solid rgba(255,255,255,.3);
      }
      @media (prefers-reduced-motion: no-preference) {
        .badge { animation: stamp .45s cubic-bezier(.2,.9,.3,1.3); }
        @keyframes stamp { from { transform: scale(.4); opacity: 0; } to { transform: none; opacity: 1; } }
      }
    </style>

    <div class="stack center">
      <div>
        <p class="eyebrow" data-i18n="eyebrow-complete">完成</p>
        <h2 id="complete-acu" class="acu-title"></h2>
      </div>
      <div class="badge" id="minion-badge"></div>
      <p class="small" id="complete-level"></p>
      <p class="mono-sm" id="complete-streak"></p>
      <div class="btn-row">
        <button class="btn" id="btn-next-acu" onclick="goToNextAcu()" data-i18n="btn-next-acu">下一穴</button>
        <button class="btn ghost" onclick="goHome()" data-i18n="btn-home">回首頁</button>
        <button class="btn ghost" onclick="showPage('gallery')" data-i18n="btn-gallery">圖冊</button>
      </div>
    </div>
  </div>`,
});

function completeMassage() {
  const name = curAcuName();
  const today = todayStr();

  if (!state.history[name]) state.history[name] = { times: 0, lastDate: null };
  state.history[name].times++;
  state.history[name].lastDate = today;

  if (!state.minions[name]) state.minions[name] = { level: 1, times: 0 };
  const m = state.minions[name];
  m.times++;
  m.level = m.times >= 20 ? 3 : m.times >= 5 ? 2 : 1;   // 升級門檻：5 次 → Lv2，20 次 → Lv3

  // 連續天數：只有「昨天有做」才 +1，同一天重複不加，中斷就歸 1
  if (state.streak.date !== today) {
    state.streak.count = (state.streak.date && daysBetween(state.streak.date, today) === 1)
      ? (state.streak.count || 0) + 1 : 1;
    state.streak.date = today;
  }
  if (!state.streak.count) state.streak.count = 1;

  saveState();

  lastCompleted = { name, level: m.level, times: m.times, streak: state.streak.count };
  showPage('complete');
}

function renderComplete() {
  if (!lastCompleted) { goHome(); return; }
  const { name, level, times, streak } = lastCompleted;

  document.getElementById('complete-acu').textContent = acuLabel(name);

  const badge = document.getElementById('minion-badge');
  badge.innerHTML = '';
  badge.style.background = acuColor(name);
  const lv = document.createElement('span');
  lv.className = 'lv';
  lv.textContent = 'Lv.' + level;
  lv.style.background = acuColor(name);
  badge.append(minionImg(name), lv);

  document.getElementById('complete-level').textContent = isZh()
    ? `${acuLabel(name)}小人 Lv.${level}　累計 ${times} 次`
    : `${acuLabel(name)} minion Lv.${level} · ${times} sessions`;
  document.getElementById('complete-streak').textContent = isZh()
    ? `連續第 ${streak} 天` : `${streak}-DAY STREAK`;

  // 最後一穴就沒有「下一穴」可按
  const isLast = state.currentAcupointIndex >= state.selectedAcupoints.length - 1;
  document.getElementById('btn-next-acu').style.display = isLast ? 'none' : '';
}

function goToNextAcu() {
  if (state.currentAcupointIndex < state.selectedAcupoints.length - 1) {
    state.currentAcupointIndex++;
    showPage('acu-detail');
  } else {
    alert(isZh() ? '今日療程完成！' : 'Today\'s treatment complete!');
    goHome();
  }
}
