# Architecture

The full document with diagrams is `docs/reference/alarsio-technical-design.pdf`.
**This file is the working reference** — the rules you check against daily.

## Shape

One deployment, one PostgreSQL database, one monorepo. Nine modules for the MVP.
No message queue, no event bus, no second service.

```
apps/web (Next.js)  ─┐
                     ├─► Supabase: Postgres + RLS + Auth + Storage
apps/mobile (Expo)  ─┘    every request runs as the signed-in user
```

## The nine modules

| Module | Owns these tables | Depends on |
| :-- | :-- | :-- |
| **Identity & Access** | `organizations`, `profiles`, `memberships`, `invites` | — |
| **Sites** | `sites`, `site_assignments` | Identity |
| **Workforce** | `workers`, `worker_site_assignments`, `worker_wage_rates` | Identity, Sites |
| **Attendance & Site Presence** | `site_visits`, `attendance_days`, `attendance_entries`, `attendance_corrections` | Sites, Workforce |
| **Daily Reporting** | `daily_reports`, `daily_report_revisions`, `report_photos` | Sites, Attendance |
| **Materials & Inventory** | `materials`, `material_transactions` | Sites |
| **Wage Summaries** | `wage_periods`, `wage_lines` | Attendance, Workforce |
| **Offline Sync** *(platform)* | device SQLite outbox and read-only mirrors | Attendance, Reporting, Materials; reads Sites, Materials and Workforce views for the mirrors |
| **Audit, Retention & Guards** *(platform)* | `audit_log`, `purge_log`, `rate_limit_counters` | Identity |

Dependencies point **downward** only. Identity → Sites → field capture → wages.
A new arrow pointing up is a decision, not a shortcut.

## Public surface — what each module publishes

**Anything not listed here is private.** If you need something that is not on this
list, publish it deliberately and add it here in the same PR.

| Module | Functions others may call | Views others may read |
| :-- | :-- | :-- |
| Identity & Access | `is_org_member` · `is_org_owner` · `has_site_access` · `can_manage_sites` · `can_record_on_site` · `can_review_site` · `can_view_wages` · `create_organization` · `create_invite` · `accept_invite` · `revoke_invite` | — |
| Sites | `archive_site` | `site_timeline` (not built yet) · `site_geofence` · `site_directory` (name and status only; ADR-025) · `site_details` (the full site record, for the offline mirror; ADR-028) |
| Workforce | `import_workers(org, rows)` · `anonymize_worker` · `worker_rate_on` | `worker_effective_rates` · `worker_roster` |
| Attendance | `mark_all_present(site, date)` · `review_attendance_day(day_id, approve, reason)` · `review_attendance_correction(correction_id, approve, reason)` (both `SECURITY DEFINER`, `can_review_site`; ADR-030) · `sync_site_visits` · `sync_attendance_days` · `sync_attendance_entries` · `sync_attendance_corrections` (sync handlers; ADR-033) | `approved_attendance_days` (one row per entry of an approved day, corrections applied; owner and accountant read every site of their org; ADR-032) · `site_exceptions` (what needs a reviewer's look, no coordinates; ADR-032) |
| Daily Reporting | `review_daily_report(report_id, note)` · `sync_daily_reports` · `sync_report_photos` (sync handlers) | `daily_report_status` |
| Materials | `apply_material_transaction` · `sync_material_transactions` (sync handler) | `material_balances` · `material_alerts` |
| Wage Summaries | `calculate_wage_period` · `lock_wage_period` · `reopen_wage_period` | `wage_summary` |
| Offline Sync | `sync_push(batch)` · types `sync_verdict` and `sync_result`, which every handler returns | — |
| Audit & Guards | `write_audit` · `enforce_rate_limit(key, limit, window)` | — |

## The five ways modules may talk

Nothing else is permitted.

1. **Permission check** — an RLS policy calls a named predicate from Identity
2. **Named function** — one module calls a function another publishes
3. **Database trigger** — a write in one module causes a write in another
4. **Published view** — one module reads another only through a view
5. **Foreign key** — a row points at a row owned by another module

## Authorization

Row Level Security is the boundary. It runs inside PostgreSQL, so web, mobile and
any future client get the same answer.

```
signed-in user → auth.uid() → RLS policy on the table → named predicate → rows
```

**Four roles:** `owner`, `project_manager`, `supervisor`, `accountant`.

- A `supervisor` sees only assigned sites, and no wage data
- A `project_manager` reviews work but cannot read wage amounts
- An `accountant` may **lock** a wage period but never **reopen** one
- Only an `owner` may reopen a locked period

Privileged writes go through narrow `SECURITY DEFINER` functions that check the
caller themselves. **The service-role key is used nowhere in application code.**

## Offline sync

Every field write lands on the device first.

```
capture → local SQLite → outbox row (entity, record_id) → sync_push → verdict
```

`sync_push` returns a verdict **per record**, not one per batch:
`accepted` · `conflict` · `rejected` · `retryable_error`

Guarantees:
- A repeated push creates no duplicate
- One bad record does not block the rest of its batch
- The app never shows "submitted" before the server confirms
- A stale device cannot overwrite an approved day
- On a shared phone, a record is sent only under the session of the user who saved it (ADR-020)

`sync_push` is a **thin router**. It validates the envelope and delegates to the
owning module. No business logic lives there — logic placed there runs only on
phones.

Each record goes to its owning module's **handler**, one per table
(#13, ADR-014):

```
public.sync_<table>(p_record_id uuid, p_payload jsonb) returns sync_result
```

A handler is `SECURITY INVOKER`, so it writes under the caller's RLS. It decides
replay (`accepted`) against `conflict` for its own records. The module that owns
the table publishes the handler and lists it in its row of the public surface above.

A module may also hand the engine an `afterRun` hook, called after each push for the engine's user. Daily Reporting uses
it to upload report-photo files once their metadata is accepted (ADR-037). The engine stays ignorant of what the hook does.

The phone also **pulls** what the signed-in user may see (sites, material
balances, today's roster) into read-only mirrors, through published views only,
replaced whole on each pull and readable only by that user (ADR-023).
The sites mirror carries each site's `org_id`, which every Attendance payload names (ADR-034).
On the phone, one module reads another's outbox records only through a function the owner publishes in its own
folder: Daily Reporting pre-fills a report's headcount through Attendance's `readHeadcount` (ADR-038).

## Data export

The one read that crosses every module (ADR-026). An owner downloads their
organisation's data from `/export`: every table except `purge_log` and
`rate_limit_counters`, read **as the owner**, so RLS decides every row. It is a named
exception to rule 4 below: read-only, owner-only, and kept in
`apps/web/src/lib/export/`. A new table or column must be added to
`apps/web/src/lib/export/tables.ts` (or exempted with an ADR); a test fails until it is.

## What is deliberately not here

Approvals engine · Procurement · Projects and BOQ · Property Sales ·
Financial Reporting · Punch List · Notifications

These are post-MVP. **No MVP module may reference one.** If your design needs one,
the design is wrong for this release — raise it in `docs/DECISIONS.md`.

## Rules

1. One writer per table. To change another module's data, call its function.
2. No MVP module may call, join to, or read a module from a later release.
3. Ledgers stay append-only. Corrections are new rows.
4. Read another module only through a published view, and keep it `security_invoker`.
5. Keep `sync_push` a thin router.
6. Name every permission check. No policy compares a role inline.
7. Add a role only when a user cannot do their job without it. The MVP has four.
8. Constraints go in with the table, not after the bug.
