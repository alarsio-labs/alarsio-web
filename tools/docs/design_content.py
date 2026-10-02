# -*- coding: utf-8 -*-
"""Content of the BuildFlow Technical Design Document.

This module holds the document text and structure only. It contains no HTML and
no DOCX code, so the same content renders to both:

    design_pdf.py   -> docs/buildflow-technical-design.pdf
    design_docx.py  -> docs/buildflow-technical-design.docx

The document is written as a pre-implementation blueprint. Every statement
describes what the architecture defines and what will be built, not what exists.

A diagram block may carry a fourth item: its width as a fraction of the text
column. A diagram that is the only block on its page is fitted to the page
instead, so the fraction then applies to the DOCX only.

Inline markup used in the strings below:
    `name`    monospace (a table, function or view name)
    ~word~    small grey tag (used for the "platform" marker)
Write a plain "&" — each renderer escapes for its own format.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from diagrams import d1, d2_mvp, d3, d4, d5, d6   # noqa: E402

OUT_STEM = "buildflow-technical-design"
DOC_TITLE = "BuildFlow Modular Monolith Architecture"
DOC_SUBTITLE = "Technical Design Document"
FOOTER = "BuildFlow — Modular Monolith Architecture · Technical Design Document"

# Planned wording for the two diagram strings that would otherwise read as built.
D1 = d1(counts="MVP: ~24 tables · ~10 views", mvp=True)
D3 = d3(note="They will go through narrow SECURITY DEFINER functions that check the caller "
             "themselves. The service-role key will be used nowhere in application code.")

# ── cover ────────────────────────────────────────────────────────────────────
COVER = {
    "eyebrow": "Technical Design Document · Pre-Implementation",
    "title": "BuildFlow",
    "title_em": "Modular Monolith Architecture",
    "lede": "BuildFlow will be a construction operations platform. This document defines the "
            "architecture before implementation begins. It fixes the module boundaries, states "
            "what each module will own, and defines the interfaces through which modules will "
            "reach each other. It also draws the MVP line: nine modules will be built for the "
            "private pilot, and no MVP module depends on one that is not yet built.",
    "stats": [
        ("9", "modules in the MVP", "6 business, 3 platform"),
        ("7", "modules deferred", "Release 2 and later"),
        ("4", "roles in the MVP", "owner, PM, supervisor, accountant"),
        ("RLS", "authorization boundary", "enforced in the database"),
    ],
    "toc": [
        ("Architectural approach and system architecture", "02"),
        ("Module boundaries", "03"),
        ("Module dependencies", "04"),
        ("Domain and database ownership", "05"),
        ("Cross-module communication", "06"),
        ("Module interfaces", "07"),
        ("Identity, authorization and shared infrastructure", "08"),
        ("Offline and mobile architecture", "09"),
        ("Key workflows, rules and build sequence", "10"),
    ],
}

# ── section 2: module boundaries ─────────────────────────────────────────────
MVP_MODULES = [
    ("Identity & Access ~platform~", "Will hold organisations, members, roles and invites.",
     "organizations, profiles, memberships, invites"),
    ("Sites", "Will hold sites and assign supervisors and managers to them.",
     "sites, site_assignments"),
    ("Workforce", "Will hold workers, their wage rates and their consent records.",
     "workers, worker_site_assignments, worker_wage_rates"),
    ("Attendance & Site Presence", "Will record check-in, the daily roster and corrections.",
     "site_visits, attendance_days, attendance_entries, attendance_corrections"),
    ("Daily Reporting", "Will record the daily site report, its blockers and its safety flag.",
     "daily_reports, daily_report_revisions, report_photos"),
    ("Materials & Inventory", "Will keep the stock ledger and compute balances and alerts.",
     "materials, material_transactions"),
    ("Wage Summaries", "Will turn approved attendance into a wage summary.",
     "wage_periods, wage_lines"),
    ("Offline Sync ~platform~", "Will move field writes to the server exactly once.",
     "device SQLite: outbox and 8 mirror tables"),
    ("Audit, Retention & Guards ~platform~",
     "Will record privileged changes and enforce retention and rate limits.",
     "audit_log, purge_log, rate_limit_counters"),
]
LATER_MODULES = [
    ("Projects & BOQ", "Projects above sites, a priced estimate by version, and actual use.",
     "Release 3", "Sites, Materials"),
    ("Approvals & Spend Governance", "The shared request-and-decide path and the spend threshold.",
     "Release 3", "Identity & Access"),
    ("Procurement & Site Spend", "Vendors, purchase orders, deliveries, expenses and payments.",
     "Release 3", "Approvals, Materials"),
    ("Property Sales & Collections", "Plots, bookings, receipts, brokers and broker payouts.",
     "Release 3", "Approvals"),
    ("Financial Reporting & Exports", "Project budget and funding, project spend, and P&L.",
     "Release 3", "Procurement, Wages, Sales"),
    ("Punch List", "Defects tracked beyond the blocker field on the daily report.",
     "Release 4", "Daily Reporting"),
    ("Notifications & Inbox ~platform~", "One list of what is waiting for each user.",
     "Release 2", "Attendance, Reporting"),
]

# ── section 4: domain and database ownership ─────────────────────────────────
OWNERSHIP = [
    ("Organisation and people", "Identity & Access", "organizations, memberships, invites", "—"),
    ("Work containers", "Sites", "sites, site_assignments", "site_timeline"),
    ("Labour supply", "Workforce", "workers, worker_wage_rates", "worker_retention_status"),
    ("Site presence and labour record", "Attendance & Site Presence",
     "site_visits, attendance_days, attendance_entries", "attendance_day_summary, site_exceptions"),
    ("Site record", "Daily Reporting", "daily_reports, report_photos", "daily_report_status"),
    ("Stock", "Materials & Inventory", "materials, material_transactions",
     "material_balances, material_alerts"),
    ("Labour cost", "Wage Summaries", "wage_periods, wage_lines", "wage_summary"),
    ("Field reliability", "Offline Sync", "device outbox", "—"),
    ("Accountability and retention", "Audit, Retention & Guards",
     "audit_log, purge_log, rate_limit_counters", "—"),
]

# ── section 5: cross-module communication ────────────────────────────────────
COMMS = [
    ("Every MVP module", "Identity & Access", "Permission check inside an RLS policy",
     "Decide which rows a user may see or change"),
    ("Every MVP module", "Audit, Retention & Guards", "One generic trigger across the MVP tables",
     "Record every privileged change"),
    ("Offline Sync", "Attendance, Reporting, Materials", "Direct insert from `sync_push`",
     "Field capture; these tables will be append-only"),
    ("Attendance, Workforce", "Sites", "Foreign key to `sites`, checked by `has_site_access`",
     "A record will always belong to one site"),
    ("Daily Reporting", "Attendance", "Device-local read of the day's roster",
     "Headcount will be pre-filled rather than retyped"),
    ("Wage Summaries", "Attendance, Workforce", "Direct read of approved days and rates",
     "Wages will come from approved days only"),
]
LATER_COMMS = [
    ("Procurement, Property Sales, Projects & BOQ", "Approvals", "Will call `request_approval()`",
     "Release 3"),
    ("Approvals", "Procurement, Sales, Projects & BOQ", "Direct update behind a session flag",
     "Release 3"),
    ("Offline Sync", "Procurement & Site Spend", "Named function, never a direct insert",
     "Release 3"),
    ("Procurement", "Materials & Inventory", "One stock row per delivered line", "Release 3"),
    ("Materials", "Projects & BOQ", "Trigger on material use", "Release 3"),
    ("Financial Reporting", "Procurement, Wage Summaries, Sales", "Reads of published views",
     "Release 3"),
]

# ── section 6: module interfaces ─────────────────────────────────────────────
INTERFACES = [
    ("Identity & Access",
     "`is_org_member` · `is_org_owner` · `has_site_access` · `can_record_on_site` · "
     "`can_review_site` · `can_view_wages` · `create_invite` · `accept_invite`", "—"),
    ("Sites", "`archive_site`", "`site_timeline` · `sites.id`"),
    ("Workforce", "`import_workers` · `anonymize_worker`",
     "`worker_retention_status` · effective wage rate"),
    ("Attendance & Site Presence", "`review_attendance_day` · `review_attendance_correction`",
     "approved `attendance_days` · `site_exceptions`"),
    ("Daily Reporting", "`review_daily_report`", "`daily_report_status`"),
    ("Materials & Inventory", "`apply_material_transaction`",
     "`material_balances` · `material_alerts`"),
    ("Wage Summaries",
     "`calculate_wage_period` · `lock_wage_period` · `reopen_wage_period`",
     "`wage_summary`"),
    ("Offline Sync", "`sync_push(batch)`", "—"),
    ("Audit, Retention & Guards",
     "`write_audit` · `enforce_rate_limit` · `purge_expired_non_statutory`", "—"),
]

# ── section 7: roles and shared infrastructure ───────────────────────────────
ROLES = [
    ("owner", "Everything, on every site. Only an owner may grant the owner role, and only an "
              "owner may reopen a locked wage period."),
    ("project_manager", "Reviews and approves site work. Manages sites and workers. May not read "
                        "wage amounts."),
    ("supervisor", "Records work on assigned sites. Sees no wage data."),
    ("accountant", "Builds and exports wage summaries. May lock a wage period, not reopen one."),
]
LATER_ROLES = [
    ("admin", "Release 2", "Organisation administration delegated from the owner."),
    ("director", "Release 3", "Read-only visibility across every site."),
    ("site_engineer", "Release 3", "A review tier between supervisor and manager."),
]
INFRA = [
    ("Identity & Access",
     "Four roles, membership, and the named permission checks every RLS policy will call."),
    ("Offline Sync",
     "One RPC carrying seven entity types from the phone, returning a verdict per record."),
    ("Audit, Retention & Guards",
     "One audit trigger across every MVP table, a retention purge, and per-organisation rate "
     "limits."),
]

# ── section 8: offline write routing ─────────────────────────────────────────
SYNC = [
    ("Direct insert ~MVP~",
     "`site_visits` · `attendance_days` · `attendance_entries` · `attendance_corrections` · "
     "`daily_reports` · `report_photos` · `material_transactions`",
     "These eight tables will be append-only, or safe to repeat on the same device id."),
    ("Named function ~Release 3~", "`site_expenses` · `purchase_orders` · `po_deliveries`",
     "Money must pass the spend threshold, so the phone will call the same function the web does. "
     "No money entity reaches the phone in the MVP."),
]

# ── section 9: rules and build sequence ──────────────────────────────────────
RULES = [
    "One writer per table. To change another module's data, call that module's function.",
    "No MVP module may call, join to or read a module from a later release.",
    "Keep ledgers append-only. Every guard must still allow customer offboarding.",
    "Depend downward. A new arrow pointing up is a decision, not a shortcut.",
    "Read another module only through a published view, and keep the view `security_invoker`.",
    "Keep `sync_push` a thin router. Logic placed there will run only on phones.",
    "Name every permission check. No policy should compare a role inline.",
    "Add a role only when a user cannot do their job without it. The MVP has four.",
]
PHASES = [
    ("Step 1 ~MVP~", "Foundation", "Identity & Access · Audit, Retention & Guards · Sites"),
    ("Step 2 ~MVP~", "Field capture",
     "Workforce · Attendance · Daily Reporting · Materials · Offline Sync"),
    ("Step 3 ~MVP~", "Close the loop", "Wage Summaries · dashboard and approvals · exports"),
    ("The MVP line", "Private pilot runs here, then the gate",
     "Release 2, then Release 3 — nothing below starts first"),
]

# ── pages ────────────────────────────────────────────────────────────────────
PAGES = [
    {
        "num": "02", "kicker": "Section 1",
        "title": "Architectural Approach and System Architecture",
        "lead": "The system will be built as one deployment over one PostgreSQL database. The code "
                "will be divided into modules, of which nine will be built for the MVP. Two clients will "
                "use the same backend, and every "
                "request will run as the signed-in user.",
        "blocks": [("diagram", D1, "System architecture", 0.90)],
    },
    {
        "num": "03", "kicker": "Section 2", "title": "Module Boundaries",
        "lead": "Nine modules will be built for the MVP. Each will own its tables and be "
                "entered only by name. Seven more are defined so the boundaries hold later.",
        "blocks": [
            ("h3", "The nine MVP modules"),
            ("table", ["Module", "Responsibility", "Tables it will own"], MVP_MODULES,
             ["19%", "36%", "45%"], "xs"),
            ("h3", "Deferred — defined, not built for the pilot"),
            ("table", ["Module", "What it will add", "Release", "Will depend on"], LATER_MODULES,
             ["20%", "48%", "13%", "19%"], "xs"),
        ],
    },
    {
        "num": "04", "kicker": "Section 3", "title": "Module Dependencies",
        "lead": "An arrow means one module will need another. Each arrow will be a named call, "
                "a join, a trigger or a foreign key — nothing else. Every arrow below stays "
                "inside the MVP set, so nothing waits on a module that will not be built.",
        "blocks": [
            ("diagram", d2_mvp(), "Dependencies inside the MVP"),
            ("rulebar", [
                ("Dependencies point downward.", "Identity, then Sites, then field capture, then wages."),
                ("No MVP module looks ahead.", "Nothing in the MVP calls a module from a later release."),
                ("Review stays inside its module.", "Attendance and Daily Reporting each approve their own records."),
                ("One shared approval engine waits.", "It arrives in Release 3, with the first money that needs it."),
            ], 4),
        ],
    },
    {
        "num": "05", "kicker": "Section 4", "title": "Domain and Database Ownership",
        "lead": "Each business area will have exactly one owning module. No table will be owned by "
                "two modules.",
        "blocks": [
            ("table", ["Business area", "MVP module", "Tables it will own",
                       "Views it will publish"],
             OWNERSHIP, ["20%", "20%", "32%", "28%"], "s"),
            ("note", "All tables will live in one `public` schema. Ownership will be a rule the team "
                     "follows, held in place by narrow entry points and review rather than by "
                     "separate schemas. Every view will be `security_invoker`, so a view will never "
                     "expose more than its underlying tables allow."),
        ],
    },
    {
        "num": "06", "kicker": "Section 5", "title": "Cross-Module Communication",
        "lead": "Modules will communicate in five ways only. Every path will be synchronous: "
                "no message queue, no event bus, no second service.",
        "blocks": [
            ("diagram", d5(planned=True), "The five permitted mechanisms"),
            ("h3", "Inside the MVP — every path that will exist at pilot"),
            ("table", ["From", "To", "Mechanism", "Purpose"], COMMS,
             ["18%", "20%", "29%", "33%"], "xs"),
            ("h3", "Deferred paths, listed so the MVP does not pre-build them"),
            ("table", ["From", "To", "Mechanism", "Arrives in"], LATER_COMMS,
             ["25%", "24%", "33%", "18%"], "xs"),
        ],
    },
    {
        "num": "07", "kicker": "Section 6", "title": "Module Interfaces",
        "lead": "Each module will expose a fixed surface: the functions other modules may call, and "
                "the views other modules may read. Nothing outside this list will be reachable "
                "across a boundary.",
        "blocks": [
            ("table", ["Module", "Functions it will expose", "Views it will publish"],
             INTERFACES, ["19%", "51%", "30%"], "xs"),
            ("note", "Nothing outside these lists will be reachable across a boundary. The same "
                     "rule will hold for the deferred modules when they arrive: the spend tables "
                     "of Release 3 will carry no insert policy at all, so a named function will "
                     "be the only way in."),
        ],
    },
    {
        "num": "08", "kicker": "Section 7",
        "title": "Identity, Authorization and Shared Infrastructure",
        "lead": "Row Level Security will be the authorization boundary. It will run inside "
                "PostgreSQL, so every client will get the same answer.",
        "blocks": [
            ("diagram", D3, "How a request will be authorized"),
            ("twocol",
             [("h3", "Four roles in the MVP"),
              ("table", ["Role", "What it may do"], ROLES, ["26%", "74%"], "s"),
              ("note", "Each role will be verified by running every operation as every role "
                       "against the database before the module is accepted.")],
             [("h3", "Shared infrastructure"),
              ("table", ["Platform module", "What it will provide"], INFRA, ["34%", "66%"], "s"),
              ("h3", "Roles deferred"),
              ("table", ["Role", "Arrives in", "Why it waits"], LATER_ROLES,
               ["26%", "22%", "52%"], "s")]),
        ],
    },
    {
        "num": "09", "kicker": "Section 8", "title": "Offline and Mobile Architecture",
        "lead": "The mobile app will work with no signal. Every write will be stored on the device "
                "first and sent later.",
        "blocks": [
            ("diagram", d4(), "The offline write path"),
            ("table", ["How the record will be written", "Entities carried by sync_push", "Why"],
             SYNC, ["18%", "48%", "34%"], "s"),
            ("note", "Pull will need no custom code: PostgREST already serves the cursor protocol "
                     "under Row Level Security. Only push will need code, and it will be a "
                     "PostgreSQL function rather than a second service to deploy."),
        ],
    },
    {
        "num": "10", "kicker": "Section 9",
        "title": "Key Workflows, Architecture Rules and Build Sequence",
        "lead": "Three paths will cross module boundaries end to end — one in the MVP, two "
                "later. The rules keep those boundaries intact, and the build sequence orders "
                "the work so no module begins before the ones it depends on.",
        "blocks": [
            ("diagram", d6(mvp=True), "Three workflows, and the release that delivers each", 0.72),
            ("twocol",
             [("h3", "Rules for keeping the boundary"), ("rules", RULES)],
             [("h3", "Build sequence"), ("phases", PHASES)]),
        ],
    },
]
