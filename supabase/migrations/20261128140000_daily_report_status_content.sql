-- Daily Reporting: daily_report_status also publishes the report's two long texts,
-- work_done and next_day_plan, so the phone can mirror a whole report (#267).
-- Same columns, filter and security_invoker as 20261101100000; the new columns are
-- last, which `create or replace view` requires. edit_reason stays out: it is
-- write-only (ADR-013 R6). RLS beneath is unchanged: has_site_access(site_id) and
-- (status <> 'draft' or author_id = auth.uid()), so no one sees a row they could not
-- already read in daily_reports.

create or replace view public.daily_report_status
with (security_invoker = true) as
select r.id,
       r.org_id,
       r.site_id,
       r.report_date,
       r.author_id,
       r.status,
       r.headcount,
       r.serious_blocker,
       r.safety_incident,
       (r.serious_blocker or r.safety_incident) as flagged,
       r.blockers,
       r.submitted_at,
       r.reviewed_at,
       r.reviewed_by,
       r.review_note,
       (select count(*) from public.report_photos p where p.report_id = r.id) as photo_count,
       r.work_done,
       r.next_day_plan
from public.daily_reports r
where r.status in ('submitted', 'reviewed', 'rejected');
