-- Daily Reporting: daily_report_status publishes work_done and next_day_plan for the
-- phone's report mirror, and nothing write-only. Issue #267.
-- Org A: bob and fred supervisors on site 1, gina supervisor on site 2 only, carol PM.
-- Org B: eve owner. Runs on the team runner (shim, no pgTAP).
begin;

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-00000000000a', 'alice@x'),
  ('b0000000-0000-0000-0000-00000000000b', 'bob@x'),
  ('c0000000-0000-0000-0000-00000000000c', 'carol@x'),
  ('e0000000-0000-0000-0000-00000000000e', 'eve@x'),
  ('f0000000-0000-0000-0000-00000000000f', 'fred@x'),
  ('90000000-0000-0000-0000-000000000009', 'gina@x');
insert into public.organizations (id, name, created_by) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Org A', 'a0000000-0000-0000-0000-00000000000a'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Org B', 'e0000000-0000-0000-0000-00000000000e');
insert into public.memberships (org_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'owner'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000c', 'project_manager'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b', 'supervisor'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-00000000000f', 'supervisor'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000009', 'supervisor'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-00000000000e', 'owner');
insert into public.sites (id, org_id, name, address, latitude, longitude, created_by) values
  ('51000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Site 1', 'x', 19.0, 73.0, 'a0000000-0000-0000-0000-00000000000a'),
  ('51000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Site 2', 'x', 19.1, 73.1, 'a0000000-0000-0000-0000-00000000000a');
insert into public.site_assignments (org_id, site_id, user_id, assigned_by) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-00000000000a'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-00000000000f', 'a0000000-0000-0000-0000-00000000000a'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000002', '90000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-00000000000a');

-- Bob's submitted report with every text, and his draft (never in the view), on site 1.
insert into public.daily_reports
  (id, org_id, site_id, report_date, author_id, status, headcount, work_done, blockers,
   next_day_plan, submitted_at, submitted_by) values
  ('d1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001',
   '2026-11-20', 'b0000000-0000-0000-0000-00000000000b', 'submitted', 12, 'Slab poured', 'Sand late',
   'Shuttering', now(), 'b0000000-0000-0000-0000-00000000000b');
insert into public.daily_reports (id, org_id, site_id, report_date, author_id, status, work_done, next_day_plan)
values ('d1000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001',
        '2026-11-21', 'b0000000-0000-0000-0000-00000000000b', 'draft', 'Draft text', 'Draft plan');

do $$
declare r record;
begin
  -- [1] The two texts are in the view, with the columns the phone already reads.
  perform test_as('b0000000-0000-0000-0000-00000000000b');
  select * into r from public.daily_report_status where id = 'd1000000-0000-0000-0000-000000000001';
  perform test_assert(
    r.work_done = 'Slab poured' and r.next_day_plan = 'Shuttering' and r.blockers = 'Sand late' and r.headcount = 12,
    '[1.01] the author reads the full text of her report in the view');
  -- [2] Nothing write-only is published.
  perform test_assert(
    not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'daily_report_status' and column_name = 'edit_reason'),
    '[2.01] the view has no edit_reason');
  perform test_assert(
    (select 'security_invoker=true' = any (reloptions) from pg_class where oid = 'public.daily_report_status'::regclass),
    '[2.02] the view is still security_invoker');
  -- [3] A draft stays out, even for its own author.
  perform test_assert(
    (select count(*) from public.daily_report_status where id = 'd1000000-0000-0000-0000-000000000002') = 0,
    '[3.01] the author''s draft, with its text, is not in the view');
  reset role;

  -- [4] Who else reads the text: a manager, a colleague on the site, and no one else.
  perform test_as('c0000000-0000-0000-0000-00000000000c');
  perform test_assert(
    (select work_done from public.daily_report_status where id = 'd1000000-0000-0000-0000-000000000001') = 'Slab poured',
    '[4.01] a project manager reads the text');
  reset role;
  perform test_as('f0000000-0000-0000-0000-00000000000f');
  perform test_assert(
    (select next_day_plan from public.daily_report_status where id = 'd1000000-0000-0000-0000-000000000001') = 'Shuttering',
    '[4.02] a supervisor on the same site reads the text');
  reset role;
  perform test_as('90000000-0000-0000-0000-000000000009');
  perform test_assert(
    (select count(*) from public.daily_report_status) = 0,
    '[4.03] a supervisor on another site reads no row, so no text');
  reset role;
  perform test_as('e0000000-0000-0000-0000-00000000000e');
  perform test_assert(
    (select count(*) from public.daily_report_status) = 0,
    '[4.04] an owner of another organisation reads no row, so no text');
  reset role;
  perform test_as_anon();
  begin
    perform 1 from public.daily_report_status;
    perform test_assert(false, '[4.05] a signed-out caller is refused');
  exception when insufficient_privilege then
    null;
  end;
  reset role;
end $$;

rollback;
