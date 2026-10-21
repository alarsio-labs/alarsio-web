# Decision log

Every non-obvious choice gets a row here, in the PR that makes it. Future-you and
new teammates read this to understand *why*, not *what*.

**Format:** one block per decision. Never delete a decision — supersede it.

---

## ADR-001 · Monorepo with Turborepo
**Date:** 2026-10-02 · **Status:** Accepted · **By:** team

**Context.** Web, mobile and database change together. Separate repos mean a
feature spans three PRs that can merge out of order.

**Decision.** One repository, pnpm workspaces, Turborepo for task running and caching.

**Consequences.** One PR per feature. Turbo caching keeps CI fast. Cost: everyone
clones everything, and Expo needs Metro configured for a monorepo.

---

## ADR-002 · Supabase, with RLS as the authorization boundary
**Date:** 2026-10-02 · **Status:** Accepted · **By:** team

**Context.** A four-person team for eight weeks cannot build and secure a custom
API server as well as the product.

**Decision.** Supabase for Postgres, Auth, Storage and PostgREST. Authorization
lives in Row Level Security on every table and view. The service-role key is used
nowhere in application code.

**Consequences.** Every client gets the same answer because the rule is in the
database. Privileged writes need narrow `SECURITY DEFINER` functions that check
the caller themselves.

---

## ADR-003 · Four roles, not seven
**Date:** 2026-10-02 · **Status:** Accepted · **By:** team

**Context.** The previous build defined seven roles plus an `is_founder` check
that was not in the role list, and documents disagreed on who approved spending.

**Decision.** Four roles only: `owner`, `project_manager`, `supervisor`,
`accountant`. A fifth requires a new ADR.

**Consequences.** Simpler policies, fewer test combinations. `admin`, `director`
and `site_engineer` are deferred.

---

## ADR-004 · Email sign-in first, phone OTP later
**Date:** 2026-10-02 · **Status:** Accepted · **By:** team

**Context.** Phone OTP in India needs a contracted SMS provider and DLT template
registration under TRAI rules — a third-party dependency with weeks of lead time.

**Decision.** MVP ships email + password with a verification link, and invites by
copyable link. Phone OTP is a post-MVP item.

**Consequences.** Onboarding never blocks on SMS delivery. Supervisors type an
email, which is slightly worse UX; we accept that for the pilot.

---

## ADR-005 · Rebuild rather than port
**Date:** 2026-10-02 · **Status:** Accepted · **By:** team

**Context.** A working previous version exists, built mostly by one person, with
known structural problems listed in `docs/IMPROVEMENTS.md`.

**Decision.** Build fresh. Use the old repo as a reference for *what* the product
does, never for *how*. Do not copy code.

**Consequences.** Slower start, better boundaries, and four people who understand
the system instead of one.

---

## ADR-006 · Identity schema: enum role, org bootstrap function, owner-only writes
**Date:** 2026-10-09 · **Status:** Proposed · **By:** Ishant

**Context.** Week 1 needs `organizations`, `profiles` and `memberships` plus the
`is_org_member` / `is_org_owner` predicates, and the docs fix no columns.

**Decision.** `memberships.role` is a Postgres enum `app_role` of the four roles, so
a fifth role needs a migration and an ADR (ADR-003). Organizations are created only
through `create_organization()`, a `SECURITY DEFINER` function that makes the caller
the first owner; there is no insert policy. Only owners write `memberships`. Column
grants limit updates (`role`; `name`, `timezone`; `full_name`), so ids, `org_id`,
`user_id` and `currency` are immutable. No table grants delete to anyone. `profiles`
are readable only by their own user in week 1. Predicates are revoked from `anon`,
so an anonymous call raises a permission error instead of returning false.

**Consequences.** Simple, testable policies and no way to self-promote. Costs: teammate
names are not visible until a published view or function exposes them; an owner can
demote the last owner (a last-owner guard is not in week 1); membership removal in week 6
will need a narrow function because there is no delete grant.

---

## ADR-007 · Sites schema, and Identity's predicates reading Sites
**Date:** 2026-10-09 · **Status:** Proposed · **By:** Manish (review: Ishant)

**Context.** Sites is the first table most modules point at, so its shape spreads.
Two things also cut across modules. Identity's `memberships` names its org column
`org_id` while our docs said `organization_id`. And `has_site_access(site_id)`, an
Identity predicate, must read `site_assignments` to know which sites a supervisor
holds — an arrow from Identity up to Sites.

**Decision.**
- Organisation foreign keys are named `org_id` everywhere, matching `memberships`.
- `has_site_access` may read `site_assignments`. This is the one permitted upward
  read. Migration order is: Identity tables → Sites tables → Identity predicates →
  Sites policies.
- Geofence radius is whole metres, 50–2000, default 200. Coordinates are
  `numeric(9,6)`, range-checked in the database.
- Status is `text` + `CHECK`, not an enum: planned, active, paused, completed,
  archived. Moves among the first four are free; `archived` is terminal and is
  reached only through `archive_site()`, which is idempotent and closes open
  assignments.
- Address is one text field. Site names are unique per organisation, ignoring case,
  archived sites included.
- Sites and assignments are never deleted. Unassigning closes the row
  (`unassigned_at`); the assignee must be a member of the site's organisation,
  enforced by foreign key. Any member may be assigned in the MVP.

**Consequences.** History of who held a site, and when, survives every change.
Organisation membership is checked by the database, not by code. Cost: Sites cannot
apply its policies until Identity ships its predicates, so the two modules' migrations
interleave; an archived site cannot be restored without a new decision; and limiting
assignment to supervisors needs a new Identity predicate later.

---

## ADR-008 · audit_log shape, and write_audit() as the only writer
**Date:** 2026-10-09 · **Status:** Proposed · **By:** Anuradha

**Context.** Every module must attach one generic audit trigger to the tables it
owns (issue #4). The trigger has to work on tables with and without `org_id`
(`profiles` has none; `organizations` *is* the org), with or without a signed-in
actor, and must never let a client rewrite history.

**Decision.**
- `audit_log` columns: `id` (bigint identity), `table_name`, `row_id uuid`,
  `operation` (`INSERT` / `UPDATE` / `DELETE`), `actor_id` (`auth.uid()`, nullable,
  no foreign key), `org_id` (nullable), `old_data` / `new_data` (jsonb), `occurred_at`
  (transaction time). A check ties which of old/new is present to the operation.
- `org_id` is the row's `org_id`; for `organizations` it is the row's own `id`; for
  tables with neither, null. It is stored now so a later read policy needs no backfill.
- `write_audit()` is `SECURITY DEFINER`, `search_path = public`, and executable by no
  client role. It refuses to run unless attached `AFTER … FOR EACH ROW`, and refuses
  a table with no `id`, so it can never write a row for a change that did not happen.
- `audit_log` has RLS on, no policies and no grants: closed to every client. A
  `block_audit_log_mutation` trigger rejects `UPDATE`, `DELETE` and `TRUNCATE` even
  for the table owner.

**Consequences.** One row per changed row, provably, and no client can read, forge or
erase one. Costs: every audited table must have a uuid `id`; nobody can read the log
until a read policy or published function is decided; an `UPDATE` that sets a value to
itself is still recorded; and the retention purge (week 2) — and customer offboarding —
will need their own decision on how they get past the guard.

---

## ADR-009 · sync_push verdicts, and what the phone shows for each
**Date:** 2026-10-12 · **Status:** Proposed · **By:** Nikhil

**Context.** `sync_push` answers every record a phone sends, and the app shows that
answer to a supervisor, so the words are a contract every field module codes
against (build plan, week 2). The docs disagreed on one of them: the build plan says
`retry`, `docs/ARCHITECTURE.md` and the technical design say `retryable_error`. Nothing
said which phone status each answer becomes, or what a replayed record gets back.

**Decision.**
- `sync_push` returns exactly one verdict **per record**, never one per batch. The four
  words are `accepted` · `conflict` · `rejected` · `retryable_error`, matching
  `docs/ARCHITECTURE.md`. `retry` is not used anywhere.
  - `accepted` — the server holds this record. This includes a record it already had:
    a replay of the same `(entity, record_id)` with the same content is `accepted`
    again and creates nothing.
  - `conflict` — the server holds something the phone may not overwrite: the same
    `(entity, record_id)` with different content, or a record that targets one a
    manager has already approved. The server keeps its version.
  - `rejected` — this record will never succeed as sent: invalid input, an unknown
    entity, or a permission check that says no. It carries a reason code and is not
    retried.
  - `retryable_error` — nothing was written and sending again may work: rate limit,
    lock timeout, or an unexpected server error. If the whole batch is refused (for
    example by the rate limit), every record in it gets `retryable_error`.
- `record_id` is a uuid made on the phone and becomes the row's `id` on the server
  (ADR-008 already requires a uuid `id` on every audited table). That id is what
  makes a replay harmless.
- The phone shows six statuses, mapped from the outbox and the verdict:

  | Phone status | When |
  | :-- | :-- |
  | `pending` | saved on the phone, not sent yet |
  | `syncing` | in a batch that has not been answered |
  | `synced` | verdict `accepted` |
  | `failed` | verdict `retryable_error`; stays in the outbox and is sent again |
  | `conflict` | verdict `conflict`; kept on the phone and shown for review |
  | `rejected` | verdict `rejected`; shown with its reason |

  The app says "submitted" only for `synced`.
- Identity comes from `auth.uid()`. A device id in the request is for logging only and
  is never trusted as identity.
- `sync_push` stays a thin router: it checks the envelope, then hands each record to
  its owning module. How each module receives a record is a separate decision, to be
  agreed with Attendance and Daily Reporting before week 5.

**Consequences.** Every field module knows the four outcomes it must produce, and the
app has one place that turns them into words. A replay is always safe. Costs: each
owning module must tell "same content" from "different content" for its own records to
choose between `accepted` and `conflict`; the list of reason codes for `rejected` still
has to be written down in the week 2 spec; and nothing here settles the module handler
contract.

---

## ADR-010 · Mobile shell: device database behind an interface, tested on sql.js
**Date:** 2026-10-12 · **Status:** Proposed · **By:** Nikhil

**Context.** Every field module will keep records on the phone, and IMPROVEMENTS #6
says the mobile app must be tested from week 1. Jest cannot load `expo-sqlite`, because
it is native code. Mocking it would test our SQL against nothing. A native SQLite library
for Node needs a C++ build, which is fragile on Windows, and CI runs on Node 20.

**Decision.**
- All on-device SQL goes through `DeviceDb` (`apps/mobile/src/db/device-db.ts`):
  `exec`, `run`, `all` and `transaction`. The app implements it with `expo-sqlite`;
  Jest implements it with in-memory **sql.js** (SQLite compiled to WebAssembly), so
  tests execute the real SQL.
- The device schema changes only through numbered migrations (1, 2, 3 …, no gaps),
  tracked in `PRAGMA user_version`. Each one runs in a transaction with its version
  bump. Shipped migrations are never edited.
- Each connection turns on `foreign_keys` and WAL before migrating.
- Navigation uses `expo-router`, with routes in `apps/mobile/src/app/`.
- Until `packages/config` lands (Ishant is creating it, see #14), mobile uses Expo's
  own eslint and tsconfig, plus `no-explicit-any` as an error.

**Consequences.** Other modules write their mobile SQL against one interface and get
real SQL tests for free. Costs: sql.js is not byte-for-byte the SQLite build on the
phone, so anything version-specific still needs a check on a device; `transaction`
uses our own BEGIN/COMMIT, which, like `withTransactionAsync`, can pull in a query
started outside it; and the shell has no app-wide database handle yet, which the
outbox work adds.

---

## ADR-011 · Workforce schema: split wage rates, append-only, anonymize instead of delete
**Date:** 2026-10-16 · **Status:** Accepted · **By:** Ishant (review: Manish, on #23)

*First merged as a second ADR-010; renumbered. Migration comments that say
"ADR-010" for Workforce mean this one.*

**Context.** Attendance points at workers, and Wage Summaries reads rates, so the shape
spreads (issue #23). Rates are also the one thing a supervisor must never read, while
the same supervisor needs the roster to mark attendance.

**Decision.**
- W1. Pay type is `daily` or `hourly`, as `text` + `CHECK`. Overtime pay belongs to
  Wage Summaries.
- W2. Rates live in `worker_wage_rates`, apart from `workers`, so RLS can close them
  with `can_view_wages(org_id)` (owner and accountant) while `workers` stays readable
  by the roster rule. A rate is `numeric(12,2)` rupees, greater than zero.
- W3. Rates are effective-dated and append-only: a new rate is a new row, there is no
  UPDATE or DELETE grant, and two rates cannot start on the same day. Owner and
  accountant may add one (`can_view_wages`). `worker_effective_rates` (security
  invoker) and `worker_rate_on(worker, date)` are how others read them.
- W4. The worker code is chosen by the contractor and unique per organisation,
  ignoring case. It and `org_id` cannot be changed after creation.
- W5. Personal data is a name and an optional phone. One worker row per organisation.
- W6. Nothing is deleted. `status` retires a worker; `anonymize_worker()` clears the
  name and phone, closes open assignments, and is terminal. Assignments close
  (`unassigned_at`), as in Sites, and a closed one is never reopened.
- W7 (extended by W9, W10). The roster rule is `has_worker_access(worker)`: owner and project_manager
  across the org, anyone with `has_site_access` to a site the worker is assigned to.
  It is private to Workforce; other modules read a view.
- W8. `import_workers(org, rows)` is `SECURITY INVOKER`, keyed on code, at most 1000
  rows, one result per row. It takes the organisation as an argument because a user
  may belong to several.
- W9. Attendance reads the roster only through `worker_roster` (security
  invoker): one row per assignment, open and closed, with worker code, name,
  trade and status, and no rates. So a closed row keeps its name,
  `has_worker_access` also counts a closed assignment at a site the caller can
  access: a supervisor sees everyone ever rostered at their site, no one else.
- W10. An accountant reads the full `workers` row of every worker in their
  organisation, including phone (personal data, DPDP), pay type, `created_by` and
  `anonymized_at`, through `can_view_wages` inside `has_worker_access`. They already
  read every rate, and need the name and code to pay a person and the phone to reach
  them about pay. They cannot create, edit, assign or import. This widens `workers`
  only: assignments and `worker_roster` still follow `has_site_access`. Worker
  visibility now follows `can_view_wages`, so changing that predicate changes who
  reads workers (2026-10-18).
- W11. A worker's pay type cannot change once they have a wage rate. A rate row has
  no basis column, so switching daily and hourly would reread every past rate. A
  trigger enforces it for every writer; to change the basis, add a new worker code.
  (W10 is the accountant's read access, #59.)
- W12. A re-import with a blank or missing phone keeps the stored phone. Clearing a
  phone is done on the worker's page.
**Consequences.** A supervisor can run attendance without ever seeing pay. Rate
history is complete, so a wage summary can be reproduced for any past date. Costs:
`audit_log` records the old row on an update, so an anonymized worker's earlier name
stays in the log until the retention decision (#19) says how to purge it; the
`workers_select` policy tests `can_manage_sites` first because a row being inserted
is not yet visible to `has_worker_access`; and `import_workers` is not the published
function the architecture lists as `import_workers(rows)`, so ARCHITECTURE.md gains
the extra argument.

---

## ADR-013 · Daily reports: draft, submit, edit with history, review is final
**Date:** 2026-10-17 · **Status:** Proposed · **By:** Anuradha (review: Nikhil)

**Context.** Issue #29. Daily Reporting is the second field-capture module, and
Offline Sync (#13) will push its records, so the shape has to survive replays and a
stale phone. The issue left three questions open: what makes a blocker serious, the
size limits, and whether a manager can edit.

**Decision.**
- R1. A report has a status: `draft`, `submitted` or `reviewed`, as `text` + `CHECK`.
  A draft may be incomplete and is visible only to its author. Completeness
  (headcount and non-blank work done) is checked when it becomes `submitted`.
- R2. One report per site per date, whoever files it. The date may not be later than
  UTC today + 2, which allows the local tomorrow in every time zone. The guard reads
  no Identity table, so it needs no new published function.
- R3. A serious blocker is a boolean `serious_blocker` the supervisor sets, and it
  needs blocker text. `daily_report_status.flagged` is `serious_blocker or
  safety_incident`; both are also shown on their own. A flag is a column and a view,
  nothing more: no push, email or SMS.
- R4. Limits: work done 4000, blockers 2000, next-day plan 2000, edit reason 500,
  review note 1000, photo caption 200, headcount 0-1000, photos 10 per report, 10 MB
  each, jpeg, png or webp.
- R5. Only the author edits, and only until the report is reviewed. A manager marks a
  report reviewed through `review_daily_report(report_id, note)` and never edits.
- R6. An edit to a submitted report is an ordinary `UPDATE` that must carry
  `edit_reason`. A `BEFORE UPDATE` trigger copies the previous values into
  `daily_report_revisions` with the editor, the time and the reason, then clears the
  reason. Because it is a trigger it binds every writer: web, phone and the future
  sync handler. A report cannot go back to draft, and a reviewed report refuses every
  update, so a stale phone cannot overwrite it.
- R7. Revisions are append-only, even for the table owner: no client grant, and a
  trigger rejects UPDATE, DELETE and TRUNCATE.
- R8. A photo is metadata in `report_photos`; the file is in the private
  `report-photos` bucket at `<org>/<site>/<report>/<photo>.<ext>`, a path the row
  fixes. A photo may be added after submit and after review (a slow upload must not be
  lost) but is never changed or removed. A file can be uploaded only at the exact path
  of a metadata row made by the uploader, and read only by someone who can read that
  row, so a draft's file stays with its author.
- R9. `review_daily_report` answers a missing id, a draft and another organisation's
  report with the same `42501`, and reviewing a reviewed report is a no-op.
- R10. For `sync_daily_reports` and `sync_report_photos`, "same content" is
  `site_id, report_date, status, headcount, work_done, blockers, serious_blocker,
  safety_incident, next_day_plan` and `report_id, storage_path, caption, size_bytes,
  content_type`. The handlers wait for Offline Sync's `sync_result` type.

**Consequences.** A submitted report has complete history, and every rule that matters
is in the database, so no client can skip it. A manager who disagrees with a report can
only say so in the review note. Costs: `audit_log` records each row's content, so once
an owner may read it (PR #32) the owner can read a supervisor's draft text there,
which R1 hides from the reports table; a second supervisor who files the same site and
date is refused by the unique key (sync will show a conflict); the photo-limit trigger
runs before RLS and so steps aside for callers the policy will refuse; and the bucket
policies on `storage.objects` are tested here only against a shim, so they need one
check on a real Supabase project.
## ADR-012 · Audit guards: owner-only read, per-user rate limit, 3-year retention floor
**Date:** 2026-10-16 · **Status:** Proposed · **By:** Anuradha (input: Ishant, Nikhil; issue #19)

**Context.** `audit_log` was closed to everyone and had no way to shed old rows, and
`sync_push` needs a flood guard (ADR-009). The PDFs say the rate limit is per
organisation; issue #19 says per user. The roadmap (CUJ-6) keeps attendance and wage
records at least three years.

**Decision.**
- **Reading.** `audit_log_select` policy: `org_id is not null and is_org_owner(org_id)`,
  plus `grant select` to `authenticated`. Project managers, supervisors and accountants
  see zero rows; rows with a null `org_id` (`profiles`) stay closed. A policy, not a
  function. No client gains any write.
- **Rate limit.** `enforce_rate_limit(p_key text, p_limit int, p_window interval)
  returns void`, `SECURITY DEFINER`, executable by `authenticated`. Counted **per user**
  (`auth.uid()`) and key, in a fixed window; this supersedes "per organisation" in the
  workflows and design PDFs. Past the limit it raises SQLSTATE **`PT429`** with a retry
  HINT; nothing else raises it. Keys are an allowlist with a ceiling and a minimum
  window each (`sync_push` 120 per 1 minute, `create_invite` 30 per 1 hour,
  `accept_invite` 10 per 1 hour): a caller may be stricter, never looser, so calling the
  function directly cannot loosen or reset one's own limit. `rate_limit_counters` has
  RLS, no policies, no grants. The increment rolls back with the caller's transaction.
- **Retention floor.** Three years, in `audit_retention_floor()`. `purge_audit_log(
  p_before, p_reason)` is the only way to delete from `audit_log`. It is executable by no
  client role (an operator runs it), needs a reason of 10+ characters, and refuses a
  cutoff inside the floor. The append-only guard allows DELETE only while the purge's
  transaction-local switch is on **and** the row is older than the floor; UPDATE and
  TRUNCATE stay blocked for everyone. `purge_log` also has a table CHECK that a row
  cannot record a purge inside the floor. So the floor is enforced in three places.
- **`purge_log`.** Append-only, no client grant, one row per purge (including one that
  matches nothing), none for a refused purge. It records counts, not purged rows.
  It carries no audit trigger: it is itself a log.
- **Removing a user or worker** never touches `audit_log`: `actor_id` has no foreign
  key. An anonymized worker's earlier name stays in `audit_log` until the floor passes;
  this is the documented retention exception (roadmap), pending counsel review, rather
  than a second path past the guard.

**Consequences.** Owners can finally see their organisation's history, a stuck phone
cannot starve its colleagues, and no row younger than three years can be purged by any
route short of dropping the guard. Costs: raising a rate ceiling or the floor needs a
migration; a superuser can still drop the triggers, as before; there is no scheduler,
so purges are run by hand; `rate_limit_counters` rows are never cleaned up (one row per
user and key, so small); and the design PDF's name `purge_expired_non_statutory`
differs from `purge_audit_log`.

---

## ADR-015 · Materials: fixed units, a unit that never changes, warn on negative stock
**Date:** 2026-10-18 · **Status:** Proposed · **By:** Nikhil (issue #30)

**Context.** Materials is defined per site and fed by a ledger that phones write
offline (part 2, week 4). The issue left open the quantity type, the units, what a
negative balance does, and where the low-stock threshold lives.

**Decision.**
- Quantities and the threshold are `numeric(12,3)`.
- `unit` is text + CHECK over a fixed list: `nos, bag, kg, tonne, litre, cft, cum,
  sqft, sqm, rft, m, brass, trip`. A unit is **fixed once the material exists**:
  there is no update grant on it, because changing bags to kg would silently change
  what every earlier ledger row means. A wrong unit means a new material.
- A negative balance is **warned, never blocked**. Two phones offline can both record
  usage, and only the server sees the total, so blocking would bounce real field
  records. Part 2 flags it in `material_alerts`.
- The threshold lives on the material; null means no alert.
- Managers (`can_manage_sites`) define and edit materials on the dashboard; only the
  name and threshold change, and nothing is deleted. Reading follows
  `has_site_access`. Recording (part 2) follows `can_record_on_site`.
- On an archived site, definitions stay editable by managers. The ledger is closed
  there by `can_record_on_site`, and freezing definitions too would mean reading
  Sites' `status` column, which the boundary rules allow only through a published
  Sites function or view.

**Consequences.** Units stay comparable across sites and exports, and offline usage
is never lost. Costs: a new unit needs a migration; a supervisor cannot add a material
that is not defined yet (watch it in the pilot); and a manager can still rename a
material on an archived site.
## ADR-014 · sync_push envelope, handler contract and failure rules
**Date:** 2026-10-17 · **Status:** Proposed · **By:** Nikhil (handler shape agreed with Manish and Anuradha on #13)

**Context.** ADR-009 fixed the four verdicts. Field modules also need to know what
the phone sends, how a record reaches their table, and what happens when something
fails, before they build their tables in weeks 3–4. The rate limit (#19) rolls its
count back with the caller's transaction, which matters for how errors are returned.

**Decision.**
- `sync_push(p_batch jsonb) returns jsonb` is `SECURITY INVOKER`, executable by
  `authenticated` only, and refuses a call with no `auth.uid()`. Envelope:
  `{ version: 1, device_id, records: [{ entity, record_id, payload }] }`, with 0–100
  records and `(entity, record_id)` unique within a batch. The response is
  `{ results: [...] }`, one result per record, in request order.
- A bad envelope is answered as `{ error: "invalid_envelope", reason }`, not raised,
  so the rate-limit increment is kept and malformed calls still count.
- `enforce_rate_limit('sync_push', 120, '1 minute')` runs once per call, before
  anything else. Only `PT429` is caught, and it makes every record
  `retryable_error` / `rate_limited`. Any other error, including the function being
  missing, fails the whole call. The router never skips the limit.
- Each record goes to `sync_<entity>(p_record_id uuid, p_payload jsonb) returns
  sync_result`, for one of seven fixed entities, in its own sub-transaction. A
  record whose handler does not return `accepted` leaves no rows. Handler
  exceptions map to fixed reason codes (#33). Database error text never reaches
  the client.
- The handler, not the router, decides replay against conflict, because only the
  owning module knows which columns are "the same content".
- A handler must cast what it returns, e.g. `return ('accepted', null)::public.sync_result;`.
  A bare `('accepted', null)` fails at run time ("returned type unknown does not
  match expected type sync_verdict"), and the router reports it as `server_error`.

**Consequences.** Every field module codes against one fixed shape, and a replay,
a poison record or a rate-limited phone each has one defined outcome. Costs: the
no-duplicate guarantee depends on each of seven handlers being idempotent, which a
shared handler contract test must check when they are wired (week 5); a sub-transaction
per record costs a little per record, capped by the 100-record limit; and
`sync_push` depends on `enforce_rate_limit` (#32): if that function is ever removed
or renamed, every push fails instead of running unlimited.

**Amended (#28, 2026-10-20).** A handler's exception map has one more row: SQLSTATE
`PS409`, raised by a lock trigger when a phone writes to a record a manager has
already approved (Attendance's approved-day lock, agreed on #13), is answered
`conflict` / `locked`. The server keeps its version, and the phone shows the record
for review (ADR-009). Without the row it fell through to `retryable_error` /
`server_error`, and a stale phone would have retried the same record for ever. The
clause matches exactly `PS409`, not the `PS` class: nothing else may use it, and the
router's own `PS001` stays separate. It is a new migration
(`20261027100000_sync_push_locked_conflict.sql`), since the first one had merged.

**Amended (#107, 2026-10-20).** The shared handler contract test this ADR called for now
exists: `supabase/tests/sync_contract_test.sql`. Through `sync_push`, for each of the seven
handlers, it checks that the handler has the fixed shape; that a record pushed twice is
accepted twice and stored once, and a whole batch pushed twice writes nothing the second
time; that a bad record between two good ones is rejected with a reason, leaves no row, and
does not stop the good ones being stored; and that every verdict is a fixed code with no
database detail. It adds no table, column or function. Handler-specific rules stay in each
module's own suite. A handler that fails a check there is a bug in its module, not a reason
to loosen the suite.

---

## ADR-016 · The device outbox: one row per record, dirty edits, backoff, recovery
**Date:** 2026-10-18 · **Status:** Proposed · **By:** Nikhil (issue #39)

**Context.** Every field record must survive no signal and a killed app, reach the
server exactly once (ADR-009, #33), and never show as submitted early. The outbox is
the one place on the phone that decides what is sent and what each answer means.

**Decision.**
- Device migration 1 creates `outbox`: one row per `(entity, record_id)`, with
  `seq` as the send order, so a parent captured first is sent first. The table
  itself checks the entity list, the status list and that the payload is a JSON
  object.
- Saving a record again keeps its row and its place, and takes the new payload. If
  its batch is in flight, the row is marked `dirty`, and after any verdict it
  returns to `pending`, so an edit made during a push (a draft submitted while the
  draft was being sent) is never lost.
- A batch is at most 100 rows: `pending`, plus `failed` rows whose retry is due.
  `retryable_error` and a failed push back off 30 s, 60 s, 2 min, …, at most 30 min.
  `conflict` and `rejected` are never retried by themselves; saving the record
  again re-queues it.
- On app start, rows left `syncing` by a killed app return to `pending`. This is
  safe because the server never duplicates a replayed record.
- Only `accepted` makes a row `synced`, the one state the app may call
  "submitted". Ids come from `expo-crypto`'s `randomUUID` on the phone.

**Consequences.** The sender (week 5) only has to claim a batch, send it, and hand
back the answers or a failure. Costs: one in-flight batch at a time, by design; a
record waiting on a 30-minute backoff waits even if the network returns sooner
(the sender may later offer a manual retry); and `synced` rows stay in the table
until a cleanup rule is decided.

**Amended (#66, #67, 2026-10-19).** "One in-flight batch at a time" holds per
sync engine, not per phone: across a user switch, two engines can each have a
batch in flight. That is safe because no step settles another run's rows.
- `releaseBatch` and `returnBatch` act only on the keys of their own batch.
- After a push, only the keys the server left unanswered are released.
- A local failure after a claim fails the rows still owned, with a backoff.
- `recoverInterrupted` resets every `syncing` row, so it runs once per app
  session, when the database opens.

---

## ADR-017 · The stock ledger: one writer, replay before permission, warn-only alerts
**Date:** 2026-10-20 · **Status:** Proposed · **By:** Nikhil (issue #30)

**Context.** Materials part 2 adds the ledger phones write offline and the web writes
online. It must never duplicate a replayed push (#33), never be edited, give one
error for "missing" and "not yours", and compute the balance itself. The PRD says
low or negative stock is warned "where a reason is required"; FEATURES.md and #30 say
the reason is mandatory on an adjustment.

**Decision.**
- `material_transactions` is append-only, enforced by a trigger even for the table
  owner, with no client write grant. `apply_material_transaction()` (`SECURITY
  DEFINER`) is its only writer, and `sync_material_transactions()` is a thin
  `SECURITY INVOKER` handler that calls it, so web and phone follow one rule.
- Opening, receipt and usage are positive; an adjustment is signed and non-zero and
  needs a reason. One opening per material. A future `occurred_on` is refused (UTC
  today + 1, since India is ahead of UTC). Following FEATURES.md, the single source of
  scope, a reason is required on an **adjustment**, not on usage that goes negative:
  a phone offline cannot know the true balance, so that rule could not be enforced.
- **Replay before permission.** The caller's own record, sent again with the same
  content, returns at once, even if the caller has since lost the right to record
  (e.g. the site was archived). This is so a phone that missed the answer still
  hears "done". Anything else is checked first: a missing, foreign, other-site or
  archived material and a wrong role all raise one `42501`; the same id with
  different content raises `23505` (sync_push: `conflict`).
- Only the assigned supervisor records (`can_record_on_site`); owners and managers
  review, as the PRD's roles say.
- `material_balances` sums the ledger (usage negative) per material, 0 when empty.
  `material_alerts` flags `negative` below zero and `low` at or under the threshold;
  no threshold, no low alert. Both are `security_invoker`.

**Consequences.** The balance a manager sees can always be rebuilt from the ledger,
and a replay can never double stock. Costs: an office correction needs a supervisor
on that site; a material with a threshold and no movements shows as low until its
opening is recorded; and stock never leaves the ledger, so offboarding will need a
decision on how to get past the guard.

---

## ADR-018 · The sync sender: transport seam, signed-in only, one run at a time
**Date:** 2026-10-18 · **Status:** Proposed · **By:** Nikhil (issue #47)

**Context.** The outbox (ADR-016) and `sync_push` (ADR-014) exist; nothing yet moves
records from one to the other. The PRD asks that records "sync on their own when the
network returns". No Supabase client exists on the phone, sign-in is Identity's (#14),
and there is no team dev Supabase project yet.

**Decision.**
- `runSync()` claims a batch, sends `{ version: 1, device_id, records }`, applies the
  verdicts and releases anything unanswered, up to 5 batches per run. A failed call or
  a refused envelope releases the batch and stops the run; the outbox backoff decides
  the next try.
- **Nothing is claimed when no one is signed in**, so records are not marked failed,
  and do not pile up backoff, for a reason that is not theirs.
- The server is reached only through a `SyncTransport` (`hasSession`, `push`). The real
  one calls `supabase.rpc('sync_push')` and turns an error into a reason code
  (`server:<SQLSTATE>` or `network`), so every sender path is tested without a network.
- Runs never overlap (`singleFlight`). They start once at launch, on returning to the
  foreground, when connectivity returns, every 60 s while open, and 2 s after
  `requestSync()`, which capture screens call after a save.
- The device id lives in device migration 2 (`device_settings`) and is for logging only.
- The app's one Supabase client uses the publishable key and stores the session
  encrypted (the Supabase Expo guide's `LargeSecureStore`), because site phones get
  lost and shared. Sign-in screens stay Identity's.

**Consequences.** Capture screens only save to the outbox and call `requestSync()`.
Costs: until sign-in exists the app syncs nothing (sign-in: #56, ADR-031); an end-to-end test needs a dev
Supabase project with the migrations applied; supabase-js adds about 0.8 MB to the
bundle; download of sites, materials and the roster to the phone is a separate,
still unplanned piece of Offline Sync; and the outbox does not record who captured a
row, so on a shared phone records saved under one user would be pushed under the
next user's session. That must be closed before sign-in ships (#14): tag each row
with its author and send only the signed-in user's rows, or block sign-out until
the outbox is empty.

**Amended (#66, #67, 2026-10-19).** "Runs never overlap" holds within one engine
(`singleFlight`). Two engines, for example the old and new user's across a
sign-in, can overlap. Each run releases only the rows it still owns (ADR-016
amendment), so overlapping runs cannot settle each other's batches.

---

## ADR-019 · Invites: link grants access, 72-hour expiry, owners may invite owners
**Date:** 2026-10-17 · **Status:** Proposed · **By:** Ishant (review: Nikhil; issue #25)

**Context.** ADR-004 fixed email + password sign-in with an invite by copyable link,
but left open who a link admits, how long it lives, which roles may be invited, and
whether the email is actually sent. Answered by Ishant on #25.

**Decision.**
- I1. The link alone grants access: any signed-in user who opens a valid link joins
  with the invited role. The invited email is the address the link is sent to, not a
  check on who accepts.
- I2. An invite is valid for 72 hours, set by `create_invite()`, never by the client.
  First set to 10 minutes, then raised because the link goes by email and a supervisor
  on site may read it hours later; 72 hours covers a weekend. The owner can revoke early.
- I3. Only an owner invites, and any of the four roles may be invited, owner included.
- I4. Only a sha256 of the token is stored. The raw token (244 random bits) is
  returned once to the inviting owner.
- I5. `accept_invite()` returns the organisation id, or null for every refusal
  (unknown, expired, revoked, used). It does not raise, because `enforce_rate_limit`'s
  counter rolls back with the caller, and a raising refusal would make token guessing
  free. Accepting is limited to 10 tries an hour per user; creating to 30.
- I6. An existing member who accepts keeps their role, and the invite is used up.
- I7. The invite email is sent in the MVP, from the organisation's own mailbox over
  SMTP, by a server action in `apps/web` acting as the signed-in owner. Supabase's
  built-in invite is not used, because it needs the service-role key (rule 2). The
  same mailbox is set as Supabase Auth's custom SMTP, so verification and invite
  emails come from one address. The owner also sees the link once, to copy, in case
  the email does not arrive.

**Consequences.** Onboarding is one tap, with no email match to get wrong. Cost: a
forwarded or leaked link admits whoever opens it within 72 hours, with the invited
role, and for an owner invite that means full control. Revoking and the hash-only
token are the protections; the window is not short. Sending email adds SMTP
credentials, which live only in server env, never in git or the browser (I7).

---

## ADR-020 · Outbox rows belong to their author; only that user's session sends them
**Date:** 2026-10-18 · **Status:** Proposed · **By:** Nikhil (issue #54)

**Context.** ADR-018 left a gap: the outbox did not record who saved a row. Site
phones are shared, so after supervisor A signs out and B signs in, A's unsent
records would go out under B's session. The server would write them as B or reject
them under B's RLS. Either A's work is misattributed, or it is lost to a verdict
that is not A's fault. This had to close before mobile sign-in ships.

**Decision.**
- Device migration 3 adds `outbox.author_id`, the signed-in user's id at save time.
  `enqueue` requires it. A re-save makes the saver the author, because that person
  is responsible for the latest payload. The server still decides under their RLS.
- `claimBatch` takes an author and claims only their rows. The sender asks the
  transport for `currentUserId()` at the start of a run and claims for that user.
- `push(batch, userId)` binds the batch to its author. The transport reads the
  session **once**, refuses if it belongs to anyone else, and sends that same
  session's access token as the `Authorization` header (supabase-js keeps a header
  that is already set). A user switch cannot slip between the check and the call.
  A refused push hands the batch back to `pending` with no retry penalty, and the
  run stops (`session_changed`).
- Sign-out is **not** blocked. Other users' rows wait and go out when their author
  signs in again. `countUnsent(db, authorId)` lets the sign-out screen warn first.
- A row with no author (only possible from before migration 3, and none exist,
  since no capture screen had shipped) is never sent.

**Consequences.** Switching users on a shared phone loses nothing, and each user's
records go out under their own session. Costs: a user who never signs in again
leaves their rows on the phone, visible as unsent but not sent. After a switch, the
new user's records wait for the next trigger (at most 60 s). The transport depends
on supabase-js not overwriting an `Authorization` header we set, which a library
upgrade must not break; a test covers our side of it. The home screen still counts
every user's rows until the sync status screen shows per-user counts.

**Amended (#69 review, 2026-10-19).** The home screen no longer counts every
user's rows: the sync status is scoped to the signed-in user, and with no user
there is none (ADR-029).

---

## ADR-021 · Attendance capture: one visit row, geofence in the database, days keyed by site and date
**Date:** 2026-10-20 · **Status:** Proposed · **By:** Manish (issue #28; handler contract agreed on #13, review: Anuradha)

**Context.** Attendance is the first module a supervisor uses on the phone with no signal,
and the first whose wage-relevant rows are approved by someone else. The issue left open
how check-out is stored, how half a day and overtime are shaped, how many days a site has,
what a replayed record is compared on, and whose clock counts. Two things also cut across
modules: the geofence needs a site's coordinates, and two supervisors on one site can open
the same day on two phones.

**Decision.**
- **D1 · Check-out is the same row.** `site_visits` has one row per visit. Check-in creates it
  with a phone-made uuid; check-out sets the check-out columns of that row, once. The policy
  matches only a row with `check_out_at is null`, so a second check-out, or a colleague's,
  changes 0 rows. No "one open visit" rule (D12): a forgotten check-out must not become a
  permanent conflict on the next day's check-in.
- **D2 · Half a day is a status**: `present`, `absent`, `half_day`, `leave`. No fraction.
- **D3 · Overtime** is `numeric(4,2)` hours, 0 to 8 inclusive, and non-zero only on `present`
  or `half_day`. Raising the maximum is a migration.
- **D4 · One day per site per date**, not per supervisor. A unique index on
  `(site_id, attendance_date)`.
- **D5 · Entries point at their day by natural key** `(org_id, site_id, attendance_date)`, not by
  the day's id. Two phones that open the same day offline with different uuids do not strand
  each other's entries; the second day insert is a harmless duplicate that the sync handler
  answers `accepted`. Two phones marking the *same worker* is a real disagreement: one entry per
  worker per day, first writer wins, the second hears `conflict` (#34). Rejected: a day-id foreign
  key (the second phone's entries would retry forever on a parent that is not there) and a
  hash-derived day id (needs the same hash on the phone).
- **D6 · "Same content" for a replay** is the caller-writable columns of that push, excluding
  ids, timestamps and anything the server stamps. Check-in push: `site_id`, `check_in_at`,
  `check_in_lat`, `check_in_lng`, `check_in_reason`. Check-out push: `check_out_at`,
  `check_out_lat`, `check_out_lng`, `check_out_reason`. A handler compares only the fields its
  push carries, so replaying the check-in after the check-out is `accepted`. Day:
  `site_id`, `attendance_date`. Entry: `site_id`, `attendance_date`, `worker_id`, `status`,
  `overtime_hours`, `note`. The handlers themselves arrive in the next PR.
- **D7 · Two clocks.** `check_in_at` / `check_out_at` are the phone's clock, because an offline
  record is hours old by design; `created_at` / `updated_at` are the server's. The phone's clock
  is accepted up to one day ahead of the server and not beyond. Nothing is paid on a clock: a
  manager approves the day.
- **D8 · The geofence rule applies to check-out too.** The database computes the distance
  (pure-SQL haversine, Earth radius 6371008.8 m, no PostGIS) and flags the visit when distance
  is greater than `geofence_radius_m`; exactly on the radius is inside. Outside, a trimmed
  reason of 1–500 characters is mandatory. The distance and the flag have no column grant, so
  the phone cannot set them. The flag is a record of the day and is not recomputed if the radius
  changes later.
- **D9 · Sites publishes `site_geofence`** (`security_invoker`: `id`, `org_id`, `latitude`,
  `longitude`, `geofence_radius_m`). Attendance reads a site's pin only through it, as the
  architecture requires. A caller who cannot see a site gets no row, and the trigger answers
  `42501`, the same as for a site that does not exist.
- **D10 · Rostered on a date** is the Asia/Kolkata calendar day of `assigned_at` and
  `unassigned_at`, both ends inclusive, read from `worker_roster`. One helper function
  (`attendance_local_date`) holds the zone. `organizations.timezone` has no published view, so
  it is not read.
- **D11 · `attendance_days` has its final shape now**: `status` (`open`, `approved`, `rejected`)
  and the reviewer's stamp, with a table rule that an open day carries no stamp, a reviewed day
  says who and when, and a rejection says why. No client can write them yet, so every day is
  `open`; the review function and the lock come next.
- **D12 · No one-open-visit rule.** A visit is not refused because the same user has another
  open visit. A forgotten check-out must not turn the next day's check-in into a permanent sync
  conflict; managers see open visits instead.
- **D13 · FEATURES ticks.** A row is ticked only when a named test proves the database side of its
  wording. Parts that need a screen or the phone stay unticked, and the module note says so.
- **Validation failures are `23514`** (the sync router answers `rejected` / `invalid_input`): a
  missing reason, a bad range, a phone clock too far ahead, a date beyond UTC today + 1, and a
  worker who was not rostered. The roster rule is an AFTER INSERT trigger on entries, so the
  policy answers first (`42501`) and another organisation's worker is stopped by the foreign key
  (`23503`).
- `mark_all_present(site, date)` is `SECURITY INVOKER`: it opens the day if needed and adds a
  `present` entry for every active worker rostered that day who has none yet, so it never
  overwrites an exception and returns how many it created. Offline, the phone writes those
  records itself.
- The two pure helpers (`attendance_distance_m`, `attendance_local_date`) are executable by
  `authenticated`, because the triggers run as the caller and must call them. They read no table.

**Consequences.** Once the phone screens and the sync handlers ship (next PR and the mobile
work), a supervisor can check in, mark a site and fix exceptions with no signal; the keys are
chosen so that a replay or a second phone cannot create a duplicate day or visit. The geofence cannot be
bypassed by any writer. Costs: the distance is that of the coordinates the phone reports, so a
spoofed GPS passes; `audit_log` copies the whole row, so check-in coordinates are stored there
too (owner-readable, kept at least 3 years, ADR-012); an organisation outside India would need
`attendance_local_date` changed; there is no lower bound on `attendance_date`, so a long-offline
phone can back-fill, which the approval step is there to catch; and a supervisor unassigned
while offline can no longer check out the visit they opened.
## ADR-022 · Daily Reporting sync handlers: update in place, replay before permission
**Date:** 2026-10-18 · **Status:** Proposed · **By:** Anuradha (issue #63; contract agreed with Nikhil on #13)

**Context.** `sync_push` routes `daily_reports` and `report_photos` to handlers that
did not exist, so every report a phone sent came back `handler_unavailable`. Unlike
the stock ledger, a report is not insert-only: a draft pushed earlier is submitted
later, and a submitted report is edited, under the same `record_id`. The #35 guard
triggers already hold the lifecycle rules, and #13 agreed the handlers are
`SECURITY INVOKER`. Three things were open: where the report's `org_id` comes from,
what a reviewed report answers, and whether a replay is answered before permission.

**Decision.**
- H1. `sync_daily_reports` and `sync_report_photos` are `SECURITY INVOKER`. They read
  the payload, answer a replay, and insert or update under the caller's RLS. Every
  lifecycle rule stays in the #35 triggers, so web and phone follow one rule.
- H2. The report payload is the whole report. `org_id`, `site_id`, `report_date` and
  `status` are required; each field has one JSON type, so `"12"` is not a headcount.
  Status may only be `draft` or `submitted`.
- H3. The phone sends the report's `org_id`, because the composite key to `sites` needs
  it and Daily Reporting may not read `sites` itself. A `23503` on a report insert can
  only mean the site is not in that organisation (sites never sync from a phone), so
  the handler raises it as `22023`: `rejected`, never a retry loop.
- H4. An existing report by the caller, pushed with different content, is an `UPDATE`.
  The handler never answers `accepted` for an update that changed 0 rows: it re-reads
  the row and answers `conflict` / `reviewed` if it was reviewed meanwhile, otherwise
  `rejected` / `permission_denied`.
- H5. The handlers return two conflicts themselves: `reviewed` (the server's version is
  final) and `different_report` (this id already holds another site or date). The
  rest come from `sync_push`'s mapping: no reason `invalid_input`, un-submit
  `invalid_state`, a second report for the site and day `duplicate`.
- H6. **Replay before permission**, as Materials does (ADR-017). Private `SECURITY
  DEFINER` matchers (`daily_report_matches`, `report_photo_matches`) compare only the
  caller's own row and return a boolean. So a phone that missed an answer still hears
  `accepted` after losing the site. A reviewed report matches its submitted content,
  because the server holds exactly what the phone sent.
- H7. A photo's site and organisation come from its report, which this module owns, so
  the photo payload is exactly the #13 "same content". A report the caller cannot see
  is `retryable_error` / `missing_parent` (not synced yet), unless it is the caller's
  own (`is_own_daily_report`, definer, true only for the caller's reports): then the
  caller lost the site, and it is `rejected` / `permission_denied`.

**Consequences.** A report filed offline needs one record, a replay never writes, and a
stale phone cannot overwrite a reviewed report. Costs: the phone must send `org_id`
for a report; three small definer helpers are executable by `authenticated`, though
each speaks only about the caller's own rows; a photo for another user's report that
the caller cannot see retries with backoff instead of being refused, since under RLS
it looks the same as a report still on its way (the phone only sends photos of its
own reports); and the race in H4, a review landing between the read and the update,
is handled in code but not covered by a test, as the SQL suites run on one connection.

---

## ADR-023 · Pull: full refresh into mirrors owned by one user, through published views only
**Date:** 2026-10-19 · **Status:** Proposed · **By:** Nikhil (issue #49, review of #71)

**Context.** Capture screens need sites, materials and the roster with no signal.
ADR-018 left the download direction unplanned. Phones are shared (ADR-020), the
PostgREST row cap fails silently, and the server decides who sees what through RLS.

**Decision.**
- **Full refresh, not incremental.** When a supervisor is taken off a site, RLS
  simply stops returning it, and only a full refresh notices that. The assignment
  tables have no `updated_at` to page on. The data is small.
- **Three mirrors, in device migration 4,** all through published views, never a
  table of another module (ARCHITECTURE rule 4): sites from Sites' `site_details`
  (ADR-028), materials from Materials' `material_balances`, and the roster from
  Workforce's `worker_roster` (no phone number, no rate). Every column is named,
  never `*`, so a column added on the server reaches phones only by decision.
- **Sites:** `archived` ones are left out, since `can_record_on_site` refuses them.
  `completed` and `paused` stay, because a supervisor can still record on them. The
  materials and roster of a site the phone does not hold are dropped too.
- **The roster follows Attendance's D10 (ADR-021),** since the server is the
  authority. The mirror keeps each assignment's assigned and unassigned day in
  Asia/Kolkata, and `readRosterOn(date)` applies the same rule as
  `mark_all_present`: assigned on or before the date, and open or unassigned on or
  after it, both ends inclusive, active workers only, one row per worker. Open-only
  would drop a worker who left at 11:00 although the server still accepts them for
  that day, and would make an offline back-fill of yesterday impossible. It holds
  open assignments and ones closed in the **last 7 days** (a product choice, asked
  on #49), so an ex-worker's name does not stay on the phone for good.
- **One transaction, all or nothing.** Every page of every source must arrive and
  parse, or the old mirror stays whole. A failed write is a fixed `local_error`.
- **Paging by key, not by offset.** A page is the rows after the last key seen, in
  key order, so a row added or removed between pages cannot skip one or repeat one.
  The only end is an empty page, because a server may cap a page below the 1000
  asked for. A cursor that does not advance fails the pull instead of looping.
- **Owned by one user.** `mirror_state` records whose mirror it is. Reads for anyone
  else return nothing, so B never sees A's sites offline on a shared phone. Sign-out
  clears the mirrors once it has worked (`signOutAndClearMirrors`), and a failure
  to clear never fails the sign-out. The outbox is never touched.
- **One session per page.** Each page reads the session once, refuses if it belongs
  to someone else, and sends that session's token (as the push does, ADR-020). The
  user is checked again just before the write, so a sign-out that landed during the
  pull is not undone by it. That narrows the window rather than closing it, and
  clearing on sign-out covers the rest.
- **A save never joins a pull.** `enqueue` runs in a transaction, so a record saved
  while a pull is writing waits for it. A plain write would have joined the pull's
  open transaction, and been rolled back with it if the pull failed, or lost with it
  if the app was killed before it committed.
- **When:** after a sync run, at start and then at most every 5 minutes. Sync now
  forces one. Only a finished pull resets the clock.
- **What the screen says.** What the phone holds and how old it is stays on screen
  after a failed refresh, which is every refresh made offline, with a note that the
  refresh failed. The failure reason is never printed.
- **Quantities are integer thousandths,** which is exact for `numeric(…, 3)`, so the
  Materials screen's estimated balance (server balance plus outbox) adds up without
  float drift. A null or non-numeric value fails the pull rather than becoming 0.

**Consequences.** Capture screens get a consistent, per-user offline copy that is
never half-written, and the server's own roster rule decides who can be marked.
Costs: every refresh re-downloads everything, which is fine at pilot scale and an
ADR to revisit if data grows; an empty last page adds one request per source; the
mirror is at most about 5 minutes old while online, and as old as the last pull
while offline; a back-fill older than 7 days sees only who is still assigned; an
owner or project manager on a phone gets their whole organisation's roster, because
the mirror holds what RLS lets the user see although only supervisors can record;
and a copy that cannot be cleared on sign-out stays on disk, unreadable to the next
user, until the next pull replaces it.

---

## ADR-025 · Web review of daily reports: site names through a Sites view, no author names, no new write
**Date:** 2026-10-19 · **Status:** Proposed · **By:** Anuradha (issue #74; Sites view reviewed by Manish)

**Context.** The database side of Daily Reporting was merged (#35, #64) but no app shows a
report, so the in-app flag for a serious blocker or safety incident had nowhere to appear.
The web pages need the site's name. Daily Reporting may read Sites only through a published
view: `site_geofence` carries no name, and `site_timeline`, listed in `ARCHITECTURE.md`, does
not exist. `profiles` can be read only by their own user, so a manager cannot see who filed.

**Decision.**
- W1. Sites publishes `site_directory (id, org_id, name, status)`, `security_invoker`,
  select-only for `authenticated`. No address, pin or geofence. Archived sites stay listed so
  an old report keeps its site name. It is its own migration and commit, for Manish to review.
- W2. The pages write nothing except through `review_daily_report`. They add no table, policy
  or grant for Daily Reporting.
- W3. The list reads `daily_report_status`; the detail page reads `daily_reports`,
  `daily_report_revisions` and `report_photos` under the viewer's RLS. A draft never appears
  for anyone but its author, and the pages add no filter that could widen that.
  Membership of the organisation in the URL is checked with Identity's `is_org_member`;
  the pages read no Identity table, so the heading shows no organisation name.
- W4. Search params are validated: a uuid, one of three statuses, `flagged=1`, and real
  calendar dates. The default range is 7 days and the longest is 31; a longer range is cut to
  the 31 days ending at `to`, and a reversed or malformed one falls back to the default. Days
  are UTC dates, not the organisation's time zone. The list shows at most 200 rows.
- W5. Photos are shown through signed URLs valid 5 minutes, made on each render under the
  viewer's own session, so storage RLS applies. A photo whose file is not uploaded yet shows a
  placeholder.
- W6. The Mark reviewed button is drawn only when `can_review_site` is true, the report is
  `submitted` and the viewer is not its author. This is presentation: `review_daily_report`
  repeats every check and is the boundary.
- W7. No author names. A report filed by the viewer says "filed by you"; others say nothing.
  Showing member names needs an Identity view, which is Identity's decision.

**Consequences.** A manager can see and review reports with the history and photos, and the
flag finally has a surface. Costs: a second module's view had to be added in this PR; an
accountant has no site access, so sees an empty list (the dashboard hides the link from them);
managers cannot tell supervisors apart in the list until Identity publishes member names; the
UTC day can differ from the site's calendar day near midnight in India (UTC+5:30); and the
signed-URL and storage-read path is tested here only by the shim, so it needs one check against
a real Supabase project.
## ADR-024 · Schema guards: the non-negotiables are checked in CI, test-only
**Date:** 2026-10-19 · **Status:** Proposed · **By:** Anuradha (issue #72)

**Context.** `write_audit()` (ADR-008) has been attached to every business table, and
every table, view and definer function on `main` follows `CLAUDE.md`'s rules. But only a
reviewer reading each migration checked that. `attendance_corrections`, `wage_periods` and
`wage_lines` are next, and one forgotten line in any of them would leave a table unaudited
or open, with nothing failing.

**Decision.**
- G1. Two SQL suites read `pg_catalog` after every migration has been applied:
  `audit_coverage_test.sql` and `schema_guards_test.sql`. They cover every table, view,
  materialized view and `SECURITY DEFINER` function in `public`, so a new one is checked
  without anyone adding it to a list.
- G2. **Audit.** Every table that is not exempt has a `write_audit()` trigger `AFTER INSERT
  OR UPDATE OR DELETE FOR EACH ROW`, and a `uuid` `id`. The trigger must fire on every
  ordinary write: enabled or `ALWAYS`, never disabled or replica-only, with no `WHEN (…)`
  clause and no `UPDATE OF` column list. The exemptions are
  exactly three, and the suite asserts all three exist:
  - `audit_log` (ADR-008), which is the log itself;
  - `purge_log`, which is itself a log (ADR-012);
  - `rate_limit_counters`, which counts requests and records no change. It has RLS, no
    policies and no grants (ADR-012).
- G3. **Schema.** Every table has RLS on. Every view is `security_invoker`. There are no
  materialized views, since they cannot be invoker, and no foreign tables, since Postgres
  cannot enforce RLS on them. Every `SECURITY DEFINER` function sets
  `search_path = public`, and neither `PUBLIC` nor `anon` may execute it. Neither `anon` nor
  `authenticated` may DELETE or TRUNCATE a table, and `anon` has no table or column privilege.
- G4. A failure names the object and the rule it breaks. Each suite also breaks every
  rule on a probe object, and the main rules on real objects, and asserts the guard names
  exactly those. That proves the guard can fail.
- G4a. The test shim now grants everything in `public` to `anon` and `authenticated` by
  default, as a hosted project does. So a migration that forgets its `revoke all … from
  public, anon, authenticated` fails the guard here, instead of shipping open. Every
  existing suite passes with this default.
- G5. Test-only. A published `schema_guard_violations()` function, which an operator could
  run on the real project, was considered and declined: it adds public surface for a check
  CI already makes. Revisit when the team project exists (#58).
- G6. A new exemption is a line in the suite **and** an ADR saying why.

**Consequences.** The rules in `CLAUDE.md` that a migration can break are now enforced on
every PR, for every module, and the two week-1 audit rows can be ticked on evidence.
Costs: a module that truly needs a client DELETE, or a table with no audit, must argue it
in an ADR first. The guards run only against the test shim. It copies the hosted default
grants, but objects that exist only on the hosted project (extensions, Supabase's own)
are not checked until #58. And the checks are structural: a policy that is present but
too wide still needs a reviewer and the module's own role tests.
## ADR-027 · Worker import: the file is read in the browser, with read-excel-file
**Date:** 2026-10-19 · **Status:** Proposed · **By:** Ishant (review: Manish, Anuradha; #57)

**Context.** Contractors keep their worker register in Excel or CSV. The import needs
to read both, and the rows go to `import_workers()` (ADR-011 W8).

**Decision.**
- The file is parsed in the browser. Only the rows reach the server action, so the
  file is never uploaded or stored, and the server's job stays one RPC as the user.
- CSV uses our own small RFC 4180 reader. `.xlsx` uses `read-excel-file` (MIT),
  loaded only when someone picks an Excel file. Only the first sheet is read; `.xls`
  is not supported.
- The file is checked before sending: required columns, duplicate column names, an
  unclosed quote, a CSV not saved as UTF-8, date or TRUE/FALSE cells, more than 1000
  rows or 5 MB, and duplicate codes. Each message names the real file line. Values
  are checked by the database, row by row.
- Codes Excel stored as numbers are imported as text, with a warning about lost
  leading zeros, rather than refused.

**Consequences.** No file storage or server-side parser to secure. Costs:
`read-excel-file` has a single maintainer, which is a supply-chain risk (pinned in the
lockfile, reviewed on upgrade); old `.xls` files must be re-saved; and a leading zero
already lost by Excel cannot be recovered, only warned about.
## ADR-031 · Mobile sign-in: one gate in the layout, offline-safe session, no sign-up on the phone
**Date:** 2026-10-19 · **Status:** Proposed · **By:** Ishant (review: Manish, Anuradha, Nikhil; #56)

**Context.** The sync sender (ADR-018, ADR-020) sends nothing while no one is signed
in, and field capture must keep working with no signal (CLAUDE.md rule 6). Review of
#56 found that supabase-js returns no session offline once the access token expires,
and that an offline sign-out with an expired token did not clear the stored session.
On a shared phone that would save the next person's records as the previous user's.

**Decision.**
- M1. The sign-in gate lives in `app/_layout.tsx`, around every route, so a deep link
  (scheme `alarsio`) cannot reach a screen while signed out.
- M2. Offline with an expired token, the user stays signed in as the user in the
  stored session (`isAuthRetryableFetchError`). Only a refresh the server refuses, or
  a sign-out, ends the session. The session key is fixed (`alarsio-auth`) so the app
  can read it.
- M3. Sign-out always ends this phone's session: if supabase-js returns an error or
  throws, the app removes the stored session itself and reports signed out.
- M4. Sign-out never blocks (ADR-020). It warns with the user's unsent counts, split
  into rows that will send next time and rows that need a fix (ADR-016), and says so
  when it could not count.
- M5. No sign-up on the phone. People join through the invite link on the web
  (ADR-019), then sign in on the phone.
- M6. The signed-in screens are keyed by user id, so a sign-in mounts a fresh sync
  engine for that user. Overlapping runs during a switch are safe once the sender
  releases only its own batch (#67).

**Consequences.** A supervisor keeps capturing through a day with no signal, and a
shared phone hands over cleanly. Costs: offline, the app shows a user as signed in
whose token cannot be refreshed yet, so the sync line says it is waiting for a
connection (Nikhil, #69); a revoked user stays signed in on the phone until it next
reaches the server; and the session key change signs out anyone signed in before it.
## ADR-026 · Owner data export: every table read under the owner's RLS, one ZIP of CSVs
**Date:** 2026-10-19 · **Status:** Proposed · **By:** Anuradha (issue #76)

**Context.** Module 9's last row is "a customer can export all of their own data" (CUJ-6).
An export is by definition a read of every module's tables, but `ARCHITECTURE.md` rule 4
says one module reads another only through a published view, and only a few tables have
one. The rows also include worker names, phones and site locations (DPDP), and PostgREST
caps a response at 1000 rows.

**Decision.**
- E1. The export is a web feature, `/export` and `POST /export/download`, owner only. It
  reads every table **directly, as the signed-in owner**, with the normal Supabase client.
  RLS decides every row; there is no service-role key and no `SECURITY DEFINER` reader.
  This is a named exception to rule 4: read-only, owner-only, in one place
  (`apps/web/src/lib/export/`). Publishing an export view per module was declined: nine PRs
  across four owners for a copy of each table.
- E2. The tables and columns are a fixed list (`tables.ts`). A Vitest test reads
  `supabase/migrations` and fails when a table or column is neither in the list nor
  exempt; `apps/web/turbo.json` makes the migrations an input of that test. Exempt:
  `purge_log` and `rate_limit_counters`, closed to every client (ADR-012). Withheld:
  `invites.token_hash`, which the client may not select. `data_export_test.sql` checks
  the database side: `authenticated` may select every other column, and the export's query
  returns only the owner's organisation from every table.
- E3. One ZIP (`fflate`) of one CSV per table plus `manifest.csv` (rows per table, when,
  who, and a note where RLS shows the owner less than everything: their own profile only,
  no other user's draft reports, no photo files). Pages of 1000 by `id` (keyset), until a
  page comes back empty, so a lower server row cap loses nothing. Any failure returns no
  file. `write_audit()` stores whole rows (ADR-008), so a withheld column is also removed
  from `audit_log.old_data` / `new_data` for that table's rows: no invite token hash
  leaves the system.
- E4. CSV is RFC 4180, CRLF, UTF-8 with a BOM. A text cell starting with `=`, `+`, `-`,
  `@`, tab or CR gets a leading `'` (OWASP CSV injection); numbers and booleans do not.
- E5. `enforce_rate_limit` gains the key `export_org_data`, at most 5 per user per hour,
  called before any read so a failed export still counts. The route also refuses a POST
  whose `Origin` is another site.

**Consequences.** An owner can take all of their data out without asking us, and gets
exactly what they can already see. Costs: every new table or column fails the web test
until it is added to `tables.ts` or exempted with an ADR, so other modules' PRs touch this
module's file; the ZIP is built in memory, fine for 2–20 sites but to be streamed if a
pilot organisation outgrows it; photo files are not included; the export itself leaves no
record beyond the rate-limit counter (a `data_exports` table would be a new decision);
other users' profile names are absent because profiles are self-only; an anonymized
worker's earlier name and phone are still in `audit_log` until the 3-year floor
(ADR-012's retention exception), so the export carries them too; the `'` prefix
changes how a cell such as `-5 bags` reads back; and the route has been tested only with a
fake reader and the SQL suite, not against a hosted project (#58).

---

## ADR-028 · Sites publishes site_details, the full site record for the offline mirror
**Date:** 2026-10-19 · **Status:** Proposed · **By:** Manish (issue #49; asked for by Nikhil for PR #71)

**Context.** Offline Sync mirrors each user's sites onto the phone so a supervisor can pick a
site with no signal. It may read another module's data only through a published view
(`ARCHITECTURE.md` rule 4). Sites already publishes two views, both narrow on purpose:
`site_geofence` (`id, org_id, latitude, longitude, geofence_radius_m`, ADR-021 D9, pinned by
Attendance's tests) and `site_directory` (`id, org_id, name, status`, ADR-025 W1, "no address,
pin or geofence", pinned by `sites_directory_test.sql`). Neither has the address, and `site_timeline`,
listed in `ARCHITECTURE.md`, does not exist. Until now the mirror in #71 read the `sites` table.

**Decision.**
- S1. Sites publishes a third view, `site_details (id, org_id, name, address, status, latitude,
  longitude, geofence_radius_m)`, `security_invoker`, select-only for `authenticated`.
- S2. It is separate from the other two. Widening `site_directory` would reverse ADR-025 W1 and
  break `sites_directory_test.sql`'s column test; widening `site_geofence` would break D9 and
  Attendance's.
  Each view stays the least a consumer needs.
- S3. No row filter. It returns what `sites_select` (`has_site_access`) lets the caller read: an
  owner or project manager sees every site of their organisation, archived ones included with
  `status = 'archived'`, so the consumer decides. A supervisor's or accountant's archived sites
  disappear because `archive_site` closes their assignments.
- S4. No `updated_at` on the view. `sites` has one, but `site_assignments` has none, and a site
  leaves a user's list when an assignment closes, which `sites.updated_at` cannot show. So an
  incremental pull is not possible and the mirror stays a full refresh (issue #49).
- S5. `ARCHITECTURE.md` lists it in the Sites row, and marks `site_timeline` as not built yet.

**Consequences.** The phone mirror no longer reads a table another module owns, and the three
views never drift into each other. Costs: three overlapping Sites views to keep in step if a site
column is renamed; the address and pin of every site a user can read are copied onto the phone,
so the device encryption and wipe-on-sign-out questions on #71 matter (not decided here); and a
later merge of the views into one would need Attendance's and Daily Reporting's agreement.

---

## ADR-029 · Sync status belongs to one user, and never says more than it has read
**Date:** 2026-10-19 · **Status:** Proposed · **By:** Nikhil (issue #68, review of #69)

**Context.** #69 added the sync status on the phone: counts, the refused records
with their reasons, and Sync now. It scoped them to the signed-in user only when
a user was passed in, and with none it covered every user. The app passed none.
Once sign-in (#56) merged, on a shared phone user B's screen would have listed
A's refused records, and B's Sync now would have reset A's backoff. That is the
leak ADR-020 closes, in a new place. The review also found the screen claiming
"all on the server" about counts it had failed to read, printing raw error text
(file paths, database messages), and a long list pushing Sync now off the screen.

**Decision.**
- **No user, no engine, no panel.** `startSyncEngine` requires a `userId`, and
  `HomeScreen` starts sync only when it has one. `listAttention` and
  `retryFailedNow` require an author and do nothing without one: no code path
  falls back to every user's records.
- **The engine belongs to its user.** Its transport counts anyone else's session
  as no session, so it claims and sends only that user's rows, and what the screen
  shows is what is sent. The user comes from the stored session (it works
  offline, even when the token has expired and the transport reports no session)
  through a context set by the sign-in gate in `_layout.tsx`. In that offline
  case the line says "Waiting for connection".
- **The line claims only what it has read.** "All your records are on the server"
  appears only after a successful read of the counts. A failed read says
  "Could not read your records on this phone", and a failed read is a state in the
  status (`loaded`, `readFailed`), not a swallowed error.
- **No raw error text on screen.** Internal failures map to one fixed sentence
  each (`local_error`, `invalid_envelope:*`, `bad_response`). Only a short server
  code (`server:` and up to 8 letters or digits) is echoed. A session change is not
  shown, since it is not this user's problem.
- **A long list scrolls.** The refused records scroll inside a bounded box, at most
  50 are kept, and the rest are counted as "and N more". Sync now stays on screen.
  A failed Sync now is a result, not a rejected promise.
- **Sync now clears the wait, not `attempts`** (ADR-016 amendment).
- **Accessibility.** The button's name follows its text ("Sending…" while it runs),
  its disabled colour keeps 4.5:1 contrast, and the line is a polite live region.

**Consequences.** A shared phone shows each person their own records only, and the
screen can no longer say something it has not checked. Costs: the screen shows
nothing at all, instead of everything, when the app has no user (which only
happens outside the sign-in gate); the user reaches the engine through a context,
which `_layout.tsx` (Identity's) must keep providing, and a test covers the screen
side of that; and a `failed` record still looks like a waiting one although it can
wait up to 30 minutes (ADR-016), which a later change can show as "next try in …".

---

## ADR-030 · Attendance corrections, day review and the approved-day lock
**Date:** 2026-10-20 · **Status:** Proposed · **By:** Manish (issue #28, PR 2 of 3; PS409 agreed on #13; review: Anuradha)

**Context.** ADR-021 built capture and left three things for the next PR: how an approved day
changes, who approves it, and what stops a phone from overwriting it ("a stale device cannot
overwrite an approved day", `ARCHITECTURE.md`; ADR-009 makes it a `conflict`). `attendance_corrections` is in `ARCHITECTURE.md` with no
columns, and `review_attendance_day` / `review_attendance_correction` are listed without
signatures. A correction ledger that is append-only still has to record who reviewed it.

**Decision.**
- **D1 · The review is a stamp on the correction row.** `review_status` (`pending`, `approved`,
  `rejected`), `reviewed_by`, `reviewed_at`, `review_reason`, written once by
  `review_attendance_correction()`. Clients hold no UPDATE or DELETE grant. A guard trigger allows
  exactly one pending-to-decided move and freezes every other column, for the table owner too;
  `audit_log` keeps both versions. Rejected: a separate reviews table (strictly insert-only, but a
  table not in `ARCHITECTURE.md`, with its own RLS, audit and policies).
- **D2 · One correction is one change to one entry**, with `old_*` and `new_*` for `status`,
  `overtime_hours` and `note` together, because status and overtime are tied by a constraint and
  cannot move one at a time. The entry is named by its natural key (site, date, worker), as entries
  name their day (ADR-021 D5), so a second phone's entry id cannot strand a correction. The old
  value is stamped by a trigger from the entry, never sent by the phone.
- **D3 · A correction is for an approved day only.** On an open or rejected day the supervisor edits
  the entry; a correction there would be a second way to do the same thing. A correction on any
  other day is `55000`. So a day with pending corrections can never be awaiting approval.
- **D4 · Rejected means "sent back".** Only an approved day is locked. The supervisor edits a
  rejected day and a reviewer decides again; there is no reopen function and no "resubmitted"
  flag. The entries' update policy therefore requires the day to be `status <> 'approved'`.
- **D5 · Owner and project_manager review only.** They cannot edit entries, un-approve a day or
  propose a correction (as agreed on #13). `review_attendance_day(day, approve, reason)` and
  `review_attendance_correction(correction, approve, reason)` are `SECURITY DEFINER`, check
  `can_review_site` themselves on a locked row, return `void`, and answer `42501` for both "no such
  id" and "not yours". A rejection needs a reason (`22023`); an approval may carry a note. An approved
  day is final: approving it again is a no-op that keeps the first reviewer, rejecting it is `55000`.
- **D6 · One pending correction per entry** (partial unique index, `23505`, which the router answers
  `conflict` / `duplicate`).
- **D7 · A stale correction is not applied.** Approving it when the entry no longer equals the old
  values is `55000`; the reviewer rejects it. Only an administrator's write can make one stale,
  because only an approved correction can change an approved entry.
- **D8 · The lock admits exactly one write.** A trigger lets an UPDATE of an approved day's entry
  through only when an approved correction exists whose old values equal the row's and whose new
  values equal what is written. There is no settable flag and no check of the role name, so a plain UPDATE, even
  the table owner's, raises unless it repeats a write an approved correction already made. Putting
  an applied correction back is a new correction. Known limit: after a revert cycle (A to B approved,
  then B to A approved) the first correction matches again, so a writer that bypasses RLS could repeat
  A to B; it writes only values a reviewer already approved, and no client reaches the trigger. The
  entry triggers are `SECURITY DEFINER` so RLS cannot hide the day or the correction from them.
  The day row is frozen once approved, and never goes back to open.
- **D9 · SQLSTATEs.** `PS409` a write the lock refuses (a late entry on an approved day, an
  UPDATE that reaches the table, a write to an approved day row); a plain supervisor UPDATE never
  gets there, because the policy matches 0 rows. `42501` no permission; `23514` a value rule,
  including a blank or over-long proposed reason; `23503` the entry is not there yet (the phone
  retries); `23505` duplicate; `22023` a blank or over-long review reason; `55000` a transition the state does not allow; `28000` not signed in. The late-entry lock is
  an AFTER INSERT trigger, so an unassigned caller gets `42501` first and is not told a day is
  approved.

**Consequences.** An approved day can only change through a reviewed, audited, reversible-by-new-row
correction, and every writer is bound, not only the phone. The approved-days view in PR 3 can read
entries as they stand, with corrections already applied, and the old value is in
`attendance_corrections`. Costs: "append-only" for corrections means immutable except one review
stamp; the lock needs `PS409` mapped in `sync_push` (not on main yet: until Nikhil adds
`when sqlstate 'PS409' then ('conflict', 'locked')`, a stale phone would be `retryable_error` and
retry forever, harmless only while no attendance handler exists); a worker with no entry on an
approved day cannot be added in this release; a manager cannot approve half a correction; an
offline correction that reaches the server before its day is approved is `rejected` /
`invalid_state`, and the supervisor edits the entry instead; there is no signal that a rejected day was fixed, so the
exceptions view must compare `attendance_entries.updated_at` with `reviewed_at`; and if #61 adds an
entry column for hourly pay, corrections must carry it too.

---

## ADR-032 · Attendance publishes approved days and site exceptions; wage readers see every approved day
**Date:** 2026-10-20 · **Status:** Proposed · **By:** Manish (issue #28, PR 3a of 3; columns agreed with Ishant on #61; review: Anuradha)

**Context.** `ARCHITECTURE.md` lists two Attendance views, "approved `attendance_days`" and
`site_exceptions`, with no columns. Wage Summaries (#61) asked for one row per worker per approved day,
with corrections applied. Both views are `security_invoker`, so they follow `has_site_access`, and an
accountant reads only sites where they hold an open assignment (`has_site_access`, ADR-007): a wage period built from the
view would silently miss every other site. ADR-030 left "how a fixed rejected day shows" to this PR. The
number: #90 asks to renumber a duplicate ADR-026 and needs ADR-031, so this one is ADR-032.

**Decision.**
- **D1 · Number.** ADR-032, leaving ADR-031 for #90.
- **D2 · `approved_attendance_days`** has exactly the columns #61 asked for: `org_id, site_id, worker_id,
  work_date, status, overtime_hours, approved_at, approved_by`. One row per entry of an `approved` day,
  all four statuses. `work_date` is `attendance_date`; `approved_at` / `approved_by` are the day's review
  stamp. Corrections are already applied, because an approved correction writes the entry (ADR-030 D8).
  More columns later are a `create or replace view` that appends.
- **D3 · Wage readers see every approved day.** Two SELECT policies, `attendance_days_select_wages`
  (`status = 'approved' and can_view_wages(org_id)`) and `attendance_entries_select_wages`
  (`can_view_wages(org_id)` and the entry's day is approved), add to the `has_site_access` ones. The owner
  and the accountant read every approved day of their organisation; nothing open or rejected is widened,
  no other role gains anything, no write grant changes. Rejected: leaving RLS alone (the silent
  undercount) and a `SECURITY DEFINER` wage function reading the tables directly (breaks rule 4).
- **D4 · `site_exceptions` is one row per exception**, with a `kind`: `geofence_check_in`,
  `geofence_check_out`, `visit_not_closed` (no check-out, checked in before today, IST),
  `day_awaiting_review`, `day_rejected`, `correction_pending`. Read from Attendance's own tables only.
- **D5 · No "attendance missing" kind.** There is no working calendar, so it would fire on every Sunday,
  holiday and paused site.
- **D6 · Columns:** `org_id, site_id, exception_date, kind, source_id, worker_id, raised_by, reason,
  distance_m, changed_since_review, raised_at`. No coordinates. `exception_date` is the day's date, or the
  IST date of the check-in for a visit; the view has no time window, a screen filters by date.
- **D7 · A fixed rejected day** shows `changed_since_review = true` when any of its entries has
  `updated_at > reviewed_at`. No new column.
- Writing through either view is refused (no write grant; neither view is automatically updatable, so
  Postgres answers `55000` before it checks the grant).

**Consequences.** Wage Summaries reads one published view and never re-implements corrections, and an
accountant's wage run covers every site. A reviewer has one list for the day's loose ends. Costs: an
accountant with no site assignment can now read every approved day's statuses, overtime and notes in
their organisation (the payroll job needs them); an approved correction can change a day already inside
a locked wage period, and the view shows the new value, which #61 must handle; `site_exceptions` grows
without bound (geofence rows never resolve) until a screen filters by date; `visit_not_closed` depends
on `now()`, so the same row appears at IST midnight without any write; `changed_since_review` cannot tell
a real fix from an edit that changed nothing material.

---

## ADR-033 · Attendance sync handlers: replay before permission, the lock answered in the handler
**Date:** 2026-10-20 · **Status:** Proposed · **By:** Manish (issue #28, PR 3b of 3; contract agreed with Nikhil on #13; review: Anuradha)

**Context.** `sync_push` routes `site_visits`, `attendance_days`, `attendance_entries` and
`attendance_corrections`, but no attendance handler exists, so all four entities answer
`retryable_error` / `handler_unavailable`. The lock from ADR-030 raises `PS409`, and `sync_push`
has no clause for it yet, so a stale phone would retry forever. #13 agreed the handlers are
`sync_<table>(p_record_id uuid, p_payload jsonb) returns sync_result`, `SECURITY INVOKER`, and
Daily Reporting's handlers (ADR-022) set the pattern: validate, answer a replay, write under RLS.
ADR-031 is held for #90 and ADR-032 is taken by #95, so this one is ADR-033.

**Decision.**
- **D1 · The handler answers `PS409` itself.** In `sync_attendance_entries`, the only handler whose
  writes the lock can refuse, the insert and the update each sit in a block that catches `PS409` and
  returns `('conflict', 'locked')`; the block rolls the refused write back, so nothing is left.
  `sync_attendance_corrections` has the same catch defensively, though nothing raises it there today;
  visits and days cannot reach `PS409`. We do not edit `sync_push` (Nikhil's module). The catches go
  once his router clause lands.
- **D2 · A visit push is the whole visit**, check-in always and check-out when there is one, because
  the outbox keeps only the latest save per record (ADR-022). The handler inserts the check-in if
  missing, then sets the check-out once. It compares only the fields the payload carries (ADR-021
  D6), so replaying the check-in after the check-out is `accepted`. It answers two conflicts itself:
  `checked_out` (the visit already has another check-out) and `different_visit` (this id holds
  another check-in).
- **D3 · A second phone is a conflict only when it disagrees.** An entry for the same worker and
  day under another id (ADR-021 D5) with the same status, overtime and note is `accepted`; with
  different values it is `conflict` / `duplicate`, and the first writer wins.
- **D4 · A `23503` that can never resolve is `rejected`.** The handler reads the constraint name
  (`GET STACKED DIAGNOSTICS`): the site FKs and `attendance_entries_worker_fk` mean "not in this
  organisation" and are re-raised as `22023`, as in ADR-022 H3. A missing day or entry stays
  `23503` (`retryable_error` / `missing_parent`), because it can still arrive in the same outbox.
- **D5 · Replay before permission**, as ADR-022 H6 and Materials (ADR-017). Four `SECURITY DEFINER`
  matchers (`site_visit_matches`, `attendance_day_matches`, `attendance_entry_matches`,
  `attendance_correction_matches`), outside the public surface but executable by `authenticated`
  because the handlers run as the caller, compare only a row the caller wrote and return a boolean.
  A phone that missed an answer still hears `accepted` after losing the site. An entry is the one
  row someone else can change after the caller wrote it (another supervisor, or an approved
  correction), and `recorded_by` does not move, so `attendance_entry_matches` also requires
  `updated_at = created_at`: it answers only while the entry holds exactly what the caller wrote.
  Without that, a caller who lost the site could call it through `/rpc` with guessed values and
  learn what others wrote (found in the security review of this PR).
- **D6 · An entry update that changes 0 rows is never `accepted`.** The update policy hides an
  approved day's entries, so the `UPDATE` matches nothing and raises nothing (ADR-030). The handler
  re-reads the day: `approved` is `conflict` / `locked`, anything else is `42501`. This is the
  "stale device cannot overwrite an approved day" case from ADR-009.
- **D7 · The branch is cut from `origin/main`, independent of #95.** The handlers need nothing from
  the views; only the module-4 note and this list share files, and whichever merges second
  resolves those small text conflicts.
- **D8 · The phone's dates and times are read as written, never on the server's clock.**
  `attendance_date` must be `YYYY-MM-DD`, and `check_in_at` / `check_out_at` ISO 8601 (`22P02`),
  because a bare cast would take `today`, `now` or `epoch` and read the server's clock (ADR-021 D7).
  Numbers are cast to their column's precision (coordinates to 6 decimals, overtime to 2), so the
  value a replay is compared on is the value stored.

**Consequences.** Attendance captured offline is accepted end to end on the server, a replay never
writes, and a stale phone cannot overwrite an approved day. Costs: the `PS409` catch sits in
`sync_attendance_entries` (twice) and, defensively, in `sync_attendance_corrections` until Nikhil's
router clause lands (#96 added it and has merged, so the catches are now redundant but harmless; a small follow-up removes them); four definer matchers are executable by `authenticated`, though each speaks
only about the caller's own rows; the replay of a supervisor's own unanswered entry edit, after they
lose the site, is `rejected` / `permission_denied` instead of `accepted` (D5); a second phone that marked a
worker differently hears `conflict` / `duplicate`; a supervisor unassigned while offline cannot
check out, since check-out is a write under RLS (the ADR-021 cost); the race in D6, a day approved
between the read and the update, is handled in code but not covered by a test, as the SQL suites
run on one connection; and order inside the outbox matters only for latency, since an entry that
arrives before its day retries with backoff and then lands.

---

## ADR-035 · Wage Summaries: a snapshot per period, one day per worker per date, locked means frozen
**Date:** 2026-10-20 · **Status:** Proposed · **By:** Manish and Ishant (issue #61; proposals 1-9 posted by Ishant 2026-10-19, Manish's answers on the same issue; review: Anuradha)

**Context.** Issue #61 left five decisions open (leave, overtime, hourly workers, rounding, overlap), and Ishant
proposed nine answers against what Attendance stores: a status, `overtime_hours` 0 to 8, no hours-worked column
(ADR-021), and `approved_attendance_days` (ADR-032). Checking them against that view found two things the proposals
did not cover: one worker can have an approved entry at two sites on the same date (entries are unique per site,
date and worker, and a worker may be open at several sites), and an approved correction, or a day approved late,
changes what the view shows for a date inside a locked period (ADR-032 consequences).

**Decision.**
- **D1 · Leave is unpaid.** `leave` and `absent` pay 0. A paid leave day is an adjustment with a reason.
- **D2 · Payable days are per worker per date, capped at 1.** `present` is 1, `half_day` 0.5, summed across sites and
  capped at 1 on a date, the earlier site (by site id) using the day first. Overtime hours add across sites and are
  capped at 8 paid hours a date (`wage_max_overtime_hours()`), the earlier site again first; the hours as recorded are
  kept beside the hours paid.
- **D3 · Hourly workers use a standard 8-hour day.** `present` is 8 h, `half_day` 4 h, times the hourly rate. No Attendance
  column is added (ADR-030: it would have to flow through corrections). The 8 is `wage_standard_day_hours()`.
- **D4 · Overtime is hours x hourly basis x 2.** The basis is day rate / 8 for a daily worker, the rate for an hourly one.
  The 2 is `wage_overtime_multiplier()`, fixed in the MVP. **The 2 has not been checked against state rules.**
  Overtime is hours beyond the normal day (beyond 4 on a half day); Attendance does not define it, so this is the definition.
- **D5 · The rate is the one in force that day**, `worker_rate_on(worker, work_date)`. A payable day with no rate is
  "no rate", never 0, and blocks `lock_wage_period`. A `leave` or `absent` day needs no rate.
- **D6 · Rounding.** Each day's amount is kept unrounded; a line's pay and overtime are each rounded once, to the paisa
  (`numeric(12,2)`), and the total is pay + overtime + adjustments. The export prints the same figures as the screen (one
  formatter, summed in whole paise).
- **D7 · Periods of one organisation do not overlap**, by an exclusion constraint on `daterange(start, end, '[]')`
  (needs `btree_gist`). A week is 7 days from any start; a month is a whole calendar month.
- **D8 · A period is per organisation**, one line per worker, with a per-site breakdown of the days and overtime hours
  paid (`wage_summary_by_site`). Amounts live on the worker line.
- **D9 · Pay type** is fixed once a worker has a rate (ADR-011 W11), so the basis of every past rate is known.
- **D10 · A locked period is a snapshot.** `wage_line_days` keeps, per worker, site and date, the status and hours
  Attendance published, the rate and the day's amounts. A locked period never re-reads the view; a trigger refuses any
  write to its lines, days or adjustments, the table owner included. `lock_wage_period` recalculates first, so the
  snapshot is the view at the moment of the lock.
- **D11 · Attendance changing after the lock is reported, never applied.** `wage_period_attendance_changes(period)`
  compares the snapshot with the live view: `changed` (a correction or a rate) and `approved_after_lock` (a day approved
  after the lock). The difference is paid as an **adjustment with a reason in the next open period**, or the owner
  reopens. Attendance does not refuse corrections for locked dates: it cannot read `wage_periods` (dependencies point
  down), and the record would stay wrong.
- **D12 · Who.** `owner` and `accountant` (`can_view_wages`) create periods, calculate, lock and add adjustments. Only
  the `owner` reopens, with a reason of 1-500 characters; an accountant gets `42501`, the same as anyone else. A project
  manager and a supervisor read zero rows of every wage table and view.
- **D13 · Tables and one Workforce view.** `ARCHITECTURE.md` named `wage_periods` and `wage_lines`; the issue's
  "adjustment and reopen history" and the per-day snapshot add `wage_line_days`, `wage_adjustments` and
  `wage_period_reopens`. Adjustments and reopens are append-only for every writer. Lines and days are computed by
  `SECURITY DEFINER` functions that check the caller; no client can write them. Nothing is ever deleted. Wage Summaries
  reads Workforce through `worker_rate_on` and a new published view, `worker_pay_basis` (`id, org_id, code, full_name,
  pay_type`, `security_invoker`), never the private `workers` table. `worker_roster` could not serve: it is one row per
  assignment and follows site access, so an accountant with no assignment reads nothing from it. The view belongs to
  Workforce (Ishant) and is listed in `ARCHITECTURE.md`.
- **D14 · A period is locked only after it has ended.** `lock_wage_period` refuses (`55000`) while the period's end date
  is today or later in Asia/Kolkata, so no later approval lands outside a snapshot of a week that was still running. A
  day approved after the lock for a date inside it still shows as `approved_after_lock` (D11). Open days before the end
  date are not checked: Wages cannot see them (it reads approved attendance only), so managers finish their approvals
  first.
- **SQLSTATEs.** `42501` not permitted (also for a period that does not exist); `55000` the period is locked, is not
  locked (reopen, changes), or has payable days with no rate; `22023` a blank or over-long reopen reason; `23514` a bad
  period shape, a zero amount or a bad adjustment reason; `23P01` an overlapping period; `23503` an adjustment for a
  worker with no line. An adjustment is at most 10,00,000 rupees either way, so a line total always fits
  `numeric(12,2)`.

**Consequences.** Wage Summaries reads one published Attendance view, one Workforce view and one Workforce function, and
never re-implements corrections, and a locked wage run can be reproduced for any date. Costs: a worker with no entry and
one marked absent both pay 0 and the summary cannot tell them apart; an hourly worker who works 6 hours must be marked
`half_day`, or is paid 8; a worker with no attendance in a period has no line, so no adjustment can be added for them in
it; the caps give a day and the first 8 overtime hours to the first site by id, which is arbitrary but stable; a correction
after a lock needs a person to notice the report and add an adjustment, nothing is paid automatically; a draft
recalculation only upserts, so it relies on an approved day never leaving `approved_attendance_days` (true today: ADR-030);
`btree_gist` is created in `public`; the web export writes its own minimal `.xlsx` (no library); the after-lock report
shows at most 1000 changes and says so; and the overtime multiplier of 2 is unverified, which is why this ADR stays
Proposed until it is checked against the state rules and Ishant agrees on #61. `wage_lines` and `wage_line_days` are a
derived snapshot, upserted while a period is a draft and frozen once locked; only `wage_adjustments` and
`wage_period_reopens` are ledgers.

---

## ADR-040 · Nobody reviews a day they recorded or a correction they proposed, checked in the review functions
**Date:** 2026-10-20 · **Status:** Proposed · **By:** Manish (issue #80 AC 3; the web screen is PR #100; review: Anuradha)

**Context.** `review_attendance_day` and `review_attendance_correction` (ADR-030 D5) checked only
`can_review_site`. "Nobody reviews a day they recorded" held because recorders (`supervisor`) and
reviewers (`owner`, `project_manager`) are different roles, and one person has one role per
organisation. An owner can change a member's role (`grant update (role) on memberships`), so a supervisor
made a project manager could approve or reject days they recorded, and nothing in the database said no.
The web pages hide the controls (ADR-039 W8), which is presentation only.

**Decision.**
- **S1 · The check is in the two functions**, right after the permission check, so it answers before any
  state rule (a blank reason, "an approved day cannot be rejected") and before the no-op for an already
  decided record. It is `42501`, the same as "not yours", so the web messages and the router are unchanged.
- **S2 · A day** is refused to a caller who opened it (`attendance_days.recorded_by`) or who recorded any
  of its entries (`attendance_entries.recorded_by`, same site and date).
- **S3 · A correction** is refused to its proposer (`proposed_by`), also when it is already decided.
  It is **not** refused for a day the caller recorded: that is a different act on a different row, and the
  day was approved by someone else. This matches the web page, which tests the same two things.
- **S4 · No new column, table, grant or role.** The two functions are replaced (`create or replace`) with
  their bodies plus the check; grants and `SECURITY DEFINER` / `search_path` are unchanged.

**Consequences.** The rule is now a database fact, so a hand-made call by a promoted supervisor fails and
leaves no audit row. Costs: a person who recorded on a site and is later made a reviewer can never review
those days, and if they are the only reviewer, the owner must; an entry a reviewer recorded blocks the whole
day for them, even if a colleague opened it; the check reads `attendance_entries` on every day review (an
indexed lookup on site and date); and it binds only the recorder's own account, so a person with two
accounts is not stopped, which no database rule can do.

**Known gap: an edit is not recording.** `attendance_entries.recorded_by` never moves on an update, and
any supervisor assigned to the site may edit another supervisor's entry on a day that is not approved. If
supervisor A opens a day and records it, B changes several entries, and B is later made a project manager,
B may review that day even though B wrote some of its figures. Closing it needs an `updated_by`-style column
on `attendance_entries`, or a read of `audit_log`, which another module owns; either is a decision of its own
and is not in this change. `attendance_self_review_test.sql` [3.09] pins today's behaviour, so the gap is on
record and a later fix changes that case on purpose. A day the reviewer opened that has no entries is
refused ([2.12b]), so the opener rule stands on its own.

---

## ADR-039 · Web review of attendance: one list, one detail page, no new write, and a self-review gap the database does not close
**Date:** 2026-10-20 · **Status:** Proposed · **By:** Manish and Anuradha (issue #80; reviewer: Ishant)

**Context.** The database side of Attendance review is on `main` (ADR-030, ADR-032) but no screen
uses it, so a day stays `open` until someone calls the functions by hand. Issue #80 asks for the
manager's screen, shaped like the daily-report review (ADR-025), and says "nobody reviews a day
they recorded". `review_attendance_day` and `review_attendance_correction` check only
`can_review_site`; they never compare `recorded_by` or `proposed_by` with the caller. The rule holds
today because the role sets are disjoint (`can_record_on_site` is `supervisor`, `can_review_site` is
`owner` / `project_manager`, one membership per person per organisation), but an owner may change a
member's role, so a supervisor made a project manager can review days they recorded.
ADR-031 is held for #90 and ADR-034 to ADR-038 are taken, so this one is ADR-039.

**Decision.**
- **W1 · Routes.** `/attendance?org=` is the list and `/attendance/[id]?org=` the day (its id is the
  day's id), as `/reports`. `/attendance` joins `SIGNED_IN_ONLY`, and the dashboard links to it for
  `owner` and `project_manager` only.
- **W2 · No new write, no migration.** The pages write only through `review_attendance_day` and
  `review_attendance_correction`, and never through `.from(...)`. They add no table, view, policy or grant.
- **W3 · What a row is.** One row per (site, date): the day when there is one, plus a row for a date that
  has flagged exceptions and no day (a visit with no attendance opened), which has no link. Reads are
  `attendance_days`, `site_exceptions`, and on the day page `attendance_entries` and
  `attendance_corrections`, all under the viewer's RLS; site names come from `site_directory` (ADR-025
  W1) and worker names from `worker_roster`, de-duplicated by worker. Membership is checked with
  `is_org_member`, and whether to draw the buttons with `can_review_site`.
- **W4 · Needs review** is the default filter: a day that is `open`, or `rejected` and edited since
  (`changed_since_review`, ADR-032 D7), or has a pending correction. A geofence or not-closed exception
  on an approved day does not count, because those rows never resolve (ADR-032 consequence), and nor does
  a date that has only such a flag and no day at all: it has nothing to approve and no way to clear the
  flag, so it shows under "All" only. Rows are newest date first; within a date, flagged rows, then rows waiting,
  then site name.
- **W5 · Time.** "Today", the default range and every timestamp are Asia/Kolkata and say IST (ADR-021),
  unlike the reports pages, which are UTC. The default range is the 31 days ending today, and the longest
  is 31, because a day left unreviewed for ten days is exactly what a manager must see.
- **W6 · Reason.** One form per decision with Approve and Reject buttons and one reason box. A reject with a
  blank reason, and any reason over 500 characters after trimming, is refused before the database is
  called; an approve may carry a note. Errors are fixed messages chosen by SQLSTATE
  (`42501`, `22023`, `55000` with separate texts for a day and a correction); `28000` goes back to sign-in.
- **W7 · No names of people.** A day or correction by the viewer says "you"; others say nothing
  (ADR-025 W7).
- **W8 · AC 3 in this PR is presentation.** The day's Approve / Reject form is drawn only when the viewer
  neither recorded the day nor any of its entries, and a correction's only when the viewer did not propose
  it; otherwise the page says someone else must review. The database check is **not** part of this PR.
  The follow-up is PR #101 (ADR-040): a migration that makes both functions answer `42501` for a self-recorded day or a
  self-proposed correction, with SQL tests, as its own PR for Attendance's owner.
- **W9 · Where decided.** Corrections are decided on the day's page, one small form each, not on a page of
  their own.

**Consequences.** A manager can see what needs a look and decide it, and the same wording and layout as
the report review makes the two screens feel alike. Costs: until the follow-up migration lands, AC 3's
"nobody reviews a day they recorded" is true only by role separation and by the hidden buttons, and a
promoted supervisor who posts the form by hand is accepted; an accountant can open `/attendance` and read
approved days (ADR-032 D3) but never sees a control; the list reads all days of a 31-day window (capped at
1000, a cap that 20 sites do not reach) and two ordered exception queries of up to 1000 rows each (waiting
corrections and sent-back days apart from geofence and not-closed flags, so a flood of flags cannot push a
waiting correction out); the site, the dates and open / rejected / approved are filtered in the database,
but "Needs review" and "All" are applied after the read, so when a cap is reached the oldest rows are the
ones cut, and they may need review (the page says which cap was hit); an exception-only row cannot be
opened; the list shows no per-day entry counts; the decision logic in
`lib/attendance` and the two actions (mocked client) have unit tests, but no test renders a page or the
form, and none has been driven against a real Supabase project.
## ADR-034 · Sites web, part 1: list, create, edit, status and archive, with no new database surface
**Date:** 2026-10-20 · **Status:** Proposed · **By:** Manish (issue #78, PR 1 of 2; review: Ishant)

**Context.** The Sites tables, policies and `archive_site()` are merged (ADR-007) but no screen
exists, so a site can be made only in SQL. #78 also asks to assign and remove supervisors, which
needs member names. `profiles` is readable only by its own user and Identity has not yet published a
member-names view (on no branch on 2026-10-20), so #78 is split: this PR is everything that needs no
names; PR 2 is assignment, after Identity's view.

**Decision.**
- W1. Routes: `/sites?org=` (list), `/sites/new?org=` and `/sites/[id]?org=` (edit, status, archive).
  `/sites` joins `SIGNED_IN_ONLY`. A viewer is let in only when Identity's `can_manage_sites(org)` is
  true; the dashboard shows the link to `owner` and `project_manager` only. This is presentation; RLS
  and `archive_site` repeat the check.
- W2. The pages write only through the existing grants: `sites` insert of six columns (the grant also allows `status`, which is not sent), update of five
  detail columns, update of `status` alone, and `archive_site()`. No migration, no new view.
- W3. The insert does not read its row back. `has_site_access` is `STABLE`, so `insert(...).select()`
  would evaluate `sites_select` on a row its snapshot cannot see. A created site returns to the list.
  A new site is `planned` (the column default); the create form has no status field.
- W4. Status is a separate action from the details, so a status move cannot overwrite a concurrent edit
  and the audit row shows one changed column. `archived` is refused in code and by `sites_update`'s
  WITH CHECK. Edits and status moves filter on `id` and `org_id`; 0 rows reads as `site_not_allowed`.
- W5. Archive has a confirm step: a server-rendered view (`?confirm=archive`) that says what it does,
  with a POST button. Visiting it changes nothing. It calls `archive_site()` only.
- W6. Coordinates are plain decimals read to 15 places and rounded to the 6 the column keeps; the
  range is judged after rounding, as the database does. Radius is a whole number, 50 to 2000. Text is
  trimmed and counted in characters. All of it is checked in code first to give a specific message; the
  database CHECKs stay the boundary.
- W7. "Find on map" is a Google Maps link built from validated numbers, `rel="noopener noreferrer"`.
  Coordinates leave the app only when someone clicks it.
- W8. The pages read no Identity table (ADR-025 W3), so the heading shows no organisation name.
- W9. Errors map by SQLSTATE to fixed codes in `lib/messages.ts` (`42501` forbidden, `23505` name
  taken, anything else generic).

**Consequences.** Owners and project managers can set up and retire sites without SQL, and the
Attendance, Reporting and Materials screens finally have sites to point at. Costs: assignment is not
possible from the web until PR 2, so a supervisor still gets a site through SQL; two managers editing
one site at once is last-write-wins (`updated_at` is not in the grant); an error on create or edit
returns to a form with its values cleared, as the Materials form does; archiving needs two clicks and
cannot be undone; a manager with several organisations sees no organisation name on these pages;
the "not read back" rule (W3) rests on reading the function's volatility, not on a test against a
real project; and the pages themselves are covered by unit tests of the actions and input rules only,
not run against a real Supabase project.
## ADR-034 · Attendance on the phone, PR 1: check in and out, offline, with the location read on the tap
**Date:** 2026-10-20 · **Status:** Proposed · **By:** Manish (issue #79, PR 1 of 3; review: Nikhil, because it touches the mirror and the outbox)

**Context.** #79 is the supervisor's side of ADR-021: check in with no signal, mark everyone, fix
exceptions, check out. It is too big for one PR. PR 1 is check in and check out; PR 2 is the day register
(mark-all and exceptions); PR 3 adds the approved-days mirror, the read-only approved day and corrections,
and closes #79. The mirrors already give the phone the assigned sites (with pin, radius and status) and the
roster by date (ADR-023), but not the site's `org_id`, which every Attendance payload names, and nothing of
what the server holds for a day. The server cannot take a check-in with no coordinates.

**Decision.**
- **D1 · Location.** Asked at the first check-in tap, after a screen that says why (once, on the tap, never
  in the background), then the phone's own prompt, foreground only. One `getCurrentPositionAsync` per tap
  and a 15 s limit of our own (the library has none). The `LocationProvider` interface has no watch and no
  background call. If the permission is denied, services are off, there is no fix or it fails, a reason is
  mandatory and the visit is sent at coordinates **0, 0** with the reason prefixed `Location not shared: `.
  The server then measures thousands of km, flags it outside and keeps the reason, so it is never silently
  accepted. Rejected: nullable coordinates with an explicit flag (a migration, an ADR-021 D8 change, a handler
  and `site_exceptions` change: a PR of its own, listed as a follow-up) and refusing a check-in without
  location (breaks the issue's AC 6).
- **D2 · Mark-all offline** (built in PR 2). The phone writes the records itself, as ADR-021 says: one
  `attendance_days` record, and one `attendance_entries` record per worker from `readRosterOn(site, date)` who
  has no local entry yet, status `present`, overtime 0, in one local transaction. It never overwrites an
  exception. Rejected: a bulk record (a new sync entity) and an online-only action.
- **D3 · The estimate.** The server's haversine on the six-decimal coordinates that are sent, against the
  mirrored pin and radius, "on the radius is inside". Inside saves at once; outside shows the distance, the
  limit and the GPS accuracy and saves nothing until a reason is given. The database decides: if the two ever
  disagree, the verdict `rejected` / `invalid_input` shows as needs attention, and "Add a reason and send again"
  re-saves the same record id (re-queued, ADR-016). The reason goes on the latest leg of the visit only, because
  changing an already accepted check-in would be `conflict` / `different_visit` (ADR-033 D2).
- **D4 · `org_id` on the mirror.** `mirror_sites.org_id`, device migration 5, nullable so a phone keeps the
  sites it holds; the pull selects it from `site_details` (it was already published) and a row without it fails
  the whole pull. A site with no `org_id` yet cannot be checked in to, and says "Connect once to refresh your
  sites". This is Offline Sync's file, changed additively here with Nikhil's review. `listRecords(db, author,
  entity, { siteId })` is added to `outbox.ts` the same way, so a screen can read its own records back; it
  never falls back to every user's rows (ADR-020).
- **D5 · An open visit from an earlier day** shows with its date, can be closed (with the time and place of
  that tap), and does not block a new check-in (ADR-021 D12).
- **D6 · Wiring.** `expo-location` (Expo's resolver, SDK 57), the plugin text in `app.json`. The attendance
  routes cannot reach the sync engine, which the home route starts, so a screen re-reads the outbox every
  3 s to show a verdict and a saved visit leaves on the next trigger (foreground, reconnect, 60 s). The home
  screen (`HomeScreen.tsx`, `app/index.tsx`, Offline Sync's) gets an optional Attendance button, shown only to a
  signed-in user. One tap runs at a time: a second tap while the first is still reading the location or saving
  does nothing, so a double tap cannot save two visits.
- **D7 · Words.** A visit says "Saved on this phone, waiting to send" until the record is `synced` (the server's
  `accepted` verdict), then "On the server"; `failed` is "Could not send yet. Will retry."; `conflict` and
  `rejected` are both "Needs attention" with a plain reason (#68). No raw code or error text is shown.

**Consequences.** A supervisor can check in and out with no signal, and the only record is an outbox row that
survives a restart. Costs: a no-location visit stores 0, 0 and a distance of thousands of km in the row and in
`audit_log`, and the reviewer sees "outside the fence" rather than "no location"; the estimate can differ from
the server at the exact edge and after a radius change; a visit has one outbox row, so a rejected visit whose
fault was in the check-in leg gets its reason on the check-out leg and is refused again; the phone does not know
the role, so an owner or project manager's check-in is sent and comes back `permission_denied`; the phone's
only knowledge of its own visits is the outbox, so a visit made on another phone, or before a reinstall, is not
shown; a screen's saved visit waits for the next sync trigger (up to a minute) until the engine is exposed
through a context; a phone updated offline shows "Connect once to refresh your sites" until one pull; and
the `FEATURES.md` module 4 row "Check in and check out; location captured only on that tap" stays unticked
until it runs on a phone against the team project (#58).

---

## ADR-036 · Daily report on the phone, PR 1: drafts and submits through the outbox, a reason for every change after submit
**Date:** 2026-10-20 · **Status:** Proposed · **By:** Anuradha (issue #81, spec on the issue; review: Manish)

**Context.** The server side of offline filing has been in place since #63 (ADR-022), but no screen on the
phone saved a report, so "Save as an offline draft" and "File a report" stayed unticked. The phone needs the
site's `org_id` for every report payload (ADR-022 H3), which the mirror gains in #102 (device migration 5);
this PR is stacked on it. Four things were open: where a draft lives, which day a report is for, when an edit
needs a reason, and what the screen may say before the server answers.

**Decision.**
- D1. **Drafts go through the outbox too**, as `daily_reports` with status `draft`. No local draft table and no
  device migration. A draft reaches the server, where only its author can see it (ADR-013 R1), and is later
  submitted under the same record id, which the handler already treats as an update. The phone keeps one record
  per author, site and IST day, and finds it again through `listRecords`, so a restarted app reopens the same
  report.
- D2. **The day is the phone's IST day.** The screen opens today's report. Earlier reports of this user that are
  still drafts, or that the server refused or kept its own version of (except a reviewed one, which is final), are
  listed under "Not finished" (at most ten) and open on their own day. A day in the future, or one that is not a calendar day, opens today.
- D3. **The phone repeats the database's limits before saving,** and writes nothing when one fails: headcount a
  whole number 0–1000, work done 4000, blockers 2000, plan 2000, reason 500 (ADR-013 R4). Text is counted in code
  points, as `char_length` counts it, not UTF-16 units. A submit needs headcount and non-blank work done. A
  serious blocker needs blocker text on a draft too, because `daily_reports_serious_blocker_explained` has no
  status condition. The server stays the boundary.
- D4. **Once submitted on this phone, every change needs a reason**, sent as `edit_reason`. The phone cannot tell
  whether the server already holds the submitted version (it may be in flight), and the handler's insert never
  reads `edit_reason`, so a reason sent ahead of the first submit is harmless. Save draft is gone after Submit,
  since a report cannot go back to draft. A change that changes nothing is refused on the phone. A report the
  server answered `conflict` / `reviewed` is read-only (ADR-013 R5).
- D5. **"Submitted" only for a submitted report the server accepted** (ADR-009). Waiting rows say "Saved on this
  phone, waiting to send"; a synced draft says "Draft on the server, only you can see it"; `conflict` and
  `rejected` say "Needs attention" with one fixed sentence per code (`reviewed`, `duplicate`,
  `different_report`, `invalid_input`, `invalid_state`, `permission_denied`), and the shared wording otherwise.
  No raw error text (ADR-029).
- D6. **A serious blocker or a safety incident shows a banner before submit** saying the report will be flagged
  to managers. In-app only (ADR-013 R3).
- D7. **Headcount is typed for now.** Pre-filling it from the day's attendance entries waits for the phone's
  mark-everyone-present (#79); it is a follow-up, and the "File a report" row stays unticked until then. *The pre-fill
  is in #109 (ADR-038); it counts entries once the phone records them.*

**Consequences.** A supervisor can save, finish and submit a report with no signal, and the only record is an
outbox row that survives a restart. Costs: every draft save is also sent, so the server holds the author's
drafts and `audit_log` records each one (ADR-013 already notes the owner can read draft text there); a second
supervisor's report for the same site and day is answered `conflict` / `duplicate` and has to be sorted out by a
manager, since the phone cannot see the other report; a reason is asked for an edit the server may never have
seen, and is then dropped by the insert; the phone knows only its own outbox, so a report filed on another phone
or before a reinstall is not shown, and a second report for that day would be a duplicate; a lookup scans at most
400 of the user's reports per site, newest first; photos are #81 PR 2; and the time-to-submit telemetry in the PRD
is not built.

---

## ADR-037 · Report photos on the phone: compress to JPEG, metadata through the outbox, the file after it is accepted
**Date:** 2026-10-20 · **Status:** Proposed · **By:** Anuradha (issue #105, part 2 of #81; review: Manish, and Nikhil for the engine hook)

**Context.** The server side of photos has existed since #35 and #63: `report_photos` rows, `sync_report_photos`
(ADR-022 H7) and the private `report-photos` bucket, where Storage takes a file only at the exact path of a metadata
row its uploader made (ADR-013 R8). The phone had nothing to take, keep or send a photo. A photo must never block its
report, must work with no signal, and must not go out under another user's session on a shared phone (ADR-020).

**Decision.**
- P1. **Compress on the phone to a JPEG,** long side at most 1600 px, quality 0.7, with `expo-image-manipulator`. The
  picker takes images only, one at a time, with no cropping (`expo-image-picker`). So every stored photo is
  `image/jpeg` and `.jpg`, and a small photo is re-encoded, never enlarged. Over 10 MB after compressing is refused.
- P2. **Metadata first, file after.** A photo is an outbox record of entity `report_photos`, saved after its report so
  the report is sent first (ADR-016). Its `storage_path` is `<org>/<site>/<report>/<photo>.jpg`, lower case, built from
  the report's own org and site, as `report_photos_path_shape` requires. Before the report arrives the handler answers
  `retryable_error` / `missing_parent` and the outbox retries.
- P3. **An upload queue owned by Daily Reporting:** device migration 6, `report_photo_files`, one row per photo with
  its author, local file in the app's own folder (`Paths.document`), path, size, a state (`waiting`, `uploaded`,
  `refused`) and a backoff. It is additive and touches no other table.
- P4. **The sync engine calls a hook after each run** (`afterRun`, a generic option in Offline Sync's `engine.ts`), and
  the app passes Daily Reporting's uploader. The engine knows nothing about photos. The hook runs for the engine's user
  only, never while signed out, and its failures never reach the run's result. The uploader sends a photo only when its
  metadata is `synced`, reads the session once, refuses if it is not the author's, and sends that session's token (as
  the push does, ADR-020). An object that already exists is a replay and counts as uploaded. A 4xx other than 401, 408
  and 429 is terminal (`refused`); anything else retries with the outbox's backoff. A missing local file is `refused`.
- P5. **The limits are checked on the phone too:** ten photos a report and 10 MB each (ADR-013 R4). A photo may be added
  to a submitted or even a reviewed report (ADR-013 R8) and is never changed or removed.
- P6. **No caption yet** (`caption` is always null), and no way to remove an unsent photo.
- P7. **"On the server" only once the file itself is uploaded.** A synced record whose file still waits says "Photo
  waiting to upload" (ADR-009).

**Consequences.** A supervisor can take and queue photos with no signal, and a photo can never stop its report. Costs:
a photo's file is sent by a hook in Offline Sync's engine, so Nikhil owns that one option; the upload runs only when a
sync run runs (every minute, on reconnect and on foreground), so a photo can wait a minute after its metadata is
accepted; a refused photo stays on the phone with its file until someone clears it, since there is no removal yet; the
phone keeps the kept copy until the upload succeeds, so a phone that never reconnects holds up to ten 10 MB files per
report in its app folder; the 4xx rule treats an unknown refusal as final, so a wrongly refused photo is not retried;
the JPEG re-encode drops EXIF, which is intended but also loses the original's capture time; and the
`Paths.document` folder is not cleared when a user signs out, so a photo of user A that was never uploaded stays on
the phone until A signs in again (the queue row is A's, so B never sees or sends it).

---

## ADR-038 · Daily report headcount pre-filled from the day's attendance on the phone
**Date:** 2026-10-20 · **Status:** Proposed · **By:** Anuradha (issue #109, follow-up to #81 AC 2; review: Manish, because the reader is in Attendance's phone folder)

**Context.** ADR-036 D7 left the report's headcount typed until the phone recorded attendance. The
shape of an attendance entry on the phone is fixed by Attendance's handler (`sync_attendance_entries`,
ADR-033): `org_id`, `site_id`, `attendance_date`, `worker_id`, `status`, `overtime_hours`, `note`. So a
report can count the day's entries from the outbox now, and the count starts working the day the
phone's mark-all (ADR-034 D2, #79 PR 2) writes entries.

**Decision.**
- D1. **Attendance answers the count.** `readHeadcount(db, user, site, date)` lives in
  `apps/mobile/src/attendance/headcount.ts`, so only Attendance's code reads an entry's payload; the
  report screen calls it and never parses the record. It is read-only and additive, like ADR-034 D4's
  `listRecords`.
- D2. **On site means `present` or `half_day`**, counted once per worker by their newest entry.
  `absent` and `leave` are not counted. The half days are counted apart for the hint.
- D3. **Only the signed-in user's own entries** (ADR-020), through `listRecords`. An entry the server
  `rejected` was never stored and is not counted; a record without a text site, day and worker and
  one of the four statuses is skipped, as are another site and another day. The server stays the
  check on the rest of the payload.
- D4. **The count fills only a new report.** It is read once, when the form is first filled, never on
  the poll. A saved report (draft or submitted) keeps its own headcount, and a typed value is never
  overwritten. With no entry for the site and day the field stays empty, to be typed; with entries
  and nobody on site it starts at 0. A failed read leaves the field to be typed and never stops the
  report.
- D5. **The screen says where the number came from**: "From attendance on this phone: 14 on site
  (2 half day)", under the field, also beside a saved report so a difference shows. The field stays
  editable and every ADR-036 rule (limits, reason after submit) is unchanged.
- D6. **The scan stops at 3000** of the user's entry records for the site, newest first: about a month
  of a 100-worker site. An older day beyond that is typed.

**Consequences.** A supervisor who marked attendance on the phone opens the report with the headcount
already right, offline. Costs: until #79 PR 2 ships, no phone holds an entry, so in practice the field
is still typed; attendance recorded by another user or on another phone is not counted, and nor is the
server's copy; a count read when the report opened does not follow later attendance changes until the
screen is opened again; the outbox is never pruned, so the scan grows with the phone's history up to
its limit; and the "File a report" row in `FEATURES.md` stays unticked until mark-all runs on a phone
against the team project (#58).

---

## ADR-042 · A manager sends a daily report back with a reason; the author resubmits it with one
**Date:** 2026-10-20 · **Status:** Proposed · **By:** Anuradha (issue #114; amends ADR-013 R5; review: Manish, whose Attendance review this mirrors)

**Context.** A PRD P0 (CUJ-5) says a manager can approve **or reject** a daily report, with a comment.
ADR-013 R5 gave managers only `review_daily_report`, and said a manager who disagrees can only say so
in the review note. Attendance already sends a day back (ADR-030). The phone holds no server copy of
its reports (ADR-023 mirrors sites, materials and roster only), so it learns a report's state only from
a sync verdict.

**Decision.**
- D1. **A fourth status, `rejected`, shown as "Sent back"**, the word Attendance uses for a rejected day.
  The row keeps the latest decision in `reviewed_at`, `reviewed_by` and `review_note`, as a review does.
  A sent-back report always has a `review_note` (a constraint), and `daily_report_status` shows it.
- D2. **`send_back_daily_report(report_id, reason)`**, `SECURITY DEFINER`, `can_review_site`.
  - It refuses with one `42501`: no such report, no access, the caller's own report, or a draft. This is
    the same rule as `review_daily_report`, so nobody can probe for ids. A call with no signed-in user
    gets `28000`, as a review does.
  - The reason is required, trimmed, 1–1000 characters (`22023`).
  - A reviewed report is final (`55000`).
  - Sending back a report that is already sent back does nothing and keeps the first reason, so a
    retried call is harmless.
  - It never changes content: the guard trigger refuses a decision that does.
- D3. **`review_daily_report` refuses a sent-back report** (`42501`, as for a draft). It must be
  resubmitted first, so "reviewed" always means the manager saw the version they approved.
- D4. **Resubmitting is the author's ordinary update back to `submitted`.** The update policy and the
  column grants are unchanged.
  - It always needs a signed-in editor and an `edit_reason`, even when nothing else changed: the author
    may answer "the count was right".
  - It always writes a revision. Three new nullable columns on `daily_report_revisions`
    (`sent_back_reason`, `sent_back_by`, `sent_back_at`, all or none) name the send-back it answers, so
    every send-back stays in the history after the row moves on.
  - The first `submitted_at` is kept.
  - A sent-back report cannot go back to draft (`55000`).
- D5. **The guard trigger** allows a decision (`reviewed` or `rejected`) only from `submitted` (`55000`
  otherwise). A client still cannot set either status or any review column.
- D6. **Sync:** `sync_daily_reports` answers a push to a sent-back report that carries no edit reason
  with `conflict` / `sent_back`. A replay of the old submit, or a phone that has not heard, never
  resubmits it silently; without this the guard's `22023` would have been a terminal `rejected`. A push
  with a reason resubmits it, and a replay of that resubmit is `accepted` as before.
- D7. **Phone.** The verdict reads "A manager sent this report back…" and the report stays editable.
  A submitted report may now be sent again **unchanged** with a reason. The phone usually learns of a
  send-back from the web, not from a verdict, and on a report the server holds as submitted the same
  content is a replay that changes nothing. This drops the phone's `no_changes` refusal from #81.

**Consequences.** The P0's "reject, with a comment" is met on the server and the web, and every
send-back and answer is in the report's history. Costs:
- **The phone hears of a send-back late.** It finds out only when it next pushes that report. A
  supervisor sees it straight away on the web `/reports` list, but on the phone it needs a report pull,
  which is Offline Sync's (#49) to schedule.
- **Only the latest decision is on the row.** An earlier one is in the revisions and in `audit_log`.
- **A push that carries a reason can answer a later send-back.** This covers a stale queued edit, and a
  retried resubmit whose first answer was lost and which arrives after a second send-back. In both
  cases the report is resubmitted. The revision then names the newer send-back next to the older
  reason. A push with no reason never resubmits.
- **`/overview` (#113, ADR-041) has to learn the new status.** Whichever of the two PRs merges second
  updates it, or a sent-back report reads as "not filed" there.
## ADR-041 · The owner's overview: every site for one day, from published views only
**Date:** 2026-10-20 · **Status:** Proposed · **By:** Anuradha (issue #112, the dashboard half of the week 7–8 "Dashboard and attendance-day approval" line; review: Manish, who shares that line)

**Context.** A PRD P0 says an owner or project manager sees every site on one dashboard: who reported,
who did not, headcount, exceptions, estimated wages, low stock and safety alerts. `/dashboard` is only
the organisation list. Every figure but the wages is already in a published, `security_invoker` view:
`site_directory` (Sites, ADR-025), `daily_report_status` (Daily Reporting), `site_exceptions` and
`approved_attendance_days` (Attendance, ADR-032), `material_alerts` (Materials, ADR-015).

**Decision.**
- D1. **A new page, `/overview?org=&date=`**, linked from the organisation row on `/dashboard` for
  `owner` and `project_manager`. `/dashboard` stays the organisation picker. The link is presentation;
  RLS decides every row, so a supervisor who opens the URL sees only their sites and an accountant
  sees no site.
- D2. **Daily Reporting owns it** (`apps/web/src/lib/overview/`), and it reads only the five views above
  and `is_org_member`. This is Architecture rule 4 as written, so it is not a named exception like the
  data export (ADR-026). No table, view, function or migration is added, and nothing is written.
- D3. **Attendance's state comes from the published views only.** Sent back if `site_exceptions` has
  `day_rejected`, awaiting review if `day_awaiting_review`, approved if `approved_attendance_days` has
  a row for that site and date, otherwise not recorded. One day per site and date (ADR-021) makes these
  exclusive. The known gap is that an approved day with no entries leaves no row in
  `approved_attendance_days`, so it reads as *Not recorded*. Closing it needs a per-day status view
  published by Attendance, which is that module's decision.
- D4. **One day, in India time.** The date defaults to today in Asia/Kolkata (`istToday`, as
  `/attendance`); a malformed or impossible date falls back to it. Low stock is the balance now, since
  `material_alerts` has no date, and the page says so.
- D5. **Which sites are listed.** Every `active` site, plus a site in any other status that has a report,
  an attendance day or an exception that date. A quiet planned, paused, completed or archived site is
  not listed, and low stock alone does not list one.
- D6. **Order and summary.** A flagged report first, then no report, then no attendance, then anything
  to look at (a day awaiting review or sent back, an exception, low stock), then the rest; then site
  name and id. The summary counts "not filed" and "no attendance" over active sites only, and "waiting
  for a review" as unreviewed reports plus days awaiting review plus pending corrections.
- D7. **Estimated wages are left out.** A project manager may not read wage amounts (ADR-003,
  `can_view_wages`), and wage figures exist only for a calculated period (ADR-035), not for a day. An
  owner-only wages tile needs its own decision.
- D8. **Honest about gaps.** Each read has a cap and is ordered. A hit cap is said on the page, and a
  failed read shows only "could not be loaded", with no summary and no list, so a missing read never
  reads as "not filed" or "no attendance". The page says it shows only what has synced.

**Consequences.** An owner or project manager sees the day across every site on one page, and each
line links to where they act on it: the report, the attendance list for that site and day, the
materials page. `overview_reads_test.sql` pins what each of the five reads returns for every role and
another organisation. Costs: the zero-entry approved day in D3; the P0's estimated wages are not met
(D7); the page is read live on each visit, with no caching, which is five small queries; and it has
not been driven against a real Supabase project (#58).

---

## Template — copy this for a new decision

```
## ADR-00N · Short title
**Date:** YYYY-MM-DD · **Status:** Proposed | Accepted | Superseded by ADR-00M · **By:** name

**Context.** What situation forced a choice?

**Decision.** What we chose, in one or two sentences.

**Consequences.** What this makes easy, and what it makes hard. Be honest about
the cost — a decision with no downside is usually a decision not yet understood.
```
