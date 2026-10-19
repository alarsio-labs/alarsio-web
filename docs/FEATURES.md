# Features — the single source of scope

**This file decides what is in the MVP.** If a feature is not here, it is not in
scope. A PR that adds a feature must update this file in the same PR.

Status: `⬜ not started` · `🟡 in progress` · `✅ done` · `⛔ blocked`

---

## The nine MVP modules

| # | Module | Owner | Status | What it owns |
| :-- | :-- | :-- | :-- | :-- |
| 1 | **Identity & Access** | Ishant | 🟡 | `organizations`, `profiles`, `memberships`, `invites` |
| 2 | **Sites** | Manish | 🟡 | `sites`, `site_assignments` |
| 3 | **Workforce** | Ishant | 🟡 | `workers`, `worker_site_assignments`, `worker_wage_rates` |
| 4 | **Attendance & Site Presence** | Manish | 🟡 | `site_visits`, `attendance_days`, `attendance_entries`, `attendance_corrections` |
| 5 | **Daily Reporting** | Anuradha | ⬜ | `daily_reports`, `daily_report_revisions`, `report_photos` |
| 4 | **Attendance & Site Presence** | Manish | ⬜ | `site_visits`, `attendance_days`, `attendance_entries`, `attendance_corrections` |
| 5 | **Daily Reporting** | Anuradha | 🟡 | `daily_reports`, `daily_report_revisions`, `report_photos` |
| 6 | **Materials & Inventory** | Nikhil | 🟡 | `materials`, `material_transactions` |
| 7 | **Wage Summaries** | Ishant + Manish | ⬜ | `wage_periods`, `wage_lines` |
| 8 | **Offline Sync** | Nikhil | 🟡 | device SQLite outbox, `sync_push` |
| 9 | **Audit, Retention & Guards** | Anuradha | 🟡 | `audit_log`, `purge_log`, `rate_limit_counters` |

---

## Build order

Dependencies decide this, not preference. **Do not start a module before the ones
it depends on publish their interface.**

### Weeks 1–2 · Foundation
Everything depends on these. Nothing else starts cleanly until they exist.

- [ ] Monorepo + Turborepo running, CI green on an empty app — *all four*
- [ ] **Identity & Access** — org, membership, 4 roles, RLS predicates — *Ishant*
- [ ] **Sites** — sites, geofence, supervisor assignment — *Manish*
- [ ] **Audit, Retention & Guards** — the generic audit trigger — *Anuradha*
- [x] Mobile app shell + test harness — *Nikhil*

### Weeks 3–6 · Field capture
These do not touch each other's tables, so they run in parallel.

- [ ] **Workforce** — workers, wage rates, CSV import — *Ishant*
- [ ] **Attendance & Site Presence** — check-in, geofence, roster, corrections — *Manish*
- [ ] **Daily Reporting** — report, photos, blockers, safety flag — *Anuradha*
- [ ] **Materials & Inventory** — stock ledger, balances, alerts — *Nikhil*
- [ ] **Offline Sync** — outbox, `sync_push`, per-record verdicts — *Nikhil*

### Weeks 7–8 · Close the loop

- [ ] **Wage Summaries** — approved attendance → wage summary — *Ishant + Manish*
- [ ] Dashboard and attendance-day approval — *Manish + Anuradha*
- [ ] CSV exports — *Anuradha*
- [ ] Hardening, offline test day, pilot readiness — *all four*

---

## Feature detail by module

Each row is a P0 from `docs/PRD.md`. Tick it only when it is merged **and** tested.

### 1 · Identity & Access
- [ ] Create an organisation with name, timezone, currency (INR)
- [ ] Sign in with email + password and a verification link
- [ ] Invite a team member by email or copyable link
  *Database side in #42: `invites`, `create_invite`, `accept_invite`, `revoke_invite` (ADR-019). Unticked until the web pages (#52) run end to end against a real project.*
- [x] Four roles enforced by RLS: `owner`, `project_manager`, `supervisor`, `accountant`
- [x] A supervisor sees only sites assigned to them

### 2 · Sites
- [x] Create and edit a site: name, address, map pin, geofence radius
- [x] Assign and unassign supervisors
- [x] Site status: planned, active, paused, completed, archived
- [x] An archived site is read-only

### 3 · Workforce
- [x] Add a worker: name, trade, pay type, rate
- [ ] Bulk import workers from CSV or Excel, keyed on worker code
- [x] Effective-dated wage rates — never overwrite, always add
- [x] Assign workers to sites

*Attendance reads the roster through `worker_roster` (migration `20261017110000`, renamed from a duplicate version in #44). No row changes.*

### 4 · Attendance & Site Presence
- [ ] Check in and check out; location captured only on that tap
- [x] Outside the geofence asks for a reason, never silently accepts
- [ ] Mark everyone present in one tap, then change exceptions
- [x] Half-day, leave, overtime hours, per-worker note
- [ ] A correction keeps the old value, the new value and the reason
- [ ] Manager approves or rejects a day

*Database side of capture is in #28 (ADR-021): `site_visits` with the geofence, `attendance_days`,
`attendance_entries` and `mark_all_present`. Two rows are ticked because the database refuses the
bad case and stores the values (tested). "Check in and check out" stays unticked because location
captured only on that tap is device behaviour, and "mark everyone present in one tap" because the
tap is a screen and offline mark-all is phone code. Corrections, review and the approved-day lock
are the next PR.*

### 5 · Daily Reporting
- [ ] File a report: headcount pre-filled, work done, blockers, safety flag, next-day plan
- [ ] Save as an offline draft
- [x] Photos optional, and never blocking submission
- [x] A submitted report cannot be changed quietly — edits keep history
- [x] Serious blockers flagged to managers on submit (in-app flag only; no push, email or SMS)

*Server side of offline filing is in place (#63, ADR-022): `sync_daily_reports` and
`sync_report_photos` take a report, its edits and its photos from `sync_push`. "Save
as an offline draft" is ticked when the phone's report screen ships.*

### 6 · Materials & Inventory
- [x] Define materials per site with unit and low-stock threshold
- [x] Record opening balance, receipt, usage, adjustment
- [x] Running balance computed server-side
- [x] Warn on low or negative stock; a reason is mandatory on adjustment

### 7 · Wage Summaries
- [ ] Weekly or monthly period, using **approved attendance only**
- [ ] Shows rate, payable days, overtime, adjustments, total — nothing hidden
- [ ] Export to CSV and Excel, matching what the app shows
- [ ] Accountant locks a period; **only the owner reopens**, with a reason

### 8 · Offline Sync
- [ ] Every field write saves locally first, with a device-generated id
- [x] Outbox keyed on (entity, record_id)
- [ ] Status shown: pending, syncing, synced, failed, conflict, rejected
- [ ] Never shows "submitted" before the server confirms
- [ ] A repeated push creates no duplicate
- [ ] One bad record does not block the rest of its batch

*Server router `sync_push` is in place (#33): envelope, per-record verdicts and the
rate limit, tested with stand-in handlers. The rows above get ticked when the real
entity handlers are wired in week 5.*

### 9 · Audit, Retention & Guards
- [ ] One generic trigger writing `audit_log` across every privileged table
- [x] Audit log is append-only
- [x] Removing a user or worker never deletes history
- [x] Audit log readable by the owner only; retention purge with a 3-year floor, logged in `purge_log`
- [x] Per-user rate limit (`enforce_rate_limit`) for `sync_push` and invites
- [ ] A customer can export all of their own data

---

## Explicitly NOT in the MVP

Do not build these. See `docs/PRD.md` §6.7 for the full list and reasoning.

Approvals engine · Procurement and purchase orders · Projects and BOQ ·
Property sales and bookings · Financial reporting and P&L · Punch list ·
Notifications · Statutory registers · Worker self-service login · UPI payments ·
WhatsApp/SMS · Accounting integrations · AI summaries

**If an issue asks for one of these, close it and link to this section.**
