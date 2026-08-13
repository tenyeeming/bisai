// 靜態檢查：不開瀏覽器、不裝套件，純讀檔比對。
// 專抓「拆成多檔之後最容易踩、但肉眼看不出來」的問題。
//   node tests/check.js
const fs = require('fs'), vm = require('vm'), path = require('path');
const DIR = path.join(__dirname, '..').replace(/\\/g, '/') + '/';
let fail = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const read = f => fs.readFileSync(DIR + f, 'utf8');
const shell = read('acunavi-ideal.html');

// ── 1. 外殼引用的檔案都存在 ──
// vendor/ 是下載物（node vendor/下載.js，不進版控），沒抓也能跑（會退回 CDN），
// 所以它不列入「一定要存在」，另外用第 1b 條守。
const allSrcs = [...shell.matchAll(/<script src="([^"]+)"/g)].map(x => x[1]).filter(s => !s.startsWith('http'));
const vendorSrcs = allSrcs.filter(s => s.startsWith('vendor/'));
const srcs = allSrcs.filter(s => !s.startsWith('vendor/'));
const links = [...shell.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(x => x[1]);
const missingFiles = [...srcs, ...links].filter(f => !fs.existsSync(DIR + f));
ok(missingFiles.length === 0, `外殼引用的 ${srcs.length + links.length} 個檔案都存在` + (missingFiles.length ? ': ' + missingFiles : ''));

// ── 1b. MediaPipe 離線化 ──
{
  const dl = read('vendor/下載.js');
  // 外殼指到 vendor 的每一支，下載腳本都要真的會去抓（拼錯路徑就永遠靜靜地退回 CDN）
  const badVendor = vendorSrcs.filter(s => {
    const [, , pkg, file] = s.split('/');
    return !dl.includes(`dir: '${pkg}'`) || !dl.includes(`'${file}'`);
  });
  ok(vendorSrcs.length === 3 && badVendor.length === 0,
     `外殼的 ${vendorSrcs.length} 支 vendor 腳本都在 下載.js 的清單裡` + (badVendor.length ? ': ' + badVendor : ''));

  // 三個包的版本號要一致：mp-loader / 外殼 / 下載.js 對不上會偶發載入失敗，而且很難查
  const loader = read('js/mp-loader.js');
  const vers = [...dl.matchAll(/npm: '(@mediapipe\/[^']+)'/g)].map(x => x[1]);
  const badVer = vers.filter(v => !loader.includes(`'${v}'`));
  ok(vers.length === 3 && badVer.length === 0,
     '下載.js 與 mp-loader.js 的三個版本號一致' + (badVer.length ? ': ' + badVer : ''));

  // 要嘛整包都在、要嘛整包都不在。只有 .js 沒有 wasm 是最糟的狀態：
  // 本機 .js 讀得到 → 不會觸發 onerror → 資產仍指本機 → 404
  const want = [...dl.matchAll(/dir: '(\w+)',[\s\S]*?files: \[([\s\S]*?)\]/g)]
    .flatMap(m => [...m[2].matchAll(/'([^']+)'/g)].map(f => `vendor/mediapipe/${m[1]}/${f[1]}`));
  const have = want.filter(f => fs.existsSync(DIR + f));
  ok(have.length === 0 || have.length === want.length,
     have.length === 0
       ? `離線資產未下載（${want.length} 個），會退回 CDN —— 決賽前要跑 node vendor/下載.js`
       : `離線資產齊全（${have.length}/${want.length}），現場可離線`);
}

// ── 2. 每支 JS 語法正確 ──
const jsFiles = srcs.filter(s => s.endsWith('.js'));
const syntaxBad = [];
jsFiles.forEach(f => { try { new vm.Script(read(f)); } catch (e) { syntaxBad.push(f + ': ' + e.message); } });
ok(syntaxBad.length === 0, `${jsFiles.length} 支 JS 語法都正確` + (syntaxBad.length ? '\n     ' + syntaxBad.join('\n     ') : ''));

// ── 3. 頂層宣告不得重複（同一個全域作用域，重複會整站炸掉）──
const decls = {}, dupes = [];
jsFiles.forEach(f => {
  [...read(f).matchAll(/^(?:const|let|var|function|async function)\s+([A-Za-z_$][\w$]*)/gm)].forEach(m => {
    const n = m[1];
    if (decls[n] && decls[n] !== f) dupes.push(`${n} (${decls[n]} vs ${f})`);
    else decls[n] = f;
  });
});
ok(dupes.length === 0, '頂層宣告無重複' + (dupes.length ? ': ' + dupes.join(', ') : ''));

// ── 4. 每頁都有註冊、帶 html、id 對得上 ──
const regs = [];
jsFiles.filter(f => f.startsWith('pages/')).forEach(f => {
  const src = read(f);
  const m = src.match(/registerPage\('([^']+)',\s*\{([\s\S]*)\n\}\);/);
  if (!m) { regs.push({ file: f, bad: true }); return; }
  const hm = m[2].match(/html:\s*`([\s\S]*?)`,\s*$/);
  const am = m[2].match(/actions:\s*`([\s\S]*?)`,\n/);
  regs.push({ file: f, name: m[1], body: m[2], html: hm ? hm[1] : null, actions: am ? am[1] : '' });
});
ok(regs.filter(r => r.bad).length === 0, `${regs.length} 支頁面 JS 都有 registerPage`);
const noHtml = regs.filter(r => !r.html);
ok(noHtml.length === 0, '每頁都帶了 html' + (noHtml.length ? ': ' + noHtml.map(r => r.file) : ''));
const badId = regs.filter(r => r.html && !r.html.includes(`id="page-${r.name}"`));
ok(badId.length === 0, 'html 的 id="page-X" 與註冊名一致' + (badId.length ? ': ' + badId.map(r => r.name) : ''));
const notLoaded = regs.filter(r => !srcs.includes(r.file));
ok(notLoaded.length === 0, '每支頁面 JS 都在外殼的 <script> 清單裡' + (notLoaded.length ? ': ' + notLoaded.map(r => r.file) : ''));

// ── 5. 雙擊開啟（file://）的前提 ──
ok(fs.readdirSync(DIR + 'pages').every(f => f.endsWith('.js')), 'pages/ 底下只剩 .js（沒有靠 fetch 抓的片段）');
const usesFetch = jsFiles.filter(f => /\bfetch\s*\(/.test(read(f)));
ok(usesFetch.length === 0, '自家程式碼沒有用 fetch（file:// 會被 CORS 擋）' + (usesFetch.length ? ': ' + usesFetch : ''));
ok(!/XMLHttpRequest/.test(jsFiles.map(read).join('')), '也沒有用 XMLHttpRequest');

// ── 5b. 每個穴道都要有小人圖 ──
{
  const vm2 = require('vm');
  const ctx = { console, localStorage: { getItem: () => null, setItem() {} } };
  vm2.createContext(ctx);
  vm2.runInContext(read('js/acu-data.js'), ctx);
  vm2.runInContext(read('js/minions.js'), ctx);
  // 頂層 const 進的是 vm 的語彙環境不是 context 物件，所以要用 runInContext 取值
  const names = JSON.parse(vm2.runInContext('JSON.stringify(ACUPOINTS.map(a=>a.name))', ctx));
  const slugMap = JSON.parse(vm2.runInContext('JSON.stringify(MINION_SLUG)', ctx));
  const noSlug = names.filter(n => !slugMap[n]);
  ok(noSlug.length === 0, `${names.length} 個穴道都有小人代號` + (noSlug.length ? ': ' + noSlug : ''));
  const noFile = names.filter(n => !fs.existsSync(DIR + `assets/minions/${slugMap[n]}.svg`));
  ok(noFile.length === 0, '每個穴道的小人 SVG 檔都在' + (noFile.length ? ': ' + noFile : ''));
  const slugs = names.map(n => slugMap[n]);
  ok(new Set(slugs).size === slugs.length, '沒有兩個穴道共用同一隻小人');
  const orphanSvg = fs.readdirSync(DIR + 'assets/minions')
    .filter(f => f.endsWith('.svg'))
    .filter(f => !slugs.includes(f.replace('.svg', '')));
  ok(orphanSvg.length === 0, 'assets/minions 底下沒有多餘的檔' + (orphanSvg.length ? ': ' + orphanSvg : ''));

  // 參考圖：acu-data 宣告了 ref 的穴道，圖檔就一定要在（沒宣告的會顯示「尚無參考圖」）
  const refs = JSON.parse(vm2.runInContext(
    'JSON.stringify(ACUPOINTS.filter(a=>a.ref).map(a=>({n:a.name,f:a.ref})))', ctx));
  const noRefFile = refs.filter(r => !fs.existsSync(DIR + 'assets/acu-ref/' + r.f.replace('.png', '.jpg')));
  ok(noRefFile.length === 0,
     `${refs.length} 個宣告了 ref 的穴道都有參考圖` + (noRefFile.length ? ': ' + noRefFile.map(r => r.n) : ''));
  const refFiles = fs.existsSync(DIR + 'assets/acu-ref') ? fs.readdirSync(DIR + 'assets/acu-ref') : [];
  const orphanRef = refFiles.filter(f => !refs.some(r => r.f.replace('.png', '.jpg') === f));
  ok(orphanRef.length === 0, 'assets/acu-ref 底下沒有沒人用的圖' + (orphanRef.length ? ': ' + orphanRef : ''));
  const bigRef = refFiles.filter(f => fs.statSync(DIR + 'assets/acu-ref/' + f).size > 200 * 1024);
  ok(bigRef.length === 0, '參考圖都在 200KB 以內（原圖 800KB 不要直接放進來）' + (bigRef.length ? ': ' + bigRef : ''));
}

// ── 6. tab 值必須是分頁列的四個之一 ──
const tabs = [...shell.matchAll(/data-tab="([^"]+)"/g)].map(x => x[1]);
ok(tabs.join(',') === 'home,gallery,settings,profile', '分頁列四格順序: ' + tabs.join(','));
const badTab = regs.filter(r => { const m = r.body && r.body.match(/tab:\s*'([^']+)'/); return m && !tabs.includes(m[1]); });
ok(badTab.length === 0, '每頁的 tab 都在分頁列裡' + (badTab.length ? ': ' + badTab.map(r => r.name) : ''));

// ── 7. inline handler 都有定義 ──
const allHtml = shell + regs.map(r => (r.html || '') + (r.actions || '')).join('\n');
const handlers = [...new Set([...allHtml.matchAll(/on(?:click|change|input)="([A-Za-z_$][\w$]*)\(/g)].map(x => x[1]))];
const badH = handlers.filter(h => !decls[h]);
ok(handlers.length > 10 && badH.length === 0, `${handlers.length} 個 inline handler 都有定義` + (badH.length ? ': ' + badH : ''));

// ── 8. getElementById 目標存在 ──
const ids = new Set([...allHtml.matchAll(/id="([^"]+)"/g)].map(x => x[1]));
const usedIds = [...new Set(jsFiles.flatMap(f => [...read(f).matchAll(/getElementById\(['"`]([^'"`$]+)['"`]\)/g)].map(x => x[1])))];
const badIds = usedIds.filter(i => !ids.has(i));
ok(badIds.length === 0, `${usedIds.length} 個 getElementById 目標都存在` + (badIds.length ? ': ' + badIds : ''));

// ── 9. i18n ──
const i18nSrc = read('js/i18n.js');
const zh = i18nSrc.match(/zh: \{([\s\S]*?)\n  \},/)[1];
const en = i18nSrc.match(/en: \{([\s\S]*?)\n  \}\n\};/)[1];
const keys = s => new Set([...s.matchAll(/'([\w-]+)':/g)].map(x => x[1]));
const kz = keys(zh), ke = keys(en);
const onlyZh = [...kz].filter(k => !ke.has(k)), onlyEn = [...ke].filter(k => !kz.has(k));
ok(onlyZh.length === 0 && onlyEn.length === 0, `i18n 中英各 ${kz.size}/${ke.size} 個 key 對齊` + (onlyZh.length ? ' 缺EN:' + onlyZh : '') + (onlyEn.length ? ' 缺ZH:' + onlyEn : ''));

const dk = [...new Set([...allHtml.matchAll(/data-i18n="([^"]+)"/g)].map(x => x[1]))];
const badDk = dk.filter(k => !kz.has(k));
ok(dk.length > 30 && badDk.length === 0, `${dk.length} 個 data-i18n key 都有翻譯` + (badDk.length ? ': ' + badDk : ''));

const tk = [...new Set(jsFiles.flatMap(f => [...read(f).matchAll(/\bt\('([\w-]+)'\)/g)].map(x => x[1])))];
const badTk = tk.filter(k => !kz.has(k));
ok(badTk.length === 0, `${tk.length} 個 t() key 都有翻譯` + (badTk.length ? ': ' + badTk : ''));

const stepLabels = regs.map(r => r.body && r.body.match(/stepLabel:\s*'([^']+)'/)).filter(Boolean).map(m => m[1]);
ok(stepLabels.length === 5 && stepLabels.every(k => kz.has(k)), '步驟軌 5 個 stepLabel 都有翻譯');

// 沒有孤兒翻譯（改版後留下的死 key）。
// 用「字面出現過」判斷，因為有些 key 是三元運算選的：t(x ? 'a' : 'b')
const elsewhere = jsFiles.filter(f => f !== 'js/i18n.js').map(read).join('') + allHtml;
const orphans = [...kz].filter(k => !elsewhere.includes(`'${k}'`) && !elsewhere.includes(`"${k}"`));
ok(orphans.length === 0, '沒有沒人用的翻譯 key' + (orphans.length ? ': ' + orphans : ''));

// ── 10. 外殼保持乾淨 ──
ok(!/<style>/.test(shell), '外殼不再內嵌 <style>');
ok(!/function showPage/.test(shell), '外殼不再內嵌 JS');

console.log(fail ? `\n=== ${fail} 項失敗 ===` : '\n=== 全過 ===');
process.exit(fail ? 1 : 0);
