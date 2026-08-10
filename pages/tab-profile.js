// ══ 個人分頁 ═════════════════════════════════════════════════════
// 全部由 state.history / state.minions / state.streak 現算，不另外存一份，
// 免得兩邊對不起來。

registerPage('profile', {
  tab: 'profile',
  onEnter: () => initProfile(),
  onLanguage: () => initProfile(),

  html: `
  <div id="page-profile" class="page">
    <style>
      .stat-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1px;
        background: var(--line);
        border: 1px solid var(--line);
      }
      .stat { background: var(--surface); padding: 12px 13px; }
      .stat .k {
        font-family: var(--font-mono);
        font-size: 9.5px; letter-spacing: .12em; text-transform: uppercase;
        color: var(--ink-soft);
      }
      .stat .v {
        font-family: var(--font-mono);
        font-size: 26px; line-height: 1.15; margin-top: 3px;
        font-variant-numeric: tabular-nums;
        color: var(--ink);
      }
      .stat .u { font-size: 11px; color: var(--ink-soft); margin-left: 3px; }
      .rank-row {
        display: flex; align-items: center; gap: 9px;
        padding: 9px 0; font-size: 13.5px;
        border-bottom: 1px solid var(--line-soft);
      }
      .rank-row:last-child { border-bottom: 0; }
      .rank-dot {
        width: 26px; height: 26px; border-radius: 50%; flex: none;
        display: flex; align-items: center; justify-content: center; overflow: hidden;
      }
      .rank-dot .minion { width: 90%; height: auto; display: block; }
      .rank-n {
        margin-left: auto;
        font-family: var(--font-mono); font-size: 12px;
        font-variant-numeric: tabular-nums; color: var(--ink-soft);
      }
      .empty { color: var(--ink-soft); font-size: 13px; padding: 8px 0; }
    </style>

    <div class="stack">
      <div>
        <p class="eyebrow" data-i18n="eyebrow-profile">紀錄</p>
        <h2 data-i18n="profile-title">個人</h2>
      </div>
      <div class="stat-grid" id="profile-stats"></div>
      <div>
        <p class="eyebrow" data-i18n="profile-top">最常按的穴道</p>
        <div id="profile-rank"></div>
      </div>
      <hr class="rule">
      <div>
        <p class="eyebrow" data-i18n="profile-levels">小人等級分布</p>
        <div id="profile-levels"></div>
      </div>
    </div>
  </div>`,
});

function initProfile() {
  const hist = state.history;
  const names = Object.keys(hist);
  const today = todayStr();

  const total = names.reduce((s, n) => s + (hist[n].times || 0), 0);
  const unlocked = Object.keys(state.minions).length;
  const todayDone = names.filter(n => hist[n].lastDate === today).length;

  // 連續天數要「還活著」才算：最後一次是今天或昨天。斷了就顯示 0，不吃老本
  const st = state.streak;
  const alive = st.date && daysBetween(st.date, today) <= 1;
  const streak = alive ? (st.count || 0) : 0;

  const unit = (zh, en) => `<span class="u">${isZh() ? zh : en}</span>`;
  document.getElementById('profile-stats').innerHTML = [
    [t('stat-streak'),   streak,    unit('天', 'd')],
    [t('stat-total'),    total,     unit('次', 'x')],
    [t('stat-unlocked'), `${unlocked}<span class="u">/${ACUPOINTS.length}</span>`, ''],
    [t('stat-today'),    todayDone, unit('穴', 'pts')],
  ].map(([k, v, u]) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}${u}</div></div>`).join('');

  renderRank(names, hist);
  renderLevels();
}

// 最常按的前三名
function renderRank(names, hist) {
  const box = document.getElementById('profile-rank');
  box.innerHTML = '';

  const rank = names
    .map(n => ({ name: n, times: hist[n].times || 0 }))
    .sort((a, b) => b.times - a.times)
    .slice(0, 3);

  if (!rank.length) {
    box.innerHTML = `<p class="empty">${t('profile-empty')}</p>`;
    return;
  }

  rank.forEach(r => {
    const row = document.createElement('div');
    row.className = 'rank-row';

    const dot = document.createElement('span');
    dot.className = 'rank-dot';
    dot.style.background = acuColor(r.name);   // 圖檔載不到時就是這顆色點
    dot.appendChild(minionImg(r.name));

    const nm = document.createElement('span');
    nm.textContent = acuLabel(r.name);

    const n = document.createElement('span');
    n.className = 'rank-n';
    n.textContent = isZh() ? `${r.times} 次` : `${r.times}x`;

    row.append(dot, nm, n);
    box.appendChild(row);
  });
}

// Lv.1 / Lv.2 / Lv.3 各幾隻
function renderLevels() {
  const lv = [0, 0, 0];
  Object.values(state.minions).forEach(m => { lv[(m.level || 1) - 1]++; });

  document.getElementById('profile-levels').innerHTML = lv.every(c => c === 0)
    ? `<p class="empty">${t('profile-empty')}</p>`
    : lv.map((c, i) =>
        `<div class="rank-row"><span>Lv.${i + 1}</span><span class="rank-n">${c}</span></div>`).join('');
}
