-- Daily Reporting: grants, policies, the photo predicate and daily_report_status.
-- Owner: Anuradha. Issue #29. Decisions D4-D9 in ADR-013.
--
-- No DELETE or TRUNCATE grant anywhere. daily_report_revisions has no write
-- grant at all (only the guard trigger writes it), and report_photos has no
-- UPDATE grant: a photo is added, never changed.
--
-- Every policy calls a named predicate: has_site_access to read,
-- can_record_on_site to write, can_attach_report_photo (guards migration) for photos. Marking a report reviewed is not a policy: it is
-- review_daily_report(), in the next migration.

-- ---------------------------------------------------------------- grants

grant select on public.daily_reports to authenticated;
-- Columns a client may set. author_id comes from auth.uid(); the submit and
-- review stamps come from the guard triggers; 'reviewed' is refused below.
grant insert (id, org_id, site_id, report_date, status, headcount, work_done,
              blockers, serious_blocker, safety_incident, next_day_plan)
  on public.daily_reports to authenticated;
-- org_id, site_id, report_date and author_id never change. edit_reason is
-- write-only: the guard trigger moves it into the revision and clears it.
grant update (status, headcount, work_done, blockers, serious_blocker,
              safety_incident, next_day_plan, edit_reason)
  on public.daily_reports to authenticated;

grant select on public.daily_report_revisions to authenticated;

grant select on public.report_photos to authenticated;
grant insert (id, org_id, site_id, report_id, storage_path, caption, size_bytes, content_type)
  on public.report_photos to authenticated;

-- -------------------------------------------------------------- policies

-- A draft is the author's alone; a submitted or reviewed report is for anyone
-- with access to the site. An archived site stays readable.
create policy daily_reports_select on public.daily_reports
  for select to authenticated
  using (
    public.has_site_access(site_id)
    and (status <> 'draft' or author_id = auth.uid())
  );

-- Only the assigned supervisor files a report, as themselves, and never one
-- that is already reviewed.
create policy daily_reports_insert on public.daily_reports
  for insert to authenticated
  with check (
    public.can_record_on_site(site_id)
    and author_id = auth.uid()
    and status in ('draft', 'submitted')
  );

-- D4/D5: the author edits until the report is reviewed; managers never edit.
-- USING hides a reviewed report (0 rows) and WITH CHECK stops a client setting
-- 'reviewed'. An archived site fails can_record_on_site, so it is read-only.
create policy daily_reports_update on public.daily_reports
  for update to authenticated
  using (
    public.can_record_on_site(site_id)
    and author_id = auth.uid()
    and status <> 'reviewed'
  )
  with check (
    public.can_record_on_site(site_id)
    and author_id = auth.uid()
    and status in ('draft', 'submitted')
  );

-- Revisions and photos are as visible as their report. The subquery runs under
-- the caller's RLS, so a draft's photos stay hidden from managers.
create policy daily_report_revisions_select on public.daily_report_revisions
  for select to authenticated
  using (
    public.has_site_access(site_id)
    and exists (select 1 from public.daily_reports r where r.id = report_id)
  );

create policy report_photos_select on public.report_photos
  for select to authenticated
  using (
    public.has_site_access(site_id)
    and exists (select 1 from public.daily_reports r where r.id = report_id)
  );

create policy report_photos_insert on public.report_photos
  for insert to authenticated
  with check (public.can_attach_report_photo(report_id));

-- ------------------------------------------------------ daily_report_status
-- Published to other modules (the dashboard). security_invoker, so it runs
-- under the caller's RLS: a caller without site access gets zero rows, and a
-- draft never appears. In-app flag only: no push, email or SMS (AC 6).
create view public.daily_report_status
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
       -- D7: what a manager must see the same day.
       (r.serious_blocker or r.safety_incident) as flagged,
       r.blockers,
       r.submitted_at,
       r.reviewed_at,
       r.reviewed_by,
       r.review_note,
       (select count(*) from public.report_photos p where p.report_id = r.id) as photo_count
from public.daily_reports r
where r.status in ('submitted', 'reviewed');

revoke all on public.daily_report_status from public, anon, authenticated;
grant select on public.daily_report_status to authenticated;
