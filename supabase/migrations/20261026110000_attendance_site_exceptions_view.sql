-- Attendance & Site Presence: site_exceptions, the reviewer's list of what needs a look
-- (#28 PR 3a). Decisions D4-D7 in ADR-032.
--
-- One row per exception, read only from Attendance's own tables:
--   geofence_check_in / geofence_check_out  a visit leg flagged outside the geofence
--   visit_not_closed                        no check-out, checked in before today (IST)
--   day_awaiting_review                     a day still open
--   day_rejected                            a day sent back (ADR-030 D4)
--   correction_pending                      a correction not yet decided
-- No coordinates leave the view (D6): the distance is enough to judge a geofence case.
-- exception_date is the day's date, or the IST date of the check-in for a visit, so a
-- screen filters by date and the view has no window. security_invoker: every row
-- follows has_site_access on its table. The wage policies of the previous migration
-- add only approved days, which give no row here.

create view public.site_exceptions
with (security_invoker = true) as
select v.org_id,
       v.site_id,
       public.attendance_local_date(v.check_in_at) as exception_date,
       'geofence_check_in'::text                  as kind,
       v.id                                       as source_id,
       null::uuid                                 as worker_id,
       v.user_id                                  as raised_by,
       v.check_in_reason                          as reason,
       v.check_in_distance_m                      as distance_m,
       null::boolean                              as changed_since_review,
       v.check_in_at                              as raised_at
  from public.site_visits v
 where v.check_in_outside_geofence

union all
select v.org_id, v.site_id, public.attendance_local_date(v.check_in_at),
       'geofence_check_out', v.id, null, v.user_id,
       v.check_out_reason, v.check_out_distance_m, null, v.check_out_at
  from public.site_visits v
 where v.check_out_outside_geofence

union all
select v.org_id, v.site_id, public.attendance_local_date(v.check_in_at),
       'visit_not_closed', v.id, null, v.user_id,
       null, null, null, v.check_in_at
  from public.site_visits v
 where v.check_out_at is null
   and public.attendance_local_date(v.check_in_at) < public.attendance_local_date(now())

union all
select d.org_id, d.site_id, d.attendance_date,
       'day_awaiting_review', d.id, null, d.recorded_by,
       null, null, null, d.created_at
  from public.attendance_days d
 where d.status = 'open'

-- D7: a rejected day has no "resubmitted" flag; it was fixed if any of its entries
-- changed after the rejection. updated_at is the server's, set on insert and by
-- trigger on update, so an entry added after the rejection counts too.
union all
select d.org_id, d.site_id, d.attendance_date,
       'day_rejected', d.id, null, d.recorded_by,
       d.review_reason, null,
       exists (
         select 1
           from public.attendance_entries e
          where e.org_id = d.org_id
            and e.site_id = d.site_id
            and e.attendance_date = d.attendance_date
            and e.updated_at > d.reviewed_at
       ),
       d.reviewed_at
  from public.attendance_days d
 where d.status = 'rejected'

union all
select c.org_id, c.site_id, c.attendance_date,
       'correction_pending', c.id, c.worker_id, c.proposed_by,
       c.reason, null, null, c.created_at
  from public.attendance_corrections c
 where c.review_status = 'pending';

revoke all on public.site_exceptions from public, anon, authenticated;
grant select on public.site_exceptions to authenticated;
