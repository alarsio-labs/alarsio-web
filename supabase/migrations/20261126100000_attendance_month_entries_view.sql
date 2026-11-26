-- Attendance & Site Presence: the published view attendance_month_entries (#234, ADR-053 W1).
--
-- Why: the phone's worker month screen mirrors the last two months of entries (Offline Sync,
-- device migration 9). Sync reads only a module's published views (ARCHITECTURE rule 4), so
-- Attendance publishes one row per entry, with the status of the entry's day. The phone uses
-- day_status to lock an approved day older than the week approved_attendance_days covers.
--
-- Same shape rules as approved_attendance_days (ADR-032, ADR-049): security_invoker, so the
-- caller's RLS on attendance_entries and attendance_days decides which rows exist. A
-- supervisor sees their sites; an accountant sees approved days only. entry_id is the key the
-- phone pages by. note is last (ADR-032 D2): the phone keeps a note a supervisor wrote on a
-- mark, so a day changed from the month screen does not blank a note held only by the server.
-- The view is not filtered by date: the phone asks for the window it needs.

create view public.attendance_month_entries
with (security_invoker = true) as
select e.id              as entry_id,
       e.org_id,
       e.site_id,
       e.worker_id,
       e.attendance_date as work_date,
       e.status,
       e.overtime_hours,
       d.status          as day_status,
       e.note
  from public.attendance_entries e
  join public.attendance_days d
    on d.org_id = e.org_id
   and d.site_id = e.site_id
   and d.attendance_date = e.attendance_date;

revoke all on public.attendance_month_entries from public, anon, authenticated;
grant select on public.attendance_month_entries to authenticated;
