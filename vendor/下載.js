// MediaPipe 離線化：把 CDN 上那三個套件抓成本機檔。
//
//   cd 比賽專區/demo網站 && node vendor/下載.js
//
// 為什麼要離線化：決賽現場網路不穩的話，走 CDN 的 wasm 一抓不到整個定位就掛，
// 而決賽最重的那一格「可行性 35%」括號裡寫的就是穩定性。
//
// ⚠️ 這些檔案（約 42MB）**不進版控**（見 .gitignore），因為是 Google 的著作、
//    而且純粹是可重建的下載物。換一台電腦就重跑這支，要網路，跑一次。
//    這跟 repo 既有的做法一致（NanoDet 建置產物、.task 解包出來的權重都是這樣處理）。
//
// ⚠️ 版本號必須跟 acunavi-ideal.html 的 <script src> 一致。
//    JS 與 wasm 資產版本不匹配會偶發載入失敗，而且很難查。

const fs = require('fs');
const path = require('path');
const https = require('https');

const PKGS = [
  {
    dir: 'hands',
    npm: '@mediapipe/hands@0.4.1646424915',
    files: [
      'hands.js', 'hands.binarypb',
      'hand_landmark_full.tflite',       // modelComplexity: 1 用這個
      'hand_landmark_lite.tflite',       // 改成 0 時才用得到，一起帶著免得日後漏抓
      'hands_solution_packed_assets.data', 'hands_solution_packed_assets_loader.js',
      'hands_solution_simd_wasm_bin.data', 'hands_solution_simd_wasm_bin.js', 'hands_solution_simd_wasm_bin.wasm',
      'hands_solution_wasm_bin.js', 'hands_solution_wasm_bin.wasm',   // 沒有 SIMD 的瀏覽器會退到這組
    ],
  },
  {
    dir: 'face_mesh',
    npm: '@mediapipe/face_mesh@0.4.1633559619',
    files: [
      'face_mesh.js', 'face_mesh.binarypb',
      // refineLandmarks（虹膜 468–477）用的 attention mesh 就打包在這個 .data 裡，沒有獨立檔案
      'face_mesh_solution_packed_assets.data', 'face_mesh_solution_packed_assets_loader.js',
      'face_mesh_solution_simd_wasm_bin.data', 'face_mesh_solution_simd_wasm_bin.js', 'face_mesh_solution_simd_wasm_bin.wasm',
      'face_mesh_solution_wasm_bin.js', 'face_mesh_solution_wasm_bin.wasm',
    ],
  },
  {
    dir: 'camera_utils',
    npm: '@mediapipe/camera_utils@0.3.1640029074',
    files: ['camera_utils.js'],
  },
];

const ROOT = __dirname;
const mb = (n) => (n / 1048576).toFixed(2) + ' MB';

function get(url, dest, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('轉址太多次: ' + url));
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(get(res.headers.location, dest, redirects + 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} ${url}`));
      }
      // 先寫暫存再改名：中途斷線不會留下一個看起來正常的半截檔
      const tmp = dest + '.part';
      const out = fs.createWriteStream(tmp);
      res.pipe(out);
      out.on('finish', () => out.close(() => {
        fs.renameSync(tmp, dest);
        resolve(fs.statSync(dest).size);
      }));
      out.on('error', (e) => { try { fs.unlinkSync(tmp); } catch {} reject(e); });
    }).on('error', reject);
  });
}

(async () => {
  let total = 0, got = 0, skipped = 0;
  for (const pkg of PKGS) {
    const dir = path.join(ROOT, 'mediapipe', pkg.dir);
    fs.mkdirSync(dir, { recursive: true });
    console.log(`\n── ${pkg.npm}`);
    for (const f of pkg.files) {
      const dest = path.join(dir, f);
      if (fs.existsSync(dest)) {
        const size = fs.statSync(dest).size;
        total += size; skipped++;
        console.log(`   已有  ${f.padEnd(42)} ${mb(size)}`);
        continue;
      }
      const size = await get(`https://cdn.jsdelivr.net/npm/${pkg.npm}/${f}`, dest);
      total += size; got++;
      console.log(`   下載  ${f.padEnd(42)} ${mb(size)}`);
    }
  }
  console.log(`\n完成：新下載 ${got} 個、已存在 ${skipped} 個，合計 ${mb(total)}`);
  console.log('現在用 啟動.bat（本機伺服器）開就是全離線的了。');
})().catch(e => { console.error('\n下載失敗：', e.message); process.exit(1); });
