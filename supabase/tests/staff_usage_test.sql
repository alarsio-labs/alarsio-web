-- Staff usage (ADR-052): staff_members, is_staff() and staff_org_usage().
--
-- What this proves:
--   * nobody can read or write staff_members through the API, staff included;
--   * is_staff() is true only for a person on the allowlist, and anon cannot run it;
--   * staff_org_usage() refuses everyone else with 42501, owners and supervisors
--     included, and anon cannot run it at all;
--   * a staff user gets one row per organisation with the right counts, weeks
--     bucketed on the Indian calendar (Monday 00:00 IST), and nothing personal;
--   * no role was added.
-- Conventions as in the other suites: test_as / test_as_anon / test_assert.
-- Every time is relative to now(), never a literal, so nothing depends on the day it runs.
begin;

-- ---------------------------------------------------------------- fixtures
-- Org A: owner a01, project manager a02, supervisors a03 (A1) and a04 (A2),
--        accountant a05. Three sites (A3 archived), three workers.
-- Org B: owner b01, supervisor b03. One site, one worker.
-- Org C "Org C (Demo)": no members, no sites, nothing.
-- Staff: s01, in no organisation. Plain: p01, in no organisation, not staff.

insert into auth.users (id, email, last_sign_in_at) values
  ('00000000-0000-0000-0000-000000000a01', 'owner-a@test.local', now() - interval '2 days'),
  ('00000000-0000-0000-0000-000000000a02', 'pm-a@test.local',    null),
  ('00000000-0000-0000-0000-000000000a03', 'sup-a1@test.local',  null),
  ('00000000-0000-0000-0000-000000000a04', 'sup-a2@test.local',  null),
  ('00000000-0000-0000-0000-000000000a05', 'acct-a@test.local',  now() - interval '1 day'),
  ('00000000-0000-0000-0000-000000000b01', 'owner-b@test.local', now()),
  ('00000000-0000-0000-0000-000000000b03', 'sup-b@test.local',   null),
  ('00000000-0000-0000-0000-000000000501', 'staff@test.local',   now()),
  ('00000000-0000-0000-0000-000000000901', 'plain@test.local',   null);

create function public.test_u(k text)    returns uuid language sql immutable as $$ select ('00000000-0000-0000-0000-000000000' || k)::uuid $$;
create function public.test_org(k text)  returns uuid language sql immutable as $$ select ('10000000-0000-0000-0000-00000000000' || k)::uuid $$;
create function public.test_site(k text) returns uuid language sql immutable as $$ select ('20000000-0000-0000-0000-0000000000' || k)::uuid $$;
create function public.test_w(k text)    returns uuid language sql immutable as $$ select ('77000000-0000-0000-0000-0000000000' || k)::uuid $$;
-- Monday 00:00 in India, this week: the edge the weekly buckets must respect.
create function public.test_monday() returns timestamptz language sql stable as $$
  select date_trunc('week', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata'
$$;

insert into public.organizations (id, name, created_by, created_at) values
  (public.test_org('a'), 'Org A',        public.test_u('a01'), now() - interval '50 days'),
  (public.test_org('b'), 'Org B',        public.test_u('b01'), now() - interval '20 days'),
  (public.test_org('c'), 'Org C (Demo)', public.test_u('501'), now() - interval '10 days');

insert into public.memberships (org_id, user_id, role) values
  (public.test_org('a'), public.test_u('a01'), 'owner'),
  (public.test_org('a'), public.test_u('a02'), 'project_manager'),
  (public.test_org('a'), public.test_u('a03'), 'supervisor'),
  (public.test_org('a'), public.test_u('a04'), 'supervisor'),
  (public.test_org('a'), public.test_u('a05'), 'accountant'),
  (public.test_org('b'), public.test_u('b01'), 'owner'),
  (public.test_org('b'), public.test_u('b03'), 'supervisor');

-- Sites and workers are 40 days old, so only the records below make anyone "active".
insert into public.sites (id, org_id, name, address, latitude, longitude, status, created_by, created_at) values
  (public.test_site('a1'), public.test_org('a'), 'A One', 'Pune',   0, 0, 'active', public.test_u('a01'), now() - interval '40 days'),
  (public.test_site('a2'), public.test_org('a'), 'A Two', 'Nagpur', 0, 0, 'active', public.test_u('a01'), now() - interval '40 days'),
  (public.test_site('b1'), public.test_org('b'), 'B One', 'Indore', 0, 0, 'active', public.test_u('b01'), now() - interval '40 days');
insert into public.sites (id, org_id, name, address, latitude, longitude, status, archived_at, archived_by, created_by, created_at) values
  (public.test_site('a3'), public.test_org('a'), 'A Three', 'Nashik', 0, 0, 'archived', now(), public.test_u('a01'), public.test_u('a01'), now() - interval '40 days');

insert into public.site_assignments (org_id, site_id, user_id, assigned_by) values
  (public.test_org('a'), public.test_site('a1'), public.test_u('a03'), public.test_u('a01')),
  (public.test_org('a'), public.test_site('a2'), public.test_u('a04'), public.test_u('a01')),
  (public.test_org('b'), public.test_site('b1'), public.test_u('b03'), public.test_u('b01'));

insert into public.workers (id, org_id, code, full_name, phone, trade, pay_type, created_by, created_at) values
  (public.test_w('01'), public.test_org('a'), 'W-001', 'Ravi Secretname',  '9000000001', 'mason',  'daily', public.test_u('a01'), now() - interval '40 days'),
  (public.test_w('02'), public.test_org('a'), 'W-002', 'Sita Secretname',  '9000000002', 'helper', 'daily', public.test_u('a01'), now() - interval '40 days'),
  (public.test_w('03'), public.test_org('a'), 'W-003', 'Latha Secretname', '9000000003', 'helper', 'daily', public.test_u('a01'), now() - interval '40 days'),
  (public.test_w('b1'), public.test_org('b'), 'W-001', 'Bela Secretname',  '9000000004', 'mason',  'daily', public.test_u('b01'), now() - interval '40 days');

insert into public.worker_site_assignments (org_id, worker_id, site_id, assigned_by, assigned_at) values
  (public.test_org('a'), public.test_w('01'), public.test_site('a1'), public.test_u('a01'), now() - interval '45 days'),
  (public.test_org('a'), public.test_w('02'), public.test_site('a1'), public.test_u('a01'), now() - interval '45 days'),
  (public.test_org('a'), public.test_w('03'), public.test_site('a1'), public.test_u('a01'), now() - interval '45 days'),
  (public.test_org('b'), public.test_w('b1'), public.test_site('b1'), public.test_u('b01'), now() - interval '45 days');

-- Org A records (recorded_by a03 unless said):
--   e1 now                       -> this week
--   e2 Monday 00:00 IST sharp    -> this week (in UTC it is still Sunday)
--   e3 one minute before that    -> last week
--   report r1 now by a04         -> this week
--   e4 29 days ago by a02        -> counted in the total, outside 28 days, outside the four weeks
--                                   (a report cannot stand in: its trigger stamps created_at itself)
--   material m1 now by a01       -> this week
--   check-in v1 last Sunday noon IST by a03 -> last week
insert into public.attendance_days (org_id, site_id, attendance_date, recorded_by) values
  (public.test_org('a'), public.test_site('a1'), current_date - 1,  public.test_u('a03')),
  (public.test_org('a'), public.test_site('a1'), current_date - 40, public.test_u('a02'));
insert into public.attendance_entries (org_id, site_id, attendance_date, worker_id, status, overtime_hours, recorded_by, created_at) values
  (public.test_org('a'), public.test_site('a1'), current_date - 1, public.test_w('01'), 'present', 0, public.test_u('a03'), now()),
  (public.test_org('a'), public.test_site('a1'), current_date - 1, public.test_w('02'), 'present', 0, public.test_u('a03'), public.test_monday()),
  (public.test_org('a'), public.test_site('a1'), current_date - 1, public.test_w('03'), 'present', 0, public.test_u('a03'), public.test_monday() - interval '1 minute'),
  (public.test_org('a'), public.test_site('a1'), current_date - 40, public.test_w('01'), 'present', 0, public.test_u('a02'), now() - interval '29 days');

insert into public.daily_reports
  (org_id, site_id, report_date, author_id, status, headcount, work_done, serious_blocker, submitted_at, submitted_by, created_at) values
  (public.test_org('a'), public.test_site('a2'), current_date - 1,  public.test_u('a04'), 'submitted', 1, 'Plaster', false, now(), public.test_u('a04'), now());

insert into public.materials (id, org_id, site_id, name, unit, low_stock_threshold, created_by) values
  ('a1000000-0000-0000-0000-000000000001', public.test_org('a'), public.test_site('a2'), 'Cement', 'bag', null, public.test_u('a01'));
insert into public.material_transactions (org_id, site_id, material_id, kind, quantity, occurred_on, recorded_by, created_at) values
  (public.test_org('a'), public.test_site('a2'), 'a1000000-0000-0000-0000-000000000001', 'receipt', 5, current_date, public.test_u('a01'), now());

insert into public.site_visits (id, org_id, site_id, user_id, check_in_at, check_in_lat, check_in_lng, created_at) values
  ('30000000-0000-0000-0000-000000000001', public.test_org('a'), public.test_site('a1'), public.test_u('a03'),
   public.test_monday() - interval '12 hours', 0, 0, public.test_monday() - interval '12 hours');

-- Org B: one report by b03, now.
insert into public.daily_reports
  (org_id, site_id, report_date, author_id, status, headcount, work_done, serious_blocker, submitted_at, submitted_by, created_at) values
  (public.test_org('b'), public.test_site('b1'), current_date - 1, public.test_u('b03'), 'submitted', 1, 'Tiling', false, now(), public.test_u('b03'), now());

-- The allowlist, written the way it is in production: by hand, as the database owner.
insert into public.staff_members (user_id, added_by) values (public.test_u('501'), 'test');

-- ----------------------------------------------------------------- helpers

-- The SQLSTATE p_sql raises for p_user (null is anon), or 'ok'.
create function public.test_state(p_user uuid, p_sql text) returns text language plpgsql as $$
declare s text;
begin
  if p_user is null then perform test_as_anon(); else perform test_as(p_user); end if;
  begin
    execute p_sql;
  exception when others then s := sqlstate; end;
  execute 'reset role';
  return coalesce(s, 'ok');
end $$;

-- ------------------------------------------------ 1. the allowlist is closed

do $$
begin
  perform test_assert((select relrowsecurity from pg_class where oid = 'public.staff_members'::regclass),
    '[1.1] staff_members has row level security on');
  perform test_assert(not exists (select 1 from pg_policy where polrelid = 'public.staff_members'::regclass),
    '[1.2] staff_members has no policy at all');

  -- Not even a staff user, and not the owner of an organisation, can read or write it.
  perform test_assert(public.test_state(public.test_u('501'), 'select * from public.staff_members') = '42501',
    '[1.3] a staff user cannot select staff_members');
  perform test_assert(public.test_state(public.test_u('a01'), 'select * from public.staff_members') = '42501',
    '[1.4] an owner cannot select staff_members');
  perform test_assert(public.test_state(public.test_u('a01'),
    format('insert into public.staff_members (user_id, added_by) values (%L, %L)', public.test_u('a01'), 'me')) = '42501',
    '[1.5] an owner cannot make themselves staff');
  perform test_assert(public.test_state(public.test_u('501'),
    format('insert into public.staff_members (user_id, added_by) values (%L, %L)', public.test_u('901'), 'me')) = '42501',
    '[1.6] a staff user cannot add staff');
  perform test_assert(public.test_state(public.test_u('501'), 'delete from public.staff_members') = '42501',
    '[1.7] a staff user cannot delete staff');
  perform test_assert(public.test_state(public.test_u('501'), 'update public.staff_members set added_by = ''x''') = '42501',
    '[1.8] a staff user cannot edit staff');
  perform test_assert(public.test_state(null, 'select * from public.staff_members') = '42501',
    '[1.9] anon cannot select staff_members');
  perform test_assert(public.test_state(null,
    format('insert into public.staff_members (user_id, added_by) values (%L, %L)', public.test_u('901'), 'me')) = '42501',
    '[1.10] anon cannot insert into staff_members');

  -- added_by is required, and the row follows the user it names.
  begin
    insert into public.staff_members (user_id, added_by) values (public.test_u('901'), null);
    perform test_assert(false, '[1.11] added_by must not be null');
  exception when not_null_violation then null; end;
  perform test_assert((select count(*) from public.staff_members) = 1, '[1.12] only the one staff row exists');
end $$;

-- ------------------------------------------------ 2. is_staff()

do $$
begin
  perform test_as(public.test_u('501'));
  perform test_assert(public.is_staff() is true, '[2.1] is_staff() is true for a person on the allowlist');
  execute 'reset role';

  perform test_as(public.test_u('901'));
  perform test_assert(public.is_staff() is false, '[2.2] is_staff() is false for a plain user');
  execute 'reset role';

  perform test_as(public.test_u('a01'));
  perform test_assert(public.is_staff() is false, '[2.3] is_staff() is false for an owner');
  execute 'reset role';

  perform test_as(null);
  perform test_assert(public.is_staff() is false, '[2.4] is_staff() is false with no signed-in user');
  execute 'reset role';

  perform test_assert(public.test_state(null, 'select public.is_staff()') = '42501',
    '[2.5] anon cannot execute is_staff()');
end $$;

-- ------------------------------------------------ 3. staff_org_usage() refuses everyone else

do $$
begin
  perform test_assert(public.test_state(public.test_u('a01'), 'select * from public.staff_org_usage()') = '42501',
    '[3.1] an owner gets 42501');
  perform test_assert(public.test_state(public.test_u('a03'), 'select * from public.staff_org_usage()') = '42501',
    '[3.2] a supervisor gets 42501');
  perform test_assert(public.test_state(public.test_u('a02'), 'select * from public.staff_org_usage()') = '42501',
    '[3.3] a project manager gets 42501');
  perform test_assert(public.test_state(public.test_u('a05'), 'select * from public.staff_org_usage()') = '42501',
    '[3.4] an accountant gets 42501');
  perform test_assert(public.test_state(public.test_u('901'), 'select * from public.staff_org_usage()') = '42501',
    '[3.5] a signed-in user in no organisation gets 42501');
  perform test_assert(public.test_state(null, 'select * from public.staff_org_usage()') = '42501',
    '[3.6] anon cannot execute it');
  perform test_assert(public.test_state(public.test_u('501'), 'select * from public.staff_org_usage()') = 'ok',
    '[3.7] a staff user can');

  -- The refusal is the same one for everybody: it says nothing about why.
  perform test_as(public.test_u('a01'));
  begin
    perform * from public.staff_org_usage();
  exception when insufficient_privilege then
    perform test_assert(sqlerrm = 'not permitted', '[3.8] the message is just: not permitted, got ' || sqlerrm);
  end;
  execute 'reset role';

  -- Removing the allowlist row closes the door at once.
  delete from public.staff_members where user_id = public.test_u('501');
  perform test_assert(public.test_state(public.test_u('501'), 'select * from public.staff_org_usage()') = '42501',
    '[3.9] a staff user taken off the list gets 42501');
  insert into public.staff_members (user_id, added_by) values (public.test_u('501'), 'test');

  -- Deleting the user removes the row: nothing is left that could be reused.
  insert into auth.users (id, email) values (public.test_u('902'), 'gone@test.local');
  insert into public.staff_members (user_id, added_by) values (public.test_u('902'), 'test');
  delete from auth.users where id = public.test_u('902');
  perform test_assert(not exists (select 1 from public.staff_members where user_id = public.test_u('902')),
    '[3.10] deleting the user deletes the staff row');
end $$;

-- ------------------------------------------------ 4. what a staff user gets

do $$
declare
  a record; b record; c record; n int; total int;
begin
  -- The count of organisations is read as the database owner: as staff, RLS would show none.
  select count(*) into total from public.organizations;
  perform test_as(public.test_u('501'));
  select count(*) into n from public.staff_org_usage();
  perform test_assert(n = total and n = 3, '[4.1] one row per organisation, got ' || n);

  select * into a from public.staff_org_usage() where org_id = public.test_org('a');
  select * into b from public.staff_org_usage() where org_id = public.test_org('b');
  select * into c from public.staff_org_usage() where org_id = public.test_org('c');
  execute 'reset role';

  perform test_assert(a.org_name = 'Org A', '[4.2] the name');
  perform test_assert(a.created_at between now() - interval '50 days 1 minute' and now() - interval '50 days' + interval '1 minute',
    '[4.3] the account date is the organisation''s created_at');
  perform test_assert((a.owners, a.project_managers, a.supervisors, a.accountants) = (1, 1, 2, 1),
    format('[4.4] members by role, got %s', row(a.owners, a.project_managers, a.supervisors, a.accountants)));
  perform test_assert(a.sites = 3, '[4.5] sites include the archived one, got ' || a.sites);
  perform test_assert(a.workers = 3, '[4.6] workers, got ' || a.workers);
  perform test_assert(a.attendance_marks = 4, '[4.7] attendance marks include the old one, got ' || a.attendance_marks);
  perform test_assert(a.daily_reports = 1, '[4.8] daily reports, got ' || a.daily_reports);
  perform test_assert(a.material_entries = 1, '[4.9] material entries, got ' || a.material_entries);
  perform test_assert(a.site_check_ins = 1, '[4.10] site check-ins, got ' || a.site_check_ins);

  -- Active in 28 days: a03 (marks, check-in), a04 (report), a01 (material). Not a02: 29 days ago.
  perform test_assert(a.active_users_28d = 3, '[4.11] active users in 28 days, got ' || a.active_users_28d);
  perform test_assert(a.last_active = now(), '[4.12] last active is the newest record');
  perform test_assert(a.last_sign_in = (select a05.last_sign_in_at from auth.users a05 where a05.id = public.test_u('a05')),
    '[4.13] last sign-in is the newest across this organisation''s members only (not b01, who signed in later)');

  -- Weeks: Monday 00:00 IST sharp is this week; one minute before is last week.
  perform test_assert(a.week_start = (public.test_monday() at time zone 'Asia/Kolkata')::date,
    '[4.14] week_start is this Monday in India, got ' || a.week_start);
  perform test_assert(a.weekly_records = array[0, 0, 2, 4],
    '[4.15] four weeks, oldest first, got ' || a.weekly_records::text);

  -- Org B: another organisation's records never count here, and the reverse.
  perform test_assert((b.owners, b.supervisors, b.sites, b.workers) = (1, 1, 1, 1), '[4.16] org B members, sites, workers');
  perform test_assert((b.attendance_marks, b.daily_reports, b.material_entries, b.site_check_ins) = (0, 1, 0, 0),
    '[4.17] org B records');
  perform test_assert(b.active_users_28d = 1 and b.weekly_records = array[0, 0, 0, 1], '[4.18] org B activity');
  perform test_assert(b.last_sign_in = (select b01.last_sign_in_at from auth.users b01 where b01.id = public.test_u('b01')),
    '[4.19] org B last sign-in');

  -- Org C: an organisation with nothing still has a row, with zeros and nulls, never a missing one.
  perform test_assert((c.owners, c.project_managers, c.supervisors, c.accountants, c.active_users_28d, c.sites, c.workers) =
                      (0, 0, 0, 0, 0, 0, 0), '[4.20] org C is all zeros');
  perform test_assert(c.last_active is null and c.last_sign_in is null, '[4.21] org C has no last active and no last sign-in');
  perform test_assert(c.weekly_records = array[0, 0, 0, 0], '[4.22] org C has four empty weeks');
end $$;

-- ------------------------------------------------ 5. counts only, and no new role

do $$
declare cols text;
begin
  select pg_get_function_result('public.staff_org_usage()'::regprocedure) into cols;
  perform test_assert(cols !~* '(email|phone|full_name|worker_name|latitude|longitude|token|password)',
    '[5.1] the function returns nothing personal: ' || cols);

  perform test_assert(
    (select array_agg(e::text order by e::text) from unnest(enum_range(null::public.app_role)) e)
      = array['accountant', 'owner', 'project_manager', 'supervisor'],
    '[5.2] app_role is still the four roles');

  perform test_assert(
    (select p.prosecdef and 'search_path=public' = any (p.proconfig) and p.provolatile = 's'
       from pg_proc p where p.oid = 'public.staff_org_usage()'::regprocedure),
    '[5.3] staff_org_usage is security definer, search_path pinned, stable');
  perform test_assert(
    (select p.prosecdef and 'search_path=public' = any (p.proconfig) and p.provolatile = 's'
       from pg_proc p where p.oid = 'public.is_staff()'::regprocedure),
    '[5.4] is_staff is security definer, search_path pinned, stable');
  perform test_assert(not has_function_privilege('anon', 'public.staff_org_usage()', 'EXECUTE')
                      and not has_function_privilege('anon', 'public.is_staff()', 'EXECUTE'),
    '[5.5] anon has no execute on either function');
  perform test_assert(not has_table_privilege('authenticated', 'public.staff_members', 'SELECT')
                      and not has_table_privilege('authenticated', 'public.staff_members', 'INSERT')
                      and not has_table_privilege('anon', 'public.staff_members', 'SELECT'),
    '[5.6] no client role holds a privilege on staff_members');
end $$;

rollback;
