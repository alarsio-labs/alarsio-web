# -*- coding: utf-8 -*-
"""Renders a content module to a PDF in docs/ (A4 landscape).

    python tools/docs/design_pdf.py                   -> the technical design document
    python tools/docs/design_pdf.py roadmap_content   -> the product feature roadmap

design_docx.py renders the same content module to DOCX, so a document's two
formats never drift.
"""
import io
import os
import re
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib   # noqa: E402

# Which document to build. Defaults to the technical design document;
# pass another content module to build a different one.
C = importlib.import_module(sys.argv[1] if len(sys.argv) > 1 else "design_content")
from paths import DOCS, BUILD, chrome, PDF_FLAGS, url   # noqa: E402

OUT = os.path.join(DOCS, C.OUT_STEM + ".pdf")


def t(s):
    """Inline markup -> HTML. Escapes first, so content carries a plain '&'."""
    s = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
    s = re.sub(r"~([^~]+)~", r"<i>\1</i>", s)
    return s


def table(cols, rows, widths, size):
    h = '<table class="t%s"><thead><tr>%s</tr></thead><tbody>' % (
        size, "".join('<th style="width:%s">%s</th>' % (w, t(c)) for c, w in zip(cols, widths)))
    for r in rows:
        h += "<tr>%s</tr>" % "".join("<td>%s</td>" % t(c) for c in r)
    return h + "</tbody></table>"


def block(b, sole=False):
    kind = b[0]
    if kind == "diagram":
        # A diagram alone on a page is fitted to the page, so its stated width
        # applies only where it shares the page with something else.
        w = "" if sole or len(b) < 4 else ' style="width:%g%%"' % (b[3] * 100)
        return '<div class="dia"><svg-wrap%s>%s</svg-wrap></div>' % (w, b[1])
    if kind == "table":
        return table(b[1], b[2], b[3], b[4])
    if kind == "rulebar":
        return ('<div class="rulebar c%d">%s</div>' % (
            b[2], "".join("<div><b>%s</b> %s</div>" % (t(a), t(c)) for a, c in b[1])))
    if kind == "note":
        return '<div class="notebar">%s</div>' % t(b[1])
    if kind == "h3":
        return "<h3>%s</h3>" % t(b[1])
    if kind == "rules":
        return '<ol class="rules">%s</ol>' % "".join("<li>%s</li>" % t(r) for r in b[1])
    if kind == "phases":
        return '<div class="phases">%s</div>' % "".join(
            '<div><b>%s</b><span>%s</span><em>%s</em></div>' % (t(n), t(ti), t(m))
            for n, ti, m in b[1])
    if kind == "twocol":
        return '<div class="two-col"><div>%s</div><div>%s</div></div>' % (
            "".join(block(x) for x in b[1]), "".join(block(x) for x in b[2]))
    raise ValueError(kind)


P = []

# ── cover ────────────────────────────────────────────────────────────────────
cv = C.COVER
P.append(
    '<section class="pg cover"><div>'
    '<div class="ceyebrow">%s</div>'
    '<h1>%s<em>%s</em></h1><div class="crule"></div>'
    '<p class="clede">%s</p>'
    '<div class="cstats">%s</div></div>'
    '<div class="ctoc"><div class="ctoc-h">Contents</div><ol>%s</ol></div></section>'
    % (t(cv["eyebrow"]), t(cv["title"]), t(cv["title_em"]), t(cv["lede"]),
       "".join('<div><b>%s</b><span>%s<br>%s</span></div>' % (t(a), t(b2), t(c))
               for a, b2, c in cv["stats"]),
       "".join('<li><span>%s</span><b>%s</b></li>' % (t(a), n) for a, n in cv["toc"])))

# ── body ─────────────────────────────────────────────────────────────────────
for pg in C.PAGES:
    P.append(
        '<section class="pg">'
        '<div class="ph"><div class="kick">%s</div><h2>%s</h2></div>'
        '<p class="lead">%s</p><div class="pbody">%s</div>'
        '<div class="pf"><span>%s</span><span>%s</span></div></section>'
        % (t(pg["kicker"]), t(pg["title"]), t(pg["lead"]),
           "".join(block(b, sole=len(pg["blocks"]) == 1) for b in pg["blocks"]),
           t(C.FOOTER), pg["num"]))

CSS = """
@page{size:A4 landscape;margin:0}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{font:10pt/1.5 "Segoe UI",Arial,sans-serif;color:#16261f;
 -webkit-print-color-adjust:exact;print-color-adjust:exact}
h1,h2,h3{font-family:Georgia,"Times New Roman",serif;color:#12372a;font-weight:600;margin:0}
code{font-family:Consolas,"Cascadia Mono",monospace;font-size:.88em;color:#33513f;
 background:#f3f1e9;border:1px solid #e6e1d3;border-radius:2px;padding:0 3px}
.pg{width:297mm;height:210mm;padding:13mm 14mm 15mm;page-break-after:always;
 position:relative;display:flex;flex-direction:column;overflow:hidden}
.pg:last-child{page-break-after:auto}
.ph{border-bottom:2.2px solid #12372a;padding-bottom:2.6mm;margin-bottom:3.4mm}
.kick{font:700 8pt/1 "Segoe UI";letter-spacing:3px;text-transform:uppercase;color:#c9a648;
 margin-bottom:2mm}
h2{font-size:21pt;letter-spacing:-.3px}
h3{font-size:12pt;margin:0 0 2.5mm}
.lead{font:11pt/1.5 Georgia,serif;color:#3c5147;margin:0 0 3.6mm;max-width:235mm}
.pbody{flex:1;min-height:0;display:flex;flex-direction:column;gap:3mm}
.dia{flex:0 0 auto;display:flex;justify-content:center}
svg-wrap{display:block;width:100%}
.dia svg{display:block;width:100%;height:auto}
.pbody>.dia:only-child{flex:1;min-height:0;align-items:center}
.pbody>.dia:only-child svg-wrap{display:flex;justify-content:center;min-height:0}
.pbody>.dia:only-child svg{width:auto;max-width:100%;max-height:100%}
.pf{position:absolute;left:14mm;right:14mm;bottom:5mm;display:flex;justify-content:space-between;
 font-size:7.6pt;color:#9aa49e;border-top:1px solid #e6e1d3;padding-top:2mm}
table{width:100%;border-collapse:collapse;margin:0}
th{background:#12372a;color:#fff;text-align:left;font:600 8.4pt/1.35 "Segoe UI";
 padding:2mm 2.6mm;border:1px solid #12372a}
td{padding:1.45mm 2.4mm;border:1px solid #ded8ca;vertical-align:top;font-size:8.2pt;line-height:1.38}
.txs td{font-size:7.6pt;padding:1.15mm 2.2mm;line-height:1.36}
.txs th{padding:1.7mm 2.2mm}
tbody tr:nth-child(even) td{background:#faf9f4}
td i{color:#8a9790;font-style:normal;font-size:.86em;letter-spacing:.4px}
.rulebar{display:grid;gap:4mm}
.rulebar.c3{grid-template-columns:repeat(3,1fr)}
.rulebar.c4{grid-template-columns:repeat(4,1fr)}
.rulebar.c5{grid-template-columns:repeat(5,1fr)}
.rulebar.c5 div{font-size:8.2pt;padding:2.2mm 2.6mm}
.rulebar div{background:#f6f8f5;border:1px solid #dfe5de;border-left:3px solid #4f9a72;
 border-radius:4px;padding:2.6mm 3mm;font-size:8.8pt;line-height:1.45}
.rulebar b{color:#12372a}
.notebar{background:#f6f4ec;border:1px solid #e2dcca;border-left:4px solid #c9a648;
 border-radius:4px;padding:2.6mm 3.2mm;font-size:8.7pt;line-height:1.48}
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:7mm}
.two-col>div{display:flex;flex-direction:column;gap:3mm}
ol.rules{margin:0;padding-left:5mm}
ol.rules li{margin-bottom:1.9mm;font-size:8.7pt;line-height:1.46}
.phases{display:flex;flex-direction:column;gap:1.8mm}
.phases>div{display:grid;grid-template-columns:17mm 1fr;gap:.8mm 3mm;align-items:baseline;
 background:#f6f8f5;border:1px solid #dfe5de;border-left:3px solid #4f9a72;border-radius:4px;
 padding:1.7mm 2.8mm}
.phases b{font:700 8pt/1.2 "Segoe UI";letter-spacing:1.6px;text-transform:uppercase;color:#c9a648}
.phases span{font-size:9.4pt;font-weight:600;color:#12372a}
.phases em{grid-column:2;font-style:normal;font-size:7.7pt;color:#5f7168;
 font-family:Consolas,monospace}
/* cover */
.cover{background:#faf7f0;flex-direction:row;gap:14mm;padding:20mm 18mm 12mm;align-items:stretch}
.cover>div:first-child{flex:1.35;display:flex;flex-direction:column;justify-content:center}
.ceyebrow{font:700 9pt/1 "Segoe UI";letter-spacing:3.4px;text-transform:uppercase;color:#0f7a45}
.cover h1{font-size:40pt;line-height:1.03;letter-spacing:-1.4px;margin:7mm 0 0}
.cover h1 em{font-style:normal;color:#c9a648;display:block;font-size:31pt;margin-top:2mm}
.crule{height:5px;width:48mm;background:#c9a648;margin:8mm 0 0}
.clede{font:11.5pt/1.62 Georgia,serif;color:#3c5147;margin:7mm 0 0;max-width:155mm}
.cstats{display:grid;grid-template-columns:repeat(4,1fr);gap:5mm;margin-top:11mm}
.cstats div{border-top:1.6px solid #cfc7b5;padding-top:2.6mm}
.cstats b{display:block;font:600 21pt/1 Georgia,serif;color:#12372a}
.cstats span{display:block;font-size:8.2pt;color:#6b7a72;margin-top:1.6mm;line-height:1.4}
.ctoc{flex:.65;background:#12372a;border-radius:8px;padding:12mm 9mm;color:#fff;
 display:flex;flex-direction:column;justify-content:center}
.ctoc-h{font:600 15pt/1 Georgia,serif;color:#fff;margin-bottom:6mm}
.ctoc ol{list-style:none;margin:0;padding:0}
.ctoc li{display:flex;justify-content:space-between;align-items:baseline;gap:4mm;
 padding:2.8mm 0;border-bottom:1px solid #2a4f3e;font-size:9pt;color:#dce6e0}
.ctoc li b{color:#c9a648;font-size:9pt}
"""

html = ('<!doctype html><html><head><meta charset="utf-8"><title>%s — %s</title>'
        '<style>%s</style></head><body>%s</body></html>'
        % (C.DOC_TITLE, C.DOC_SUBTITLE, CSS, "".join(P)))

src = os.path.join(BUILD, "_design.html")
io.open(src, "w", encoding="utf-8").write(html)
subprocess.run([chrome()] + PDF_FLAGS + ["--print-to-pdf=" + OUT, url(src)],
               capture_output=True, text=True)
print("pdf:", os.path.exists(OUT), os.path.getsize(OUT) if os.path.exists(OUT) else "-",
      "| pages authored:", len(P))
