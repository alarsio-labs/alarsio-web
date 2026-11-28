-- worker_advance_lines: one row per advance or reversal, for other modules to read.
-- Owner: Nikhil. Spec: #239 (ADR-054). ARCHITECTURE rule 4.
--
-- Wage Summaries needs the advances inside a period that does not start on the 1st, and
-- the phone mirrors this and last month's rows. worker_advance_totals groups by month, so
-- neither can use it. Both read this view instead of the ledger table.
-- security_invoker, so it reads with the caller's RLS: an owner or accountant sees the whole
-- organisation, a supervisor only the sites they are assigned to, a project manager nothing.
-- No recorded_by or created_at: no reader needs who typed the amount.

create view public.worker_advance_lines
with (security_invoker = true) as
select a.id,
       a.org_id,
       a.site_id,
       a.worker_id,
       a.paid_on,
       a.amount_paise,
       a.note,
       a.reverses_id
from public.worker_advances a;

revoke all on public.worker_advance_lines from public, anon, authenticated;
grant select on public.worker_advance_lines to authenticated;
