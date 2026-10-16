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
  -- unknown status; submitted without a stamp; a draft with a review.
  begin insert into public.daily_reports (org_id, site_id, report_date, author_id, status)
    values ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', '2026-10-08', 'b0000000-0000-0000-0000-00000000000b', 'approved');
  exception when check_violation then denied := denied + 1; end;
  begin insert into public.daily_reports (org_id, site_id, report_date, author_id, status, headcount, work_done)
    values ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', '2026-10-08', 'b0000000-0000-0000-0000-00000000000b', 'submitted', 4, 'Work');
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

rollback;
