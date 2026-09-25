// ══ 圖冊分頁 ═════════════════════════════════════════════════════
// 穴道圖鑑：每格放該穴的參考圖（紅點標出位置），點進去看定位、主治、教學。
// 2026-09-24（用戶）：網頁不做收集 —— 拿掉解鎖／剪影／等級，全部直接可看。
//   理由見 js/state.js 開頭。App 仍然有收集與小人等級。

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
         欄少一欄 = 每格寬約多三成，圖與穴名跟著放大（下面兩個字級也是這次一起調的）。
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
      /* 參考圖是白底線稿，放進白色圓角框，深色主題下也是一張「卡片裡的圖」 */
      .collection-item .thumb {
        width: 100%; height: 84px; object-fit: contain; display: block;
        background: #fff; border-radius: calc(var(--r) - 2px);
      }
      /* 沒有參考圖的穴（手部後補 6 穴、臉部 EX-HN7／GV27）：代號圓標，不拿別穴的圖頂替 */
      .collection-item .thumb-code {
        width: 100%; height: 84px; display: flex; align-items: center; justify-content: center;
        border-radius: calc(var(--r) - 2px); background: var(--surface-2);
        font-family: var(--font-mono); font-size: 13px; color: var(--ink-soft);
      }
      .collection-item .nm {
        font-family: var(--font-ming); font-size: 13px; line-height: 1.15;
        color: var(--ink);
      }
      .collection-item .lv {
        font-family: var(--font-mono); font-size: 9px; line-height: 1.2;
        color: var(--brass);
      }
      /* 定位尚未支援的穴：仍可點進去看資料，只是標一行小字 */
      .collection-item .lv.soon { color: var(--ink-soft); }

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

    </style>

    <div class="stack">
      <div>
        <p class="eyebrow" data-i18n="eyebrow-gallery">圖鑑</p>
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
  // 2026-09-24：格子改放各穴參考圖（原本三組共用一隻手掌小人）。
  const hand = ACUPOINTS.map(a => a.name);
  const face = FACE_ACUPOINTS.map(a => a.code);
  const forearm = FOREARM_ACUPOINTS;

  grid.appendChild(groupHeader(t('gallery-group-hand').replace('%n', hand.length)));
  hand.forEach(id => renderCell(grid, id, acuLabel(id), (ACUPOINTS.find(a => a.name === id) || {}).code));

  grid.appendChild(groupHeader(t('gallery-group-face').replace('%n', face.length)));
  face.forEach(id => renderCell(grid, id, faceLabel(id), id));

  grid.appendChild(groupHeader(t('gallery-group-forearm').replace('%n', forearm.length)));
  forearm.forEach(a => renderCell(grid, a.name, itemLabel(a.name), a.code));

  const total = hand.length + face.length + forearm.length;
  document.getElementById('gallery-progress').textContent =
    isZh() ? `共 ${total} 穴` : `${total} ACUPOINTS`;
}

/** 橫跨整列的分組標題（不佔格子）。`note` 是底下那行小字說明 */
function groupHeader(text, cls) {
  const el = document.createElement('div');
  el.className = 'grp' + (cls ? ' ' + cls : '');
  el.textContent = text;
  return el;
}

/**
 * 畫一格：參考圖 ＋ 穴名；定位還不支援的穴多標一行小字（誠實告訴使用者現在練不了）。
 * 每一格都能點進去看介紹。
 */
function renderCell(grid, id, label, code) {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'collection-item';
  item.dataset.acu = id;
  item.onclick = () => showAcuInfo(id);
  item.appendChild(galleryThumb(id, code));

  const nm = document.createElement('div');
  nm.className = 'nm';
  nm.textContent = label;
  item.appendChild(nm);

  if (!itemImplemented(id)) {
    // 前臂小海有獨立的實驗頁（forearm-lab.html），標「實驗版」而不是「不支援」
    const lab = typeof FOREARM_LAB !== 'undefined' && FOREARM_LAB[id];
    const soon = document.createElement('span');
    soon.className = 'lv soon';
    soon.textContent = lab ? (isZh() ? '實驗版' : 'Beta')
                           : (isZh() ? '定位尚未支援' : 'Locating soon');
    item.appendChild(soon);
  }
  item.title = label;
  grid.appendChild(item);
}
