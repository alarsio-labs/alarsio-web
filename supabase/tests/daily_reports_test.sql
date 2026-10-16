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

-- ================================================================ policies
-- From here on every statement runs as a signed-in role, so grants and RLS apply.
-- Fixture so far: R1 (bob, site 1, submitted, serious blocker, 2 revisions),
-- R3 (bob, archived site 3, reviewed, 10 photos), d21 and d22 (gina, site 2,
-- submitted), RB (hank, org B).

-- ---------------------------------------------------------------- structure
do $$ begin
  perform test_assert(
    not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename in ('daily_reports', 'daily_report_revisions', 'report_photos')
      and cmd in ('DELETE', 'ALL')),
    'no delete policy on any daily reporting table');
  perform test_assert(
    not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename in ('daily_report_revisions', 'report_photos') and cmd = 'UPDATE'),
    'no update policy on revisions or photos');
  perform test_assert(
    not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'daily_report_revisions' and cmd = 'INSERT'),
    'no insert policy on revisions');
  perform test_assert(
    (select 'security_invoker=true' = any (reloptions) from pg_class where oid = 'public.daily_report_status'::regclass),
    'daily_report_status is security_invoker');
  perform test_assert(
    (select prosecdef and proconfig @> array['search_path=public']
       from pg_proc where oid = 'public.can_attach_report_photo(uuid)'::regprocedure),
    'can_attach_report_photo pins search_path');
  perform test_assert(
    not exists (select 1 from information_schema.role_table_grants
      where table_schema = 'public' and table_name = 'daily_report_revisions'
        and grantee = 'authenticated' and privilege_type <> 'SELECT'),
    'clients can only select revisions');
  perform test_assert(
    not exists (select 1 from information_schema.role_table_grants
      where table_schema = 'public' and table_name = 'report_photos'
        and grantee = 'authenticated' and privilege_type in ('UPDATE', 'DELETE')),
    'clients cannot update or delete photos');
end $$;

-- ------------------------------------------------------------ anon is denied
do $$
declare denied int := 0;
begin
  perform test_as_anon();
  begin perform count(*) from public.daily_reports;
  exception when insufficient_privilege then denied := denied + 1; end;
  begin perform count(*) from public.daily_report_revisions;
  exception when insufficient_privilege then denied := denied + 1; end;
  begin perform count(*) from public.report_photos;
  exception when insufficient_privilege then denied := denied + 1; end;
  begin perform count(*) from public.daily_report_status;
  exception when insufficient_privilege then denied := denied + 1; end;
  begin perform can_attach_report_photo('d1000000-0000-0000-0000-000000000001');
  exception when insufficient_privilege then denied := denied + 1; end;
  begin insert into public.daily_reports (org_id, site_id, report_date)
    values ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', '2026-10-02');
  exception when insufficient_privilege then denied := denied + 1; end;
  reset role;
  perform test_assert(denied = 6, 'anon is denied on tables, the view and the predicate');
end $$;

-- ------------------------------------------------------------ insert, roles
do $$
declare denied int; u uuid;
begin
  -- bob files a draft with an id made on the phone.
  perform test_as('b0000000-0000-0000-0000-00000000000b');
  insert into public.daily_reports (id, org_id, site_id, report_date, headcount, work_done)
  values ('d1000000-0000-0000-0000-000000000031', 'aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001',
          '2026-10-15', 9, 'Shuttering');
  reset role;
  perform test_assert(
    (select author_id = 'b0000000-0000-0000-0000-00000000000b' and status = 'draft'
       from public.daily_reports where id = 'd1000000-0000-0000-0000-000000000031'),
    'the assigned supervisor files a draft; author is the caller');

  -- the other site-1 supervisor files a report already submitted, as the phone may.
  perform test_as('f0000000-0000-0000-0000-00000000000f');
  insert into public.daily_reports (id, org_id, site_id, report_date, status, headcount, work_done)
  values ('d1000000-0000-0000-0000-000000000033', 'aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001',
          '2026-10-09', 'submitted', 4, 'Cleaning');
  reset role;
  perform test_assert(
    (select status = 'submitted' and submitted_by = 'f0000000-0000-0000-0000-00000000000f'
       from public.daily_reports where id = 'd1000000-0000-0000-0000-000000000033'),
    'a report may be filed already submitted');

  -- everyone else is refused: owner, PM, accountant, an unassigned supervisor.
  foreach u in array array['a0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000c',
                           'd0000000-0000-0000-0000-00000000000d', '90000000-0000-0000-0000-000000000009']::uuid[] loop
    denied := 0;
    perform test_as(u);
    begin
      insert into public.daily_reports (org_id, site_id, report_date, headcount, work_done)
      values ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', '2026-10-03', 1, 'Nope');
    exception when insufficient_privilege then denied := 1; end;
    reset role;
    perform test_assert(denied = 1, 'cannot file a report on site 1: ' || u);
  end loop;
  perform test_assert(not exists (select 1 from public.daily_reports where report_date = '2026-10-03'), 'no row was created by a blocked insert');

  -- bob: archived site, another organisation, a forged author, a reviewed status, a stamp.
  perform test_as('b0000000-0000-0000-0000-00000000000b');
  denied := 0;
  begin insert into public.daily_reports (org_id, site_id, report_date)
    values ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000003', '2026-10-05');
  exception when insufficient_privilege then denied := denied + 1; end;
  begin insert into public.daily_reports (org_id, site_id, report_date)
    values ('bbbbbbbb-0000-0000-0000-000000000002', '51000000-0000-0000-0000-0000000000b1', '2026-10-05');
  exception when insufficient_privilege then denied := denied + 1; end;
  begin insert into public.daily_reports (org_id, site_id, report_date, author_id)
    values ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', '2026-10-05', 'f0000000-0000-0000-0000-00000000000f');
  exception when insufficient_privilege then denied := denied + 1; end;
  begin insert into public.daily_reports (org_id, site_id, report_date, status, headcount, work_done)
    values ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', '2026-10-05', 'reviewed', 1, 'x');
  exception when insufficient_privilege then denied := denied + 1; end;
  begin insert into public.daily_reports (org_id, site_id, report_date, submitted_at)
    values ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', '2026-10-05', now());
  exception when insufficient_privilege then denied := denied + 1; end;
  -- the rules above the policy still apply: one report per site-day, no future date.
  begin insert into public.daily_reports (org_id, site_id, report_date)
    values ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', '2026-10-14');
  exception when unique_violation then denied := denied + 1; end;
  begin insert into public.daily_reports (org_id, site_id, report_date)
    values ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', current_date + 5);
  exception when invalid_parameter_value then denied := denied + 1; end;
  reset role;
  perform test_assert(denied = 7, 'archived site, other org, forged author, reviewed status, stamp, duplicate and future date are all refused');
end $$;

-- ------------------------------------------------------------------- reads
do $$ begin
  perform test_as('a0000000-0000-0000-0000-00000000000a');           -- owner A
  perform test_assert((select count(*) from public.daily_reports) = 5, 'owner reads every submitted report of the org, and no draft');
  perform test_assert((select count(*) from public.daily_reports where id = 'd1000000-0000-0000-0000-000000000031') = 0, 'owner cannot read a draft, even by id');
  perform test_assert((select count(*) from public.daily_reports where id = 'd1000000-0000-0000-0000-0000000000b1') = 0, 'owner A cannot fetch an org B report by id');
  reset role;
  perform test_as('c0000000-0000-0000-0000-00000000000c');           -- PM
  perform test_assert((select count(*) from public.daily_reports) = 5, 'project_manager reads every submitted report, and no draft');
  perform test_assert((select count(*) from public.daily_reports where status = 'draft') = 0, 'project_manager sees no draft');
  reset role;
  perform test_as('d0000000-0000-0000-0000-00000000000d');           -- accountant, no site
  perform test_assert((select count(*) from public.daily_reports) = 0, 'an accountant with no site sees no report');
  reset role;
  perform test_as('b0000000-0000-0000-0000-00000000000b');           -- bob: sites 1 and 3
  perform test_assert((select count(*) from public.daily_reports) = 4, 'bob sees site 1 and site 3 reports and his own draft');
  perform test_assert((select count(*) from public.daily_reports where id = 'd1000000-0000-0000-0000-000000000031') = 1, 'the author reads their own draft');
  reset role;
  perform test_as('f0000000-0000-0000-0000-00000000000f');           -- fred: site 1
  perform test_assert((select count(*) from public.daily_reports) = 2, 'a site colleague sees submitted reports of the site only');
  perform test_assert((select count(*) from public.daily_reports where id = 'd1000000-0000-0000-0000-000000000031') = 0, 'a site colleague cannot read bob''s draft by id');
  perform test_assert((select count(*) from public.daily_reports where id = 'd1000000-0000-0000-0000-000000000003') = 0, 'a supervisor cannot read an unassigned site''s report by id');
  reset role;
  perform test_as('90000000-0000-0000-0000-000000000009');           -- gina: site 2
  perform test_assert((select count(*) from public.daily_reports) = 2, 'gina sees only site 2 reports');
  perform test_assert((select count(*) from public.daily_reports where id = 'd1000000-0000-0000-0000-000000000001') = 0, 'gina cannot read site 1''s report by id');
  perform test_assert((select count(*) from public.daily_report_revisions) = 0, 'gina reads no revisions of site 1');
  reset role;
  perform test_as('e0000000-0000-0000-0000-00000000000e');           -- owner B
  perform test_assert((select count(*) from public.daily_reports) = 1, 'owner B sees only org B''s report');
  perform test_assert((select count(*) from public.daily_reports where org_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 0, 'owner B reads no org A report');
  perform test_assert((select count(*) from public.daily_report_revisions) = 0, 'owner B reads no org A revision');
  perform test_assert((select count(*) from public.report_photos) = 0, 'owner B reads no org A photo');
  reset role;
end $$;

-- ----------------------------------------------------------------- updates
do $$
declare denied int; n int; u uuid;
begin
  perform test_as('b0000000-0000-0000-0000-00000000000b');
  update public.daily_reports set work_done = 'Shuttering and rebar' where id = 'd1000000-0000-0000-0000-000000000031';
  get diagnostics n = row_count;
  perform test_assert(n = 1, 'the author edits their draft');

  -- the author cannot move a report, forge a stamp, or set the reviewed status.
  denied := 0;
  begin update public.daily_reports set site_id = '51000000-0000-0000-0000-000000000002' where id = 'd1000000-0000-0000-0000-000000000031';
  exception when insufficient_privilege then denied := denied + 1; end;
  begin update public.daily_reports set author_id = 'f0000000-0000-0000-0000-00000000000f' where id = 'd1000000-0000-0000-0000-000000000031';
  exception when insufficient_privilege then denied := denied + 1; end;
  begin update public.daily_reports set submitted_at = now() where id = 'd1000000-0000-0000-0000-000000000031';
  exception when insufficient_privilege then denied := denied + 1; end;
  begin update public.daily_reports set reviewed_by = 'b0000000-0000-0000-0000-00000000000b' where id = 'd1000000-0000-0000-0000-000000000031';
  exception when insufficient_privilege then denied := denied + 1; end;
  begin update public.daily_reports set status = 'reviewed' where id = 'd1000000-0000-0000-0000-000000000001';
  exception when insufficient_privilege then denied := denied + 1; end;
  perform test_assert(denied = 5, 'site, author, stamps and the reviewed status are not client-writable');

  -- a reviewed report on an archived site, and an edit after submit with no reason.
  update public.daily_reports set headcount = 1, edit_reason = 'late' where id = 'd1000000-0000-0000-0000-000000000003';
  get diagnostics n = row_count;
  perform test_assert(n = 0, 'a reviewed report on an archived site changes 0 rows');
  denied := 0;
  begin update public.daily_reports set headcount = 20 where id = 'd1000000-0000-0000-0000-000000000001';
  exception when invalid_parameter_value then denied := 1; end;
  perform test_assert(denied = 1, 'an edit after submit still needs a reason through the API');
  update public.daily_reports set headcount = 15, edit_reason = 'Late arrivals' where id = 'd1000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  perform test_assert(n = 1, 'the author edits a submitted report with a reason');
  reset role;
  perform test_assert((select count(*) from public.daily_report_revisions where report_id = 'd1000000-0000-0000-0000-000000000001') = 3,
    'that edit wrote revision 3');

  -- nobody else edits it: colleague, owner, PM, accountant, another org.
  foreach u in array array['f0000000-0000-0000-0000-00000000000f', 'a0000000-0000-0000-0000-00000000000a',
                           'c0000000-0000-0000-0000-00000000000c', 'd0000000-0000-0000-0000-00000000000d',
                           'e0000000-0000-0000-0000-00000000000e']::uuid[] loop
    perform test_as(u);
    update public.daily_reports set headcount = 99, edit_reason = 'hijack' where id = 'd1000000-0000-0000-0000-000000000001';
    get diagnostics n = row_count;
    reset role;
    perform test_assert(n = 0, 'update changes 0 rows for ' || u);
  end loop;
  perform test_assert((select headcount from public.daily_reports where id = 'd1000000-0000-0000-0000-000000000001') = 15, 'the report is not changed by blocked updates');
  perform test_assert((select count(*) from public.daily_report_revisions where report_id = 'd1000000-0000-0000-0000-000000000001') = 3, 'blocked updates wrote no revision');

  -- a colleague cannot edit a draft they cannot see.
  perform test_as('f0000000-0000-0000-0000-00000000000f');
  update public.daily_reports set work_done = 'hijack' where id = 'd1000000-0000-0000-0000-000000000031';
  get diagnostics n = row_count;
  reset role;
  perform test_assert(n = 0 and (select work_done from public.daily_reports where id = 'd1000000-0000-0000-0000-000000000031') = 'Shuttering and rebar',
    'a colleague cannot edit another supervisor''s draft');
end $$;

-- ----------------------------------------------------------------- deletes
do $$
declare denied int; u uuid; t text;
begin
  foreach u in array array['b0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-00000000000a',
                           'c0000000-0000-0000-0000-00000000000c', 'd0000000-0000-0000-0000-00000000000d']::uuid[] loop
    foreach t in array array['daily_reports', 'daily_report_revisions', 'report_photos'] loop
      denied := 0;
      perform test_as(u);
      begin execute format('delete from public.%I', t);
      exception when insufficient_privilege then denied := denied + 1; end;
      begin execute format('truncate public.%I', t);
      exception when insufficient_privilege then denied := denied + 1; end;
      reset role;
      perform test_assert(denied = 2, format('delete and truncate on %s are denied for %s', t, u));
    end loop;
  end loop;
  perform test_assert((select count(*) from public.daily_reports) = 7, 'no report was deleted');
end $$;

-- ---------------------------------------------------------------- revisions
do $$
declare denied int; u uuid;
begin
  perform test_as('a0000000-0000-0000-0000-00000000000a');
  perform test_assert((select count(*) from public.daily_report_revisions where report_id = 'd1000000-0000-0000-0000-000000000001') = 3,
    'owner reads the history of a submitted report');
  reset role;
  perform test_as('f0000000-0000-0000-0000-00000000000f');
  perform test_assert((select count(*) from public.daily_report_revisions) = 3, 'a site colleague reads the history too');
  reset role;
  foreach u in array array['b0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-00000000000a',
                           'c0000000-0000-0000-0000-00000000000c', 'd0000000-0000-0000-0000-00000000000d']::uuid[] loop
    denied := 0;
    perform test_as(u);
    begin insert into public.daily_report_revisions (org_id, site_id, report_id, revision_no, serious_blocker, safety_incident, reason)
      values ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 9, false, false, 'forged');
    exception when insufficient_privilege then denied := denied + 1; end;
    begin update public.daily_report_revisions set reason = 'rewritten';
    exception when insufficient_privilege then denied := denied + 1; end;
    begin delete from public.daily_report_revisions;
    exception when insufficient_privilege then denied := denied + 1; end;
    reset role;
    perform test_assert(denied = 3, 'revision insert, update and delete are denied for ' || u);
  end loop;
end $$;

-- ------------------------------------------------------------------ photos
do $$
declare denied int; u uuid; n int;
  v_org  constant text := 'aaaaaaaa-0000-0000-0000-000000000001';
  v_site constant text := '51000000-0000-0000-0000-000000000001';
begin
  -- bob attaches a photo to his draft; managers do not see it until submit.
  perform test_as('b0000000-0000-0000-0000-00000000000b');
  insert into public.report_photos (id, org_id, site_id, report_id, storage_path, caption, size_bytes, content_type)
  values ('e2000000-0000-0000-0000-000000000001', v_org::uuid, v_site::uuid, 'd1000000-0000-0000-0000-000000000031',
          v_org || '/' || v_site || '/d1000000-0000-0000-0000-000000000031/e2000000-0000-0000-0000-000000000001.jpg',
          'Rebar', 4096, 'image/jpeg');
  perform test_assert((select count(*) from public.report_photos where report_id = 'd1000000-0000-0000-0000-000000000031') = 1, 'the author sees the photo of their draft');
  perform test_assert((select uploaded_by from public.report_photos where id = 'e2000000-0000-0000-0000-000000000001') = 'b0000000-0000-0000-0000-00000000000b', 'uploaded_by is the caller');
  reset role;
  perform test_as('a0000000-0000-0000-0000-00000000000a');
  perform test_assert((select count(*) from public.report_photos where report_id = 'd1000000-0000-0000-0000-000000000031') = 0, 'the owner does not see a draft''s photo');
  reset role;

  -- a photo on an already submitted report: photos never wait for submit.
  perform test_as('b0000000-0000-0000-0000-00000000000b');
  insert into public.report_photos (id, org_id, site_id, report_id, storage_path, size_bytes, content_type)
  values ('e2000000-0000-0000-0000-000000000002', v_org::uuid, v_site::uuid, 'd1000000-0000-0000-0000-000000000001',
          v_org || '/' || v_site || '/d1000000-0000-0000-0000-000000000001/e2000000-0000-0000-0000-000000000002.png',
          8192, 'image/png');
  reset role;

  -- others cannot attach: a colleague, owner, PM, accountant, another org's owner.
  foreach u in array array['f0000000-0000-0000-0000-00000000000f', 'a0000000-0000-0000-0000-00000000000a',
                           'c0000000-0000-0000-0000-00000000000c', 'd0000000-0000-0000-0000-00000000000d',
                           'e0000000-0000-0000-0000-00000000000e']::uuid[] loop
    denied := 0;
    perform test_as(u);
    begin insert into public.report_photos (id, org_id, site_id, report_id, storage_path, size_bytes, content_type)
      values ('e2000000-0000-0000-0000-0000000000f1', v_org::uuid, v_site::uuid, 'd1000000-0000-0000-0000-000000000001',
              v_org || '/' || v_site || '/d1000000-0000-0000-0000-000000000001/e2000000-0000-0000-0000-0000000000f1.jpg',
              1000, 'image/jpeg');
    exception when insufficient_privilege then denied := 1; end;
    reset role;
    perform test_assert(denied = 1, 'cannot attach a photo to bob''s report: ' || u);
  end loop;

  -- bob: a photo naming another site fails the composite key; a report on an
  -- archived site is refused by the predicate; photos are never changed or removed.
  perform test_as('b0000000-0000-0000-0000-00000000000b');
  denied := 0;
  begin insert into public.report_photos (id, org_id, site_id, report_id, storage_path, size_bytes, content_type)
    values ('e2000000-0000-0000-0000-000000000009', v_org::uuid, '51000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000001',
            v_org || '/51000000-0000-0000-0000-000000000002/d1000000-0000-0000-0000-000000000001/e2000000-0000-0000-0000-000000000009.jpg',
            1000, 'image/jpeg');
  exception when foreign_key_violation then denied := denied + 1; end;
  begin insert into public.report_photos (id, org_id, site_id, report_id, storage_path, size_bytes, content_type)
    values ('e2000000-0000-0000-0000-00000000000a', v_org::uuid, '51000000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000003',
            v_org || '/51000000-0000-0000-0000-000000000003/d1000000-0000-0000-0000-000000000003/e2000000-0000-0000-0000-00000000000a.jpg',
            1000, 'image/jpeg');
  exception when insufficient_privilege then denied := denied + 1; end;
  begin update public.report_photos set caption = 'edited';
  exception when insufficient_privilege then denied := denied + 1; end;
  begin delete from public.report_photos;
  exception when insufficient_privilege then denied := denied + 1; end;
  reset role;
  perform test_assert(denied = 4, 'other-site report, archived site, update and delete are refused');

  -- visibility of a submitted report's photo.
  perform test_as('a0000000-0000-0000-0000-00000000000a');
  perform test_assert((select count(*) from public.report_photos where report_id = 'd1000000-0000-0000-0000-000000000001') = 1, 'owner sees a submitted report''s photo');
  perform test_assert((select count(*) from public.report_photos where report_id = 'd1000000-0000-0000-0000-000000000003') = 10, 'owner sees the photos of a reviewed report on an archived site');
  reset role;
  perform test_as('90000000-0000-0000-0000-000000000009');
  perform test_assert((select count(*) from public.report_photos) = 0, 'gina sees no photo of other sites');
  reset role;
  perform test_as('e0000000-0000-0000-0000-00000000000e');
  perform test_assert((select count(*) from public.report_photos) = 0, 'owner B sees no org A photo');
  reset role;

  -- submit the draft with its photo still there; the owner then sees the photo.
  perform test_as('b0000000-0000-0000-0000-00000000000b');
  update public.daily_reports set status = 'submitted' where id = 'd1000000-0000-0000-0000-000000000031';
  get diagnostics n = row_count;
  reset role;
  perform test_assert(n = 1, 'the author submits the draft');
  perform test_as('a0000000-0000-0000-0000-00000000000a');
  perform test_assert((select count(*) from public.report_photos where report_id = 'd1000000-0000-0000-0000-000000000031') = 1, 'the photo becomes visible once the report is submitted');
  reset role;
end $$;

-- --------------------------------------------------------- daily_report_status
do $$
declare n int;
begin
  -- a blocker and a safety flag raised on submit appear in the view.
  perform test_as('b0000000-0000-0000-0000-00000000000b');
  insert into public.daily_reports (id, org_id, site_id, report_date, status, headcount, work_done, serious_blocker, blockers, safety_incident)
  values ('d1000000-0000-0000-0000-000000000032', 'aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001',
          '2026-10-16', 'submitted', 8, 'Crane down', true, 'Crane out of service', false);
  insert into public.daily_reports (id, org_id, site_id, report_date, headcount, work_done)
  values ('d1000000-0000-0000-0000-000000000034', 'aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001',
          '2026-10-07', 3, 'Still a draft');
  reset role;
  perform test_as('90000000-0000-0000-0000-000000000009');
  update public.daily_reports set safety_incident = true, edit_reason = 'Fall from scaffold' where id = 'd1000000-0000-0000-0000-000000000022';
  reset role;

  perform test_as('c0000000-0000-0000-0000-00000000000c');           -- PM
  select count(*) into n from public.daily_report_status;
  perform test_assert(n = 7, 'project_manager reads every submitted and reviewed report in the view');
  perform test_assert((select count(*) from public.daily_report_status where status = 'draft') = 0, 'a draft is never in the view');
  perform test_assert((select count(*) from public.daily_report_status where id = 'd1000000-0000-0000-0000-000000000034') = 0, 'bob''s draft is not in the manager''s view');
  perform test_assert(
    (select serious_blocker and flagged and not safety_incident and blockers = 'Crane out of service'
       from public.daily_report_status where id = 'd1000000-0000-0000-0000-000000000032'),
    'a serious blocker is flagged in the view');
  perform test_assert(
    (select safety_incident and flagged and not serious_blocker
       from public.daily_report_status where id = 'd1000000-0000-0000-0000-000000000022'),
    'a safety incident is flagged in the view');
  perform test_assert((select count(*) from public.daily_report_status where flagged) = 3, 'exactly the flagged reports are flagged');
  perform test_assert((select not flagged from public.daily_report_status where id = 'd1000000-0000-0000-0000-000000000021'), 'an unflagged report is not flagged');
  perform test_assert((select photo_count from public.daily_report_status where id = 'd1000000-0000-0000-0000-000000000003') = 10, 'the view counts photos');
  reset role;

  perform test_as('b0000000-0000-0000-0000-00000000000b');
  perform test_assert((select count(*) from public.daily_report_status) = 5, 'bob reads the view for his sites, without his draft');
  perform test_assert((select count(*) from public.daily_report_status where id = 'd1000000-0000-0000-0000-000000000034') = 0, 'the author''s own draft is not in the view');
  reset role;
  perform test_as('90000000-0000-0000-0000-000000000009');
  perform test_assert((select count(*) from public.daily_report_status) = 2, 'gina''s view holds site 2 only');
  perform test_assert((select count(*) from public.daily_report_status where site_id = '51000000-0000-0000-0000-000000000001') = 0, 'a supervisor''s view holds nothing of an unassigned site');
  reset role;
  perform test_as('d0000000-0000-0000-0000-00000000000d');
  perform test_assert((select count(*) from public.daily_report_status) = 0, 'an accountant with no site sees an empty view');
  reset role;
  perform test_as('e0000000-0000-0000-0000-00000000000e');
  perform test_assert((select count(*) from public.daily_report_status) = 1, 'owner B''s view holds org B only');
  perform test_assert((select count(*) from public.daily_report_status where org_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 0, 'owner B''s view holds no org A row');
  reset role;
end $$;

-- ------------------------------------------------------ review_daily_report
-- A submitted report on the archived site, filed before it closed.
insert into public.daily_reports
  (id, org_id, site_id, report_date, author_id, status, headcount, work_done, submitted_at, submitted_by) values
  ('d1000000-0000-0000-0000-000000000041', 'aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000003',
   '2026-10-02', 'b0000000-0000-0000-0000-00000000000b', 'submitted', 2, 'Snagging', now(), 'b0000000-0000-0000-0000-00000000000b');

do $$ begin
  perform test_assert(
    (select prosecdef and proconfig @> array['search_path=public']
       from pg_proc where oid = 'public.review_daily_report(uuid, text)'::regprocedure),
    'review_daily_report is security definer and pins search_path');
  perform test_assert(
    not has_function_privilege('anon', 'public.review_daily_report(uuid, text)', 'execute')
    and not has_function_privilege('public', 'public.review_daily_report(uuid, text)', 'execute')
    and has_function_privilege('authenticated', 'public.review_daily_report(uuid, text)', 'execute'),
    'review_daily_report is revoked from public and anon, granted to authenticated');
end $$;

do $$
declare denied int := 0; u uuid; m_unknown text; m_draft text; m_foreign text; m_wrong text;
begin
  -- anon cannot execute it, and a call with no user is refused.
  perform test_as_anon();
  begin perform review_daily_report('d1000000-0000-0000-0000-000000000001');
  exception when insufficient_privilege then denied := denied + 1; end;
  reset role;
  perform test_as(null);
  begin perform review_daily_report('d1000000-0000-0000-0000-000000000001');
  exception when invalid_authorization_specification then denied := denied + 1; end;
  reset role;
  perform test_assert(denied = 2, 'anon and a call with no signed-in user are refused');

  -- the wrong role, the wrong organisation: each is refused and changes nothing.
  foreach u in array array['b0000000-0000-0000-0000-00000000000b',     -- the author
                           'f0000000-0000-0000-0000-00000000000f',     -- a colleague
                           '90000000-0000-0000-0000-000000000009',     -- supervisor elsewhere
                           'd0000000-0000-0000-0000-00000000000d',     -- accountant
                           'e0000000-0000-0000-0000-00000000000e']::uuid[] loop
    denied := 0;
    perform test_as(u);
    begin perform review_daily_report('d1000000-0000-0000-0000-000000000001', 'sneaky');
    exception when insufficient_privilege then denied := 1; end;
    reset role;
    perform test_assert(denied = 1, 'cannot review report R1: ' || u);
  end loop;
  perform test_assert((select status = 'submitted' and reviewed_by is null and review_note is null
                         from public.daily_reports where id = 'd1000000-0000-0000-0000-000000000001'),
    'R1 is untouched by refused reviews');

  -- the owner of org A cannot review org B's report.
  perform test_as('a0000000-0000-0000-0000-00000000000a');
  begin perform review_daily_report('d1000000-0000-0000-0000-0000000000b1');
  exception when insufficient_privilege then get stacked diagnostics m_foreign = message_text; end;
  -- an unknown id, and a draft that exists, give the manager the same answer.
  begin perform review_daily_report('d1000000-0000-0000-0000-0000000009ff');
  exception when insufficient_privilege then get stacked diagnostics m_unknown = message_text; end;
  reset role;
  perform test_as('c0000000-0000-0000-0000-00000000000c');
  begin perform review_daily_report('d1000000-0000-0000-0000-000000000034');
  exception when insufficient_privilege then get stacked diagnostics m_draft = message_text; end;
  reset role;
  perform test_assert(m_foreign is not null and m_foreign = m_unknown and m_unknown = m_draft,
    'another org''s report, an unknown id and a draft all give the same error');
  perform test_assert((select status from public.daily_reports where id = 'd1000000-0000-0000-0000-000000000034') = 'draft',
    'the draft is still a draft');
end $$;

do $$
declare n int;
begin
  -- the project manager reviews, with a note.
  perform test_as('c0000000-0000-0000-0000-00000000000c');
  perform review_daily_report('d1000000-0000-0000-0000-000000000021', '  Checked with the site engineer  ');
  reset role;
  perform test_assert(
    (select status = 'reviewed' and reviewed_by = 'c0000000-0000-0000-0000-00000000000c' and reviewed_at is not null
            and review_note = 'Checked with the site engineer'
            and headcount = 6 and work_done = 'Brickwork'
       from public.daily_reports where id = 'd1000000-0000-0000-0000-000000000021'),
    'a project_manager marks a report reviewed; the note is trimmed and the content is untouched');

  -- the owner reviews, with no note (a blank one is stored as none).
  perform test_as('a0000000-0000-0000-0000-00000000000a');
  perform review_daily_report('d1000000-0000-0000-0000-000000000033', '   ');
  perform review_daily_report('d1000000-0000-0000-0000-000000000041');          -- archived site
  reset role;
  perform test_assert(
    (select status = 'reviewed' and reviewed_by = 'a0000000-0000-0000-0000-00000000000a' and review_note is null
       from public.daily_reports where id = 'd1000000-0000-0000-0000-000000000033'),
    'the owner marks a report reviewed with no note');
  perform test_assert((select status = 'reviewed' from public.daily_reports where id = 'd1000000-0000-0000-0000-000000000041'),
    'a report on an archived site can still be reviewed');

  -- a second review changes nothing: the first reviewer and note stay.
  perform test_as('a0000000-0000-0000-0000-00000000000a');
  perform review_daily_report('d1000000-0000-0000-0000-000000000021', 'Second thoughts');
  reset role;
  perform test_assert(
    (select reviewed_by = 'c0000000-0000-0000-0000-00000000000c' and review_note = 'Checked with the site engineer'
       from public.daily_reports where id = 'd1000000-0000-0000-0000-000000000021'),
    'reviewing a reviewed report is a no-op');

  -- a note over 1000 characters is refused and the report stays submitted.
  perform test_as('a0000000-0000-0000-0000-00000000000a');
  begin perform review_daily_report('d1000000-0000-0000-0000-000000000001', repeat('x', 1001));
  exception when invalid_parameter_value then n := 1; end;
  perform review_daily_report('d1000000-0000-0000-0000-000000000001', repeat('x', 1000));
  reset role;
  perform test_assert(n = 1 and (select status = 'reviewed' and char_length(review_note) = 1000
                                   from public.daily_reports where id = 'd1000000-0000-0000-0000-000000000001'),
    'the note limit is 1000 characters');

  -- reviewed is final: the author's edits now change 0 rows, even with a reason.
  perform test_as('b0000000-0000-0000-0000-00000000000b');
  update public.daily_reports set headcount = 1, edit_reason = 'too late' where id = 'd1000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  reset role;
  perform test_assert(n = 0 and (select headcount = 15 from public.daily_reports where id = 'd1000000-0000-0000-0000-000000000001'),
    'a reviewed report can no longer be edited by its author');
  -- ...but a late photo may still be added (D6).
  perform test_as('b0000000-0000-0000-0000-00000000000b');
  insert into public.report_photos (id, org_id, site_id, report_id, storage_path, size_bytes, content_type)
  values ('e2000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001',
          'd1000000-0000-0000-0000-000000000001',
          'aaaaaaaa-0000-0000-0000-000000000001/51000000-0000-0000-0000-000000000001/d1000000-0000-0000-0000-000000000001/e2000000-0000-0000-0000-000000000003.webp',
          5000, 'image/webp');
  reset role;
  perform test_assert((select count(*) from public.report_photos where report_id = 'd1000000-0000-0000-0000-000000000001') = 2,
    'a photo can still be added to a reviewed report');

  -- the view shows the review.
  perform test_as('c0000000-0000-0000-0000-00000000000c');
  perform test_assert(
    (select status = 'reviewed' and reviewed_by = 'c0000000-0000-0000-0000-00000000000c' and review_note = 'Checked with the site engineer'
       from public.daily_report_status where id = 'd1000000-0000-0000-0000-000000000021'),
    'daily_report_status shows who reviewed and the note');
  reset role;
end $$;

rollback;
