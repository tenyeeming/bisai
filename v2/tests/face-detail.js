// ══ 臉部穴道的白話資料與參考圖（2026-09-11 從 臉部穴道.pdf 匯入）══════
//
// 這批資料是**轉檔轉進來的**，不是手寫的 —— 轉檔腳本錯一個字不會有人發現，
// 頁面上只會少一塊或顯示空白。所以這裡把「資料與程式碼的對應」釘死：
//   ① FACE_DETAIL 的 code 一定要是真的存在的穴道
//   ② 宣告有圖的 code，assets/face-ref/ 底下一定要真的有那個檔
//   ③ 反過來，有檔案的也一定要宣告，不然圖白放了
//   ④ 沒資料的穴道（球後、兌端）要誠實回 null，不能拿別穴頂替
const fs = require('fs');
const vm = require('vm');
const DIR = __dirname + '/../';

let fail = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };

const ctx = vm.createContext({
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  console, Math, JSON,
});
vm.runInContext(
  fs.readFileSync(DIR + 'js/face-data.js', 'utf8') +
  '\n;globalThis.__t = { FACE_ACUPOINTS, FACE_DETAIL, FACE_IMPLEMENTED, ' +
  'faceDetail, faceFuncs, FACE_SYMPTOM_MAP };',
  ctx, { filename: 'face-data.js' });
const T = ctx.__t;

const codes = new Set(T.FACE_ACUPOINTS.map(a => a.code));

// ── ① FACE_DETAIL 的 code 都存在 ──
const ghosts = Object.keys(T.FACE_DETAIL).filter(c => !codes.has(c));
ok(ghosts.length === 0,
  `FACE_DETAIL 的 ${Object.keys(T.FACE_DETAIL).length} 個 code 都是真的穴道` +
  (ghosts.length ? '；不存在的：' + ghosts.join('、') : ''));

// ── ② 每筆都要有定位與至少一條用法，欄位不能空 ──
const bad = [];
for (const [code, d] of Object.entries(T.FACE_DETAIL)) {
  if (!d.locate || !d.locate.trim()) bad.push(code + '(無定位)');
  if (!Array.isArray(d.uses) || !d.uses.length) { bad.push(code + '(無用法)'); continue; }
  d.uses.forEach((u, i) => {
    // GV26（水溝）是唯一例外：「昏迷急救」2026-09-20 整項刪除後它沒有症狀歸屬，
    // func 刻意留空，UI 會跳過標題。不要自行補一個適應症回來。
    if (code !== 'GV26' && (!u.func || !u.func.trim())) bad.push(`${code}.uses[${i}](無功效)`);
    if (!u.press || !u.press.trim()) bad.push(`${code}.uses[${i}](無按法)`);
  });
}
ok(bad.length === 0,
  '每個穴道都有定位與至少一條完整用法' + (bad.length ? '；缺的：' + bad.join('、') : ''));

// ── ③ 宣告有圖的 code ↔ 實際檔案，雙向都要對上 ──
const refJs = fs.readFileSync(DIR + 'js/acu-ref.js', 'utf8');
const m = refJs.match(/const FACE_REF_CODES = new Set\(\[([\s\S]*?)\]\)/);
ok(!!m, 'acu-ref.js 裡找得到 FACE_REF_CODES');
if (m) {
  const declared = [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
  const onDisk = fs.existsSync(DIR + 'assets/face-ref')
    ? fs.readdirSync(DIR + 'assets/face-ref')
        .filter(f => f.endsWith('.jpg')).map(f => f.replace(/\.jpg$/, ''))
    : [];

  const noFile = declared.filter(c => !onDisk.includes(c));
  ok(noFile.length === 0,
    `宣告有圖的 ${declared.length} 個 code 都有實際檔案` +
    (noFile.length ? '；缺檔：' + noFile.join('、') : ''));

  const notDeclared = onDisk.filter(c => !declared.includes(c));
  ok(notDeclared.length === 0,
    `assets/face-ref/ 的 ${onDisk.length} 個檔都有被宣告（不然圖白放了）` +
    (notDeclared.length ? '；沒宣告：' + notDeclared.join('、') : ''));

  const notAcu = declared.filter(c => !codes.has(c));
  ok(notAcu.length === 0,
    '有圖的 code 都是真的穴道' + (notAcu.length ? '；不存在：' + notAcu.join('、') : ''));
}

// ── ④ 沒資料的要誠實回 null ──
// PDF 只有 21 穴，球後（EX-HN7）與兌端（GV27）沒有。
// 這條擋的是「以後有人為了讓版面好看，隨手拿別穴的資料填進去」。
const noData = [...codes].filter(c => !T.FACE_DETAIL[c]);
ok(T.faceDetail('EX-HN7') === null && T.faceDetail('GV27') === null,
  `沒有 PDF 資料的穴道 faceDetail() 回 null（目前 ${noData.length} 個：${noData.join('、')}）`);

// ── ⑤ faceFuncs 正常運作 ──
const f = T.faceFuncs('EX-HN3');    // 印堂在 PDF 裡有三條用法
ok(f.length >= 2, `faceFuncs('EX-HN3') 取得多個功效（${f.join('、')}）`);
ok(T.faceFuncs('EX-HN7').length === 0, "faceFuncs() 對沒資料的穴道回空陣列");

// ── ⑥ 覆蓋率提醒（不是錯誤，是讓人知道還缺什麼）──
const implNoDetail = [...T.FACE_IMPLEMENTED].filter(c => !T.FACE_DETAIL[c]);
ok(true, `已實作定位的 ${T.FACE_IMPLEMENTED.size} 穴中，${implNoDetail.length} 個還沒有白話資料` +
  (implNoDetail.length ? '：' + implNoDetail.join('、') : ''));

console.log(fail ? `\n${fail} 項失敗` : '\n全部通過');
process.exit(fail ? 1 : 0);
