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
 * 慶祝舞台（總結頁）。2026-09-25（網頁v2 批 D）照 App MinionCast.MinionStage：
 *   · names 已排好（按最久的在前），最多站 5 隻。
 *   · 5 隻：從 5 種站位表隨機挑一種；1–4 隻：整群站中間（App CENTERED，用戶 09-25）。
 *   · 遠的縮小（最遠 58%）、變淡、降飽和；前排蓋後排。
 *   · celebrate＝true 才播：淡入上浮 → 跳兩下 → 晃兩個來回，延遲照「站多遠」錯開。
 * seed 同一次療程固定 → 切語言、回到這頁不會換人換位置。
 */
const STAGE_LAYOUTS = [
  [[.50, 0], [.26, .30], [.74, .30], [.14, .64], [.86, .64]],   // ① 弧形
  [[.44, .04], [.74, .30], [.19, .46], [.61, .70], [.33, .93]], // ② 散落
  [[.84, 0], [.67, .25], [.50, .50], [.33, .75], [.16, 1]],      // ③ 階梯
  [[.50, 0], [.28, .34], [.71, .38], [.40, .70], [.63, .76]],   // ④ 群聚
  [[.28, 0], [.41, .25], [.50, .48], [.57, .71], [.62, .94]],   // ⑤ 縱深列隊
];
const STAGE_CENTERED = {
  1: [[.50, 0]],
  2: [[.38, 0], [.62, 0]],
  3: [[.50, 0], [.28, .20], [.72, .20]],
  4: [[.39, 0], [.61, 0], [.18, .25], [.82, .25]],
};

/** 可重現的亂數（同一個 seed 每次一樣） */
function seededRandom(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

function renderRewardStage(id, celebrate, names, seed) {
  const stage = document.getElementById(id);
  const list = (names || []).slice(0, 5);
  stage.hidden = !list.length;          // 全部跳過就沒有舞台（空舞台比沒有更奇怪）
  if (!list.length) { stage.replaceChildren(); return; }

  const rnd = seededRandom(seed);
  const layout = STAGE_LAYOUTS[Math.floor(rnd() * STAGE_LAYOUTS.length)];
  const spots = STAGE_CENTERED[list.length] || layout;
  const order = list.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }

  const figs = order.map((memberIndex, slot) => {
    const [x, z] = spots[slot];
    const n = list[memberIndex];
    const fig = document.createElement('div');
    fig.className = 'fig';
    fig.style.left = (Math.min(.88, Math.max(.12, x)) * 100) + '%';
    fig.style.bottom = (z * 70) + 'px';
    fig.style.zIndex = String(Math.round(1000 - z * 900));
    fig.style.setProperty('--s', (1 - z * .42).toFixed(3));
    fig.style.opacity = (1 - z * .28).toFixed(3);
    fig.style.filter = `saturate(${(1 - z * .3).toFixed(3)})`;
    fig.style.setProperty('--d', Math.round(120 + z * 220) + 'ms');
    const img = celebrantImg(n, memberIndex);
    img.className = '';
    img.alt = itemLabel(n);
    fig.appendChild(img);
    return fig;
  });
  stage.replaceChildren(...figs);
  stage.classList.remove('celebrate');
  if (celebrate) { void stage.offsetWidth; stage.classList.add('celebrate'); }
}

/**
 * 紙屑（總結頁，App Confetti）：28 片、2.8 秒、只播一次、不吃點擊。
 * 顏色＝這次按過的穴道代表色＋黃銅。系統要求減少動態就整層不畫 —— 慶祝是附加層。
 */
const CONFETTI_COUNT = 28;
const CONFETTI_MS = 2800;
function playConfetti(colors, seed) {
  document.querySelectorAll('.confetti-layer').forEach(el => el.remove());
  if (!colors.length) return;
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const rnd = seededRandom(seed + 77);
  const layer = document.createElement('div');
  layer.className = 'confetti-layer';
  layer.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < CONFETTI_COUNT; i++) {
    const b = document.createElement('i');
    const start = rnd() * .18, span = .57 + rnd() * .43;
    b.style.left = (rnd() * 100) + '%';
    b.style.background = colors[i % colors.length];
    b.style.setProperty('--a', (.55 + rnd() * .4).toFixed(2));
    b.style.setProperty('--spin', (rnd() < .5 ? 560 : -560) + 'deg');
    b.style.animationDelay = Math.round(start * CONFETTI_MS) + 'ms';
    b.style.animationDuration = Math.round(span * CONFETTI_MS) + 'ms';
    layer.appendChild(b);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), CONFETTI_MS + 100);
}
