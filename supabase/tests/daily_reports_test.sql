-- Daily Reporting: daily_reports, daily_report_revisions, report_photos, the
-- lifecycle guards, the policies, daily_report_status, review_daily_report(),
-- the report-photos bucket and the audit triggers. Issue #29.
-- Positive and negative. Runs on the team runner (shim, no pgTAP).
begin;

-- Org A: alice owner, carol PM, dave accountant, bob and fred supervisors on
-- site 1, gina supervisor on site 2 only. Site 3 is archived.
-- Org B: eve owner, hank supervisor on site B.
insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-00000000000a', 'alice@x'),
  ('b0000000-0000-0000-0000-00000000000b', 'bob@x'),
  ('c0000000-0000-0000-0000-00000000000c', 'carol@x'),
  ('d0000000-0000-0000-0000-00000000000d', 'dave@x'),
  ('e0000000-0000-0000-0000-00000000000e', 'eve@x'),
  ('f0000000-0000-0000-0000-00000000000f', 'fred@x'),
  ('90000000-0000-0000-0000-000000000009', 'gina@x'),
  ('80000000-0000-0000-0000-000000000008', 'hank@x');
insert into public.organizations (id, name, created_by) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Org A', 'a0000000-0000-0000-0000-00000000000a'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Org B', 'e0000000-0000-0000-0000-00000000000e');
insert into public.memberships (org_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'owner'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000c', 'project_manager'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-00000000000d', 'accountant'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b', 'supervisor'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-00000000000f', 'supervisor'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000009', 'supervisor'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-00000000000e', 'owner'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '80000000-0000-0000-0000-000000000008', 'supervisor');
insert into public.sites (id, org_id, name, address, latitude, longitude, created_by) values
  ('51000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Site 1', 'x', 19.0, 73.0, 'a0000000-0000-0000-0000-00000000000a'),
  ('51000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Site 2', 'x', 19.1, 73.1, 'a0000000-0000-0000-0000-00000000000a'),
  ('51000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'Site 3 archived', 'x', 19.2, 73.2, 'a0000000-0000-0000-0000-00000000000a'),
  ('51000000-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-000000000002', 'Site B', 'x', 18.0, 72.0, 'e0000000-0000-0000-0000-00000000000e');
insert into public.site_assignments (org_id, site_id, user_id, assigned_by) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-00000000000a'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-00000000000f', 'a0000000-0000-0000-0000-00000000000a'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000002', '90000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-00000000000a'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-00000000000a'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '51000000-0000-0000-0000-0000000000b1', '80000000-0000-0000-0000-000000000008', 'e0000000-0000-0000-0000-00000000000e');
-- Archived directly, so bob keeps his assignment there and only the archive
-- status stops him recording.
update public.sites set status = 'archived', archived_at = now(),
  archived_by = 'a0000000-0000-0000-0000-00000000000a'
  where id = '51000000-0000-0000-0000-000000000003';

-- Reports (as superuser). R1: bob's submitted report on site 1. RB: hank's on
-- site B. R3: a submitted report on the archived site, from before it closed.
insert into public.daily_reports
  (id, org_id, site_id, report_date, author_id, status, headcount, work_done,
   submitted_at, submitted_by) values
  ('d1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001',
   '2026-10-14', 'b0000000-0000-0000-0000-00000000000b', 'submitted', 12, 'Slab poured', now(), 'b0000000-0000-0000-0000-00000000000b'),
  ('d1000000-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-000000000002', '51000000-0000-0000-0000-0000000000b1',
   '2026-10-14', '80000000-0000-0000-0000-000000000008', 'submitted', 5, 'Org B work', now(), '80000000-0000-0000-0000-000000000008'),
  ('d1000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000003',
   '2026-10-01', 'b0000000-0000-0000-0000-00000000000b', 'submitted', 3, 'Handover', now(), 'b0000000-0000-0000-0000-00000000000b');

-- ---------------------------------------------------------------- structure
do $$ begin
  perform test_assert(
    (select bool_and(relrowsecurity) from pg_class
      where oid in ('public.daily_reports'::regclass, 'public.daily_report_revisions'::regclass,
                    'public.report_photos'::regclass)),
    'RLS enabled on all three daily reporting tables');
  perform test_assert(
    not exists (select 1 from information_schema.role_table_grants
      where table_schema = 'public'
        and table_name in ('daily_reports', 'daily_report_revisions', 'report_photos')
        and grantee in ('PUBLIC', 'anon') ),
    'no grant to public or anon on any daily reporting table');
  perform test_assert(
    not exists (select 1 from information_schema.role_table_grants
      where table_schema = 'public'
        and table_name in ('daily_reports', 'daily_report_revisions', 'report_photos')
        and privilege_type in ('DELETE', 'TRUNCATE')
        and grantee in ('PUBLIC', 'anon', 'authenticated')),
    'no DELETE or TRUNCATE grant on any daily reporting table');
end $$;

-- ------------------------------------------------- constraints: daily_reports
-- As superuser, so only the table's own constraints are in play.
do $$
declare denied int := 0;
begin
  -- D9: one report per site per day.
  begin
    insert into public.daily_reports (org_id, site_id, report_date, author_id, headcount, work_done)
    values ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', '2026-10-14',
            'f0000000-0000-0000-0000-00000000000f', 3, 'Second report');
  exception when unique_violation then denied := denied + 1; end;
  -- the site belongs to org A, not org B.
  begin
    insert into public.daily_reports (org_id, site_id, report_date, author_id)
    values ('bbbbbbbb-0000-0000-0000-000000000002', '51000000-0000-0000-0000-000000000001', '2026-10-13',
            'b0000000-0000-0000-0000-00000000000b');
  exception when foreign_key_violation then denied := denied + 1; end;
  perform test_assert(denied = 2, 'duplicate site-day and a site from another org are rejected');

  -- D2: lengths and headcount, one over each edge.
  denied := 0;
  begin insert into public.daily_reports (org_id, site_id, report_date, author_id, headcount)
    values ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', '2026-10-10', 'b0000000-0000-0000-0000-00000000000b', 1001);
  exception when check_violation then denied := denied + 1; end;
  begin insert into public.daily_reports (org_id, site_id, report_date, author_id, headcount)
    values ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', '2026-10-10', 'b0000000-0000-0000-0000-00000000000b', -1);
  exception when check_violation then denied := denied + 1; end;
  begin insert into public.daily_reports (org_id, site_id, report_date, author_id, work_done)
    values ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', '2026-10-10', 'b0000000-0000-0000-0000-00000000000b', repeat('x', 4001));
  exception when check_violation then denied := denied + 1; end;
  begin insert into public.daily_reports (org_id, site_id, report_date, author_id, blockers)
    values ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', '2026-10-10', 'b0000000-0000-0000-0000-00000000000b', repeat('x', 2001));
  exception when check_violation then denied := denied + 1; end;
  begin insert into public.daily_reports (org_id, site_id, report_date, author_id, next_day_plan)
    values ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', '2026-10-10', 'b0000000-0000-0000-0000-00000000000b', repeat('x', 2001));
  exception when check_violation then denied := denied + 1; end;
  perform test_assert(denied = 5, 'headcount range and text lengths are checked');

  -- the limits themselves are allowed, and a draft may be empty (D8).
  insert into public.daily_reports (id, org_id, site_id, report_date, author_id, headcount, work_done, blockers, next_day_plan)
  values ('d1000000-0000-0000-0000-0000000000e1', 'aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001',
          '2026-10-10', 'b0000000-0000-0000-0000-00000000000b', 1000, repeat('x', 4000), repeat('x', 2000), repeat('x', 2000));
  insert into public.daily_reports (id, org_id, site_id, report_date, author_id)
  values ('d1000000-0000-0000-0000-0000000000e2', 'aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001',
          '2026-10-09', 'b0000000-0000-0000-0000-00000000000b');
  perform test_assert(
    (select count(*) from public.daily_reports where id in ('d1000000-0000-0000-0000-0000000000e1', 'd1000000-0000-0000-0000-0000000000e2') and status = 'draft') = 2,
    'values at the limits, and an empty draft, are accepted');

  -- a submitted report needs headcount and non-blank work done.
  denied := 0;
  begin insert into public.daily_reports (org_id, site_id, report_date, author_id, status, work_done, submitted_at, submitted_by)
    values ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', '2026-10-08', 'b0000000-0000-0000-0000-00000000000b',
            'submitted', 'Work', now(), 'b0000000-0000-0000-0000-00000000000b');
  exception when check_violation then denied := denied + 1; end;
  begin insert into public.daily_reports (org_id, site_id, report_date, author_id, status, headcount, work_done, submitted_at, submitted_by)
    values ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', '2026-10-08', 'b0000000-0000-0000-0000-00000000000b',
            'submitted', 4, '   ', now(), 'b0000000-0000-0000-0000-00000000000b');
  exception when check_violation then denied := denied + 1; end;
  -- D1: a serious blocker must say what it is.
  begin insert into public.daily_reports (org_id, site_id, report_date, author_id, serious_blocker, blockers)
    values ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', '2026-10-08', 'b0000000-0000-0000-0000-00000000000b', true, '  ');
  exception when check_violation then denied := denied + 1; end;
  -- unknown status; reviewed without a review; a draft with a review.
  begin insert into public.daily_reports (org_id, site_id, report_date, author_id, status)
    values ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', '2026-10-08', 'b0000000-0000-0000-0000-00000000000b', 'approved');
  exception when check_violation then denied := denied + 1; end;
  begin insert into public.daily_reports (org_id, site_id, report_date, author_id, status, headcount, work_done)
    values ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', '2026-10-08', 'b0000000-0000-0000-0000-00000000000b', 'reviewed', 4, 'Work');
  exception when check_violation then denied := denied + 1; end;
  begin insert into public.daily_reports (org_id, site_id, report_date, author_id, reviewed_at, reviewed_by)
    values ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', '2026-10-08', 'b0000000-0000-0000-0000-00000000000b', now(), 'c0000000-0000-0000-0000-00000000000c');
  exception when check_violation then denied := denied + 1; end;
  -- edit_reason is never stored.
  begin insert into public.daily_reports (org_id, site_id, report_date, author_id, edit_reason)
    values ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', '2026-10-08', 'b0000000-0000-0000-0000-00000000000b', 'why');
  exception when check_violation then denied := denied + 1; end;
  perform test_assert(denied = 7, 'submit completeness, serious blocker text, status shape and edit_reason are checked');

  -- clean up the edge-case drafts so later sections start from the fixture.
  delete from public.daily_reports where id in ('d1000000-0000-0000-0000-0000000000e1', 'd1000000-0000-0000-0000-0000000000e2');
end $$;

-- ------------------------------------------ constraints: revisions and photos
do $$
declare denied int := 0;
begin
  -- a revision must point at a report of its own site and org, and give a reason.
  begin insert into public.daily_report_revisions (org_id, site_id, report_id, revision_no, serious_blocker, safety_incident, reason, edited_by)
    values ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000001',
            1, false, false, 'wrong site', 'b0000000-0000-0000-0000-00000000000b');
  exception when foreign_key_violation then denied := denied + 1; end;
  begin insert into public.daily_report_revisions (org_id, site_id, report_id, revision_no, serious_blocker, safety_incident, reason, edited_by)
    values ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001',
            1, false, false, '   ', 'b0000000-0000-0000-0000-00000000000b');
  exception when check_violation then denied := denied + 1; end;
  begin insert into public.daily_report_revisions (org_id, site_id, report_id, revision_no, serious_blocker, safety_incident, reason, edited_by)
    values ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001',
            1, false, false, repeat('x', 501), 'b0000000-0000-0000-0000-00000000000b');
  exception when check_violation then denied := denied + 1; end;
  perform test_assert(denied = 3, 'revision: other-site report, blank and over-long reason are rejected');

  -- a photo for another site's report, a path that does not match the row,
  -- a type outside the list, and a file over 10 MB.
  denied := 0;
  begin insert into public.report_photos (id, org_id, site_id, report_id, storage_path, size_bytes, content_type, uploaded_by)
    values ('e1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000002',
            'd1000000-0000-0000-0000-000000000001',
            'aaaaaaaa-0000-0000-0000-000000000001/51000000-0000-0000-0000-000000000002/d1000000-0000-0000-0000-000000000001/e1000000-0000-0000-0000-000000000001.jpg',
            1000, 'image/jpeg', 'b0000000-0000-0000-0000-00000000000b');
  exception when foreign_key_violation then denied := denied + 1; end;
  begin insert into public.report_photos (id, org_id, site_id, report_id, storage_path, size_bytes, content_type, uploaded_by)
    values ('e1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001',
            'd1000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002/anywhere.jpg',
            1000, 'image/jpeg', 'b0000000-0000-0000-0000-00000000000b');
  exception when check_violation then denied := denied + 1; end;
  begin insert into public.report_photos (id, org_id, site_id, report_id, storage_path, size_bytes, content_type, uploaded_by)
    values ('e1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001',
            'd1000000-0000-0000-0000-000000000001',
            'aaaaaaaa-0000-0000-0000-000000000001/51000000-0000-0000-0000-000000000001/d1000000-0000-0000-0000-000000000001/e1000000-0000-0000-0000-000000000001.png',
            1000, 'image/jpeg', 'b0000000-0000-0000-0000-00000000000b');
  exception when check_violation then denied := denied + 1; end;
  begin insert into public.report_photos (id, org_id, site_id, report_id, storage_path, size_bytes, content_type, uploaded_by)
    values ('e1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001',
            'd1000000-0000-0000-0000-000000000001',
            'aaaaaaaa-0000-0000-0000-000000000001/51000000-0000-0000-0000-000000000001/d1000000-0000-0000-0000-000000000001/e1000000-0000-0000-0000-000000000001.gif',
            1000, 'image/gif', 'b0000000-0000-0000-0000-00000000000b');
  exception when check_violation then denied := denied + 1; end;
  begin insert into public.report_photos (id, org_id, site_id, report_id, storage_path, size_bytes, content_type, uploaded_by)
    values ('e1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001',
            'd1000000-0000-0000-0000-000000000001',
            'aaaaaaaa-0000-0000-0000-000000000001/51000000-0000-0000-0000-000000000001/d1000000-0000-0000-0000-000000000001/e1000000-0000-0000-0000-000000000001.jpg',
            10485761, 'image/jpeg', 'b0000000-0000-0000-0000-00000000000b');
  exception when check_violation then denied := denied + 1; end;
  begin insert into public.report_photos (id, org_id, site_id, report_id, storage_path, size_bytes, content_type, uploaded_by, caption)
    values ('e1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001',
            'd1000000-0000-0000-0000-000000000001',
            'aaaaaaaa-0000-0000-0000-000000000001/51000000-0000-0000-0000-000000000001/d1000000-0000-0000-0000-000000000001/e1000000-0000-0000-0000-000000000001.jpg',
            1000, 'image/jpeg', 'b0000000-0000-0000-0000-00000000000b', repeat('x', 201));
  exception when check_violation then denied := denied + 1; end;
  perform test_assert(denied = 6, 'photo: other-site report, wrong path, mismatched or unknown type, oversize, long caption are rejected');
  perform test_assert(not exists (select 1 from public.report_photos), 'no photo row was created by a rejected insert');
end $$;

-- ------------------------------------------------------- guards: insert
-- Still as superuser, with only the JWT claim set, so the triggers are tested
-- on their own before any policy exists.
do $$
declare denied int := 0; v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  perform set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000009', true);   -- gina

  -- arriving submitted: the server stamps who and when, whatever was sent.
  insert into public.daily_reports
    (id, org_id, site_id, report_date, author_id, status, headcount, work_done, submitted_at, submitted_by)
  values ('d1000000-0000-0000-0000-000000000021', 'aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000002',
          '2026-10-12', '90000000-0000-0000-0000-000000000009', 'submitted', 6, 'Brickwork',
          '2020-01-01', 'c0000000-0000-0000-0000-00000000000c');
  perform test_assert(
    (select submitted_by = '90000000-0000-0000-0000-000000000009' and submitted_at > '2026-01-01'
       from public.daily_reports where id = 'd1000000-0000-0000-0000-000000000021'),
    'submit on insert is stamped by the server with the caller');

  -- a draft carries no submit stamp, even a supplied one.
  insert into public.daily_reports (id, org_id, site_id, report_date, author_id, submitted_at, submitted_by)
  values ('d1000000-0000-0000-0000-000000000022', 'aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000002',
          '2026-10-13', '90000000-0000-0000-0000-000000000009', now(), '90000000-0000-0000-0000-000000000009');
  perform test_assert(
    (select submitted_at is null and submitted_by is null from public.daily_reports where id = 'd1000000-0000-0000-0000-000000000022'),
    'a draft has no submit stamp');

  -- the organisation's tomorrow is allowed, the day after is not.
  insert into public.daily_reports (id, org_id, site_id, report_date, author_id)
  values ('d1000000-0000-0000-0000-000000000023', 'aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000002',
          v_today + 1, '90000000-0000-0000-0000-000000000009');
  begin
    insert into public.daily_reports (org_id, site_id, report_date, author_id)
    values ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000002',
            v_today + 2, '90000000-0000-0000-0000-000000000009');
  exception when invalid_parameter_value then denied := 1; end;
  perform test_assert(denied = 1, 'a report dated after the org''s tomorrow is rejected');
  delete from public.daily_reports where id = 'd1000000-0000-0000-0000-000000000023';

  perform set_config('request.jwt.claim.sub', '', true);
end $$;

-- ---------------------------------------------------- guards: lifecycle
do $$
declare denied int := 0; r record;
begin
  perform set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000009', true);   -- gina

  -- editing a draft leaves no history (D8), and a reason sent with it is dropped.
  update public.daily_reports set headcount = 7, work_done = 'Plastering', edit_reason = 'n/a'
   where id = 'd1000000-0000-0000-0000-000000000022';
  perform test_assert(
    (select headcount = 7 and edit_reason is null from public.daily_reports where id = 'd1000000-0000-0000-0000-000000000022'),
    'a draft edit is applied and edit_reason is not stored');

  -- draft -> submitted: stamped, still no history.
  update public.daily_reports set status = 'submitted' where id = 'd1000000-0000-0000-0000-000000000022';
  perform test_assert(
    (select submitted_by = '90000000-0000-0000-0000-000000000009' and submitted_at is not null
       from public.daily_reports where id = 'd1000000-0000-0000-0000-000000000022'),
    'submitting a draft stamps the submitter');
  perform test_assert(not exists (select 1 from public.daily_report_revisions where report_id = 'd1000000-0000-0000-0000-000000000022'),
    'a draft edit and a submit write no revision');

  -- submitted -> draft is refused.
  begin update public.daily_reports set status = 'draft' where id = 'd1000000-0000-0000-0000-000000000022';
  exception when object_not_in_prerequisite_state then denied := denied + 1; end;
  -- the keys of a report never change.
  begin update public.daily_reports set report_date = '2026-10-11' where id = 'd1000000-0000-0000-0000-000000000022';
  exception when insufficient_privilege then denied := denied + 1; end;
  begin update public.daily_reports set site_id = '51000000-0000-0000-0000-000000000001' where id = 'd1000000-0000-0000-0000-000000000022';
  exception when insufficient_privilege then denied := denied + 1; end;
  begin update public.daily_reports set author_id = 'b0000000-0000-0000-0000-00000000000b' where id = 'd1000000-0000-0000-0000-000000000022';
  exception when insufficient_privilege then denied := denied + 1; end;
  perform test_assert(denied = 4, 'un-submit and key changes are refused');

  -- a submit stamp or a review cannot be written by an ordinary update.
  update public.daily_reports
     set submitted_at = '2020-01-01', submitted_by = 'c0000000-0000-0000-0000-00000000000c',
         reviewed_at = now(), reviewed_by = 'c0000000-0000-0000-0000-00000000000c', review_note = 'fake'
   where id = 'd1000000-0000-0000-0000-000000000022';
  perform test_assert(
    (select submitted_by = '90000000-0000-0000-0000-000000000009' and submitted_at > '2026-01-01'
            and reviewed_at is null and reviewed_by is null and review_note is null
       from public.daily_reports where id = 'd1000000-0000-0000-0000-000000000022'),
    'submit stamp and review fields are kept by the server');

  perform set_config('request.jwt.claim.sub', '', true);
end $$;

-- -------------------------------------------- guards: edits after submit
do $$
declare denied int := 0; r record;
begin
  perform set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-00000000000b', true);   -- bob, R1's author

  -- no reason, or a blank one: refused, and nothing changes.
  begin update public.daily_reports set headcount = 14 where id = 'd1000000-0000-0000-0000-000000000001';
  exception when invalid_parameter_value then denied := denied + 1; end;
  begin update public.daily_reports set headcount = 14, edit_reason = '   ' where id = 'd1000000-0000-0000-0000-000000000001';
  exception when invalid_parameter_value then denied := denied + 1; end;
  -- a reason over 500 characters is caught by the revision's own check.
  begin update public.daily_reports set headcount = 14, edit_reason = repeat('x', 501) where id = 'd1000000-0000-0000-0000-000000000001';
  exception when check_violation then denied := denied + 1; end;
  perform test_assert(denied = 3, 'an edit after submit needs a reason of 1-500 characters');
  perform test_assert((select headcount from public.daily_reports where id = 'd1000000-0000-0000-0000-000000000001') = 12,
    'a refused edit changes nothing');
  perform test_assert(not exists (select 1 from public.daily_report_revisions where report_id = 'd1000000-0000-0000-0000-000000000001'),
    'a refused edit writes no revision');

  -- with a reason: applied, and one revision holds the old values.
  update public.daily_reports set headcount = 14, edit_reason = 'Recounted at 5 pm'
   where id = 'd1000000-0000-0000-0000-000000000001';
  select * into r from public.daily_report_revisions where report_id = 'd1000000-0000-0000-0000-000000000001';
  perform test_assert((select count(*) from public.daily_report_revisions where report_id = 'd1000000-0000-0000-0000-000000000001') = 1,
    'one edit writes exactly one revision');
  perform test_assert(
    r.revision_no = 1 and r.headcount = 12 and r.work_done = 'Slab poured' and r.serious_blocker = false
    and r.reason = 'Recounted at 5 pm' and r.edited_by = 'b0000000-0000-0000-0000-00000000000b'
    and r.org_id = 'aaaaaaaa-0000-0000-0000-000000000001' and r.site_id = '51000000-0000-0000-0000-000000000001',
    'the revision holds the previous values, the editor and the reason');
  perform test_assert(
    (select headcount = 14 and edit_reason is null and status = 'submitted'
       from public.daily_reports where id = 'd1000000-0000-0000-0000-000000000001'),
    'the report has the new value and no stored edit_reason');

  -- the next edit needs its own reason, and is revision 2.
  denied := 0;
  begin update public.daily_reports set serious_blocker = true, blockers = 'Cement short' where id = 'd1000000-0000-0000-0000-000000000001';
  exception when invalid_parameter_value then denied := 1; end;
  perform test_assert(denied = 1, 'a reason is not reused by the next edit');
  update public.daily_reports set serious_blocker = true, blockers = 'Cement short', edit_reason = 'Forgot the blocker'
   where id = 'd1000000-0000-0000-0000-000000000001';
  perform test_assert(
    (select revision_no = 2 and headcount = 14 and serious_blocker = false and blockers is null
       from public.daily_report_revisions where report_id = 'd1000000-0000-0000-0000-000000000001' and revision_no = 2),
    'a second edit is revision 2 and holds the values the first edit left');

  -- an update that changes no content writes no revision and needs no reason.
  update public.daily_reports set headcount = 14 where id = 'd1000000-0000-0000-0000-000000000001';
  perform test_assert((select count(*) from public.daily_report_revisions where report_id = 'd1000000-0000-0000-0000-000000000001') = 2,
    'a no-op update writes no revision');

  -- an edit with no signed-in user is refused.
  perform set_config('request.jwt.claim.sub', '', true);
  denied := 0;
  begin update public.daily_reports set headcount = 15, edit_reason = 'operator' where id = 'd1000000-0000-0000-0000-000000000001';
  exception when invalid_authorization_specification then denied := 1; end;
  perform test_assert(denied = 1, 'an edit after submit needs a signed-in editor');
end $$;

-- ------------------------------------------------------ guards: reviewed
do $$
declare denied int := 0;
begin
  perform set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-00000000000c', true);   -- carol

  -- a draft cannot be reviewed; a review cannot change content.
  insert into public.daily_reports (id, org_id, site_id, report_date, author_id)
  values ('d1000000-0000-0000-0000-000000000024', 'aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000002',
          '2026-10-11', '90000000-0000-0000-0000-000000000009');
  begin update public.daily_reports set status = 'reviewed', reviewed_at = now(), reviewed_by = 'c0000000-0000-0000-0000-00000000000c'
   where id = 'd1000000-0000-0000-0000-000000000024';
  exception when object_not_in_prerequisite_state then denied := denied + 1; end;
  begin update public.daily_reports set status = 'reviewed', reviewed_at = now(), reviewed_by = 'c0000000-0000-0000-0000-00000000000c',
                                        headcount = 99
   where id = 'd1000000-0000-0000-0000-000000000003';
  exception when object_not_in_prerequisite_state then denied := denied + 1; end;
  perform test_assert(denied = 2, 'a draft cannot be reviewed and a review cannot change content');
  delete from public.daily_reports where id = 'd1000000-0000-0000-0000-000000000024';

  -- the review itself (what review_daily_report will do), then nothing more.
  update public.daily_reports set status = 'reviewed', reviewed_at = now(), reviewed_by = 'c0000000-0000-0000-0000-00000000000c'
   where id = 'd1000000-0000-0000-0000-000000000003';
  denied := 0;
  perform set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-00000000000b', true);   -- bob, the author
  begin update public.daily_reports set headcount = 4, edit_reason = 'late fix' where id = 'd1000000-0000-0000-0000-000000000003';
  exception when object_not_in_prerequisite_state then denied := denied + 1; end;
  begin update public.daily_reports set status = 'submitted' where id = 'd1000000-0000-0000-0000-000000000003';
  exception when object_not_in_prerequisite_state then denied := denied + 1; end;
  perform test_assert(denied = 2, 'a reviewed report refuses every update (D5)');
  perform test_assert((select status = 'reviewed' and headcount = 3 from public.daily_reports where id = 'd1000000-0000-0000-0000-000000000003'),
    'the reviewed report is unchanged');

  perform set_config('request.jwt.claim.sub', '', true);
end $$;

-- ------------------------------------------- guards: revisions append-only
do $$
declare denied int := 0;
begin
  -- even the table owner cannot rewrite or remove history.
  begin update public.daily_report_revisions set reason = 'rewritten';
  exception when insufficient_privilege then denied := denied + 1; end;
  begin delete from public.daily_report_revisions;
  exception when insufficient_privilege then denied := denied + 1; end;
  begin truncate public.daily_report_revisions;
  exception when insufficient_privilege then denied := denied + 1; end;
  perform test_assert(denied = 3, 'revisions refuse update, delete and truncate even for the owner');
  perform test_assert((select count(*) from public.daily_report_revisions) = 2, 'both revisions are still there');
end $$;

-- ---------------------------------------------------- guards: photo limit
do $$
declare denied int := 0; g int; v_id uuid;
begin
  -- D3 and D6: ten photos on one report, even a reviewed one; the eleventh is refused.
  for g in 1..11 loop
    v_id := ('e3000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid;
    begin
      insert into public.report_photos (id, org_id, site_id, report_id, storage_path, size_bytes, content_type, uploaded_by)
      values (v_id, 'aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000003',
              'd1000000-0000-0000-0000-000000000003',
              'aaaaaaaa-0000-0000-0000-000000000001/51000000-0000-0000-0000-000000000003/d1000000-0000-0000-0000-000000000003/' || v_id || '.jpg',
              2048, 'image/jpeg', 'b0000000-0000-0000-0000-00000000000b');
    exception when check_violation then denied := denied + 1; end;
  end loop;
  perform test_assert(denied = 1, 'only the eleventh photo is refused');
  perform test_assert((select count(*) from public.report_photos where report_id = 'd1000000-0000-0000-0000-000000000003') = 10,
    'a report holds at most ten photos');
end $$;
rollback;
