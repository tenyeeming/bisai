// ══ 進入點：選症狀（不列入步驟軌）═══════════════════════════════════════════════
// 這一頁的行為（上半）與長相（下半 html）都在這個檔案裡。
// 症狀清單來自 js/acu-data.js 的 SYMPTOM_MAP，要加症狀去那裡加。

registerPage('home', {
  tab: 'home',
  step: 0,          // 進入點不是步驟：人還沒開始做事，療程從選穴才算 01
  onEnter: () => initSymptomGrid(),
  onLanguage: () => initSymptomGrid(),

  html: `
  <div id="page-home" class="page">
    <style>
      /* 這一頁要填滿整個畫面：標題與按鈕高度固定，中間的症狀格吃掉剩下的高度，
         所以下面不會留一截空白（2026-09-02 用戶指出）。
         寬度沒動 —— 還是兩欄，只有每格往下長。 */
      /* min-height 不是 height：畫面高就撐滿（下面不留空），
         畫面矮就照內容長高、整頁捲動，按鈕不會被底部分頁列蓋掉。 */
      #page-home > .stack { min-height: 100%; gap: 6px; }
      /* ⭐ 2026-09-14 這一頁的 .stack 間距從共用的 14px 收到 6px（用戶：「下面很空」，
         指的是症狀格最後一列到「下一步」中間那段死白）。
         這裡的 gap 只剩下一個接縫在用 —— .home-top（標題＋症狀格）對 .home-foot（按鈕＋聲明）——
         所以收窄它不會影響頁內其他節奏，標題與格子之間仍是 .home-top 自己的 14px。 */
      .symptom-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 10px;
        flex: 1;            /* 吃掉標題與按鈕以外的全部高度 */
        /* 每一列等分剩餘高度；minmax 的地板是「再擠也不能比這矮」。
           ⭐ 2026-09-14 用戶：「症狀別擠在一起，往下拉」——
              地板 52 → 68，格距 8 → 10。
              再一次（「病症選擇哪裏全部拉高」）：地板 68 → 76。
              ⚠️ 一度拉到 96，但用戶補了「不一定要只能放四個格子的量，可以多點」——
                 96 在手機上一屏只剩四列，所以退回 76：格子有長高，可見列數還保得住。
              76×7 列 ＋ 6 個 10px 格距 = 592px，仍高於一般手機的可用高度 ——
              所以在手機上這個地板是真的會生效的（不是只有桌機看得到），
              撐不下就整頁往下捲。
           ⚠️ 這裡**故意不寫** min-height: 0（跟 shell.css 的 main 同一個道理）：
              寫了的話畫面矮時 grid 會被壓到比 76×7 還小，格子擠回去、
              還會溢出去蓋到下面的按鈕。不寫 = 撐不下就整頁往下長、可以捲。 */
        grid-auto-rows: minmax(76px, 1fr);
      }
      .symptom-btn {
        font-family: var(--font-sans);
        /* 2026-09-14 字級與內距一起放大（用戶：「看起來太空」）。
           空的原因不是格子太大，是格子被等分撐高之後、裡面還是 13px 的字 ——
           畫面越高每格越大，字沒跟著長，就整片都是留白。
           ⚠️ 只動字級與內距，格子的「等分撐滿」沒動（那是 2026-09-02 定的）。 */
        padding: 14px 15px;
        line-height: 1.35;
        background: var(--surface);
        color: var(--ink);
        border: 1px solid var(--line);
        border-radius: var(--r);
        cursor: pointer;
        font-size: 15px;
        text-align: left;
        transition: border-color .15s, background .15s;
        /* 格子長高之後，文字要自己垂直置中，否則會黏在頂端 */
        display: flex;
        align-items: center;
      }
      .symptom-btn:hover { border-color: var(--brass); }

      /* 「下一步」那一區：按鈕＋免責聲明，底下墊一張手掌。
         2026-09-14 從 App（HomeScreen.kt 的 HandMark）補過來 —— 那邊 09-13 就有了，
         網頁一直沒跟上，所以兩邊長得不一樣。數值照介面沙盒定案：
         透明度 0.13、往右溢出 22、下沉 6、傾斜 -8°（寬度另見下面那段，已放大到 500）。
         ⚠️ 刻意讓它切出機身邊緣（左右負邊距把版心撐回去）——
            完整的一隻手擺在角落像貼圖，切一半才像襯底。純裝飾 → aria-hidden。 */
      .home-foot {
        position: relative;
        display: flex;
        flex-direction: column;
        gap: 14px;
        margin-inline: -18px;    /* 抵銷 main 的左右內距，手才能溢到機身外 */
        padding-inline: 18px;
      }
      /* ⭐ 2026-09-14 用戶：「那個手的圖片不要怕被蓋掉，我故意的，直接蓋掉」。
         所以手放大到 500（沙盒面板上那一格寫的是「500＝滿出整個螢幕」），
         往上爬進症狀區的那一截，由 .home-top 的不透明底整片擋掉 ——
         看起來就是「手從下面長出來，到症狀區為止」。
         這是沙盒 data-cover="1" 的做法，不是意外。 */
      .home-foot .handmark {
        position: absolute;
        z-index: 0;
        pointer-events: none;
        right: -22px;
        bottom: -6px;
        width: 500px;
        height: auto;
        opacity: .13;
        transform: rotate(-8deg);
        transform-origin: bottom right;
      }
      .home-foot > .btn,
      .home-foot > .notice { position: relative; z-index: 1; }

      /* 症狀那一區：不透明底 ＋ 站在手的上層。
         手是從「下一步」那區長出來的，爬上來的部分到這裡就被整片擋掉。
         ⚠️ 只靠格子本身的白底不夠 —— 格與格之間的 10px 縫會漏出手掌，
            所以底要給整個區塊，不是給每一格。 */
      .home-top {
        position: relative;
        z-index: 2;
        flex: 1;
        /* 同上：不寫 min-height:0，症狀格撐不下時讓整頁長高，而不是把格子壓扁 */
        display: flex;
        flex-direction: column;
        gap: 14px;
        background: var(--surface);
      }
      .symptom-btn.selected {
        border-color: var(--brass);
        background: var(--surface-2);
        box-shadow: inset 2px 0 0 var(--brass);
        font-weight: 600;
      }
    </style>

    <div class="stack">
      <div class="home-top">
        <div>
          <p class="eyebrow" data-i18n="eyebrow-home">主訴</p>
          <h2 data-i18n="home-title">選擇你的症狀</h2>
          <p class="lede" data-i18n="home-desc">可複選多個症狀，系統會推薦相關穴道</p>
        </div>
        <div class="symptom-grid" id="symptom-grid"></div>
      </div>
      <div class="home-foot">
        <img class="handmark" src="assets/hand.png" alt="" aria-hidden="true">
        <button class="btn wide" onclick="goToRecommendation()" data-i18n="btn-next">下一步</button>
        <p class="notice" data-i18n="disclaimer">本系統為穴位定位輔助工具，內容依據傳統中醫文獻整理，不構成醫療診斷或治療建議。身體不適請就醫。</p>
      </div>
    </div>
  </div>`,
});

function initSymptomGrid() {
  const grid = document.getElementById('symptom-grid');
  grid.innerHTML = '';
  SYMPTOM_MAP.forEach((symptom, idx) => {
    const on = state.selectedSymptoms.includes(idx);
    const btn = document.createElement('button');
    btn.className = 'symptom-btn' + (on ? ' selected' : '');
    btn.type = 'button';
    btn.setAttribute('aria-pressed', String(on));
    btn.textContent = symptomLabel(symptom.name);
    btn.onclick = () => toggleSymptom(idx);
    grid.appendChild(btn);
  });
}

function toggleSymptom(idx) {
  state.selectedSymptoms = state.selectedSymptoms.includes(idx)
    ? state.selectedSymptoms.filter(i => i !== idx)
    : [...state.selectedSymptoms, idx];
  initSymptomGrid();
}
