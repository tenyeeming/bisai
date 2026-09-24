// ═══════════════════════════════════════════════════════════════════
// 穴道小人
//
// 手部 26 穴一穴一隻，放在 assets/minions/<拼音>.webp。
// 來源：`小人物/穴道集合/<穴名>穴.png`（與 App 批 67 同一組 26 隻），
// 長邊縮到 256px 轉 WebP（26 張共約 340KB）。原本的程式產生佔位 SVG 已不再引用。
//
// 2026-09-24 起網頁**沒有收集／升級**（網頁沒資料庫，紀錄換裝置就不見）——
// 小人只剩「完成時出來慶祝」這個用途；圖冊格子改顯示穴道參考圖。
// 臉部／前臂沒有專屬小人，慶祝時用首頁那 5 隻共用角色。
//
// 圖檔載入失敗時底下會露出該穴道的代表色（acuColor），少一兩個檔案不會破版。
// ═══════════════════════════════════════════════════════════════════

const MINION_SLUG = {
  '合谷穴': 'hegu',      '陽池穴': 'yangchi',   '陽溪穴': 'yangxi',
  '陽谷穴': 'yanggu',    '液門穴': 'yemen',     '中渚穴': 'zhongzhu',
  '小骨空': 'xiaogukong', '中魁穴': 'zhongkui',  '大骨空': 'dagukong',
  '八邪穴': 'baxie',     '二間穴': 'erjian',    '三間穴': 'sanjian',
  '前谷穴': 'qiangu',    '腕谷穴': 'wangu',     '後溪穴': 'houxi',
  '中衝穴': 'zhongchong', '魚際穴': 'yuji',      '神門穴': 'shenmen',
  '太淵穴': 'taiyuan',   '四縫穴': 'sifeng',    '少商穴': 'shaoshang',
  '商陽穴': 'shangyang', '少衝穴': 'shaochong', '少澤穴': 'shaoze',
  '關衝穴': 'guanchong', '勞宮穴': 'laogong',
};

const minionSrc = (name) => `assets/minions/${MINION_SLUG[name] || ''}.webp`;

/**
 * 圖冊格子用的穴道參考圖路徑。三組各自的圖在不同資料夾（見 js/acu-ref.js）。
 * 沒有圖（手部後補 6 穴、臉部 EX-HN7／GV27）回 null，由呼叫端改畫代號圓標。
 */
function refThumbSrc(id) {
  if (isFaceItem(id)) return FACE_REF_CODES.has(id) ? `assets/face-ref/${id}.jpg` : null;
  if (isForearmItem(id)) { const a = forearmAcu(id); return a ? `assets/forearm-ref/${a.ref}` : null; }
  return acuRefSrc(ACUPOINTS.find(a => a.name === id));
}

/** 圖冊格子的縮圖：有參考圖就放圖，沒有就放代號圓標（不拿別穴的圖頂替） */
function galleryThumb(id, code) {
  const src = refThumbSrc(id);
  const badge = () => {
    const b = document.createElement('div');
    b.className = 'thumb-code';
    b.textContent = code || '—';
    return b;
  };
  if (!src) return badge();
  const img = document.createElement('img');
  img.className = 'thumb';
  img.src = src;
  img.alt = id;
  img.loading = 'lazy';
  img.onerror = () => img.replaceWith(badge());
  return img;
}

/** 完成時出來慶祝的那一隻：手部用專屬小人，臉部／前臂用共用角色 */
function celebrantImg(name, index) {
  if (MINION_SLUG[name]) return minionImg(name);
  return castImage(index || 0);
}

/** 產生一張小人圖。className 交給呼叫端決定大小 */
function minionImg(name, className) {
  const img = document.createElement('img');
  img.className = className || 'minion';
  img.src = minionSrc(name);
  img.alt = name;
  img.loading = 'lazy';
  // 檔案不在就把自己藏起來，露出底下的代表色
  img.onerror = () => { img.style.display = 'none'; };
  return img;
}

// 與 App 首頁一致的五個角色，純顯示、不寫入收集紀錄。
function castImage(index) {
  const img = document.createElement('img');
  img.src = `assets/cast/minion_${String(index % 5 + 1).padStart(2, '0')}.png`;
  img.alt = '';
  img.setAttribute('aria-hidden', 'true');
  img.style.setProperty('--i', index);
  return img;
}

/**
 * 慶祝舞台：站本次按過的穴道小人（最多 5 隻，依序），臉部／前臂以共用角色補位。
 * names 沒給就站 5 隻共用角色（舊行為）。
 */
function renderRewardStage(id, celebrate, names) {
  const stage = document.getElementById(id);
  const list = names && names.length ? names.slice(0, 5) : [];
  const imgs = list.length
    ? list.map((n, i) => { const im = celebrantImg(n, i); im.className = ''; im.style.setProperty('--i', i); return im; })
    : Array.from({ length: 5 }, (_, i) => castImage(i));
  stage.replaceChildren(...imgs);
  stage.classList.toggle('celebrate', celebrate);
}
