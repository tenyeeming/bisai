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

// ── 臉部穴道參考圖（2026-09-11）──────────────────────────────────
//
// assets/face-ref/<code>.jpg，來源是 `資料存放區/臉部穴道.pdf` 內嵌的示意圖
// （卡通臉 + 紅點，443×504 PNG，轉 JPEG 後 21 張共 574KB）。
//
// 檔名用 **code** 不用拼音 —— 臉部一律以 code 當識別（見 js/regions.js 的註解），
// 而且 PDF 的中文穴名有錯字（瞳子髎打成瞳子膠），拿穴名當檔名會踩到。
//
// ⚠️ 只有 21 穴有圖；球後（EX-HN7）、兌端（GV27）沒有 → 照手部的做法明講
//    「尚無參考圖」，不要拿別穴的頂替。
const FACE_REF_CODES = new Set([
  'ST1', 'ST2', 'ST3', 'ST4', 'ST5', 'ST6', 'ST7',
  'BL1', 'BL2', 'GB1', 'GB3', 'GB14',
  'LI20', 'GV25', 'GV26', 'CV24', 'TE23', 'SI18',
  'EX-HN3', 'EX-HN4', 'EX-HN5',
]);

function faceRefBlock(code) {
  if (!FACE_REF_CODES.has(code)) {
    const box = document.createElement('div');
    box.className = 'ref-none face-ref';
    box.textContent = t('ref-none');
    return box;
  }
  const frame = document.createElement('div');
  // face-ref：臉部的圖是單獨一塊、不跟文字並排，寬度規則跟手部那個 42% 不同
  frame.className = 'ref-frame face-ref';

  const img = document.createElement('img');
  img.src = `assets/face-ref/${code}.jpg`;
  img.alt = isZh() ? `${faceLabel(code)}參考圖` : `${faceLabel(code)} reference`;
  img.loading = 'lazy';
  img.onerror = () => {
    frame.className = 'ref-none face-ref';
    frame.textContent = t('ref-none');
  };

  const cap = document.createElement('div');
  cap.className = 'cap';
  cap.textContent = isZh() ? '紅點為穴位位置' : 'Red dots mark the acupoint';

  frame.append(img, cap);
  return frame;
}
