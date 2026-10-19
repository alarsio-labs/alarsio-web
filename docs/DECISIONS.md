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
- W7. The roster rule is `has_worker_access(worker)`: owner and project_manager
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
- W10. An accountant reads every worker of their organisation (name, code, trade,
  status), through `can_view_wages` inside `has_worker_access`. They already read
  every rate; without the names a rate is useless for paying anyone. They still
  cannot create, edit, assign or import (2026-10-18).

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
Costs: until sign-in exists the app syncs nothing; an end-to-end test needs a dev
Supabase project with the migrations applied; supabase-js adds about 0.8 MB to the
bundle; download of sites, materials and the roster to the phone is a separate,
still unplanned piece of Offline Sync; and the outbox does not record who captured a
row, so on a shared phone records saved under one user would be pushed under the
next user's session. That must be closed before sign-in ships (#14): tag each row
with its author and send only the signed-in user's rows, or block sign-out until
the outbox is empty.

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

## Template — copy this for a new decision

```
## ADR-00N · Short title
**Date:** YYYY-MM-DD · **Status:** Proposed | Accepted | Superseded by ADR-00M · **By:** name

**Context.** What situation forced a choice?

**Decision.** What we chose, in one or two sentences.

**Consequences.** What this makes easy, and what it makes hard. Be honest about
the cost — a decision with no downside is usually a decision not yet understood.
```
