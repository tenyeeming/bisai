"""Real browser layout/interaction checks. Camera/models are stubbed, not accuracy tests.
Run: python tests/browser_ui.py [--output PATH]
Requires the installed Python playwright package and a Chromium browser.
"""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
import argparse
import json
import threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path, default=ROOT.parent / '介面討論' / '網頁多端驗證_20260916')
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=True)

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
url = f'http://127.0.0.1:{server.server_port}/acunavi-ideal.html'
checks = []
errors = []

def check(value, name):
    checks.append({'name': name, 'passed': bool(value)})
    print(('PASS ' if value else 'FAIL ') + name, flush=True)

stub = '''window.Hands = class {setOptions(){} onResults(f){this.cb=f} initialize(){return Promise.resolve()} send(){return Promise.resolve()} close(){}}
window.FaceMesh = class {setOptions(){} onResults(f){this.cb=f} initialize(){return Promise.resolve()} send(){return Promise.resolve()} close(){}}
window.Camera = class {constructor(v,o){} start(){return Promise.resolve()} stop(){}}'''

def no_overflow(page, name):
    result = page.evaluate('''() => ({doc: document.documentElement.scrollWidth, width: innerWidth,
      clipped: [...document.querySelectorAll('.page.active button, .page.active h2, .page.active .acu-item')]
        .filter(e => e.getClientRects().length && e.scrollWidth > e.clientWidth + 2)
        .map(e => (e.id || e.className || e.tagName) + ':' + e.textContent.slice(0,60))})''')
    check(result['doc'] <= result['width'] + 1, name + ': no horizontal scroll')
    check(not result['clipped'], name + ': no clipped labels ' + ','.join(result['clipped']))

try:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        sizes = [('phone',390,844), ('small',320,568), ('tablet',820,1180), ('tablet-land',1180,820),
                 ('desktop',1440,900), ('landscape',844,390), ('large-text',390,844), ('zoom-layout',720,450)]
        for name, width, height in sizes:
            # tablet-land：iPad 橫放。has_touch 讓 (pointer: coarse) 成立，才分得出平板與桌機（2026-09-26）
            context = browser.new_context(viewport={'width':width,'height':height}, reduced_motion='reduce', has_touch=(name == 'tablet-land'))
            page = context.new_page()
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.route('**/vendor/mediapipe/**', lambda r: r.fulfill(status=200, content_type='application/javascript', body=''))
            page.add_init_script(stub)
            page.goto(url, wait_until='networkidle')
            page.wait_for_selector('#symptom-grid button')
            if name == 'large-text':
                page.evaluate("document.documentElement.style.fontSize='200%'")
            check(page.locator('#home-next').is_disabled(), name + ': empty selection disabled')
            # Read the cap instead of hard-coding it (2026-09-17: user changed 5 -> 3).
            max_sym = page.evaluate('MAX_SYMPTOMS')
            for i in range(max_sym):
                page.locator('#symptom-grid button').nth(i).click()
            # aria-disabled prevents Playwright click by design; DOM click exercises the limit handler.
            page.locator('#symptom-grid button').nth(max_sym).evaluate('(e)=>e.click()')
            check(page.evaluate('state.selectedSymptoms.length') == max_sym,
                  name + f': max {max_sym} symptoms')
            no_overflow(page, name + '/home')
            page.screenshot(path=str(args.output / f'{name}-home.png'), full_page=True)
            page.locator('#home-next').click()
            no_overflow(page, name + '/recommend')
            page.locator('#recommend-list .info').first.click()
            sheet = page.locator('#info-sheet .sheet')
            bounds = sheet.bounding_box()
            check(bounds['x'] >= -1 and bounds['x'] + bounds['width'] <= width + 1 and
                  bounds['y'] >= -1 and bounds['y'] + bounds['height'] <= height + 1,
                  name + ': detail panel fits viewport')
            page.keyboard.press('Tab')
            check(page.evaluate("document.getElementById('info-sheet').contains(document.activeElement)"), name + ': dialog traps focus')
            page.keyboard.press('Escape')
            check(page.locator('#info-sheet').is_hidden(), name + ': Escape closes detail')
            check(page.evaluate("document.activeElement.classList.contains('info')"), name + ': detail restores focus')
            page.screenshot(path=str(args.output / f'{name}-recommend.png'), full_page=True)
            # Gallery deserves its own shot: it now holds hand + face + forearm (64 cells),
            # each showing its reference drawing (2026-09-24: no more unlock / minion cards).
            # The overflow check alone never told us whether the grid *looks* right.
            page.evaluate("showPage('gallery')")
            no_overflow(page, name + '/gallery')
            check(page.locator('#collection-grid .collection-item').count() == 64, name + ': gallery lists 64 acupoints')
            check(page.locator('#collection-grid .locked').count() == 0, name + ': gallery has no locked cells')
            page.wait_for_timeout(300)
            broken = page.evaluate("[...document.querySelectorAll('#collection-grid img.thumb')].filter(i => i.complete && !i.naturalWidth).length")
            check(broken == 0, name + ': gallery reference thumbnails all load')
            page.screenshot(path=str(args.output / f'{name}-gallery.png'), full_page=True)
            page.evaluate("infoAcuName='ST1'; showPage('acu-info')")
            no_overflow(page, name + '/acu-info-face')
            page.screenshot(path=str(args.output / f'{name}-gallery-face.png'), full_page=True)
            page.evaluate("infoAcuName='內關穴'; renderAcuInfo()")
            no_overflow(page, name + '/acu-info-forearm')
            check(page.locator('#info-locate').inner_text().strip() != '', name + ': forearm detail has location')
            check(page.locator('#btn-practice').is_disabled(), name + ': forearm locating stays disabled')
            page.screenshot(path=str(args.output / f'{name}-gallery-forearm.png'), full_page=True)
            page.evaluate("showPage('recommend')")
            page.evaluate("state.selectedAcupoints=['合谷穴']; state.selectedFace=[]; state.currentAcupointIndex=0; flow.readySec=120; showPage('acu-detail'); stopReadyCountdown()")
            no_overflow(page, name + '/detail')
            page.evaluate("showPage('camera')")
            no_overflow(page, name + '/camera')
            page.evaluate("showPage('massage')")
            page.wait_for_timeout(100)
            check('失敗' not in page.locator('#massage-gate').inner_text(), name + ': camera stub starts successfully')
            no_overflow(page, name + '/massage')
            page.screenshot(path=str(args.output / f'{name}-massage.png'), full_page=True)
            page.evaluate("onTarget=true; startMassage()")
            check(not page.evaluate('massageFsOn'), name + ': start does not force fullscreen')
            page.wait_for_timeout(220)
            page.evaluate('toggleMassagePause()')
            remain = page.evaluate('massageRemainMs')
            page.wait_for_timeout(220)
            check(page.evaluate('massageRemainMs') == remain, name + ': pause preserves remaining time')
            page.evaluate('enterMassageFullscreen()')
            check(page.locator('#fs-pause').is_visible(), name + ': fullscreen pause accessible')
            no_overflow(page, name + '/fullscreen')
            page.keyboard.press('Escape')
            check(not page.evaluate('massageFsOn'), name + ': Escape shrinks camera')
            # 2026-09-24: completion page = the acupoint's own minion celebrating, no records written
            page.evaluate("goHome(); state.selectedAcupoints=['合谷穴','三間穴']; state.currentAcupointIndex=0; flow.autoAdvance=false; sessionLog=[{name:'合谷穴',ms:60000}]; completeMassage()")
            check(page.evaluate("document.querySelector('#page-complete.active #done-minion img')?.getAttribute('src')") == 'assets/minions/hegu.webp', name + ': complete page shows the acupoint minion')
            check(page.evaluate("['acuHistory','acuStreak','minions'].every(k => localStorage.getItem(k) === null)"), name + ': completing writes no records')
            no_overflow(page, name + '/complete')
            page.screenshot(path=str(args.output / f'{name}-complete.png'), full_page=True)
            page.evaluate("goHome(); sessionLog=[{name:'合谷穴',ms:60000},{name:'EX-HN3',ms:30000}]; showPage('summary')")
            check(page.locator('#summary-list .row').count() == 2, name + ': summary lists this session only')
            check(page.locator('#summary-stage img').count() == 2, name + ': one celebrant per acupoint on stage')
            check(page.locator('#summary-total').count() == 0, name + ': summary has no total time')
            page.evaluate("renderSummary(); setLanguage('en')")
            no_overflow(page, name + '/summary-en')
            page.screenshot(path=str(args.output / f'{name}-summary.png'), full_page=True)
            page.evaluate('goHome()')
            no_overflow(page, name + '/home-en')
            page.evaluate("state.selectedSymptoms=[0,4]; goToRecommendation()")
            no_overflow(page, name + '/recommend-en')
            for route in ['gallery','settings','settings-lang','settings-display','settings-notify','settings-flow','settings-presets','settings-accuracy']:
                page.evaluate('(route)=>showPage(route)', route)
                no_overflow(page, name + '/' + route + '-en')
            page.emulate_media(color_scheme='dark')
            page.evaluate('goHome()')
            page.screenshot(path=str(args.output / f'{name}-dark.png'), full_page=True)
            check(page.evaluate("getComputedStyle(document.querySelector('.tabbar')).backgroundColor") == 'rgb(27, 44, 60)', name + ': dark theme navigation')
            context.close()

        # Opening animation (2026-09-20). Every context above runs with
        # reduced_motion='reduce', so the splash never appears there -- which is
        # exactly the accessibility behaviour we want, but it also means nothing
        # above ever exercises the splash. This block is the only place it runs.
        for name, width, height, motion in [('phone', 390, 844, 'no-preference'),
                                            ('desktop', 1440, 900, 'no-preference'),
                                            ('phone-reduced', 390, 844, 'reduce')]:
            context = browser.new_context(viewport={'width': width, 'height': height},
                                          reduced_motion=motion)
            page = context.new_page()
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.route('**/vendor/mediapipe/**', lambda r: r.fulfill(status=200, content_type='application/javascript', body=''))
            page.add_init_script(stub)
            page.goto(url, wait_until='networkidle')
            shown = page.locator('#splash').count() > 0
            if motion == 'reduce':
                check(not shown, name + ': reduced motion skips the opening entirely')
            else:
                check(shown, name + ': opening layer is shown')
                page.wait_for_timeout(300)
                page.screenshot(path=str(args.output / f'{name}-splash.png'))
                # The hard rule: the opening must never block entry to the app.
                page.wait_for_selector('#splash', state='detached', timeout=6000)
                check(page.locator('#splash').count() == 0, name + ': opening clears itself')
                check(page.locator('#home-next').is_visible(), name + ': home is ready underneath')
                # And a tap must cut it short rather than waiting the full run.
                page.reload(wait_until='networkidle')
                page.locator('#splash').click()
                page.wait_for_selector('#splash', state='detached', timeout=2000)
                check(page.locator('#splash').count() == 0, name + ': tapping skips the opening')
            context.close()
        browser.close()
finally:
    server.shutdown()

check(not errors, 'no browser page errors: ' + '; '.join(sorted(set(errors))))
report = {'browser':'Playwright Chromium', 'camera':'stubbed; no real model or camera verification', 'checks':checks, 'errors':errors}
with (args.output / 'report.json').open('w',encoding='utf-8',newline='') as f:
    json.dump(report,f,ensure_ascii=False,indent=2)
raise SystemExit(1 if errors or any(not c['passed'] for c in checks) else 0)
