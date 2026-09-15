// ═══════════════════════════════════════════════════════════════════
// 穴道教學影片
//
// assets/tutorial/ 底下一穴一支 mp4，檔名沿用 acu-data.js 的 ref 欄位
// （只是副檔名換成 .mp4），跟 js/acu-ref.js 的參考圖同一套命名。
//
// ⚠ 沒有影片的穴道**不要放進 ACU_VIDEO**。這裡是白名單而不是「試著載載看」：
//   本站要能用 file:// 直接開，fetch 一律失敗，探測不到檔案在不在，
//   只能靠這張表說實話。表上沒有的穴道，教學區塊就只出文字步驟。
//
// 目前只有合谷穴有片（2026-09-05，先拿一支螢幕錄影當佔位，驗流程用）。
// ═══════════════════════════════════════════════════════════════════

const ACU_VIDEO = {
  '合谷穴': 'hegu.mp4',
};

const acuVideoSrc = (name) =>
  ACU_VIDEO[name] ? `assets/tutorial/${ACU_VIDEO[name]}` : null;

const hasAcuVideo = (name) => !!acuVideoSrc(name);

// 跳轉幾秒。抽成純函式的理由跟 face-gate.js 一樣：判斷邏輯不綁 DOM 才測得動。
// 兩端都要夾住：往前跳過頭 = 從頭播（不是負秒數），往後跳過頭 = 停在結尾。
// duration 在影片還沒載好時是 NaN，這時只夾下限。
const SEEK_STEP = 10;                       // 秒。跟 App 的 AcuVideo.SEEK_STEP_MS 同一個值
function seekTarget(cur, delta, duration) {
  const t = (Number(cur) || 0) + delta;
  if (t < 0) return 0;
  if (Number.isFinite(duration) && t > duration) return duration;
  return t;
}

/**
 * 產生「看教學影片」那顆按鈕；沒有影片就回 null（呼叫端自己決定要不要留位子）。
 *
 * ⚠️ 這裡**不放 <video>**。2026-09-05 用戶試過內嵌小框，結論是「不太好」——
 *    手機上那塊只有一指寬，看不清楚在示範什麼。改成點了才開全螢幕播放器。
 *    好處還有一個：不內嵌就不會有影片在背景偷偷載，這頁正在預熱 MediaPipe（~16MB）。
 */
function acuVideoButton(name) {
  if (!acuVideoSrc(name)) return null;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'vid-open';
  btn.onclick = () => openTutorialVideo(name);

  const play = document.createElement('span');
  play.className = 'play';
  play.textContent = '▶';

  const label = document.createElement('span');
  label.textContent = t('btn-play-video');

  btn.append(play, label);
  return btn;
}

// ── 全螢幕播放器 ──────────────────────────────────────────────────
// 自己做一層覆蓋層，不靠 requestFullscreen()：
//   iOS Safari 的全螢幕只吃 <video> 自己（webkitEnterFullscreen），
//   對 <div> 無效 —— 靠瀏覽器 API 會變成「Android 全螢幕、iPhone 不會」。
//   覆蓋層是自己畫的，到哪都一樣。
// 另外仍然**試著**進系統全螢幕（失敗就算了），Android Chrome 上可以再多吃掉網址列。
//
// 三種退出方式，缺一不可：右上角 ✕、點影片以外的地方、Esc（手機的返回鍵不歸我們管，
// 但瀏覽器返回鍵會直接離開這一頁，所以前兩個才是主力）。
let tutorialOverlay = null;

function openTutorialVideo(name) {
  const src = acuVideoSrc(name);
  if (!src || tutorialOverlay) return;

  const ov = document.createElement('div');
  ov.className = 'vid-overlay';
  ov.id = 'vid-overlay';

  const v = document.createElement('video');
  v.src = src;
  v.controls = true;
  v.playsInline = true;
  v.autoplay = true;         // 點了「看教學影片」就是要看，不要再按一次
  v.setAttribute('aria-label', isZh() ? `${name}教學影片` : `${name} tutorial video`);
  v.onerror = () => closeTutorialVideo();
  v.onclick = (e) => e.stopPropagation();   // 點影片本身不要關掉

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'vid-close';
  close.textContent = '✕';
  close.setAttribute('aria-label', t('btn-close'));
  close.onclick = closeTutorialVideo;

  // ── 前後各跳 10 秒 ──────────────────────────────────────────
  // 原生 controls 本來就有進度條，缺的是「跳一小段」——手機上拖進度條很難拖準。
  // 放左右兩側垂直置中：不擋影片底緣的原生控制列，拇指也搆得到。
  const mkSeek = (delta, label) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'vid-seek ' + (delta < 0 ? 'back' : 'fwd');
    b.textContent = label;
    b.setAttribute('aria-label', (isZh() ? '跳轉 ' : 'Seek ') + delta + 's');
    b.onclick = (e) => {
      e.stopPropagation();                  // 不要順便觸發「點外面關掉」
      v.currentTime = seekTarget(v.currentTime, delta, v.duration);
    };
    return b;
  };

  ov.onclick = closeTutorialVideo;          // 點影片以外的地方 = 關掉
  ov.append(close, mkSeek(-SEEK_STEP, '« 10'), v, mkSeek(SEEK_STEP, '10 »'));
  document.body.appendChild(ov);
  tutorialOverlay = ov;

  document.addEventListener('keydown', onTutorialKey);
  // 進系統全螢幕是加分項，不成功也照樣有覆蓋層
  if (ov.requestFullscreen) { try { ov.requestFullscreen().catch(() => {}); } catch (e) {} }
}

function closeTutorialVideo() {
  if (!tutorialOverlay) return;
  tutorialOverlay.querySelectorAll('video').forEach(v => { v.pause(); v.removeAttribute('src'); });
  tutorialOverlay.remove();
  tutorialOverlay = null;
  document.removeEventListener('keydown', onTutorialKey);
  if (document.fullscreenElement && document.exitFullscreen) {
    try { document.exitFullscreen().catch(() => {}); } catch (e) {}
  }
}

function onTutorialKey(e) {
  if (!tutorialOverlay) return;
  if (e.key === 'Escape') { closeTutorialVideo(); return; }
  // 桌機用左右鍵跳，跟兩顆按鈕同一個步長（評審用筆電看的時候會這樣按）
  const v = tutorialOverlay.querySelector('video');
  if (!v) return;
  if (e.key === 'ArrowLeft')  { v.currentTime = seekTarget(v.currentTime, -SEEK_STEP, v.duration); e.preventDefault(); }
  if (e.key === 'ArrowRight') { v.currentTime = seekTarget(v.currentTime,  SEEK_STEP, v.duration); e.preventDefault(); }
}
