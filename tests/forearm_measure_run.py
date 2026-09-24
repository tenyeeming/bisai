"""小海量測：自動跑一支影片（2026-09-24）。
用 forearm-measure.html 同一套程式（flMeasure），逐幀追蹤畫點當 GT，輸出 JSON 與檢查用縮圖。
Run: python tests/forearm_measure_run.py --video 影片 --seed x,y [--seed-t 0.05] [--fps 10] [--side auto] [--tol 70] --out 輸出資料夾
  --seed 是影片原始解析度下、第一幀畫點的像素座標。
⚠️ Playwright 內建 Chromium 沒有 H.264 解碼 → 用本機 Chrome / Edge（channel）。
"""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
import argparse, threading, json, base64, shutil, tempfile
from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser()
ap.add_argument('--video', type=Path, required=True)
ap.add_argument('--seed', default=None, help='x,y（新追蹤時必填）')
ap.add_argument('--replay', type=Path, default=None, help='照這份 JSON 的時間與 GT 回放（不追蹤）')
ap.add_argument('--fps', type=float, default=10)
ap.add_argument('--side', default='auto')
ap.add_argument('--tol', type=float, default=70)
ap.add_argument("--max-t", type=float, default=0)
ap.add_argument('--snap-every', type=int, default=20)
ap.add_argument('--out', type=Path, required=True)
ap.add_argument('--channel', default='msedge')
ap.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
a = ap.parse_args()
a.out.mkdir(parents=True, exist_ok=True)

# 影片檔名可能含中文，先拷一份 ASCII 名字的到暫存，檔案輸入框就不會踩中文路徑
tmp = Path(tempfile.mkdtemp()) / ('video' + a.video.suffix)
shutil.copyfile(a.video, tmp)

class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *x): pass
srv = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=str(a.root)))
threading.Thread(target=srv.serve_forever, daemon=True).start()
url = f'http://127.0.0.1:{srv.server_port}/forearm-measure.html'
if not a.replay and not a.seed: raise SystemExit('要給 --seed 或 --replay')

with sync_playwright() as p:
    b = p.chromium.launch(channel=a.channel, headless=True, args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    pg = b.new_page(viewport={'width': 1400, 'height': 900})
    logs = []
    pg.on('console', lambda m: logs.append(m.text))
    pg.on('pageerror', lambda e: logs.append('PAGEERROR ' + str(e)))
    pg.goto(url, wait_until='networkidle')
    pg.evaluate(f"FM.side = {json.dumps(a.side)}; FM.tol = {a.tol}; FM.snapEvery = {a.snap_every}; FM.maxT = {a.max_t or 0}; FM.keepCrops = true")
    pg.set_input_files('#fm-videofile', str(tmp))
    pg.wait_for_function("FM.cur && FM.mode === 'video'", timeout=60000)
    if a.replay:
        old = json.loads(a.replay.read_text(encoding='utf-8'))['records']
        pg.evaluate("(recs) => { fmReplay(recs); }", old)
    else:
        sx, sy = [float(v) for v in a.seed.split(',')]
        # seed 座標換成工作畫布座標（長邊可能被縮到 1920）
        pg.evaluate(f"(() => {{ const k = fmWork.width / fmVideo.videoWidth; fmSeedAt({sx} * k, {sy} * k); }})()")
        pg.evaluate(f"() => {{ fmRunVideo({a.fps}); }}")
    pg.wait_for_function("!FM.running && FM.records.length > 0", timeout=60 * 60 * 1000, polling=2000)
    data = pg.evaluate("""(() => ({ tool: 'forearm-measure', version: '2026-09-24', acupoint: 'SI8 小海', CUN_MM,
        params: { FL_ULNAR_OFFSET_CUN, FL_FOREARM_CUN, FL_EDGE_MAX_CUN, FL_MASK_TH, FL_VETO_COS, FL_HAND_MATCH_RATIO,
                  FL_FALLBACK_MIN_VISIBILITY, tol: FM.tol, sideMode: FM.side },
        seed: FM.seed, videoW: fmVideo.videoWidth, videoH: fmVideo.videoHeight, workW: fmWork.width, workH: fmWork.height,
        summary: fmSummary(), records: FM.records }))()""")
    data['source_video'] = str(a.video)
    (a.out / 'result.json').write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding='utf-8')
    for i, s in enumerate(pg.evaluate("FM.snaps || []")):
        (a.out / f"snap_{i:03d}_t{s['t']:.2f}.jpg").write_bytes(base64.b64decode(s['url'].split(',')[1]))
    # 追蹤檢查總覽：每筆一格（原始幀裁切），中心＝GT；紅十字畫在格子外框的中線上，不蓋住點
    crops = pg.evaluate("FM.crops || []")
    if crops:
        import numpy as np, cv2
        tiles = []
        for c in crops:
            im = cv2.imdecode(np.frombuffer(base64.b64decode(c['url'].split(',')[1]), np.uint8), 1)
            im = cv2.resize(im, (140, 140), interpolation=cv2.INTER_NEAREST)
            for (x1, y1, x2, y2) in [(62, 70, 52, 70), (78, 70, 88, 70), (70, 62, 70, 52), (70, 78, 70, 88)]:
                cv2.line(im, (x1, y1), (x2, y2), (0, 0, 255), 1)   # 中心留空的十字
            rec = next((r for r in data['records'] if r['t'] == c['t']), None)
            cv2.putText(im, f"{c['t']:.2f}" + ('' if rec and rec['gt'] else ' LOST'), (3, 13), 0, .42, (255, 255, 255), 1)
            tiles.append(im)
        cols, per = 10, 60
        for s in range(0, len(tiles), per):
            ch = tiles[s:s + per]
            while len(ch) % cols: ch.append(np.zeros_like(tiles[0]))
            sheet = np.vstack([np.hstack(ch[i:i + cols]) for i in range(0, len(ch), cols)])
            cv2.imencode('.jpg', sheet)[1].tofile(str(a.out / f'追蹤檢查_{s // per:02d}.jpg'))
    pg.screenshot(path=str(a.out / 'page.png'), full_page=True)
    (a.out / 'console.log').write_text('\n'.join(logs), encoding='utf-8')
    b.close()
print(json.dumps(data['summary'], ensure_ascii=False, indent=1))
print('records', len(data['records']), '→', a.out)
