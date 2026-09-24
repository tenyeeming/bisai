"""小海：模擬「另一隻手按壓手肘」對邊緣的干擾，比「沒鎖定」與「鎖定後」（2026-09-24）。
影片裡沒有按壓畫面 → 在 Pose 人體遮罩上人工補一塊圓（圓心＝尺側邊緣外 0.5 寸、半徑 1 寸），
模擬按壓的手貼在肘尺側、把輪廓撐大。flReadMask 被包一層，其餘全是真的 MediaPipe。
  ① 鎖定後：按壓前 vs 按壓中，點移動多少
  ② 沒鎖定（清掉鎖定、讓它在按壓中重新量）：點移動多少 —— 這就是原本的問題
  ③ 肘尖錨定（即時頁預設）鎖定後：按壓前 vs 按壓中
Run: python tests/forearm_press_sim.py
"""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
import threading, shutil, tempfile, math
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
mj = root.parents[1] / '前臂' / '小海GT_20260924' / '假鏡頭' / 'fake_20-25s.mjpeg'
tmp = Path(tempfile.mkdtemp()) / 'fake.mjpeg'; shutil.copyfile(mj, tmp)
class Q(SimpleHTTPRequestHandler):
    def log_message(self, *x): pass
srv = ThreadingHTTPServer(('127.0.0.1', 0), partial(Q, directory=str(root)))
threading.Thread(target=srv.serve_forever, daemon=True).start()

PATCH = r"""
(() => {
  const orig = flReadMask;
  window.__press = false;
  flReadMask = function (m) {
    const d = orig(m);
    const g = window.__pressGeom;
    if (!d || !window.__press || !g) return d;
    const c = document.getElementById('fl-canvas'), W = c.width, H = c.height;
    const cx = g.x / W * FL_MASK_W, cy = g.y / H * FL_MASK_H, r = g.r / W * FL_MASK_W;
    for (let y = 0; y < FL_MASK_H; y++) for (let x = 0; x < FL_MASK_W; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) { const i = (y * FL_MASK_W + x) * 4; d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = 255; }
    }
    return d;
  };
})();
"""

def collect(pg, n):
    pts, last = [], None
    while len(pts) < n:
        pg.wait_for_timeout(300)
        g = pg.evaluate("window.flDebug")
        if g and g['frame'] != last:
            last = g['frame']; pts.append(g)
    return pts

def mean_pt(pts):
    pts = [q for q in pts if q]
    return (sum(p['point']['x'] for p in pts) / len(pts), sum(p['point']['y'] for p in pts) / len(pts))

def run(b, mode):
    pg = b.new_context(permissions=['camera']).new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(f'http://127.0.0.1:{srv.server_port}/forearm-lab.html', wait_until='load', timeout=90000)
    pg.evaluate(f"flSetHand('left'); flOffsetMode = '{mode}'")
    pg.evaluate(PATCH)
    pg.wait_for_function("flLastHandCache.left && flLastHandCache.left.dorsal", timeout=240000)
    pg.evaluate("flRememberPose()")
    lock = "flPoseRef.left && flPoseRef.left.edgeFrac" if mode == 'edge' else "flPoseRef.left && flPoseRef.left.tipFrac && flPoseRef.left.sideFrac"
    pg.wait_for_function(lock, timeout=180000)
    base = collect(pg, 8)
    base2 = collect(pg, 8)   # 雜訊底：同樣沒按壓、換一段時間（假鏡頭影片循環，手臂本身會動）
    g0 = base2[-1]; cun = g0['cun']
    # 按壓塊：尺側邊緣再往外 0.5 寸為圓心、半徑 1 寸（蓋住邊緣、把輪廓往外撐約 1.5 寸）
    ex = g0['edgePt'] or g0['point']
    geom = {'x': ex['x'] + g0['ulnar']['x'] * 0.5 * cun, 'y': ex['y'] + g0['ulnar']['y'] * 0.5 * cun, 'r': 1.0 * cun}
    pg.evaluate(f"window.__pressGeom = {geom}; window.__press = true")
    locked = collect(pg, 8)
    unlocked = None
    if mode == 'edge':
        # 沒鎖定：清掉鎖定，讓它在按壓中重新量（前 10 次用的是即時遮罩）
        pg.evaluate("flPoseRef.left.edgeFrac = null; flPoseRef.left.edgeSamples = []; flEdgeDistSm = {}")
        unlocked = collect(pg, 8)
    pg.context.close()
    return base, base2, locked, unlocked, cun, errs

with sync_playwright() as p:
    b = p.chromium.launch(channel='msedge', headless=True, args=[
        '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
        '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
        f'--use-file-for-fake-video-capture={tmp}'])
    base, base2, locked, unlocked, cun, errs = run(b, 'edge')
    tb, tb2, tl, _, tcun, terrs = run(b, 'tip')
    b.close()

def shift(a, c):
    (ax, ay), (cx, cy) = mean_pt(a), mean_pt(c)
    return math.hypot(cx - ax, cy - ay)
sL, sU = shift(base, locked), shift(base, unlocked)
print(f"1 寸 ≈ {cun:.1f}px（同身寸），mm 用 17.66mm/寸 換算")
print(f"① 鎖定後，按壓前→按壓中：點移動 {sL:.1f}px ≈ {sL / cun * 17.66:.1f}mm")
print(f"② 沒鎖定，按壓前→按壓中：點移動 {sU:.1f}px ≈ {sU / cun * 17.66:.1f}mm")
sT = shift(tb, tl)
print(f"③ 肘尖錨定鎖定後，按壓前→按壓中：點移動 {sT:.1f}px ≈ {sT / tcun * 17.66:.1f}mm")
print(f"page errors: {errs + terrs}")
nE, nT = shift(base, base2), shift(tb, tb2)
print(f"雜訊底（都沒按壓、換一段時間）：邊緣模式 {nE / cun * 17.66:.1f}mm、肘尖模式 {nT / tcun * 17.66:.1f}mm")
# 判準：鎖定後按壓造成的移動不超過「雜訊底 + 1.5mm」；沒鎖定要明顯大於鎖定
mm = lambda v, c: v / c * 17.66
ok = (mm(sL, cun) <= mm(nE, cun) + 1.5 and mm(sT, tcun) <= mm(nT, tcun) + 1.5
      and sU > sL * 2.5 and not (errs + terrs))
print("PASS" if ok else "FAIL", "鎖定後幾乎不動、沒鎖定明顯被推走")
