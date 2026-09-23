"""相機「啟動中被關」的競態回歸測試（2026-09-23 修「網頁相機容易打不開」）。
假相機模仿 camera_utils：stop() 只停已經拿到的串流；getUserMedia 延遲回來；
同時只准一條串流（模仿 Android），第二條直接 NotReadableError。
Run: python tests/camera_race.py [--root 網站資料夾]
"""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
import argparse, threading, sys
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
args = parser.parse_args()

class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=str(args.root)))
threading.Thread(target=server.serve_forever, daemon=True).start()
url = f'http://127.0.0.1:{server.server_port}/acunavi-ideal.html'

STUB = r"""
window.__live = 0; window.__gumDelay = 600; window.__gumFail = null;
class _M { constructor(){} setOptions(){} onResults(){} async send(){} async initialize(){} close(){} }
window.Hands = _M; window.FaceMesh = _M; window.Pose = _M;
const _gum = () => new Promise((res, rej) => setTimeout(() => {
  if (window.__gumFail) return rej(Object.assign(new Error('x'), { name: window.__gumFail }));
  if (window.__live >= 1) return rej(Object.assign(new Error('busy'), { name: 'NotReadableError' }));
  window.__live++;
  const t = { s: 0, stop() { if (!this.s) { this.s = 1; window.__live--; } } };
  res({ getTracks: () => [t] });
}, window.__gumDelay));
Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: _gum }, configurable: true });
window.Camera = class { constructor(v, o) { this.o = o; }
  async start() { const s = await navigator.mediaDevices.getUserMedia({}); this.g = s; }
  stop() { if (this.g) { this.g.getTracks().forEach(t => t.stop()); this.g = undefined; } } };
"""

results = []
def check(ok, name):
    results.append(ok); print(('PASS ' if ok else 'FAIL ') + name)

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    def fresh():
        ctx = b.new_context(); pg = ctx.new_page()
        pg.route('**/vendor/mediapipe/**', lambda r: r.fulfill(status=200, content_type='application/javascript', body=''))
        pg.route('**/cdn.jsdelivr.net/**', lambda r: r.fulfill(status=200, content_type='application/javascript', body=''))
        pg.add_init_script(STUB); pg.goto(url, wait_until='networkidle'); return pg
    st = "({live: window.__live, run: camRunning, face: faceCamRunning, gate: (document.getElementById('camera-gate')||{}).textContent || ''})"

    pg = fresh()   # ① 啟動中切背景（stopCamera），不能留殭屍串流
    pg.evaluate("startCamera('video-canvas','locate'); setTimeout(stopCamera, 200)")
    pg.wait_for_timeout(1200); s = pg.evaluate(st)
    check(s['live'] == 0 and not s['run'], f"① 啟動中被關 → 串流 0、未運行（{s}）")
    pg.evaluate("startCamera('video-canvas','locate')"); pg.wait_for_timeout(1000); s = pg.evaluate(st)
    check(s['live'] == 1 and s['run'], f"①' 再開一次能開（{s}）")

    pg = fresh()   # ② 啟動中關掉又馬上回來 → 最後應該在跑、只有一條
    pg.evaluate("startCamera('video-canvas','locate'); setTimeout(()=>{stopCamera(); startCamera('video-canvas','locate')}, 200)")
    pg.wait_for_timeout(1500); s = pg.evaluate(st)
    check(s['live'] == 1 and s['run'], f"② 關了又回來 → 1 條、運行中（{s}）")

    pg = fresh()   # ③ 手部啟動中直接切臉部 → 臉部要開得起來
    pg.evaluate("startCamera('video-canvas','locate'); setTimeout(()=>startFaceCamera('face-canvas'), 200)")
    pg.wait_for_timeout(2000); s = pg.evaluate(st)
    check(s['live'] == 1 and s['face'] and not s['run'], f"③ 手部啟動中切臉部 → 臉部運行、1 條（{s}）")

    pg = fresh()   # ④ 權限被拒 → 看得懂的中文提示
    pg.evaluate("window.__gumFail='NotAllowedError'; startCamera('video-canvas','locate')")
    pg.wait_for_timeout(1000); s = pg.evaluate(st)
    check('權限' in s['gate'] or 'permission' in s['gate'].lower(), f"④ 權限被拒提示（{s['gate']}）")

    # ⑤ 小海實驗頁：啟動中連切前後鏡頭 → 最後只剩 1 條、而且是最後選的那顆
    ctx = b.new_context(); pg = ctx.new_page()
    pg.route('**/cdn.jsdelivr.net/**', lambda r: r.fulfill(status=200, content_type='application/javascript', body=''))
    pg.add_init_script(STUB)
    pg.goto(url.replace('acunavi-ideal.html', 'forearm-lab.html'), wait_until='networkidle')
    pg.evaluate("flSwitchFacing('user'); setTimeout(()=>flSwitchFacing('environment'),100); setTimeout(()=>flSwitchFacing('user'),150)")
    pg.wait_for_timeout(3500)
    s = pg.evaluate("({live: window.__live, facing: flCamera && flCamera.o.facingMode, status: document.getElementById('fl-status').textContent})")
    check(s['live'] == 1 and s['facing'] == 'user' and '打不開' not in s['status'],
          f"⑤ 小海頁連切鏡頭 → 1 條、最後選的鏡頭、沒報打不開（{s}）")
    b.close()
server.shutdown()
print(f"{sum(results)}/{len(results)} PASS")
sys.exit(0 if all(results) else 1)
