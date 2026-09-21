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
        font-family: var(--font-ming); font-size: 11.5px; line-height: 1.15;
        margin-top: 2px; color: var(--ink);
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

      /* 臉部格：**沒有小人**（那一組 SVG 只畫了手部 26 穴）。
         不借用手部的小人圖—— 候的那隻小人在手部也看得到，兩格長一樣反而讓人以為是同一穴。
         改成代號圓標，跟定位頁、圖冊介紹頁看到的是同一個識別字。 */
      .collection-item .code-badge {
        /* 膚囊而不是正圓：代號長短差很多（ST1 三個字、EX-HN7 七個）。
           固定正圓的話長代號會換行、字溢出圓外 —— 320px 的小螢幕尤其明顯。
           min-width 讓短代號維持接近圓形，nowrap 保證一行到底。 */
        min-width: 42%; max-width: 92%; height: 30%;
        padding: 0 5px; border-radius: 999px;
        display: flex; align-items: center; justify-content: center;
        white-space: nowrap;
        font-family: var(--font-mono); font-size: 10.5px; font-weight: 700;
        color: #fff; letter-spacing: .01em;
      }
      /* 未解鎖：跟手部小人剪影同一個意思，但**不能淡到讀不出代號** ——
         臉部沒有小人，代號就是辨識這一穴的唯一線索。 */
      .collection-item.locked .code-badge { filter: grayscale(1) brightness(.85); opacity: .5; }
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

  // ⭐ 2026-09-20：圖冊納入臉部 23 穴（在這之前網頁圖冊只有手部，App 早就兩組都有）。
  //    兩組共用同一個 renderCell()，差別只有「用小人圖還是代號圓標」與顏色來源。
  const hand = ACUPOINTS.map(a => a.name);
  const face = FACE_ACUPOINTS.map(a => a.code);

  grid.appendChild(groupHeader(t('gallery-group-hand').replace('%n', hand.length)));
  let unlocked = hand.filter(id => renderCell(grid, id)).length;

  grid.appendChild(groupHeader(t('gallery-group-face').replace('%n', face.length)));
  grid.appendChild(groupHeader(t('gallery-face-nominion'), 'note'));
  unlocked += face.filter(id => renderCell(grid, id)).length;

  document.getElementById('gallery-progress').textContent =
    `${unlocked} / ${hand.length + face.length} ${isZh() ? '已解鎖' : 'UNLOCKED'}`;
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
function renderCell(grid, id) {
  const face = isFaceItem(id);
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'collection-item';
  item.dataset.acu = id;
  item.onclick = () => showAcuInfo(id);
  const m = state.minions[id];
  const color = itemColor(id);

  if (face) {
    const badge = document.createElement('div');
    badge.className = 'code-badge';
    badge.style.background = color;
    badge.textContent = id;
    item.appendChild(badge);
  } else {
    item.appendChild(minionImg(id));
  }

  const nm = document.createElement('div');
  nm.className = 'nm';
  nm.textContent = itemLabel(id);
  item.appendChild(nm);
  grid.appendChild(item);

  if (m) {
    item.style.borderColor = color;
    const lv = document.createElement('span');
    lv.className = 'lv';
    lv.textContent = 'Lv.' + m.level;
    lv.style.background = color;
    item.appendChild(lv);
    item.title = isZh() ? `${itemLabel(id)} — 已按 ${m.times} 次`
                        : `${itemLabel(id)} — ${m.times} sessions`;
    return true;
  }

  item.classList.add('locked');
  // 沒有定位公式的穴道要看得出來，不然會以為是自己還沒按到
  item.title = itemImplemented(id)
    ? (isZh() ? '尚未解鎖' : 'Locked')
    : (isZh() ? '定位尚未支援' : 'Locating not supported yet');
  return false;
}
