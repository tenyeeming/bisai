// ══ 完成 / 慶祝 ══════════════════════════════════════════════════
// 按滿計時才會來到這頁，由這一穴的專屬小人出來慶祝。
// 2026-09-24 起**不寫任何紀錄**（網頁不做連續天數／等級／收集，見 js/state.js 開頭）。

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
        width: 150px; height: 150px; border-radius: 50%;
        margin: 18px auto 16px;
        display: flex; align-items: center; justify-content: center;
        border: 2px solid rgba(255,255,255,.25);
        overflow: visible;
      }
      .badge .minion, .badge img { width: 88%; height: auto; display: block; }
      .cheer { font-size: 1.0625rem; font-weight: 600; color: var(--ink); }
      /* 蹦出來（stamp）→ 原地跳三下（hop）。減少動態時整段不播，只顯示靜態圖 */
      @media (prefers-reduced-motion: no-preference) {
        .badge { animation: stamp .45s cubic-bezier(.2,.9,.3,1.3); }
        .badge img { animation: cheer-hop .42s ease-in-out .45s 6 alternate; transform-origin: 50% 100%; }
        @keyframes stamp { from { transform: scale(.4); opacity: 0; } to { transform: none; opacity: 1; } }
        @keyframes cheer-hop { from { translate: 0 0; rotate: -4deg; } to { translate: 0 -16px; rotate: 4deg; } }
      }
    </style>

    <div class="stack center">
      <div>
        <p class="eyebrow" data-i18n="eyebrow-complete">完成</p>
        <h2 id="complete-acu" class="acu-title"></h2>
      </div>
      <div class="badge" id="minion-badge"></div>
      <p class="cheer" id="complete-cheer"></p>
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
  lastCompleted = { name };

  // ── 自動模式：不停在完成頁 ────────────────────────────────
  // 使用者要的是「按完自己接下去」，所以小人慶祝改到總結頁一次看完。
  // 手動模式維持原樣：停在這頁，自己按「下一穴」。
  const isLast = state.currentAcupointIndex >= state.selectedAcupoints.length - 1;
  if (flow.autoAdvance) {
    if (isLast) { showPage('summary'); return; }
    state.currentAcupointIndex++;
    showPage('acu-detail');
    return;
  }
  showPage('complete');
}

function renderComplete() {
  if (!lastCompleted) { goHome(); return; }
  const { name } = lastCompleted;

  document.getElementById('complete-acu').textContent = itemLabel(name);

  const badge = document.getElementById('minion-badge');
  badge.innerHTML = '';
  badge.style.background = isFaceItem(name) ? faceColor(name)
    : isForearmItem(name) ? forearmColor(name) : acuColor(name);
  badge.appendChild(celebrantImg(name, 0));
  // 重新觸發動畫：同一節點連續兩次進這頁時，瀏覽器不會自己重播
  badge.style.animation = 'none'; void badge.offsetWidth; badge.style.animation = '';

  document.getElementById('complete-cheer').textContent = isZh()
    ? `${itemLabel(name)}完成！做得好` : `${itemLabel(name)} done — nice work!`;

  // 最後一穴就沒有「下一穴」可按
  const isLast = state.currentAcupointIndex >= state.selectedAcupoints.length - 1;
  const next = document.getElementById('btn-next-acu');
  next.style.display = '';
  next.removeAttribute('data-i18n');
  next.textContent = isLast ? (isZh() ? '查看本次總結' : 'View summary') : t('btn-next-acu');
}

function goToNextAcu() {
  if (state.currentAcupointIndex < state.selectedAcupoints.length - 1) {
    state.currentAcupointIndex++;
    showPage('acu-detail');
  } else {
    showPage('summary');
  }
}
