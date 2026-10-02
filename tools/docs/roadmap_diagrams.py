# -*- coding: utf-8 -*-
"""SVG diagrams for the BuildFlow product feature roadmap.

Shares the palette and the box style of diagrams.py, so the roadmap sits in the
same design system as the architecture documents.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from diagrams import box, svg, wrap, K   # noqa: E402


def _lines(b, x, y, text, chars, size, colour, mono=False, lead=None):
    """Wrapped text block. Returns the y after the last line."""
    lead = lead or size * 1.3
    fam = "Consolas,monospace" if mono else "Segoe UI,Arial"
    for ln in wrap(text, chars):
        b.append('<text x="%g" y="%g" font-size="%g" fill="%s" font-family="%s">%s</text>'
                 % (x, y, size, colour, fam, ln))
        y += lead
    return y


# ══════════════════════════════════════════ R1 — the release spine
def r1():
    """Five stages left to right, with the MVP line drawn across them."""
    b = []
    cards = [
        ("Phase 0", "Discovery &amp; Design", "plat", "BEFORE WEEK 1",
         "Validate the scope and settle the architecture before any build.",
         ["Contractor and site interviews", "MVP scope and acceptance list",
          "Architecture decisions", "Design partners signed"]),
        ("Release 1", "Private Pilot — MVP", "site", "WEEKS 1–16",
         "A supervisor captures the site record offline; an owner trusts the result.",
         ["Sites, workers, attendance", "Daily reports, materials",
          "Wage summaries and exports", "Offline sync and audit"]),
        ("Release 2", "Paid MVP", "stock", "WEEKS 17–28",
         "The same product, made billable, supportable and legally clean.",
         ["Subscription and invoices", "In-app notifications",
          "DPDP compliance review", "Hardening and support"]),
        ("Release 3", "Operations &amp; Money", "money", "WEEK 29 ONWARD",
         "Extend from site execution to the money around it. Candidates, not commitments.",
         ["Approvals and spend limit", "Projects and BOQ",
          "Procurement and vendors", "Sales, funding, P&amp;L"]),
        ("Release 4", "Demand-Gated", "ext", "NO WINDOW",
         "Candidates only. Each is built after paying-customer demand proves it.",
         ["Worker self-service", "Push notifications",
          "Payments and integrations", "Scheduling and analytics"]),
    ]
    CW, GAP, X0, TOP = 250, 27, 20, 96
    CH = 330

    # the MVP / post-MVP bands
    def band(x, w, label, fill, stroke, tc):
        b.append('<rect x="%g" y="26" width="%g" height="46" rx="9" fill="%s" stroke="%s" '
                 'stroke-width="1.8"/>' % (x, w, fill, stroke))
        b.append('<text x="%g" y="55" text-anchor="middle" font-size="16.5" font-weight="700" '
                 'fill="%s" letter-spacing="2.4">%s</text>' % (x + w / 2, tc, label))

    band(X0, CW, "BEFORE THE BUILD", "#f1f0ea", "#a09f95", "#6b6a60")
    band(X0 + CW + GAP, CW, "MVP", "#d5eee0", "#4f9a72", "#1f5c3f")
    band(X0 + 2 * (CW + GAP), CW, "POST-MVP — PAID", "#fbe9bc", "#c0982f", "#7a5f12")
    band(X0 + 3 * (CW + GAP), 2 * CW + GAP, "POST-MVP — CANDIDATES, NOT COMMITMENTS",
         "#f3f1ea", "#8d8570", "#6b6553")

    for i, (kick, title, kind, weeks, outcome, ships) in enumerate(cards):
        x = X0 + i * (CW + GAP)
        fill, stroke = K[kind]
        b.append('<rect x="%g" y="%g" width="%g" height="%g" rx="11" fill="#ffffff" stroke="%s" '
                 'stroke-width="2"/>' % (x, TOP, CW, CH, stroke))
        b.append('<rect x="%g" y="%g" width="%g" height="46" rx="11" fill="%s"/>'
                 % (x, TOP, CW, fill))
        b.append('<rect x="%g" y="%g" width="%g" height="14" fill="%s"/>'
                 % (x, TOP + 32, CW, fill))
        b.append('<text x="%g" y="%g" font-size="12.5" font-weight="700" fill="#5f7168" '
                 'letter-spacing="2.2">%s</text>' % (x + 16, TOP + 22, kick.upper()))
        b.append('<text x="%g" y="%g" font-size="17.5" font-weight="700" fill="#16261f">%s</text>'
                 % (x + 16, TOP + 41, title))
        b.append('<text x="%g" y="%g" font-size="12" font-weight="700" fill="%s" '
                 'letter-spacing="1.5">%s</text>' % (x + 16, TOP + 66, stroke, weeks))
        y = _lines(b, x + 16, TOP + 88, outcome, 30, 13.4, "#4d5f56")
        y += 6
        b.append('<line x1="%g" y1="%g" x2="%g" y2="%g" stroke="#e2ddd0" stroke-width="1.4"/>'
                 % (x + 16, y, x + CW - 16, y))
        y += 20
        b.append('<text x="%g" y="%g" font-size="11.5" font-weight="700" fill="#8a9790" '
                 'letter-spacing="1.8">WILL SHIP</text>' % (x + 16, y))
        y += 19
        for s_ in ships:
            b.append('<circle cx="%g" cy="%g" r="2.6" fill="%s"/>' % (x + 20, y - 4, stroke))
            y = _lines(b, x + 30, y, s_, 27, 13, "#33453c", lead=16) + 6
        if i < len(cards) - 1:
            xa = x + CW + 5
            b.append('<path d="M%g %g H%g" stroke="#7d8b83" stroke-width="2.2" fill="none" '
                     'marker-end="url(#a)"/>' % (xa, TOP + CH / 2, xa + GAP - 10))
    return svg(1400, 456, "".join(b))


# ══════════════════════════════════════════ R2 — what the MVP contains
def r2():
    """The eleven MVP areas, grouped by who uses them."""
    b = []
    groups = [
        ("ON SITE — WORKS OFFLINE", 20, 616, "site",
         ["Site management", "Worker registry", "Attendance &amp; site visits",
          "Daily site reports", "Basic materials"]),
        ("IN THE OFFICE", 656, 360, "money",
         ["Wage summaries", "Dashboard &amp; approvals", "Reports &amp; audit"]),
        ("PLATFORM", 1036, 344, "plat",
         ["Organization &amp; access", "Offline synchronization", "Retention &amp; deletion"]),
    ]
    for label, x, w, kind, items in groups:
        b.append('<rect x="%g" y="20" width="%g" height="180" rx="12" fill="#fbfaf6" '
                 'stroke="#cfcabc" stroke-width="1.6" stroke-dasharray="7 5"/>' % (x, w))
        b.append('<text x="%g" y="45" font-size="12.5" font-weight="700" fill="#8a9790" '
                 'letter-spacing="2.4">%s</text>' % (x + 16, label))
        per = 3 if len(items) > 3 else 2
        bw = (w - 32 - (per - 1) * 12) / per
        for j, it in enumerate(items):
            col, row = j % per, j // per
            bx = x + 16 + col * (bw + 12)
            by = 58 + row * 62
            b.append(box(bx, by, bw, 52, kind, it, None, 20, 14.5))
    return svg(1400, 214, "".join(b))


# ══════════════════════════════════════════ R3 — Release 3 capability groups
def r3():
    """How the decided post-MVP groups fit together."""
    b = []
    # the gate
    fill, stroke = K["approval"]
    b.append('<rect x="20" y="70" width="300" height="180" rx="12" fill="%s" stroke="%s" '
             'stroke-width="2.4"/>' % (fill, stroke))
    b.append('<text x="170" y="140" text-anchor="middle" font-size="18" font-weight="700" '
             'fill="#16261f">Approvals &amp;</text>')
    b.append('<text x="170" y="163" text-anchor="middle" font-size="18" font-weight="700" '
             'fill="#16261f">Spend Governance</text>')
    b.append('<text x="170" y="192" text-anchor="middle" font-size="13.5" fill="#8a5a44">'
             'the owner spend threshold</text>')
    b.append('<text x="170" y="212" text-anchor="middle" font-size="13.5" fill="#8a5a44">'
             'default ₹25,000</text>')
    b.append('<text x="20" y="46" font-size="12.5" font-weight="700" fill="#8a9790" '
             'letter-spacing="2.2">ASKED BEFORE MONEY MOVES</text>')

    mids = [("Projects &amp; BOQ", "stock", "priced estimate, work packages, actual use"),
            ("Procurement &amp; Site Spend", "money", "vendors, orders, deliveries, expenses"),
            ("Property Sales &amp; Collections", "sales", "plots, bookings, receipts, payouts")]
    b.append('<text x="400" y="46" font-size="12.5" font-weight="700" fill="#8a9790" '
             'letter-spacing="2.2">NEW CAPABILITY GROUPS</text>')
    for i, (name, kind, sub) in enumerate(mids):
        y = 62 + i * 66
        b.append(box(400, y, 560, 54, kind, name, sub, 34, 16.5, 12.8))
        b.append('<path d="M396 %g H330" stroke="#3b4c43" stroke-width="1.8" fill="none" '
                 'marker-end="url(#a)"/>' % (y + 27))
        b.append('<path d="M964 %g H1034" stroke="#3b4c43" stroke-width="1.8" fill="none" '
                 'marker-end="url(#a)"/>' % (y + 27))

    fill, stroke = K["money"]
    b.append('<rect x="1040" y="70" width="340" height="180" rx="12" fill="%s" stroke="%s" '
             'stroke-width="2.4"/>' % (fill, stroke))
    b.append('<text x="1210" y="130" text-anchor="middle" font-size="18" font-weight="700" '
             'fill="#16261f">Financial Reporting</text>')
    b.append('<text x="1210" y="153" text-anchor="middle" font-size="18" font-weight="700" '
             'fill="#16261f">&amp; Exports</text>')
    b.append('<text x="1210" y="182" text-anchor="middle" font-size="13.5" fill="#7a5f12">'
             'budget, funding, spend,</text>')
    b.append('<text x="1210" y="202" text-anchor="middle" font-size="13.5" fill="#7a5f12">'
             'labour cost, profit and loss</text>')
    b.append('<text x="1040" y="46" font-size="12.5" font-weight="700" fill="#8a9790" '
             'letter-spacing="2.2">ONE FIGURE PER PROJECT</text>')
    return svg(1400, 274, "".join(b))
