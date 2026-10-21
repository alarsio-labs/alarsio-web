-- The /overview page (#112, ADR-041): every read it makes, as each role.
--
-- The page adds no table, view or function. It reads five published views, each
-- filtered to one organisation and, where the view has a date, one day, and calls
-- is_org_member. This suite runs those exact reads as every role and pins what
-- each one returns, so the page can never show more than RLS allows, and a project
-- manager is proven to read the approved days the page needs.
--
-- Conventions as in attendance_views_test.sql: test_as / test_as_anon / test_assert.
-- The day is yesterday, never a literal, so nothing depends on the hour the suite runs.
begin;

-- ---------------------------------------------------------------- fixtures
-- Org A: owner a01, project manager a02, supervisors a03 (A1) and a04 (A2),
-- accountant a05 (no assignment). Org B: owner b01, supervisor b03 (B1).
-- Sites: A1 and A2 active, A3 archived, B1 active. All at (0, 0), radius 200 m.

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000a01', 'owner-a@test.local'),
  ('00000000-0000-0000-0000-000000000a02', 'pm-a@test.local'),
  ('00000000-0000-0000-0000-000000000a03', 'sup-a1@test.local'),
  ('00000000-0000-0000-0000-000000000a04', 'sup-a2@test.local'),
  ('00000000-0000-0000-0000-000000000a05', 'acct-a@test.local'),
  ('00000000-0000-0000-0000-000000000b01', 'owner-b@test.local'),
  ('00000000-0000-0000-0000-000000000b03', 'sup-b@test.local');

create function public.test_u(k text)    returns uuid language sql immutable as $$ select ('00000000-0000-0000-0000-000000000' || k)::uuid $$;
create function public.test_org(k text)  returns uuid language sql immutable as $$ select ('10000000-0000-0000-0000-00000000000' || k)::uuid $$;
create function public.test_site(k text) returns uuid language sql immutable as $$ select ('20000000-0000-0000-0000-0000000000' || k)::uuid $$;
create function public.test_w(k text)    returns uuid language sql immutable as $$ select ('77000000-0000-0000-0000-0000000000' || k)::uuid $$;
create function public.test_day()        returns date language sql stable    as $$ select current_date - 1 $$;

insert into public.organizations (id, name, created_by) values
  (public.test_org('a'), 'Org A', public.test_u('a01')),
  (public.test_org('b'), 'Org B', public.test_u('b01'));

insert into public.memberships (org_id, user_id, role) values
  (public.test_org('a'), public.test_u('a01'), 'owner'),
  (public.test_org('a'), public.test_u('a02'), 'project_manager'),
  (public.test_org('a'), public.test_u('a03'), 'supervisor'),
  (public.test_org('a'), public.test_u('a04'), 'supervisor'),
  (public.test_org('a'), public.test_u('a05'), 'accountant'),
  (public.test_org('b'), public.test_u('b01'), 'owner'),
  (public.test_org('b'), public.test_u('b03'), 'supervisor');

insert into public.sites (id, org_id, name, address, latitude, longitude, status, created_by) values
  (public.test_site('a1'), public.test_org('a'), 'A One',   'Pune',   0, 0, 'active', public.test_u('a01')),
  (public.test_site('a2'), public.test_org('a'), 'A Two',   'Nagpur', 0, 0, 'active', public.test_u('a01')),
  (public.test_site('b1'), public.test_org('b'), 'B One',   'Indore', 0, 0, 'active', public.test_u('b01'));
insert into public.sites (id, org_id, name, address, latitude, longitude, status, archived_at, archived_by, created_by) values
  (public.test_site('a3'), public.test_org('a'), 'A Three', 'Nashik', 0, 0, 'archived', now(), public.test_u('a01'), public.test_u('a01'));

insert into public.site_assignments (org_id, site_id, user_id, assigned_by) values
  (public.test_org('a'), public.test_site('a1'), public.test_u('a03'), public.test_u('a01')),
  (public.test_org('a'), public.test_site('a2'), public.test_u('a04'), public.test_u('a01')),
  (public.test_org('b'), public.test_site('b1'), public.test_u('b03'), public.test_u('b01'));

-- Workers rostered since 30 days ago: 01 Ravi and 02 Sita at A1, 04 Latha at A2, b1 Bela at B1.
insert into public.workers (id, org_id, code, full_name, trade, pay_type, created_by) values
  (public.test_w('01'), public.test_org('a'), 'W-001', 'Ravi',  'mason',  'daily', public.test_u('a01')),
  (public.test_w('02'), public.test_org('a'), 'W-002', 'Sita',  'helper', 'daily', public.test_u('a01')),
  (public.test_w('04'), public.test_org('a'), 'W-004', 'Latha', 'helper', 'daily', public.test_u('a01')),
  (public.test_w('b1'), public.test_org('b'), 'W-001', 'Bela',  'mason',  'daily', public.test_u('b01'));

insert into public.worker_site_assignments (org_id, worker_id, site_id, assigned_by, assigned_at) values
  (public.test_org('a'), public.test_w('01'), public.test_site('a1'), public.test_u('a01'), now() - interval '30 days'),
  (public.test_org('a'), public.test_w('02'), public.test_site('a1'), public.test_u('a01'), now() - interval '30 days'),
  (public.test_org('a'), public.test_w('04'), public.test_site('a2'), public.test_u('a01'), now() - interval '30 days'),
  (public.test_org('b'), public.test_w('b1'), public.test_site('b1'), public.test_u('b01'), now() - interval '30 days');

-- The day, written by the superuser (the triggers still run).
--   A1: a submitted report with a serious blocker; an open attendance day with two
--       entries; one visit checked in outside the geofence.
--   A2: a submitted report; an approved attendance day with one entry and a pending
--       correction (section 0); cement low.
--   A3: archived, nothing.
--   B1: the same as A1's report and day, plus low steel, in org B.
insert into public.daily_reports
  (org_id, site_id, report_date, author_id, status, headcount, work_done, serious_blocker, blockers, submitted_at, submitted_by) values
  (public.test_org('a'), public.test_site('a1'), public.test_day(), public.test_u('a03'), 'submitted', 2, 'Shuttering', true,  'Crane down', now(), public.test_u('a03')),
  (public.test_org('a'), public.test_site('a2'), public.test_day(), public.test_u('a04'), 'submitted', 1, 'Plaster',    false, null,         now(), public.test_u('a04')),
  (public.test_org('b'), public.test_site('b1'), public.test_day(), public.test_u('b03'), 'submitted', 1, 'Tiling',     false, null,         now(), public.test_u('b03'));

insert into public.attendance_days (org_id, site_id, attendance_date, recorded_by) values
  (public.test_org('a'), public.test_site('a1'), public.test_day(), public.test_u('a03')),
  (public.test_org('a'), public.test_site('a2'), public.test_day(), public.test_u('a04')),
  (public.test_org('b'), public.test_site('b1'), public.test_day(), public.test_u('b03'));

insert into public.attendance_entries (org_id, site_id, attendance_date, worker_id, status, overtime_hours, recorded_by) values
  (public.test_org('a'), public.test_site('a1'), public.test_day(), public.test_w('01'), 'present', 0, public.test_u('a03')),
  (public.test_org('a'), public.test_site('a1'), public.test_day(), public.test_w('02'), 'present', 0, public.test_u('a03')),
  (public.test_org('a'), public.test_site('a2'), public.test_day(), public.test_w('04'), 'present', 0, public.test_u('a04')),
  (public.test_org('b'), public.test_site('b1'), public.test_day(), public.test_w('b1'), 'present', 0, public.test_u('b03'));

update public.attendance_days
   set status = 'approved', reviewed_by = public.test_u('a02'), reviewed_at = now()
 where site_id = public.test_site('a2') and attendance_date = public.test_day();

-- Checked in at noon IST on the day, about 1.1 km out, and out again inside.
insert into public.site_visits (id, org_id, site_id, user_id, check_in_at, check_in_lat, check_in_lng, check_in_reason) values
  ('30000000-0000-0000-0000-000000000001', public.test_org('a'), public.test_site('a1'), public.test_u('a03'),
   (public.test_day() + time '12:00') at time zone 'Asia/Kolkata', 0.01, 0, 'Gate locked');
update public.site_visits
   set check_out_at = (public.test_day() + time '18:00') at time zone 'Asia/Kolkata', check_out_lat = 0, check_out_lng = 0
 where id = '30000000-0000-0000-0000-000000000001';

insert into public.materials (id, org_id, site_id, name, unit, low_stock_threshold, created_by) values
  ('a1000000-0000-0000-0000-000000000001', public.test_org('a'), public.test_site('a2'), 'Cement', 'bag',   20, public.test_u('a01')),
  ('a1000000-0000-0000-0000-000000000002', public.test_org('a'), public.test_site('a1'), 'Sand',   'cft',   null, public.test_u('a01')),
  ('a1000000-0000-0000-0000-0000000000b1', public.test_org('b'), public.test_site('b1'), 'Steel',  'tonne', 5,  public.test_u('b01'));
insert into public.material_transactions (org_id, site_id, material_id, kind, quantity, occurred_on, recorded_by) values
  (public.test_org('a'), public.test_site('a2'), 'a1000000-0000-0000-0000-000000000001', 'receipt', 5,  current_date, public.test_u('a01')),
  (public.test_org('a'), public.test_site('a1'), 'a1000000-0000-0000-0000-000000000002', 'receipt', 50, current_date, public.test_u('a01')),
  (public.test_org('b'), public.test_site('b1'), 'a1000000-0000-0000-0000-0000000000b1', 'receipt', 1,  current_date, public.test_u('b01'));

-- ----------------------------------------------------------------- helpers

-- Rows p_user sees through p_sql (a select), or the SQLSTATE raised. Null is anon.
create function public.test_count(p_user uuid, p_sql text) returns text language plpgsql as $$
declare s text; n bigint;
begin
  if p_user is null then perform test_as_anon(); else perform test_as(p_user); end if;
  begin
    execute 'select count(*) from (' || p_sql || ') q' into n;
  exception when others then s := sqlstate; end;
  execute 'reset role';
  return coalesce(s, n::text);
end $$;

-- The page's five reads for organisation p_org and the day, in the page's own filters.
create function public.test_read(p_view text, p_org uuid) returns text language sql stable as $$
  select case p_view
    when 'sites'      then format('select id from public.site_directory where org_id = %L', p_org)
    when 'reports'    then format('select id from public.daily_report_status where org_id = %L and report_date = %L', p_org, public.test_day())
    when 'exceptions' then format('select kind from public.site_exceptions where org_id = %L and exception_date = %L', p_org, public.test_day())
    when 'approved'   then format('select site_id from public.approved_attendance_days where org_id = %L and work_date = %L', p_org, public.test_day())
    when 'alerts'     then format('select material_id from public.material_alerts where org_id = %L', p_org)
  end
$$;

-- All five counts as "sites|reports|exceptions|approved|alerts".
create function public.test_reads(p_user uuid, p_org uuid) returns text language sql as $$
  select string_agg(public.test_count(p_user, public.test_read(v, p_org)), '|' order by o)
    from unnest(array['sites', 'reports', 'exceptions', 'approved', 'alerts']) with ordinality as x (v, o)
$$;

create function public.test_member(p_user uuid, p_org uuid) returns boolean language plpgsql as $$
declare ok boolean;
begin
  perform test_as(p_user);
  ok := public.is_org_member(p_org);
  execute 'reset role';
  return ok;
end $$;

-- ------------------------------------------------- 0 · setup that runs as a user
do $$
begin
  -- A correction is for an approved day (ADR-030), so it is on A2, proposed by its
  -- supervisor as on the phone; the trigger stamps the old value.
  perform test_as(test_u('a04'));
  insert into public.attendance_corrections (id, org_id, site_id, attendance_date, worker_id, new_status, new_overtime_hours, reason)
  values ('60000000-0000-0000-0000-000000000001', test_org('a'), test_site('a2'), test_day(), test_w('04'), 'half_day', 0, 'Left at lunch');
  execute 'reset role';

  perform test_assert((select count(*) from public.attendance_corrections where review_status = 'pending') = 1,
    '[0.01] (setup) one correction is pending');
end $$;

-- ------------------------------------------------- 1 · what each role reads
do $$
declare r text;
begin
  -- Owner and project manager: every site of org A, archived included (the page hides
  -- a quiet one), both reports, three exceptions (A1's open day and geofence flag, A2's correction),
  -- A2's one approved entry, A2's low cement.
  r := test_reads(test_u('a01'), test_org('a'));
  perform test_assert(r = '3|2|3|1|1', '[1.01] owner reads sites|reports|exceptions|approved|alerts = 3|2|3|1|1, got ' || r);
  r := test_reads(test_u('a02'), test_org('a'));
  perform test_assert(r = '3|2|3|1|1', '[1.02] project manager reads the same as the owner, got ' || r);

  -- The three exceptions are one of each kind the fixture made.
  perform test_as(test_u('a02'));
  select string_agg(kind, ',' order by kind) into r
    from public.site_exceptions where org_id = test_org('a') and exception_date = test_day();
  execute 'reset role';
  perform test_assert(r = 'correction_pending,day_awaiting_review,geofence_check_in',
    '[1.03] the project manager sees each exception kind once, got ' || coalesce(r, 'nothing'));

  -- Supervisors: their own site only, in every read.
  r := test_reads(test_u('a03'), test_org('a'));
  perform test_assert(r = '1|1|2|0|0', '[1.04] the A1 supervisor reads only A1, got ' || r);
  r := test_reads(test_u('a04'), test_org('a'));
  perform test_assert(r = '1|1|1|1|1', '[1.05] the A2 supervisor reads only A2, got ' || r);

  -- Accountant with no assignment: no site, report, exception or alert. The wage
  -- policy (ADR-032 D3) lets them read approved days, but with no site in the
  -- directory the page builds no row from it.
  r := test_reads(test_u('a05'), test_org('a'));
  perform test_assert(r = '0|0|0|1|0', '[1.06] the accountant reads only the approved day, and no site, got ' || r);

  -- Another organisation's owner and supervisor: nothing of org A.
  r := test_reads(test_u('b01'), test_org('a'));
  perform test_assert(r = '0|0|0|0|0', '[1.07] org B''s owner reads nothing of org A, got ' || r);
  r := test_reads(test_u('b03'), test_org('a'));
  perform test_assert(r = '0|0|0|0|0', '[1.08] org B''s supervisor reads nothing of org A, got ' || r);

  -- And the other way: org A's owner reads nothing of org B through the same filters.
  r := test_reads(test_u('a01'), test_org('b'));
  perform test_assert(r = '0|0|0|0|0', '[1.09] org A''s owner reads nothing of org B, got ' || r);
end $$;

-- ------------------------------------------------- 2 · membership and anon
do $$
declare r text;
begin
  perform test_assert(test_member(test_u('a02'), test_org('a')), '[2.01] the project manager is a member of org A');
  perform test_assert(test_member(test_u('a05'), test_org('a')), '[2.02] the accountant is a member of org A');
  perform test_assert(not test_member(test_u('b01'), test_org('a')), '[2.03] org B''s owner is not a member of org A, so the page redirects');

  -- anon has no grant on any of the five views.
  r := test_reads(null, test_org('a'));
  perform test_assert(r = '42501|42501|42501|42501|42501', '[2.04] anon is refused every read, got ' || r);
end $$;

-- ------------------------------------------------- 3 · the page follows a change
do $$
declare r text;
begin
  -- Approving A1's day moves it out of "awaiting review" and into the approved read,
  -- which is how the page's attendance state changes. Done by the superuser here:
  -- review_attendance_day has its own suites.
  update public.attendance_days
     set status = 'approved', reviewed_by = test_u('a01'), reviewed_at = now()
   where site_id = test_site('a1') and attendance_date = test_day();

  r := test_reads(test_u('a02'), test_org('a'));
  perform test_assert(r = '3|2|2|3|1', '[3.01] after approval the project manager reads 2 exceptions and 3 approved entries, got ' || r);
  r := test_count(test_u('a02'), format(
    'select 1 from public.site_exceptions where org_id = %L and exception_date = %L and kind = ''day_awaiting_review''',
    test_org('a'), test_day()));
  perform test_assert(r = '0', '[3.02] an approved day is no longer awaiting review, got ' || r);
end $$;

rollback;
