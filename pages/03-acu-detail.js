// ══ 步驟三：認穴 ═════════════════════════════════════════════════
// 定位文字來自 ACUPOINTS[].locate，安全警語來自 ACUPOINT_DETAIL[].note，
// 兩者都在 js/acu-data.js。

registerPage('acu-detail', {
  tab: 'home',
  step: 3,
  stepLabel: 'step-3',
  backTo: 'recommend',
  // 下一步就是定位頁，趁使用者在這頁讀說明時，先把 MediaPipe 在背景載好
  // （~16MB，不預熱的話會卡在「開始定位」那一下）。見 js/vision.js warmUpHands。
  onEnter: () => { renderAcuDetail(); warmUpHands(); },
  onLanguage: () => renderAcuDetail(),

  html: `
  <div id="page-acu-detail" class="page">
    <style>
      /* 參考圖 + 定位文字並排，像教科書的圖說 */
      .ref-row { display: flex; gap: 12px; align-items: flex-start; }
      .ref-frame {
        flex: none; width: 42%;
        background: #fff;            /* 圖是白底線稿，深色主題下要自己帶底 */
        border: 1px solid var(--line);
        border-radius: var(--r);
        padding: 4px;
      }
      .ref-frame img { width: 100%; height: auto; display: block; border-radius: 2px; }
      .ref-frame .cap {
        font-family: var(--font-mono); font-size: 9px; letter-spacing: .1em;
        color: #7a8580; text-align: center; padding: 3px 0 1px;
      }
      .ref-none {
        flex: none; width: 42%;
        border: 1px dashed var(--line); border-radius: var(--r);
        padding: 18px 8px; text-align: center;
        font-size: 11.5px; color: var(--ink-soft);
      }
      #tutorial-box { display: none; }
      #tutorial-box p {
        font-size: 13px; color: var(--ink-soft);
        margin-top: 7px; padding-left: 12px;
        border-left: 1px solid var(--line);
      }
    </style>

    <div class="stack">
      <div>
        <p class="eyebrow">
          <span data-i18n="eyebrow-detail">步驟三 · 定位說明</span> ·
          <span id="acu-progress" class="mono-sm"></span>
        </p>
        <h2 id="acu-name" class="acu-title"></h2>
      </div>
      <div id="acu-note"></div>
      <div class="ref-row">
        <div id="acu-ref"></div>
        <p class="small" id="acu-detail"></p>
      </div>
      <p class="notice" id="acu-side-hint"></p>
      <div class="btn-row">
        <button class="btn ghost" onclick="toggleTutorial()" data-i18n="btn-tutorial">看教學</button>
        <button class="btn" onclick="startLocate()" data-i18n="btn-locate">開始定位</button>
      </div>
      <div id="tutorial-box"></div>
    </div>
  </div>`,
});

// 從選穴頁進來：排序後從第一個穴道開始
function goToAcuDetail() {
  if (state.selectedAcupoints.length === 0) {
    alert(isZh() ? '請選擇至少一個穴道' : 'Please select at least one acupoint');
    return;
  }
  // 按 ACUPOINTS 的順序（遠端 → 近端）走，不是使用者點選的順序
  state.selectedAcupoints.sort((a, b) =>
    ACUPOINTS.findIndex(p => p.name === a) - ACUPOINTS.findIndex(p => p.name === b));
  state.currentAcupointIndex = 0;
  showPage('acu-detail');
}

function renderAcuDetail() {
  const name = curAcuName();
  if (!name) { goHome(); return; }
  const acu = ACUPOINTS.find(a => a.name === name);
  const detail = ACUPOINT_DETAIL[name] || {};

  document.getElementById('acu-name').textContent = acuLabel(name);
  document.getElementById('acu-progress').textContent =
    `${state.currentAcupointIndex + 1} / ${state.selectedAcupoints.length}`;

  // 安全警語（如合谷穴「懷孕忌按」）— 一定要顯示
  const noteBox = document.getElementById('acu-note');
  noteBox.innerHTML = '';
  if (detail.note) {
    const d = document.createElement('p');
    d.className = 'notice warn';
    d.textContent = detail.note;
    noteBox.appendChild(d);
  }

  const refBox = document.getElementById('acu-ref');
  refBox.replaceWith(acuRefBlock(name));
  document.querySelector('.ref-row > :first-child').id = 'acu-ref';

  document.getElementById('acu-detail').textContent =
    acu && acu.locate ? acu.locate : (isZh() ? '（尚無定位描述）' : '(no description yet)');

  const dorsal = acu && acu.side === 'dorsal';
  document.getElementById('acu-side-hint').textContent = BILATERAL_ACUPOINTS.has(name)
    ? (isZh() ? '此穴在手側緣，手背或手心朝鏡頭都可定位。' : 'Side-edge point: either hand side works.')
    : (isZh() ? `請將${dorsal ? '手背' : '手心'}朝向鏡頭。` : `Face your ${dorsal ? 'back of hand' : 'palm'} to the camera.`);

  document.getElementById('tutorial-box').style.display = 'none';
}

function toggleTutorial() {
  const box = document.getElementById('tutorial-box');
  if (box.style.display !== 'none') { box.style.display = 'none'; return; }

  const acu = ACUPOINTS.find(a => a.name === curAcuName());
  const dorsal = acu && acu.side === 'dorsal';
  const steps = isZh()
    ? ['把手舉到鏡頭前，保持手掌平整、不要傾斜。',
       `依提示讓${dorsal ? '手背' : '手心'}朝向鏡頭。`,
       '圓盤接近正圓代表這塊皮膚正對鏡頭、定位可信；被壓扁成細線代表角度太斜。',
       '用另一隻手的食指或拇指指尖對準圓盤中心，計時才會前進。']
    : ['Raise your hand to the camera and keep the palm flat.',
       `Face your ${dorsal ? 'back of hand' : 'palm'} to the camera.`,
       'A near-circular disc means the skin faces the camera and the position is reliable; a flattened disc means the angle is too steep.',
       'Aim your other hand\'s index or thumb tip at the disc centre to advance the timer.'];

  box.innerHTML = '';
  steps.forEach((s, i) => {
    const p = document.createElement('p');
    p.textContent = `${i + 1}. ${s}`;
    box.appendChild(p);
  });
  box.style.display = 'block';
}
