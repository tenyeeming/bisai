// ═══════════════════════════════════════════════════════════════════
// 穴道參考圖
//
// assets/acu-ref/ 底下一穴一張，來源是專案的 `自製穴道位置/`（手繪線稿 + 紅點）。
// 檔名沿用 acu-data.js 每個穴道的 ref 欄位，只是副檔名換成 .jpg
// （原圖 800KB PNG × 20 張 = 15MB，縮到 560px 寬轉 JPEG 後剩 681KB）。
//
// 只有 20 穴有圖，後補的 6 穴（少商/商陽/少衝/少澤/關衝/勞宮）沒有，
// 這時候要明講「尚無參考圖」，不要拿別穴的圖頂替。
// ═══════════════════════════════════════════════════════════════════

const acuRefSrc = (acu) =>
  acu && acu.ref ? `assets/acu-ref/${acu.ref.replace(/\.png$/, '.jpg')}` : null;

/**
 * 產生參考圖區塊；沒有圖就回一個「尚無參考圖」的虛線框，
 * 版面不會因為缺圖而塌掉
 */
function acuRefBlock(name) {
  const acu = ACUPOINTS.find(a => a.name === name);
  const src = acuRefSrc(acu);

  if (!src) {
    const box = document.createElement('div');
    box.className = 'ref-none';
    box.textContent = t('ref-none');
    return box;
  }

  const frame = document.createElement('div');
  frame.className = 'ref-frame';

  const img = document.createElement('img');
  img.src = src;
  img.alt = isZh() ? `${name}參考圖` : `${name} reference`;
  img.loading = 'lazy';
  img.onerror = () => { frame.className = 'ref-none'; frame.textContent = t('ref-none'); };

  const cap = document.createElement('div');
  cap.className = 'cap';
  cap.textContent = t('ref-cap');

  frame.append(img, cap);
  return frame;
}
