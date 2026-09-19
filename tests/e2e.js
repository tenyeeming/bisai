// 端對端：用 jsdom 載入真的 HTML，把 MediaPipe 換成假的，走完整個流程。
//   npm install && node tests/e2e.js
const fs = require('fs'), path = require('path');
const { JSDOM, VirtualConsole } = requireJsdom();
const DIR = path.join(__dirname, '..').replace(/\\/g, '/') + '/';

function requireJsdom() {
  try { return require('jsdom'); }
  catch { console.error('缺少 jsdom。請先在 demo網站/ 執行：npm install'); process.exit(2); }
}

let html = fs.readFileSync(DIR + 'acunavi-ideal.html', 'utf8');
html = html.replace(/<link rel="stylesheet"[^>]*>/g, '');
// 三個 CDN 標籤全部拿掉，再補「一份」假的 —— 每個都塞一份會重複宣告 class，
// 第二、三份直接 SyntaxError（不會讓測試紅，但會在 jsdom 裡默默炸掉）
html = html.replace(/<script src="https:\/\/[^"]+"[^>]*><\/script>/g, '');
html = html.replace('</head>',
  '<script>window.__mp={};' +
  'class Hands{setOptions(){}onResults(f){this._f=f}send(){return Promise.resolve()}close(){}}' +
  'class FaceMesh{setOptions(){}onResults(f){window.__mp.faceCb=f}send(){return Promise.resolve()}close(){}}' +
  'class Camera{constructor(v,o){window.__mp.cam=this;this.o=o}start(){return Promise.resolve()}stop(){}}<\/script></head>');
html = html.replace(/<script src="((?:js|pages)\/[^"]+)"><\/script>/g,
  (_, f) => '<script>' + fs.readFileSync(DIR + f, 'utf8') + '<\/script>');
// 注意：測試裡不再提供 fetch stub —— 正式程式碼已經不能依賴 fetch

const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/',
  virtualConsole: new VirtualConsole(),
  beforeParse(w) {
    // 模擬 file:// 環境：fetch 一律失敗。程式碼不該再依賴它。
    w.fetch = () => Promise.reject(new Error('fetch blocked (file://)'));
  },
});

const w = dom.window, d = w.document;
let fail = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const $ = id => d.getElementById(id);
const active = () => [...d.querySelectorAll('.page')].filter(p => p.classList.contains('active')).map(p => p.id.replace('page-', ''));
const activeTab = () => [...d.querySelectorAll('#tabbar button')].filter(b => b.classList.contains('on')).map(b => b.getAttribute('data-tab'));
const tick = () => new Promise(r => setTimeout(r, 0));
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  await tick(); await tick();

  // ── 載入 ──
  const n = d.querySelectorAll('#pages .page').length;
  ok(n === 18, `18 頁全部載入（實得 ${n}）`);
  ok(active().join() === 'home', '起始在首頁');
  ok(activeTab().join() === 'home', '起始分頁 = 首頁');
  ok(d.querySelectorAll('#steprail li').length === 4, '步驟軌自動長出 4 格（首頁是進入點，不上軌）');
  ok([...d.querySelectorAll('#steprail li')].map(l => l.getAttribute('data-step')).join() === 'recommend,acu-detail,camera,massage', '步驟軌順序正確');
  ok($('symptom-grid').children.length > 0, '症狀格已渲染');
  ok($('backbar').style.display === 'none', '首頁不顯示返回列');
  ok(!/class="back"/.test(d.getElementById('pages').innerHTML), '各頁內容裡已沒有自己的返回鈕');

  // ── 四分頁互切 ──
  for (const [tab, page] of [['gallery', 'gallery'], ['settings', 'settings'], ['profile', 'profile'], ['home', 'home']]) {
    [...d.querySelectorAll('#tabbar button')].find(b => b.getAttribute('data-tab') === tab).click();
    ok(active().join() === page && activeTab().join() === tab, `分頁「${tab}」→ ${page}`);
  }

  // ── 完整療程 ──
  w.eval('state.history={};state.minions={};state.streak={date:null,count:0}');
  const headacheIdx = w.eval("SYMPTOM_MAP.findIndex(s=>s.name==='緩解頭痛')");
  ok(headacheIdx >= 0, '找得到「緩解頭痛」症狀');
  $('symptom-grid').children[headacheIdx].click();
  ok(w.eval('state.selectedSymptoms.length') === 1, '選了 1 個症狀');

  w.goToRecommendation();
  ok(active().join() === 'recommend', '進到選穴頁');
  ok($('recommend-list').children.length > 0, `推薦了 ${$('recommend-list').children.length} 個穴道`);
  ok($('emergency-warn').children.length === 0, '非急症不顯示紅框');
  ok(activeTab().join() === 'home', '選穴頁仍歸首頁分頁');
  ok($('backbar').style.display === '' && $('back-btn').textContent === '← 返回', '選穴頁顯示返回列');
  ok([...d.querySelector('.device').children].map(e => e.id || e.className).join(' ').indexOf('backbar')
     < [...d.querySelector('.device').children].map(e => e.id || e.className).join(' ').indexOf('steprail'),
     '返回列排在步驟軌上面');

  // ── 部位分類 ──
  const segBtns = () => [...d.querySelectorAll('#region-seg button')];
  ok(segBtns().length === 3 && segBtns().map(b => b.querySelector('span').textContent).join() === '手部,手肘,臉部',
     '部位有三格：' + segBtns().map(b => b.querySelector('span').textContent).join('/'));
  ok(segBtns()[0].classList.contains('on'), '預設停在手部');
  ok(segBtns()[0].querySelector('.n').textContent === '7', '手部標了 7 穴');
  ok(segBtns()[1].querySelector('.n').textContent === '準備中' && segBtns()[1].classList.contains('soon'),
     '手肘標「準備中」而不是 0');

  // ── ⓘ 詳情（2026-09-02）──
  // 重點不是面板長什麼樣，是「點 ⓘ 不可以順手把穴道勾起來」——
  // ⓘ 長在整格可點的卡片裡面，少一個 stopPropagation 就會誤勾。
  const firstItem = $('recommend-list').children[0];
  const firstInfo = firstItem.querySelector('.info');
  ok(!!firstInfo, '每個穴道格都有 ⓘ 詳情鈕');
  ok($('info-sheet').hidden, '詳情面板預設收起');
  firstInfo.click();
  ok(!$('info-sheet').hidden, '點 ⓘ 打開詳情面板');
  ok(w.eval('state.selectedAcupoints.length') === 0, '⭐ 點 ⓘ 不會把穴道勾起來');
  ok($('info-sheet-name').textContent.length > 0,
     '詳情有穴名：' + $('info-sheet-name').textContent);
  ok(/寸|指|骨|間|處|凹陷/.test($('info-sheet-body').textContent), '詳情有定位描述');
  w.closeInfoSheet();
  ok($('info-sheet').hidden, '關閉後面板收起');

  $('recommend-list').children[0].click();
  $('recommend-list').children[1].click();
  ok(w.eval('state.selectedAcupoints.length') === 2, '勾了 2 個穴道');

  // 頭痛對應 5 個臉部穴道（太陽/印堂/陽白/攢竹/上關）。
  // 2026-08-23 補完眉區後 3 可勾、2 準備中（太陽/上關）。
  // 2026-09-15 側臉 6 穴補進來後，這 5 個**全部**可定位。
  // ⚠️ 太陽/上關的公式是 n=1 人、每側 1 筆挑出來的，沒有 GT ——
  //    「可定位」在這裡只代表算得出座標，不代表準（見 FACE_NO_GT）。
  segBtns()[2].click();
  ok(segBtns()[2].classList.contains('on'), '切到臉部');
  ok(segBtns()[2].querySelector('.n').textContent === '5',
     '頭痛：臉部 5 個穴道全部可定位（太陽/印堂/陽白/攢竹/上關）');
  const faceItems = [...$('recommend-list').querySelectorAll('.acu-item')];
  ok(faceItems.length === 5, `頭痛列出 5 個臉部穴道（實得 ${faceItems.length}）`);
  const faceSoon = faceItems.filter(e => e.getAttribute('aria-disabled') === 'true');
  ok(faceSoon.length === 0, `已經沒有「準備中」的臉部穴道了（實得 ${faceSoon.length}）`);
  ok(w.eval('state.selectedAcupoints.length') === 2, '換部位不會清掉已勾的穴道');
  segBtns()[0].click();
  ok($('recommend-list').children.length === 7, '切回手部，清單還在');
  ok([...$('recommend-list').children].filter(e => e.classList.contains('checked')).length === 2,
     '切回來後勾選狀態有還原');

  // 選穴不再展開時間面板；按摩／流程設定仍能逐穴保存秒數。
  const tItems = () => [...$('recommend-list').querySelectorAll('.acu-item')];
  ok(tItems().every(e => !e.querySelector('.expand')), '選穴階段不顯示逐穴秒數入口');
  const acuA = tItems()[0].dataset.acu;
  w.setAcuSec(acuA, 75);
  w.renderAcuList();
  ok(tItems()[0].querySelector('.secs').textContent === '75s', '按摩中或流程設定的秒數仍在選穴卡片顯示');
  tItems()[0].click(); tItems()[0].click();
  ok(w.eval(`acuSecOf(${JSON.stringify(acuA)})`) === 75, '取消後重選不丟失自訂秒數');
  w.clearAcuSec(acuA); w.renderAcuList();
  ok(tItems()[0].querySelector('.secs').textContent === '', '回到預設後不顯示自訂秒數');
  segBtns()[2].click();
  ok(tItems().every(e => !e.querySelector('.expand')), '臉部選穴也不顯示秒數入口');
  const fCode = tItems()[0].dataset.acu;
  w.setAcuSec(fCode, 45); w.renderAcuList();
  ok(tItems()[0].querySelector('.secs').textContent === '45s', '臉部自訂秒數仍可呈現');
  w.clearAcuSec(fCode);
  segBtns()[0].click();

  w.goToAcuDetail();
  ok(active().join() === 'acu-detail', '進到認穴頁');
  ok($('acu-name').textContent.length > 0, '穴名有渲染：' + $('acu-name').textContent);
  ok($('acu-progress').textContent === '1 / 2', '進度顯示 1 / 2');
  ok($('acu-detail').textContent.length > 10, '定位說明有內容');
  const refImg = $('page-acu-detail').querySelector('.ref-frame img');
  ok(refImg && /^assets\/acu-ref\/[a-z]+\.jpg$/.test(refImg.getAttribute('src')),
     '認穴頁有參考圖：' + (refImg && refImg.getAttribute('src')));
  ok(w.eval('state.selectedAcupoints.every((n,i,a)=>i===0||ACUPOINTS.findIndex(p=>p.name===a[i-1])<ACUPOINTS.findIndex(p=>p.name===n))'),
     '穴道已依 ACUPOINTS 順序排好：' + w.eval('JSON.stringify(state.selectedAcupoints)'));

  w.toggleTutorial();
  const tbox = $('tutorial-box');
  ok(tbox.style.display === 'block' && tbox.querySelectorAll('p').length === 4, '教學展開為 4 步');

  // ── 教學影片（2026-09-05）──────────────────────────────────
  // 白名單 js/acu-video.js：表上有片的穴道才出現那顆按鈕，其餘只有文字。
  // ⚠️ 教學區塊裡**不該有 <video>** —— 內嵌小框已被用戶否決，改成點了才開全螢幕播放器。
  const curName = w.eval('curAcuName()');
  const shouldHaveVid = w.eval(`!!ACU_VIDEO[${JSON.stringify(curName)}]`);
  const openBtn = tbox.querySelector('.vid-open');
  ok(!!openBtn === shouldHaveVid, `${curName} 教學影片按鈕有無符合白名單（有片=${shouldHaveVid}）`);
  ok(tbox.querySelector('video') === null, '教學區塊不內嵌 video（點了才開全螢幕）');
  ok(!openBtn || tbox.firstElementChild === openBtn, '影片按鈕排在文字步驟前面');
  ok(w.eval("acuVideoButton('合谷穴') !== null"), '合谷穴有教學影片');
  ok(w.eval("acuVideoButton('陽池穴') === null"), '沒登記的穴道不生影片按鈕');
  ok(w.eval("acuVideoButton('印堂') === null"), '臉部穴道不生影片按鈕');

  // ⭐ 展開教學就停掉自動翻頁（2026-09-05 用戶要求：看到一半被翻走很煩）
  ok($('ready-bar').hidden, '展開教學 → 倒數條收起，不會自動翻頁');

  // ── 全螢幕播放器 ──────────────────────────────────────────
  if (openBtn) {
    openBtn.click();
    const ov = $('vid-overlay');
    ok(!!ov && ov.parentElement === d.body, '開啟後有全螢幕覆蓋層，且貼在 body 上（不受頁面容器裁切）');
    const ovVid = ov && ov.querySelector('video');
    ok(ovVid && /^assets\/tutorial\/[a-z]+\.mp4$/.test(ovVid.getAttribute('src')),
       '影片路徑正確：' + (ovVid && ovVid.getAttribute('src')));
    ok(ovVid && ovVid.hasAttribute('autoplay'), '全螢幕就是要看，自動播');
    ok(ovVid && ovVid.hasAttribute('playsinline'), 'playsInline：iOS 不要搶去它自己的播放器');
    ok(!!ov.querySelector('.vid-close'), '有關閉鈕（中途退得出去）');

    // ── 進度條與跳轉（2026-09-05 用戶要求）────────────────────
    // 進度條走原生 controls（jsdom 不畫 UI，所以這裡只能釘住 controls 開著）
    ok(ovVid.hasAttribute('controls'), '有原生控制列（進度條在那裡）');
    ok(ov.querySelectorAll('.vid-seek').length === 2, '前後各一顆跳轉鈕');
    ok(w.eval('SEEK_STEP') === 10, '跳轉步長 10 秒');

    // 跳轉的夾邊界：純函式測，不必等影片真的載進來
    ok(w.eval('seekTarget(30, 10, 100)') === 40, '往後跳 10 秒');
    ok(w.eval('seekTarget(30, -10, 100)') === 20, '往前跳 10 秒');
    ok(w.eval('seekTarget(3, -10, 100)') === 0, '往前跳過頭 → 從頭播，不是負秒數');
    ok(w.eval('seekTarget(95, 10, 100)') === 100, '往後跳過頭 → 停在結尾');
    ok(w.eval('seekTarget(NaN, 10, 100)') === 10, '位置還沒讀到時當 0 算');
    ok(w.eval('seekTarget(95, 10, NaN)') === 105, '長度還沒載好時只夾下限（不要無故截掉）');

    // 按跳轉鈕不能順便關掉播放器（它跟「點外面關掉」共用同一層）
    ov.querySelector('.vid-seek.fwd').click();
    ok($('vid-overlay') !== null, '按跳轉鈕不會誤關播放器');

    ov.querySelector('.vid-close').click();
    ok($('vid-overlay') === null, '按 ✕ 關得掉');

    openBtn.click();
    $('vid-overlay').click();
    ok($('vid-overlay') === null, '點影片以外的地方關得掉');

    openBtn.click();
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' }));
    ok($('vid-overlay') === null, '按 Esc 關得掉');

    // 點影片本身不該關掉（不然快轉、調音量都會誤關）
    openBtn.click();
    $('vid-overlay').querySelector('video').click();
    ok($('vid-overlay') !== null, '點影片本身不會誤關');
  }

  // 播放器開著時收合教學 → 播放器也要一起關（不然影片留在畫面上蓋住整頁）
  w.toggleTutorial();
  ok($('tutorial-box').style.display === 'none', '教學可收合');
  ok($('vid-overlay') === null, '收合教學時全螢幕播放器一起關掉');
  w.toggleTutorial(); w.toggleTutorial();

  w.startLocate(); await tick();
  ok(active().join() === 'camera', '進到定位頁');
  ok($('tabbar').style.display === 'none', '定位頁收起分頁列');
  ok($('camera-title').textContent === $('acu-name').textContent, '定位頁標題同步穴名');
  ok(w.eval('camRunning') === true, '相機已啟動');
  ok(w.eval('renderMode') === 'locate', 'renderMode = locate');
  ok($('back-btn').textContent === '← 停止', '定位頁的返回列標「停止」');

  w.toggleDisc();
  ok(w.eval('showDisc') === false && $('toggle-disc').textContent === '顯示信心圓盤', '圓盤可切換，按鈕文字跟著換');
  w.toggleDisc();

  w.goToMassage(); await tick();
  ok(active().join() === 'massage', '進到按摩頁');
  ok($('back-btn').textContent === '← 返回', '按摩頁的返回列標「返回」');
  $('back-btn').click();
  ok(active().join() === 'camera', '按返回列 → 退回定位頁');
  ok(w.eval('camRunning') === true, '退回定位頁時相機續跑');
  w.goToMassage(); await tick();
  ok(w.eval('renderMode') === 'massage', 'renderMode 切成 massage');
  ok(w.eval('camRunning') === true, '相機沒被重啟（維持運作）');
  ok($('timer-display').textContent === '30', '計時預設 30 秒（每隻手）');
  ok($('round-hand').textContent === '右手', '第一輪標「右手」（預設手序：先右後左）');
  ok($('round-pips').textContent === '1/2', '輪次顯示 1/2');
  ok($('backbar-actions').querySelector('#massage-gear'), '齒輪在返回列上（跟返回鈕同一行）');
  ok(!$('page-massage').querySelector('#massage-gear'), '取景框裡已經沒有齒輪');
  ok($('page-camera').querySelector('#massage-gear') === null && $('backbar-actions').children.length === 2,
     '返回列動作區只掛按摩頁自己的東西');

  // 計時只在對準時前進
  $('timer-input').value = '5'; w.updateTimerDisplay();
  ok($('timer-display').textContent === '5', '拉動滑桿改秒數');
  w.eval('onTarget=false');
  w.startMassage();
  await wait(350);
  ok($('timer-display').textContent === '5' && $('timer-display').classList.contains('paused'), '沒對準 → 計時暫停且變灰');
  w.eval('onTarget=true');
  await wait(350);
  const remain = w.eval('massageRemainMs');
  ok(!$('timer-display').classList.contains('paused') && remain < 5000 && remain > 4000,
     `對準後計時開始前進（5000ms → ${remain}ms）`);

  // ── 全螢幕按摩（2026-08-13）──
  // 重點不是「有沒有變大」（jsdom 不排版），是「元件被搬走之後還找不找得到」
  ok(!d.body.classList.contains('massage-fs'), '按下開始維持原版面，不強制全螢幕');
  w.enterMassageFullscreen();
  ok(d.body.classList.contains('massage-fs'), '主動放大才進全螢幕');
  ok($('massage-hud-slot').contains($('timer-display')) && $('massage-hud-slot').contains($('massage-gate')),
     '計時與讀數條是搬進 HUD，不是另外複製一份');
  ok(/右手.*1\/2/.test($('fs-hand').textContent), 'HUD 標出本輪是哪隻手：' + $('fs-hand').textContent);
  ok($('btn-massage-zoom').hidden, '全螢幕時不顯示「放大顯示」');
  w.eval('setGate("ok","測試讀數")');
  ok($('massage-gate').textContent === '測試讀數', '搬走之後讀數條照樣寫得到（靠 id 找元件）');

  w.exitMassageFullscreen();
  ok(!d.body.classList.contains('massage-fs') && !$('btn-massage-zoom').hidden,
     '縮小 → 退出全螢幕，並出現「放大顯示」');
  ok(w.eval('massageRunning') === true, '縮小不會停掉計時');
  ok($('timer-display').parentNode.classList.contains('meter')
     && $('massage-gate').previousElementSibling.id === 'massage-viewport',
     '退出後兩個元件都回到原位');
  w.enterMassageFullscreen();
  ok(d.body.classList.contains('massage-fs'), '「放大顯示」可以再回到全螢幕');
  w.exitMassageFullscreen();   // 底下要點齒輪，真的使用者也得先縮小才點得到

  // ── 畫面上的設定選單 + 提早結束 ──
  ok($('massage-menu').hidden, '設定選單預設收起');
  $('massage-gear').click();
  ok(!$('massage-menu').hidden && $('massage-gear').getAttribute('aria-expanded') === 'true', '點齒輪展開選單');
  ok(/提早結束/.test($('massage-menu').textContent) && /不計入紀錄/.test($('massage-menu').textContent),
     '選單有「提早結束」且註明不計入紀錄');
  ok(/切換鏡頭/.test($('massage-menu').textContent), '選單有切換鏡頭');
  // 選單裡的圓盤開關要跟定位頁那顆同步
  const discBtns = () => [...d.querySelectorAll('[data-disc-label]')];
  ok(discBtns().length === 2, '兩頁各有一顆圓盤開關');
  discBtns()[1].click();
  ok(discBtns().every(b => b.textContent === '顯示信心圓盤'), '在按摩頁切圓盤，定位頁那顆文字也跟著換');
  discBtns()[1].click();

  d.body.click();
  ok($('massage-menu').hidden, '點畫面別處會收起選單');

  // 提早結束：取消
  const timesBefore = w.eval('JSON.stringify(state.history)');
  w.confirm = () => false;
  $('massage-gear').click();
  w.endMassageEarly();
  ok(active().join() === 'massage', '取消提早結束 → 留在按摩頁');

  // 提早結束：確認 → 跳下一穴且不寫紀錄
  w.confirm = () => true;
  w.endMassageEarly();
  ok(active().join() === 'acu-detail' && $('acu-progress').textContent === '2 / 2', '提早結束 → 直接到下一穴');
  ok(w.eval('JSON.stringify(state.history)') === timesBefore, '提早結束沒有寫入任何紀錄');
  ok(w.eval('massageRunning') === false, '提早結束會停掉計時');
  ok(w.eval('massageRound') === 1, '重進按摩頁時輪次會歸 1');

  // 回到按摩頁把第 2 穴按完，走正常完成流程
  w.eval('state.currentAcupointIndex=0');
  w.showPage('acu-detail');
  w.startLocate(); await tick();
  w.goToMassage(); await tick();
  $('timer-input').value = '5'; w.updateTimerDisplay();
  w.eval('onTarget=true');
  w.startMassage();

  // 第一輪（左手）歸零 → 換手，不是完成
  w.eval('massageRemainMs=100');
  await wait(300);
  ok(active().join() === 'massage', '第一輪歸零仍留在按摩頁');
  ok(!d.body.classList.contains('massage-fs') && $('btn-massage-zoom').hidden,
     '一輪按完自動退出全螢幕（換手提示與開始鈕都在小畫面上）');
  ok($('round-hand').textContent === '左手', '換手：標成「左手」');
  ok($('round-pips').textContent === '2/2', '輪次進到 2/2');
  ok(!$('round-switch').hidden && /右手完成/.test($('round-switch').textContent)
     && /換成左手/.test($('round-switch').textContent), '顯示換手提示：' + $('round-switch').textContent);
  ok(/5 秒後自動開始/.test($('round-switch').textContent), '換手提示帶自動開始倒數');
  ok(!$('btn-switch-now').hidden, '換手倒數時出現「立即開始」');
  ok($('btn-massage-start').textContent === '開始按左手', '按鈕變成「開始按左手」');
  ok($('btn-massage-start').disabled === false, '按鈕重新啟用');
  ok(w.eval('JSON.stringify(state.history)') === '{}', '只按完一隻手不算完成，沒寫紀錄');
  ok(w.eval('massageRemainMs') === w.eval('flow.pressSec') * 1000, '第二輪計時重新裝滿成設定的單手秒數');

  // ⭐ 按摩頁那支滑桿改的是「這一穴」，不再是全域設定（2026-09-08 改）。
  //    以前寫 setFlow('pressSec')，隨手一拉就把之後每一穴、每一次療程都改掉。
  {
    const cur = w.eval('curAcuName()');
    const before = w.eval('flow.pressSec');
    $('timer-input').value = '55';
    w.onPressSecChange();
    ok(w.eval(`state.acuSecs[${JSON.stringify(cur)}]`) === 55, '按摩頁拉滑桿寫進這一穴的秒數');
    ok(w.eval('flow.pressSec') === before, '⭐ 沒有動到全域 flow.pressSec');
    // 這時還沒有人存過節奏設定（設定頁那段在後面），所以「沒寫檔」＝這把鑰匙仍然是空的
    ok(w.localStorage.getItem('flowSettings') === null, '⭐ 也沒有寫進 localStorage');
    w.eval(`clearAcuSec(${JSON.stringify(cur)})`);
    w.armTimer();
    ok(Number($('timer-input').value) === before, '清掉之後滑桿回到全域預設值');
    w.eval('massageRemainMs = flow.pressSec * 1000');
  }

  // 換手倒數：不必再點一次「開始」，倒數完自己接上
  w.skipSwitchCountdown();
  ok(w.eval('massageRunning') === true, '「立即開始」直接進第二輪，不用再點開始鈕');
  ok($('round-switch').hidden, '開始第二輪後換手提示收起');
  ok($('btn-switch-now').hidden, '第二輪開始後「立即開始」收起');

  // 第二輪（左手）歸零 → 才算完成。
  // 這一段測手動模式（停在完成頁）；自動模式在後面另外測。
  w.eval('flow.autoAdvance=false');
  w.eval('massageRemainMs=100');
  await wait(300);
  ok(active().join() === 'complete', '兩輪都完成 → 完成頁（手動模式）');
  ok($('backbar').style.display === 'none', '完成頁不顯示返回列');
  ok(w.eval('camRunning') === false, '完成頁自動關相機');
  ok($('minion-badge').textContent === 'Lv.1', '首次完成 = Lv.1');
  ok(/連續第 1 天/.test($('complete-streak').textContent), '連續第 1 天');
  ok($('btn-next-acu').style.display === '', '還有下一穴，按鈕顯示');
  ok(w.eval('state.history[state.selectedAcupoints[0]].times') === 1, '紀錄寫入 times=1');

  w.goToNextAcu();
  ok(active().join() === 'acu-detail' && $('acu-progress').textContent === '2 / 2', '下一穴 → 認穴頁 2/2');

  // ── 認穴倒數（2026-09-02）──────────────────────────────────
  // 倒數完自己翻到定位頁；按住畫面會停住；設 0 則直接跳過認穴。
  ok(!$('ready-bar').hidden, '認穴頁出現倒數條');
  ok($('ready-num').textContent === String(w.eval('flow.readySec')), '倒數從設定值開始：' + $('ready-num').textContent);
  w.onReadyHold({ target: d.body });
  ok($('ready-num').textContent === '‖' && $('ready-bar').classList.contains('held'), '按住畫面 → 倒數暫停');
  w.onReadyRelease();
  ok($('ready-num').textContent !== '‖', '放開 → 倒數繼續');
  w.skipReadyCountdown(); await tick();
  ok(active().join() === 'camera', '「立即開始」直接進定位頁');
  ok($('ready-bar').hidden, '離開認穴頁時倒數條收起');

  // ── 自動模式：最後一穴按完 → 總結頁 ────────────────────────
  w.eval('flow.autoAdvance=true');
  w.eval('sessionLog=[{name:state.selectedAcupoints[0],ms:12000}]');
  w.goToMassage(); await tick();
  w.eval('onTarget=true');
  w.eval('massageRound=2');
  w.startMassage();
  w.eval('massageRemainMs=100');
  await wait(300);
  ok(active().join() === 'summary', '自動模式最後一穴按完 → 總結頁');
  ok(d.querySelectorAll('#summary-list .row').length === 2, '總結頁列出這次按過的兩個穴道');
  ok(/^\d+:\d\d$/.test($('summary-total').textContent), '總時長是 mm:ss：' + $('summary-total').textContent);
  ok($('summary-total').textContent !== '0:00', '總時長不是 0');

  // ── 圖冊 ──
  w.showPage('gallery');
  ok($('backbar').style.display === 'none', '圖冊分頁不顯示返回列');
  ok(/2 \/ 26 已解鎖/.test($('gallery-progress').textContent), '圖冊 2/26 已解鎖（實得 ' + $('gallery-progress').textContent + '）');

  // ── 小人圖 ──
  const tiles = [...$('collection-grid').children];
  ok(tiles.length === 26, '圖冊有 26 格');
  ok(tiles.every(t => t.querySelector('img.minion')), '每一格都有小人圖');
  const srcs = tiles.map(t => t.querySelector('img.minion').getAttribute('src'));
  ok(new Set(srcs).size === 26, '26 隻小人各自不同檔（沒有共用同一張）');
  ok(srcs.every(s => /^assets\/minions\/[a-z]+\.svg$/.test(s)), '圖片路徑格式正確：' + srcs[0]);
  ok(tiles.filter(t => t.classList.contains('locked')).length === 24, '24 格未解鎖（顯示剪影）');
  ok(tiles.filter(t => t.querySelector('.lv')).length === 2, '只有已解鎖那兩格有 Lv 標籤');

  // ── 圖冊 → 單穴介紹 ──
  const lockedTile = tiles.find(t => t.classList.contains('locked'));
  lockedTile.click();
  ok(active().join() === 'acu-info', '點圖冊任一格 → 介紹頁');
  ok(activeTab().join() === 'gallery', '介紹頁仍歸圖冊分頁');
  ok($('back-btn').style.visibility !== 'hidden', '介紹頁有返回鈕');
  ok($('info-portrait').classList.contains('locked'), '未解鎖的穴道頭像是剪影（但仍可閱讀介紹）');
  ok($('info-name').textContent.length > 0 && $('info-code').textContent.length > 0,
     '有穴名與代號：' + $('info-name').textContent + ' / ' + $('info-code').textContent);
  ok($('info-locate').textContent.length > 8, '有定位說明');
  ok(/手背|手心|手側緣/.test($('info-meta').textContent), '有標部位與正反面：' + $('info-meta').textContent);
  ok($('info-stat').textContent.includes('等級'), '有收集狀態欄');

  // 找一個「有參考圖、有主治、可以練」的穴道來驗完整內容
  w.eval("infoAcuName='合谷穴'"); w.showPage('acu-info');
  ok($('info-name').textContent === '合谷穴', '切到合谷穴的介紹');
  ok($('info-note').textContent.includes('懷孕'), '安全警語有顯示：' + $('info-note').textContent);
  const tags = [...$('info-symptoms').querySelectorAll('.tag')].map(e => e.textContent);
  ok(tags.length >= 3, `主治標籤 ${tags.length} 個：` + tags.join('、'));
  const infoRef = $('info-ref').querySelector('img');
  ok(infoRef && infoRef.getAttribute('src') === 'assets/acu-ref/hegu.jpg', '介紹頁參考圖是合谷的');
  ok($('btn-practice').disabled === false, '合谷有定位公式 → 可以練');

  // ── 圖冊介紹頁也能看教學影片（2026-09-05 用戶要求）──────────
  // 跟認穴頁共用同一顆按鈕與同一個播放器
  const infoVidBtn = $('info-video').querySelector('.vid-open');
  ok(!!infoVidBtn && !$('info-video').hidden, '合谷穴的介紹頁有教學影片按鈕');
  infoVidBtn.click();
  ok(!!$('vid-overlay'), '介紹頁也開得起全螢幕播放器');
  ok($('vid-overlay').querySelectorAll('.vid-seek').length === 2, '介紹頁的播放器一樣有跳轉鈕');
  // 播放器開著切頁 → 一定要關掉，不然黑幕會蓋在圖冊上
  w.showPage('gallery');
  ok($('vid-overlay') === null, '離開介紹頁時播放器一起關掉');
  w.eval("infoAcuName='合谷穴'"); w.showPage('acu-info');

  // 沒有定位公式的穴道不能練
  w.eval("infoAcuName='少商穴'"); w.showPage('acu-info');
  ok($('btn-practice').disabled === true, '少商穴尚未支援定位 → 按鈕停用');
  ok($('info-ref').querySelector('.ref-none'), '少商穴沒有參考圖 → 顯示「尚無參考圖」而不是借別穴的圖');
  ok($('info-video').hidden, '沒有影片的穴道 → 整塊不畫（不要留空標題）');

  // 從介紹頁直接練這一穴
  w.eval("infoAcuName='合谷穴'"); w.showPage('acu-info');
  w.practiceThisAcu();
  ok(active().join() === 'acu-detail', '按「練這一穴」→ 認穴頁');
  ok(w.eval("JSON.stringify(state.selectedAcupoints)") === '["合谷穴"]', '療程只有這一穴');
  ok($('acu-progress').textContent === '1 / 1', '進度顯示 1 / 1');

  // ── 主治標籤 → 開療程（2026-09-04：補上 App 早就有、網頁還沒有的互動）──
  w.eval("infoAcuName='合谷穴'"); w.showPage('acu-info');
  const tagBtns = [...$('info-symptoms').querySelectorAll('button.tag')];
  ok(tagBtns.length >= 3, `主治標籤是可點的按鈕（${tagBtns.length} 個）`);
  ok(tagBtns.every(b => b.textContent.startsWith('#')), '每個標籤前面都有 #：' + tagBtns[0].textContent);
  ok(tagBtns.every(b => b.getAttribute('aria-label')), '標籤都有 aria-label（讀出來知道點了會怎樣）');
  const tagName = tagBtns[0].textContent.replace('#', '');
  tagBtns[0].click();
  ok(active().join() === 'recommend', '點主治標籤 → 選穴頁');
  ok(activeTab().join() === 'home', '跳過去之後底部分頁切回首頁');
  ok(w.eval('state.selectedSymptoms.length') === 1, '只帶那一個症狀進去，不疊加');
  ok(w.eval('SYMPTOM_MAP[state.selectedSymptoms[0]].name') === tagName, '帶進去的就是點到的那個症狀：' + tagName);
  ok($('recommend-list').children.length > 0, '選穴頁確實有推薦穴道');
  ok(w.eval('state.selectedAcupoints.length') === 0, '新療程沒有殘留上一次勾好的穴道');

  // 急症走標籤進來一樣要擋話（中衝穴掛在「昏迷急救」下）
  w.eval("infoAcuName='中衝穴'"); w.showPage('acu-info');
  const emerTag = [...$('info-symptoms').querySelectorAll('button.tag')]
    .find(b => b.textContent.includes('昏迷急救'));
  ok(!!emerTag, '中衝穴的主治裡有「昏迷急救」');
  emerTag.click();
  ok($('emergency-warn').children.length === 1, '從標籤進急症也會顯示 119 紅框');

  // 防呆：症狀／穴名認不得就不要把人丟到空白頁
  w.showPage('gallery');
  w.showAcuInfo('沒有這個穴');
  ok(active().join() === 'gallery', '未知穴名 → 留在圖冊，不進空白介紹頁');
  w.eval("infoAcuName='合谷穴'"); w.showPage('acu-info');
  w.startFromSymptom('沒有這個症狀');
  ok(active().join() === 'acu-info', '未知症狀 → 原地不動');

  // ── 個人頁 ──
  const today = new Date().toISOString().split('T')[0];
  const yest = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  w.eval(`state.history={'合谷穴':{times:7,lastDate:'${today}'},'陽池穴':{times:3,lastDate:'${yest}'},'中渚穴':{times:5,lastDate:'${today}'}};` +
         `state.minions={'合谷穴':{level:2,times:7},'陽池穴':{level:1,times:3},'中渚穴':{level:2,times:5}};` +
         `state.streak={date:'${today}',count:4}`);
  w.showPage('profile');
  const stats = $('profile-stats').textContent;
  ok(/連續天數\s*4/.test(stats), '連續天數 = 4');
  ok(/累計次數\s*15/.test(stats), '累計次數 = 15');
  ok(/已解鎖\s*3\/26/.test(stats), '已解鎖 3/26');
  ok(/今日完成\s*2/.test(stats), '今日完成 = 2（昨天那筆不算）');
  const rows = [...$('profile-rank').querySelectorAll('.rank-row')].map(r => r.textContent.trim());
  ok(rows.length === 3 && /合谷/.test(rows[0]) && /中渚/.test(rows[1]) && /陽池/.test(rows[2]), '排行降冪：' + rows.join(' | '));
  w.eval("state.streak={date:'2020-01-01',count:99}"); w.initProfile();
  ok(/連續天數\s*0/.test($('profile-stats').textContent), '中斷後連續天數歸 0');

  // ── 切語言只重繪當前頁 ──
  w.eval(`state.streak={date:'${today}',count:4}`);
  w.goHome();
  $('symptom-grid').children[headacheIdx].click();
  w.goToRecommendation();
  $('recommend-list').children[0].click();
  const before = w.eval('state.selectedAcupoints.length');
  w.showPage('profile');
  ok(!/中\/EN/.test(d.querySelector('header').textContent), 'header 已沒有語言按鈕');
  w.setLanguage('en');
  ok([...d.querySelectorAll('#tabbar button span')].map(s => s.textContent).join() === 'Home,Collection,Settings,Profile', '分頁列切英文');
  ok(/STREAK/i.test($('profile-stats').textContent), '個人頁跟著切英文');
  ok([...d.querySelectorAll('#steprail li')].map(l => l.textContent).join().includes('Points'), '步驟軌跟著切英文');
  ok(w.eval('state.selectedAcupoints.length') === before, '在別頁切語言不會清掉已勾的穴道');
  ok(w.localStorage.getItem('language') === 'en', '語言有存檔');

  // 設定 › 語言（語言已經自己一頁，不再跟其他開關擠在設定首頁）
  w.showPage('settings-lang');
  const seg = () => [...d.querySelectorAll('#lang-seg button')];
  const segText = () => seg().map(b => b.querySelector('.grow').textContent).join();
  ok(seg().length === 2 && segText() === '中文,English', '語言頁有中文/English 兩列');
  ok(seg().find(b => b.classList.contains('on')).getAttribute('data-lang') === 'en', '目前語言那列是亮的（en）');
  seg()[0].click();
  ok(w.eval('currentLanguage') === 'zh', '點「中文」切回中文');
  ok(seg().find(b => b.classList.contains('on')).getAttribute('data-lang') === 'zh', '亮的那列跟著換');
  ok($('page-settings-lang').querySelector('h2').textContent === '語言', '語言頁標題跟著切');
  seg()[0].click();
  ok(w.eval('currentLanguage') === 'zh', '重複點同一列不出事');
  ok([...d.querySelectorAll('#tabbar button span')].map(s => s.textContent).join() === '首頁,圖冊,設定,個人', '切回中文');
  ok(w.eval("PAGES['settings-lang'].backTo") === 'settings' && w.eval("PAGES['settings-lang'].tab") === 'settings',
     '子頁退回設定目錄、且仍歸設定分頁');

  // ── 急症擋話 ──
  w.goHome();
  const emIdx = w.eval("SYMPTOM_MAP.findIndex(s=>s.name==='中暑')");
  $('symptom-grid').children[emIdx].click();
  w.goToRecommendation();
  ok($('emergency-warn').querySelector('.notice.bad') && /119/.test($('emergency-warn').textContent), '急症顯示 119 紅框');

  // ── 設定目錄：一個功能一列，點進去才調整 ──
  w.showPage('settings');
  const menuRows = () => [...d.querySelectorAll("#settings-menu button")];
  ok(menuRows().length === 6, `設定目錄列出 6 個功能（實得 ${menuRows().length}）`);
  ok(menuRows().map(b => b.querySelector('.label').textContent).join() === '語言,每日提醒,我的流程,療程節奏,定位精度,資料與紀錄',
     '目錄六列：語言／每日提醒／我的流程／療程節奏／定位精度／資料與紀錄');
  ok(!$('page-settings').querySelector('input'), '設定首頁本身沒有任何開關（全都搬進子頁）');
  ok(menuRows()[0].querySelector('.value').textContent === '中文', '目錄右邊直接顯示現在設成什麼');
  menuRows()[0].click();
  ok(active().join() === 'settings-lang' && activeTab().join() === 'settings', '點「語言」進子頁，分頁仍停在設定');
  w.goBack();
  ok(active().join() === 'settings', '返回列退回設定目錄');

  // ── 設定 › 療程節奏（2026-09-02 補：換穴與單手秒數多開一個入口）──
  // 重點是「兩處調的是同一份設定」—— 按摩頁的齒輪／滑桿與這裡都寫 flow，
  // 各記一份的話使用者會看到兩個互相矛盾的數字。
  w.showPage('settings-flow');
  const segOn = (id) => [...d.querySelectorAll(`#${id} button`)].find(b => b.classList.contains('on'));
  ok([...d.querySelectorAll('#page-settings-flow .seg')].length === 5,
     '療程節奏有五項：認穴停留／手序／換手倒數／換穴／單手秒數');
  ok(segOn('seg-press').textContent === `${w.eval('flow.pressSec')}s`,
     '單手秒數選中設定值：' + segOn('seg-press').textContent);
  ok(segOn('seg-advance').textContent === (w.eval('flow.autoAdvance') ? '自動' : '手動'),
     '換穴模式選中設定值：' + segOn('seg-advance').textContent);
  [...d.querySelectorAll('#seg-press button')].find(b => b.textContent === '60s').click();
  ok(w.eval('flow.pressSec') === 60, '在設定頁改單手秒數會寫進 flow');
  ok(JSON.parse(w.localStorage.getItem('flowSettings')).pressSec === 60, '而且存進 localStorage');
  // 直接呼叫按摩頁的 armTimer（不 showPage —— 切到按摩頁會把相機也帶起來，
  // 後面還有「手部相機沒有同時開著」的檢查會被弄髒）
  w.armTimer();
  ok($('timer-input').value === '60', '⭐ 沒特別調過的穴道，按摩頁滑桿讀到的就是這個全域預設值');
  w.showPage('settings-flow');
  [...d.querySelectorAll('#seg-press button')].find(b => b.textContent === '30s').click();
  ok(w.eval('flow.pressSec') === 30, '改回 30 秒');

  // ── 設定 › 我的流程（2026-09-08）──
  // 三件事要守：存得起來、開始時真的排成療程、節奏是覆蓋層不是覆蓋。
  w.showPage('settings-presets');
  const pRows = () => [...d.querySelectorAll('#preset-list .row')];
  ok(pRows().length === 0 && /還沒有任何流程/.test($('preset-list').textContent), '一開始沒有流程，顯示空狀態');
  ok($('preset-edit').hidden, '編輯區預設收起來');

  w.openPresetEditor(null);
  ok(!$('preset-edit').hidden && $('preset-new-row').hidden, '按新增就展開編輯區，並收起新增鈕');
  ok($('preset-del').hidden, '新增時沒有刪除鈕（還沒有東西可刪）');
  const pAcuBoxes = () => [...$('preset-acu-list').querySelectorAll('input')];
  ok(pAcuBoxes().length === w.eval('ACUPOINTS.filter(a=>IMPLEMENTED.has(a.name)).length'),
     '手部清單只列算得出位置的穴道');
  ok(pAcuBoxes().every(b => !b.checked), '新流程一開始一個都沒勾');
  ok(/還沒選穴道/.test($('preset-est').textContent), '沒選穴道時不報一個假的時長');

  w.savePresetEditor();
  ok(pRows().length === 0, '一個穴道都沒選就存不起來');

  w.togglePresetAcu('合谷穴');
  w.togglePresetAcu('陽池穴');
  ok(w.eval('presetDraft.acupoints.join()') === '合谷穴,陽池穴', '勾選寫進草稿');
  // 節奏：這組拉到 45 秒，全域維持 30
  [...d.querySelectorAll('#pseg-press button')].find(b => b.textContent === '45s').click();
  ok(w.eval('presetDraft.flow.pressSec') === 45 && w.eval('flow.pressSec') === 30,
     '⭐ 改流程的節奏不會動到全域 flow');
  ok(w.eval('presetSeconds(presetDraft)') === 2 * (5 + 45 * 2 + 5), '時長＝穴數 ×（認穴＋左右各一輪＋換手）');

  $('preset-name').value = '早上這組';
  w.onPresetNameInput();
  w.savePresetEditor();
  ok(pRows().length === 1 && $('preset-edit').hidden, '存得起來，編輯區收回去');
  ok(/早上這組/.test(pRows()[0].textContent) && /2 穴/.test(pRows()[0].textContent), '清單顯示名稱與穴數');
  ok(JSON.parse(w.localStorage.getItem('acuPresets')).length === 1, '存進 localStorage');

  // 名字空著也存得起來（給預設名，不是擋下來）
  w.openPresetEditor(null);
  w.togglePresetAcu('陽溪穴');
  w.savePresetEditor();
  ok(pRows().length === 2 && /流程 1/.test(pRows()[1].textContent),
     '沒取名就給「流程 N」，而且是沒被用過的最小號（第一組叫「早上這組」，所以這組是 1 不是 2）');

  // 名稱裡的 < 不能把清單的 HTML 弄壞
  w.openPresetEditor(w.eval('presets[1].id'));
  ok(!$('preset-del').hidden, '編輯既有流程才有刪除鈕');
  $('preset-name').value = '<b>x';
  w.onPresetNameInput();
  w.savePresetEditor();
  ok(!$('preset-list').querySelector('b') && /<b>x/.test(pRows()[1].textContent), '名稱裡的標籤被跳脫，不會吃掉清單');

  // 取消要真的取消得掉
  w.openPresetEditor(w.eval('presets[0].id'));
  w.togglePresetAcu('合谷穴');
  w.closePresetEditor();
  ok(w.eval('presets[0].acupoints.join()') === '合谷穴,陽池穴', '按取消不會把改動寫進去');

  // ⭐ 開始：排成療程 ＋ 節奏覆蓋層
  w.startPreset(w.eval('presets[0].id'));
  ok(active().join() === 'acu-detail', '開始流程直接落在認穴頁');
  ok(w.eval('state.selectedAcupoints.join()') === '合谷穴,陽池穴', '療程清單就是流程那兩穴');
  ok(w.eval('flow.pressSec') === 45, '流程的節奏生效');
  ok(JSON.parse(w.localStorage.getItem('flowSettings')).pressSec === 30,
     '⭐ 但沒有寫進 localStorage —— 流程節奏不是使用者的預設值');
  w.setFlow('pressSec', 20);
  ok(w.eval('flow.pressSec') === 20 && JSON.parse(w.localStorage.getItem('flowSettings')).pressSec === 30,
     '⭐ 療程中改秒數只算這一次，不寫檔');
  w.goHome();
  ok(w.eval('flow.pressSec') === 30, '⭐ 回首頁還原成全域節奏');

  // 刪除
  w.showPage('settings-presets');
  w.openPresetEditor(w.eval('presets[1].id'));
  w.confirm = () => true;
  w.deletePresetEditor();
  ok(pRows().length === 1 && w.eval('presets.length') === 1, '刪得掉');
  w.eval("presets = []; savePresets();");
  w.showPage('settings-presets');

  // ── 設定 › 定位精度 ──
  w.showPage('settings-accuracy');
  ok($('strict-gate').checked === w.eval('strictGate'), '嚴格模式勾選狀態同步');
  w.onStrictChange(false);
  ok(w.eval('strictGate') === false && w.localStorage.getItem('strictGate') === 'false', '關閉嚴格模式會存檔');
  w.showPage('settings');
  ok(menuRows()[4].querySelector('.value').textContent === '寬鬆', '關掉之後目錄那列跟著顯示「寬鬆」');
  w.onStrictChange(true);

  // ── 設定 › 每日提醒 ──
  w.showPage('settings-notify');
  ok($('notify-time').value === '20:00', '提醒時間預設 20:00');
  ok($('notify-plan-body').innerHTML === '', '預設「不指定」時不列任何清單');
  w.setNotifyMode('symptom');
  const syms = () => [...$('notify-plan-body').querySelectorAll('input')];
  ok(syms().length === w.eval('SYMPTOM_MAP.length') - 2,
     `依症狀列出 ${syms().length} 個症狀（13 個扣掉 2 個急症）`);
  // 只看清單本身：底下那段說明文字本來就會提到急症，不能拿它當判準
  ok(!/中暑|昏迷/.test($('notify-plan-body').querySelector('.optlist').textContent),
     '急症不列入每日提醒的清單');
  ok(/119/.test($('notify-plan-body').textContent), '並且說明為什麼不列（要打 119）');
  const hIdx = w.eval("SYMPTOM_MAP.findIndex(s=>s.name==='緩解頭痛')");
  w.toggleNotifySymptom(hIdx);
  ok(w.eval('notifyPlan().symptoms').join() === '緩解頭痛', '勾的症狀存的是名字不是索引');
  w.onNotifyChange(true);
  w.showPage('settings');
  ok(menuRows()[1].querySelector('.value').textContent === '20:00 · 緩解頭痛', '目錄那列顯示「幾點 · 按什麼」');

  w.showPage('settings-notify');
  w.setNotifyMode('acupoint');
  const acus = () => [...$('notify-plan-body').querySelectorAll('input')];
  ok(acus().length === w.eval('IMPLEMENTED.size'), `直接選穴道只列 ${acus().length} 個算得出位置的穴道`);
  const hegu = w.eval("ACUPOINTS.findIndex(a=>a.name==='合谷穴')");
  w.toggleNotifyAcu(hegu);
  ok(w.eval('notifyPlan().acupoints').join() === '合谷穴', '勾的穴道有存起來');
  w.startNotifyPlan();
  ok(active().join() === 'acu-detail' && w.eval('curAcuName()') === '合谷穴',
     '點提醒直接排成療程、落在認穴頁（不自動開始按摩）');
  w.onNotifyChange(false);
  ok(w.eval('reminderTimer') === null, '關掉提醒會把排程取消掉');

  // ── 設定 › 資料與紀錄 ──
  w.showPage('settings-data');
  w.confirm = () => true;
  w.resetProgress();
  ok(w.eval('Object.keys(state.history).length') === 0, '清除紀錄');
  w.showPage('profile');
  ok(/累計次數\s*0/.test($('profile-stats').textContent), '清除後個人頁歸零');
  w.showPage('gallery');
  ok(/0 \/ 26/.test($('gallery-progress').textContent), '清除後圖冊歸零');

  // ── 臉部流程（另一套資料與相機）──
  w.goHome();
  const eyeIdx = w.eval("SYMPTOM_MAP.findIndex(s=>s.name==='緩解目痛')");
  $('symptom-grid').children[eyeIdx].click();
  w.goToRecommendation();
  const segs = () => [...d.querySelectorAll('#region-seg button')];
  segs()[2].click();
  // 2026-08-23：眼周 4 穴 + 眉區 5 穴 → 目痛這 10 個裡有 7 個可定位。
  // 2026-09-14：球後(EX-HN7) 補上用戶指定的 CS 公式 → 變 8 個。
  // 2026-09-15：瞳子髎(GB1) 與太陽(EX-HN5) 補上 → **10 個全部可定位**。
  ok(segs()[2].querySelector('.n').textContent === '10',
     '目痛：臉部 10 個穴道全部可定位');
  const items = [...$('recommend-list').querySelectorAll('.acu-item')];
  ok(items.length === 10, `目痛列出 10 個臉部穴道（實得 ${items.length}）`);
  const ready = items.filter(e => e.getAttribute('aria-disabled') === 'false');
  ok(ready.length === 10, `其中 10 個可勾選（實得 ${ready.length}）`);
  ready[0].click(); ready[1].click();
  ok(w.eval('state.selectedFace.length') === 2, '勾了 2 個臉部穴道');
  ok(w.eval("state.selectedAcupoints.length") === 0, '臉部勾選不會混進手部清單');

  const startBtn = [...$('recommend-list').querySelectorAll('button')].pop();
  ok(/只看定位/.test(startBtn.textContent), '臉部分頁有「只看定位」的旁路按鈕（主路是上面的「開始療程」）');
  startBtn.click(); await tick();
  ok(active().join() === 'face', '進到臉部定位頁');
  ok(w.eval('faceSelected.length') === 2, '帶著勾選的穴道進來');
  ok($('face-chips').children.length === 2, '穴道 chip 有渲染');
  ok($('face-who').textContent.length > 20, 'WHO 定位說明有顯示');
  ok(/參數來源/.test($('face-who').textContent), '有把參數來源（provenance）寫在畫面上');
  ok(w.eval('faceCamRunning') === true, '進臉部頁開臉部相機');
  ok(w.eval('camRunning') === false, '手部相機沒有同時開著');

  // 模型載入期間也一定要看得到自己 —— 臉部模型首次要抓 ~10MB，
  // 如果只有 onFaceResults 會畫圖，那段時間畫面是全黑的（實際踩過）
  const vid = $('hidden-video');
  Object.defineProperty(vid, 'videoWidth', { value: 640, configurable: true });
  Object.defineProperty(vid, 'videoHeight', { value: 480, configurable: true });
  const paints = [];
  const realGetCtx = w.HTMLCanvasElement.prototype.getContext;
  w.HTMLCanvasElement.prototype.getContext = function () {
    const self = this;
    return new Proxy({}, {
      get: (_, k) => (k === 'canvas' ? self : (...a) => paints.push(String(k))),
      set: () => true,
    });
  };
  await w.__mp.cam.o.onFrame();
  ok(paints.filter(p => p === 'drawImage').length === 1, '模型還沒回結果時，onFrame 先把影像畫上去');
  ok(/載入中/.test($('face-gate').textContent), '讀數條說明是模型在載入，不是相機壞了');

  paints.length = 0;
  w.__mp.faceCb({ image: vid, multiFaceLandmarks: [null] });   // 沒偵測到臉
  ok(paints.filter(p => p === 'drawImage').length === 1, '有結果就由 onFaceResults 畫');
  paints.length = 0;
  await w.__mp.cam.o.onFrame();
  ok(paints.filter(p => p === 'drawImage').length === 0, '結果來了之後 onFrame 不再重畫（不會閃）');
  w.HTMLCanvasElement.prototype.getContext = realGetCtx;

  w.showPage('gallery');
  ok(w.eval('faceCamRunning') === false, '切走自動關臉部相機');
  ok(w.eval('faceGotResult') === false, '關相機時重置 faceGotResult，下次進來會重新顯示載入中');

  // ── 相機生命週期 ──
  w.eval("state.selectedAcupoints=['合谷穴'];state.currentAcupointIndex=0");
  w.showPage('camera'); await tick();
  ok(w.eval('camRunning') === true, '進定位頁開相機');
  w.showPage('gallery');
  ok(w.eval('camRunning') === false, '切到圖冊自動關相機');

  // ── 防呆：localStorage 存了壞形狀的資料（2026-09-04）──────────────
  // 這些不會丟例外，只會靜靜地畫出 Lv.undefined / NaN，所以要在讀進來時就洗掉。
  const setLS = (k, v) => w.localStorage.setItem(k, v);

  setLS('minions', '[1,2,3]');
  ok(JSON.stringify(w.eval('cleanMinions()')) === '{}', '小人表存成陣列 → 整份丟掉回空物件');
  setLS('minions', '{"合谷穴":{"level":"三","times":"7"},"陽池穴":5}');
  const cm = w.eval('JSON.stringify(cleanMinions())');
  ok(!/undefined|null/.test(cm) && /"level":2/.test(cm),
     '字串 times 換算回等級、非物件那筆丟掉：' + cm);

  setLS('acuHistory', '{"合谷穴":{"times":null,"lastDate":"昨天"}}');
  ok(w.eval('JSON.stringify(cleanHistory())') === '{"合谷穴":{"times":0,"lastDate":null}}',
     '壞掉的 times/lastDate 洗成 0 / null');

  setLS('acuStreak', '{"date":"哪一天","count":9}');
  ok(w.eval('JSON.stringify(cleanStreak())') === '{"date":null,"count":0}',
     '日期不合法 → 連續天數歸零（留著會算出負的間隔）');

  setLS('flowSettings', '{"pressSec":"abc","readySec":-5,"switchSec":9999,"handOrder":"上","autoAdvance":"yes"}');
  const cf = w.eval('JSON.stringify(cleanFlow())');
  ok(/"pressSec":30/.test(cf) && /"readySec":0/.test(cf) && /"switchSec":60/.test(cf)
     && /"handOrder":"right"/.test(cf) && /"autoAdvance":true/.test(cf),
     '節奏設定：非數字回預設、超範圍夾住、手序與開關回預設 — ' + cf);

  setLS('notifyPlan', '{"mode":"隨便","symptoms":"合谷穴","acupoints":[1,"合谷穴"]}');
  ok(w.eval('JSON.stringify(notifyPlan())') === '{"mode":"none","symptoms":[],"acupoints":["合谷穴"]}',
     '提醒內容：模式不認得回 none、清單不是陣列回空、陣列裡非字串濾掉');

  ok(/^hsl[(]\d+/.test(w.eval("acuColor('沒有這個穴')")), '未知穴名的顏色仍是合法 hsl（不會變負角度）');

  ['minions', 'acuHistory', 'acuStreak', 'flowSettings', 'notifyPlan']
    .forEach(k => w.localStorage.removeItem(k));

  // ══ 印堂「加入」療程（2026-09-04）══════════════════════════════
  // 臉部穴道不再是死路：勾了之後由「開始療程」一起帶進 selectedAcupoints，
  // 走認穴 → 定位。按摩那一步還沒做（見 記錄控制/PROGRESS.md）。

  // ── 排序：臉部一律殿後，讓整場療程只切一次相機 ──
  w.eval("state.selectedAcupoints=['中渚穴','合谷穴'];state.selectedFace=['EX-HN3','BL2']");
  w.eval('buildTreatmentList()');
  const list = w.eval('JSON.stringify(state.selectedAcupoints)');
  // 臉部內部照 FACE_ACUPOINTS 的順序 —— 攢竹(BL2) 在眉區排在印堂(EX-HN3) 前面
  ok(list === '["合谷穴","中渚穴","BL2","EX-HN3"]',
     '手部照 ACUPOINTS 順序在前、臉部照 FACE_ACUPOINTS 順序在後：' + list);
  ok(w.eval("state.selectedAcupoints.filter(n=>isFaceItem(n)).length") === 2, 'isFaceItem 認得出兩個臉部項目');

  // 沒做出公式的臉部穴道要被擋掉 —— 排進去人會卡在定位頁不知道為什麼。
  // ⚠️ 2026-09-15 起 23 穴全部有公式，已經沒有「真的未實作」的代碼可以拿來測，
  //    所以改用一個不存在的代碼驗這道過濾**機制還在**。
  //    （之前用 GB3，它 2026-09-15 補上公式後這個測試就名不副實了。）
  w.eval("state.selectedAcupoints=['合谷穴'];state.selectedFace=['EX-HN3','XX99']");
  w.eval('buildTreatmentList()');
  ok(w.eval('JSON.stringify(state.selectedAcupoints)') === '["合谷穴","EX-HN3"]',
     '沒有公式的臉部代碼不會被排進療程（過濾機制還在）');

  // ── 抽象層：各頁只問這幾件事 ──
  ok(w.eval("itemLabel('EX-HN3')") === '印堂', 'itemLabel 給臉部名');
  ok(w.eval("itemLabel('合谷穴')") === '合谷穴', 'itemLabel 給手部名');
  ok(w.eval("itemRegion('EX-HN3')") === 'face' && w.eval("itemRegion('合谷穴')") === 'hand', 'itemRegion 分得出部位');
  ok(w.eval("itemDetector('EX-HN3')") === 'face', 'itemDetector：印堂要用 FaceMesh');
  ok(w.eval("itemRounds('EX-HN3')") === 1, '印堂是正中穴 → 按摩一輪');
  ok(w.eval("itemRounds('合谷穴')") === 2, '手部穴道 → 左右各一輪');
  ok(w.eval("itemGated('EX-HN3')") === true, '臉部也做對準把關（2026-09-04 起，靠 face-gate.js 判深度）');
  ok(w.eval("itemGated('合谷穴')") === true, '手部要對準才計時');
  ok(w.eval("itemLocate('EX-HN3')").includes('眉頭'), 'itemLocate 給印堂 WHO 原文');

  // ── 認穴頁：臉部分支 ──
  w.eval("state.selectedAcupoints=['合谷穴','EX-HN3'];state.currentAcupointIndex=1");
  w.showPage('acu-detail');
  ok($('acu-name').textContent === '印堂', '認穴頁顯示印堂');
  ok($('acu-progress').textContent === '2 / 2', '進度是 2 / 2');
  ok(/眉頭/.test($('acu-detail').textContent), '定位說明用 WHO 原文：' + $('acu-detail').textContent);
  ok(/1 人 1 張照片/.test($('acu-note').textContent), '有標明資料基礎只有 1 人 1 張照片');
  ok(!!$('page-acu-detail').querySelector('.ref-none'), '臉部沒有參考圖 → 顯示說明，不借手部的圖');
  ok(!$('page-acu-detail').querySelector('.ref-frame img'), '確認真的沒畫出手部參考圖');
  // 🚨 迴歸：ⓘ 面板裡也有 .ref-row，原本的全域 querySelector 會把 id 蓋過去
  ok($('acu-ref') && $('acu-ref').closest('#page-acu-detail') !== null,
     'acu-ref 這個 id 留在認穴頁裡，沒有被 ⓘ 詳情面板搶走');
  ok(/正面對著鏡頭/.test($('acu-side-hint').textContent), '提示改成正面對鏡頭：' + $('acu-side-hint').textContent);
  w.toggleTutorial();
  const tut = $('tutorial-box').textContent;
  ok(/鏡像/.test(tut), '教學提到前鏡頭鏡像');
  ok(/穴位標記/.test(tut), '教學講「指尖移到畫面上的穴位標記」');
  ok(!/碰到皮膚/.test(tut),
     '⭐ 深度檢查關著時，教學不能寫「要真的碰到皮膚」—— 那是承諾一個沒在跑的檢查');

  // ── 定位頁：同一頁換模型 ──
  w.showPage('camera'); await tick();
  ok($('camera-title').textContent === '印堂', '定位頁標題是印堂');
  ok(w.eval('faceCamRunning') === true, '臉部項目 → 開 FaceMesh');
  ok(w.eval('camRunning') === false, '⭐ 同時間手部 Hands 沒有開著（共用同一個 <video>）');
  ok(w.eval("faceCanvasId") === 'video-canvas', '臉部畫進定位頁的畫布，不是臉部頁那塊');
  ok(w.eval("faceGateId") === 'camera-gate', '讀數寫到定位頁的讀數列');
  ok(w.eval("JSON.stringify(faceSelected)") === '["EX-HN3"]', '定位頁只畫現在這一穴');
  // 讀數列的初始提示會被相機啟動訊息接手（正常），重點是**不能**留著手部那句
  ok(!/舉起手/.test($('camera-gate').textContent),
     '讀數列沒有留著手部的「請舉起手」：' + $('camera-gate').textContent);

  // 換回手部項目：模型要對調
  w.eval('state.currentAcupointIndex=0');
  w.showPage('acu-detail'); w.showPage('camera'); await tick();
  ok($('camera-title').textContent === '合谷穴', '切回手部項目');
  ok(w.eval('camRunning') === true && w.eval('faceCamRunning') === false, '⭐ 模型對調：Hands 開、FaceMesh 關');
  w.showPage('gallery');
  ok(w.eval('camRunning') === false && w.eval('faceCamRunning') === false, '離開定位頁兩套都關掉');

  // ── 使用者真的走一次：只勾臉部穴道 → 開始療程 ──
  w.goHome();
  const idxHead = w.eval("SYMPTOM_MAP.findIndex(s=>s.name==='緩解頭痛')");
  $('symptom-grid').children[idxHead].click();
  w.goToRecommendation();
  w.selectRegion('face');
  const faceItems2 = [...$('recommend-list').querySelectorAll('.acu-item')];
  const yintang = faceItems2.find(e => e.textContent.includes('印堂'));
  ok(!!yintang, '緩解頭痛的臉部清單裡有印堂');
  yintang.click();
  ok(w.eval("state.selectedFace.includes('EX-HN3')") === true, '勾起來了');
  ok(w.eval('state.selectedAcupoints.length') === 0, '此時手部清單還是空的');

  w.goToAcuDetail();
  ok(active().join() === 'acu-detail', '只勾臉部也能按「開始療程」進療程（以前只能走旁路）');
  ok(w.eval("JSON.stringify(state.selectedAcupoints)") === '["EX-HN3"]', '療程清單就是印堂一項');
  ok($('acu-name').textContent === '印堂', '認穴頁顯示印堂');
  ok($('acu-progress').textContent === '1 / 1', '進度 1 / 1');
  w.goHome();

  // ══ 臉部對準閘門（2026-09-04）══════════════════════════════════
  // 判定本身是純函式，可以直接餵假 landmark 測，不必開相機。
  // 常數來自三場次實測，見 記錄控制/PROGRESS.md 2026-09-04（續 3）。
  {
    const W = 640, H = 480;
    const pt = [{ x: 320, y: 200 }];        // 假的穴道位置

    // 造假手：十條 TRUST_BONES 裡有九條長 b、一條（[0,17]）長 2b，
    // 所以幾何平均 = b × 2^0.1。下面直接指定「要多大的表觀尺寸」，b 反推回去。
    const GM_FACTOR = Math.pow(2, 0.1);
    const fakeHand = (apparentPx, tipX, tipY) => {
      const bonePx = apparentPx / GM_FACTOR;
      const b = bonePx / W;                 // 正規化座標下的骨長（全部擺在 x 方向）
      const P = (x, y) => ({ x: x, y: y, z: 0 });
      const lm = [];
      for (let i = 0; i < 21; i++) lm.push(P(0.5, 0.5));
      // TRUST_BONES = [[0,5],[0,17],[5,17],[5,9],[9,13],[13,17],[10,11],[5,6],[13,14],[17,18]]
      lm[0] = P(0, .5);      lm[5] = P(b, .5);      lm[17] = P(2 * b, .5);
      lm[9] = P(2 * b, .5);  lm[13] = P(3 * b, .5); lm[10] = P(0, .5);
      lm[11] = P(b, .5);     lm[6] = P(2 * b, .5);  lm[14] = P(4 * b, .5);
      lm[18] = P(3 * b, .5);
      lm[8] = P(tipX / W, tipY / H);        // 食指尖
      lm[4] = P(tipX / W, tipY / H);        // 拇指尖同位置，不影響最小距離
      return lm;
    };
    const g = (lm, ipd) => JSON.parse(w.eval(
      'JSON.stringify(faceTouchGate(' + JSON.stringify(lm) + ',' + JSON.stringify(pt) + ',' + ipd + ',' + W + ',' + H + '))'));

    const IPD = 84;                          // 近距離（84/640 = 13% > 9.4%）
    const near = fakeHand(0.30 * IPD, 320, 200);   // R = 0.30 < 0.435 → 貼臉
    const hover = fakeHand(0.55 * IPD, 320, 200);  // R = 0.55 > 0.435 → 浮在前面

    const call = (lm, ipd, wasOk) => JSON.parse(w.eval(
      'JSON.stringify(faceTouchGate(' + JSON.stringify(lm) + ',' + JSON.stringify(pt) + ','
      + ipd + ',' + W + ',' + H + ',' + (wasOk ? 'true' : 'false') + '))'));

    // ── 現在的判準：只看 2D（2026-09-04 用戶決定）──
    ok(w.eval('FACE_DEPTH_CHECK') === false,
       '⭐ 深度檢查預設關閉 —— 實機試過「怪怪的」，改成只看 2D 有沒有接觸');
    ok(g(near, IPD).state === 'ok', '指尖落在穴位上 → ok');
    ok(g(hover, IPD).state === 'ok',
       '⭐ 手浮在臉前面**也算**（R=0.55 遠超深度門檻）—— 這是知情的取捨，不是漏洞');
    ok(Math.abs(g(near, IPD).R - 0.30) < 0.01,
       'R 仍然算出來放進回傳值（只是不拿來判），要能查：' + g(near, IPD).R);

    // 2D 沒對準才是唯一的 off
    const away = fakeHand(0.30 * IPD, 320, 200 + IPD);   // 差一整個 IPD
    ok(g(away, IPD).state === 'off', '2D 沒對準 → off');
    ok(g(away, IPD).gap >= 0.35, 'gap 以 IPD 為單位：' + g(away, IPD).gap);

    // 距離下限跟著深度檢查一起休眠 —— 只看 2D 的話遠近都判得動
    const smallIPD = 55;                     // 55/640 = 8.6% < 9.4%
    ok(g(fakeHand(0.30 * smallIPD, 320, 200), smallIPD).state === 'ok',
       '⭐ 人坐得遠也照樣判 —— far 只在深度檢查開著時才有意義');
    ok(g(fakeHand(0.30 * smallIPD, 320, 200), smallIPD).state !== 'far', '不會回 far');

    ok(g(null, IPD).state === 'nohand', '沒有手 → nohand，不是 ok');
    ok(g(near, 0).state === 'noface', '沒有臉（ipd=0）→ noface，不會除以零');

    // ── 施密特觸發：進場嚴、退場鬆（治「計時器一直閃暫停」）──
    const edge = fakeHand(0.30 * IPD, 320, 200 + 0.40 * IPD);   // gap = 0.40
    ok(call(edge, IPD, false).state === 'off', 'gap=0.40 從外面進不來（進場 0.35）');
    ok(call(edge, IPD, true).state === 'ok',
       '⭐ gap=0.40 已經貼著時留得住（退場 0.45）—— 壓著時指尖會被自己的手擋住');
    ok(call(away, IPD, true).state === 'off', '但差一整個 IPD 還是掉出去，寬鬆不是無限寬');

    // 常數釘住
    ok(w.eval('FACE_GAP_ENTER') === 0.35, '2D 進場容許度 0.35 IPD（約 2.2cm）');
    ok(w.eval('FACE_GAP_RELEASE') > w.eval('FACE_GAP_ENTER'),
       '⚠ 退場一定要比進場鬆，寫反了會變成更靈敏');
    ok(w.eval('FACE_HOLD_MS') === 400, '掉出去後撐 400ms 才停錶（蓋掉手擋住自己的閃斷）');
    // 深度那套雖然關著，常數與函式要留著能用 —— 實驗結論別弄丟
    ok(w.eval('FACE_TOUCH_R') === 0.45 && w.eval('FACE_TOUCH_R_RELEASE') === 0.49,
       '深度門檻留在碼裡（0.45 / 0.49），FACE_DEPTH_CHECK 一開就生效');
    ok(w.eval('FACE_MIN_IPD_FRAC') === 0.094, '距離下限也留著，且是畫面寬比例不是 60px');
    ok(w.eval('FACE_MIN_IPD_FRAC') === 0.094, '距離下限是畫面寬的 9.4%，不是寫死 60px');
    ok(/FACE_MIN_IPD_FRAC/.test(w.eval('faceTouchGate.toString()')), '距離判定真的用了那個比例常數');
  }

  // ── 按摩頁：臉部項目 ──
  w.eval("state.selectedAcupoints=['EX-HN3'];state.currentAcupointIndex=0");
  w.showPage('massage'); await tick();
  ok($('massage-title').textContent === '印堂', '按摩頁標題是印堂');
  ok(w.eval('faceCamRunning') === true, '臉部項目 → 按摩頁開 FaceMesh');
  ok(w.eval('faceMode') === 'massage', '⭐ 按摩模式：FaceMesh 之外還要跑 Hands（閘門要看手）');
  ok(w.eval('faceCanvasId') === 'massage-canvas', '畫進按摩頁的畫布');
  ok(w.eval('faceGateId') === 'massage-gate', '讀數寫到按摩頁的讀數列');
  ok(w.eval('totalRounds()') === 1, '印堂只按一輪');
  ok($('round-hand').textContent === '臉部', '輪次條不講「左手／右手」（按臉用哪隻手都行）');
  ok(/1\/1/.test($('round-pips').textContent), '輪次顯示 1/1：' + $('round-pips').textContent);
  ok(/只有一個/.test($('round-tip').textContent), '說明改成「只有一個，按完一輪就完成」');

  // 換回手部項目：輪數與相機都要回去
  w.eval("state.selectedAcupoints=['合谷穴'];state.currentAcupointIndex=0");
  w.showPage('massage'); await tick();
  ok(w.eval('totalRounds()') === 2, '手部穴道回到兩輪');
  ok(w.eval('camRunning') === true && w.eval('faceCamRunning') === false,
     '⭐ 按摩頁也會對調模型：Hands 開、FaceMesh 關');
  ok(/左手|右手/.test($('round-hand').textContent), '輪次條回到左右手：' + $('round-hand').textContent);
  w.goHome();

  // ══ 症狀覆蓋條（2026-09-14）═══════════════════════════════════════
  // 用戶提的問題：「選了 a 和 b 兩個病症，穴道全列在一起，
  // 萬一我不小心都只選到治 a 的怎麼辦」。
  // 守的四件事：① 覆蓋數要真的會跟著勾選動 ② 0 的那個要標出來
  //            ③ 點膠囊只看那個症狀 ④ 有症狀沒覆蓋時「開始療程」要先講一聲、但不擋
  {
    w.goHome();
    w.eval('state.selectedSymptoms=[]');
    // 挑兩個**穴道完全不重疊**的症狀，才驗得出「只勾到 a」這個情境：
    // 改善失眠 = 神門/後溪，緩解胸痛 = 太淵。
    const insomnia = w.eval("SYMPTOM_MAP.findIndex(s=>s.name==='改善失眠')");
    const chest = w.eval("SYMPTOM_MAP.findIndex(s=>s.name==='緩解胸痛')");
    $('symptom-grid').children[insomnia].click();
    $('symptom-grid').children[chest].click();
    ok(w.eval('state.selectedSymptoms.length') === 2, '覆蓋條：選了 2 個症狀');
    w.goToRecommendation();

    const chips = () => [...d.querySelectorAll('#coverage-row .cover-chip')];
    ok(chips().length === 2, `兩個症狀 → 兩顆膠囊（實得 ${chips().length}）`);
    ok(chips().every(c => c.classList.contains('miss')),
       '一穴都沒勾時，兩顆都標 miss');
    ok(chips().map(c => c.querySelector('.n').textContent).join() === '0,0', '覆蓋數都是 0');

    // 只勾「改善失眠」那邊的穴道 —— 這正是用戶擔心的情境
    const items = () => [...$('recommend-list').querySelectorAll('.acu-item')];
    const shenmen = items().find(e => e.dataset.acu === '神門穴');
    ok(!!shenmen, '清單裡有神門穴');
    shenmen.click();
    ok(chips()[0].querySelector('.n').textContent === '1', '勾了神門 → 失眠覆蓋數變 1');
    ok(!chips()[0].classList.contains('miss'), '失眠那顆不再標 miss');
    ok(chips()[1].classList.contains('miss'), '⭐ 胸痛那顆仍然是 miss（只勾到 a 的情境被抓到了）');

    // 「開始療程」：先講一聲，但不擋
    ok($('start-warn').children.length === 0, '還沒按之前沒有提醒框');
    w.tryStartTreatment();
    ok(active().join() === 'recommend', '⭐ 有症狀沒覆蓋 → 先留在選穴頁');
    ok($('start-warn').children.length === 1, '出現提醒框');
    ok(/緩解胸痛/.test($('start-warn').textContent), '提醒點名漏掉的那個症狀');
    const warnBtns = [...$('start-warn').querySelectorAll('button')];
    ok(warnBtns.length === 2, '提醒有兩個選項（看看有哪些 / 就這樣開始）');

    // ［看看有哪些］→ 篩到那個症狀
    warnBtns[0].click();
    ok(w.eval('filterSymptom') === chest, '按「看看有哪些」→ 篩到胸痛');
    ok(items().length === 1 && items()[0].dataset.acu === '太淵穴',
       `篩選後只剩太淵穴（實得 ${items().map(e => e.dataset.acu).join()}）`);
    ok($('start-warn').children.length === 0, '重畫清單時提醒框自動收掉');
    ok(w.eval('state.selectedAcupoints.length') === 1, '⭐ 篩選不會自動幫使用者勾（09-09 的決定）');

    // 再點一次膠囊 = 取消篩選
    chips()[1].click();
    ok(w.eval('filterSymptom') === null, '再點一次膠囊取消篩選');
    ok(items().length > 1, '清單回到全部');

    // ［就這樣開始］→ 真的放行
    w.tryStartTreatment();
    ok($('start-warn').children.length === 1, '再按一次又出現提醒');
    [...$('start-warn').querySelectorAll('button')][1].click();
    ok(active().join() === 'acu-detail', '⭐ 按「就這樣開始」真的走得下去（不硬擋）');

    // 兩個症狀都覆蓋到就不該再囉嗦
    w.goHome();
    w.eval('state.selectedSymptoms=[]');
    $('symptom-grid').children[insomnia].click();
    $('symptom-grid').children[chest].click();
    w.goToRecommendation();
    items().find(e => e.dataset.acu === '神門穴').click();
    items().find(e => e.dataset.acu === '太淵穴').click();
    ok(chips().every(c => !c.classList.contains('miss')), '兩個症狀都有覆蓋');
    w.tryStartTreatment();
    ok(active().join() === 'acu-detail', '⭐ 全覆蓋時直接進下一頁，不再提醒');

    // 只選一個症狀時整條藏起來（永遠顯示 1 的膠囊只是雜訊）
    w.goHome();
    w.eval('state.selectedSymptoms=[]');
    $('symptom-grid').children[insomnia].click();
    w.goToRecommendation();
    ok(chips().length === 0, '只選一個症狀 → 覆蓋條不出現');
    w.goHome();
  }

  // 首頁選擇上限與鍵盤焦點。
  w.goHome();
  ok($('home-next').disabled, '未選症狀不能下一步');
  // ⭐ 上限讀常數不寫死（2026-09-17 用戶把 5 改成 3，這裡原本寫死 5 就紅了）。
  //    MAX_SYMPTOMS 是 const，不會掛上 window，所以要用 w.eval 取。
  const maxSym = w.eval('MAX_SYMPTOMS');
  for (let i = 0; i < maxSym; i++) $('symptom-grid').children[i].click();
  const overflow = $('symptom-grid').children[maxSym];
  overflow.focus(); overflow.click();
  ok(w.eval('state.selectedSymptoms.length') === maxSym, `第 ${maxSym + 1} 項不加入選擇`);
  ok(d.activeElement === overflow, '上限提示不丟失鍵盤焦點');
  ok($('home-cast').querySelectorAll('img').length === maxSym, `${maxSym} 個角色對應 ${maxSym} 個已選症狀`);
  $('symptom-grid').children[0].click(); overflow.click();
  ok(w.eval(`state.selectedSymptoms.includes(${maxSym}) && !state.selectedSymptoms.includes(0)`),
     '取消後可改選另一項');
  w.goToRecommendation();
  ok(!$('step-progress').hidden && $('step-track').getAttribute('aria-valuenow') === '1', '選穴頁進度條顯示第一步');

  // 手動暫停不能把時間重設；放大縮小不能重新開始一輪。
  w.eval("state.selectedAcupoints=['合谷穴']; state.currentAcupointIndex=0");
  w.showPage('massage'); await tick();
  $('timer-input').value = '30'; w.updateTimerDisplay();
  w.eval('onTarget=true'); w.startMassage(); await wait(250);
  w.toggleMassagePause();
  const pausedRemain = w.eval('massageRemainMs');
  await wait(250);
  ok(w.eval('massageRemainMs') === pausedRemain, '手動暫停不消耗剩餘時間');
  w.enterMassageFullscreen();
  ok($('fs-pause').textContent === '繼續', '放大畫面仍有繼續入口');
  w.toggleMassagePause(); await wait(250);
  ok(w.eval('massageRemainMs') < pausedRemain, '繼續沿用剩餘時間');
  w.goHome();
  ok(!d.body.classList.contains('massage-fs'), '離開按摩頁釋放放大畫面');

  // 總結重繪純展示，不增加歷史或獎勵。
  w.eval("sessionLog=[{name:'合谷穴',ms:12000},{name:'EX-HN3',ms:5000}]");
  const savedProgress = w.eval('JSON.stringify([state.history,state.minions,state.streak])');
  w.showPage('summary');
  ok($('summary-stage').querySelectorAll('img').length === 5, '總結有五個角色');
  ok($('summary-rewards').children.length === 2, '總結列出本次兩個穴道獎勵');
  w.renderSummary(); w.setLanguage('en'); w.setLanguage('zh');
  ok(w.eval('JSON.stringify([state.history,state.minions,state.streak])') === savedProgress, '重開總結或切語言不重複記帳');
  ok(!$('summary-stage').classList.contains('celebrate'), '相同紀錄不重播慶祝');
  w.goHome();

  console.log(fail ? `\n=== ${fail} 項失敗 ===` : '\n=== 全過 ===');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('測試本身炸了:', e); process.exit(2); });
