// 產生 26 隻穴道小人的佔位 SVG。
// 之後美術要換掉時，一穴一檔直接覆蓋即可（檔名別動）。
const fs = require('fs'), path = require('path');
const OUT = 'D:/穴道按摩/比賽專區/demo網站/assets/minions/';
fs.mkdirSync(OUT, { recursive: true });

const ACU = [
  ['合谷穴','hegu'],['陽池穴','yangchi'],['陽溪穴','yangxi'],['陽谷穴','yanggu'],
  ['液門穴','yemen'],['中渚穴','zhongzhu'],['小骨空','xiaogukong'],['中魁穴','zhongkui'],
  ['大骨空','dagukong'],['八邪穴','baxie'],['二間穴','erjian'],['三間穴','sanjian'],
  ['前谷穴','qiangu'],['腕谷穴','wangu'],['後溪穴','houxi'],['中衝穴','zhongchong'],
  ['魚際穴','yuji'],['神門穴','shenmen'],['太淵穴','taiyuan'],['四縫穴','sifeng'],
  ['少商穴','shaoshang'],['商陽穴','shangyang'],['少衝穴','shaochong'],['少澤穴','shaoze'],
  ['關衝穴','guanchong'],['勞宮穴','laogong'],
];

// 跟 js/state.js 的 acuColor() 同一套色相規則，小人顏色才會跟清單上的圓點一致
const FINGERTIP = new Set(['少商穴','商陽穴','少衝穴','少澤穴','關衝穴','中衝穴']);
const WRIST     = new Set(['合谷穴','陽池穴','陽溪穴','陽谷穴','後溪穴','腕谷穴']);
const PALM      = new Set(['四縫穴','魚際穴','神門穴','太淵穴','勞宮穴']);
const hueOf = (name, idx) => {
  const base = FINGERTIP.has(name) ? 6 : WRIST.has(name) ? 200 : PALM.has(name) ? 158 : 34;
  return (base + (idx % 5) * 9) % 360;
};

// 輸出 hex 而不是 hsl()：SVG 檔要能被各種工具（美術軟體、轉檔器）正確讀色，
// 不是只有瀏覽器看得懂就好
function hsl(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const hx = n => Math.round(255 * f(n)).toString(16).padStart(2, '0');
  return `#${hx(0)}${hx(8)}${hx(4)}`;
}

// ── 頭髮：六種 ──────────────────────────────────────────────
function hair(kind, hc) {
  const base = `<path d="M16 25a16 16 0 0 1 32 0c0-6-5-11-16-11S16 19 16 25z" fill="${hc}"/>`;
  switch (kind) {
    case 0: // 瀏海
      return base + `<path d="M17 23c3-7 9-10 15-10s12 3 15 10c-4-4-9-5-15-5s-11 1-15 5z" fill="${hc}"/>`;
    case 1: // 呆毛
      return base + `<path d="M32 12c1-5 5-7 8-6-3 1-4 3-4 6z" fill="${hc}"/>`;
    case 2: // 丸子頭
      return base + `<circle cx="32" cy="8" r="5.5" fill="${hc}"/>`;
    case 3: // 長髮側束
      return base + `<path d="M16 26c-2 6-2 13 0 18 2-6 2-12 2-18z" fill="${hc}"/>` +
                    `<path d="M48 26c2 6 2 13 0 18-2-6-2-12-2-18z" fill="${hc}"/>`;
    case 4: // 便帽
      return `<path d="M15 24a17 17 0 0 1 34 0z" fill="${hc}"/>` +
             `<rect x="13" y="23" width="38" height="4" rx="2" fill="${hc}"/>` +
             `<circle cx="32" cy="7" r="3" fill="${hc}"/>`;
    default: // 雙馬尾
      return base + `<circle cx="14" cy="28" r="5" fill="${hc}"/>` +
                    `<circle cx="50" cy="28" r="5" fill="${hc}"/>`;
  }
}

// ── 眼睛：四種 ──────────────────────────────────────────────
function eyes(kind, ink) {
  const hl = (x, y) => `<circle cx="${x - 1.1}" cy="${y - 1.6}" r="1.35" fill="#fff"/>`;
  switch (kind) {
    case 0: // 大圓眼
      return `<ellipse cx="25.5" cy="28" rx="3.3" ry="4.1" fill="${ink}"/>${hl(25.5, 28)}` +
             `<ellipse cx="38.5" cy="28" rx="3.3" ry="4.1" fill="${ink}"/>${hl(38.5, 28)}`;
    case 1: // 笑眼
      return `<path d="M22.5 29c1.5-3 4.5-3 6 0" stroke="${ink}" stroke-width="2" fill="none" stroke-linecap="round"/>` +
             `<path d="M35.5 29c1.5-3 4.5-3 6 0" stroke="${ink}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
    case 2: // 星星眼
      return `<ellipse cx="25.5" cy="28" rx="3.3" ry="4.1" fill="${ink}"/>` +
             `<path d="M25.5 25.4l.8 1.8 2 .2-1.5 1.4.4 2-1.7-1-1.7 1 .4-2-1.5-1.4 2-.2z" fill="#fff"/>` +
             `<ellipse cx="38.5" cy="28" rx="3.3" ry="4.1" fill="${ink}"/>` +
             `<path d="M38.5 25.4l.8 1.8 2 .2-1.5 1.4.4 2-1.7-1-1.7 1 .4-2-1.5-1.4 2-.2z" fill="#fff"/>`;
    default: // 眨眼
      return `<ellipse cx="25.5" cy="28" rx="3.3" ry="4.1" fill="${ink}"/>${hl(25.5, 28)}` +
             `<path d="M35.5 28.5c1.5-2.5 4.5-2.5 6 0" stroke="${ink}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
  }
}

// ── 配件：五種 ──────────────────────────────────────────────
function accessory(kind, ac, ink) {
  switch (kind) {
    case 0: return '';
    case 1: // 葉子
      return `<path d="M44 12c5-1 8 2 7 7-5 1-8-2-7-7z" fill="${ac}"/>` +
             `<path d="M44 12c3 2 5 4 6 7" stroke="rgba(0,0,0,.25)" stroke-width="1" fill="none"/>`;
    case 2: // OK 繃
      return `<g transform="rotate(-20 42 34)"><rect x="38" y="32" width="9" height="4.5" rx="2.2" fill="${ac}"/>` +
             `<circle cx="41" cy="34.2" r=".5" fill="rgba(0,0,0,.3)"/><circle cx="44" cy="34.2" r=".5" fill="rgba(0,0,0,.3)"/></g>`;
    case 3: // 髮夾
      return `<rect x="42" y="18" width="8" height="3" rx="1.5" fill="${ac}"/>`;
    default: // 圍巾
      return `<path d="M20 39c7 4 17 4 24 0v4c-7 4-17 4-24 0z" fill="${ac}"/>` +
             `<path d="M43 42l3 8-4 1-2-8z" fill="${ac}"/>`;
  }
}

ACU.forEach(([name, slug], i) => {
  const h = hueOf(name, i);
  const skin = hsl(h, 52, 86);   // 頭
  const body = hsl(h, 46, 44);   // 身體（跟清單圓點同色）
  const hc   = hsl(h, 44, 26);   // 頭髮
  const ac   = hsl((h + 150) % 360, 55, 55); // 配件用對比色
  const ink  = '#1F2A26';
  const line = 'rgba(0,0,0,.16)';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="${name}">
<title>${name}</title>
<!-- 佔位小人（程式產生）。要換成手繪版就直接覆蓋這個檔，檔名別動。 -->
<g stroke="${line}" stroke-width="1">
  <ellipse cx="24" cy="58.5" rx="5" ry="2.6" fill="${body}"/>
  <ellipse cx="40" cy="58.5" rx="5" ry="2.6" fill="${body}"/>
  <circle cx="17.5" cy="47" r="4" fill="${body}"/>
  <circle cx="46.5" cy="47" r="4" fill="${body}"/>
  <ellipse cx="32" cy="47.5" rx="13.5" ry="11.5" fill="${body}"/>
  <circle cx="32" cy="27" r="16" fill="${skin}"/>
</g>
${hair(i % 6, hc)}
<ellipse cx="21.5" cy="33" rx="3" ry="1.9" fill="rgba(255,120,120,.5)"/>
<ellipse cx="42.5" cy="33" rx="3" ry="1.9" fill="rgba(255,120,120,.5)"/>
${eyes(i % 4, ink)}
<path d="M30.4 34.4c1 1.2 2.2 1.2 3.2 0" stroke="${ink}" stroke-width="1.6" fill="none" stroke-linecap="round"/>
${accessory(i % 5, ac, ink)}
</svg>
`;
  fs.writeFileSync(path.join(OUT, slug + '.svg'), svg, 'utf8');
});

console.log(`產生 ${ACU.length} 個 SVG → ${OUT}`);
