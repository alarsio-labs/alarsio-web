-- Attendance & Site Presence: approved_attendance_days gains entry_id, the id of the
-- attendance entry each row comes from (#127, ADR-049 D1; appending a column is what
-- ADR-032 D2 allows).
--
-- Why: Offline Sync copies this view onto the phone (ADR-023) and pages by one key
-- column. The view had no single-column key: a row is one worker on one day of one
-- site, which takes three columns to say. attendance_entries.id is that key already.
--
-- The new column is last, so `create or replace view` keeps every existing column,
-- its position and its type, and the grants and security_invoker setting carry over.
-- Nothing else changes: same rows, same RLS (the caller's, through security_invoker).

create or replace view public.approved_attendance_days
with (security_invoker = true) as
select e.org_id,
       e.site_id,
       e.worker_id,
       e.attendance_date as work_date,
       e.status,
       e.overtime_hours,
       d.reviewed_at     as approved_at,
       d.reviewed_by     as approved_by,
       e.id              as entry_id
  from public.attendance_entries e
  join public.attendance_days d
    on d.org_id = e.org_id
   and d.site_id = e.site_id
   and d.attendance_date = e.attendance_date
 where d.status = 'approved';

-- Restated so the migration stands on its own: replacing a view keeps its grants, and
-- these two lines say the same thing as the migration that created it.
revoke all on public.approved_attendance_days from public, anon, authenticated;
grant select on public.approved_attendance_days to authenticated;
