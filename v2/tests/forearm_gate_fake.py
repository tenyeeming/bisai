"""小海即時頁：用假鏡頭（MJPEG）跑真的 MediaPipe，看姿勢閘門有沒有照設計動（2026-09-24）。
假鏡頭＝用戶 09-24 逐幀 GT 影片的扭腕段（手背朝鏡頭），`前臂/小海GT_20260924/假鏡頭/fake_20-25s.mjpeg`。
流程：開頁 → 等出現「先…記住姿勢」→ 按記住姿勢 → 看有沒有出點、面板兩種尺的 % 有沒有出來 → 換尺再看。
Run: python tests/forearm_gate_fake.py [--mjpeg 路徑]
"""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
import argparse, threading, shutil, tempfile, re
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
ap = argparse.ArgumentParser()
ap.add_argument('--mjpeg', type=Path, default=root.parents[1] / '前臂' / '小海GT_20260924' / '假鏡頭' / 'fake_20-25s.mjpeg')
a = ap.parse_args()
tmp = Path(tempfile.mkdtemp()) / 'fake.mjpeg'   # Chrome 旗標吃不了中文路徑
shutil.copyfile(a.mjpeg, tmp)

class Q(SimpleHTTPRequestHandler):
    def log_message(self, *x): pass
srv = ThreadingHTTPServer(('127.0.0.1', 0), partial(Q, directory=str(root)))
threading.Thread(target=srv.serve_forever, daemon=True).start()

res = []
def check(ok, name): res.append(ok); print(('PASS ' if ok else 'FAIL ') + name)

with sync_playwright() as p:
    b = p.chromium.launch(channel='msedge', headless=True, args=[
        '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
        '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
        f'--use-file-for-fake-video-capture={tmp}'])
    ctx = b.new_context(permissions=['camera'])
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(f'http://127.0.0.1:{srv.server_port}/forearm-lab.html', wait_until='load', timeout=90000)
    pg.evaluate("flSetHand('left')")
    st = lambda: pg.inner_text('#fl-status')
    mt = lambda: pg.inner_text('#fl-metrics')
    # 等手背判定穩定、要求先記姿勢
    pg.wait_for_function("document.getElementById('fl-status').textContent.includes('記住姿勢') || document.getElementById('fl-status').textContent.includes('顯示中')", timeout=180000)
    check('記住姿勢' in st(), f"沒記姿勢 → 不出點、提示先記住（{st()}）")
    pg.wait_for_function("flLastHandCache.left && flLastHandCache.left.dorsal", timeout=120000)
    pg.evaluate("flRememberPose()")
    ok = True
    try: pg.wait_for_function("document.getElementById('fl-status').textContent.includes('顯示中')", timeout=90000)
    except Exception: ok = False
    check(ok, f"記住姿勢後 → 出點（{st()}）")
    ef = pg.evaluate("flPoseRef.left && [flPoseRef.left.tipFrac, flPoseRef.left.sideFrac]")
    check(bool(ef and ef[0] and ef[1]), f"記住姿勢後肘尖與寬度已鎖定（肘→尖、肘→邊 ÷ 前臂長 = {ef}）")
    m = mt()
    check('已鎖定' in m, "面板顯示邊緣已鎖定")
    check('上臂尺' in m and '同身寸尺' in m and '肩膀可見度' in m, "面板同時顯示兩種尺與肩膀可見度")
    print('   面板：', re.sub(r'\s+', ' ', m)[:400])
    # 收集 40 次讀數，看兩種尺的 % 範圍
    vals = {'upper': [], 'hand': []}
    for _ in range(40):
        pg.wait_for_timeout(250)
        r = pg.evaluate("(() => { const n = flPoseNow.left, f = flPoseRef.left; return n && f ? {u: n.ratioUpper / f.ratioUpper, h: n.ratio / f.ratio} : null })()")
        if r: vals['upper'].append(r['u']); vals['hand'].append(r['h'])
    for k in vals:
        v = vals[k]
        if v: print(f"   {k}: n={len(v)} 最小 {min(v)*100:.0f}% 最大 {max(v)*100:.0f}%")
    pg.evaluate("flLenMode = 'hand'"); pg.wait_for_timeout(2000)
    check('同身寸尺' in mt(), "切到同身寸後面板仍正常")
    check(not errs, f"沒有 page error {errs}")
    pg.screenshot(path=str(Path(tempfile.gettempdir()) / 'forearm_gate_fake.png'))
    print('   截圖', Path(tempfile.gettempdir()) / 'forearm_gate_fake.png')
    b.close()
print(f"\n{sum(res)}/{len(res)} PASS")
