# -*- coding: utf-8 -*-
"""Content of the BuildFlow Product Feature Roadmap.

Same shape as design_content.py, so the same two renderers build it:

    python tools/docs/design_pdf.py  roadmap_content
    python tools/docs/design_docx.py roadmap_content

Sources. Everything here is traceable to a decision already written down:
    docs/03_mvp_definition.md  - MVP scope (SS4), exclusions (SS5), gates (SS7),
                                 pilot metrics (SS8), pricing shape (SS10)
    docs/05_roadmap.md         - release phases (SS3-SS7), prioritisation (SS8),
                                 risk register (SS9), review cadence (SS10)
    plans.md                   - the recorded scope change that moved purchase
                                 orders and vendor management out of the
                                 exclusion list

Nothing is invented. Where the two source documents disagree, the disagreement
is stated rather than smoothed over.

Markup: `code` for a monospace name, ~word~ for a small grey tag. Write a plain
"&" - each renderer escapes for its own format.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from roadmap_diagrams import r1, r2, r3   # noqa: E402

OUT_STEM = "buildflow-product-roadmap"
DOC_TITLE = "BuildFlow Product Feature Roadmap"
DOC_SUBTITLE = "MVP and Later Phases"
FOOTER = "BuildFlow — Product Feature Roadmap · MVP and Later Phases"

# ── cover ────────────────────────────────────────────────────────────────────
COVER = {
    "eyebrow": "Product Roadmap · Release Plan",
    "title": "BuildFlow",
    "title_em": "Product Feature Roadmap",
    "lede": "BuildFlow will be an offline-first construction operations platform for small and "
            "mid-sized contractors. This document sets out which features will ship in the MVP "
            "and which are planned for later releases. The MVP is exactly the P0 set of the "
            "PRD — nothing heavier. Timing is given in weeks from the start of the build, "
            "because each release is gated by its exit criteria rather than by a calendar.",
    "stats": [
        ("11", "MVP feature areas", "every one a PRD P0"),
        ("16", "weeks to the pilot", "build 1–12, pilot 13–16"),
        ("13", "excluded from the MVP", "each with where it lands"),
        ("3", "later releases", "one paid, two candidate"),
    ],
    "toc": [
        ("Roadmap at a glance", "02"),
        ("MVP scope — on site, works offline", "03"),
        ("MVP scope — office, money and compliance", "04"),
        ("MVP release gate and pilot metrics", "05"),
        ("Deliberately out of the MVP", "06"),
        ("Release 2 — Paid MVP", "07"),
        ("Release 3 — Operations and money", "08"),
        ("Release 4 — Demand-gated expansion", "09"),
        ("How the next item is chosen", "10"),
    ],
}

# ── section 2: MVP, field ────────────────────────────────────────────────────
MVP_FIELD = [
    ("Site management ~CUJ-1~",
     "Create and edit sites · address and map pin · geofence radius · supervisor and "
     "project-manager assignment · status of planned, active, paused, completed or archived"),
    ("Worker registry ~CUJ-1~",
     "Worker code, name, phone, trade and labour group · assignment to sites · daily or "
     "monthly pay type · effective-dated wage rates · import through CSV or XLSX"),
    ("Attendance and site visits ~CUJ-2~",
     "Session-based check-in: timestamp, approximate location, accuracy and geofence result are "
     "captured once, on the session · marking is then one tap per worker for present, absent "
     "or overtime · half-day, leave, holiday, exact overtime hours and per-worker notes sit "
     "behind a per-row menu · running totals stay visible · an outside-geofence attempt "
     "needs a reason or manager review · corrections keep both original and proposed values"),
    ("Daily site reports ~CUJ-3~",
     "Site, date and reporting supervisor · headcount by trade · work completed · "
     "progress estimate or completed quantity · materials received and used · blockers "
     "and issues · safety incident flag · next-day plan · optional photos, which "
     "will never block a submission"),
    ("Basic materials ~CUJ-3~",
     "Materials defined per site · unit and low-stock threshold · opening balance, "
     "receipt, usage and adjustment · estimated balance · warning on a low or negative "
     "balance · a mandatory reason on every adjustment"),
    ("Offline synchronization ~CUJ-2, 3~",
     "Check-in and check-out, attendance, daily reports and basic material transactions will all "
     "work with no connectivity · the app will show pending, syncing, synced, failed, "
     "conflict and rejected · it will never show “submitted” before the server "
     "confirms · a repeated push will not create a duplicate record"),
]

# ── section 3: MVP, office ───────────────────────────────────────────────────
MVP_OFFICE = [
    ("Organization and access ~CUJ-1~",
     "Create an organization · set timezone, currency and default language · invite "
     "users · assign roles · assign supervisors and managers to sites · enforce "
     "organization-level and site-level access"),
    ("Wage summaries ~CUJ-4~",
     "Daily and monthly rates · approved attendance only · payable units · overtime "
     "and authorised adjustments · the calculation inputs shown, not just the result · "
     "weekly or monthly periods · lock and reopen through authorised actions · payment "
     "status · export"),
    ("Dashboard and approvals ~CUJ-5~",
     "Active sites · missing attendance · missing daily reports · pending approvals "
     "· geofence exceptions · attendance corrections · estimated wage totals · "
     "material alerts · critical blockers · safety flags · latest site updates"),
    ("Reports and audit ~CUJ-5, 6~",
     "CSV and Excel exports for attendance, wage summary, daily reports, material "
     "transactions and balances, and site activity and exceptions, with exported figures "
     "always matching what the app shows · a full export of a customer's own data on exit · "
     "an audit trail of user and role changes, site and geofence changes, attendance "
     "corrections, wage-rate changes, material adjustments, approvals and rejections, and "
     "wage-period lock and reopen events"),
    ("Data retention and deletion ~CUJ-6~",
     "Removing a user or a worker will never delete their history, and old records will "
     "still show who created them · a finished site can be archived and becomes read-only · "
     "deactivating a user, worker or site will remove access, not history · attendance and "
     "wage records retained a minimum of three years, with a worker inside that floor "
     "anonymised rather than deleted"),
]

# ── section 4: gates and metrics ─────────────────────────────────────────────
GATES = [
    ("Access and isolation",
     "An admin can create an organization, users, sites and workers. A supervisor sees only "
     "assigned sites. Row Level Security and role permissions pass positive and negative tests."),
    ("Field reliability",
     "Check-in and check-out capture location explicitly. Attendance saves offline and "
     "synchronizes later. Duplicate sync retries create no duplicate records. Sync failures are "
     "visible and recoverable."),
    ("Speed of the common path",
     "A normal daily report is completed in five minutes or less. Photos are optional and never "
     "block submission."),
    ("Data trust",
     "Wage summaries use approved attendance only. Payroll periods lock and reopen by authorised "
     "roles. CSV and XLSX exports match in-app values. Critical changes appear in the audit log."),
    ("Language",
     "English is complete. Hindi and Marathi translation support is enabled technically, even "
     "though the translations themselves are later scope."),
    ("Compliance ~blocks real worker data~",
     "A privacy notice and worker-data consent step are shown before worker data entry. The "
     "retention and deletion policy is implemented, not only documented. A DPA and Terms of "
     "Service are executed with each pilot customer."),
    ("Operational readiness",
     "A database backup has been restored at least once as a rehearsal, before the first "
     "customer's data is entered. Pilot users work without direct developer assistance after "
     "onboarding."),
]
METRICS = [
    ("Sites with same-day attendance and report", "80% of active sites, five days a week"),
    ("Daily report completion time", "Five minutes or less for a normal report"),
    ("Supervisor activity", "60% or more still active after two weeks"),
    ("Offline sync success", "99% or more of queued records eventually sync"),
    ("Wage preparation time", "50% faster than the customer's current process"),
    ("Paid continuation", "At least 3 of 5 pilot customers"),
]

# ── section 5: exclusions ────────────────────────────────────────────────────
EXCLUDED = [
    ("Worker self-service login", "Release 4", "Only if workers repeatedly ask supervisors for their own record."),
    ("UPI wage payments", "Release 4", "Moving money brings regulatory scope the pilot does not need."),
    ("WhatsApp or SMS delivery", "Not planned", "Pilot invites will be sent by hand as a copied link."),
    ("Purchase orders and vendor management", "Release 3 ~candidate~",
     "Moved out of this list on purpose once owner spend became part of the product."),
    ("Stock transfer between sites", "Not planned", "No pilot demand recorded."),
    ("Full expense management", "Release 3 ~candidate~", "Would arrive as site spend, under the owner threshold."),
    ("Gantt charts and advanced scheduling", "Release 4", "Only if customers plan labour more than a day ahead."),
    ("BIM or design tools", "Not planned", "Outside the operations problem BuildFlow solves."),
    ("Accounting, GST or statutory payroll integrations", "Release 3 and 4",
     "Accounting-ready exports in Release 3; a Tally or GST integration only on demand."),
    ("AI summaries", "Not planned", "Adds no trust to a record an owner must rely on."),
    ("Continuous employee location tracking", "Not planned",
     "Location will be captured once per session, on an explicit action, and never continuously."),
    ("Social or photo-sharing features", "Not planned", "Not an operations need."),
    ("Procurement marketplace", "Not planned", "A different business, not a later feature."),
]

# ── section 6: Release 2 ─────────────────────────────────────────────────────
RELEASE2 = [
    ("Billing and plans",
     "A per-organization monthly subscription billed in INR, tiered by active-site count: a small "
     "band for 2–5 sites, a mid band for 6–12, a top band for 13–20. Invoice "
     "generation. No per-export or per-photo charges, so pricing stays as simple as the product."),
    ("In-app notifications",
     "One list per user of what is waiting for them, so an approval is not missed because nobody "
     "opened the dashboard."),
    ("Statutory exports",
     "A muster-roll export per site and period on the Form XIV pattern, for BOCW Act "
     "recordkeeping, and a statutory wage register export for Payment of Wages Act "
     "recordkeeping. Held back from the MVP because no PRD P0 requires either, and the format "
     "needs a real customer's auditor to confirm it."),
    ("DPDP compliance review",
     "Appoint a grievance officer. Finalise the breach-notification runbook for 72-hour reporting "
     "to the Data Protection Board. Obtain counsel sign-off on the retention-versus-erasure "
     "exception the MVP relies on."),
    ("Hardening and scale",
     "Performance tuning, backup and recovery verification, and rate limiting."),
    ("Support and onboarding",
     "Admin training, guided setup and help documentation. Materials enabled selectively rather "
     "than for everyone at once."),
    ("Refined reporting",
     "Export formatting, scheduled exports and advanced filters."),
    ("Security review",
     "A penetration-test pass, and hardening of the consent and location audit."),
]

# ── section 7: Release 3 ─────────────────────────────────────────────────────
RELEASE3 = [
    ("Approvals and spend governance",
     "One request-and-decide path shared by every module that spends money or deletes something. "
     "An owner spend threshold, default ₹25,000, with a per-action override. At or below the "
     "line, approval is automatic and no request is raised at all; above it, only the owner may "
     "decide. Only the owner may move the line.",
     "Identity and access"),
    ("Projects and BOQ",
     "Projects sitting above sites. A priced bill of quantities held by version, work packages, "
     "and actual use recorded against the estimate so an owner can see estimate against actual.",
     "Sites, Materials"),
    ("Procurement and site spend",
     "Vendors, purchase orders with lines, full or partial delivery confirmation, site expenses "
     "captured in the field, and vendor payments. A purchase-order total will be summed from its "
     "lines and never accepted from the caller. Confirming a delivery will post one stock "
     "movement per delivered line.",
     "Approvals, Materials"),
    ("Property sales and collections",
     "Plots, bookings, booking receipts, brokers and broker payouts. A plot will hold only one "
     "live booking at a time, and a commission will not exceed what the booking owes or be paid "
     "on a cancelled sale.",
     "Approvals"),
    ("Financial reporting and exports",
     "Project budget and funding, project spend, labour cost attributed to projects in proportion "
     "to the approved attendance behind each wage line, profit and loss, and accounting-ready "
     "exports.",
     "Procurement, Payroll, Sales"),
]

# ── section 8: Release 4 ─────────────────────────────────────────────────────
RELEASE4 = [
    ("Worker self-service app", "Workers view their own attendance, wages and payslips.",
     "Workers repeatedly asking supervisors for their own record."),
    ("Push notifications", "Approvals, exceptions and reminders delivered to the device.",
     "In-app notifications proving too slow for time-critical approvals."),
    ("Advanced material management", "Suppliers and stock levels beyond the per-site ledger.",
     "Customers moving stock between sites."),
    ("Payments and wage disbursement", "Paying wages from inside the product, including UPI.",
     "Customers asking to pay from the product, and the regulatory work that follows."),
    ("Payroll and accounting integrations", "Tally and GST invoicing.",
     "Accountants re-keying BuildFlow exports into Tally."),
    ("Multi-language beyond English", "Hindi and regional languages fully translated.",
     "Supervisors unable to work in English."),
    ("Shift planning and scheduling", "Rosters and schedules set ahead of the day.",
     "Customers planning labour more than a day ahead."),
    ("Analytics dashboards", "Productivity and material wastage.",
     "Owners asking questions the exports cannot answer."),
]

# ── section 9: how the next item is chosen ───────────────────────────────────
PRIORITY = [
    ("Value to core user", "High", "Does it save field or owner time?"),
    ("Data trust impact", "High", "Does it strengthen auditability or accuracy?"),
    ("Build cost", "Medium", "Effort given the architecture already chosen."),
    ("Pilot demand signal", "Medium", "Have customers explicitly asked for it?"),
    ("Strategic fit", "Low", "Does it fit the long-term platform direction?"),
]
RISKS = [
    ("Offline sync data loss or conflict", "Outbox pattern, conflict resolution, sync test suite."),
    ("Low pilot adoption", "Design partners co-create scope; thin vertical slices; frequent feedback."),
    ("Location privacy pushback", "Consent-based, action-triggered location capture only."),
    ("Free-tier scaling limits", "A planned upgrade path to paid tiers."),
    ("Small-team bandwidth", "A modular monolith and free-first managed services."),
    ("Retention law against labour-law recordkeeping",
     "A documented retention exception, plus counsel review before paid launch."),
    ("Worker consent friction",
     "A one-time consent step at onboarding, with BuildFlow supplying the notice template."),
]
CADENCE = [
    "Weekly: an engineering demo and sync.",
    "Bi-weekly: a product decision review with design partners.",
    "Per release: an exit-criteria review before committing to the next one.",
    "Continuous: metric dashboards updated from product analytics and usage data.",
]

# ── pages ────────────────────────────────────────────────────────────────────
PAGES = [
    {
        "num": "02", "kicker": "Section 1", "title": "Roadmap at a Glance",
        "lead": "One release is the MVP, and it runs for sixteen weeks. Everything after it "
                "is a candidate: Release 2 is committed because the product must become "
                "billable, and Releases 3 and 4 are built only if customers ask.",
        "blocks": [
            ("diagram", r1(), "The release spine, with the MVP line drawn across it", 0.99),
            ("rulebar", [
                ("Offline-first is non-negotiable.", "A field feature ships only when it works with no connectivity."),
                ("Thinnest usable slice first.", "One complete workflow end to end before widening scope."),
                ("Data trust over breadth.", "Attendance and wages must be auditable before convenience features."),
                ("India-first.", "INR, local time, regional languages, phone-friendly auth, low bandwidth."),
                ("Free-first where practical.", "Managed free tiers until scale justifies paid infrastructure."),
            ], 5),
            ("note", "Weeks are counted from the start of the build, not from a calendar "
                     "date, because every release is gated by its exit criteria. Release 1 will "
                     "not be called complete until the core workflows run fully offline and sync "
                     "without data loss, 3–5 pilot contractors have used the product for at "
                     "least two weeks, the north-star metric is trending as expected, and no "
                     "critical defect remains. Release 2 will not start before that, and "
                     "Release 3 is not confirmed until the Release 2 gate is met."),
        ],
    },
    {
        "num": "03", "kicker": "Section 2", "title": "MVP Scope — On Site, Works Offline",
        "lead": "Weeks 1–16. These areas will ship in the private-pilot release. Every one is "
                "a P0 in the PRD, and every one will work with no connectivity.",
        "blocks": [
            ("diagram", r2(), "The eleven MVP areas, grouped by who uses them", 1.0),
            ("table", ["MVP area", "Features that will ship"], MVP_FIELD, ["20%", "80%"], "s"),
        ],
    },
    {
        "num": "04", "kicker": "Section 3",
        "title": "MVP Scope — Office, Money and Compliance",
        "lead": "Weeks 1–16, the same release. These are what an owner, project manager or "
                "accountant uses to review the record the field captured. Each is a PRD P0; "
                "nothing heavier than a P0 is in the MVP.",
        "blocks": [
            ("table", ["MVP area", "Features that will ship"], MVP_OFFICE, ["20%", "80%"], "s"),
            ("note", "Two limits are deliberate and will hold through the MVP. BuildFlow will not "
                     "transfer wages and will not give statutory payroll advice; it will produce "
                     "the summary an accountant pays from. And workers will have no login of "
                     "their own — the contractor enters and owns the worker record."),
        ],
    },
    {
        "num": "05", "kicker": "Section 4", "title": "MVP Release Gate and Pilot Metrics",
        "lead": "The pilot runs in weeks 13–16, and starts only when every gate below is met. "
                "The compliance gate blocks entering real worker data, not just launch.",
        "blocks": [
            ("twocol",
             [("h3", "Gates that must be met"),
              ("table", ["Gate", "What must be true"], GATES, ["27%", "73%"], "s")],
             [("h3", "Pilot success metrics"),
              ("table", ["Metric", "Target"], METRICS, ["52%", "48%"], "s"),
              ("note", "North-star metric: active sites with verified attendance and a completed "
                       "daily report on the same working day. Every other metric supports it."),
              ("note", "Pilot shape: 3–5 contractor companies, 5–10 active sites, "
                       "human-assisted setup and data import, with a weekly adoption and "
                       "reliability review and deliberate offline test days.")]),
        ],
    },
    {
        "num": "06", "kicker": "Section 5", "title": "Deliberately Out of the MVP",
        "lead": "These will not be built for the pilot. Each is listed with where it is planned, "
                "so an exclusion reads as a scheduling decision rather than a silent gap.",
        "blocks": [
            ("table", ["Excluded from the MVP", "Planned in", "Why it waits"],
             EXCLUDED, ["30%", "15%", "55%"], "s"),
            ("note", "One exclusion has been revisited on purpose. Purchase orders and vendor "
                     "management were excluded when the product was scoped as construction "
                     "execution only. Once the owner's money became part of the thinking, a "
                     "committed spend the owner never sees looked like a gap worth closing, so "
                     "they become a Release 3 candidate — not a commitment. The original "
                     "exclusion is kept on the record rather than quietly deleted."),
        ],
    },
    {
        "num": "07", "kicker": "Section 6", "title": "Release 2 — Paid MVP",
        "lead": "Weeks 17–28. Release 2 adds no new field capability. It makes what has "
                "already shipped billable, supportable and legally clean.",
        "blocks": [
            ("table", ["Workstream", "What will ship"], RELEASE2, ["22%", "78%"], "s"),
            ("note", "Release 2 will be complete when at least one design partner converts to a "
                     "paying customer, the billed cloud usage is covered by revenue, and the "
                     "support workload is sustainable for a small team."),
        ],
    },
    {
        "num": "08", "kicker": "Section 7", "title": "Release 3 — Operations and Money",
        "lead": "Release 3 is a candidate list, not committed scope. Nothing here is decided "
                "before a contractor has used the product. Each group is scoped far enough to "
                "estimate, and each will be confirmed or dropped at the Release 2 gate.",
        "blocks": [
            ("diagram", r3(), "How the candidate groups would fit together", 0.86),
            ("table", ["Capability group", "What it will add", "Depends on"],
             RELEASE3, ["20%", "60%", "20%"], "xs"),
        ],
    },
    {
        "num": "09", "kicker": "Section 8", "title": "Release 4 — Demand-Gated Expansion",
        "lead": "No window. Release 4 items are candidates, not commitments. Each will be "
                "adopted only after paying customers show real demand, and each is listed with "
                "the signal that would justify building it.",
        "blocks": [
            ("table", ["Candidate", "What it would add", "The signal that would justify it"],
             RELEASE4, ["24%", "38%", "38%"], "s"),
            ("note", "Anything that does not strengthen the MVP promise in an upcoming release "
                     "will be deferred. The promise is that a supervisor can capture the "
                     "essential site record even without internet, and an owner can trust the "
                     "resulting data enough to make a decision."),
        ],
    },
    {
        "num": "10", "kicker": "Section 9", "title": "How the Next Item Is Chosen",
        "lead": "Priority will be decided by score rather than by argument, and every release is "
                "gated by its own exit criteria. The risks below are the ones that would change "
                "the plan.",
        "blocks": [
            ("twocol",
             [("h3", "Prioritisation"),
              ("table", ["Criterion", "Weight", "The question it answers"],
               PRIORITY, ["32%", "18%", "50%"], "s"),
              ("h3", "Review cadence"),
              ("rules", CADENCE)],
             [("h3", "Risks that would change the plan"),
              ("table", ["Risk", "Mitigation"], RISKS, ["40%", "60%"], "s")]),
        ],
    },
]
