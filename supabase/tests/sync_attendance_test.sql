-- Attendance & Site Presence, PR 3b: sync_site_visits, sync_attendance_days,
-- sync_attendance_entries, sync_attendance_corrections and their replay matchers.
-- Issue #28, ADR-033 (D1-D7 in the spec comment on #28). Contract: #13, ADR-014.
--
-- Every case goes through sync_push, as sync_daily_reports_test.sql does, so each
-- check is the verdict a phone would see; then the rows and audit_log are read back.
-- Verdicts are written "verdict:reason" ('accepted:-' when there is no reason).
--
-- Dates are relative to current_date, never literals.
begin;

-- ---------------------------------------------------------------- fixtures
-- Org A: owner a01, project manager a02, accountant a05, supervisors a03 and a06
-- (A1) and a04 (A2). Org B: owner b01, supervisor b03 (B1).
-- Sites A1 and B1 at (0, 0), A2 at (10, 10), default radius 200 m.

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000a01', 'owner-a@test.local'),
  ('00000000-0000-0000-0000-000000000a02', 'pm-a@test.local'),
  ('00000000-0000-0000-0000-000000000a03', 'sup-a@test.local'),
  ('00000000-0000-0000-0000-000000000a04', 'sup-a2@test.local'),
  ('00000000-0000-0000-0000-000000000a05', 'acct-a@test.local'),
  ('00000000-0000-0000-0000-000000000a06', 'sup-a3@test.local'),
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
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000a06', 'supervisor'),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000b01', 'owner'),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000b03', 'supervisor');

insert into public.sites (id, org_id, name, address, latitude, longitude, status, created_by) values
  ('20000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a', 'A One', 'Pune',   0,  0,  'active', '00000000-0000-0000-0000-000000000a01'),
  ('20000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a', 'A Two', 'Nagpur', 10, 10, 'active', '00000000-0000-0000-0000-000000000a01'),
  ('20000000-0000-0000-0000-0000000000a3', '10000000-0000-0000-0000-00000000000a', 'A Three', 'Nashik', 0, 0, 'active', '00000000-0000-0000-0000-000000000a01'),
  ('20000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-00000000000b', 'B One', 'Indore', 0,  0,  'active', '00000000-0000-0000-0000-000000000b01');

insert into public.site_assignments (org_id, site_id, user_id, assigned_by) values
  ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000a03', '00000000-0000-0000-0000-000000000a01'),
  ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000a06', '00000000-0000-0000-0000-000000000a01'),
  ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000a04', '00000000-0000-0000-0000-000000000a01'),
  ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-000000000a03', '00000000-0000-0000-0000-000000000a01'),
  ('10000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000b03', '00000000-0000-0000-0000-000000000b01');

-- a03 checked in at A3 while it was active; A3 is then archived directly. a03's
-- assignment stays open, so has_site_access is true (the visit is visible) while
-- can_record_on_site is false (the check-out update matches 0 rows).
insert into public.site_visits (id, org_id, site_id, user_id, check_in_at, check_in_lat, check_in_lng) values
  ('91000000-0000-0000-0000-000000000040', '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a3',
   '00000000-0000-0000-0000-000000000a03', now() - interval '4 hours', 0, 0);
update public.sites set status = 'archived', archived_at = now(), archived_by = '00000000-0000-0000-0000-000000000a01'
 where id = '20000000-0000-0000-0000-0000000000a3';

create function public.test_u(k text)    returns uuid language sql immutable as $$ select ('00000000-0000-0000-0000-000000000' || k)::uuid $$;
create function public.test_site(k text) returns uuid language sql immutable as $$ select ('20000000-0000-0000-0000-0000000000' || k)::uuid $$;
create function public.test_w(k text)    returns uuid language sql immutable as $$ select ('77000000-0000-0000-0000-0000000000' || k)::uuid $$;
create function public.test_org(k text)  returns uuid language sql immutable as $$ select ('10000000-0000-0000-0000-00000000000' || k)::uuid $$;
-- Record ids made "on the phone": kind 1 visit, 2 day, 3 entry, 4 correction.
create function public.test_id(p_kind int, p_n int) returns uuid language sql immutable as $$
  select ('9' || p_kind || '000000-0000-0000-0000-' || lpad(p_n::text, 12, '0'))::uuid
$$;

-- Workers: 01 Ravi, 02 Sita, 03 Arun, 06 Mala at A1; 04 Latha at A2; b1 Bela, org B.
insert into public.workers (id, org_id, code, full_name, trade, pay_type, created_by) values
  (public.test_w('01'), public.test_org('a'), 'W-001', 'Ravi',  'mason',  'daily', public.test_u('a01')),
  (public.test_w('02'), public.test_org('a'), 'W-002', 'Sita',  'helper', 'daily', public.test_u('a01')),
  (public.test_w('03'), public.test_org('a'), 'W-003', 'Arun',  'helper', 'daily', public.test_u('a01')),
  (public.test_w('06'), public.test_org('a'), 'W-006', 'Mala',  'helper', 'daily', public.test_u('a01')),
  (public.test_w('04'), public.test_org('a'), 'W-004', 'Latha', 'helper', 'daily', public.test_u('a01')),
  (public.test_w('b1'), public.test_org('b'), 'W-001', 'Bela',  'mason',  'daily', public.test_u('b01'));

insert into public.worker_site_assignments (org_id, worker_id, site_id, assigned_by, assigned_at)
select o, w, s, public.test_u(k), now() - interval '30 days'
  from (values (public.test_org('a'), public.test_w('01'), public.test_site('a1'), 'a01'),
               (public.test_org('a'), public.test_w('02'), public.test_site('a1'), 'a01'),
               (public.test_org('a'), public.test_w('03'), public.test_site('a1'), 'a01'),
               (public.test_org('a'), public.test_w('06'), public.test_site('a1'), 'a01'),
               (public.test_org('a'), public.test_w('04'), public.test_site('a2'), 'a01'),
               (public.test_org('b'), public.test_w('b1'), public.test_site('b1'), 'b01')) as x (o, w, s, k);

-- Days at A1, written by the superuser: -5 approved, -6 open, -7 rejected. Days -2,
-- -3 and -4 do not exist yet (the suite creates them through sync).
insert into public.attendance_days (org_id, site_id, attendance_date, recorded_by)
select public.test_org('a'), public.test_site('a1'), current_date - d, public.test_u('a03')
  from generate_series(5, 7) as d;

-- Entries on each of those days: Ravi present, Sita present with 2 h. Arun has none
-- (for new and late entries).
insert into public.attendance_entries (org_id, site_id, attendance_date, worker_id, status, overtime_hours, recorded_by)
select public.test_org('a'), public.test_site('a1'), current_date - d, w.id, 'present', w.ot, public.test_u('a03')
  from generate_series(5, 7) as d,
       (values (public.test_w('01'), 0), (public.test_w('02'), 2)) as w (id, ot);

update public.attendance_days
   set status = 'approved', reviewed_by = public.test_u('a02'), reviewed_at = now()
 where site_id = public.test_site('a1') and attendance_date = current_date - 5;
update public.attendance_days
   set status = 'rejected', reviewed_by = public.test_u('a02'), reviewed_at = now(), review_reason = 'Recount'
 where site_id = public.test_site('a1') and attendance_date = current_date - 7;

-- ----------------------------------------------------------------- helpers

-- Push one record as p_uid through sync_push; return "verdict:reason". The rate
-- limit (120 a minute per user) is cleared first, since now() does not move inside
-- one transaction and this suite pushes far more than that.
create function public.test_push(p_uid uuid, p_entity text, p_id uuid, p_payload jsonb) returns text language plpgsql as $$
declare v jsonb;
begin
  delete from public.rate_limit_counters where user_id = p_uid;
  perform test_as(p_uid);
  v := public.sync_push(jsonb_build_object('version', 1, 'device_id', 'test-phone', 'records',
         jsonb_build_array(jsonb_build_object('entity', p_entity, 'record_id', p_id, 'payload', p_payload))));
  execute 'reset role';
  return (select (x ->> 'verdict') || ':' || coalesce(x ->> 'reason', '-')
            from jsonb_array_elements(v -> 'results') as t (x));
end $$;

-- Call a handler directly as p_uid, without sync_push. Returns "verdict:reason" or
-- the SQLSTATE raised.
create function public.test_direct(p_uid uuid, p_entity text, p_id uuid, p_payload jsonb) returns text language plpgsql as $$
declare r public.sync_result; s text;
begin
  if p_uid is null then perform test_as_anon(); else perform test_as(p_uid); end if;
  begin
    execute format('select * from public.%I($1, $2)', 'sync_' || p_entity) into r using p_id, p_payload;
  exception when others then s := sqlstate; end;
  execute 'reset role';
  return coalesce(s, r.verdict || ':' || coalesce(r.reason, '-'));
end $$;

create function public.test_audit(p_table text, p_id uuid) returns bigint language sql as $$
  select count(*) from public.audit_log where table_name = p_table and row_id = p_id
$$;
create function public.test_has(p_table text, p_id uuid) returns boolean language plpgsql as $$
declare b boolean;
begin
  execute format('select exists (select 1 from public.%I where id = $1)', p_table) into b using p_id;
  return b;
end $$;

-- Payloads, A1 and org A unless given.
create function public.test_visit(p_at timestamptz, p_lat numeric, p_lng numeric, p_reason text default null,
                                  p_site text default 'a1', p_org text default 'a') returns jsonb language sql as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'org_id', public.test_org(p_org), 'site_id', public.test_site(p_site), 'check_in_at', p_at,
    'check_in_lat', p_lat, 'check_in_lng', p_lng, 'check_in_reason', p_reason))
$$;
create function public.test_out(p_at timestamptz, p_lat numeric, p_lng numeric, p_reason text default null) returns jsonb language sql as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'check_out_at', p_at, 'check_out_lat', p_lat, 'check_out_lng', p_lng, 'check_out_reason', p_reason))
$$;
create function public.test_daypl(p_n int, p_site text default 'a1', p_org text default 'a') returns jsonb language sql as $$
  select jsonb_build_object('org_id', public.test_org(p_org), 'site_id', public.test_site(p_site),
                            'attendance_date', current_date - p_n)
$$;
create function public.test_entpl(p_n int, p_worker text, p_status text, p_ot numeric, p_note text default null,
                                  p_site text default 'a1', p_org text default 'a') returns jsonb language sql as $$
  select jsonb_build_object('org_id', public.test_org(p_org), 'site_id', public.test_site(p_site),
                            'attendance_date', current_date - p_n, 'worker_id', public.test_w(p_worker),
                            'status', p_status, 'overtime_hours', p_ot, 'note', p_note)
$$;
create function public.test_corpl(p_n int, p_worker text, p_status text, p_ot numeric, p_reason text,
                                  p_note text default null, p_site text default 'a1', p_org text default 'a') returns jsonb language sql as $$
  select jsonb_build_object('org_id', public.test_org(p_org), 'site_id', public.test_site(p_site),
                            'attendance_date', current_date - p_n, 'worker_id', public.test_w(p_worker),
                            'new_status', p_status, 'new_overtime_hours', p_ot, 'new_note', p_note, 'reason', p_reason)
$$;

-- The id of a fixture entry, and its "status|overtime|note".
create function public.test_entry(p_n int, p_worker text) returns uuid language sql as $$
  select id from public.attendance_entries
   where site_id = public.test_site('a1') and attendance_date = current_date - p_n and worker_id = public.test_w(p_worker)
$$;
create function public.test_ent(p_n int, p_worker text) returns text language sql as $$
  select status || '|' || overtime_hours || '|' || coalesce(note, '-') from public.attendance_entries
   where site_id = public.test_site('a1') and attendance_date = current_date - p_n and worker_id = public.test_w(p_worker)
$$;

-- ------------------------------------------------- 1 · structure
do $$
declare f text;
begin
  foreach f in array array['sync_site_visits', 'sync_attendance_days', 'sync_attendance_entries', 'sync_attendance_corrections'] loop
    perform test_assert(
      (select not prosecdef and proconfig @> array['search_path=public']
         from pg_proc where oid = to_regprocedure('public.' || f || '(uuid, jsonb)')),
      '[1.01] ' || f || ' exists, is security invoker and pins search_path');
    perform test_assert(
      not has_function_privilege('anon', 'public.' || f || '(uuid, jsonb)', 'execute')
      and not has_function_privilege('public', 'public.' || f || '(uuid, jsonb)', 'execute')
      and has_function_privilege('authenticated', 'public.' || f || '(uuid, jsonb)', 'execute'),
      '[1.02] ' || f || ' is revoked from public and anon, granted to authenticated');
    perform test_assert(
      (select prorettype = 'public.sync_result'::regtype from pg_proc where oid = to_regprocedure('public.' || f || '(uuid, jsonb)')),
      '[1.03] ' || f || ' returns sync_result');
  end loop;

  foreach f in array array['site_visit_matches', 'attendance_day_matches', 'attendance_entry_matches', 'attendance_correction_matches'] loop
    perform test_assert(
      (select bool_and(prosecdef and proconfig @> array['search_path=public']
                       and not has_function_privilege('anon', oid, 'execute')
                       and not has_function_privilege('public', oid, 'execute')
                       and prorettype = 'boolean'::regtype)
         from pg_proc where proname = f and pronamespace = 'public'::regnamespace)
      and exists (select 1 from pg_proc where proname = f and pronamespace = 'public'::regnamespace),
      '[1.04] ' || f || ' exists, is security definer, pins search_path, returns boolean, no anon or public');
  end loop;

  f := test_direct(null, 'site_visits', test_id(1, 99), test_visit(now(), 0, 0));
  perform test_assert(f = '42501', '[1.05] anon cannot execute a handler, got ' || f);
end $$;

-- ------------------------------------------------- 2 · malformed payloads
do $$
declare r text;
begin
  -- sync_push refuses a payload that is not an object before any handler runs; the
  -- handler's own check (22023) is proven by calling it directly.
  r := test_push(test_u('a03'), 'site_visits', test_id(1, 90), '[1, 2]'::jsonb);
  perform test_assert(r = 'rejected:invalid_payload', '[2.01] a payload that is not an object, got ' || r);
  r := test_direct(test_u('a03'), 'attendance_entries', test_id(3, 90), '[1, 2]'::jsonb);
  perform test_assert(r = '22023', '[2.01b] the handler itself refuses a non-object payload, got ' || r);
  r := test_push(test_u('a03'), 'site_visits', test_id(1, 90), test_visit(now(), 0, 0) - 'check_in_lat');
  perform test_assert(r = 'rejected:invalid_input', '[2.02] visit missing check_in_lat, got ' || r);
  r := test_push(test_u('a03'), 'site_visits', test_id(1, 90), test_visit(now(), 0, 0) || '{"check_in_lat": "0"}');
  perform test_assert(r = 'rejected:invalid_input', '[2.03] visit lat as a string, got ' || r);
  r := test_push(test_u('a03'), 'site_visits', test_id(1, 90), test_visit(now(), 0, 0) || '{"site_id": "not-a-uuid"}');
  perform test_assert(r = 'rejected:invalid_input', '[2.04] visit with a bad uuid, got ' || r);
  r := test_push(test_u('a03'), 'site_visits', test_id(1, 90), test_visit(now(), 0, 0) || jsonb_build_object('check_out_at', now()));
  perform test_assert(r = 'rejected:invalid_input', '[2.05] a check-out leg without its coordinates, got ' || r);
  perform test_assert(not test_has('site_visits', test_id(1, 90)), '[2.06] no visit row from a malformed push');

  r := test_push(test_u('a03'), 'attendance_days', test_id(2, 90), test_daypl(2) - 'org_id');
  perform test_assert(r = 'rejected:invalid_input', '[2.07] day missing org_id, got ' || r);
  r := test_push(test_u('a03'), 'attendance_days', test_id(2, 90), test_daypl(2) || '{"attendance_date": "31-31-2026"}');
  perform test_assert(r = 'rejected:invalid_input', '[2.08] day with a bad date, got ' || r);
  r := test_push(test_u('a03'), 'attendance_days', test_id(2, 90), test_daypl(2) || '{"attendance_date": 20261001}');
  perform test_assert(r = 'rejected:invalid_input', '[2.09] day with a number for a date, got ' || r);
  perform test_assert(not test_has('attendance_days', test_id(2, 90)), '[2.10] no day row from a malformed push');

  r := test_push(test_u('a03'), 'attendance_entries', test_id(3, 90), test_entpl(6, '03', 'present', 0) - 'status');
  perform test_assert(r = 'rejected:invalid_input', '[2.11] entry missing status, got ' || r);
  r := test_push(test_u('a03'), 'attendance_entries', test_id(3, 90), test_entpl(6, '03', 'present', 0) || '{"overtime_hours": "2"}');
  perform test_assert(r = 'rejected:invalid_input', '[2.12] entry overtime as a string, got ' || r);
  r := test_push(test_u('a03'), 'attendance_entries', test_id(3, 90), test_entpl(6, '03', 'present', 0) || '{"note": 5}');
  perform test_assert(r = 'rejected:invalid_input', '[2.13] entry note as a number, got ' || r);
  perform test_assert(not test_has('attendance_entries', test_id(3, 90)), '[2.14] no entry row from a malformed push');

  r := test_push(test_u('a03'), 'attendance_corrections', test_id(4, 90), test_corpl(5, '01', 'absent', 0, 'r') - 'reason');
  perform test_assert(r = 'rejected:invalid_input', '[2.15] correction missing reason, got ' || r);
  r := test_push(test_u('a03'), 'attendance_corrections', test_id(4, 90), test_corpl(5, '01', 'absent', 0, 'r') || '{"new_status": true}');
  perform test_assert(r = 'rejected:invalid_input', '[2.16] correction status as a boolean, got ' || r);
  perform test_assert(not test_has('attendance_corrections', test_id(4, 90)), '[2.17] no correction row from a malformed push');
end $$;

-- ------------------------------------------------- 3 · sync_site_visits
do $$
declare r text; v record;
begin
  -- New check-in, inside (AC 6), then its replay (AC 3).
  r := test_push(test_u('a03'), 'site_visits', test_id(1, 1), test_visit(now() - interval '3 hours', 0, 0));
  perform test_assert(r = 'accepted:-', '[3.01] a new check-in is accepted, got ' || r);
  select * into v from public.site_visits where id = test_id(1, 1);
  perform test_assert(v.user_id = test_u('a03') and v.check_in_outside_geofence = false and v.check_out_at is null,
    '[3.02] the visit is stored with the phone''s id, in the caller''s name, inside');
  r := test_push(test_u('a03'), 'site_visits', test_id(1, 1), test_visit(now() - interval '3 hours', 0, 0));
  perform test_assert(r = 'accepted:-', '[3.03] the same check-in again is accepted, got ' || r);
  perform test_assert(test_audit('site_visits', test_id(1, 1)) = 1, '[3.04] the replay wrote nothing');

  -- Outside the geofence.
  r := test_push(test_u('a03'), 'site_visits', test_id(1, 2), test_visit(now() - interval '3 hours', 0.01, 0));
  perform test_assert(r = 'rejected:invalid_input', '[3.05] outside with no reason is rejected, got ' || r);
  perform test_assert(not test_has('site_visits', test_id(1, 2)) and test_audit('site_visits', test_id(1, 2)) = 0,
    '[3.06] and leaves no row and no audit row');
  r := test_push(test_u('a03'), 'site_visits', test_id(1, 2), test_visit(now() - interval '3 hours', 0.01, 0, 'Gate locked'));
  perform test_assert(r = 'accepted:-', '[3.07] outside with a reason is accepted, got ' || r);
  perform test_assert((select check_in_outside_geofence from site_visits where id = test_id(1, 2)),
    '[3.08] and flagged outside by the database');

  -- Both legs in one push (AC 7), and a both-legs push whose check-out is refused (AC 5).
  r := test_push(test_u('a03'), 'site_visits', test_id(1, 3),
                 test_visit(now() - interval '5 hours', 0, 0) || test_out(now() - interval '1 hour', 0, 0));
  perform test_assert(r = 'accepted:-', '[3.09] check-in and check-out in one push is accepted, got ' || r);
  perform test_assert((select check_out_at = now() - interval '1 hour' from site_visits where id = test_id(1, 3)),
    '[3.10] and the check-out is set');
  r := test_push(test_u('a03'), 'site_visits', test_id(1, 4),
                 test_visit(now() - interval '5 hours', 0, 0) || test_out(now() - interval '1 hour', 0.01, 0));
  perform test_assert(r = 'rejected:invalid_input', '[3.11] a check-out outside with no reason is rejected, got ' || r);
  perform test_assert(not test_has('site_visits', test_id(1, 4)), '[3.12] and the check-in of that push is rolled back too');

  -- Check-out on the open visit 1 (AC 8, 9).
  r := test_push(test_u('a03'), 'site_visits', test_id(1, 1),
                 test_visit(now() - interval '3 hours', 0, 0) || test_out(now() - interval '30 minutes', 0, 0));
  perform test_assert(r = 'accepted:-', '[3.13] checking out the open visit is accepted, got ' || r);
  perform test_assert(test_audit('site_visits', test_id(1, 1)) = 2, '[3.14] one audit row for the check-out');
  r := test_push(test_u('a03'), 'site_visits', test_id(1, 1),
                 test_visit(now() - interval '3 hours', 0, 0) || test_out(now() - interval '30 minutes', 0, 0));
  perform test_assert(r = 'accepted:-', '[3.15] the same check-out again is accepted, got ' || r);
  r := test_push(test_u('a03'), 'site_visits', test_id(1, 1), test_visit(now() - interval '3 hours', 0, 0));
  perform test_assert(r = 'accepted:-', '[3.16] the check-in alone after the check-out is accepted, got ' || r);
  perform test_assert(test_audit('site_visits', test_id(1, 1)) = 2, '[3.17] neither replay wrote anything');
  r := test_push(test_u('a03'), 'site_visits', test_id(1, 1),
                 test_visit(now() - interval '3 hours', 0, 0) || test_out(now() - interval '10 minutes', 0, 0));
  perform test_assert(r = 'conflict:checked_out', '[3.18] a different check-out on a closed visit, got ' || r);
  r := test_push(test_u('a03'), 'site_visits', test_id(1, 1), test_visit(now() - interval '3 hours', 0.0001, 0));
  perform test_assert(r = 'conflict:different_visit', '[3.19] the same id with a different check-in (AC 10), got ' || r);
  perform test_assert((select check_out_at = now() - interval '30 minutes' and check_in_lat = 0 from site_visits where id = test_id(1, 1)),
    '[3.20] the visit is unchanged by the conflicts');

  -- Someone else's visit, other roles, other organisations (AC 11, 12, 13).
  r := test_push(test_u('a06'), 'site_visits', test_id(1, 2),
                 test_visit(now() - interval '3 hours', 0.01, 0, 'Gate locked') || test_out(now(), 0, 0));
  perform test_assert(r = 'rejected:permission_denied', '[3.21] checking out another supervisor''s visit, got ' || r);
  perform test_assert((select check_out_at is null from site_visits where id = test_id(1, 2)), '[3.22] and it stays open');
  r := test_push(test_u('a01'), 'site_visits', test_id(1, 5), test_visit(now(), 0, 0));
  perform test_assert(r = 'rejected:permission_denied', '[3.23] the owner does not record visits, got ' || r);
  r := test_push(test_u('a04'), 'site_visits', test_id(1, 5), test_visit(now(), 0, 0));
  perform test_assert(r = 'rejected:permission_denied', '[3.24] a supervisor of another site, got ' || r);
  r := test_push(test_u('a03'), 'site_visits', test_id(1, 5), test_visit(now(), 0, 0, null, 'b1', 'b'));
  perform test_assert(r = 'rejected:permission_denied', '[3.25] another organisation''s site, got ' || r);
  r := test_push(test_u('a03'), 'site_visits', test_id(1, 5), test_visit(now(), 0, 0, null, 'a1', 'b'));
  perform test_assert(r = 'rejected:invalid_input', '[3.26] an org_id that does not match the site is not retried, got ' || r);
  r := test_push(test_u('a03'), 'site_visits', test_id(1, 5), test_visit(now() + interval '2 days', 0, 0));
  perform test_assert(r = 'rejected:invalid_input', '[3.27] a phone clock two days ahead, got ' || r);
  perform test_assert(not test_has('site_visits', test_id(1, 5)), '[3.28] none of these wrote a row');

  -- The caller still sees their open visit, but the site was archived: the check-out
  -- matches 0 rows, and 0 rows is never "accepted".
  r := test_push(test_u('a03'), 'site_visits', test_id(1, 40),
                 test_visit(now() - interval '4 hours', 0, 0, null, 'a3') || test_out(now(), 0, 0));
  perform test_assert(r = 'rejected:permission_denied', '[3.29] a check-out on an archived site, got ' || r);
  perform test_assert((select check_out_at is null from site_visits where id = test_id(1, 40)), '[3.30] and the visit stays open');
end $$;

-- ------------------------------------------------- 4 · sync_attendance_days
do $$
declare r text; n bigint;
begin
  r := test_push(test_u('a03'), 'attendance_days', test_id(2, 1), test_daypl(2));
  perform test_assert(r = 'accepted:-', '[4.01] a new day is accepted, got ' || r);
  perform test_assert(test_has('attendance_days', test_id(2, 1)), '[4.02] with the phone''s id');
  r := test_push(test_u('a03'), 'attendance_days', test_id(2, 1), test_daypl(2));
  perform test_assert(r = 'accepted:-', '[4.03] the same day again is accepted, got ' || r);
  perform test_assert(test_audit('attendance_days', test_id(2, 1)) = 1, '[4.04] the replay wrote nothing');

  -- A second phone opens the same site and date under its own id (AC 15).
  r := test_push(test_u('a06'), 'attendance_days', test_id(2, 2), test_daypl(2));
  perform test_assert(r = 'accepted:-', '[4.05] a second phone''s day for the same site and date is accepted, got ' || r);
  select count(*) into n from attendance_days where site_id = test_site('a1') and attendance_date = current_date - 2;
  perform test_assert(n = 1 and not test_has('attendance_days', test_id(2, 2)), '[4.06] and no second day row exists');

  r := test_push(test_u('a03'), 'attendance_days', test_id(2, 1), test_daypl(3));
  perform test_assert(r = 'conflict:different_day', '[4.07] the same id for another date, got ' || r);

  r := test_push(test_u('a04'), 'attendance_days', test_id(2, 3), test_daypl(3));
  perform test_assert(r = 'rejected:permission_denied', '[4.08] a supervisor of another site, got ' || r);
  r := test_push(test_u('a02'), 'attendance_days', test_id(2, 3), test_daypl(3));
  perform test_assert(r = 'rejected:permission_denied', '[4.09] the project manager does not record days, got ' || r);
  r := test_push(test_u('a03'), 'attendance_days', test_id(2, 3), test_daypl(3, 'b1', 'b'));
  perform test_assert(r = 'rejected:permission_denied', '[4.10] another organisation''s site, got ' || r);
  r := test_push(test_u('a03'), 'attendance_days', test_id(2, 3), test_daypl(3, 'a1', 'b'));
  perform test_assert(r = 'rejected:invalid_input', '[4.11] an org_id that does not match the site, got ' || r);
  r := test_push(test_u('a03'), 'attendance_days', test_id(2, 3), test_daypl(-2));
  perform test_assert(r = 'rejected:invalid_input', '[4.12] a date beyond UTC today + 1, got ' || r);
  perform test_assert(not test_has('attendance_days', test_id(2, 3)), '[4.13] none of these wrote a row');

  -- An approved day pushed again under a new id: accepted, nothing changes (AC 18).
  r := test_push(test_u('a03'), 'attendance_days', test_id(2, 4), test_daypl(5));
  perform test_assert(r = 'accepted:-', '[4.14] an already approved day pushed again is accepted, got ' || r);
  perform test_assert((select status from attendance_days where site_id = test_site('a1') and attendance_date = current_date - 5) = 'approved'
                      and not test_has('attendance_days', test_id(2, 4)),
    '[4.15] and the approved day is untouched');
  -- The second-phone answer is for someone who may record there: the project manager
  -- can read the day but gets no "accepted" for it.
  r := test_push(test_u('a02'), 'attendance_days', test_id(2, 6), test_daypl(5));
  perform test_assert(r = 'rejected:permission_denied', '[4.16] a reader who cannot record re-sending a day, got ' || r);
end $$;

-- ------------------------------------------------- 5 · sync_attendance_entries
do $$
declare r text; n bigint;
begin
  -- New entry on an open day (AC 19), replay (AC 3).
  r := test_push(test_u('a03'), 'attendance_entries', test_id(3, 1), test_entpl(6, '03', 'present', 1));
  perform test_assert(r = 'accepted:-', '[5.01] a new entry on an open day is accepted, got ' || r);
  perform test_assert(test_has('attendance_entries', test_id(3, 1)), '[5.02] with the phone''s id');
  r := test_push(test_u('a03'), 'attendance_entries', test_id(3, 1), test_entpl(6, '03', 'present', 1));
  perform test_assert(r = 'accepted:-', '[5.03] the same entry again is accepted, got ' || r);
  perform test_assert(test_audit('attendance_entries', test_id(3, 1)) = 1, '[5.04] the replay wrote nothing');

  -- Day not there yet (AC 20).
  r := test_push(test_u('a03'), 'attendance_entries', test_id(3, 2), test_entpl(4, '01', 'present', 0));
  perform test_assert(r = 'retryable_error:missing_parent', '[5.05] an entry before its day is retried, got ' || r);
  r := test_push(test_u('a03'), 'attendance_days', test_id(2, 5), test_daypl(4));
  perform test_assert(r = 'accepted:-', '[5.06] (setup) the day arrives, got ' || r);
  r := test_push(test_u('a03'), 'attendance_entries', test_id(3, 2), test_entpl(4, '01', 'present', 0));
  perform test_assert(r = 'accepted:-', '[5.07] then the entry is accepted, got ' || r);

  -- Roster and other organisation (AC 21).
  r := test_push(test_u('a03'), 'attendance_entries', test_id(3, 3), test_entpl(6, '04', 'present', 0));
  perform test_assert(r = 'rejected:invalid_input', '[5.08] a worker not rostered at the site, got ' || r);
  r := test_push(test_u('a03'), 'attendance_entries', test_id(3, 3), test_entpl(6, 'b1', 'present', 0));
  perform test_assert(r = 'rejected:invalid_input', '[5.09] another organisation''s worker is not retried, got ' || r);

  -- Edits under the same id (AC 22): open day, rejected day.
  r := test_push(test_u('a03'), 'attendance_entries', test_id(3, 1), test_entpl(6, '03', 'absent', 0, 'Went home'));
  perform test_assert(r = 'accepted:-', '[5.10] an edit on an open day is accepted, got ' || r);
  perform test_assert(test_ent(6, '03') = 'absent|0.00|Went home' and test_audit('attendance_entries', test_id(3, 1)) = 2,
    '[5.11] the entry holds the new values, with one audit row for the edit');
  r := test_push(test_u('a03'), 'attendance_entries', test_entry(7, '01'), test_entpl(7, '01', 'half_day', 0));
  perform test_assert(r = 'accepted:-', '[5.12] an edit on a rejected day is accepted, got ' || r);
  perform test_assert(test_ent(7, '01') = 'half_day|0.00|-', '[5.13] and applied');

  -- The approved day (AC 23, 24).
  select count(*) into n from audit_log where table_name = 'attendance_entries';
  r := test_push(test_u('a03'), 'attendance_entries', test_entry(5, '01'), test_entpl(5, '01', 'absent', 0));
  perform test_assert(r = 'conflict:locked', '[5.14] an edit on an approved day is a locked conflict, got ' || r);
  perform test_assert(test_ent(5, '01') = 'present|0.00|-', '[5.15] and the entry is unchanged');
  r := test_push(test_u('a03'), 'attendance_entries', test_id(3, 4), test_entpl(5, '03', 'present', 0));
  perform test_assert(r = 'conflict:locked', '[5.16] a late entry on an approved day is a locked conflict, got ' || r);
  perform test_assert(not test_has('attendance_entries', test_id(3, 4)), '[5.17] and leaves no row');
  perform test_assert((select count(*) from audit_log where table_name = 'attendance_entries') = n,
    '[5.18] neither wrote an audit row');

  -- A second phone (D3, AC 25), and an id reused for another entry (AC 26).
  r := test_push(test_u('a06'), 'attendance_entries', test_id(3, 5), test_entpl(6, '01', 'present', 0));
  perform test_assert(r = 'accepted:-', '[5.19] a second phone marking the same thing is accepted, got ' || r);
  select count(*) into n from attendance_entries where site_id = test_site('a1') and attendance_date = current_date - 6 and worker_id = test_w('01');
  perform test_assert(n = 1 and not test_has('attendance_entries', test_id(3, 5)), '[5.20] and adds no second entry');
  r := test_push(test_u('a06'), 'attendance_entries', test_id(3, 5), test_entpl(6, '01', 'absent', 0));
  perform test_assert(r = 'conflict:duplicate', '[5.21] a second phone disagreeing is a duplicate conflict, got ' || r);
  perform test_assert(test_ent(6, '01') = 'present|0.00|-', '[5.22] and the first writer''s entry stands');
  r := test_push(test_u('a03'), 'attendance_entries', test_id(3, 1), test_entpl(6, '06', 'present', 0));
  perform test_assert(r = 'conflict:different_entry', '[5.23] the same id for another worker, got ' || r);

  -- Value rules (AC 27) and roles.
  r := test_push(test_u('a03'), 'attendance_entries', test_id(3, 6), test_entpl(6, '06', 'sick', 0));
  perform test_assert(r = 'rejected:invalid_input', '[5.24] an unknown status, got ' || r);
  r := test_push(test_u('a03'), 'attendance_entries', test_id(3, 6), test_entpl(6, '06', 'present', 8.01));
  perform test_assert(r = 'rejected:invalid_input', '[5.25] overtime over 8, got ' || r);
  r := test_push(test_u('a03'), 'attendance_entries', test_id(3, 6), test_entpl(6, '06', 'absent', 1));
  perform test_assert(r = 'rejected:invalid_input', '[5.26] overtime on an absent day, got ' || r);
  r := test_push(test_u('a05'), 'attendance_entries', test_id(3, 6), test_entpl(6, '06', 'present', 0));
  perform test_assert(r = 'rejected:permission_denied', '[5.27] the accountant does not record entries, got ' || r);
  r := test_push(test_u('a04'), 'attendance_entries', test_id(3, 6), test_entpl(6, '06', 'present', 0));
  perform test_assert(r = 'rejected:permission_denied', '[5.28] a supervisor of another site, got ' || r);
  perform test_assert(not test_has('attendance_entries', test_id(3, 6)), '[5.29] none of these wrote a row');

  -- D1: the handler itself answers the lock, without depending on a sync_push clause.
  r := test_direct(test_u('a03'), 'attendance_entries', test_id(3, 7), test_entpl(5, '03', 'present', 0));
  perform test_assert(r = 'conflict:locked', '[5.30] called directly, a late entry answers conflict:locked, got ' || r);
  perform test_assert(not test_has('attendance_entries', test_id(3, 7)), '[5.31] and the refused insert is rolled back');

  -- The second-phone answer is for someone who may record there (D3).
  r := test_push(test_u('a02'), 'attendance_entries', test_id(3, 8), test_entpl(6, '02', 'present', 2));
  perform test_assert(r = 'rejected:permission_denied', '[5.32] a reader who cannot record re-sending an entry, got ' || r);
end $$;

-- ------------------------------------------------- 6 · sync_attendance_corrections
do $$
declare r text;
begin
  r := test_push(test_u('a03'), 'attendance_corrections', test_id(4, 1), test_corpl(5, '01', 'absent', 0, 'Went home sick'));
  perform test_assert(r = 'accepted:-', '[6.01] a correction on an approved day is accepted, got ' || r);
  perform test_assert((select review_status = 'pending' and old_status = 'present' and proposed_by = test_u('a03')
                         from attendance_corrections where id = test_id(4, 1)),
    '[6.02] pending, with the old value stamped by the server');
  r := test_push(test_u('a03'), 'attendance_corrections', test_id(4, 1), test_corpl(5, '01', 'absent', 0, 'Went home sick'));
  perform test_assert(r = 'accepted:-', '[6.03] the same correction again is accepted, got ' || r);
  perform test_assert(test_audit('attendance_corrections', test_id(4, 1)) = 1, '[6.04] the replay wrote nothing');

  r := test_push(test_u('a03'), 'attendance_corrections', test_id(4, 2), test_corpl(6, '01', 'absent', 0, 'r'));
  perform test_assert(r = 'rejected:invalid_state', '[6.05] a correction on an open day, got ' || r);
  r := test_push(test_u('a03'), 'attendance_corrections', test_id(4, 2), test_corpl(7, '02', 'absent', 0, 'r'));
  perform test_assert(r = 'rejected:invalid_state', '[6.06] a correction on a rejected day, got ' || r);
  r := test_push(test_u('a03'), 'attendance_corrections', test_id(4, 2), test_corpl(5, '03', 'absent', 0, 'r'));
  perform test_assert(r = 'retryable_error:missing_parent', '[6.07] a correction before its entry is retried, got ' || r);
  r := test_push(test_u('a03'), 'attendance_corrections', test_id(4, 2), test_corpl(5, '01', 'half_day', 0, 'r'));
  perform test_assert(r = 'conflict:duplicate', '[6.08] a second pending correction for the entry, got ' || r);
  r := test_push(test_u('a03'), 'attendance_corrections', test_id(4, 1), test_corpl(5, '01', 'absent', 0, 'Another reason'));
  perform test_assert(r = 'conflict:different_correction', '[6.09] the same id with other content, got ' || r);
  r := test_push(test_u('a03'), 'attendance_corrections', test_id(4, 2), test_corpl(5, '02', 'absent', 0, ' '));
  perform test_assert(r = 'rejected:invalid_input', '[6.10] a blank reason, got ' || r);
  r := test_push(test_u('a03'), 'attendance_corrections', test_id(4, 2), test_corpl(5, '02', 'present', 2, 'No change'));
  perform test_assert(r = 'rejected:invalid_input', '[6.11] a correction that changes nothing, got ' || r);
  r := test_push(test_u('a03'), 'attendance_corrections', test_id(4, 2), test_corpl(5, '02', 'absent', 0, 'r', null, 'a1', 'b'));
  perform test_assert(r = 'rejected:invalid_input', '[6.12] an org_id that does not match the site is not retried, got ' || r);
  r := test_push(test_u('a02'), 'attendance_corrections', test_id(4, 2), test_corpl(5, '02', 'absent', 0, 'r'));
  perform test_assert(r = 'rejected:permission_denied', '[6.13] the project manager does not propose, got ' || r);
  r := test_push(test_u('a04'), 'attendance_corrections', test_id(4, 2), test_corpl(5, '02', 'absent', 0, 'r'));
  perform test_assert(r = 'rejected:permission_denied', '[6.14] a supervisor of another site, got ' || r);
  perform test_assert(not test_has('attendance_corrections', test_id(4, 2)), '[6.15] none of these wrote a row');

  -- Reviewed since: the replay still matches (AC 32).
  perform test_as(test_u('a02'));
  perform public.review_attendance_correction(test_id(4, 1), true);
  execute 'reset role';
  r := test_push(test_u('a03'), 'attendance_corrections', test_id(4, 1), test_corpl(5, '01', 'absent', 0, 'Went home sick'));
  perform test_assert(r = 'accepted:-', '[6.16] a replay after the correction was approved is accepted, got ' || r);
  perform test_assert(test_audit('attendance_corrections', test_id(4, 1)) = 2, '[6.17] and wrote nothing (insert + review only)');
end $$;

-- ------------------------------------------------- 7 · replay after losing the site (AC 4)
do $$
declare r text;
begin
  -- a06 records one of each, then is unassigned from A1.
  r := test_push(test_u('a06'), 'site_visits', test_id(1, 10), test_visit(now() - interval '2 hours', 0, 0));
  perform test_assert(r = 'accepted:-', '[7.01] (setup) a06 checks in, got ' || r);
  r := test_push(test_u('a06'), 'attendance_days', test_id(2, 10), test_daypl(3));
  perform test_assert(r = 'accepted:-', '[7.02] (setup) a06 opens a day, got ' || r);
  r := test_push(test_u('a06'), 'attendance_entries', test_id(3, 10), test_entpl(3, '02', 'present', 0));
  perform test_assert(r = 'accepted:-', '[7.03] (setup) a06 marks an entry, got ' || r);
  r := test_push(test_u('a06'), 'attendance_corrections', test_id(4, 10), test_corpl(5, '02', 'present', 0, 'No overtime'));
  perform test_assert(r = 'accepted:-', '[7.04] (setup) a06 proposes a correction, got ' || r);

  update public.site_assignments set unassigned_at = now()
   where user_id = test_u('a06') and site_id = test_site('a1');

  r := test_push(test_u('a06'), 'site_visits', test_id(1, 10), test_visit(now() - interval '2 hours', 0, 0));
  perform test_assert(r = 'accepted:-', '[7.05] the visit replay is accepted after losing the site, got ' || r);
  r := test_push(test_u('a06'), 'attendance_days', test_id(2, 10), test_daypl(3));
  perform test_assert(r = 'accepted:-', '[7.06] the day replay is accepted after losing the site, got ' || r);
  r := test_push(test_u('a06'), 'attendance_entries', test_id(3, 10), test_entpl(3, '02', 'present', 0));
  perform test_assert(r = 'accepted:-', '[7.07] the entry replay is accepted after losing the site, got ' || r);
  r := test_push(test_u('a06'), 'attendance_corrections', test_id(4, 10), test_corpl(5, '02', 'present', 0, 'No overtime'));
  perform test_assert(r = 'accepted:-', '[7.08] the correction replay is accepted after losing the site, got ' || r);

  -- New writes are refused (AC 11): a check-out, an edit, a new day.
  r := test_push(test_u('a06'), 'site_visits', test_id(1, 10),
                 test_visit(now() - interval '2 hours', 0, 0) || test_out(now(), 0, 0));
  perform test_assert(r = 'rejected:permission_denied', '[7.09] a check-out after losing the site, got ' || r);
  r := test_push(test_u('a06'), 'attendance_entries', test_id(3, 10), test_entpl(3, '02', 'absent', 0));
  perform test_assert(r = 'rejected:permission_denied', '[7.10] an edit after losing the site, got ' || r);
  r := test_push(test_u('a06'), 'attendance_days', test_id(2, 11), test_daypl(8));
  perform test_assert(r = 'rejected:permission_denied', '[7.11] a new day after losing the site, got ' || r);

  -- A matcher speaks only for the caller's own rows: a03's visit replayed by a06 is not accepted.
  r := test_push(test_u('a06'), 'site_visits', test_id(1, 1), test_visit(now() - interval '3 hours', 0, 0));
  perform test_assert(r <> 'accepted:-', '[7.12] another user''s record does not match as a replay, got ' || r);
end $$;

-- ------------------------------------------------- 8 · the phone's clock, precision, and a batch
do $$
declare r text; v jsonb;
begin
  -- Words Postgres would read on the server's clock are refused (ADR-021 D7).
  r := test_push(test_u('a03'), 'attendance_entries', test_id(3, 20), test_entpl(6, '06', 'present', 0) || '{"attendance_date": "today"}');
  perform test_assert(r = 'rejected:invalid_input', '[8.01] an entry dated "today" is refused, got ' || r);
  r := test_push(test_u('a03'), 'attendance_corrections', test_id(4, 20), test_corpl(5, '02', 'absent', 0, 'r') || '{"attendance_date": "yesterday"}');
  perform test_assert(r = 'rejected:invalid_input', '[8.02] a correction dated "yesterday" is refused, got ' || r);
  r := test_push(test_u('a03'), 'site_visits', test_id(1, 20), test_visit(now(), 0, 0) || '{"check_in_at": "now"}');
  perform test_assert(r = 'rejected:invalid_input', '[8.03] a check-in at "now" is refused, got ' || r);
  r := test_push(test_u('a03'), 'site_visits', test_id(1, 20), test_visit(now() - interval '1 hour', 0, 0) || '{"check_out_at": "today", "check_out_lat": 0, "check_out_lng": 0}');
  perform test_assert(r = 'rejected:invalid_input', '[8.04] a check-out at "today" is refused, got ' || r);
  perform test_assert(not test_has('site_visits', test_id(1, 20)) and not test_has('attendance_entries', test_id(3, 20)),
    '[8.05] none of these wrote a row');

  -- A value finer than the column is stored at the column's precision, and its replay matches.
  r := test_push(test_u('a03'), 'attendance_entries', test_id(3, 21), test_entpl(6, '06', 'present', 1.005));
  perform test_assert(r = 'accepted:-', '[8.06] overtime 1.005 is accepted, got ' || r);
  perform test_assert(test_ent(6, '06') = 'present|1.01|-', '[8.07] and stored at two decimals, got ' || coalesce(test_ent(6, '06'), 'none'));
  r := test_push(test_u('a03'), 'attendance_entries', test_id(3, 21), test_entpl(6, '06', 'present', 1.005));
  perform test_assert(r = 'accepted:-', '[8.08] its replay is accepted, not a conflict, got ' || r);
  perform test_assert(test_audit('attendance_entries', test_id(3, 21)) = 1, '[8.09] and wrote nothing');
  r := test_push(test_u('a03'), 'site_visits', test_id(1, 21), test_visit(now() - interval '1 hour', 0.0000004, 0));
  perform test_assert(r = 'accepted:-', '[8.10] a coordinate finer than 6 decimals is accepted, got ' || r);
  r := test_push(test_u('a03'), 'site_visits', test_id(1, 21), test_visit(now() - interval '1 hour', 0.0000004, 0));
  perform test_assert(r = 'accepted:-', '[8.11] and its replay is accepted, got ' || r);

  -- One bad record does not block the rest of its batch (ADR-014, the poison-record rule).
  delete from public.rate_limit_counters where user_id = test_u('a03');
  perform test_as(test_u('a03'));
  v := public.sync_push(jsonb_build_object('version', 1, 'device_id', 'test-phone', 'records', jsonb_build_array(
         jsonb_build_object('entity', 'attendance_days',    'record_id', test_id(2, 22), 'payload', test_daypl(9)),
         jsonb_build_object('entity', 'attendance_entries', 'record_id', test_id(3, 22), 'payload', test_entpl(9, '01', 'sick', 0)),
         jsonb_build_object('entity', 'attendance_entries', 'record_id', test_id(3, 23), 'payload', test_entpl(9, '02', 'present', 0)))));
  execute 'reset role';
  perform test_assert(
    (select string_agg((x ->> 'verdict') || ':' || coalesce(x ->> 'reason', '-'), ',' order by n)
       from jsonb_array_elements(v -> 'results') with ordinality as t (x, n))
    = 'accepted:-,rejected:invalid_input,accepted:-',
    '[8.12] a batch of day, bad entry, good entry answers each on its own, got ' || (v -> 'results')::text);
  perform test_assert(test_has('attendance_days', test_id(2, 22)) and test_has('attendance_entries', test_id(3, 23))
                      and not test_has('attendance_entries', test_id(3, 22)),
    '[8.13] the good records are stored and the bad one is not');
end $$;

-- ------------------------------------------------- 9 · the entry matcher is not an oracle (D5)
-- An entry can be changed by someone else after the caller wrote it. The matcher must
-- then say no for every value, so a caller who lost the site cannot read through it.
-- now() is fixed in this transaction, so the entry is back-dated first, as if written
-- earlier; the later change then carries a newer updated_at.
create function public.test_entry_matches(p_uid uuid, p_id uuid, p_status text, p_ot numeric) returns boolean language plpgsql as $$
declare b boolean;
begin
  perform test_as(p_uid);
  b := public.attendance_entry_matches(p_id, test_site('a1'), current_date - 7, test_w('03'), p_status, p_ot, null);
  execute 'reset role';
  return b;
end $$;

do $$
declare r text;
begin
  r := test_push(test_u('a03'), 'attendance_entries', test_id(3, 30), test_entpl(7, '03', 'present', 0));
  perform test_assert(r = 'accepted:-', '[9.01] (setup) a03 marks Arun on the rejected day, got ' || r);
  alter table public.attendance_entries disable trigger attendance_entries_set_updated_at;
  update public.attendance_entries set created_at = now() - interval '2 hours', updated_at = now() - interval '2 hours'
   where id = test_id(3, 30);
  alter table public.attendance_entries enable trigger attendance_entries_set_updated_at;
  perform test_assert(test_entry_matches(test_u('a03'), test_id(3, 30), 'present', 0),
    '[9.02] untouched, the matcher confirms the caller''s own values');
  perform test_assert(not test_entry_matches(test_u('a06'), test_id(3, 30), 'present', 0),
    '[9.02b] but not for another user, even with the right values');

  -- Someone else changes it (here the table owner; a supervisor or a correction alike).
  update public.attendance_entries set status = 'absent' where id = test_id(3, 30);
  perform test_assert(not test_entry_matches(test_u('a03'), test_id(3, 30), 'absent', 0),
    '[9.03] after someone else''s change, the matcher does not confirm the new values');
  perform test_assert(not test_entry_matches(test_u('a03'), test_id(3, 30), 'present', 0),
    '[9.04] nor the caller''s old ones');
  perform test_assert(not test_entry_matches(test_u('a06'), test_id(3, 30), 'absent', 0),
    '[9.05] and never for a user who did not record it');
end $$;

rollback;
