// ═══════════════════════════════════════════════════════════════════
// MediaPipe 從哪裡載
//
// 決賽現場網路不穩的話，走 CDN 的 wasm 一抓不到整個定位就掛，
// 所以要能離線。但離線化不能把「雙擊就開」這個特性弄壞，於是分兩層：
//
//   ① 那三支 .js —— 一律先讀本機 vendor/，讀不到才用 onerror 退回 CDN。
//      <script src> 不受 CORS 管，所以 file:// 底下也讀得到。
//
//   ② wasm / tflite / .data —— **只有用 http(s) 開的時候**才吃本機檔。
//      MediaPipe 內部是用 fetch 抓這些的，而 file:// 是匿名來源，
//      fetch 讀鄰居檔案一律被擋 → 雙擊開的時候這些只能走 CDN。
//
// 換句話說：
//   雙擊 acunavi-ideal.html  → 跟以前一樣，要網路（沒有變差）
//   啟動.bat / GitHub Pages  → 全離線，完全不碰網路  ← 決賽走這條
//
// 本機檔案怎麼來：`node vendor/下載.js`（約 40MB，不進版控）。
// 沒下載也不會壞，只是每一項都退回 CDN。
// ⚠️ 版本號改了要三個地方一起改：這裡、acunavi-ideal.html、vendor/下載.js。
// ═══════════════════════════════════════════════════════════════════

const MP_CDN = 'https://cdn.jsdelivr.net/npm/';
const MP_PKG = {
  hands:        '@mediapipe/hands@0.4.1646424915',
  face_mesh:    '@mediapipe/face_mesh@0.4.1633559619',
  camera_utils: '@mediapipe/camera_utils@0.3.1640029074',
};

// file:// 底下 fetch 讀不到鄰居檔案，所以資產得留在 CDN（見上面第 ② 點）
const MP_LOCAL_ASSETS = location.protocol !== 'file:';

// 哪幾包的 .js 沒讀到本機檔、已經退回 CDN
const mpRemote = {};

// 本機那支 .js 讀不到（沒跑過 vendor/下載.js）時，補一個 CDN 的進來。
// 用不著等它 —— vision.js 要到使用者按「開始定位」才會碰到 Hands。
function mpFallback(el, pkg, file) {
  mpRemote[pkg] = true;
  const s = document.createElement('script');
  s.src = MP_CDN + MP_PKG[pkg] + '/' + file;
  s.crossOrigin = 'anonymous';
  el.parentNode.insertBefore(s, el.nextSibling);
}

// 給 locateFile 用：回傳這一包的某個資產該去哪裡拿
function mpAsset(pkg, file) {
  return (MP_LOCAL_ASSETS && !mpRemote[pkg])
    ? `vendor/mediapipe/${pkg}/${file}`
    : MP_CDN + MP_PKG[pkg] + '/' + file;
}
