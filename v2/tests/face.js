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
  ;return { FLM, FACE_ACUPOINTS, FACE_IMPLEMENTED, FACE_NO_GT, FACE_GT_DISPUTED,
            FACE_FORMULA, FACE_SYMPTOM_MAP,
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
  // 挑哪一張照片來驗，有三條規則，都是踩過坑才加的：
  //
  //  ① 要**最新**那份標注（檔名字母序 = 時間序）。
  //     2026-08-23 發現原本寫 files[0]，等於永遠拿 08-09 那批只有 7 筆的舊檔，
  //     後來補的穴道因為舊檔沒對應標注，誤差斷言全部被靜靜跳過。
  //  ② 只取每份檔案的**第 1 張照片**。
  //     2026-09-15 查出標注工具載入第 2 張以後的照片時 landmark 會偏
  //    （同一張 S__30269448_0.jpg 排第 2 張時偏 mean 68.8px，排第 1 張只偏 3.9px）。
  //  ③ 必須是**正臉**（facing > 0.9）。
  //     2026-09-14 起標注檔裡開始有側臉照，正臉公式在那上面不適用
  //    （側臉的 facing 實測是 0.000，roll 也有 -24°）。
  const cands = [];
  files.forEach(f => {
    const j = JSON.parse(fs.readFileSync(ANNOT + f, 'utf8'));
    const p0 = (j.photos || [])[0];                    // 規則②
    if (!p0 || !p0.landmarks || p0.landmarks.length !== 478) return;
    const pose = api.faceHeadPose(p0.landmarks, p0.width, p0.height);
    if (!pose || pose.facing <= 0.9) return;           // 規則③
    cands.push({ file: f, d: j, ph: p0 });
  });
  ok(cands.length > 0, `有正臉可驗（${cands.length} 份標注檔的第 1 張是正臉）`);
  const picked = cands.sort((a, b) => a.file < b.file ? -1 : 1).pop();   // 規則①
  const d = picked.d, latest = picked.file;
  console.log(`使用標注：${latest}（${picked.ph.filename}）`);

  const ph = picked.ph;
  ok(!!ph, '標注檔裡有 landmark');
  ok(ph.landmarks.length === 478, `478 點（實得 ${ph.landmarks.length}）—— refineLandmarks 有開`);

  const W = ph.width, H = ph.height;
  const lm = ph.landmarks;
  const fr = api.faceFrame(lm, W, H);
  ok(!!fr, 'faceFrame 算得出來');
  ok(Math.abs(fr.ipd - ph.scalesPx.ipd) < 0.01,
     `瞳距與標注工具算的一致（${fr.ipd.toFixed(2)} vs ${ph.scalesPx.ipd}）`);

  const pose = api.faceHeadPose(lm, W, H);
  ok(Math.abs(pose.rollDeg) < 5, `roll 在 ±5° 內（實得 ${pose.rollDeg.toFixed(2)}°）`);
  ok(pose.facing > 0.9, `正面照 facing 應該高（實得 ${pose.facing.toFixed(3)}）`);

  // ⚠️ 有些標注的左右與 canonical mesh 相反（鏡像自拍卻沒按 X，或按了 X 的反過來）。
  //    JSON 的 `mirrored` 欄記的是「標注時有沒有按 X」，**不是**「照片是不是鏡像」，
  //    所以不能拿它判斷（2026-09-14 ten_2 那份就是 mirrored=true 但不需要對調）。
  //    → 兩種都算一遍，取平均誤差小的那個。對的那份約 2~6%，錯的是 50~100%，差距極大不會選錯。
  const build = (swap) => {
    const g = {};
    d.records.filter(r => r.filename === ph.filename).forEach(r => {
      const k = !swap ? r.key
              : r.key.endsWith('_R') ? r.key.slice(0, -2) + '_L'
              : r.key.endsWith('_L') ? r.key.slice(0, -2) + '_R' : r.key;
      g[k] = { x: r.humanX, y: r.humanY, name: r.acupoint };
    });
    return g;
  };
  const meanOf = (g) => {
    let s = 0, c = 0;
    [...api.FACE_IMPLEMENTED].forEach(code => {
      if (api.FACE_NO_GT.has(code)) return;
      (api.computeFaceAcupoint(code, lm, W, H) || []).forEach(p => {
        const q = g[`${code}_${p.side}`];
        if (!q) return;
        s += Math.hypot(p.x - q.x, p.y - q.y) / fr.ipd * 100; c++;
      });
    });
    return c ? s / c : Infinity;
  };
  const swapped = meanOf(build(true)) < meanOf(build(false));
  console.log(`左右對調：${swapped ? '要' : '不要'}（自動判定）`);
  const gt = build(swapped);

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

  // 第二種標注錯誤：整份的左右已經判對了，但**個別穴道**自己標反了
  //（2026-09-14 ten_2 那份的承泣／四白就是這樣：其餘 10 穴都對，只有這兩穴是 100%+）。
  // 判準：把這一穴的左右對調後誤差掉到原本的 1/5 以下，且原本大於 20% —— 這不可能是巧合。
  api.FACE_ACUPOINTS.filter(a => a.bilateral).forEach(a => {
    if (api.FACE_NO_GT.has(a.code) || KNOWN_BAD.has(a.code + '_R')) return;
    const pts = api.computeFaceAcupoint(a.code, lm, W, H);
    if (!pts || pts.length !== 2) return;
    const e = (p, key) => {
      const g = gt[key];
      return g ? Math.hypot(p.x - g.x, p.y - g.y) / fr.ipd * 100 : null;
    };
    const now = pts.map(p => e(p, `${a.code}_${p.side}`));
    const alt = pts.map(p => e(p, `${a.code}_${p.side === 'R' ? 'L' : 'R'}`));
    if (now.some(v => v == null) || alt.some(v => v == null)) return;
    const mn = (v) => (v[0] + v[1]) / 2;
    if (mn(now) > 20 && mn(alt) < mn(now) / 5) {
      KNOWN_BAD.add(a.code + '_R'); KNOWN_BAD.add(a.code + '_L');
      console.log(`SKIP ${a.name} 這一穴的左右標反了`
                + `（現在 ${mn(now).toFixed(1)}%，對調後 ${mn(alt).toFixed(1)}%）→ 該重標`);
    }
  });

  // 第三種：標注**本身**有爭議的穴道（幾份標注彼此矛盾）。
  // 這跟「標反」一樣是資料問題不是公式問題，比誤差沒有意義 → 跳過並印出原因。
  // ⚠️ 不是放寬標準：原因寫在 FACE_GT_DISPUTED，每一筆都登記在 記錄控制/待驗證清單.md，
  //    重標之後要把該穴從那個 Map 移除，數字就會自動回到統計裡。
  api.FACE_GT_DISPUTED.forEach((why, code) => {
    console.log(`SKIP ${code} 標注本身有爭議 → ${why}`);
    KNOWN_BAD.add(code + '_R'); KNOWN_BAD.add(code + '_L'); KNOWN_BAD.add(code + '_M');
  });

  let n = 0, sum = 0, worst = 0, worstKey = '';
  [...api.FACE_IMPLEMENTED].forEach(code => {
    const pts = api.computeFaceAcupoint(code, lm, W, H);
    ok(!!pts, `${code} 算得出座標`);
    if (!pts) return;
    // 沒有 GT 的穴道（用戶指定定義）只驗「算得出來」，不比誤差 —— 比了也沒意義
    if (api.FACE_NO_GT.has(code)) return;
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
  // 每個 IMPLEMENTED 的穴道都必須真的被標注驗過，否則「已實作」是空頭支票。
  // ⚠️ 涵蓋率要看**所有**標注檔的聯集，不能只看最新那份 —— 每個人標的穴道範圍不一樣
  //    （ten_2 沒標陽白、duke 只標了眼周），只看一份會誤報。
  const allCodes = new Set();
  files.forEach(f => {
    const j = JSON.parse(fs.readFileSync(ANNOT + f, 'utf8'));
    (j.records || []).forEach(r => allCodes.add(r.key.replace(/_[RLM]$/, '')));
  });
  const unverified = [...api.FACE_IMPLEMENTED]
    .filter(c => !api.FACE_NO_GT.has(c))
    .filter(c => !allCodes.has(c));
  ok(unverified.length === 0,
     '每個已實作的穴道都有標注可驗（看全部標注檔）'
     + (unverified.length ? `：缺 ${unverified.join(', ')}` : ''));
  ok([...api.FACE_NO_GT.keys()].every(c => api.FACE_IMPLEMENTED.has(c)),
     'FACE_NO_GT 裡的穴道都真的實作了（否則是列錯）');
  ok(sum / n < 4, `平均 NME ${(sum / n).toFixed(2)}% < 4%（最差 ${worstKey} ${worst.toFixed(2)}%）`);
}

// ── face-anchor.js：A 網格錨定 ＋ D 遠側隱藏（2026-09-24）──
{
  const an = new Function('isZh', src + '\n' + fs.readFileSync(DIR + 'js/face-anchor.js', 'utf8') + `
    ;return { FACE_FORMULA, computeFaceAcupoint, faceYawDeg, faceFarSide, faceAnchorReset,
              computeFaceAcupointAnchored, FACE_ANCHOR_SKIP, FACE_FAR_HIDE_DEG, FACE_BIND_MAX_DEG,
              faceTurnUpdate, FACE_FAR_SHOW_DEG };`)(() => true);

  // 轉太多（批 E-2，同 App FaceAnchor 批 65）：遲滯 30° 進、25° 出；只選側臉 6 穴不叫人回正
  {
    const flat = Array.from({ length: 478 }, () => ({ x: .5, y: .5, z: 0 }));
    an.faceAnchorReset();
    const seq = [20, 31, 26, 24].map(y => an.faceTurnUpdate(y, ['EX-HN3'], flat).turnedAway);
    ok(seq.join() === 'false,true,true,false', `轉頭遲滯：20°不藏、31°藏、26°仍藏、24°解除（${seq}）`);
    ok(an.faceTurnUpdate(40, ['ST7'], flat).turnedAway === false, '只選側臉穴 → 不叫人回正');
    ok(an.faceTurnUpdate(40, ['EX-HN3'], flat).far === 'L' && an.faceTurnUpdate(-40, ['EX-HN3'], flat).far === 'R',
       '遠側：正 yaw 藏 L、負 yaw 藏 R');
    an.faceAnchorReset();
  }
  const f0 = files.filter(f => /self/.test(f)).sort().pop();
  const ph = f0 && JSON.parse(fs.readFileSync(ANNOT + f0, 'utf8')).photos[0];
  if (!ph || !ph.landmarks || ph.landmarks[0].z == null) {
    console.log('SKIP 沒有帶 z 的正臉 landmark，跳過錨定測試');
  } else {
    const W = ph.width, H = ph.height, lm = ph.landmarks;
    const codes = Object.keys(an.FACE_FORMULA);
    // 繞臉中心的垂直軸轉 deg 度（正交投影，z 與 x 同尺度）
    const rot = (deg) => {
      const t = deg * Math.PI / 180, c = Math.cos(t), s2 = Math.sin(t);
      const cx = lm.reduce((a, p) => a + p.x, 0) / lm.length, cz = lm.reduce((a, p) => a + p.z, 0) / lm.length;
      return lm.map(p => ({ x: cx + (p.x - cx) * c - (p.z - cz) * s2, y: p.y, z: cz + (p.x - cx) * s2 + (p.z - cz) * c }));
    };
    const y0 = an.faceYawDeg(lm, W);
    ok(Math.abs(y0) < an.FACE_BIND_MAX_DEG, `正臉照 yaw3D ${y0.toFixed(1)}° 在綁定範圍內`);
    const y35 = an.faceYawDeg(rot(35), W);
    ok(Math.abs(Math.abs(y35 - y0) - 35) < 3, `人工轉 35° → yaw3D 變化 ${(y35 - y0).toFixed(1)}°（容差 3°）`);
    ok(an.faceFarSide(10) === null && an.faceFarSide(40) === 'L' && an.faceFarSide(-40) === 'R',
       `遠側判定：±${an.FACE_FAR_HIDE_DEG}° 以內不藏、正 yaw 藏 L、負 yaw 藏 R`);

    an.faceAnchorReset();
    let maxd = 0;
    codes.forEach(c => {
      const raw = an.computeFaceAcupoint(c, lm, W, H) || [];
      const got = an.computeFaceAcupointAnchored(c, lm, W, H, y0, 0).pts || [];
      raw.forEach((p, k) => { maxd = Math.max(maxd, Math.hypot(p.x - got[k].x, p.y - got[k].y)); });
    });
    ok(maxd < 1e-6, `正臉下錨定點 ＝ 公式點（最大差 ${maxd.toExponential(1)} px）`);

    const L = rot(40), yL = an.faceYawDeg(L, W), far = an.faceFarSide(yL);
    const st2 = an.computeFaceAcupointAnchored('ST2', L, W, H, yL, 10);
    ok(far && st2.pts.length === 1 && st2.pts[0].side !== far, `轉 40°：四白只剩近側一點（藏 ${far}）`);
    const raw6 = an.computeFaceAcupoint('ST6', L, W, H).filter(p => p.side !== far);
    const got6 = an.computeFaceAcupointAnchored('ST6', L, W, H, yL, 10).pts;
    ok(an.FACE_ANCHOR_SKIP.has('ST6') && got6[0].x === raw6[0].x && got6[0].y === raw6[0].y,
       '側臉 6 穴不錨定（照舊公式）');

    // 批 E-2：這一幀先 faceTurnUpdate（真實流程都會）→ 轉 40° 時正臉類兩側一起藏，側臉穴只藏遠側
    an.faceAnchorReset();
    an.faceTurnUpdate(yL, ['ST2', 'ST6'], L);
    ok(an.computeFaceAcupointAnchored('ST2', L, W, H, yL, 10).pts === null, '轉 40°＋faceTurnUpdate：四白兩側一起藏（同 App）');
    const g6 = an.computeFaceAcupointAnchored('ST6', L, W, H, yL, 10).pts;
    ok(g6 && g6.every(p => p.side !== far), '側臉穴仍只藏遠側');

    an.faceAnchorReset();
    ok(an.computeFaceAcupointAnchored('ST2', L, W, H, yL, 0).unbound === true,
       '沒在正臉綁過就轉頭 → 回報 unbound（讀數條提示先正對）');
    an.computeFaceAcupointAnchored('ST2', lm, W, H, y0, 0);
    ok(an.computeFaceAcupointAnchored('ST2', L, W, H, yL, 100).unbound === false, '正臉綁過再轉頭 → 用綁定');
    an.computeFaceAcupointAnchored('ST2', L, W, H, yL, 5000);
    ok(an.computeFaceAcupointAnchored('ST2', L, W, H, yL, 5010).unbound === true,
       '臉消失超過 1.5 秒 → 綁定清掉');
  }
}

console.log(fail ? `\n=== ${fail} 項失敗 ===` : '\n=== 全過 ===');
process.exit(fail ? 1 : 0);
