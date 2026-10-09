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

## Template — copy this for a new decision

```
## ADR-00N · Short title
**Date:** YYYY-MM-DD · **Status:** Proposed | Accepted | Superseded by ADR-00M · **By:** name

**Context.** What situation forced a choice?

**Decision.** What we chose, in one or two sentences.

**Consequences.** What this makes easy, and what it makes hard. Be honest about
the cost — a decision with no downside is usually a decision not yet understood.
```
