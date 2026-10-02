---
name: alarsio-module
description: Use when creating a new module in the Alarsio monorepo, or when adding a table, RLS policy, or migration to an existing one. Covers our migration naming, RLS pattern, module boundary rules and the files a module must have.
---

# Building a module in Alarsio

## Before anything

Read `docs/ARCHITECTURE.md` for the module's boundary and `docs/FEATURES.md` to
confirm it is in the MVP. Nine modules exist. There is no tenth.

## Migration

One file per change, never edit a merged one.

```
supabase/migrations/YYYYMMDDHHMMSS_short_description.sql
```

Structure every migration in this order:

```sql
-- 1. table
create table attendance_days (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations on delete cascade,
  site_id uuid not null references sites on delete cascade,
  work_date date not null,
  status attendance_status not null default 'draft',
  created_at timestamptz not null default now(),
  unique (site_id, work_date)
);

-- 2. RLS ON, always, immediately
alter table attendance_days enable row level security;

-- 3. policies, using NAMED predicates — never an inline role check
create policy attendance_days_select on attendance_days for select
  using (public.has_site_access(site_id));

create policy attendance_days_insert on attendance_days for insert
  with check (public.can_record_on_site(site_id));

-- 4. audit trigger
create trigger audit_attendance_days
  after insert or update or delete on attendance_days
  for each row execute function public.write_audit();
```

## The rules, restated

- **RLS on every table and every view.** No exceptions, not even temporarily.
- **Named predicates only.** `has_site_access(site_id)`, not `role = 'supervisor'`.
- **One writer per table.** Another module changes your data only by calling a
  function you publish.
- **Ledgers are append-only.** Add a `block_*_mutation` trigger; corrections are
  new rows.
- **Views are `security_invoker`**, so they never widen access.
- **Constraints go in with the table**, not after the bug.

## Publishing a public surface

If another module needs your data, publish it explicitly and list it in
`docs/ARCHITECTURE.md` under your module:

- A **view** for reads — `security_invoker`, named for what it answers.
- A **`SECURITY DEFINER` function** for writes — it checks the caller itself, and
  `revoke all ... from public, anon` at the end.

Anything not listed there is private. That is the whole contract.

## Tests the module must have

In `supabase/tests/<module>_test.sql`:

- The owner can do the thing.
- The wrong role **cannot** — assert zero rows, not just no error. Under RLS, an
  UPDATE with no matching policy affects zero rows and raises nothing.
- Every constraint: write the statement that should fail, and assert it does.

## Checklist before you open the PR

- [ ] Migration named with a timestamp, never edited after merge
- [ ] RLS enabled, policies use named predicates
- [ ] Audit trigger attached
- [ ] Types regenerated in `packages/types`
- [ ] Negative RLS test written
- [ ] `docs/FEATURES.md` row ticked
- [ ] Public surface listed in `docs/ARCHITECTURE.md`
