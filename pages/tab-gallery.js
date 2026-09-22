// ══ 圖冊分頁 ═════════════════════════════════════════════════════
// 每個穴道一隻小人，按過才解鎖。顏色規則見 js/state.js 的 acuColor()。

registerPage('gallery', {
  tab: 'gallery',
  onEnter: () => initCollectionGrid(),
  onLanguage: () => initCollectionGrid(),

  html: `
  <div id="page-gallery" class="page">
    <style>
      /* 三欄 —— 與 App 的 GalleryScreen.kt 一致（GridCells.Fixed(3)）。
         ⚠ 這段註解在 template literal 裡面，**不要用反引號**（會把字串切斷）。
         2026-09-21 從四欄改過來：用戶「圖冊那些還是原來的樣子」。
         欄少一欄 = 每格寬約多三成，小人與穴名跟著放大（下面兩個字級也是這次一起調的）。
         ⚠️ 桌面（≥1024px）另有 auto-fill 的規則在 css/responsive.css:332，不受這行影響。 */
      .collection-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; }
      .collection-item {
        position: relative;
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        border-radius: var(--r);
        border: 1px solid var(--line);
        background: var(--surface);
        text-align: center;
        min-height: 116px;
        padding: 12px 6px;
        gap: 6px;
        overflow: hidden;
        font-family: inherit;
        cursor: pointer;
      }
      .collection-item:hover { border-color: var(--brass); }
      .collection-item .minion { width: auto; height: 56px; display: block; }
      .collection-item .nm {
        font-family: var(--font-ming); font-size: 13px; line-height: 1.15;
        color: var(--ink);
      }
      .collection-item .lv {
        font-family: var(--font-mono); font-size: 9px; line-height: 1.2;
        color: var(--brass);
      }
      /* 沒解鎖就只給剪影：看得到「還有這一隻」，但看不出長相 */
      .collection-item.locked .minion { filter: grayscale(1) brightness(.35) contrast(.85); opacity: .3; }
      .collection-item.locked .nm { color: var(--ink-soft); opacity: .45; }

      /* ── 分組標題（2026-09-20 圖冊納入臉部）─────────────
         49 格手臉混在一起看不出是兩群（連 id 都不同型：手部穴名、臉部代號）。
         grid-column: 1/-1 讓標題橫跨整列，不佔格子—— 跟 App 的 GroupHeader 同一個做法。 */
      .collection-grid .grp {
        grid-column: 1 / -1;
        display: flex; align-items: baseline; gap: 7px;
        font-family: var(--font-mono); font-size: 10px; letter-spacing: .14em;
        text-transform: uppercase; color: var(--brass);
        padding: 4px 1px 1px;
      }
      .collection-grid .grp::after {
        content: ''; flex: 1; height: 1px; background: var(--line);
      }
      .collection-grid .grp.note {
        font-size: 9.5px; letter-spacing: .02em; text-transform: none;
        color: var(--ink-soft); padding-top: 0;
      }
      .collection-grid .grp.note::after { content: none; }

      .collection-item.locked .lv { color: var(--ink-soft); opacity: .5; }
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

  // 2026-09-22：手機圖冊與 App 同步為手部、臉部、前臂三組，共 64 穴。
  // 三組一律使用 App 的手掌小人卡，不再讓臉部單獨顯示代號膠囊。
  const hand = ACUPOINTS.map(a => a.name);
  const face = FACE_ACUPOINTS.map(a => a.code);
  const forearm = [
    ['少海穴', 'HT3'], ['小海穴', 'SI8'], ['曲澤穴', 'PC3'],
    ['郄門穴', 'PC4'], ['間使穴', 'PC5'], ['內關穴', 'PC6'],
    ['大陵穴', 'PC7'], ['靈道穴', 'HT4'], ['通里穴', 'HT5'],
    ['陰郄穴', 'HT6'], ['外關穴', 'SJ5'], ['支溝穴', 'SJ6'],
    ['三陽絡穴', 'SJ8'], ['四瀆穴', 'SJ9'], ['支正穴', 'SI7'],
  ];

  grid.appendChild(groupHeader(t('gallery-group-hand').replace('%n', hand.length)));
  let unlocked = hand.filter(id => renderCell(grid, id, acuLabel(id), acuColor(id), true)).length;

  grid.appendChild(groupHeader(t('gallery-group-face').replace('%n', face.length)));
  unlocked += face.filter(id => renderCell(grid, id, faceLabel(id), faceColor(id), true)).length;

  grid.appendChild(groupHeader(isZh() ? `前臂 · ${forearm.length} 穴（尚未開放定位）`
                                      : `Forearm · ${forearm.length} points (no locating yet)`));
  forearm.forEach(([name], index) => renderCell(
    grid, name, name, `hsl(${280 + (index % 5) * 7} 46% 44%)`, false,
  ));

  document.getElementById('gallery-progress').textContent =
    `${unlocked} / ${hand.length + face.length + forearm.length} ${isZh() ? '已解鎖' : 'UNLOCKED'}`;
}

/** 橫跨整列的分組標題（不佔格子）。`note` 是底下那行小字說明 */
function groupHeader(text, cls) {
  const el = document.createElement('div');
  el.className = 'grp' + (cls ? ' ' + cls : '');
  el.textContent = text;
  return el;
}

/**
 * 畫一格。回傳「這一穴解鎖了沒」，呼叫端據此數進度。
 *
 * ⚠️ 收集紀錄一律用**這個 id** 當 key：手部是中文穴名、臉部是代號（'EX-HN3'）。
 *    臉部不要改用中文名 —— 代號是那條線的識別字，改譯名不會弄丟使用者的收集紀錄
 *    （跟 App 的 `minions[fa.code]` 同一個約定）。
 */
function renderCell(grid, id, label, color, canOpen) {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'collection-item';
  item.dataset.acu = id;
  item.onclick = () => { if (canOpen) showAcuInfo(id); };
  const m = state.minions[id];
  item.appendChild(galleryMinionImg(id));

  const nm = document.createElement('div');
  nm.className = 'nm';
  nm.textContent = label;
  item.appendChild(nm);
  grid.appendChild(item);

  if (m) {
    item.style.borderColor = color;
    const lv = document.createElement('span');
    lv.className = 'lv';
    lv.textContent = `Lv.${m.level} · ${m.times}x`;
    item.appendChild(lv);
    item.title = isZh() ? `${label} — 已按 ${m.times} 次`
                        : `${label} — ${m.times} sessions`;
    return true;
  }

  item.classList.add('locked');
  const locked = document.createElement('span');
  locked.className = 'lv';
  locked.textContent = isZh() ? '尚未解鎖' : 'Locked';
  item.appendChild(locked);
  // 沒有定位公式的穴道要看得出來，不然會以為是自己還沒按到
  item.title = canOpen && itemImplemented(id)
    ? (isZh() ? '尚未解鎖' : 'Locked')
    : (isZh() ? '定位尚未支援' : 'Locating not supported yet');
  return false;
}
