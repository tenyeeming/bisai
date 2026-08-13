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
  ok(n === 15, `15 頁全部載入（實得 ${n}）`);
  ok(active().join() === 'home', '起始在首頁');
  ok(activeTab().join() === 'home', '起始分頁 = 首頁');
  ok(d.querySelectorAll('#steprail li').length === 5, '步驟軌自動長出 5 格');
  ok([...d.querySelectorAll('#steprail li')].map(l => l.getAttribute('data-step')).join() === 'home,recommend,acu-detail,camera,massage', '步驟軌順序正確');
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

  $('recommend-list').children[0].click();
  $('recommend-list').children[1].click();
  ok(w.eval('state.selectedAcupoints.length') === 2, '勾了 2 個穴道');

  // 頭痛對應的 5 個臉部穴道（太陽/印堂/陽白/攢竹/上關）目前一個都還沒實作定位，
  // 所以這裡要驗「誠實顯示」：列得出來但全部標準備中，而且 seg 不能顯示 0
  segBtns()[2].click();
  ok(segBtns()[2].classList.contains('on'), '切到臉部');
  ok(segBtns()[2].querySelector('.n').textContent === '準備中',
     '臉部有穴道但都沒實作 → 標「準備中」而不是 0');
  const faceItems = [...$('recommend-list').querySelectorAll('.acu-item')];
  ok(faceItems.length === 5, `頭痛列出 5 個臉部穴道（實得 ${faceItems.length}）`);
  ok(faceItems.every(e => /準備中/.test(e.textContent)), '未實作的臉部穴道全部標準備中');
  ok(faceItems.every(e => e.getAttribute('aria-disabled') === 'true'), '未實作的點不可勾選');
  ok(w.eval('state.selectedAcupoints.length') === 2, '換部位不會清掉已勾的穴道');
  segBtns()[0].click();
  ok($('recommend-list').children.length === 7, '切回手部，清單還在');
  ok([...$('recommend-list').children].filter(e => e.classList.contains('checked')).length === 2,
     '切回來後勾選狀態有還原');

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
  ok($('tutorial-box').style.display === 'block' && $('tutorial-box').children.length === 4, '教學展開為 4 步');
  w.toggleTutorial();
  ok($('tutorial-box').style.display === 'none', '教學可收合');

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
  ok($('round-hand').textContent === '左手', '第一輪標「左手」');
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
  ok($('round-hand').textContent === '右手', '換手：標成「右手」');
  ok($('round-pips').textContent === '2/2', '輪次進到 2/2');
  ok(!$('round-switch').hidden && /左手完成/.test($('round-switch').textContent)
     && /換成右手/.test($('round-switch').textContent), '顯示換手提示：' + $('round-switch').textContent);
  ok($('btn-massage-start').textContent === '開始按右手', '按鈕變成「開始按右手」');
  ok($('btn-massage-start').disabled === false, '按鈕重新啟用');
  ok(w.eval('JSON.stringify(state.history)') === '{}', '只按完一隻手不算完成，沒寫紀錄');
  ok(w.eval('massageRemainMs') === 5000, '第二輪計時重新裝滿');

  // 第二輪（右手）歸零 → 才算完成
  w.startMassage();
  ok($('round-switch').hidden, '開始第二輪後換手提示收起');
  w.eval('massageRemainMs=100');
  await wait(300);
  ok(active().join() === 'complete', '兩輪都完成 → 完成頁');
  ok($('backbar').style.display === 'none', '完成頁不顯示返回列');
  ok(w.eval('camRunning') === false, '完成頁自動關相機');
  ok($('minion-badge').textContent === 'Lv.1', '首次完成 = Lv.1');
  ok(/連續第 1 天/.test($('complete-streak').textContent), '連續第 1 天');
  ok($('btn-next-acu').style.display === '', '還有下一穴，按鈕顯示');
  ok(w.eval('state.history[state.selectedAcupoints[0]].times') === 1, '紀錄寫入 times=1');

  w.goToNextAcu();
  ok(active().join() === 'acu-detail' && $('acu-progress').textContent === '2 / 2', '下一穴 → 認穴頁 2/2');

  // ── 圖冊 ──
  w.showPage('gallery');
  ok($('backbar').style.display === 'none', '圖冊分頁不顯示返回列');
  ok(/1 \/ 26 已解鎖/.test($('gallery-progress').textContent), '圖冊 1/26 已解鎖（實得 ' + $('gallery-progress').textContent + '）');

  // ── 小人圖 ──
  const tiles = [...$('collection-grid').children];
  ok(tiles.length === 26, '圖冊有 26 格');
  ok(tiles.every(t => t.querySelector('img.minion')), '每一格都有小人圖');
  const srcs = tiles.map(t => t.querySelector('img.minion').getAttribute('src'));
  ok(new Set(srcs).size === 26, '26 隻小人各自不同檔（沒有共用同一張）');
  ok(srcs.every(s => /^assets\/minions\/[a-z]+\.svg$/.test(s)), '圖片路徑格式正確：' + srcs[0]);
  ok(tiles.filter(t => t.classList.contains('locked')).length === 25, '25 格未解鎖（顯示剪影）');
  ok(tiles.filter(t => t.querySelector('.lv')).length === 1, '只有已解鎖那格有 Lv 標籤');

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

  // 沒有定位公式的穴道不能練
  w.eval("infoAcuName='少商穴'"); w.showPage('acu-info');
  ok($('btn-practice').disabled === true, '少商穴尚未支援定位 → 按鈕停用');
  ok($('info-ref').querySelector('.ref-none'), '少商穴沒有參考圖 → 顯示「尚無參考圖」而不是借別穴的圖');

  // 從介紹頁直接練這一穴
  w.eval("infoAcuName='合谷穴'"); w.showPage('acu-info');
  w.practiceThisAcu();
  ok(active().join() === 'acu-detail', '按「練這一穴」→ 認穴頁');
  ok(w.eval("JSON.stringify(state.selectedAcupoints)") === '["合谷穴"]', '療程只有這一穴');
  ok($('acu-progress').textContent === '1 / 1', '進度顯示 1 / 1');

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
  ok([...d.querySelectorAll('#steprail li')].map(l => l.textContent).join().includes('Symptom'), '步驟軌跟著切英文');
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
  ok(menuRows().length === 4, `設定目錄列出 4 個功能（實得 ${menuRows().length}）`);
  ok(menuRows().map(b => b.querySelector('.label').textContent).join() === '語言,每日提醒,定位精度,資料與紀錄',
     '目錄四列：語言／每日提醒／定位精度／資料與紀錄');
  ok(!$('page-settings').querySelector('input'), '設定首頁本身沒有任何開關（全都搬進子頁）');
  ok(menuRows()[0].querySelector('.value').textContent === '中文', '目錄右邊直接顯示現在設成什麼');
  menuRows()[0].click();
  ok(active().join() === 'settings-lang' && activeTab().join() === 'settings', '點「語言」進子頁，分頁仍停在設定');
  w.goBack();
  ok(active().join() === 'settings', '返回列退回設定目錄');

  // ── 設定 › 定位精度 ──
  w.showPage('settings-accuracy');
  ok($('strict-gate').checked === w.eval('strictGate'), '嚴格模式勾選狀態同步');
  w.onStrictChange(false);
  ok(w.eval('strictGate') === false && w.localStorage.getItem('strictGate') === 'false', '關閉嚴格模式會存檔');
  w.showPage('settings');
  ok(menuRows()[2].querySelector('.value').textContent === '寬鬆', '關掉之後目錄那列跟著顯示「寬鬆」');
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
  ok(segs()[2].querySelector('.n').textContent === '3', '目痛：臉部標 3 個可定位的穴道（睛明/承泣/四白）');
  const items = [...$('recommend-list').querySelectorAll('.acu-item')];
  ok(items.length === 10, `目痛列出 10 個臉部穴道（實得 ${items.length}）`);
  const ready = items.filter(e => e.getAttribute('aria-disabled') === 'false');
  ok(ready.length === 3, `其中 3 個可勾選（實得 ${ready.length}）`);
  ready[0].click(); ready[1].click();
  ok(w.eval('state.selectedFace.length') === 2, '勾了 2 個臉部穴道');
  ok(w.eval("state.selectedAcupoints.length") === 0, '臉部勾選不會混進手部清單');

  const startBtn = [...$('recommend-list').querySelectorAll('button')].pop();
  ok(/臉部定位/.test(startBtn.textContent), '臉部分頁有自己的「開始臉部定位」按鈕');
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

  console.log(fail ? `\n=== ${fail} 項失敗 ===` : '\n=== 全過 ===');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('測試本身炸了:', e); process.exit(2); });
