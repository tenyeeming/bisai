// ═══════════════════════════════════════════════════════════════════
// 穴道小人
//
// 一穴一個 SVG，放在 assets/minions/。目前是程式產生的佔位圖，
// 要換成手繪版就「直接覆蓋同名檔案」，這支不用改。
//
// 圖檔載入失敗時底下會露出該穴道的代表色（acuColor），
// 所以少一兩個檔案不會破版，只是變回色塊。
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

const minionSrc = (name) => `assets/minions/${MINION_SLUG[name] || ''}.svg`;

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
