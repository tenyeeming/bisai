// 一次跑完三支測試，只印每支的結果與失敗細節。
//   npm test        （等同 node tests/run.js）
//   node tests/run.js --verbose   連 PASS 一起印
const { spawnSync } = require('child_process');
const path = require('path');

const verbose = process.argv.includes('--verbose') || process.argv.includes('-v');
const SUITES = [
  ['check',  '靜態檢查（不需要套件）'],
  ['e2e',    '端對端流程（需要 jsdom）'],
  ['mirror', '鏡像繪製（需要 jsdom + 測試記錄/）'],
  ['face',   '臉部公式（需要 臉部/標注結果/）'],
];

let bad = 0;
for (const [file, desc] of SUITES) {
  const r = spawnSync(process.execPath, [path.join(__dirname, file + '.js')], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  const pass = (out.match(/^PASS /gm) || []).length;
  const fails = (out.match(/^FAIL .*/gm) || []);

  const mark = r.status === 0 ? '✓' : '✗';
  console.log(`${mark} ${file.padEnd(7)} ${String(pass).padStart(3)} 項通過   ${desc}`);
  if (verbose) console.log(out.replace(/^/gm, '    '));
  else fails.forEach(f => console.log('    ' + f));

  if (r.status !== 0) {
    bad++;
    if (!fails.length) console.log(out.replace(/^/gm, '    '));   // 不是斷言失敗而是整支炸了
  }
}

console.log(bad ? `\n=== ${bad} 支測試沒過 ===` : '\n=== 全部通過 ===');
process.exit(bad ? 1 : 0);
