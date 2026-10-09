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

## Template — copy this for a new decision

```
## ADR-00N · Short title
**Date:** YYYY-MM-DD · **Status:** Proposed | Accepted | Superseded by ADR-00M · **By:** name

**Context.** What situation forced a choice?

**Decision.** What we chose, in one or two sentences.

**Consequences.** What this makes easy, and what it makes hard. Be honest about
the cost — a decision with no downside is usually a decision not yet understood.
```
