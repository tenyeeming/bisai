# -*- coding: utf-8 -*-
"""網頁用圓體子集（2026-11-04，同 App 批 148 的 jf open 粉圓）。
介面文字加了新字就重跑一次，不然新字會退回系統字型：
    cd D:/穴道按摩/比賽專區/網頁v2
    python tools/字型子集.py . ../AcuNavi/app/src/main/res/font/jf_openhuninn.ttf assets/fonts/jf-openhuninn-subset.woff
跑完把 acunavi-ideal.html 的 tokens.css?v= 改一下。輸出 WOFF（zlib）；沒裝 brotli 所以不是 WOFF2。
"""
import os, sys
from fontTools import subset
from fontTools.ttLib import TTFont

web, src, out = sys.argv[1], sys.argv[2], sys.argv[3]
chars = set(chr(c) for c in range(0x20, 0x7F))
chars |= set("，。、；：？！「」『』（）《》〈〉…—～·・％＋－×÷→←↑↓▲▼●○◎✓✗ⓘ″′°　")
for root, dirs, files in os.walk(web):
    dirs[:] = [d for d in dirs if d not in ("node_modules", "vendor", ".git", "tests", "開發日誌")]
    for f in files:
        if f.endswith((".html", ".js", ".css", ".json")):
            chars |= set(open(os.path.join(root, f), encoding="utf-8", errors="ignore").read())
chars = {c for c in chars if c.isprintable() or c == "　"}
font = TTFont(src)
cmap = font.getBestCmap()
have = [c for c in chars if ord(c) in cmap]
missing = [c for c in chars if ord(c) not in cmap and ord(c) > 0x2E7F]
print("chars", len(chars), "in font", len(have), "CJK missing", "".join(sorted(missing))[:200])
opts = subset.Options()
opts.flavor = "woff"
opts.layout_features = ["*"]
opts.name_IDs = ["*"]
opts.notdef_outline = True
sub = subset.Subsetter(opts)
sub.populate(unicodes=[ord(c) for c in have])
sub.subset(font)
font.flavor = "woff"
font.save(out)
print("saved", out, os.path.getsize(out) // 1024, "KB")
