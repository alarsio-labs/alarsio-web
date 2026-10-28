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
| 7 | **Wage Summaries** | Ishant + Manish | 🟡 | `wage_periods`, `wage_lines`, `wage_line_days`, `wage_adjustments`, `wage_period_reopens` |
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
  *Web sign-in merged (#51); mobile sign-in in #56 (ADR-031). Unticked until both run end to end against the team project (#58).*
- [ ] Invite a team member by email or copyable link
  *Database side in #42: `invites`, `create_invite`, `accept_invite`, `revoke_invite` (ADR-019). Unticked until the web pages (#52) run end to end against a real project.*
  *`org_member_names()` (ADR-044) lists members' names and roles for managers, for Sites web (#78). No row changes.*
- [x] Four roles enforced by RLS: `owner`, `project_manager`, `supervisor`, `accountant`
- [x] A supervisor sees only sites assigned to them

### 2 · Sites
- [x] Create and edit a site: name, address, map pin, geofence radius
- [x] Assign and unassign supervisors
- [x] Site status: planned, active, paused, completed, archived
- [x] An archived site is read-only

*Web screens for the first, third and fourth rows (list, create, edit, status, archive behind a confirm
step) are in #78 PR 1 (ADR-034). The ticks above come from the database suites and are unchanged: the
screens are covered by unit tests of their actions and input rules, and have not been run against a real
Supabase project. Assigning and unassigning supervisors from the web, with the assignment history, is the
second half of #78 (ADR-046): it reads names through `org_member_names()` (ADR-044), the second row's
tick is unchanged, and the screen is covered by unit tests only.*

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
`PS409`) are tested, but the row is a manager's action; its web screen is #80 (ADR-039, below).*

*The published views are in #28 PR 3a (ADR-032): `approved_attendance_days`, which Wage Summaries
(#61) reads, and `site_exceptions`, the reviewer's list. `attendance_views_test.sql` proves both, and
that an accountant reads every approved day of their organisation and nothing open or rejected. No
row above names a view, so none is ticked by it.*

*The four sync handlers are in #28 PR 3b (ADR-033), which closes #28. `sync_attendance_test.sql`
proves the server side of offline capture. "Check in and check out; location captured only on that
tap" and "Mark everyone present in one tap" stay **unticked**, because both need the phone screens
(#79).*

*Nobody reviews a day they recorded or a correction they proposed (#80 AC 3, ADR-040): both review
functions answer `42501`. `attendance_self_review_test.sql` makes a supervisor a project manager and
proves the refusals and that other reviewers still work. "Manager approves or rejects a day" stays
**unticked**: the web screen (PR #100) has not been driven against a real Supabase project.*
*The web review is #80 (ADR-039): `/attendance` lists what needs a look and `/attendance/[id]` shows a
day with its entries, exceptions and corrections, where an owner or project manager approves or rejects
it and each pending correction through the two published functions. Unit tests and action tests with a
mocked client prove the filters, the ordering, the rules for drawing a button (not the page itself), the
reason rules and the SQLSTATE messages. "Manager approves or rejects a day" stays **unticked**: the screen has not been driven against a
real Supabase project. "Nobody reviews a day they recorded" is enforced by both functions since #101
(ADR-040, above), not only by hidden buttons.*
*The phone's check-in and check-out are in #79 PR 1 (ADR-034): the sites list, the location permission
flow, the geofence estimate, the outbox save and the per-record status, with `SiteAttendanceScreen.test.tsx`
and `attendance-offline.test.ts` (airplane mode, end to end, with a fake transport). "Check in and check
out; location captured only on that tap" stays **unticked** on purpose: the tests use a fake location
provider, and the phone's real permission prompt and GPS have not run on a device against the team project
(#58).*
*The day register is #79 PR 2 (ADR-048): mark everyone present, per-worker exceptions, corrections on an approved
day, the approved day read-only once the server has said so, and a late edit shown as needs attention, through
the outbox, with `register-store.test.ts` (airplane mode, end to end). "Mark everyone present in one tap" stays
**unticked**: it has not run on a device or against the team project (#58).*
*The approved-day mirror is #127 (ADR-049): the phone copies the last 7 days of `approved_attendance_days`
(which now ends with `entry_id`), so an approved day is read-only before the first edit and a worker with
no local entry shows the server's approved status. The `locked` answer still covers a phone that has not
pulled. `pull.test.ts`, `register-store.test.ts` and `DayRegisterScreen.test.tsx` cover it, and
`attendance_views_test.sql` covers the new column. No row changes: "Mark everyone present in one tap" and
"Manager approves or rejects a day" stay **unticked** until smoke tests S8 and S9 (`docs/DEPLOY.md`) pass
against the team project (#58), after the `entry_id` migration is pushed.*

### 5 · Daily Reporting
- [ ] File a report: headcount pre-filled, work done, blockers, safety flag, next-day plan
- [ ] Save as an offline draft
- [x] Photos optional, and never blocking submission
- [x] A submitted report cannot be changed quietly — edits keep history
- [x] Serious blockers flagged to managers on submit (in-app flag only; no push, email or SMS)
- [ ] A manager approves or sends back a report, with a comment
  *PRD P0, CUJ-5. Added with #114 (ADR-042). Before this, a manager could only mark a report reviewed (ADR-013 R5).
  `daily_reports_send_back_test.sql` proves who may send back, the reason rules, that a reviewed report stays
  final, and that only the author resubmits, with a reason and a revision naming the send-back.
  `sync_daily_reports_test.sql` proves a push with no reason never resubmits it (`conflict` / `sent_back`).
  The web's Send back form and the phone's resubmit have unit tests. Unticked: the web screen has not been driven
  against the team project (#58), and the phone learns of a send-back only when it next pushes that report,
  because there is no report pull (#49).*

*Managers read, filter and review reports on the web (#74, ADR-025): `/reports` lists
`daily_report_status` with flagged reports first, and `/reports/<id>` shows the report, its
edit history and photos, and calls `review_daily_report`. This is the surface for the
"flagged to managers" row above; no row changes because the database rules were already
tested. The pages need a run against a real project.*

*Server side of offline filing is in place (#63, ADR-022): `sync_daily_reports` and
`sync_report_photos` take a report, its edits and its photos from `sync_push`.*

*The phone's report screens are in #81 PR 1 (ADR-036). `report-store.test.ts` and
`DailyReportScreen.test.tsx` prove a draft is saved to the outbox with no network, found again as
typed after the app reopens, and never shown as submitted before the server accepts it. "Save as
an offline draft" stays unticked until it runs on a phone against the team project (#58), as
Attendance's check-in row does (ADR-034). "File a report" also needs the headcount pre-filled
(next note).*

*The headcount pre-fill is in #109 (ADR-038). `headcount.test.ts`, `report.test.ts` and
`DailyReportScreen.test.tsx` prove a new report opens with the number of the user's own workers present
or on a half day for that site and day, says where it came from, keeps a saved report's own number,
counts nothing of another user's or a rejected entry, and is typed when the phone holds no attendance.
"File a report" stays **unticked**: no phone screen writes attendance entries until #79 PR 2
(mark-all, ADR-034 D2), and it has not run on a phone against the team project (#58).*

*The phone takes report photos in #105 (ADR-037). "Photos optional, and never blocking submission" was already
ticked for the database; `photo-store.test.ts`, `photo-upload.test.ts` and `DailyReportPhotos.test.tsx` now prove the
phone side: a photo is compressed and saved with no network, the report saves and submits whatever the photos' state,
the file uploads only after its metadata is accepted and only under its author's session, and "On the server" is shown
only once the file is up. Not run on a phone or against the team project (#58), where the bucket policy is checked.*

*The owner's overview is in #112 (ADR-041), the dashboard half of the week 7–8 "Dashboard and attendance-day
approval" line. `/overview` shows every site for one day: report filed or not with its headcount, serious blocker
and safety badges, the day's attendance state, geofence flags, visits not closed, pending corrections and low
stock, sorted so what needs action comes first. It reads only published views. `overview_reads_test.sql` proves
what each read returns for every role and another organisation; `lib/overview/*.test.ts` prove the rows, the
order and the counts. That line stays **unticked**: the PRD's estimated wages are left out (ADR-041 D7), and the
page has not been driven against the team project (#58). No row above changes.*

*A sent-back report is shown on `/overview` as "Report sent back" (#116, ADR-043). #115 added the status after the page
was built, and the page dropped the row, so the site read "Report not filed". A sent-back report now counts as filed,
has its own "Reports sent back" tile, is not "waiting for a review", and ranks with what needs a look. A row the page
cannot read now fails the page instead of being dropped. `lib/overview/*.test.ts` and section 4 of
`overview_reads_test.sql` prove it. No row above changes.*

### 6 · Materials & Inventory
- [x] Define materials per site with unit and low-stock threshold
- [x] Record opening balance, receipt, usage, adjustment
- [x] Running balance computed server-side
- [x] Warn on low or negative stock; a reason is mandatory on adjustment

*These rows are the database side (ADR-015, ADR-017), which `sync_push` and the web already use.
The manager's page, `/materials` (#82), defines and edits materials and shows balances and
alerts; the unit is fixed once a material exists.*

*The phone's record screen is in #82 PR 2 (ADR-047). A supervisor picks a site, then a material, and
records opening, receipt, usage or adjustment with no signal. It is saved to the outbox first and shown
as an estimate (the server balance at the last pull plus what that user has recorded since), never as
the balance; "On the server" appears only once the server accepted the entry. Below zero and at or
under the low-stock level are warnings that never stop a save. `movement.test.ts`, `estimate.test.ts`,
`movement-store.test.ts`, `materials-offline.test.ts` (the real outbox and sender, a fake network) and
the two screen tests cover it. No row above changes: the rows are the server side, and this screen has
not run on a phone or against the team project (#58).*

### 7 · Wage Summaries
- [x] Weekly or monthly period, using **approved attendance only**
- [ ] Shows rate, payable days, overtime, adjustments, total — nothing hidden
- [ ] Export to CSV and Excel, matching what the app shows
- [x] Accountant locks a period; **only the owner reopens**, with a reason

*The database side is ADR-035 and `wages_test.sql`: periods, calculation from `approved_attendance_days`, `worker_rate_on` and the
worker's pay type (read through Workforce's `worker_pay_basis`), lock (only after the period has ended), reopen with history,
adjustments (at most 10 lakh rupees either way), overtime capped at 8 paid hours a date across sites, and zero rows for a
project manager and a supervisor. No row's wording changed with the review follow-ups (#111), so none is ticked or unticked by them.
The pages are `/wages` and `/wages/[period]`. "Shows rate, payable days, overtime, adjustments, total" stays unticked
until it is seen on a screen against the team project (#58), and so does the export row: `lib/wages/summary.test.ts`
proves the CSV and Excel carry the screen's figures to the paisa (the Excel file is read back by `read-excel-file`),
but no file has been opened in Excel itself yet.*

### 8 · Offline Sync
- [ ] Every field write saves locally first, with a device-generated id
- [x] Outbox keyed on (entity, record_id)
- [ ] Status shown: pending, syncing, synced, failed, conflict, rejected
- [ ] Never shows "submitted" before the server confirms
- [x] A repeated push creates no duplicate
- [x] One bad record does not block the rest of its batch

*The replay and poison-record rows are ticked by the handler contract test (#107, ADR-014):
`sync_contract_test.sql` runs the same checks over all seven handlers through `sync_push`.
Each entity's record pushed twice is accepted twice and stored once; a whole batch of all
seven pushed twice writes nothing the second time; an empty record (the missing-fields case)
between two good ones is rejected with a reason and leaves no row, while both good ones are
stored; and a single record with each field broken in turn gets a fixed code with no database
detail in the response. ADR-014 tied the no-duplicate guarantee to every handler, and all
seven now have one (Attendance's in #28 PR 3b, ADR-033). A bad record of any other kind is
checked one record at a time, not inside a batch. It has not run against the team Supabase
project (#58).*

*Proof so far, in `supabase/tests`, with the real handlers unless stated:*
- *Whole batch pushed twice, same answer, nothing written the second time:
  `materials_ledger_test` only.*
- *Daily Reporting is proven one record at a time (`sync_daily_reports_test`: a
  replayed draft, a replayed edit, a replay after losing the site).
  `sync_report_photos_test`: a photo sent before its report gets
  `retryable_error: missing_parent` and stores nothing, and report plus photo in one
  batch are both accepted.*
- *Attendance is proven one record at a time (`sync_attendance_test`): a replay
  writes nothing, a second phone with the same values is accepted, an edit or late
  entry on an approved day is `conflict: locked`, and a replay after unassignment is
  accepted.*
- *One bad record, real handler: the mixed batch in `sync_daily_reports_test`
  stores its two good reports and refuses the bad ones. The mixed batch in
  `materials_ledger_test` has no accepted record, so it is not poison-record proof.*
- *A handler that wrote a row and then failed is rolled back: proven with stand-in
  handlers only (`sync_push_test`), which also covers replay and one verdict per
  record at the router.*
- *On the phone: `outbox.test.ts` ("keeps one row per record…", "turns each verdict
  into its status") and `sender.test.ts` ("applies a mix of verdicts record by
  record").*

*Attendance's handlers also have their own replay and poison tests (`sync_attendance_test.sql`
[3.03] to [7.08] and [8.12]); the contract test above covers all seven handlers alike.*

*The home screen shows the signed-in user's sync status (#68): counts, an honest
sync line that never says "submitted", the conflict and rejected records with their
reason, and Sync now. "Status shown" and "Never shows submitted" stay unticked until
the capture screens show each record's own status.*

*A write to a record a manager has already approved is answered `conflict` / `locked` by
`sync_push` (SQLSTATE `PS409`, from Attendance's approved-day lock, #96), so a stale phone
shows it for review instead of retrying for ever. No Attendance handler exists yet (#28,
PR 3b), so no row above changes.*

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
