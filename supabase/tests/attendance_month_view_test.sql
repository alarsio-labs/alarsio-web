-- Attendance & Site Presence: the published view attendance_month_entries (#234, ADR-053 W1).
-- Conventions as in attendance_views_test.sql: test_as / test_as_anon / test_assert.
-- Dates are relative to current_date, never literals.
begin;

-- ---------------------------------------------------------------- fixtures
-- Org A: owner a01, supervisors a03 (site A1) and a04 (site A2), accountant a05 (no assignment).
-- Org B: owner b01, supervisor b03 (site B1).
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000a01', 'owner-a@test.local'),
  ('00000000-0000-0000-0000-000000000a03', 'sup-a@test.local'),
  ('00000000-0000-0000-0000-000000000a04', 'sup-a2@test.local'),
  ('00000000-0000-0000-0000-000000000a05', 'acct-a@test.local'),
  ('00000000-0000-0000-0000-000000000b01', 'owner-b@test.local'),
  ('00000000-0000-0000-0000-000000000b03', 'sup-b@test.local');

insert into public.organizations (id, name, created_by) values
  ('10000000-0000-0000-0000-00000000000a', 'Org A', '00000000-0000-0000-0000-000000000a01'),
  ('10000000-0000-0000-0000-00000000000b', 'Org B', '00000000-0000-0000-0000-000000000b01');

insert into public.memberships (org_id, user_id, role) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000a01', 'owner'),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000a03', 'supervisor'),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000a04', 'supervisor'),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000a05', 'accountant'),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000b01', 'owner'),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000b03', 'supervisor');

insert into public.sites (id, org_id, name, address, latitude, longitude, status, created_by) values
  ('20000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a', 'A One', 'Pune',   0,  0,  'active', '00000000-0000-0000-0000-000000000a01'),
  ('20000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a', 'A Two', 'Nagpur', 10, 10, 'active', '00000000-0000-0000-0000-000000000a01'),
  ('20000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-00000000000b', 'B One', 'Indore', 0,  0,  'active', '00000000-0000-0000-0000-000000000b01');

insert into public.site_assignments (org_id, site_id, user_id, assigned_by) values
  ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000a03', '00000000-0000-0000-0000-000000000a01'),
  ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000a04', '00000000-0000-0000-0000-000000000a01'),
  ('10000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000b03', '00000000-0000-0000-0000-000000000b01');

create function public.test_u(k text)    returns uuid language sql immutable as $$ select ('00000000-0000-0000-0000-000000000' || k)::uuid $$;
create function public.test_site(k text) returns uuid language sql immutable as $$ select ('20000000-0000-0000-0000-0000000000' || k)::uuid $$;
create function public.test_w(k text)    returns uuid language sql immutable as $$ select ('77000000-0000-0000-0000-0000000000' || k)::uuid $$;
create function public.test_org(k text)  returns uuid language sql immutable as $$ select ('10000000-0000-0000-0000-00000000000' || k)::uuid $$;

-- Workers, rostered since 30 days ago with no end: 01 Ravi and 02 Sita at A1, 04 Latha at A2, b1 Bela at B1.
insert into public.workers (id, org_id, code, full_name, trade, pay_type, created_by) values
  (public.test_w('01'), public.test_org('a'), 'W-001', 'Ravi',  'mason',  'daily', public.test_u('a01')),
  (public.test_w('02'), public.test_org('a'), 'W-002', 'Sita',  'helper', 'daily', public.test_u('a01')),
  (public.test_w('04'), public.test_org('a'), 'W-004', 'Latha', 'helper', 'daily', public.test_u('a01')),
  (public.test_w('b1'), public.test_org('b'), 'W-001', 'Bela',  'mason',  'daily', public.test_u('b01'));

insert into public.worker_site_assignments (org_id, worker_id, site_id, assigned_by, assigned_at)
select o, w, s, public.test_u(by_), now() - interval '30 days'
  from (values (public.test_org('a'), public.test_w('01'), public.test_site('a1'), 'a01'),
               (public.test_org('a'), public.test_w('02'), public.test_site('a1'), 'a01'),
               (public.test_org('a'), public.test_w('04'), public.test_site('a2'), 'a01'),
               (public.test_org('b'), public.test_w('b1'), public.test_site('b1'), 'b01')) as x (o, w, s, by_);

-- Days. A1: -5 approved, -6 open, -7 rejected.  A2: -5 open.  B1: -5 open.
insert into public.attendance_days (org_id, site_id, attendance_date, recorded_by)
select public.test_org('a'), public.test_site('a1'), current_date - d, public.test_u('a03')
  from generate_series(5, 7) as d;
insert into public.attendance_days (org_id, site_id, attendance_date, recorded_by) values
  (public.test_org('a'), public.test_site('a2'), current_date - 5, public.test_u('a04')),
  (public.test_org('b'), public.test_site('b1'), current_date - 5, public.test_u('b03'));

-- Entries. A1, every day: Ravi present with a note, Sita half day with 2 h overtime.
-- One worker on each other site's day.
insert into public.attendance_entries (org_id, site_id, attendance_date, worker_id, status, overtime_hours, note, recorded_by)
select public.test_org('a'), public.test_site('a1'), current_date - d, w.id, w.st, w.ot, w.nt, public.test_u('a03')
  from generate_series(5, 7) as d,
       (values (public.test_w('01'), 'present', 0, 'Late start'), (public.test_w('02'), 'half_day', 2, null)) as w (id, st, ot, nt);
insert into public.attendance_entries (org_id, site_id, attendance_date, worker_id, status, overtime_hours, recorded_by) values
  (public.test_org('a'), public.test_site('a2'), current_date - 5, public.test_w('04'), 'present', 0, public.test_u('a04')),
  (public.test_org('b'), public.test_site('b1'), current_date - 5, public.test_w('b1'), 'present', 0, public.test_u('b03'));

-- Day states, set by the superuser so they do not depend on the review functions.
update public.attendance_days
   set status = 'approved', reviewed_by = public.test_u('a01'), reviewed_at = now() - interval '3 hours'
 where site_id = public.test_site('a1') and attendance_date = current_date - 5;
update public.attendance_days
   set status = 'rejected', reviewed_by = public.test_u('a01'), reviewed_at = now() - interval '1 hour', review_reason = 'Recount headcount'
 where site_id = public.test_site('a1') and attendance_date = current_date - 7;

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

-- Rows visible to p_user through a select, or the SQLSTATE raised.
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

-- One row as p_user: "status|overtime|day_status|note", or '-' when not visible.
create function public.test_month(p_user uuid, p_site text, p_n int, p_worker text) returns text language plpgsql as $$
declare r text;
begin
  perform test_as(p_user);
  select status || '|' || overtime_hours || '|' || day_status || '|' || coalesce(note, '~') into r
    from public.attendance_month_entries
   where site_id = public.test_site(p_site) and work_date = current_date - p_n and worker_id = public.test_w(p_worker);
  execute 'reset role';
  return coalesce(r, '-');
end $$;

-- ------------------------------------------------- 1 · catalog: shape and grants
do $$
begin
  perform test_assert(
    (select string_agg(column_name::text, ',' order by ordinal_position)
       from information_schema.columns where table_schema = 'public' and table_name = 'attendance_month_entries')
      = 'entry_id,org_id,site_id,worker_id,work_date,status,overtime_hours,day_status,note',
    '[1.01] attendance_month_entries has the ADR-053 W1 columns in order, then note last');
  perform test_assert(
    (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'attendance_month_entries' and c.relkind = 'v'
        and 'security_invoker=true' = any (c.reloptions)) = 1,
    '[1.02] the view is security_invoker');
  perform test_assert(not has_table_privilege('anon', 'public.attendance_month_entries', 'select')
                  and not has_table_privilege('public', 'public.attendance_month_entries', 'select'),
    '[1.03] anon and public have no select');
  perform test_assert(has_table_privilege('authenticated', 'public.attendance_month_entries', 'select'),
    '[1.04] authenticated may select');
  perform test_assert(not has_table_privilege('authenticated', 'public.attendance_month_entries', 'insert,update,delete,truncate'),
    '[1.05] authenticated has no write privilege');
end $$;

-- ------------------------------------------------- 2 · negative: who sees nothing
do $$
declare r text;
begin
  r := test_count(null, 'select * from public.attendance_month_entries');
  perform test_assert(r = '42501', '[2.01] anon cannot read the view, got ' || r);
  r := test_try(test_u('a01'), format(
    'insert into public.attendance_month_entries (entry_id, org_id, site_id, worker_id, work_date, status, overtime_hours, day_status) values (gen_random_uuid(), %L, %L, %L, current_date - 4, ''present'', 0, ''open'')',
    test_org('a'), test_site('a1'), test_w('01')));
  perform test_assert(r in ('42501', '55000'), '[2.02] no insert through the view, got ' || r);
  r := test_try(test_u('a01'), 'update public.attendance_month_entries set overtime_hours = 8');
  perform test_assert(r in ('42501', '55000'), '[2.03] no update through the view, got ' || r);
  r := test_try(test_u('a01'), 'delete from public.attendance_month_entries');
  perform test_assert(r in ('42501', '55000'), '[2.04] no delete through the view, got ' || r);
end $$;

-- ------------------------------------------------- 3 · who sees which rows
do $$
declare r text;
begin
  -- A1 has 3 days x 2 entries; A2 and B1 one entry each.
  r := test_count(test_u('a03'), 'select 1 from public.attendance_month_entries');
  perform test_assert(r = '6', '[3.01] the A1 supervisor sees the 6 entries of their site, got ' || r);
  r := test_count(test_u('a03'), format('select 1 from public.attendance_month_entries where site_id = %L', test_site('a2')));
  perform test_assert(r = '0', '[3.02] ...and none of the other site in the same organisation, got ' || r);
  r := test_count(test_u('a04'), 'select 1 from public.attendance_month_entries');
  perform test_assert(r = '1', '[3.03] the A2 supervisor sees only their own site''s entry, got ' || r);
  r := test_count(test_u('a01'), 'select 1 from public.attendance_month_entries');
  perform test_assert(r = '7', '[3.04] the owner sees the whole organisation (6 + 1), got ' || r);
  r := test_count(test_u('b01'), 'select 1 from public.attendance_month_entries');
  perform test_assert(r = '1', '[3.05] another organisation''s owner sees only their own, got ' || r);
  r := test_count(test_u('b03'), format('select 1 from public.attendance_month_entries where org_id = %L', test_org('a')));
  perform test_assert(r = '0', '[3.06] nobody sees across organisations, got ' || r);
  -- The wage reader sees an approved day only (attendance_entries' own policy).
  r := test_count(test_u('a05'), 'select 1 from public.attendance_month_entries');
  perform test_assert(r = '2', '[3.07] an accountant sees only the 2 entries of the approved day, got ' || r);
end $$;

-- ------------------------------------------------- 4 · contents
do $$
declare r text;
begin
  r := test_month(test_u('a03'), 'a1', 5, '01');
  perform test_assert(r = 'present|0.00|approved|Late start', '[4.01] an entry on an approved day, with its note, got ' || r);
  r := test_month(test_u('a03'), 'a1', 5, '02');
  perform test_assert(r = 'half_day|2.00|approved|~', '[4.02] half day with overtime and no note, got ' || r);
  r := test_month(test_u('a03'), 'a1', 6, '01');
  perform test_assert(r = 'present|0.00|open|Late start', '[4.03] an entry on an open day says open, got ' || r);
  r := test_month(test_u('a03'), 'a1', 7, '01');
  perform test_assert(r = 'present|0.00|rejected|Late start', '[4.04] an entry on a sent-back day says rejected, got ' || r);
  r := test_count(test_u('a01'), 'select 1 from (select entry_id from public.attendance_month_entries group by entry_id having count(*) > 1) d');
  perform test_assert(r = '0', '[4.05] entry_id is unique, so the phone can page by it, got ' || r);
end $$;

-- ------------------------------------------------- 5 · follows the entry and the day
do $$
declare r text;
begin
  -- An edit to an open day shows at once; an approval changes day_status for every entry of the day.
  r := test_try(test_u('a03'), format(
    'update public.attendance_entries set status = ''absent'' where site_id = %L and attendance_date = current_date - 6 and worker_id = %L',
    test_site('a1'), test_w('01')));
  perform test_assert(r = 'ok:1', '[5.01] (setup) the supervisor edits an entry of the open day, got ' || r);
  r := test_month(test_u('a03'), 'a1', 6, '01');
  perform test_assert(r = 'absent|0.00|open|Late start', '[5.02] the view shows the edited status, got ' || r);
  update public.attendance_days set status = 'approved', reviewed_by = public.test_u('a01'), reviewed_at = now()
   where site_id = public.test_site('a1') and attendance_date = current_date - 6;
  r := test_month(test_u('a03'), 'a1', 6, '02');
  perform test_assert(r like '%|approved|%', '[5.03] approving the day turns every one of its entries approved, got ' || r);
end $$;

rollback;
