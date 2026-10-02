# What we are doing differently this time

The first version of this product worked, and shipped a lot. It also accumulated
specific, nameable problems. This file lists them and the decision we have taken
for each. **Every row here is a rule, not an aspiration.**

If you find yourself about to recreate one of these, stop and ask in the PR.

---

## 1. Module boundaries were a convention, not a wall

**Before.** Every table lived in one `public` schema. There was no `packages/`
directory, no import tooling, nothing that stopped one module reaching into
another's tables. The boundaries existed only in a document.

**Now.** Turborepo workspaces give us real package boundaries in TypeScript — a
package can only import what it declares. On the database side, each module owns
its tables and is entered only through the functions it publishes, and we review
for that explicitly. `docs/ARCHITECTURE.md` lists each module's public surface;
anything not on that list is private.

---

## 2. The permission matrix existed twice

**Before.** Roles and permissions were defined in the database as RLS predicates,
**and again by hand** in `apps/web/src/lib/permissions.ts` for route gating. Two
copies of one rule, which is how a route gate and a policy silently drift apart.

**Now.** The database is the only source of truth. `packages/types` generates
TypeScript types from the Supabase schema, and the web app derives its route
gating from those. One definition, one place.

---

## 3. Seven roles, one of which did not exist

**Before.** Seven roles were defined, and the code also checked an `is_founder`
condition that was not in the role list at all. Documents disagreed about whether
the owner or the founder approved spending.

**Now.** **Four roles**: `owner`, `project_manager`, `supervisor`, `accountant`.
Named once, in `docs/ARCHITECTURE.md`. A fifth role requires a decision record.

---

## 4. The sync function grew a branch per entity

**Before.** `sync_push` ended up with eleven `elsif` branches, one per entity
type, all in a single function. Every new field feature made it longer, and
business logic placed there ran only on phones.

**Now.** `sync_push` is a **thin router**: validate the envelope, then delegate to
the owning module's handler. Adding an entity adds a handler, not a branch.

---

## 5. Scope drifted and the docs did not follow

**Before.** The plan recorded phases 0–4 and 8. The migrations also contained
phases 5, 6, 7 and 9 — an entire approval engine, a seven-role model, BOQ,
property sales — that no plan document ever mentioned.

**Now.** `docs/FEATURES.md` is the single source of scope. **A PR that adds a
feature must update `FEATURES.md` in the same PR.** CI fails if a new module
appears without a row.

---

## 6. No test harness on mobile at all

**Before.** The mobile app had no tests. The one half of the product that must
work on a bad network was the one half with no automated verification.

**Now.** Mobile gets a test setup in week 1, before any feature. The offline
outbox is the first thing tested, not the last.

---

## 7. Known data bugs that were documented rather than fixed

**Before.** Two were written down and left in: overlapping payroll periods would
double-count labour, and the statutory wage register disagreed with the payslip.

**Now.** Constraints go in with the table, not after the bug. A period that
overlaps another is rejected by the database.

---

## 8. Features were built before anyone asked

**Before.** Statutory registers, property sales, procurement and BOQ were built
well ahead of any customer request.

**Now.** The MVP is **exactly the P0 set in `docs/PRD.md`** — nine modules,
nothing more. Anything else is a candidate in the roadmap, confirmed only after a
real contractor has used the product.

---

## 9. One person built it

**Before.** One contributor wrote the large majority of the code. That is a
single point of failure and it hides knowledge.

**Now.** Four owners, two modules each, every change through a reviewed PR. The
reviewer must be someone who does **not** own the module, so knowledge spreads by
construction.

---

## What we are keeping

Not everything needs changing. These were right the first time:

- **RLS as the authorization boundary.** It runs inside PostgreSQL, so every
  client gets the same answer. Keep it on every table and every view.
- **No service-role key in application code.** Never reintroduce one.
- **Offline-first capture with a durable outbox**, and a per-record verdict rather
  than one answer for a whole batch.
- **Append-only ledgers.** Corrections are new rows.
- **Secrets never committed.** The old repo had a clean history. Keep that record.
