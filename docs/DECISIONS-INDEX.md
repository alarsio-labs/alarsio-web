# Decision index

One line per ADR in `docs/DECISIONS.md`: read this, then only the ADRs the issue cites.
Add a line here in the same PR that adds the ADR. `pnpm preflight` fails when a heading
in `DECISIONS.md` has no line here, or the status differs. The module column is a
judgment, not a field in the ADR; "Platform" means it spans the repo.

ADR-034 is used twice (Sites web, and Attendance on the phone). Both are listed as written.

| ADR | Title | Status | Module |
| :-- | :-- | :-- | :-- |
| ADR-001 | Monorepo with Turborepo | Accepted | Platform |
| ADR-002 | Supabase, with RLS as the authorization boundary | Accepted | Platform |
| ADR-003 | Four roles, not seven | Accepted | Identity & Access |
| ADR-004 | Email sign-in first, phone OTP later | Accepted | Identity & Access |
| ADR-005 | Rebuild rather than port | Accepted | Platform |
| ADR-006 | Identity schema: enum role, org bootstrap function, owner-only writes | Proposed | Identity & Access |
| ADR-007 | Sites schema, and Identity's predicates reading Sites | Proposed | Sites |
| ADR-008 | audit_log shape, and write_audit() as the only writer | Proposed | Audit, Retention & Guards |
| ADR-009 | sync_push verdicts, and what the phone shows for each | Proposed | Offline Sync |
| ADR-010 | Mobile shell: device database behind an interface, tested on sql.js | Proposed | Offline Sync |
| ADR-011 | Workforce schema: split wage rates, append-only, anonymize instead of delete | Accepted | Workforce |
| ADR-012 | Audit guards: owner-only read, per-user rate limit, 3-year retention floor | Proposed | Audit, Retention & Guards |
| ADR-013 | Daily reports: draft, submit, edit with history, review is final | Proposed | Daily Reporting |
| ADR-014 | sync_push envelope, handler contract and failure rules | Proposed | Offline Sync |
| ADR-015 | Materials: fixed units, a unit that never changes, warn on negative stock | Proposed | Materials & Inventory |
| ADR-016 | The device outbox: one row per record, dirty edits, backoff, recovery | Proposed | Offline Sync |
| ADR-017 | The stock ledger: one writer, replay before permission, warn-only alerts | Proposed | Materials & Inventory |
| ADR-018 | The sync sender: transport seam, signed-in only, one run at a time | Proposed | Offline Sync |
| ADR-019 | Invites: link grants access, 72-hour expiry, owners may invite owners | Accepted | Identity & Access |
| ADR-020 | Outbox rows belong to their author; only that user's session sends them | Proposed | Offline Sync |
| ADR-021 | Attendance capture: one visit row, geofence in the database, days keyed by site and date | Proposed | Attendance & Site Presence |
| ADR-022 | Daily Reporting sync handlers: update in place, replay before permission | Proposed | Daily Reporting |
| ADR-023 | Pull: full refresh into mirrors owned by one user, through published views only | Proposed | Offline Sync |
| ADR-024 | Schema guards: the non-negotiables are checked in CI, test-only | Proposed | Audit, Retention & Guards |
| ADR-025 | Web review of daily reports: site names through a Sites view, no author names, no new write | Proposed | Daily Reporting |
| ADR-026 | Owner data export: every table read under the owner's RLS, one ZIP of CSVs | Proposed | Audit, Retention & Guards |
| ADR-027 | Worker import: the file is read in the browser, with read-excel-file | Accepted | Workforce |
| ADR-028 | Sites publishes site_details, the full site record for the offline mirror | Proposed | Sites |
| ADR-029 | Sync status belongs to one user, and never says more than it has read | Proposed | Offline Sync |
| ADR-030 | Attendance corrections, day review and the approved-day lock | Proposed | Attendance & Site Presence |
| ADR-031 | Mobile sign-in: one gate in the layout, offline-safe session, no sign-up on the phone | Accepted | Identity & Access |
| ADR-032 | Attendance publishes approved days and site exceptions; wage readers see every approved day | Proposed | Attendance & Site Presence |
| ADR-033 | Attendance sync handlers: replay before permission, the lock answered in the handler | Proposed | Attendance & Site Presence |
| ADR-034 | Sites web, part 1: list, create, edit, status and archive, with no new database surface | Proposed | Sites |
| ADR-034 | Attendance on the phone, PR 1: check in and out, offline, with the location read on the tap | Proposed | Attendance & Site Presence |
| ADR-035 | Wage Summaries: a snapshot per period, one day per worker per date, locked means frozen | Proposed | Wage Summaries |
| ADR-036 | Daily report on the phone, PR 1: drafts and submits through the outbox, a reason for every change after submit | Proposed | Daily Reporting |
| ADR-037 | Report photos on the phone: compress to JPEG, metadata through the outbox, the file after it is accepted | Proposed | Daily Reporting |
| ADR-038 | Daily report headcount pre-filled from the day's attendance on the phone | Proposed | Daily Reporting |
| ADR-039 | Web review of attendance: one list, one detail page, no new write, and a self-review gap the database does not close | Proposed | Attendance & Site Presence |
| ADR-040 | Nobody reviews a day they recorded or a correction they proposed, checked in the review functions | Proposed | Attendance & Site Presence |
| ADR-041 | The owner's overview: every site for one day, from published views only | Proposed | Daily Reporting |
| ADR-042 | A manager sends a daily report back with a reason; the author resubmits it with one | Proposed | Daily Reporting |
| ADR-043 | The overview reads a sent-back report as filed, and fails on a row it cannot read | Proposed | Daily Reporting |
| ADR-044 | Identity publishes org_member_names(): names and roles for managers, as a function | Proposed | Identity & Access |
| ADR-045 | Preflight: local checks and only the gates the changed files need | Proposed | Platform |
| ADR-046 | Sites web, part 2: assign and remove supervisors through the existing grants, names through org_member_names | Proposed | Sites |
| ADR-047 | Materials on the phone: record a movement offline, and show an estimate beside the server balance | Proposed | Materials & Inventory |
| ADR-048 | Attendance on the phone, PR 2: the day register, offline, with the approved day learned from the server's answer | Proposed | Attendance & Site Presence |
| ADR-049 | The phone holds a mirror of approved attendance days, paged by an entry id the view now publishes | Proposed | Offline Sync |
