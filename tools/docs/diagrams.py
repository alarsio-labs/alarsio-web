# -*- coding: utf-8 -*-
"""SVG diagrams for the BuildFlow modular monolith reference document.
All diagrams share one palette and one box style."""

FOREST, GOLD, INK, MUT = "#12372a", "#c9a648", "#16261f", "#5f7168"
K = {
    "site":     ("#d8e8f7", "#5b87ad"),
    "people":   ("#e1d6f5", "#8571b5"),
    "stock":    ("#d5eee0", "#4f9a72"),
    "money":    ("#fbe9bc", "#c0982f"),
    "approval": ("#f7ddcc", "#c0563a"),
    "sales":    ("#f9d9d9", "#bf7a7a"),
    "plat":     ("#e6e5de", "#7d7d73"),
    "db":       ("#dfe6ea", "#54636c"),
    "ext":      ("#f3f1ea", "#8d8570"),
}

DEFS = """<defs>
<marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7.5" markerHeight="7.5"
 orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#3b4c43"/></marker>
<marker id="g" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7.5" markerHeight="7.5"
 orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#8d8570"/></marker>
</defs>
<style>
.h1{font:700 26px "Segoe UI",Arial;fill:#12372a}
.bt{font:600 17.5px "Segoe UI",Arial;fill:#16261f}
.bs{font:400 14px "Segoe UI",Arial;fill:#4d5f56}
.bm{font:400 13.5px Consolas,monospace;fill:#5f7168}
.bandlbl{font:700 13px "Segoe UI",Arial;fill:#8a9790;letter-spacing:2.6px}
.white{font:700 18px "Segoe UI",Arial;fill:#ffffff}
.whites{font:400 13.5px Consolas,monospace;fill:#c9d6cf}
.ln{stroke:#3b4c43;stroke-width:1.9;fill:none}
.lnf{stroke:#8d8570;stroke-width:1.7;fill:none;stroke-dasharray:7 5}
</style>"""


def esc(t):
    return t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def wrap(t, n):
    out, cur = [], ""
    for w in t.split():
        if len(cur + " " + w) > n and cur:
            out.append(cur); cur = w
        else:
            cur = (cur + " " + w).strip()
    out.append(cur)
    return out


def box(x, y, w, h, kind, label, sub=None, chars=22, ts=17.5, ss=13.5):
    fill, stroke = K[kind]
    s = ('<rect x="%g" y="%g" width="%g" height="%g" rx="9" fill="%s" stroke="%s" '
         'stroke-width="1.8"/>' % (x, y, w, h, fill, stroke))
    lines = wrap(label, chars)
    nl = len(lines) + (1 if sub else 0)
    top = y + h / 2 - (nl - 1) * (ts * 0.62) + ts * 0.36
    for i, ln in enumerate(lines):
        s += ('<text x="%g" y="%g" text-anchor="middle" font-size="%g" font-weight="600" '
              'fill="#16261f" font-family="Segoe UI,Arial">%s</text>'
              % (x + w / 2, top + i * (ts * 1.24), ts, ln))
    if sub:
        s += ('<text x="%g" y="%g" text-anchor="middle" font-size="%g" fill="#4d5f56" '
              'font-family="Consolas,monospace">%s</text>'
              % (x + w / 2, top + len(lines) * (ts * 1.24) + 2, ss, sub))
    return s


def svg(w, h, body):
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %g %g" '
            'font-family="Segoe UI, Arial, sans-serif">%s'
            '<rect width="%g" height="%g" fill="#ffffff"/>%s</svg>' % (w, h, DEFS, w, h, body))


# ══════════════════════════════════════════ D1 — system architecture
def d1(counts="47 tables · 26 views · ~95 functions", mvp=False):
    """mvp=True splits the domain band into the MVP release and the later ones,
    and draws the MVP line between them."""
    b = []
    # clients
    b.append(box(190, 24, 430, 88, "site", "Mobile app — Expo / React Native",
                 "supervisor · site engineer · works offline", 34, 18))
    b.append(box(780, 24, 430, 88, "stock", "Web dashboard — Next.js",
                 "office · accountant · director · owner", 34, 18))
    b.append('<path class="ln" d="M405 112 V150" marker-end="url(#a)"/>')
    b.append('<path class="ln" d="M995 112 V150" marker-end="url(#a)"/>')

    # monolith boundary
    b.append('<rect x="30" y="152" width="1340" height="496" rx="20" fill="#fbfaf6" '
             'stroke="#12372a" stroke-width="2.6"/>')
    b.append('<text x="700" y="186" text-anchor="middle" font-size="22" font-weight="700" '
             'fill="#12372a">BuildFlow Modular Monolith</text>')
    b.append('<text x="700" y="207" text-anchor="middle" font-size="14" fill="#5f7168">'
             'one deployment · one PostgreSQL database · one public schema</text>')

    # entry points
    ep = [("sync_push RPC", "field writes, one batch"),
          ("PostgREST reads", "every dashboard query"),
          ("Server Actions", "3 files, web writes"),
          ("CSV export route", "11 datasets")]
    for i, (t, s2) in enumerate(ep):
        b.append(box(60 + i * 325, 222, 305, 58, "plat", t, s2, 28, 16, 12.5))
    b.append('<text class="bandlbl" x="60" y="214">ENTRY POINTS</text>')
    for i in range(4):
        x = 60 + i * 325 + 152
        b.append('<path class="ln" d="M%g 280 V298" />' % x)
    b.append('<path class="ln" d="M212 298 H1187"/>')
    for x in (400, 700, 1000):
        b.append('<path class="ln" d="M%g 298 V318" marker-end="url(#a)"/>' % x)

    # domain modules
    b.append('<rect x="50" y="322" width="1300" height="188" rx="14" fill="#f2f5f1" '
             'stroke="#a7b3ab" stroke-width="1.6" stroke-dasharray="8 6"/>')
    if mvp:
        in_mvp = [("Sites", "site"), ("Workforce", "people"),
                  ("Attendance &amp; Site Presence", "site"), ("Daily Reporting", "site"),
                  ("Materials &amp; Inventory", "stock"), ("Wage Summaries", "people")]
        later = [("Approvals &amp; Spend Governance", "approval"),
                 ("Procurement &amp; Site Spend", "money"),
                 ("BOQ &amp; Work Packages", "stock"),
                 ("Property Sales &amp; Collections", "sales"),
                 ("Financial Reporting &amp; Exports", "money")]
        b.append('<text class="bandlbl" x="66" y="346" fill="#2f7d55">'
                 'MVP · RELEASE 1 — 6 DOMAIN MODULES</text>')
        for i, (n, k) in enumerate(in_mvp):
            b.append(box(64 + i * 214, 352, 202, 50, k, n, None, 19, 14))
        b.append('<path d="M58 416 H1342" stroke="#c0563a" stroke-width="2.4" '
                 'stroke-dasharray="11 7"/>')
        b.append('<text x="1342" y="438" text-anchor="end" font-size="12.5" font-weight="700" '
                 'letter-spacing="2.2" fill="#c0563a">THE MVP LINE</text>')
        b.append('<text class="bandlbl" x="66" y="438" fill="#c0563a">'
                 'LATER RELEASES — 5 DOMAIN MODULES, NOT BUILT FOR THE PILOT</text>')
        for i, (n, k) in enumerate(later):
            b.append(box(171 + i * 214, 446, 202, 50, k, n, None, 19, 14))
    else:
        b.append('<text class="bandlbl" x="66" y="346">DOMAIN MODULES — 11</text>')
        mods = [("Sites &amp; Projects", "site"), ("Workforce", "people"),
                ("Attendance &amp; Site Presence", "site"), ("Daily Reporting &amp; Punch List", "site"),
                ("Materials &amp; Inventory", "stock"), ("Procurement &amp; Site Spend", "money"),
                ("Approvals &amp; Spend Governance", "approval"), ("Payroll &amp; Wages", "people"),
                ("BOQ &amp; Work Packages", "stock"), ("Property Sales &amp; Collections", "sales"),
                ("Financial Reporting &amp; Exports", "money")]
        for i, (n, k) in enumerate(mods[:6]):
            b.append(box(64 + i * 214, 356, 202, 56, k, n, None, 19, 14.5))
        for i, (n, k) in enumerate(mods[6:]):
            b.append(box(171 + i * 214, 424, 202, 56, k, n, None, 19, 14.5))

    b.append('<path class="ln" d="M700 510 V530" marker-end="url(#a)"/>')

    # shared infrastructure
    b.append('<rect x="50" y="534" width="1300" height="96" rx="14" fill="#eeeeea" '
             'stroke="#a09f95" stroke-width="1.6" stroke-dasharray="8 6"/>')
    b.append('<text class="bandlbl" x="66" y="556">SHARED INFRASTRUCTURE — 4 PLATFORM MODULES%s</text>'
             % (", 3 IN THE MVP" if mvp else ""))
    plats = [("Identity &amp; Access", "roles · RLS predicates"),
             ("Offline Sync", "outbox · sync_push"),
             ("Notifications &amp; Inbox", "later release" if mvp else "one list per user"),
             ("Audit · Retention · Guards", "audit_log · rate limit")]
    for i, (n, s2) in enumerate(plats):
        b.append(box(64 + i * 321, 564, 307, 54, "plat", n, s2, 26, 15, 12))

    # database + external
    for x in (380, 700, 1020):
        b.append('<path class="ln" d="M%g 650 V682" marker-end="url(#a)"/>' % x)
    b.append('<text class="bandlbl" x="30" y="670">DATABASE AND EXTERNAL SERVICES</text>')
    b.append('<rect x="30" y="686" width="440" height="96" rx="12" fill="#dfe6ea" '
             'stroke="#54636c" stroke-width="2"/>')
    b.append('<text x="250" y="720" text-anchor="middle" font-size="19" font-weight="700" '
             'fill="#16261f">PostgreSQL + Row Level Security</text>')
    b.append('<text x="250" y="744" text-anchor="middle" class="bm">%s</text>' % counts)
    b.append('<text x="250" y="766" text-anchor="middle" class="bm">RLS on every table and every view</text>')
    ext = [("Supabase Auth", "auth.users"), ("Supabase Storage", "photos, receipts"),
           ("Sentry · PostHog", "errors, analytics")]
    for i, (n, s2) in enumerate(ext):
        b.append(box(494 + i * 228, 686, 210, 96, "ext", n, s2, 17, 16, 12.5))
    b.append('<rect x="1178" y="686" width="192" height="96" rx="12" fill="#f7f5ee" '
             'stroke="#8d8570" stroke-width="1.8" stroke-dasharray="7 5"/>')
    b.append('<text x="1274" y="726" text-anchor="middle" font-size="16" font-weight="600" '
             'fill="#6b6553">Resend</text>')
    b.append('<text x="1274" y="748" text-anchor="middle" class="bm">invite email</text>')
    b.append('<text x="1274" y="768" text-anchor="middle" class="bm">optional</text>')
    return svg(1400, 800, "".join(b))


# ══════════════════ D2-MVP — dependencies inside the MVP only
def d2_mvp():
    """The nine MVP modules and every arrow that will exist at pilot.
    Nothing here points at a module that will not be built."""
    b = []
    C = [60, 386, 712]
    CW, BH = 300, 52
    Y = [36, 118, 200, 282, 364]
    band_w = 952
    L = 'class="ln" marker-end="url(#a)"'

    b.append(box(60, Y[0], band_w, BH, "plat", "Identity &amp; Access", None, 60, 18))
    b.append('<text x="1000" y="%g" text-anchor="end" class="bm">every MVP module uses it</text>'
             % (Y[0] + 44))
    b.append(box(60, Y[1], band_w, BH, "site", "Sites", None, 60, 18))
    b.append(box(C[0], Y[2], CW, BH, "people", "Workforce", None, 30, 17))
    b.append(box(C[2], Y[2], CW, BH, "stock", "Materials &amp; Inventory", None, 30, 17))
    b.append(box(C[0], Y[3], CW, BH, "site", "Attendance &amp; Site Presence", None, 30, 17))
    b.append(box(C[0], Y[4], CW, BH, "site", "Daily Reporting", None, 30, 17))
    b.append(box(C[1], Y[4], CW, BH, "people", "Wage Summaries", None, 30, 17))

    b.append('<path %s d="M699 %g V%g"/>' % (L, Y[1], Y[0] + BH + 4))
    b.append('<path %s d="M210 %g V%g"/>' % (L, Y[2], Y[1] + BH + 4))
    b.append('<path %s d="M862 %g V%g"/>' % (L, Y[2], Y[1] + BH + 4))
    b.append('<path %s d="M210 %g V%g"/>' % (L, Y[3], Y[2] + BH + 4))
    b.append('<path %s d="M210 %g V%g"/>' % (L, Y[4], Y[3] + BH + 4))
    b.append('<path %s d="M536 %g V%g H220 V%g"/>' % (L, Y[4], Y[4] - 16, Y[3] + BH + 4))
    b.append('<path %s d="M386 %g H372 V%g H364"/>' % (L, Y[4] + 26, Y[2] + 26))

    # the two cross-cutting platform modules
    b.append('<rect x="1060" y="118" width="280" height="136" rx="12" fill="#e6e5de" '
             'stroke="#7d7d73" stroke-width="2.2"/>')
    b.append('<text x="1200" y="168" text-anchor="middle" font-size="18" font-weight="700" '
             'fill="#16261f">Offline Sync</text>')
    b.append('<text x="1200" y="196" text-anchor="middle" class="bm">sync_push(batch)</text>')
    b.append('<text x="1200" y="224" text-anchor="middle" font-size="13.5" fill="#5f7168">'
             'writes into Attendance,</text>')
    b.append('<text x="1200" y="242" text-anchor="middle" font-size="13.5" fill="#5f7168">'
             'Daily Reporting, Materials</text>')
    b.append('<rect x="1060" y="280" width="280" height="136" rx="12" fill="#e6e5de" '
             'stroke="#7d7d73" stroke-width="2.2"/>')
    b.append('<text x="1200" y="322" text-anchor="middle" font-size="18" font-weight="700" '
             'fill="#16261f">Audit, Retention</text>')
    b.append('<text x="1200" y="344" text-anchor="middle" font-size="18" font-weight="700" '
             'fill="#16261f">&amp; Guards</text>')
    b.append('<text x="1200" y="374" text-anchor="middle" font-size="13.5" fill="#5f7168">'
             'one trigger across every</text>')
    b.append('<text x="1200" y="392" text-anchor="middle" font-size="13.5" fill="#5f7168">'
             'MVP table</text>')
    b.append('<path class="lnf" d="M1056 186 H1020 V%g H1016"/>' % (Y[3] + 26))
    b.append('<path class="lnf" d="M1056 348 H1036 V%g H1016"/>' % (Y[4] + 26))

    b.append('<text x="60" y="%g" class="bm">Arrows point from a module to the module it needs. '
             'No arrow leaves the MVP set, so no module waits on one that will not be '
             'built.</text>' % (Y[4] + BH + 30))
    return svg(1400, 540, "".join(b))


# ══════════════════════════════════════════ D2 — module dependencies
def d2():
    b = []
    C = [60, 386, 712]
    CW, BH = 300, 52
    Y = [36, 118, 200, 282, 364, 446]
    band_w = 952

    b.append(box(60, Y[0], band_w, BH, "plat", "Identity &amp; Access", None, 60, 18))
    b.append('<text x="1000" y="%g" text-anchor="end" class="bm">every module uses it</text>' % (Y[0] + 44))
    b.append(box(60, Y[1], band_w, BH, "site", "Sites &amp; Projects", None, 60, 18))
    b.append(box(C[0], Y[2], CW, BH, "people", "Workforce", None, 30, 17))
    b.append(box(C[2], Y[2], CW, BH, "stock", "Materials &amp; Inventory", None, 30, 17))
    b.append(box(C[0], Y[3], CW, BH, "site", "Attendance &amp; Site Presence", None, 30, 17))
    b.append(box(C[1], Y[3], CW, BH, "sales", "Property Sales &amp; Collections", None, 30, 17))
    b.append(box(C[2], Y[3], CW, BH, "money", "Procurement &amp; Site Spend", None, 30, 17))
    b.append(box(C[0], Y[4], CW, BH, "people", "Payroll &amp; Wages", None, 30, 17))
    b.append(box(C[1], Y[4], CW, BH, "site", "Daily Reporting &amp; Punch List", None, 30, 17))
    b.append(box(C[2], Y[4], CW, BH, "stock", "BOQ &amp; Work Packages", None, 30, 17))
    b.append(box(60, Y[5], band_w, BH, "money", "Financial Reporting &amp; Exports", None, 60, 18))

    # approvals hub
    b.append('<rect x="1060" y="118" width="280" height="298" rx="12" fill="#f7ddcc" '
             'stroke="#c0563a" stroke-width="2.6"/>')
    b.append('<text x="1200" y="240" text-anchor="middle" font-size="18" font-weight="700" '
             'fill="#16261f">Approvals &amp;</text>')
    b.append('<text x="1200" y="262" text-anchor="middle" font-size="18" font-weight="700" '
             'fill="#16261f">Spend Governance</text>')
    b.append('<text x="1200" y="292" text-anchor="middle" class="bm">request_approval()</text>')
    b.append('<text x="1200" y="312" text-anchor="middle" class="bm">decide_approval()</text>')
    b.append('<text x="1200" y="348" text-anchor="middle" font-size="13.5" fill="#8a5a44">'
             'four modules ask it</text>')
    b.append('<text x="1200" y="366" text-anchor="middle" font-size="13.5" fill="#8a5a44">'
             'for permission</text>')

    L = 'class="ln" marker-end="url(#a)"'
    b.append('<path %s d="M699 %g V%g"/>' % (L, Y[1], Y[0] + BH + 4))
    b.append('<path %s d="M210 %g V%g"/>' % (L, Y[2], Y[1] + BH + 4))
    b.append('<path %s d="M862 %g V%g"/>' % (L, Y[2], Y[1] + BH + 4))
    b.append('<path %s d="M210 %g V%g"/>' % (L, Y[3], Y[2] + BH + 4))
    b.append('<path %s d="M862 %g V%g"/>' % (L, Y[3], Y[2] + BH + 4))
    b.append('<path %s d="M536 %g V%g"/>' % (L, Y[3], Y[1] + BH + 4))
    b.append('<path %s d="M210 %g V%g"/>' % (L, Y[4], Y[3] + BH + 4))
    b.append('<path %s d="M536 %g V%g H220 V%g"/>' % (L, Y[4], Y[4] - 16, Y[3] + BH + 4))
    b.append('<path %s d="M712 %g H696 V%g H706"/>' % (L, Y[4] + 26, Y[2] + 26))
    b.append('<path %s d="M210 %g V%g"/>' % (L, Y[5], Y[4] + BH + 4))
    b.append('<path %s d="M386 %g H370 V%g H380"/>' % (L, Y[5] + 24, Y[3] + 26))
    b.append('<path %s d="M1012 %g H1040 V%g H1018"/>' % (L, Y[5] + 24, Y[3] + 26))
    # into the approvals hub
    b.append('<path %s d="M1012 %g H1056"/>' % (L, Y[1] + 26))
    b.append('<path %s d="M1012 %g H1056"/>' % (L, Y[3] + 26))
    b.append('<path %s d="M1012 %g H1030 V%g H1056"/>' % (L, Y[4] + 26, Y[3] + 46))
    b.append('<path %s d="M536 %g V%g H1030"/>' % ('class="ln"', Y[3] + BH, Y[3] + BH + 18))

    b.append('<text x="60" y="%g" class="bm">Arrows point from a module to the module it '
             'needs. A module never reaches past its own arrows.</text>' % (Y[5] + BH + 30))
    return svg(1400, 540, "".join(b))


# ══════════════════════════════════════════ D3 — auth chain
def d3(note="They go through narrow SECURITY DEFINER functions that check the caller themselves. The service-role key is used nowhere in application code."):
    b = []
    steps = [("Signed-in user", "Supabase Auth issues a JWT"),
             ("auth.uid()", "Postgres reads the user id"),
             ("RLS policy on the table", "every table, every view"),
             ("Named predicate", "one named check per policy"),
             ("Rows the user may see", "nothing else is returned")]
    W, G = 244, 38
    for i, (t, s2) in enumerate(steps):
        x = 20 + i * (W + G)
        b.append(box(x, 40, W, 92, "plat" if i < 4 else "stock", t, None, 22, 16.5))
        b.append('<text x="%g" y="116" text-anchor="middle" class="bm" font-size="12.5">%s</text>'
                 % (x + W / 2, s2))
        if i < 4:
            b.append('<path class="ln" d="M%g 86 H%g" marker-end="url(#a)"/>' % (x + W + 6, x + W + G - 8))
    b.append('<rect x="20" y="162" width="1340" height="74" rx="10" fill="#f6f4ec" '
             'stroke="#ddd7c8"/><rect x="20" y="162" width="5" height="74" rx="2" fill="#c9a648"/>')
    b.append('<text x="44" y="190" font-size="15.5" font-weight="600" fill="#16261f">'
             'Privileged writes do not bypass this.</text>')
    b.append('<text x="44" y="214" font-size="14.5" fill="#4d5f56">%s</text>' % note)
    return svg(1400, 250, "".join(b))


# ══════════════════════════════════════════ D4 — offline sync
def d4():
    b = []
    b.append(box(20, 40, 250, 86, "site", "Capture on the phone", "no signal needed", 22, 17))
    b.append(box(310, 40, 250, 86, "plat", "Local SQLite", "device-generated id", 22, 17))
    b.append(box(600, 40, 250, 86, "plat", "Outbox row", "one per (entity, record_id)", 22, 17, 12))
    b.append(box(890, 40, 250, 86, "plat", "sync_push RPC", "one batch · rate limited", 22, 17, 12))
    for x in (270, 560, 850):
        b.append('<path class="ln" d="M%g 83 H%g" marker-end="url(#a)"/>' % (x + 6, x + 34))
    b.append('<path class="ln" d="M1015 126 V158 H200 V186" marker-end="url(#a)"/>')
    b.append('<text x="1030" y="150" class="bm">a verdict per record, not one per batch</text>')

    v = [("accepted", "written to the owning module", "stock"),
         ("conflict", "flagged for review on the device", "money"),
         ("rejected", "shown with the reason", "approval"),
         ("retryable_error", "stays queued, tried again", "plat")]
    for i, (t, s2, k) in enumerate(v):
        x = 20 + i * 348
        b.append(box(x, 188, 330, 78, k, t, s2, 26, 16.5, 12.5))
    b.append('<rect x="20" y="292" width="1340" height="60" rx="10" fill="#f6f4ec" '
             'stroke="#ddd7c8"/><rect x="20" y="292" width="5" height="60" rx="2" fill="#c9a648"/>')
    b.append('<text x="44" y="318" font-size="14.8" fill="#16261f">'
             'A repeated push does not duplicate. One bad record does not block the rest of its '
             'batch. The app never shows “submitted” before the server confirms.</text>')
    b.append('<text x="44" y="340" font-size="14.8" fill="#16261f">'
             'Photos and receipts upload separately to Supabase Storage. An image never blocks a '
             'record. Spend and purchase orders call named functions instead of inserting.</text>')
    return svg(1400, 364, "".join(b))


# ══════════════════════════════════════════ D5 cross-module mechanisms
def d5(planned=False):
    """The five permitted cross-module mechanisms.

    planned=True phrases each description as a specification, for the
    pre-implementation technical design document.
    """
    w = (lambda now, later: later if planned else now)
    b, items = [], [
        ("Permission check", w("Every table's RLS policy calls a named function.",
           "Every table's RLS policy will call a named function."),
         "is_org_member() \u00b7 has_site_access()", "plat"),
        ("Named function", w("One module calls a function the owning module publishes.",
           "One module will call a function the owning module publishes."),
         "record_site_expense() \u00b7 confirm_po_delivery()", "money"),
        ("Database trigger", w("A write in one module causes a write in another.",
           "A write in one module will cause a write in another."),
         "record_boq_actual on material_transactions", "stock"),
        ("Published view", w("One module reads another only through a view.",
           "One module will read another only through a view."),
         "project_spend \u00b7 vendor_ledger \u00b7 notifications", "site"),
        ("Foreign key", w("A row points at a row owned by another module.",
           "A row will point at a row owned by another module."),
         "issues.daily_report_id", "sales"),
    ]
    for i, (t, d, ex, k) in enumerate(items):
        x = 20 + i * 275
        fill, stroke = K[k]
        b.append('<rect x="%g" y="20" width="257" height="150" rx="10" fill="%s" stroke="%s" '
                 'stroke-width="1.8"/>' % (x, fill, stroke))
        b.append('<text x="%g" y="48" font-size="16.5" font-weight="700" fill="#16261f">%s</text>'
                 % (x + 16, t))
        yy = 74
        cur, out = "", []
        for w in d.split():
            if len(cur + " " + w) > 30 and cur:
                out.append(cur); cur = w
            else:
                cur = (cur + " " + w).strip()
        out.append(cur)
        for ln in out:
            b.append('<text x="%g" y="%g" font-size="13.6" fill="#33453c">%s</text>' % (x + 16, yy, ln))
            yy += 18
        yy += 6
        cur, out = "", []
        for w in ex.split():
            if len(cur + " " + w) > 29 and cur:
                out.append(cur); cur = w
            else:
                cur = (cur + " " + w).strip()
        out.append(cur)
        for ln in out:
            b.append('<text x="%g" y="%g" font-size="12.4" fill="#5f7168" '
                     'font-family="Consolas,monospace">%s</text>' % (x + 16, yy, ln))
            yy += 16
    return svg(1400, 186, "".join(b))


# ══════════════════════════════════════════ D6 key workflows
def d6(mvp=False):
    """mvp=True labels each workflow with the release that will deliver it."""
    t1 = "Attendance to wage summary \u2014 MVP" if mvp else "Attendance to payslip"
    t2 = "Site spend \u2014 later release" if mvp else "Site spend"
    t3 = "Purchase order to stock \u2014 later release" if mvp else "Purchase order to stock"
    b = []
    flows = [
        (t1, "site", [
            ("Mark the roster on site", "offline, on the phone"),
            ("Sync to the server", "status becomes submitted"),
            ("Manager approves the day", "nobody approves their own"),
            ("Wages calculated", "approved days only"),
            ("Period locked, summary issued", "a paid line cannot be erased")]),
        (t2, "money", [
            ("Expense recorded", "phone or web, one function"),
            ("Amount checked against threshold", "org default \u20b925,000"),
            ("At or below: approved at once", "no request row is created"),
            ("Above: only the owner decides", "an admin cannot release it"),
            ("Project spend and P&amp;L update", "and the CSV export")]),
        (t3, "stock", [
            ("Order raised with lines", "total summed from the lines"),
            ("Approved if above threshold", "unapproved cannot be received"),
            ("Delivery confirmed", "full or partial"),
            ("Stock receipt posted", "one row per delivered line"),
            ("BOQ actual recorded", "if the material is BOQ-tagged")]),
    ]
    for i, (title, kind, steps) in enumerate(flows):
        x = 20 + i * 460
        b.append('<text x="%g" y="34" font-size="19" font-weight="700" fill="#12372a">%s</text>'
                 % (x, title))
        b.append('<line x1="%g" y1="46" x2="%g" y2="46" stroke="#dcd6c8" stroke-width="1.5"/>'
                 % (x, x + 420))
        for j, (t, s2) in enumerate(steps):
            y = 64 + j * 76
            fill, stroke = K[kind]
            b.append('<rect x="%g" y="%g" width="420" height="58" rx="9" fill="%s" stroke="%s" '
                     'stroke-width="1.8"/>' % (x, y, fill, stroke))
            b.append('<circle cx="%g" cy="%g" r="14" fill="%s"/>' % (x + 28, y + 29, stroke))
            b.append('<text x="%g" y="%g" text-anchor="middle" font-size="14" font-weight="700" '
                     'fill="#fff">%d</text>' % (x + 28, y + 34, j + 1))
            b.append('<text x="%g" y="%g" font-size="15.5" font-weight="600" fill="#16261f">%s</text>'
                     % (x + 52, y + 26, t))
            b.append('<text x="%g" y="%g" font-size="12.8" fill="#5f7168" '
                     'font-family="Consolas,monospace">%s</text>' % (x + 52, y + 45, s2))
            if j < len(steps) - 1:
                b.append('<path class="ln" d="M%g %g V%g" marker-end="url(#a)"/>'
                         % (x + 28, y + 58, y + 72))
    return svg(1400, 460, "".join(b))
