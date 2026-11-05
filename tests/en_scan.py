"""English-mode scan: list every visible string that still contains Chinese (CJK) characters.
2026-11-06 user: "英文模式你自己檢查". Camera/models are stubbed (same as browser_ui.py).
Run: python tests/en_scan.py [--output PATH]
Output: en_scan.json + en_scan.txt (unique strings, which page they were seen on).
"""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from collections import defaultdict
import argparse
import json
import sys
import threading
from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = Path(__file__).resolve().parents[1]
ap = argparse.ArgumentParser()
ap.add_argument('--output', type=Path, default=ROOT / 'tests' / '_en_scan')
args = ap.parse_args()
args.output.mkdir(parents=True, exist_ok=True)


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
url = f'http://127.0.0.1:{server.server_port}/acunavi-ideal.html'

stub = '''window.Hands = class {setOptions(){} onResults(f){this.cb=f} initialize(){return Promise.resolve()} send(){return Promise.resolve()} close(){}}
window.FaceMesh = class {setOptions(){} onResults(f){this.cb=f} initialize(){return Promise.resolve()} send(){return Promise.resolve()} close(){}}
window.Camera = class {constructor(v,o){} start(){return Promise.resolve()} stop(){}}'''

# Visible text nodes (plus placeholder / aria-label / title / alt) that contain CJK.
GRAB = r'''() => {
  const cjk = /[㐀-鿿豈-﫿]/;
  const out = [];
  const vis = el => { if (!el) return false; const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false;
    return el.getClientRects().length > 0; };
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) {
    const t = n.textContent.trim();
    if (!t || !cjk.test(t)) continue;
    const el = n.parentElement;
    if (!el || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName)) continue;
    let ok = true, p = el;
    while (p && p !== document.body) { if (!vis(p)) { ok = false; break; } p = p.parentElement; }
    if (!ok) continue;
    out.push({t: t.slice(0, 160), where: (el.id || el.className || el.tagName).toString().slice(0, 60)});
  }
  for (const el of document.querySelectorAll('[placeholder],[aria-label],[title],img[alt]')) {
    for (const a of ['placeholder', 'aria-label', 'title', 'alt']) {
      const v = el.getAttribute(a);
      if (v && cjk.test(v) && vis(el)) out.push({t: v.slice(0, 160), where: '@' + a + ' ' + (el.id || el.className || el.tagName).toString().slice(0, 50)});
    }
  }
  return out;
}'''

found = defaultdict(set)      # text -> set(page labels)
where = {}
errors = []


def grab(page, label):
    page.wait_for_timeout(150)
    for x in page.evaluate(GRAB):
        found[x['t']].add(label)
        where.setdefault(x['t'], x['where'])


try:
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, reduced_motion='reduce')
        page = ctx.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.route('**/vendor/mediapipe/**', lambda r: r.fulfill(status=200, content_type='application/javascript', body=''))
        page.add_init_script(stub)
        page.goto(url, wait_until='networkidle')
        page.wait_for_selector('#symptom-grid button')
        page.evaluate("setLanguage('en')")
        page.wait_for_timeout(300)
        grab(page, 'home')

        # Recommend: every symptom, three part tabs, every ⓘ sheet
        n_sym = page.evaluate("document.querySelectorAll('#symptom-grid button').length")
        for i in range(0, n_sym, 3):
            sel = list(range(i, min(i + 3, n_sym)))
            page.evaluate('(s)=>{state.selectedSymptoms=s; goToRecommendation()}', sel)
            grab(page, f'recommend(symptoms {sel})')
            tabs = page.locator('.page.active [role=tab], .page.active .part-tabs button')
            for k in range(tabs.count()):
                try:
                    tabs.nth(k).click(timeout=1000)
                except Exception:
                    continue
                grab(page, f'recommend tab {k}')
                infos = page.locator('#recommend-list .info')
                for j in range(infos.count()):
                    try:
                        infos.nth(j).click(timeout=1000)
                        grab(page, f'recommend ⓘ tab{k} #{j}')
                        page.keyboard.press('Escape')
                    except Exception:
                        pass

        # Gallery + every acupoint info page
        page.evaluate("showPage('gallery')")
        grab(page, 'gallery')
        keys = page.evaluate('''() => [...document.querySelectorAll('#collection-grid .collection-item')]
            .map(e => e.dataset.acu || e.dataset.name || e.dataset.code || '')''')
        n_cells = len(keys)
        for j in range(n_cells):
            page.evaluate("showPage('gallery')")
            # DOM click：浮動分頁列會擋住下半部的格子，Playwright 的真點擊會等到逾時
            page.locator('#collection-grid .collection-item').nth(j).evaluate('(e)=>e.click()')
            grab(page, f'acu-info #{j}')

        # Flow pages
        page.evaluate("state.selectedAcupoints=['合谷穴']; state.selectedFace=[]; state.currentAcupointIndex=0; flow.readySec=120; showPage('acu-detail'); stopReadyCountdown()")
        grab(page, 'acu-detail')
        page.evaluate("showPage('camera')")
        grab(page, 'camera')
        page.evaluate("showPage('massage')")
        grab(page, 'massage')
        page.evaluate("onTarget=true; startMassage()")
        grab(page, 'massage running')
        page.evaluate("toggleMassagePause()")
        grab(page, 'massage paused')
        page.evaluate("goHome(); state.selectedAcupoints=['合谷穴','三間穴']; state.currentAcupointIndex=0; flow.autoAdvance=false; sessionLog=[{name:'合谷穴',ms:60000}]; completeMassage()")
        grab(page, 'complete')
        page.evaluate("goHome(); sessionLog=[{name:'合谷穴',ms:60000},{name:'EX-HN3',ms:30000}]; showPage('summary')")
        grab(page, 'summary')
        for route in ['settings', 'settings-lang', 'settings-display', 'settings-notify', 'settings-flow',
                      'settings-accuracy', 'settings-presets', 'face']:
            try:
                page.evaluate('(r)=>showPage(r)', route)
                grab(page, route)
            except Exception as e:
                errors.append(f'{route}: {e}')
        b.close()
finally:
    server.shutdown()

rows = sorted(found.items(), key=lambda kv: (-len(kv[1]), kv[0]))
with (args.output / 'en_scan.json').open('w', encoding='utf-8', newline='') as f:
    json.dump({'gallery_cells': n_cells, 'errors': errors,
               'strings': [{'text': t, 'element': where[t], 'pages': sorted(v)} for t, v in rows]},
              f, ensure_ascii=False, indent=1)
with (args.output / 'en_scan.txt').open('w', encoding='utf-8', newline='') as f:
    for t, v in rows:
        pages = sorted(v)
        f.write(f'[{len(pages)} 頁] {where[t]} | {t}\n      例：{"; ".join(pages[:3])}\n')
print('gallery cells', n_cells, '| unique CJK strings', len(rows), '| page errors', len(errors))
for e in errors[:5]:
    print('ERR', e)
