-- Attendance & Site Presence, PR 3a: the published views approved_attendance_days and
-- site_exceptions, and the wage-reader SELECT policies. Issue #28, ADR-032 (D1-D7 in
-- the spec comment on #28).
--
-- Conventions as in attendance_review_test.sql: test_as / test_as_anon / test_assert,
-- SQLSTATE asserts. The helpers below switch role themselves and return a row count,
-- 'ok:<rows>' or the SQLSTATE raised.
--
-- Dates are relative to current_date, never literals. now() is fixed for the whole
-- transaction, so "changed after the rejection" is set up by back-dating the stamps
-- (see the fixture notes), not by waiting.
begin;

-- ---------------------------------------------------------------- fixtures
-- Org A: owner a01, project manager a02, supervisors a03 (A1) and a04 (A2),
-- accountant a05 (assigned A1) and a07 (no assignment).
-- Org B: owner b01, supervisor b03 (B1).
-- Sites: A1 and B1 at (0, 0), A2 at (10, 10), default radius 200 m.

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000a01', 'owner-a@test.local'),
  ('00000000-0000-0000-0000-000000000a02', 'pm-a@test.local'),
  ('00000000-0000-0000-0000-000000000a03', 'sup-a@test.local'),
  ('00000000-0000-0000-0000-000000000a04', 'sup-a2@test.local'),
  ('00000000-0000-0000-0000-000000000a05', 'acct-a@test.local'),
  ('00000000-0000-0000-0000-000000000a07', 'acct-a2@test.local'),
  ('00000000-0000-0000-0000-000000000b01', 'owner-b@test.local'),
  ('00000000-0000-0000-0000-000000000b03', 'sup-b@test.local');

insert into public.organizations (id, name, created_by) values
  ('10000000-0000-0000-0000-00000000000a', 'Org A', '00000000-0000-0000-0000-000000000a01'),
  ('10000000-0000-0000-0000-00000000000b', 'Org B', '00000000-0000-0000-0000-000000000b01');

insert into public.memberships (org_id, user_id, role) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000a01', 'owner'),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000a02', 'project_manager'),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000a03', 'supervisor'),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000a04', 'supervisor'),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000a05', 'accountant'),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000a07', 'accountant'),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000b01', 'owner'),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000b03', 'supervisor');

insert into public.sites (id, org_id, name, address, latitude, longitude, status, created_by) values
  ('20000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a', 'A One', 'Pune',   0,  0,  'active', '00000000-0000-0000-0000-000000000a01'),
  ('20000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a', 'A Two', 'Nagpur', 10, 10, 'active', '00000000-0000-0000-0000-000000000a01'),
  ('20000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-00000000000b', 'B One', 'Indore', 0,  0,  'active', '00000000-0000-0000-0000-000000000b01');

insert into public.site_assignments (org_id, site_id, user_id, assigned_by) values
  ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000a03', '00000000-0000-0000-0000-000000000a01'),
  ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000a04', '00000000-0000-0000-0000-000000000a01'),
  ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000a05', '00000000-0000-0000-0000-000000000a01'),
  ('10000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000b03', '00000000-0000-0000-0000-000000000b01');

-- Short names for the fixture ids.
create function public.test_u(k text)    returns uuid language sql immutable as $$ select ('00000000-0000-0000-0000-000000000' || k)::uuid $$;
create function public.test_site(k text) returns uuid language sql immutable as $$ select ('20000000-0000-0000-0000-0000000000' || k)::uuid $$;
create function public.test_w(k text)    returns uuid language sql immutable as $$ select ('77000000-0000-0000-0000-0000000000' || k)::uuid $$;
create function public.test_org(k text)  returns uuid language sql immutable as $$ select ('10000000-0000-0000-0000-00000000000' || k)::uuid $$;
create function public.test_v(n int)     returns uuid language sql immutable as $$ select ('30000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid $$;
create function public.test_c(n int)     returns uuid language sql immutable as $$ select ('60000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid $$;

-- Workers, all rostered since 30 days ago with no end:
--   01 Ravi, 02 Sita, 03 Arun, 06 Mala at A1;  04 Latha at A2;  b1 Bela, org B.
insert into public.workers (id, org_id, code, full_name, trade, pay_type, created_by) values
  (public.test_w('01'), public.test_org('a'), 'W-001', 'Ravi',  'mason',  'daily', public.test_u('a01')),
  (public.test_w('02'), public.test_org('a'), 'W-002', 'Sita',  'helper', 'daily', public.test_u('a01')),
  (public.test_w('03'), public.test_org('a'), 'W-003', 'Arun',  'helper', 'daily', public.test_u('a01')),
  (public.test_w('06'), public.test_org('a'), 'W-006', 'Mala',  'helper', 'daily', public.test_u('a01')),
  (public.test_w('04'), public.test_org('a'), 'W-004', 'Latha', 'helper', 'daily', public.test_u('a01')),
  (public.test_w('b1'), public.test_org('b'), 'W-001', 'Bela',  'mason',  'daily', public.test_u('b01'));

insert into public.worker_site_assignments (org_id, worker_id, site_id, assigned_by, assigned_at)
select o, w, s, public.test_u(by_), now() - interval '30 days'
  from (values (public.test_org('a'), public.test_w('01'), public.test_site('a1'), 'a01'),
               (public.test_org('a'), public.test_w('02'), public.test_site('a1'), 'a01'),
               (public.test_org('a'), public.test_w('03'), public.test_site('a1'), 'a01'),
               (public.test_org('a'), public.test_w('06'), public.test_site('a1'), 'a01'),
               (public.test_org('a'), public.test_w('04'), public.test_site('a2'), 'a01'),
               (public.test_org('b'), public.test_w('b1'), public.test_site('b1'), 'b01')) as x (o, w, s, by_);

-- Days, written by the superuser (the triggers still run).
--   A1: -5 approved, -6 open, -7 rejected, -8 approved.   A2: -5 approved.
--   B1: -5 approved, -6 open.
insert into public.attendance_days (org_id, site_id, attendance_date, recorded_by)
select public.test_org('a'), public.test_site('a1'), current_date - d, public.test_u('a03')
  from generate_series(5, 8) as d;
insert into public.attendance_days (org_id, site_id, attendance_date, recorded_by) values
  (public.test_org('a'), public.test_site('a2'), current_date - 5, public.test_u('a04')),
  (public.test_org('b'), public.test_site('b1'), current_date - 5, public.test_u('b03')),
  (public.test_org('b'), public.test_site('b1'), current_date - 6, public.test_u('b03'));

-- Entries: at A1 on every day, Ravi present, Sita present with 2 h overtime, Arun
-- absent, Mala on leave. One worker on each other site's days.
insert into public.attendance_entries (org_id, site_id, attendance_date, worker_id, status, overtime_hours, recorded_by)
select public.test_org('a'), public.test_site('a1'), current_date - d, w.id, w.st, w.ot, public.test_u('a03')
  from generate_series(5, 8) as d,
       (values (public.test_w('01'), 'present', 0), (public.test_w('02'), 'present', 2),
               (public.test_w('03'), 'absent', 0),  (public.test_w('06'), 'leave', 0)) as w (id, st, ot);
insert into public.attendance_entries (org_id, site_id, attendance_date, worker_id, status, overtime_hours, recorded_by) values
  (public.test_org('a'), public.test_site('a2'), current_date - 5, public.test_w('04'), 'present', 0, public.test_u('a04')),
  (public.test_org('b'), public.test_site('b1'), current_date - 5, public.test_w('b1'), 'present', 0, public.test_u('b03')),
  (public.test_org('b'), public.test_site('b1'), current_date - 6, public.test_w('b1'), 'present', 0, public.test_u('b03'));

-- now() is one instant for the whole transaction, so an edit made later in this file
-- would carry the same updated_at as the review. Back-date the entries (two hours) and
-- the rejection (one hour) so "edited after the rejection" can be told apart. The
-- updated_at trigger is switched off for this one superuser write only.
alter table public.attendance_entries disable trigger attendance_entries_set_updated_at;
update public.attendance_entries set updated_at = now() - interval '2 hours';
alter table public.attendance_entries enable trigger attendance_entries_set_updated_at;

-- Fixture states, set by the superuser so they do not depend on the review functions.
create function public.test_force_review(p_site text, p_n int, p_status text, p_by uuid, p_at timestamptz, p_reason text default null)
returns void language sql as $$
  update public.attendance_days
     set status = p_status, reviewed_by = p_by, reviewed_at = p_at, review_reason = p_reason
   where site_id = public.test_site(p_site) and attendance_date = current_date - p_n;
$$;
select public.test_force_review('a1', 5, 'approved', public.test_u('a02'), now() - interval '3 hours');
select public.test_force_review('a1', 8, 'approved', public.test_u('a01'), now() - interval '3 hours');
select public.test_force_review('a2', 5, 'approved', public.test_u('a02'), now() - interval '3 hours');
select public.test_force_review('b1', 5, 'approved', public.test_u('b01'), now() - interval '3 hours');
select public.test_force_review('a1', 7, 'rejected', public.test_u('a02'), now() - interval '1 hour', 'Recount headcount');

-- Visits, written by the superuser (the stamp trigger computes distance and flag).
--   1  a03 at A1, two days ago, inside, closed inside            -> nothing
--   2  a03 at A1, two days ago, outside both legs, with reasons  -> geofence_check_in, geofence_check_out
--   3  a03 at A1, two days ago, inside, never closed             -> visit_not_closed
--   4  a03 at A1, now, inside, not closed yet                    -> nothing (still today)
--   5  a04 at A2, two days ago, outside in, closed inside        -> geofence_check_in (A2)
--   6  b03 at B1, two days ago, outside in, closed inside        -> geofence_check_in (org B)
insert into public.site_visits (id, org_id, site_id, user_id, check_in_at, check_in_lat, check_in_lng, check_in_reason) values
  (public.test_v(1), public.test_org('a'), public.test_site('a1'), public.test_u('a03'), now() - interval '2 days', 0,     0,     null),
  (public.test_v(2), public.test_org('a'), public.test_site('a1'), public.test_u('a03'), now() - interval '2 days', 0.01,  0,     'Gate locked'),
  (public.test_v(3), public.test_org('a'), public.test_site('a1'), public.test_u('a03'), now() - interval '2 days', 0,     0,     null),
  (public.test_v(4), public.test_org('a'), public.test_site('a1'), public.test_u('a03'), now(),                     0,     0,     null),
  (public.test_v(5), public.test_org('a'), public.test_site('a2'), public.test_u('a04'), now() - interval '2 days', 10.01, 10,    'Road closed'),
  (public.test_v(6), public.test_org('b'), public.test_site('b1'), public.test_u('b03'), now() - interval '2 days', 0.01,  0,     'Flooded lane');
update public.site_visits set check_out_at = now() - interval '47 hours', check_out_lat = 0, check_out_lng = 0
 where id in (public.test_v(1), public.test_v(6));
update public.site_visits set check_out_at = now() - interval '47 hours', check_out_lat = 10, check_out_lng = 10
 where id = public.test_v(5);
update public.site_visits set check_out_at = now() - interval '47 hours', check_out_lat = 0, check_out_lng = 0.01,
       check_out_reason = 'Left by road'
 where id = public.test_v(2);

-- ----------------------------------------------------------------- helpers

-- Run p_sql as p_user ('anon' when null). Returns 'ok:<rows>' or the SQLSTATE raised.
create function public.test_try(p_user uuid, p_sql text) returns text language plpgsql as $$
declare s text; n int;
begin
  if p_user is null then perform test_as_anon(); else perform test_as(p_user); end if;
  begin
    execute p_sql;
    get diagnostics n = row_count;
  exception when others then s := sqlstate; end;
  execute 'reset role';
  return coalesce(s, 'ok:' || n);
end $$;

-- Rows visible to p_user through p_sql (a select), or the SQLSTATE raised.
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

-- One approved row as p_user: "status|overtime|approved_by", or '-' when not visible.
create function public.test_appr(p_user uuid, p_site text, p_n int, p_worker text) returns text language plpgsql as $$
declare r text;
begin
  perform test_as(p_user);
  select status || '|' || overtime_hours || '|' || approved_by into r
    from public.approved_attendance_days
   where site_id = public.test_site(p_site) and work_date = current_date - p_n and worker_id = public.test_w(p_worker);
  execute 'reset role';
  return coalesce(r, '-');
end $$;

-- How many site_exceptions rows of p_kind for p_source p_user sees (or the SQLSTATE).
create function public.test_exc(p_user uuid, p_kind text, p_source uuid) returns text language sql as $$
  select public.test_count(p_user, format(
    'select 1 from public.site_exceptions where kind = %L and source_id = %L', p_kind, p_source));
$$;

create function public.test_day(p_site text, p_n int) returns uuid language sql as $$
  select id from public.attendance_days where site_id = public.test_site(p_site) and attendance_date = current_date - p_n
$$;

-- Column names of a view, in order, comma-separated.
create function public.test_cols(p_view text) returns text language sql as $$
  select string_agg(column_name::text, ',' order by ordinal_position)
    from information_schema.columns where table_schema = 'public' and table_name = p_view
$$;

-- ------------------------------------------------- 1 · catalog: shape and grants
do $$
begin
  perform test_assert(test_cols('approved_attendance_days')
                      = 'org_id,site_id,worker_id,work_date,status,overtime_hours,approved_at,approved_by,entry_id',
    '[1.01] approved_attendance_days has the D2 columns in order, then entry_id last (ADR-049 D1), got ' || coalesce(test_cols('approved_attendance_days'), 'no view'));
  perform test_assert(test_cols('site_exceptions')
                      = 'org_id,site_id,exception_date,kind,source_id,worker_id,raised_by,reason,distance_m,changed_since_review,raised_at',
    '[1.02] site_exceptions has exactly the D6 columns in order, got ' || coalesce(test_cols('site_exceptions'), 'no view'));

  perform test_assert(
    (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'v'
        and c.relname in ('approved_attendance_days', 'site_exceptions')
        and 'security_invoker=true' = any (c.reloptions)) = 2,
    '[1.03] both views are security_invoker');

  perform test_assert(not has_table_privilege('anon', 'public.approved_attendance_days', 'select')
                  and not has_table_privilege('anon', 'public.site_exceptions', 'select'),
    '[1.04] anon has no select on either view');
  perform test_assert(has_table_privilege('authenticated', 'public.approved_attendance_days', 'select')
                  and has_table_privilege('authenticated', 'public.site_exceptions', 'select'),
    '[1.05] authenticated may select both views');
  perform test_assert(not has_table_privilege('authenticated', 'public.approved_attendance_days', 'insert,update,delete,truncate')
                  and not has_table_privilege('authenticated', 'public.site_exceptions', 'insert,update,delete,truncate'),
    '[1.06] authenticated has no write privilege on either view');
  perform test_assert(not has_table_privilege('public', 'public.approved_attendance_days', 'select')
                  and not has_table_privilege('public', 'public.site_exceptions', 'select'),
    '[1.07] public has no privilege on either view');

  perform test_assert(
    (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'site_exceptions'
        and column_name ~ '(lat|lng|lon)') = 0,
    '[1.08] site_exceptions carries no coordinate column (D6)');
end $$;

-- ------------------------------------------------- 2 · negative: who sees nothing
do $$
declare r text;
begin
  r := test_count(null, 'select * from public.approved_attendance_days');
  perform test_assert(r = '42501', '[2.01] anon cannot read approved_attendance_days, got ' || r);
  r := test_count(null, 'select * from public.site_exceptions');
  perform test_assert(r = '42501', '[2.02] anon cannot read site_exceptions, got ' || r);

  -- Writing through a view: refused for every client, here the assigned supervisor and the owner.
  -- A join or a union is not automatically updatable, so Postgres refuses with 55000
  -- before it checks the grant; [1.06] pins the missing grant itself. Either way nothing is written.
  r := test_try(test_u('a03'), format(
    'insert into public.approved_attendance_days (org_id, site_id, worker_id, work_date, status, overtime_hours) values (%L, %L, %L, current_date - 6, ''present'', 0)',
    test_org('a'), test_site('a1'), test_w('01')));
  perform test_assert(r in ('42501', '55000'), '[2.03] no insert through approved_attendance_days, got ' || r);
  r := test_try(test_u('a01'), 'update public.approved_attendance_days set overtime_hours = 8');
  perform test_assert(r in ('42501', '55000'), '[2.04] no update through approved_attendance_days, got ' || r);
  r := test_try(test_u('a01'), 'delete from public.approved_attendance_days');
  perform test_assert(r in ('42501', '55000'), '[2.05] no delete through approved_attendance_days, got ' || r);
  r := test_try(test_u('a01'), 'delete from public.site_exceptions');
  perform test_assert(r in ('42501', '55000'), '[2.06] no delete through site_exceptions, got ' || r);
  r := test_try(test_u('a02'), 'update public.site_exceptions set reason = ''x''');
  perform test_assert(r in ('42501', '55000'), '[2.07] no update through site_exceptions, got ' || r);

  -- Open and rejected days never appear (AC 2), even to the owner.
  r := test_count(test_u('a01'), 'select 1 from public.approved_attendance_days where work_date in (current_date - 6, current_date - 7)');
  perform test_assert(r = '0', '[2.08] an open or a rejected day has no approved row, got ' || r);
  r := test_count(test_u('b01'), 'select 1 from public.approved_attendance_days where work_date = current_date - 6');
  perform test_assert(r = '0', '[2.09] org B''s open day has no approved row, got ' || r);

  -- Other organisations, also when filtering on the other org's site or org id.
  r := test_count(test_u('b01'), format('select 1 from public.approved_attendance_days where site_id = %L', test_site('a1')));
  perform test_assert(r = '0', '[2.10] org B owner sees none of A1''s approved rows, got ' || r);
  r := test_count(test_u('b03'), format('select 1 from public.site_exceptions where org_id = %L', test_org('a')));
  perform test_assert(r = '0', '[2.11] org B supervisor sees none of org A''s exceptions, got ' || r);
  r := test_count(test_u('a07'), format('select 1 from public.approved_attendance_days where org_id = %L', test_org('b')));
  perform test_assert(r = '0', '[2.12] org A''s wage reader sees none of org B''s approved rows, got ' || r);
  r := test_count(test_u('a01'), format('select 1 from public.site_exceptions where site_id = %L', test_site('b1')));
  perform test_assert(r = '0', '[2.13] org A owner sees none of B1''s exceptions, got ' || r);

  -- A supervisor of another site sees nothing of A1.
  r := test_count(test_u('a04'), format('select 1 from public.approved_attendance_days where site_id = %L', test_site('a1')));
  perform test_assert(r = '0', '[2.14] supervisor of A2 sees no A1 approved row, got ' || r);
  r := test_count(test_u('a04'), format('select 1 from public.site_exceptions where site_id = %L', test_site('a1')));
  perform test_assert(r = '0', '[2.15] supervisor of A2 sees no A1 exception, got ' || r);

  -- D3 widens only approved days, and only for can_view_wages.
  r := test_count(test_u('a07'), 'select 1 from public.attendance_days where status <> ''approved''');
  perform test_assert(r = '0', '[2.16] unassigned accountant reads no open or rejected day, got ' || r);
  r := test_count(test_u('a07'), 'select 1 from public.attendance_entries where attendance_date in (current_date - 6, current_date - 7)');
  perform test_assert(r = '0', '[2.17] unassigned accountant reads no entry of an open or rejected day, got ' || r);
  r := test_count(test_u('a07'), 'select 1 from public.site_exceptions');
  perform test_assert(r = '0', '[2.18] unassigned accountant sees no exception (D3 does not widen it), got ' || r);
  r := test_count(test_u('a07'), 'select 1 from public.site_visits');
  perform test_assert(r = '0', '[2.19] unassigned accountant reads no visit, got ' || r);
  r := test_count(test_u('a07'), 'select 1 from public.attendance_corrections');
  perform test_assert(r = '0', '[2.20] unassigned accountant reads no correction, got ' || r);
  r := test_count(test_u('a03'), format('select 1 from public.approved_attendance_days where site_id = %L', test_site('a2')));
  perform test_assert(r = '0', '[2.21] a supervisor does not gain the wage policy (no A2 rows), got ' || r);
  r := test_count(test_u('a04'), 'select 1 from public.attendance_days where status = ''approved''');
  perform test_assert(r = '1', '[2.22] supervisor of A2 reads only A2''s approved day, got ' || r);
end $$;

-- ------------------------------------------------- 3 · approved_attendance_days contents
do $$
declare r text; v record;
begin
  -- Visibility per role (AC 7, 8). Org A approved: A1 -5 and -8 (4 entries each), A2 -5 (1).
  r := test_count(test_u('a01'), 'select 1 from public.approved_attendance_days');
  perform test_assert(r = '9', '[3.01] owner sees every approved row of the org, got ' || r);
  r := test_count(test_u('a02'), 'select 1 from public.approved_attendance_days');
  perform test_assert(r = '9', '[3.02] project manager sees every approved row of the org, got ' || r);
  r := test_count(test_u('a03'), 'select 1 from public.approved_attendance_days');
  perform test_assert(r = '8', '[3.03] supervisor of A1 sees A1''s approved rows only, got ' || r);
  r := test_count(test_u('a04'), 'select 1 from public.approved_attendance_days');
  perform test_assert(r = '1', '[3.04] supervisor of A2 sees A2''s approved row only, got ' || r);
  r := test_count(test_u('a05'), 'select 1 from public.approved_attendance_days');
  perform test_assert(r = '9', '[3.05] assigned accountant sees every approved row of the org (D3), got ' || r);
  r := test_count(test_u('a07'), 'select 1 from public.approved_attendance_days');
  perform test_assert(r = '9', '[3.06] unassigned accountant sees every approved row of the org (D3), got ' || r);
  r := test_count(test_u('a07'), 'select 1 from public.attendance_days');
  perform test_assert(r = '3', '[3.07] unassigned accountant reads the three approved days of the org, got ' || r);
  r := test_count(test_u('b01'), 'select 1 from public.approved_attendance_days');
  perform test_assert(r = '1', '[3.08] org B owner sees org B''s one approved row, got ' || r);
  r := test_count(test_u('b03'), 'select 1 from public.approved_attendance_days');
  perform test_assert(r = '1', '[3.09] org B supervisor sees org B''s one approved row, got ' || r);

  -- Values (AC 3, 4): all four statuses, overtime, the day's reviewer.
  r := test_appr(test_u('a07'), 'a1', 5, '02');
  perform test_assert(r = 'present|2.00|' || test_u('a02'), '[3.10] Sita: present, 2 h, approved by a02, got ' || r);
  r := test_appr(test_u('a07'), 'a1', 5, '03');
  perform test_assert(r = 'absent|0.00|' || test_u('a02'), '[3.11] absent rows are included, got ' || r);
  r := test_appr(test_u('a07'), 'a1', 5, '06');
  perform test_assert(r = 'leave|0.00|' || test_u('a02'), '[3.12] leave rows are included, got ' || r);
  r := test_appr(test_u('a01'), 'a1', 8, '01');
  perform test_assert(r = 'present|0.00|' || test_u('a01'), '[3.13] approved_by is the day''s reviewer, got ' || r);

  perform test_as(test_u('a02'));
  select a.*, d.reviewed_at as d_at, d.attendance_date as d_date into v
    from public.approved_attendance_days a
    join public.attendance_days d on d.site_id = a.site_id and d.attendance_date = a.work_date
   where a.site_id = test_site('a2') and a.work_date = current_date - 5;
  execute 'reset role';
  perform test_assert(v.approved_at = v.d_at and v.work_date = v.d_date and v.org_id = test_org('a')
                      and v.worker_id = test_w('04'),
    '[3.14] approved_at, work_date, org_id and worker_id come from the day and the entry');

  -- entry_id (ADR-049 D1): the id of the entry the row comes from, one per row, never null.
  perform test_as(test_u('a07'));
  select count(*) as n, count(distinct a.entry_id) as ids,
         count(*) filter (where a.entry_id is null) as nulls,
         count(*) filter (where e.id is null) as orphans into v
    from public.approved_attendance_days a
    left join public.attendance_entries e on e.id = a.entry_id
     and e.site_id = a.site_id and e.worker_id = a.worker_id and e.attendance_date = a.work_date;
  execute 'reset role';
  perform test_assert(v.n = 9 and v.ids = 9 and v.nulls = 0 and v.orphans = 0,
    '[3.15] entry_id is unique, never null, and is the id of the entry of that worker, site and date, got '
      || v.n || '/' || v.ids || '/' || v.nulls || '/' || v.orphans);
end $$;

-- ------------------------------------------------- 4 · site_exceptions contents
do $$
declare r text; v record;
begin
  -- Each kind, from its fixture (AC 11-15, before any correction).
  r := test_exc(test_u('a01'), 'geofence_check_in', test_v(2));
  perform test_assert(r = '1', '[4.01] an outside check-in is one geofence_check_in row, got ' || r);
  r := test_exc(test_u('a01'), 'geofence_check_out', test_v(2));
  perform test_assert(r = '1', '[4.02] an outside check-out is one geofence_check_out row, got ' || r);
  r := test_count(test_u('a01'), format('select 1 from public.site_exceptions where source_id = %L', test_v(1)));
  perform test_assert(r = '0', '[4.03] a visit inside on both legs, closed, gives nothing, got ' || r);
  r := test_exc(test_u('a01'), 'visit_not_closed', test_v(3));
  perform test_assert(r = '1', '[4.04] a visit from an earlier day with no check-out is visit_not_closed, got ' || r);
  r := test_count(test_u('a01'), format('select 1 from public.site_exceptions where source_id = %L', test_v(4)));
  perform test_assert(r = '0', '[4.05] a visit checked in today and still open gives nothing, got ' || r);
  r := test_count(test_u('a01'), format('select 1 from public.site_exceptions where kind = ''visit_not_closed'' and source_id in (%L, %L)', test_v(1), test_v(2)));
  perform test_assert(r = '0', '[4.06] a closed visit is never visit_not_closed, got ' || r);
  r := test_count(test_u('a01'), format('select 1 from public.site_exceptions where kind like ''geofence%%'' and source_id in (%L, %L)', test_v(1), test_v(3)));
  perform test_assert(r = '0', '[4.07] an inside leg gives no geofence row, got ' || r);
  r := test_exc(test_u('a01'), 'geofence_check_out', test_v(5));
  perform test_assert(r = '0', '[4.08] an outside check-in closed inside has no check-out row, got ' || r);

  r := test_exc(test_u('a01'), 'day_awaiting_review', test_day('a1', 6));
  perform test_assert(r = '1', '[4.09] an open day is day_awaiting_review, got ' || r);
  r := test_count(test_u('a01'), format('select 1 from public.site_exceptions where source_id in (%L, %L)', test_day('a1', 5), test_day('a1', 8)));
  perform test_assert(r = '0', '[4.10] an approved day gives no exception row, got ' || r);
  r := test_exc(test_u('a01'), 'day_rejected', test_day('a1', 7));
  perform test_assert(r = '1', '[4.11] a rejected day is day_rejected, got ' || r);

  -- Totals per reader (AC 17). Org A: v2 in, v2 out, v5 in, v3 open, A1 -6 open, A1 -7 rejected.
  r := test_count(test_u('a01'), 'select 1 from public.site_exceptions');
  perform test_assert(r = '6', '[4.12] owner sees all six of the org''s exceptions, got ' || r);
  r := test_count(test_u('a02'), 'select 1 from public.site_exceptions');
  perform test_assert(r = '6', '[4.13] project manager sees all six, got ' || r);
  r := test_count(test_u('a03'), 'select 1 from public.site_exceptions');
  perform test_assert(r = '5', '[4.14] supervisor of A1 sees A1''s five, got ' || r);
  r := test_count(test_u('a04'), 'select 1 from public.site_exceptions');
  perform test_assert(r = '1', '[4.15] supervisor of A2 sees A2''s one, got ' || r);
  r := test_count(test_u('a05'), 'select 1 from public.site_exceptions');
  perform test_assert(r = '5', '[4.16] accountant assigned to A1 sees A1''s five (has_site_access only), got ' || r);
  r := test_count(test_u('b01'), 'select 1 from public.site_exceptions');
  perform test_assert(r = '2', '[4.17] org B owner sees org B''s two (v6 in, B1 -6 open), got ' || r);

  -- Columns of each kind (D6).
  perform test_as(test_u('a03'));
  select * into v from public.site_exceptions where kind = 'geofence_check_in' and source_id = test_v(2);
  execute 'reset role';
  perform test_assert(v.org_id = test_org('a') and v.site_id = test_site('a1') and v.raised_by = test_u('a03')
                      and v.reason = 'Gate locked' and v.worker_id is null and v.changed_since_review is null
                      and v.distance_m = (select check_in_distance_m from site_visits where id = test_v(2))
                      and v.distance_m > 200
                      and v.raised_at = (select check_in_at from site_visits where id = test_v(2))
                      and v.exception_date = attendance_local_date((select check_in_at from site_visits where id = test_v(2))),
    '[4.18] geofence_check_in carries site, who, reason, distance, the check-in time and its local date');

  perform test_as(test_u('a03'));
  select * into v from public.site_exceptions where kind = 'geofence_check_out' and source_id = test_v(2);
  execute 'reset role';
  perform test_assert(v.reason = 'Left by road' and v.raised_by = test_u('a03')
                      and v.distance_m = (select check_out_distance_m from site_visits where id = test_v(2))
                      and v.raised_at = (select check_out_at from site_visits where id = test_v(2))
                      and v.exception_date = attendance_local_date((select check_in_at from site_visits where id = test_v(2))),
    '[4.19] geofence_check_out carries the check-out reason, distance and time, dated by the visit');

  perform test_as(test_u('a03'));
  select * into v from public.site_exceptions where kind = 'visit_not_closed' and source_id = test_v(3);
  execute 'reset role';
  perform test_assert(v.reason is null and v.distance_m is null and v.raised_by = test_u('a03')
                      and v.raised_at = (select check_in_at from site_visits where id = test_v(3)),
    '[4.20] visit_not_closed carries who and when, no reason or distance');

  perform test_as(test_u('a03'));
  select * into v from public.site_exceptions where kind = 'day_awaiting_review' and source_id = test_day('a1', 6);
  execute 'reset role';
  perform test_assert(v.exception_date = current_date - 6 and v.raised_by = test_u('a03') and v.reason is null
                      and v.changed_since_review is null and v.worker_id is null,
    '[4.21] day_awaiting_review carries the date and who recorded it');

  perform test_as(test_u('a03'));
  select * into v from public.site_exceptions where kind = 'day_rejected' and source_id = test_day('a1', 7);
  execute 'reset role';
  perform test_assert(v.exception_date = current_date - 7 and v.reason = 'Recount headcount'
                      and v.changed_since_review = false
                      and v.raised_at = (select reviewed_at from attendance_days where id = test_day('a1', 7)),
    '[4.22] day_rejected carries the rejection reason, and nothing changed since: '
      || coalesce(v.changed_since_review::text, 'null'));
end $$;

-- ------------------------------------------------- 5 · flows: corrections, edits, approvals
do $$
declare r text; v record;
begin
  -- A pending correction is an exception and does not change the approved view.
  r := test_try(test_u('a03'), format(
    'insert into public.attendance_corrections (id, org_id, site_id, attendance_date, worker_id, new_status, new_overtime_hours, new_note, reason) values (%L, %L, %L, current_date - 8, %L, ''absent'', 0, null, ''Went home sick'')',
    test_c(1), test_org('a'), test_site('a1'), test_w('01')));
  perform test_assert(r = 'ok:1', '[5.01] (setup) a03 proposes a correction, got ' || r);
  r := test_try(test_u('a03'), format(
    'insert into public.attendance_corrections (id, org_id, site_id, attendance_date, worker_id, new_status, new_overtime_hours, new_note, reason) values (%L, %L, %L, current_date - 8, %L, ''present'', 0, null, ''No overtime'')',
    test_c(2), test_org('a'), test_site('a1'), test_w('02')));
  perform test_assert(r = 'ok:1', '[5.02] (setup) a03 proposes a second correction, got ' || r);

  r := test_exc(test_u('a03'), 'correction_pending', test_c(1));
  perform test_assert(r = '1', '[5.03] a pending correction is correction_pending, got ' || r);
  perform test_as(test_u('a02'));
  select * into v from public.site_exceptions where kind = 'correction_pending' and source_id = test_c(1);
  execute 'reset role';
  perform test_assert(v.worker_id = test_w('01') and v.raised_by = test_u('a03') and v.reason = 'Went home sick'
                      and v.exception_date = current_date - 8 and v.distance_m is null,
    '[5.04] correction_pending carries the worker, the proposer, the reason and the day');
  r := test_appr(test_u('a07'), 'a1', 8, '01');
  perform test_assert(r = 'present|0.00|' || test_u('a01'), '[5.05] a pending correction leaves the old value, got ' || r);
  r := test_count(test_u('a07'), 'select 1 from public.site_exceptions');
  perform test_assert(r = '0', '[5.06] the wage reader still sees no exception, got ' || r);

  -- Rejected correction: no exception, value unchanged.
  r := test_try(test_u('a02'), format('select public.review_attendance_correction(%L, false, ''Overtime was signed off'')', test_c(2)));
  perform test_assert(r = 'ok:1', '[5.07] (setup) a02 rejects the second correction, got ' || r);
  r := test_exc(test_u('a01'), 'correction_pending', test_c(2));
  perform test_assert(r = '0', '[5.08] a rejected correction is no longer an exception, got ' || r);
  r := test_appr(test_u('a07'), 'a1', 8, '02');
  perform test_assert(r = 'present|2.00|' || test_u('a01'), '[5.09] a rejected correction leaves the old value, got ' || r);

  -- Approved correction: the view shows the new value (AC 5), the exception is gone.
  r := test_try(test_u('a02'), format('select public.review_attendance_correction(%L, true)', test_c(1)));
  perform test_assert(r = 'ok:1', '[5.10] (setup) a02 approves the first correction, got ' || r);
  r := test_appr(test_u('a07'), 'a1', 8, '01');
  perform test_assert(r = 'absent|0.00|' || test_u('a01'), '[5.11] an approved correction shows the new value, got ' || r);
  r := test_exc(test_u('a01'), 'correction_pending', test_c(1));
  perform test_assert(r = '0', '[5.12] an approved correction is no longer an exception, got ' || r);

  -- Rejected day, edited by the supervisor: changed_since_review turns true (D7).
  r := test_try(test_u('a03'), format(
    'update public.attendance_entries set status = ''half_day'' where site_id = %L and attendance_date = current_date - 7 and worker_id = %L',
    test_site('a1'), test_w('01')));
  perform test_assert(r = 'ok:1', '[5.13] (setup) a03 edits an entry of the rejected day, got ' || r);
  r := test_count(test_u('a02'), format(
    'select 1 from public.site_exceptions where kind = ''day_rejected'' and source_id = %L and changed_since_review', test_day('a1', 7)));
  perform test_assert(r = '1', '[5.14] a rejected day edited after the rejection is flagged changed, got ' || r);

  -- Approving the rejected day (AC 6) and the open day: rows appear, exceptions go.
  r := test_try(test_u('a02'), format('select public.review_attendance_day(%L, true)', test_day('a1', 7)));
  perform test_assert(r = 'ok:1', '[5.15] (setup) a02 approves the rejected day, got ' || r);
  r := test_count(test_u('a07'), 'select 1 from public.approved_attendance_days where work_date = current_date - 7');
  perform test_assert(r = '4', '[5.16] the newly approved day''s four rows appear, got ' || r);
  r := test_appr(test_u('a07'), 'a1', 7, '01');
  perform test_assert(r = 'half_day|0.00|' || test_u('a02'), '[5.17] with the edited value and the new reviewer, got ' || r);
  r := test_exc(test_u('a01'), 'day_rejected', test_day('a1', 7));
  perform test_assert(r = '0', '[5.18] an approved day is no longer day_rejected, got ' || r);

  r := test_count(test_u('a07'), 'select 1 from public.attendance_entries where attendance_date = current_date - 6');
  perform test_assert(r = '0', '[5.19] before approval the wage reader sees none of the open day''s entries, got ' || r);
  r := test_try(test_u('a01'), format('select public.review_attendance_day(%L, true)', test_day('a1', 6)));
  perform test_assert(r = 'ok:1', '[5.20] (setup) a01 approves the open day, got ' || r);
  r := test_count(test_u('a07'), 'select 1 from public.attendance_entries where attendance_date = current_date - 6');
  perform test_assert(r = '4', '[5.21] after approval the wage reader sees them, got ' || r);
  r := test_exc(test_u('a01'), 'day_awaiting_review', test_day('a1', 6));
  perform test_assert(r = '0', '[5.22] an approved day is no longer awaiting review, got ' || r);
  r := test_count(test_u('a01'), 'select 1 from public.approved_attendance_days');
  perform test_assert(r = '17', '[5.23] owner now sees 17 approved rows (9 + 4 + 4), got ' || r);
end $$;

rollback;
