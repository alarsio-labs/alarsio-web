# -*- coding: utf-8 -*-
"""SVG diagrams for the Alarsio team guide. Reuses the shared palette."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from diagrams import box, svg, K   # noqa: E402


def _wrap(t, n):
    out, cur = [], ""
    for w in t.split():
        if len(cur + " " + w) > n and cur:
            out.append(cur); cur = w
        else:
            cur = (cur + " " + w).strip()
    out.append(cur)
    return out


# ═════════════════════════════════ G1 — the loop
def g1():
    b = []
    phases = [
        ("PLAN", "What and why", "plat", [
            "Read the issue", "Read ARCHITECTURE.md", "State it in one sentence"]),
        ("SPEC", "How, exactly", "site", [
            "Run /spec", "Tables, roles, offline", "Acceptance criteria agreed"]),
        ("GENERATE", "Claude writes it", "stock", [
            "Plan mode first", "Run /implement", "One module, one concern"]),
        ("VALIDATE", "Prove it works", "money", [
            "Inspect every line", "Test + /security-review", "PR, human review"]),
    ]
    CW, GAP, X0, TOP, CH = 300, 34, 28, 54, 250
    for i, (name, sub, kind, items) in enumerate(phases):
        x = X0 + i * (CW + GAP)
        fill, stroke = K[kind]
        b.append('<rect x="%g" y="%g" width="%g" height="%g" rx="12" fill="#ffffff" '
                 'stroke="%s" stroke-width="2.2"/>' % (x, TOP, CW, CH, stroke))
        b.append('<rect x="%g" y="%g" width="%g" height="60" rx="12" fill="%s"/>'
                 % (x, TOP, CW, fill))
        b.append('<rect x="%g" y="%g" width="%g" height="16" fill="%s"/>'
                 % (x, TOP + 44, CW, fill))
        b.append('<text x="%g" y="%g" font-size="23" font-weight="700" fill="#16261f" '
                 'letter-spacing="1.6">%s</text>' % (x + 20, TOP + 31, name))
        b.append('<text x="%g" y="%g" font-size="14" fill="#4d5f56">%s</text>'
                 % (x + 20, TOP + 51, sub))
        y = TOP + 92
        for it in items:
            b.append('<circle cx="%g" cy="%g" r="3" fill="%s"/>' % (x + 24, y - 5, stroke))
            for ln in _wrap(it, 28):
                b.append('<text x="%g" y="%g" font-size="14.5" fill="#33453c">%s</text>'
                         % (x + 36, y, ln))
                y += 19
            y += 10
        if i < 3:
            ax = x + CW
            b.append('<path d="M%g %g H%g" stroke="#3b4c43" stroke-width="2.6" fill="none" '
                     'marker-end="url(#a)"/>' % (ax + 7, TOP + CH / 2, ax + GAP - 8))

    # the return arrow
    b.append('<path d="M%g %g V%g H%g V%g" stroke="#c9a648" stroke-width="2.4" fill="none" '
             'stroke-dasharray="9 5" marker-end="url(#a)"/>'
             % (X0 + 3 * (CW + GAP) + CW / 2, TOP + CH + 6, TOP + CH + 46,
                X0 + CW / 2, TOP + CH + 6))
    b.append('<text x="%g" y="%g" text-anchor="middle" font-size="14.5" font-style="italic" '
             'fill="#8a7433">a rejected review goes back to SPEC, never straight to '
             'GENERATE</text>' % (700, TOP + CH + 68))
    b.append('<text x="28" y="30" font-size="15" font-weight="700" letter-spacing="2.4" '
             'fill="#8a9790">ONE FEATURE, ONE PASS THROUGH THE LOOP</text>')
    return svg(1400, 390, "".join(b))


# ═════════════════════════════════ G2 — ownership and weeks
def g2():
    b = []
    people = [
        ("Manish Tiwari", "site", ["Sites", "Attendance &amp; Site Presence"]),
        ("Ishant Bhoyar", "plat", ["Identity &amp; Access", "Workforce"]),
        ("Nikhil Mehta", "stock", ["Offline Sync", "Materials &amp; Inventory"]),
        ("Anuradha Tiwari", "money", ["Audit, Retention &amp; Guards", "Daily Reporting"]),
    ]
    CW, GAP, X0 = 320, 26, 28
    b.append('<text x="28" y="26" font-size="14" font-weight="700" letter-spacing="2.4" '
             'fill="#8a9790">TWO MODULES EACH</text>')
    for i, (name, kind, mods) in enumerate(people):
        x = X0 + i * (CW + GAP)
        fill, stroke = K[kind]
        b.append('<rect x="%g" y="40" width="%g" height="132" rx="11" fill="%s" stroke="%s" '
                 'stroke-width="2"/>' % (x, CW, fill, stroke))
        b.append('<text x="%g" y="70" font-size="19" font-weight="700" fill="#16261f">%s</text>'
                 % (x + 18, name))
        yy = 98
        for m in mods:
            b.append('<rect x="%g" y="%g" width="%g" height="30" rx="7" fill="#ffffff" '
                     'stroke="%s" stroke-opacity="0.5"/>' % (x + 16, yy, CW - 32, stroke))
            b.append('<text x="%g" y="%g" font-size="14.5" fill="#22332b">%s</text>'
                     % (x + 28, yy + 20, m))
            yy += 36

    b.append('<text x="28" y="212" font-size="14" font-weight="700" letter-spacing="2.4" '
             'fill="#8a9790">EIGHT WEEKS</text>')
    weeks = [
        ("WEEKS 1–2", "Foundation", "#e6e5de", "#7d7d73",
         "sequential — everything depends on these"),
        ("WEEKS 3–6", "Field capture", "#d8e8f7", "#5b87ad",
         "parallel — no shared tables"),
        ("WEEKS 7–8", "Close the loop", "#fbe9bc", "#c0982f",
         "wages, dashboard, exports, hardening"),
    ]
    WW = [430, 560, 340]
    xx = 28
    for i, (lbl, title, fill, stroke, note) in enumerate(weeks):
        w = WW[i]
        b.append('<rect x="%g" y="226" width="%g" height="82" rx="11" fill="%s" stroke="%s" '
                 'stroke-width="2"/>' % (xx, w, fill, stroke))
        b.append('<text x="%g" y="252" font-size="13" font-weight="700" letter-spacing="1.8" '
                 'fill="#5f7168">%s</text>' % (xx + 18, lbl))
        b.append('<text x="%g" y="276" font-size="19" font-weight="700" fill="#16261f">%s</text>'
                 % (xx + 18, title))
        b.append('<text x="%g" y="297" font-size="14" fill="#4d5f56">%s</text>' % (xx + 18, note))
        if i < 2:
            b.append('<path d="M%g 267 H%g" stroke="#3b4c43" stroke-width="2.4" fill="none" '
                     'marker-end="url(#a)"/>' % (xx + w + 5, xx + w + 20))
        xx += w + 26
    b.append('<text x="28" y="334" font-size="14.5" fill="#5f7168" '
             'font-family="Consolas,monospace">Order is set by dependencies, not preference. '
             'Nothing in weeks 3–6 starts before weeks 1–2 publish their '
             'interface.</text>')
    return svg(1400, 350, "".join(b))


# ═════════════════════════════════ G3 — reserved
def g3():
    return svg(1400, 10, "")
