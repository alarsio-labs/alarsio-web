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

**Consequences.** A supervisor can run attendance without ever seeing pay. Rate
history is complete, so a wage summary can be reproduced for any past date. Costs:
`audit_log` records the old row on an update, so an anonymized worker's earlier name
stays in the log until the retention decision (#19) says how to purge it; the
`workers_select` policy tests `can_manage_sites` first because a row being inserted
is not yet visible to `has_worker_access`; and `import_workers` is not the published
function the architecture lists as `import_workers(rows)`, so ARCHITECTURE.md gains
the extra argument.

---

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

## Template — copy this for a new decision

```
## ADR-00N · Short title
**Date:** YYYY-MM-DD · **Status:** Proposed | Accepted | Superseded by ADR-00M · **By:** name

**Context.** What situation forced a choice?

**Decision.** What we chose, in one or two sentences.

**Consequences.** What this makes easy, and what it makes hard. Be honest about
the cost — a decision with no downside is usually a decision not yet understood.
```
