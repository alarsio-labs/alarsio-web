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
- [x] **Audit, Retention & Guards** — the generic audit trigger — *Anuradha*
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
  *Web sign-in merged (#51); mobile sign-in in #56 (ADR-026). Unticked until both run end to end against the team project (#58).*
- [ ] Invite a team member by email or copyable link
  *Database side in #42: `invites`, `create_invite`, `accept_invite`, `revoke_invite` (ADR-019). Unticked until the web pages (#52) run end to end against a real project.*
- [x] Four roles enforced by RLS: `owner`, `project_manager`, `supervisor`, `accountant`
- [x] A supervisor sees only sites assigned to them

### 2 · Sites
- [x] Create and edit a site: name, address, map pin, geofence radius
- [x] Assign and unassign supervisors
- [x] Site status: planned, active, paused, completed, archived
- [x] An archived site is read-only

*Sites also publishes the read-only views other modules read it through: `site_geofence` (ADR-021)
and `site_directory` (ADR-025), plus `site_details` (#49, ADR-028), which the phone's offline mirror
will read once #71 stops reading `sites` directly. No row is ticked for it: it adds no user feature.*

### 3 · Workforce
- [x] Add a worker: name, trade, pay type, rate
- [ ] Bulk import workers from CSV or Excel, keyed on worker code
  *Import page in #57 (ADR-027). Pay type is locked once a rate exists and a blank phone keeps the stored one (ADR-011 W11, W12). Unticked until it runs against the team project (#58).*
- [x] Effective-dated wage rates — never overwrite, always add
- [x] Assign workers to sites

*An accountant reads the organisation's workers, so rates have names (ADR-011 W10).*

*Attendance reads the roster through `worker_roster` (migration `20261017110000`, renamed from a duplicate version in #44). No row changes.*

### 4 · Attendance & Site Presence
- [ ] Check in and check out; location captured only on that tap
- [x] Outside the geofence asks for a reason, never silently accepts
- [ ] Mark everyone present in one tap, then change exceptions
- [x] Half-day, leave, overtime hours, per-worker note
- [x] A correction keeps the old value, the new value and the reason
- [ ] Manager approves or rejects a day

*Database side of capture is in #28 (ADR-021): `site_visits` with the geofence, `attendance_days`,
`attendance_entries` and `mark_all_present`. Two rows are ticked because the database refuses the
bad case and stores the values (tested). "Check in and check out" stays unticked because location
captured only on that tap is device behaviour, and "mark everyone present in one tap" because the
tap is a screen and offline mark-all is phone code.*

*Corrections, review and the approved-day lock are in #28 PR 2 (ADR-030). "A correction keeps the
old value, the new value and the reason" is ticked: `attendance_review_test.sql` proves the database
stamps the old value, stores the new one and a mandatory reason, and never lets the row be edited,
except the one review move, or deleted. "Manager approves or rejects a day" stays unticked:
`review_attendance_day` and the lock (an approved day's entries change 0 rows, a late write raises
`PS409`) are tested, but the row is a manager's action and the web screen (#80) does not exist.*

*The published views are in #28 PR 3a (ADR-032): `approved_attendance_days`, which Wage Summaries
(#61) reads, and `site_exceptions`, the reviewer's list. `attendance_views_test.sql` proves both, and
that an accountant reads every approved day of their organisation and nothing open or rejected. No
row above names a view, so none is ticked by this PR. The four sync handlers are PR 3b.*

### 5 · Daily Reporting
- [ ] File a report: headcount pre-filled, work done, blockers, safety flag, next-day plan
- [ ] Save as an offline draft
- [x] Photos optional, and never blocking submission
- [x] A submitted report cannot be changed quietly — edits keep history
- [x] Serious blockers flagged to managers on submit (in-app flag only; no push, email or SMS)

*Managers read, filter and review reports on the web (#74, ADR-025): `/reports` lists
`daily_report_status` with flagged reports first, and `/reports/<id>` shows the report, its
edit history and photos, and calls `review_daily_report`. This is the surface for the
"flagged to managers" row above; no row changes because the database rules were already
tested. The pages need a run against a real project.*

*Server side of offline filing is in place (#63, ADR-022): `sync_daily_reports` and
`sync_report_photos` take a report, its edits and its photos from `sync_push`. "Save
as an offline draft" is ticked when the phone's report screen ships.*

### 6 · Materials & Inventory
- [x] Define materials per site with unit and low-stock threshold
- [x] Record opening balance, receipt, usage, adjustment
- [x] Running balance computed server-side
- [x] Warn on low or negative stock; a reason is mandatory on adjustment

*These rows are the database side (ADR-015, ADR-017), which `sync_push` and the web already use.
The manager's page, `/materials` (#82), defines and edits materials and shows balances and
alerts; the unit is fixed once a material exists. The phone's record screen is still to come
(#82, after the pull in #71), so a supervisor cannot record stock from the phone yet.*

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

*The replay and poison-record rows stay unticked until all seven entities are
wired. ADR-014 ties the no-duplicate guarantee to every handler, and calls for a
shared handler contract test that does not exist yet. The four Attendance entities
have no handler, so pushing one returns `retryable_error: handler_unavailable`
(Attendance's PR 3b, #28). Not yet run against the team Supabase project (#58).*

*Proof so far, in `supabase/tests`, with the real handlers unless stated:*
- *Whole batch pushed twice, same answer, nothing written the second time:
  `materials_ledger_test` only.*
- *Daily Reporting is proven one record at a time (`sync_daily_reports_test`: a
  replayed draft, a replayed edit, a replay after losing the site).
  `sync_report_photos_test`: a photo sent before its report gets
  `retryable_error: missing_parent` and stores nothing, and report plus photo in one
  batch are both accepted.*
- *One bad record, real handler: the mixed batch in `sync_daily_reports_test`
  stores its two good reports and refuses the bad ones. The mixed batch in
  `materials_ledger_test` has no accepted record, so it is not poison-record proof.*
- *A handler that wrote a row and then failed is rolled back: proven with stand-in
  handlers only (`sync_push_test`), which also covers replay and one verdict per
  record at the router.*
- *On the phone: `outbox.test.ts` ("keeps one row per record…", "turns each verdict
  into its status") and `sender.test.ts` ("applies a mix of verdicts record by
  record").*

*To tick both rows: Attendance's handlers with their own replay and poison tests,
and one contract test that runs the same checks over all seven handlers.*

*The home screen shows the signed-in user's sync status (#68): counts, an honest
sync line that never says "submitted", the conflict and rejected records with their
reason, and Sync now. "Status shown" and "Never shows submitted" stay unticked until
the capture screens show each record's own status.*

### 9 · Audit, Retention & Guards
- [x] One generic trigger writing `audit_log` across every privileged table
- [x] Audit log is append-only
- [x] Removing a user or worker never deletes history
- [x] Audit log readable by the owner only; retention purge with a 3-year floor, logged in `purge_log`
- [x] Per-user rate limit (`enforce_rate_limit`) for `sync_push` and invites
- [ ] A customer can export all of their own data

*Audit coverage is proven, not assumed (#72, ADR-024): `audit_coverage_test.sql` fails
CI if any table except the three logs lacks `write_audit()` after every row change, and
`schema_guards_test.sql` does the same for RLS, invoker views, pinned definer functions,
client delete grants and anon grants.*
*The owner export is in place (#76, ADR-026): `/export` downloads one ZIP of a CSV per
table, read under the owner's RLS and rate-limited to 5 an hour (`export_org_data`).
`tables.test.ts` and `data_export_test.sql` prove every table is listed and readable.
Unticked until a download runs end to end against the team project (#58), as with invites.*

---

## Explicitly NOT in the MVP

Do not build these. See `docs/PRD.md` §6.7 for the full list and reasoning.

Approvals engine · Procurement and purchase orders · Projects and BOQ ·
Property sales and bookings · Financial reporting and P&L · Punch list ·
Notifications · Statutory registers · Worker self-service login · UPI payments ·
WhatsApp/SMS · Accounting integrations · AI summaries

**If an issue asks for one of these, close it and link to this section.**
