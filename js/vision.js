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
  // ⭐ 臉部按摩模式（2026-09-04）：這一幀的手只是拿來判「有沒有真的貼到臉」，
  //    畫面完全由 js/face-vision.js 負責（那邊才有臉的 landmark）。
  //    所以這裡只交出 landmark 就走人 —— 兩個模型同時跑，但只有一個在畫。
  //    ⚠️ 擋在最前面：這時候 camRunning 是 false（相機由 face-vision 開的），
  //       走下去只會被下一行的 early return 吃掉，手就永遠傳不過去。
  if (typeof faceMode !== 'undefined' && faceMode === 'massage' && faceCamRunning) {
    const hs = results.multiHandLandmarks || [];
    faceHandLm = hs.length ? hs[0] : null;
    return;
  }

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
  //   ⭐ 2026-08-18：tip 類（指端穴，目前只有中衝）也一併放行，理由與 side 完全相同 ——
  //   **指尖對著鏡頭才是它的最佳視角**，而那個姿勢下手掌必然遠超 25°。
  //   實測（真實 landmark 繞 x 軸旋轉模擬）：中指從朝上轉到朝鏡頭時，中衝的圓盤
  //   本來就會從 59×9px 的線張開成 59×57px 的正圓 —— 但手掌傾角同時從 11° 升到 79°，
  //   從 45° 起就被這道閘門整頁擋掉，使用者根本看不到圓盤張開的過程，
  //   只會覺得「指尖明明對著鏡頭了，圓盤卻沒有變成正對」。
  const gateKind = best.gate ? best.gate.kind : 'palm';
  const skipPalmTilt = gateKind === 'side' || gateKind === 'tip';
  const tiltDeg = computeHandTiltDeg(best.lm);
  const tiltBad = tiltDeg > TILT_MAX_DEG && !skipPalmTilt;
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
  // 所以走 transform 而不是只翻中心點。
  //
  // ⭐ 2026-08-18：閘門擋下時**圓盤照畫、只有穴道點不畫**（用戶要求）。
  //    圓盤是「該往哪轉」的唯一視覺線索 —— 它貼在皮膚上，手一轉就被壓扁，
  //    扁成一條線＝正在切著看，轉回來就變回正圓。連它一起藏掉，使用者只剩一行字，
  //    根本不知道自己離「轉對」還有多遠。擋下時改用降級樣式（虛線、幾乎不填色），
  //    語意是「這塊皮膚朝哪」而不是「穴道就在這裡」。
  const gateBlocked = !!(best.gate && best.gate.blocked);

  // ⭐ tip 類把圓盤沿骨軸往指尖外推（見 TIP_DISC_OFFSET_CUN）。
  //    法向量的 (x, y) 分量本來就是「骨軸投影在畫面上」的方向與長度（_cv 已經把
  //    x 乘 W、y 乘 H，都是像素），所以直接乘上去就是正確的正投影位移 ——
  //    指尖轉向鏡頭時投影自然縮到 0，不需要任何額外判斷。
  //    ⚠️ **只移動圓盤，穴道點仍然畫在 lm[12]**：那是 WHO 定義的位置，不能為了好看而挪。
  let discDX = 0, discDY = 0;
  if (best.info && best.info.kind === 'tip') {
    const off = TIP_DISC_OFFSET_CUN * cunPx;
    discDX = off * best.info.normal.x;
    discDY = off * best.info.normal.y;
  }

  // ⭐ 圓盤中心那顆白點就是穴道座標，所以**圓盤畫在點上、不再另外畫大光暈點**。
  //    tip 類的外推只推圓盤外框、不推白點 —— 白點必須留在 lm[12]。
  if (showDisc && best.info) {
    ctx.save();
    flip();
    pts.forEach(p => {
      drawConfidenceDisc(ctx, p.x + discDX, p.y + discDY, discR, best.info,
        { degraded: gateBlocked, centerAt: { x: p.x, y: p.y } });
    });
    ctx.restore();
  }
  // 標籤不能被鏡射成反字，所以這裡不用 transform，改成把 x 座標自己翻過去畫。
  //
  // ⭐ 2026-08-18【規格改寫】用戶原話：**「反正就要做到在某些角度上也可以看出
  //    正確位置在哪裏」**。舊寫法在 `gateBlocked` 時**整個點都不畫**，直接違反這條 ——
  //    使用者在斜角時看到的是「位置消失了」，而他要的正是那時候還看得見位置。
  //
  //    改成照 `網頁版3d` 的分工：
  //      **圓盤中心的白點** → 位置（永遠都在，不管扁成什麼樣、有沒有降級）
  //      **圓盤的形狀與顏色** → 可不可信（扁掉＝正在切著看、灰虛線＝這一幀別當真）
  //    位置與可信度分開表達，斜角時就不會因為可信度低而連位置一起丟掉。
  const dotColor = best.gate ? best.gate.color : '#00e5a0';
  const showingDisc = showDisc && best.info;
  pts.forEach((p, i) => {
    const label = pts.length > 1 ? `${acuLabel(name)}${i + 1}` : acuLabel(name);
    if (showingDisc) {
      // 圓盤已經把白點畫在正確位置上了，這裡只補標籤 ——
      // 而且要畫在**圓盤外面**，不然會壓在色塊上看不清（3d 版 drawLabel 的做法）。
      drawAcuLabel(ctx, mx(p.x), p.y, label, discR);
    } else {
      // 圓盤關掉時退回舊的點畫法，否則什麼都看不到。
      drawAcupoint(ctx, mx(p.x), p.y, label, dotColor, r);
    }
  });

  if (renderMode === 'locate') {
    const pct = Math.round((best.info ? best.info.conf : 0) * 100);
    const g = best.gate;
    if (g && (g.level !== 'ok' || g.blocked)) {
      // ── 閘門三：這個穴道自己的角度（2026-08-12 建立，08-18 改成兩層）──
      // 講的是「**這塊皮膚**偏離鏡頭幾度」，不是「手歪幾度」——對側緣穴這兩件事差約 90°。
      // 姿勢指引照 kind 給：side 類要手刀、palm 類要攤平。
      // ⚠ 刻意不講「往左轉/往右轉」：方向要靠 azimuthDeg，而它是四個角度裡最不可信的
      //   （acu-math.js computeAcuConfidence 註釋③：W≠H 時有非等向縮放偏差）。
      const poseZh = g.kind === 'side' ? '請把手轉成手刀（側緣朝鏡頭）' : '請把手掌攤平正對鏡頭';
      const poseEn = g.kind === 'side' ? 'Turn your hand edge-on to the camera.' : 'Lay your palm flat toward the camera.';
      if (g.blocked) {
        // 圓盤已經扁到看不出形狀 → 這時才擋。措辭要說明「為什麼看不到點」，
        // 不能說「位置僅供參考」（根本沒畫點）。圓盤還是會畫（降級樣式），
        // 使用者靠那條線的方向知道要往哪轉回來。
        setGate('bad', isZh()
          ? `${acuLabel(name)}這塊皮膚幾乎是側著看的（偏離 ${Math.round(g.angleDeg)}°）　暫不顯示　${poseZh}`
          : `${acuLabel(name)} is almost edge-on (${Math.round(g.angleDeg)}° off) · hidden for now · ${poseEn}`);
      } else {
        // 圓盤還看得到 → 不擋，點照畫，只是提醒可能偏了。
        // 使用者看得出圓盤被壓扁多少，自己就能轉回來。
        const tailZh = g.level === 'bad' ? '　位置僅供參考' : '';
        const tailEn = g.level === 'bad' ? ' · indicative only' : '';
        setGate(g.level === 'bad' ? 'bad' : 'warn', isZh()
          ? `${acuLabel(name)}這塊皮膚偏離 ${Math.round(g.angleDeg)}°（上限 ${g.limitDeg}°）${tailZh}　${poseZh}`
          : `Surface tilted ${Math.round(g.angleDeg)}° (limit ${g.limitDeg}°)${tailEn} · ${poseEn}`);
      }
      // 擋下時沒有畫點，就不可能「對準」——按摩計時那頁靠這個旗標決定要不要扣秒。
      onTarget = !g.blocked;
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

  // 指尖標記與引導箭頭：距離已經在原始座標算完了，這裡只是把畫的位置翻過去
  if (hitTip) {
    ctx.save();
    if (!touching && hitPt) {
      // 2026-09-12：虛線改成箭頭。虛線只連出兩點之間，往哪移要自己判斷；
      // 箭頭把方向直接講出來。尖端留白避免蓋住信心圓盤。
      drawGuideArrow(ctx, mx(hitTip.x), hitTip.y, mx(hitPt.x), hitPt.y,
                     { gap: Math.max(16, discR * 0.9) });
    }
    ctx.beginPath();
    ctx.arc(mx(hitTip.x), hitTip.y, 8, 0, Math.PI * 2);
    ctx.fillStyle = touching ? 'rgba(79,191,139,.9)' : 'rgba(224,112,92,.8)';
    ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
  }

  if (!massageRunning) {
    // 2026-09-12：原本是「再靠近 N px」。px 對使用者沒有意義，而且手離鏡頭
    // 遠近不同時同一個 px 代表的實際距離差很多 —— 距離資訊改由箭頭長度承載，
    // 文案只講要做什麼。措辭與臉部（face-vision.js）統一。
    setGate(touching ? 'ok' : 'warn', touching
      ? (isZh() ? '對準了　可按「開始按摩」' : 'On target · press Start')
      : (isZh() ? '指尖沿箭頭移到穴道上' : 'Follow the arrow to the point'));
  } else {
    setGate(touching ? 'ok' : 'bad', touching
      ? (isZh() ? '按對了　計時進行中' : 'On target · timing')
      : (isZh() ? '指尖離開穴道　計時暫停' : 'Off target · timer paused'));
  }
}

// 離開分頁或切到背景就關相機，不要偷偷佔著鏡頭
window.addEventListener('pagehide', stopCamera);
document.addEventListener('visibilitychange', () => { if (document.hidden) stopCamera(); });
