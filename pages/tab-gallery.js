// ══ 圖冊分頁 ═════════════════════════════════════════════════════
// 每個穴道一隻小人，按過才解鎖。顏色規則見 js/state.js 的 acuColor()。

registerPage('gallery', {
  tab: 'gallery',
  onEnter: () => initCollectionGrid(),
  onLanguage: () => initCollectionGrid(),

  html: `
  <div id="page-gallery" class="page">
    <style>
      .collection-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
      .collection-item {
        position: relative;
        aspect-ratio: 1;
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        border-radius: var(--r);
        border: 1px solid var(--line);
        background: var(--surface);
        text-align: center;
        padding: 3px;
        overflow: hidden;
        font-family: inherit;
        cursor: pointer;
      }
      .collection-item:hover { border-color: var(--brass); }
      .collection-item .minion { width: 78%; height: auto; display: block; }
      .collection-item .nm {
        font-family: var(--font-ming); font-size: 9.5px; line-height: 1.15;
        margin-top: 1px; color: var(--ink);
      }
      .collection-item .lv {
        position: absolute; top: 2px; right: 3px;
        font-family: var(--font-mono); font-size: 9px; font-weight: 700;
        color: #fff; background: var(--brass);
        border-radius: 2px; padding: 0 3px;
      }
      /* 沒解鎖就只給剪影：看得到「還有這一隻」，但看不出長相 */
      .collection-item.locked .minion { filter: grayscale(1) brightness(.35) contrast(.85); opacity: .3; }
      .collection-item.locked .nm { color: var(--ink-soft); opacity: .45; }
    </style>

    <div class="stack">
      <div>
        <p class="eyebrow" data-i18n="eyebrow-gallery">收集</p>
        <h2 data-i18n="gallery-title">穴道圖冊</h2>
        <p class="mono-sm" id="gallery-progress" style="margin-top:6px"></p>
      </div>
      <div class="collection-grid" id="collection-grid"></div>
    </div>
  </div>`,
});

function initCollectionGrid() {
  const grid = document.getElementById('collection-grid');
  grid.innerHTML = '';
  let unlocked = 0;

  ACUPOINTS.forEach(acu => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'collection-item';
    item.onclick = () => showAcuInfo(acu.name);   // 每一格都能點進介紹
    const m = state.minions[acu.name];

    const nm = document.createElement('div');
    nm.className = 'nm';
    nm.textContent = acuLabel(acu.name);
    item.append(minionImg(acu.name), nm);

    if (m) {
      unlocked++;
      item.style.borderColor = acuColor(acu.name);
      const lv = document.createElement('span');
      lv.className = 'lv'; lv.textContent = 'Lv.' + m.level;
      lv.style.background = acuColor(acu.name);
      item.appendChild(lv);
      item.title = isZh() ? `${acu.name} — 已按 ${m.times} 次` : `${acu.name} — ${m.times} sessions`;
    } else {
      item.classList.add('locked');
      item.title = isZh() ? '尚未解鎖' : 'Locked';
    }
    grid.appendChild(item);
  });

  document.getElementById('gallery-progress').textContent =
    `${unlocked} / ${ACUPOINTS.length} ${isZh() ? '已解鎖' : 'UNLOCKED'}`;
}
