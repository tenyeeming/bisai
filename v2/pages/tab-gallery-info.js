// ══ 圖冊 → 單穴介紹 ══════════════════════════════════════════════
// 從圖冊點任一格進來。2026-09-24 起網頁沒有收集／解鎖，每一穴都直接看得到；
// 「等級／次數／上次」那排統計也一併拿掉（網頁不存紀錄，見 js/state.js 開頭）。

let infoAcuName = null;

registerPage('acu-info', {
  tab: 'gallery',
  backTo: 'gallery',
  onEnter: () => renderAcuInfo(),
  // 播放器是貼在 <body> 上的，切頁不會自己消失 —— 離開這頁一定要關掉
  onLeave: () => closeTutorialVideo(),
  onLanguage: () => renderAcuInfo(),

  html: `
  <div id="page-acu-info" class="page">
    <style>
      .info-head { display: flex; gap: 14px; align-items: center; }
      .info-portrait {
        flex: none; width: 92px; height: 92px; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        overflow: hidden; position: relative;
      }
      .info-code {
        font-family: var(--font-mono); font-size: 11px; letter-spacing: .1em;
        color: var(--brass);
      }
      .info-meta { font-size: 12.5px; color: var(--ink-soft); margin-top: 3px; }

      .info-sec + .info-sec { margin-top: 13px; }
      .info-sec h3 {
        font-family: var(--font-mono); font-size: 10px; letter-spacing: .16em;
        text-transform: uppercase; color: var(--brass); font-weight: 500;
        margin-bottom: 5px;
      }
      .info-sec p { font-size: 13px; color: var(--ink); }

      .tag-row { display: flex; flex-wrap: wrap; gap: 5px; }
      .tag {
        font-size: 12px; padding: 4px 9px;
        border: 1px solid var(--line); border-radius: 999px;
        color: var(--ink-soft); background: var(--surface);
      }
      /* 可點的主治標籤（2026-09-04，補上 App 已有的互動）：
         點下去＝以那個症狀開一次療程。長得像 # 標籤，所以要讓人看出「這是能按的」——
         用 <button> 而不是 <span>，鍵盤 Tab 得到、螢幕閱讀器唸得出來。 */
      button.tag {
        font-family: inherit; cursor: pointer;
        display: inline-flex; align-items: center; gap: 2px;
        transition: border-color .15s, color .15s, background .15s;
      }
      button.tag .hash { font-family: var(--font-mono); color: var(--brass); }
      button.tag:hover { border-color: var(--brass); color: var(--ink); background: var(--surface-2); }
      button.tag:focus-visible { outline: 2px solid var(--brass); outline-offset: 2px; }

      /* 臉部的「頭像」（2026-09-20）：臉部沒有小人，用代號圓標。
         字從 13px 起跳、太長的代號（EX-HN7）縮到 11px —— 用 clamp 而不是寫死，
         不然 92px 的圓圈裝不下七個字，在手機上會溢出。 */
      .info-portrait .code-badge-lg {
        font-family: var(--font-mono); font-weight: 700; color: #fff;
        font-size: clamp(11px, 3.4vw, 15px); letter-spacing: .02em;
      }

      /* 這頁的參考圖給整塊寬度，比認穴頁那張大 */
      #info-ref .ref-frame, #info-ref .ref-none { width: 100%; }
      #info-ref .ref-frame img { max-height: 340px; object-fit: contain; }
      .info-use {
        border: 1px solid var(--line-soft); border-radius: var(--r-cell);
        padding: 9px 11px; display: grid; gap: 4px;
      }
      .info-use strong { color: var(--brass); font-size: 13px; }
      .info-use p { font-size: 12.5px; color: var(--ink-soft); }
      @media (max-width: 599px), ((max-height: 599px) and (pointer: coarse)) {
        #page-acu-info {
          position: fixed; left: 0; right: 0; bottom: 0; z-index: 80;
          max-height: 90dvh; overflow-y: auto;
          /* 2026-09-23 修：底部膠囊分頁列（約 58px ＋ 離底 6px）疊在這張 sheet 上面，
             捲到底時「練習」鈕整顆被它蓋住、按下去會按到「圖冊」分頁（手部／臉部都中）。
             留白多墊 76px，讓最後一顆鈕停在分頁列上方。 */
          padding: 18px 16px calc(22px + 76px + env(safe-area-inset-bottom));
          border-radius: 22px 22px 0 0; background: var(--bg);
          box-shadow: 0 -18px 60px rgba(10,28,42,.28);
        }
        #page-acu-info::before {
          content: ''; display: block; width: 42px; height: 4px; margin: -7px auto 14px;
          border-radius: 999px; background: var(--line);
        }
        #page-acu-info .info-head { align-items: flex-end; }
        #page-acu-info .info-portrait { display: none; }
        #page-acu-info .stack { gap: 13px; }
      }
    </style>

    <div class="stack">
      <div class="info-head">
        <div class="info-portrait" id="info-portrait"></div>
        <div>
          <p class="info-code" id="info-code"></p>
          <h2 class="acu-title" id="info-name"></h2>
          <p class="info-meta" id="info-meta"></p>
        </div>
      </div>

      <div id="info-note"></div>

      <div>
        <div class="info-sec">
          <h3 data-i18n="info-locate">定位</h3>
          <p id="info-locate"></p>
        </div>
        <div class="info-sec" id="info-uses"></div>
        <div class="info-sec" id="info-ref"></div>
        <div class="info-sec" id="info-video"></div>
        <div class="info-sec">
          <h3 data-i18n="info-symptoms">主治</h3>
          <div class="tag-row" id="info-symptoms"></div>
        </div>
      </div>

      <button class="btn wide" id="btn-practice" onclick="practiceThisAcu()" data-i18n="btn-practice">練習</button>
    </div>
  </div>`,
});

// 從圖冊點某一格。id 可以是手部穴名或臉部代號（2026-09-20）
function showAcuInfo(id) {
  // 防呆：認不得的 id（舊連結、資料表改過）就退回圖冊，
  // 不要進到一頁全部空白的介紹頁
  if (!ACUPOINTS.some(a => a.name === id) && !isFaceItem(id) && !isForearmItem(id)) { showPage('gallery'); return; }
  infoAcuName = id;
  showPage('acu-info');
}

function renderAcuInfo() {
  const name = infoAcuName;
  if (!name) { showPage('gallery'); return; }
  if (isFaceItem(name)) { renderFaceAcuInfo(name); return; }
  if (isForearmItem(name)) { renderForearmAcuInfo(name); return; }

  const acu = ACUPOINTS.find(a => a.name === name) || {};
  const detail = ACUPOINT_DETAIL[name] || {};
  // ── 頭像：這一穴的專屬小人 ──
  const portrait = document.getElementById('info-portrait');
  portrait.innerHTML = '';
  portrait.className = 'info-portrait';
  portrait.style.background = acuColor(name);
  // 2026-09-25（網頁v2 批 A）：頭像不放小人（網頁小人只留慶祝）→ 代號圓標，同臉部／前臂。
  //   參考圖在下面「參考圖」那一塊，這裡不重複放。
  const hb = document.createElement('div');
  hb.className = 'code-badge-lg';
  hb.textContent = acu.code || acuLabel(name).slice(0, 2);
  portrait.appendChild(hb);

  document.getElementById('info-code').textContent = acu.code || '';
  document.getElementById('info-name').textContent = acuLabel(name);

  // ── 部位 + 正反面 ──
  const region = regionOf(acuRegion(name));
  const sideKey = BILATERAL_ACUPOINTS.has(name) ? 'side-both'
    : acu.side === 'palm' ? 'side-palm' : 'side-dorsal';
  const implemented = IMPLEMENTED.has(name);
  document.getElementById('info-meta').textContent =
    `${t(region.label)}　·　${t(sideKey)}` + (implemented ? '' : `　·　${t('info-nolocate')}`);

  // ── 安全警語 ──
  const noteBox = document.getElementById('info-note');
  noteBox.innerHTML = '';
  if (detail.note) {
    const p = document.createElement('p');
    p.className = 'notice warn';
    p.textContent = detail.note;
    noteBox.appendChild(p);
  }

  document.getElementById('info-locate').textContent =
    acu.locate || (isZh() ? '（尚無定位描述）' : '(no description yet)');
  document.getElementById('info-uses').innerHTML = '';

  // ── 參考圖 ──
  const refSec = document.getElementById('info-ref');
  refSec.innerHTML = `<h3>${t('ref-title')}</h3>`;
  refSec.appendChild(acuRefBlock(name));

  // ── 教學影片（2026-09-05）──
  // 跟認穴頁共用同一顆按鈕與同一個全螢幕播放器（js/acu-video.js）。
  // 只有白名單上有片的穴道才出現這一區，沒有就整塊不畫 —— 不要留一個空標題。
  const vidSec = document.getElementById('info-video');
  vidSec.innerHTML = '';
  const vidBtn = acuVideoButton(name);
  if (vidBtn) {
    // 不放 <h3> 標題：按鈕上就寫著「教學影片」，再加一行標題是同一句話講兩次
    vidSec.append(vidBtn);
    vidSec.hidden = false;
  } else {
    vidSec.hidden = true;
  }

  // ── 主治：從症狀表反查 ──
  const sym = SYMPTOM_MAP.filter(s => s.acupoints.includes(name));
  const symBox = document.getElementById('info-symptoms');
  symBox.innerHTML = '';
  if (!sym.length) {
    symBox.innerHTML = `<span class="tag">${t('info-nosymptom')}</span>`;
  } else {
    sym.forEach(s => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'tag';
      const hash = document.createElement('span');
      hash.className = 'hash';
      hash.textContent = '#';
      hash.setAttribute('aria-hidden', 'true');
      el.append(hash, document.createTextNode(symptomLabel(s.name)));
      el.title = t('info-symptom-go');
      el.setAttribute('aria-label', `${symptomLabel(s.name)} — ${t('info-symptom-go')}`);
      el.onclick = () => startFromSymptom(s.name);
      symBox.appendChild(el);
    });
  }

  // 沒有定位公式的穴道不能練，按了只會失敗
  const btn = document.getElementById('btn-practice');
  btn.disabled = !implemented;
  btn.textContent = implemented ? t('btn-practice') : t('info-nolocate');
}

// 從圖冊直接練單穴：跳過症狀與選穴，直接進認穴
//
// ⭐ 臉部走**同一條路**（2026-09-20）—— 療程清單本來就是混裝的
//    （js/regions.js 的「療程項目」那組 helper），認穴頁、相機頁都已經會分辨，
//    所以這裡不必為臉部另開一條分支。只有「能不能練」的判斷要換成 itemImplemented()。
function practiceThisAcu() {
  if (infoAcuName && FOREARM_LAB[infoAcuName]) { location.href = FOREARM_LAB[infoAcuName]; return; }
  if (!infoAcuName || !itemImplemented(infoAcuName)) return;
  state.selectedSymptoms = [];
  state.recommendedAcupoints = isFaceItem(infoAcuName) ? [] : [infoAcuName];
  state.selectedFace = isFaceItem(infoAcuName) ? [infoAcuName] : [];
  state.selectedAcupoints = [infoAcuName];
  state.currentAcupointIndex = 0;
  showPage('acu-detail');
}

/**
 * 臉部穴道的圖冊介紹（2026-09-20 圖冊納入臉部時加）。
 *
 * 跟手部**同一頁、同一組 DOM**，只是填不同的東西 —— 這是網頁這邊一貫的做法
 * （認穴頁 `renderFaceAcuDetail()` 也是這樣），不另開一頁：
 * 兩頁會各自長歪，改一邊忘了另一邊。
 *
 * 四處刻意不同：
 *   頭像  — 臉部**沒有小人**（那組 SVG 只畫了手部 26 穴）→ 代號圓標，同圖冊小格
 *   定位  — 白話（FACE_DETAIL）優先，沒有才退 WHO 原文
 *   影片  — 臉部一支片都沒有（ACU_VIDEO 沒有臉部條目），整塊不畫
 *   主治  — 查 FACE_SYMPTOM_MAP，不是手部那張表
 */
function renderFaceAcuInfo(code) {
  const acu = faceAcu(code) || {};
  const detail = faceDetail(code);
  const implemented = FACE_IMPLEMENTED.has(code);

  // ── 頭像：代號圓標 ──
  const portrait = document.getElementById('info-portrait');
  portrait.innerHTML = '';
  portrait.className = 'info-portrait';
  portrait.style.background = faceColor(code);
  const badge = document.createElement('div');
  badge.className = 'code-badge-lg';
  badge.textContent = code;
  portrait.appendChild(badge);

  // 2026-09-25（網頁v2 批 E，App 批 75）：文字一律改讀 Excel（js/face-sheet.js），版面照手部：
  //   代號＋英文名 → 「臉部（· 尚未支援定位）」→ Excel 備注 → Excel 定位 → 參考圖 → 按壓方式、說明 → 主治 → 練習。
  //   不再放 WHO 原文、PDF 逐條用法、經外奇穴標記、誠實聲明（App 同；誠實聲明仍在選穴 ⓘ 與認穴頁）。
  const sheet = faceSheet(code);
  document.getElementById('info-code').textContent = sheet && sheet.en ? `${code} · ${sheet.en}` : code;
  document.getElementById('info-name').textContent = faceLabel(code);
  document.getElementById('info-meta').textContent =
    [t('region-face'), implemented ? null : t('info-nolocate')].filter(Boolean).join('　·　');

  const noteBox = document.getElementById('info-note');
  noteBox.innerHTML = '';
  if (sheet && sheet.note) {
    const p = document.createElement('p');
    p.className = 'notice warn';
    p.textContent = sheet.note;
    noteBox.appendChild(p);
  }

  document.getElementById('info-locate').textContent =
    (sheet && sheet.locate) || (isZh() ? '（尚無定位描述）' : '(no description yet)');

  // 按壓方式、說明：Excel 兩欄（手部那份是通用句所以手部不列，臉部每穴不同才列 —— App 同）。
  // 位置照 App 排在參考圖後面（見下）；#info-uses 這一格臉部不用。
  document.getElementById('info-uses').innerHTML = '';

  const refSec = document.getElementById('info-ref');
  refSec.innerHTML = `<h3>${t('ref-title')}</h3>`;
  refSec.appendChild(faceRefBlock(code));
  // 按壓方式／說明排在參考圖之後（App 順序）：直接接在參考圖那一塊裡，不搬 #info-uses（手部、前臂也用它）
  [['face-sheet-press', sheet && sheet.press], ['face-sheet-desc', sheet && sheet.desc]].forEach(([k, v]) => {
    if (!v) return;
    const box = document.createElement('div');
    box.className = 'info-sec face-sheet-sec';
    const h = document.createElement('h3'); h.textContent = t(k);
    const p = document.createElement('p'); p.textContent = v;
    box.append(h, p);
    refSec.appendChild(box);
  });

  // 臉部目前一支教學片都沒有 —— 整塊不畫，不要留一個空標題
  const vidSec = document.getElementById('info-video');
  vidSec.innerHTML = '';
  vidSec.hidden = true;

  // ── 主治：查臉部那張表 ──
  const names = Object.keys(FACE_SYMPTOM_MAP).filter(n => FACE_SYMPTOM_MAP[n].includes(code));
  const symBox = document.getElementById('info-symptoms');
  symBox.innerHTML = '';
  if (!names.length) {
    symBox.innerHTML = `<span class="tag">${t('info-nosymptom')}</span>`;
  } else {
    names.forEach(n => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'tag';
      const hash = document.createElement('span');
      hash.className = 'hash';
      hash.textContent = '#';
      hash.setAttribute('aria-hidden', 'true');
      el.append(hash, document.createTextNode(symptomLabel(n)));
      el.title = t('info-symptom-go');
      el.setAttribute('aria-label', `${symptomLabel(n)} — ${t('info-symptom-go')}`);
      el.onclick = () => startFromSymptom(n);
      symBox.appendChild(el);
    });
  }

  const btn = document.getElementById('btn-practice');
  btn.disabled = !implemented;
  btn.textContent = implemented ? t('btn-practice') : t('info-nolocate');
}

function renderForearmAcuInfo(name) {
  const acu = forearmAcu(name);
  if (!acu) { showPage('gallery'); return; }
  const portrait = document.getElementById('info-portrait');
  portrait.innerHTML = ''; portrait.className = 'info-portrait';
  portrait.style.background = forearmColor(name);
  const fb = document.createElement('div'); fb.className = 'code-badge-lg'; fb.textContent = acu.code;
  portrait.appendChild(fb);
  document.getElementById('info-code').textContent = acu.code;
  document.getElementById('info-name').textContent = acu.name;
  document.getElementById('info-meta').textContent = `${isZh() ? '前臂' : 'Forearm'}　·　` +
    (FOREARM_LAB[name] ? (isZh() ? '實驗定位' : 'Experimental locating') : t('info-nolocate'));
  const note = document.getElementById('info-note'); note.innerHTML = '';
  if (acu.caution) { const p=document.createElement('p'); p.className='notice warn'; p.textContent=acu.caution; note.appendChild(p); }
  document.getElementById('info-locate').textContent = acu.locate;
  const uses = document.getElementById('info-uses');
  uses.innerHTML = `<div class="info-use"><strong>${isZh() ? '說明' : 'About'}</strong><p>${acu.note}</p><p>${isZh() ? '按法：' : 'Method: '}${FOREARM_PRESS}</p></div>`;
  const ref = document.getElementById('info-ref'); ref.innerHTML = `<h3>${t('ref-title')}</h3>`; ref.appendChild(forearmRefBlock(name));
  const vid = document.getElementById('info-video'); vid.innerHTML=''; vid.hidden=true;
  const sym = Object.keys(FOREARM_SYMPTOM_MAP).filter(n => FOREARM_SYMPTOM_MAP[n].includes(name));
  const box = document.getElementById('info-symptoms'); box.innerHTML='';
  sym.forEach(n => { const b=document.createElement('button'); b.type='button'; b.className='tag'; b.innerHTML='<span class="hash">#</span>'; b.appendChild(document.createTextNode(symptomLabel(n))); b.onclick=()=>startFromSymptom(n); box.appendChild(b); });
  // 2026-09-23 用戶：「專門在他的圖冊裏面開通」「開小海就行」——
  // 只有 FOREARM_LAB 裡的穴開放，點了進獨立實驗頁 forearm-lab.html（Hands＋Pose），
  // 不走認穴→相機→按摩那條療程流程：vision.js 只有 Hands，Pose 錨定沒接進去。
  const lab = FOREARM_LAB[name];
  const btn = document.getElementById('btn-practice');
  btn.disabled = !lab;
  btn.textContent = lab ? (isZh() ? '練習（實驗版）' : 'Try (experimental)') : t('info-nolocate');
}

// 前臂開放實驗定位的穴 → 實驗頁網址
const FOREARM_LAB = { '小海穴': 'forearm-lab.html' };
