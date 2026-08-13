// ═══════════════════════════════════════════════════════════════════
// 相機與主偵測迴圈
//
// 定位頁（04）與按摩頁（05）共用同一個 MediaPipe 實例與同一個迴圈，
// 差別只在 renderMode：
//   'locate'  — 只畫穴位與信心圓盤
//   'massage' — 另外檢查「另一隻手」的指尖有沒有對準
//
// ⚠️ 這支不要改定位公式。公式在 js/acu-math.js（正式版的複本，改了要同步回去）。
// ═══════════════════════════════════════════════════════════════════

let hands = null, camera = null, video = null;
let camRunning = false, camStarting = false;
let facingMode = 'user';
let showDisc = true;
let activeCanvas = null;
let renderMode = 'locate';          // 'locate' | 'massage'
let onTarget = false;               // 指尖是否對準（按摩頁計時用）

// 單一共用實例：每次進頁重建會重載 wasm，又慢又漏
function getHands() {
  if (hands) return hands;
  hands = new Hands({
    locateFile: (f) => mpAsset('hands', f),      // 本機或 CDN，見 js/mp-loader.js
  });
  hands.onResults(onHandsResults);
  return hands;
}

// ⚡ 手數依頁面而定（2026-08-13 效能）：
//   定位頁只挑「一隻目標手」（見下面的 best 迴圈），第二隻手的 landmark 推論
//   算完就丟 —— 而 landmark 推論是每幀最貴的一筆，手數砍半＝推論量砍半。
//   按摩頁才真的需要兩隻（被按的手 + 按的手）。
//   ⚠️ 這是純效能改動：定位頁本來就只用 best 那一隻，輸出座標完全不變。
let handsNumConfigured = null;
function applyHandsOptions(h, mode) {
  const n = mode === 'massage' ? 2 : 1;
  if (handsNumConfigured === n) return;         // setOptions 會重配 graph，別每幀呼叫
  h.setOptions({
    maxNumHands: n,
    modelComplexity: 1,           // ⚠️ 不要為了流暢降成 0：lite 模型的 landmark 誤差
                                  //    會直接進到 v35 公式，而本專案的閾值是 2mm。
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.6,
  });
  handsNumConfigured = n;
}

// ⚡ 預熱（2026-08-13）：MediaPipe 首次使用要抓 ~16MB（wasm 6.1MB + packed assets 4.2MB
//    + hand_landmark_full.tflite 5.4MB），手機 4G 上要 10~30 秒。原本這件事發生在
//    使用者按下「開始定位」的那一刻 —— 體感就是「點下去卡死」。
//
//    改成在**認穴頁**（步驟三）就先在背景載好：使用者在那頁讀定位說明、看參考圖
//    通常要 5~15 秒，剛好把載入藏起來。等他按下一步時模型已經在記憶體裡。
//
//    ⚠️ 這不會開啟相機，也不會畫任何東西（onHandsResults 開頭就擋掉 camRunning=false）。
//    ⚠️ 純載入時機改動，跟定位公式與精度完全無關。
let handsWarmed = false;
function warmUpHands() {
  if (handsWarmed || typeof Hands === 'undefined') return;
  handsWarmed = true;
  // 用 idle 時段做，別跟頁面切換動畫搶主執行緒
  const go = () => {
    try {
      const h = getHands();
      if (typeof h.initialize === 'function') {
        h.initialize().catch(() => {});          // 失敗就算了，等使用者真的進定位頁再載一次
      }
    } catch (e) { /* 預熱失敗不能影響 UI */ }
  };
  if (typeof requestIdleCallback === 'function') requestIdleCallback(go, { timeout: 1500 });
  else setTimeout(go, 300);
}

async function startCamera(canvasId, mode) {
  renderMode = mode;
  activeCanvas = document.getElementById(canvasId);
  // 定位頁 → 按摩頁是「相機不停、只換模式」，會走下面的 early return，
  // 所以手數要在這裡先調整，不能等到 getHands() 之後
  if (hands) applyHandsOptions(hands, mode);
  if (camRunning || camStarting) return;   // 已在跑就只換畫布/模式
  camStarting = true;
  setGate('warn', isZh() ? '啟動相機中…' : 'Starting camera…');
  try {
    video = document.getElementById('hidden-video');
    const h = getHands();
    applyHandsOptions(h, mode);
    camera = new Camera(video, {
      onFrame: async () => {
        if (!camRunning) return;
        try { await h.send({ image: video }); } catch (e) { /* 關閉瞬間的競態 */ }
      },
      width: 640, height: 480, facingMode,
    });
    await camera.start();            // camera_utils 沒有 initialize()，只有 start()
    camRunning = true;
  } catch (err) {
    setGate('bad', (isZh() ? '相機啟動失敗：' : 'Camera failed: ') + (err && err.message ? err.message : err));
    console.error(err);
  } finally {
    camStarting = false;
  }
}

function stopCamera() {
  camRunning = false;
  onTarget = false;
  if (camera) { try { camera.stop(); } catch (e) {} camera = null; }
  if (video && video.srcObject) {
    video.srcObject.getTracks().forEach(tr => tr.stop());
    video.srcObject = null;
  }
  // 不呼叫 hands.close()：實例留著重用，下次進頁不必重載 wasm
}

async function switchCamera() {
  facingMode = facingMode === 'user' ? 'environment' : 'user';
  const canvasId = renderMode === 'massage' ? 'massage-canvas' : 'video-canvas';
  stopCamera();
  await startCamera(canvasId, renderMode);
}

// 讀數條：定位頁與按摩頁各有一條，依現在的模式挑
function setGate(kind, msg) {
  const el = document.getElementById(renderMode === 'massage' ? 'massage-gate' : 'camera-gate');
  if (!el) return;
  el.textContent = msg;
  el.className = 'readout gate-' + (kind === 'ok' ? 'ok' : kind === 'bad' ? 'bad' : 'warn');
}

// ═══════════════════════════════════════════════════════════════════
// 主偵測迴圈：每一幀都會跑
// ═══════════════════════════════════════════════════════════════════
function onHandsResults(results) {
  const canvas = activeCanvas;
  if (!canvas || !camRunning) return;

  // 畫布尺寸必須跟著影像走，否則 landmark(0~1) × W/H 全部算錯位置。
  //
  // ⚡ 2026-08-13 效能：640×480 是 getUserMedia 的 **ideal 不是 exact**，很多手機
  //    （尤其前鏡頭）會回 1280×720 甚至更高。那時每幀 clearRect + drawImage 的
  //    像素量是 3 倍以上，而 MediaPipe 內部無論餵多大都會縮到 ~224×224 去推論
  //    —— 多出來的解析度對定位精度毫無幫助，純浪費。所以這裡設一個上限。
  //
  // ⚠️ 只做**等比**縮小，長寬比一個像素都不能改：
  //    acu-math.js 的 _cv() 是 x,z 乘 W 而 y 乘 H（見該檔註釋③），
  //    等比縮放時三軸同倍數 → 法向量方向不變 → conf / angleDeg 完全相同；
  //    但長寬比一改（例如硬塞成 4:3）法向量就會歪，閘門判定跟著錯。
  //    （Math.round 帶來的比例誤差 < 0.1%，換算 angleDeg < 0.05°。）
  const CANVAS_MAX_EDGE = 640;
  const vw = video.videoWidth || 640, vh = video.videoHeight || 480;
  const s = Math.min(1, CANVAS_MAX_EDGE / Math.max(vw, vh));
  const cw = Math.round(vw * s), ch = Math.round(vh * s);
  if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
  const W = canvas.width, H = canvas.height;
  // alpha:false —— 這塊畫布每幀都被影像整片蓋滿，不需要跟底下的東西做透明合成
  const ctx = canvas.getContext('2d', { alpha: false });

  // 前鏡頭要鏡像，使用者才會覺得畫面裡的手跟自己的手同一邊（照鏡子）。
  // 後鏡頭是「看別人」，鏡像反而不對。
  // ⚠️ 只鏡射「畫面」，landmark 座標一律維持原樣 —— 正反面判定、傾角、
  //    公式都吃原始座標，動了它們等於改定位邏輯。
  const mirror = facingMode === 'user';
  const mx = (x) => mirror ? W - x : x;
  const flip = () => { if (mirror) { ctx.translate(W, 0); ctx.scale(-1, 1); } };

  ctx.clearRect(0, 0, W, H);
  ctx.save();
  flip();
  // ⚡ 2026-08-13 效能：這裡**刻意不用 results.image**。
  //    results.image 是 MediaPipe 內部那張 WebGL canvas，把它畫進 2D canvas 會強迫
  //    瀏覽器做一次 GPU→CPU 同步讀回（pipeline stall），行動 GPU 上特別貴。
  //    直接畫 <video> 的內容一模一樣，而且走的是硬體解碼器的快路徑。
  ctx.drawImage(video, 0, 0, W, H);
  ctx.restore();

  const allHands = results.multiHandLandmarks || [];
  const allSides = results.multiHandedness || [];
  if (allHands.length === 0) {
    setGate('warn', isZh() ? '請將手放入畫面中' : 'Put your hand in frame');
    onTarget = false;
    return;
  }

  const name = curAcuName();
  if (!name) return;
  const acu = ACUPOINTS.find(a => a.name === name);
  const needDorsal = acu && acu.side === 'dorsal';
  const bilateral = BILATERAL_ACUPOINTS.has(name);

  // ── 挑「目標手」：正反面通過優先，其次信心最高 ──
  let best = null;
  for (let i = 0; i < allHands.length; i++) {
    const lm = allHands[i], handedness = allSides[i];
    if (!lm || lm.length < 21 || !handedness) continue;
    const dorsal = isDorsalView(lm, handedness);
    const sideOk = bilateral || (needDorsal === dorsal);
    // computeAcuGate 內部就會呼叫 computeAcuConfidence，拿 gate 順便就有 info，不必算兩次
    const gate = computeAcuGate(name, lm, W, H);
    const info = gate ? gate.info : null;
    const conf = info ? info.conf : 0;
    const score = (sideOk ? 10 : 0) + conf;
    if (!best || score > best.score) best = { i, lm, handedness, dorsal, sideOk, info, gate, conf, score };
  }
  if (!best) {
    setGate('warn', isZh() ? '手部偵測不穩' : 'Unstable detection');
    onTarget = false;
    return;
  }

  // ── 閘門一：正反面 ──
  if (!best.sideOk) {
    setGate('bad', isZh()
      ? `偵測到${best.dorsal ? '手背' : '手心'}，${name}在${needDorsal ? '手背' : '手心'}，請翻面`
      : `Detected ${best.dorsal ? 'back of hand' : 'palm'}; this point is on the ${needDorsal ? 'back' : 'palm'}. Flip your hand.`);
    onTarget = false;
    return;
  }

  // ── 閘門二：傾角（嚴格模式擋下，非嚴格也要照實說）──
  // ⚠ 2026-08-12：這道全域門檻只管 palm 類穴道。side 類（二間/後溪/陽谷…）長在側緣，
  //   **手刀才是它們的最佳視角**，掌面偏離 ~90° 是正常的；擋下等於誤殺它們最準的那批幀。
  //   它們改由閘門三（自己的 ACU_ANGLE_LIMIT）管。
  const isSideAcu = best.gate && best.gate.kind === 'side';
  const tiltDeg = computeHandTiltDeg(best.lm);
  const tiltBad = tiltDeg > TILT_MAX_DEG && !isSideAcu;
  if (tiltBad && strictGate) {
    setGate('bad', isZh()
      ? `傾斜 ${Math.round(tiltDeg)}° > ${TILT_MAX_DEG}°　定位不可靠，請轉正`
      : `Tilt ${Math.round(tiltDeg)}° > ${TILT_MAX_DEG}° — unreliable. Straighten your hand.`);
    onTarget = false;
    return;
  }

  const pts = computeAcupoint(name, best.lm, W, H, best.handedness);
  if (!pts || !pts.length) {
    setGate('warn', isZh() ? '無法計算此穴位置' : 'Cannot compute this acupoint');
    onTarget = false;
    return;
  }

  const cunPx = computeCunPx(best.lm, W, H);
  const r = acupointRadius(cunPx);
  const discR = CONF_DISC_CUN * cunPx;

  // 圓盤的形狀是 3D 基底投影出來的多邊形，整組頂點都要跟著翻，
  // 所以走 transform 而不是只翻中心點
  if (showDisc && best.info) {
    ctx.save();
    flip();
    pts.forEach(p => drawConfidenceDisc(ctx, p.x, p.y, discR, best.info));
    ctx.restore();
  }
  // 穴位點是圓的，翻不翻都一樣；但它帶的穴名不能被鏡射成反字，
  // 所以這裡不用 transform，改成把 x 座標自己翻過去畫
  // 點色帶著逐穴道角度閘門的結果：綠=在上限內、橘=邊緣、紅=明顯超標。
  // 軟降級 —— 超標照樣畫點，只換色 + 降級提示，不像正反面閘門直接不畫。
  const dotColor = best.gate ? best.gate.color : '#00e5a0';
  pts.forEach((p, i) => {
    drawAcupoint(ctx, mx(p.x), p.y, pts.length > 1 ? `${acuLabel(name)}${i + 1}` : acuLabel(name), dotColor, r);
  });

  if (renderMode === 'locate') {
    const pct = Math.round((best.info ? best.info.conf : 0) * 100);
    const g = best.gate;
    if (g && g.level !== 'ok') {
      // ── 閘門三：這個穴道自己的角度上限（2026-08-12）──
      // 講的是「**這塊皮膚**偏離鏡頭幾度」，不是「手歪幾度」——對側緣穴這兩件事差約 90°。
      // 姿勢指引照 kind 給：side 類要手刀、palm 類要攤平。
      // ⚠ 刻意不講「往左轉/往右轉」：方向要靠 azimuthDeg，而它是四個角度裡最不可信的
      //   （acu-math.js computeAcuConfidence 註釋③：W≠H 時有非等向縮放偏差）。
      const poseZh = g.kind === 'side' ? '請把手轉成手刀（側緣朝鏡頭）' : '請把手掌攤平正對鏡頭';
      const poseEn = g.kind === 'side' ? 'Turn your hand edge-on to the camera.' : 'Lay your palm flat toward the camera.';
      const tailZh = g.level === 'bad' ? '　位置僅供參考' : '';
      const tailEn = g.level === 'bad' ? ' · indicative only' : '';
      setGate(g.level === 'bad' ? 'bad' : 'warn', isZh()
        ? `${acuLabel(name)}這塊皮膚偏離 ${Math.round(g.angleDeg)}°（上限 ${g.limitDeg}°）${tailZh}　${poseZh}`
        : `Surface tilted ${Math.round(g.angleDeg)}° (limit ${g.limitDeg}°)${tailEn} · ${poseEn}`);
      onTarget = true; // 軟降級：只降級提示，不中斷流程
      return;
    }
    if (tiltBad) {
      setGate('warn', isZh()
        ? `已放行　傾斜 ${Math.round(tiltDeg)}°　位置僅供參考`
        : `Shown anyway · tilt ${Math.round(tiltDeg)}° · indicative only`);
    } else {
      const lvl = best.info ? best.info.level : 'low';
      setGate(lvl === 'low' ? 'warn' : 'ok', isZh()
        ? `定位中　信心 ${pct}%　傾斜 ${Math.round(tiltDeg)}°`
        : `Locating · confidence ${pct}% · tilt ${Math.round(tiltDeg)}°`);
    }
    onTarget = true;
    return;
  }

  // ── 按摩模式：檢查「另一隻手」的指尖有沒有對準 ──
  const other = allHands.find((_, i) => i !== best.i);
  if (!other) {
    setGate('warn', isZh() ? '請把另一隻手也放進畫面' : 'Bring your other hand into frame');
    onTarget = false;
    return;
  }

  // 食指尖(8) 與 拇指尖(4)：取最靠近穴道的那個當「按壓點」
  const tips = [8, 4].map(i => ({ x: other[i].x * W, y: other[i].y * H }));
  let minD = Infinity, hitPt = null, hitTip = null;
  pts.forEach(p => tips.forEach(tp => {
    const d = Math.hypot(tp.x - p.x, tp.y - p.y);
    if (d < minD) { minD = d; hitPt = p; hitTip = tp; }
  }));

  const tol = Math.max(discR, 18);
  const touching = minD <= tol;
  onTarget = touching;

  // 指尖標記與導引線：距離已經在原始座標算完了，這裡只是把畫的位置翻過去
  if (hitTip) {
    ctx.save();
    if (!touching && hitPt) {
      ctx.beginPath();
      ctx.moveTo(mx(hitTip.x), hitTip.y);
      ctx.lineTo(mx(hitPt.x), hitPt.y);
      ctx.strokeStyle = 'rgba(224,112,92,.75)';
      ctx.setLineDash([4, 4]); ctx.lineWidth = 2; ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.beginPath();
    ctx.arc(mx(hitTip.x), hitTip.y, 8, 0, Math.PI * 2);
    ctx.fillStyle = touching ? 'rgba(79,191,139,.9)' : 'rgba(224,112,92,.8)';
    ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
  }

  if (!massageRunning) {
    setGate(touching ? 'ok' : 'warn', touching
      ? (isZh() ? '對準了　可按「開始按摩」' : 'On target · press Start')
      : (isZh() ? `再靠近 ${Math.round(minD - tol)} px` : `Move ${Math.round(minD - tol)} px closer`));
  } else {
    setGate(touching ? 'ok' : 'bad', touching
      ? (isZh() ? '按對了　計時進行中' : 'On target · timing')
      : (isZh() ? '指尖離開穴道　計時暫停' : 'Off target · timer paused'));
  }
}

// 離開分頁或切到背景就關相機，不要偷偷佔著鏡頭
window.addEventListener('pagehide', stopCamera);
document.addEventListener('visibilitychange', () => { if (document.hidden) stopCamera(); });
