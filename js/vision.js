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
  hands.setOptions({
    maxNumHands: 2,                 // 按摩頁要同時看到「被按的手」和「按的手」
    modelComplexity: 1,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.6,
  });
  hands.onResults(onHandsResults);
  return hands;
}

async function startCamera(canvasId, mode) {
  renderMode = mode;
  activeCanvas = document.getElementById(canvasId);
  if (camRunning || camStarting) return;   // 已在跑就只換畫布/模式
  camStarting = true;
  setGate('warn', isZh() ? '啟動相機中…' : 'Starting camera…');
  try {
    video = document.getElementById('hidden-video');
    const h = getHands();
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

  // 畫布尺寸必須跟著影像走，否則 landmark(0~1) × W/H 全部算錯位置
  const vw = video.videoWidth || 640, vh = video.videoHeight || 480;
  if (canvas.width !== vw || canvas.height !== vh) { canvas.width = vw; canvas.height = vh; }
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext('2d');

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
  ctx.drawImage(results.image || video, 0, 0, W, H);
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
