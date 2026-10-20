-- Attendance & Site Presence: the approved-days view Wage Summaries reads (#28 PR 3a,
-- #61). Decisions D2 and D3 in ADR-032.
--
-- One row per entry of an approved day. Corrections are already applied: an approved
-- correction writes the entry itself (ADR-030 D8), so the view reads entries as they
-- stand and no reader re-implements correction logic. approved_at / approved_by are
-- the day's review stamp.

create view public.approved_attendance_days
with (security_invoker = true) as
select e.org_id,
       e.site_id,
       e.worker_id,
       e.attendance_date as work_date,
       e.status,
       e.overtime_hours,
       d.reviewed_at     as approved_at,
       d.reviewed_by     as approved_by
  from public.attendance_entries e
  join public.attendance_days d
    on d.org_id = e.org_id
   and d.site_id = e.site_id
   and d.attendance_date = e.attendance_date
 where d.status = 'approved';

revoke all on public.approved_attendance_days from public, anon, authenticated;
grant select on public.approved_attendance_days to authenticated;

-- D3. The view is security_invoker, so it follows has_site_access, and an accountant
-- reads only sites where they hold an open assignment. A wage period built from it
-- would silently miss every other site. These two policies let the wage readers
-- (can_view_wages: owner, accountant) read the approved days of their organisation,
-- and nothing that is open or rejected. They add to the existing select policies
-- (permissive policies are OR-ed); no write grant changes.
create policy attendance_days_select_wages on public.attendance_days
  for select to authenticated
  using (status = 'approved' and public.can_view_wages(org_id));

create policy attendance_entries_select_wages on public.attendance_entries
  for select to authenticated
  using (
    public.can_view_wages(org_id)
    and exists (
      select 1
        from public.attendance_days d
       where d.org_id = attendance_entries.org_id
         and d.site_id = attendance_entries.site_id
         and d.attendance_date = attendance_entries.attendance_date
         and d.status = 'approved'
    )
  );
