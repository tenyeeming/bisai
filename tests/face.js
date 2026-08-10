// 臉部公式測試：拿真實的人工標注（`臉部/標注結果/*.json`）驗 js/face-math.js。
//
// 這支的重點不是「準不準」（常數就是從這批標注 fit 的，那是訓練誤差），
// 而是**網頁版的公式與 Python 版 `臉部/face_acu.py` 沒有分家**。
// 兩邊只要有人改了一邊沒改另一邊，這裡的數字就會跑掉。
//   node tests/face.js
const fs = require('fs'), path = require('path');

const DIR = path.join(__dirname, '..').replace(/\\/g, '/') + '/';
const ANNOT = path.join(__dirname, '../../../臉部/標注結果').replace(/\\/g, '/') + '/';

let fail = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };

// ── 把兩支 js 直接 eval 進來（它們是普通 script，沒有 module）──
const sandbox = { isZh: () => true };
const load = (f) => {
  const src = fs.readFileSync(DIR + f, 'utf8');
  // 用 Function 而不是 require：檔案是瀏覽器用的全域腳本，沒有 exports
  const names = Object.keys(sandbox);
  const fn = new Function(...names, src + '\n;return {FLM, FACE_ACUPOINTS: typeof FACE_ACUPOINTS!=="undefined"?FACE_ACUPOINTS:null};');
  return fn(...names.map(n => sandbox[n]));
};

// face-data 與 face-math 有相依（math 用 FLM / faceAcu），所以串成同一段 eval
const src = fs.readFileSync(DIR + 'js/face-data.js', 'utf8') + '\n'
          + fs.readFileSync(DIR + 'js/face-math.js', 'utf8');
const api = new Function('isZh', src + `
  ;return { FLM, FACE_ACUPOINTS, FACE_IMPLEMENTED, FACE_FORMULA, FACE_SYMPTOM_MAP,
            faceRecommend, faceFrame, computeFaceAcupoint, faceHeadPose, faceDiscR };
`)(() => true);

// ── 資料表本身 ──
ok(api.FACE_ACUPOINTS.length === 23, `23 個臉部穴道（實得 ${api.FACE_ACUPOINTS.length}）`);
ok(api.FACE_ACUPOINTS.filter(a => a.bilateral).length === 18, '18 個雙側穴');
ok(api.FACE_ACUPOINTS.filter(a => !a.bilateral).length === 5, '5 個正中單穴');
ok([...api.FACE_IMPLEMENTED].every(c => api.FACE_ACUPOINTS.some(a => a.code === c)),
   'IMPLEMENTED 裡的代碼都存在於穴道表');
ok([...api.FACE_IMPLEMENTED].every(c => api.FACE_FORMULA[c]),
   'IMPLEMENTED 裡的穴道都有公式');
ok(Object.keys(api.FACE_FORMULA).every(c => api.FACE_IMPLEMENTED.has(c)),
   '有公式的穴道都標成 IMPLEMENTED（沒有寫了卻沒開放的）');
ok(Object.values(api.FACE_FORMULA).every(f => f.src && f.src.length > 5),
   '每條公式都寫了參數來源（provenance）');
const badSym = Object.values(api.FACE_SYMPTOM_MAP).flat()
  .filter(c => !api.FACE_ACUPOINTS.some(a => a.code === c));
ok(badSym.length === 0, '症狀表裡沒有不存在的穴道代碼' + (badSym.length ? '：' + badSym : ''));

// ── 拿真實標注驗公式 ──
const files = fs.existsSync(ANNOT) ? fs.readdirSync(ANNOT).filter(f => f.endsWith('.json')) : [];
if (!files.length) {
  console.log('SKIP 沒有標注檔（臉部/標注結果/*.json），跳過誤差比對');
} else {
  const d = JSON.parse(fs.readFileSync(ANNOT + files[0], 'utf8'));
  console.log(`使用標注：${files[0]}`);

  const ph = d.photos.find(p => p.landmarks);
  ok(!!ph, '標注檔裡有 landmark');
  ok(ph.landmarks.length === 478, `478 點（實得 ${ph.landmarks.length}）—— refineLandmarks 有開`);

  const W = ph.width, H = ph.height;
  const lm = ph.landmarks;
  const fr = api.faceFrame(lm, W, H);
  ok(!!fr, 'faceFrame 算得出來');
  ok(Math.abs(fr.ipd - ph.scalesPx.ipd) < 0.01,
     `瞳距與標注工具算的一致（${fr.ipd.toFixed(2)} vs ${ph.scalesPx.ipd}）`);

  const pose = api.faceHeadPose(lm, W, H);
  ok(Math.abs(pose.rollDeg + 2.73) < 0.05, `roll ≈ −2.73°（實得 ${pose.rollDeg.toFixed(2)}）`);
  ok(pose.facing > 0.9, `正面照 facing 應該高（實得 ${pose.facing.toFixed(3)}）`);

  // ⚠️ 這批標注的左右與 canonical mesh 相反（照片是鏡像自拍），
  //    所以比對時要把 GT 的 R/L 對調 —— 跟 `臉部/驗證.py --swap` 同一件事
  const gt = {};
  d.records.filter(r => r.filename === ph.filename).forEach(r => {
    const k = r.key.endsWith('_R') ? r.key.slice(0, -2) + '_L'
            : r.key.endsWith('_L') ? r.key.slice(0, -2) + '_R' : r.key;
    gt[k] = { x: r.humanX, y: r.humanY, name: r.acupoint };
  });

  // 排除明顯標錯的標注：雙側穴的左右兩筆若 x 幾乎相同，代表有一筆漏跳到
  // 另一邊（實際發生過：四白兩筆 x 完全一樣）。這種點不該計入誤差統計。
  // 自動偵測而不是寫死，重標之後這裡會自己失效。
  const KNOWN_BAD = new Set();
  api.FACE_ACUPOINTS.filter(a => a.bilateral).forEach(a => {
    const r = gt[a.code + '_R'], l = gt[a.code + '_L'];
    if (r && l && Math.abs(r.x - l.x) < 1) {
      KNOWN_BAD.add(a.code + '_R'); KNOWN_BAD.add(a.code + '_L');
      console.log(`SKIP ${a.name} 左右兩筆 x 相同（${r.x}），視為標注錯誤`);
    }
  });

  let n = 0, sum = 0, worst = 0, worstKey = '';
  [...api.FACE_IMPLEMENTED].forEach(code => {
    const pts = api.computeFaceAcupoint(code, lm, W, H);
    ok(!!pts, `${code} 算得出座標`);
    if (!pts) return;
    pts.forEach(p => {
      const key = `${code}_${p.side}`;
      const g = gt[key];
      if (!g || KNOWN_BAD.has(key)) return;
      const nme = Math.hypot(p.x - g.x, p.y - g.y) / fr.ipd * 100;
      n++; sum += nme;
      if (nme > worst) { worst = nme; worstKey = key; }
      ok(nme < 8, `${g.name} ${key} NME ${nme.toFixed(2)}% < 8%`);
    });
  });
  ok(n >= 6, `比對了 ${n} 個點`);
  ok(sum / n < 4, `平均 NME ${(sum / n).toFixed(2)}% < 4%（最差 ${worstKey} ${worst.toFixed(2)}%）`);
}

console.log(fail ? `\n=== ${fail} 項失敗 ===` : '\n=== 全過 ===');
process.exit(fail ? 1 : 0);
