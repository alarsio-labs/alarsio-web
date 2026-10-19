-- Attendance & Site Presence, PR 2: attendance_corrections, review_attendance_day,
-- review_attendance_correction and the approved-day lock. Issue #28, ADR-030
-- (D1-D9 in the spec comment on #28).
--
-- Conventions as in attendance_entries_test.sql: test_as / test_as_anon /
-- test_assert, SQLSTATE asserts, 'ok:0' for an UPDATE that RLS filters out. The
-- helpers below switch role themselves and return 'ok', 'ok:<rows>' or the SQLSTATE.
--
-- SQLSTATE table (D9): PS409 a write the approved-day lock refuses; 42501 no
-- permission, and "no such id" for the review functions; 23514 a value rule; 23503 the
-- entry is not there yet; 23505 duplicate; 22023 a blank reason in a review function;
-- 55000 a transition the state does not allow; 28000 not signed in.
--
-- Order of checks inside one INSERT into attendance_entries decides which SQLSTATE a
-- case expects: BEFORE triggers, policy WITH CHECK, constraints and foreign keys, then
-- AFTER triggers. The lock on a late entry is an AFTER trigger, so an unassigned
-- caller is stopped by the policy first.
--
-- Dates are relative to current_date, never literals.
begin;

-- ---------------------------------------------------------------- fixtures
-- Org A: owner a01, project manager a02, supervisors a03 (A1, A3) and a04 (A2),
-- accountant a05 (assigned A1) and a07 (no assignment).
-- Org B: owner b01, supervisor b03 (B1), worker wb.
-- Sites: A1, A2, A3 (archived), B1.

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
  ('20000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a', 'A One',   'Pune',   0,  0,  'active', '00000000-0000-0000-0000-000000000a01'),
  ('20000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a', 'A Two',   'Nagpur', 10, 10, 'active', '00000000-0000-0000-0000-000000000a01'),
  ('20000000-0000-0000-0000-0000000000a3', '10000000-0000-0000-0000-00000000000a', 'A Three', 'Nashik', 0,  0,  'active', '00000000-0000-0000-0000-000000000a01'),
  ('20000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-00000000000b', 'B One',   'Indore', 20, 20, 'active', '00000000-0000-0000-0000-000000000b01');

insert into public.site_assignments (org_id, site_id, user_id, assigned_by) values
  ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000a03', '00000000-0000-0000-0000-000000000a01'),
  ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-000000000a03', '00000000-0000-0000-0000-000000000a01'),
  ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000a04', '00000000-0000-0000-0000-000000000a01'),
  ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000a05', '00000000-0000-0000-0000-000000000a01'),
  ('10000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000b03', '00000000-0000-0000-0000-000000000b01');

-- A moment on a stated day in India: p_days days ago, p_hour o'clock IST.
create function public.test_ist(p_days int, p_hour int) returns timestamptz language sql as $$
  select ((current_date - p_days)::timestamp + make_interval(hours => p_hour)) at time zone 'Asia/Kolkata'
$$;

-- Short names for the fixture ids, so a case reads as "user a03, site a1, day -5".
create function public.test_u(k text)    returns uuid language sql immutable as $$ select ('00000000-0000-0000-0000-000000000' || k)::uuid $$;
create function public.test_site(k text) returns uuid language sql immutable as $$ select ('20000000-0000-0000-0000-0000000000' || k)::uuid $$;
create function public.test_w(k text)    returns uuid language sql immutable as $$ select ('77000000-0000-0000-0000-0000000000' || k)::uuid $$;
create function public.test_org(k text)  returns uuid language sql immutable as $$ select ('10000000-0000-0000-0000-00000000000' || k)::uuid $$;
create function public.test_c(n int)     returns uuid language sql immutable as $$ select ('60000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid $$;

-- Workers (org A unless noted), all rostered since day -30 with no end:
--   01 Ravi, 02 Sita, 03 Arun, 06 Late at A1 (no entry anywhere: for late inserts and
--   for "the entry is not there");  04 Latha at A2;  05 Inder at A3;  b1 Bela, org B.
insert into public.workers (id, org_id, code, full_name, trade, pay_type, created_by) values
  (public.test_w('01'), public.test_org('a'), 'W-001', 'Ravi',  'mason',  'daily', public.test_u('a01')),
  (public.test_w('02'), public.test_org('a'), 'W-002', 'Sita',  'helper', 'daily', public.test_u('a01')),
  (public.test_w('03'), public.test_org('a'), 'W-003', 'Arun',  'helper', 'daily', public.test_u('a01')),
  (public.test_w('04'), public.test_org('a'), 'W-004', 'Latha', 'helper', 'daily', public.test_u('a01')),
  (public.test_w('05'), public.test_org('a'), 'W-005', 'Inder', 'helper', 'daily', public.test_u('a01')),
  (public.test_w('06'), public.test_org('a'), 'W-006', 'Late',  'helper', 'daily', public.test_u('a01')),
  (public.test_w('b1'), public.test_org('b'), 'W-001', 'Bela',  'mason',  'daily', public.test_u('b01'));

insert into public.worker_site_assignments (org_id, worker_id, site_id, assigned_by, assigned_at) values
  (public.test_org('a'), public.test_w('01'), public.test_site('a1'), public.test_u('a01'), public.test_ist(30, 9)),
  (public.test_org('a'), public.test_w('02'), public.test_site('a1'), public.test_u('a01'), public.test_ist(30, 9)),
  (public.test_org('a'), public.test_w('03'), public.test_site('a1'), public.test_u('a01'), public.test_ist(30, 9)),
  (public.test_org('a'), public.test_w('06'), public.test_site('a1'), public.test_u('a01'), public.test_ist(30, 9)),
  (public.test_org('a'), public.test_w('04'), public.test_site('a2'), public.test_u('a01'), public.test_ist(30, 9)),
  (public.test_org('a'), public.test_w('05'), public.test_site('a3'), public.test_u('a01'), public.test_ist(30, 9)),
  (public.test_org('b'), public.test_w('b1'), public.test_site('b1'), public.test_u('b01'), public.test_ist(30, 9));

-- Days, written by the superuser (the triggers still run).
--   A1: -5 approved, -6 open, -7 rejected, -8 approved, -9 .. -15 open.
--   A2: -5 approved.   A3 (archived): -5 approved, -6 open.   B1: -5 approved, -6 open.
insert into public.attendance_days (org_id, site_id, attendance_date, recorded_by)
select public.test_org('a'), public.test_site('a1'), current_date - d, public.test_u('a03')
  from generate_series(5, 15) as d;
insert into public.attendance_days (org_id, site_id, attendance_date, recorded_by) values
  (public.test_org('a'), public.test_site('a2'), current_date - 5, public.test_u('a04')),
  (public.test_org('a'), public.test_site('a3'), current_date - 5, public.test_u('a03')),
  (public.test_org('a'), public.test_site('a3'), current_date - 6, public.test_u('a03')),
  (public.test_org('b'), public.test_site('b1'), current_date - 5, public.test_u('b03')),
  (public.test_org('b'), public.test_site('b1'), current_date - 6, public.test_u('b03'));

-- Entries (before any day is approved): at A1, Ravi present, Sita present with 2 h
-- overtime, Arun absent, on every A1 day; one worker on each other site's days.
insert into public.attendance_entries (org_id, site_id, attendance_date, worker_id, status, overtime_hours, recorded_by)
select public.test_org('a'), public.test_site('a1'), current_date - d, w.id, w.st, w.ot, public.test_u('a03')
  from generate_series(5, 15) as d,
       (values (public.test_w('01'), 'present', 0), (public.test_w('02'), 'present', 2),
               (public.test_w('03'), 'absent', 0)) as w (id, st, ot);
insert into public.attendance_entries (org_id, site_id, attendance_date, worker_id, status, overtime_hours, recorded_by) values
  (public.test_org('a'), public.test_site('a2'), current_date - 5, public.test_w('04'), 'present', 0, public.test_u('a04')),
  (public.test_org('a'), public.test_site('a3'), current_date - 5, public.test_w('05'), 'present', 0, public.test_u('a03')),
  (public.test_org('a'), public.test_site('a3'), current_date - 6, public.test_w('05'), 'present', 0, public.test_u('a03')),
  (public.test_org('b'), public.test_site('b1'), current_date - 5, public.test_w('b1'), 'present', 0, public.test_u('b03')),
  (public.test_org('b'), public.test_site('b1'), current_date - 6, public.test_w('b1'), 'present', 0, public.test_u('b03'));

-- A3 is archived directly: its assignments stay open, so has_site_access is still
-- true for a03 while can_record_on_site is false.
update public.sites
   set status = 'archived', archived_at = now(), archived_by = public.test_u('a01')
 where id = public.test_site('a3');

-- Fixture states, set by the superuser so the fixtures do not depend on the review
-- function under test.
create function public.test_force_review(p_day uuid, p_status text, p_by uuid, p_reason text default null)
returns void language sql as $$
  update public.attendance_days
     set status = p_status, reviewed_by = p_by, reviewed_at = now(), review_reason = p_reason
   where id = p_day;
$$;

select public.test_force_review(d.id, 'approved', public.test_u('a02'))
  from public.attendance_days d
 where (d.site_id = public.test_site('a1') and d.attendance_date in (current_date - 5, current_date - 8))
    or (d.site_id in (public.test_site('a2'), public.test_site('a3')) and d.attendance_date = current_date - 5);
select public.test_force_review(d.id, 'approved', public.test_u('b01'))
  from public.attendance_days d
 where d.site_id = public.test_site('b1') and d.attendance_date = current_date - 5;
select public.test_force_review(d.id, 'rejected', public.test_u('a02'), 'Recount headcount')
  from public.attendance_days d
 where d.site_id = public.test_site('a1') and d.attendance_date = current_date - 7;

-- ----------------------------------------------------------------- helpers
create function public.test_day(p_site text, p_n int) returns uuid language sql as $$
  select id from public.attendance_days where site_id = public.test_site(p_site) and attendance_date = current_date - p_n
$$;
create function public.test_entry(p_site text, p_n int, p_worker text) returns uuid language sql as $$
  select id from public.attendance_entries
   where site_id = public.test_site(p_site) and attendance_date = current_date - p_n and worker_id = public.test_w(p_worker)
$$;
-- "status|overtime|note" of an entry, read as the superuser.
create function public.test_ent(p_site text, p_n int, p_worker text) returns text language sql as $$
  select status || '|' || overtime_hours || '|' || coalesce(note, '-') from public.attendance_entries
   where site_id = public.test_site(p_site) and attendance_date = current_date - p_n and worker_id = public.test_w(p_worker)
$$;
create function public.test_day_status(p_site text, p_n int) returns text language sql as $$
  select status from public.attendance_days where site_id = public.test_site(p_site) and attendance_date = current_date - p_n
$$;
create function public.test_corr_status(p_n int) returns text language plpgsql as $$
declare s text;
begin
  select review_status into s from public.attendance_corrections where id = public.test_c(p_n);
  return s;
end $$;

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

-- The same, as the table owner (a writer that bypasses RLS).
create function public.test_su(p_sql text) returns text language plpgsql as $$
declare s text; n int;
begin
  begin
    execute p_sql;
    get diagnostics n = row_count;
  exception when others then s := sqlstate; end;
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

-- Edit an entry as p_user. Returns 'ok:<rows touched>' or the SQLSTATE raised.
create function public.test_edit_entry(p_user uuid, p_id uuid, p_status text, p_ot numeric, p_note text)
returns text language sql as $$
  select public.test_try(p_user, format(
    'update public.attendance_entries set status = %L, overtime_hours = %s, note = %L where id = %L',
    p_status, p_ot, p_note, p_id));
$$;

-- Add an entry as p_user. Returns 'ok:1' or the SQLSTATE raised.
create function public.test_add_entry(p_user uuid, p_site text, p_n int, p_worker text, p_org uuid default public.test_org('a'))
returns text language sql as $$
  select public.test_try(p_user, format(
    'insert into public.attendance_entries (id, org_id, site_id, attendance_date, worker_id, status, overtime_hours) values (gen_random_uuid(), %L, %L, current_date - %s, %L, ''present'', 0)',
    p_org, public.test_site(p_site), p_n, public.test_w(p_worker)));
$$;

-- Propose a correction as p_user ('anon' when null). Returns 'ok:1' or the SQLSTATE.
create function public.test_propose(
  p_user uuid, p_id uuid, p_site text, p_n int, p_worker text,
  p_status text, p_ot numeric, p_note text, p_reason text,
  p_org uuid default public.test_org('a')
) returns text language sql as $$
  select public.test_try(p_user, format(
    'insert into public.attendance_corrections (id, org_id, site_id, attendance_date, worker_id, new_status, new_overtime_hours, new_note, reason) values (%L, %L, %L, current_date - %s, %L, %L, %s, %L, %L)',
    p_id, p_org, public.test_site(p_site), p_n, public.test_w(p_worker), p_status, p_ot, p_note, p_reason));
$$;

create function public.test_review_day(p_user uuid, p_day uuid, p_approve boolean, p_reason text default null)
returns text language sql as $$
  select public.test_try(p_user, format('select public.review_attendance_day(%L, %L, %L)', p_day, p_approve, p_reason));
$$;
create function public.test_review_corr(p_user uuid, p_id uuid, p_approve boolean, p_reason text default null)
returns text language sql as $$
  select public.test_try(p_user, format('select public.review_attendance_correction(%L, %L, %L)', p_id, p_approve, p_reason));
$$;

-- ============================================================ 1. approved-day lock
-- What a supervisor's plain write does on an approved day (AC 19-23). Section 6
-- covers the lock against corrections.

do $$
declare r text;
begin
  -- A1 -5 is approved: the update policy no longer matches, so 0 rows and no error.
  r := test_edit_entry(test_u('a03'), test_entry('a1', 5, '01'), 'absent', 0, null);
  perform test_assert(r = 'ok:0', '[1.01] a plain UPDATE of an approved day''s entry changes 0 rows, got ' || r);
  perform test_assert(test_ent('a1', 5, '01') = 'present|0.00|-', '[1.02] the approved entry is unchanged');

  -- Open and rejected days stay editable (D4): the lock is on approved only.
  r := test_edit_entry(test_u('a03'), test_entry('a1', 6, '01'), 'absent', 0, null);
  perform test_assert(r = 'ok:1', '[1.03] an open day''s entry is editable, got ' || r);
  r := test_edit_entry(test_u('a03'), test_entry('a1', 7, '01'), 'half_day', 0, 'sent back');
  perform test_assert(r = 'ok:1', '[1.04] a rejected day''s entry is editable (D4), got ' || r);

  -- A late INSERT onto an approved day raises PS409 and leaves no row.
  r := test_add_entry(test_u('a03'), 'a1', 5, '06');
  perform test_assert(r = 'PS409', '[1.05] a late entry on an approved day raises PS409, got ' || r);
  perform test_assert(not exists (select 1 from attendance_entries
                                   where site_id = test_site('a1') and attendance_date = current_date - 5
                                     and worker_id = test_w('06')),
    '[1.06] the refused late entry left no row');
  -- The policy answers before the lock: an outsider is not told the day is approved.
  r := test_add_entry(test_u('a04'), 'a1', 5, '06');
  perform test_assert(r = '42501', '[1.07] an unassigned supervisor gets 42501, not PS409, got ' || r);
  r := test_add_entry(test_u('a03'), 'a1', 5, 'b1', test_org('a'));
  perform test_assert(r = '23503', '[1.08] another organisation''s worker is stopped by the foreign key (23503), got ' || r);
  -- Positive controls: open and rejected days take a late entry.
  r := test_add_entry(test_u('a03'), 'a1', 6, '06');
  perform test_assert(r = 'ok:1', '[1.09] a late entry on an open day is accepted, got ' || r);
  r := test_add_entry(test_u('a03'), 'a1', 7, '06');
  perform test_assert(r = 'ok:1', '[1.10] a late entry on a rejected day is accepted, got ' || r);

  -- Owner and project manager hold no write path on any day.
  r := test_add_entry(test_u('a01'), 'a1', 9, '06');
  perform test_assert(r = '42501', '[1.11] owner cannot add an entry, got ' || r);
  r := test_edit_entry(test_u('a02'), test_entry('a1', 9, '01'), 'absent', 0, null);
  perform test_assert(r = 'ok:0', '[1.12] project manager''s UPDATE of an open day''s entry changes 0 rows, got ' || r);

  -- A writer that bypasses RLS still reaches the trigger: PS409.
  r := test_su(format('update public.attendance_entries set note = ''x'' where id = %L', test_entry('a1', 5, '01')));
  perform test_assert(r = 'PS409', '[1.13] the table owner''s UPDATE of an approved day''s entry raises PS409, got ' || r);
  r := test_su(format('update public.attendance_entries set note = ''x'' where id = %L', test_entry('a1', 6, '01')));
  perform test_assert(r = 'ok:1', '[1.14] the same UPDATE on an open day is allowed, got ' || r);

  -- The day row itself: clients have no grant, an approved row is frozen.
  r := test_try(test_u('a03'), format('update public.attendance_days set status = ''open'' where id = %L', test_day('a1', 5)));
  perform test_assert(r = '42501', '[1.15] a supervisor cannot update a day, got ' || r);
  r := test_su(format('update public.attendance_days set review_reason = ''x'' where id = %L', test_day('a1', 5)));
  perform test_assert(r = 'PS409', '[1.16] an UPDATE of an approved day row raises PS409, got ' || r);
  r := test_su(format('update public.attendance_days set status = ''open'', reviewed_by = null, reviewed_at = null where id = %L', test_day('a1', 7)));
  perform test_assert(r = '55000', '[1.17] a rejected day cannot go back to open, got ' || r);

  -- Reads are never blocked by the lock.
  perform test_assert(test_count(test_u('a03'), 'select 1 from public.attendance_entries where attendance_date = current_date - 5 and site_id = ''' || test_site('a1') || '''') = '3',
    '[1.18] the lock does not hide an approved day''s entries from its supervisor');
end $$;

-- ============================================================= 2. corrections: shape

do $$
declare n int; f text;
begin
  perform test_assert((select relrowsecurity from pg_class where oid = 'public.attendance_corrections'::regclass),
    '[2.01] attendance_corrections has RLS enabled');
  perform test_assert(not has_table_privilege('anon', 'public.attendance_corrections', 'select')
                      and not has_table_privilege('anon', 'public.attendance_corrections', 'insert')
                      and not has_table_privilege('anon', 'public.attendance_corrections', 'update')
                      and not has_table_privilege('anon', 'public.attendance_corrections', 'delete'),
    '[2.02] anon holds no privilege on attendance_corrections');
  perform test_assert(has_table_privilege('authenticated', 'public.attendance_corrections', 'select')
                      and not has_table_privilege('authenticated', 'public.attendance_corrections', 'delete')
                      and not has_table_privilege('authenticated', 'public.attendance_corrections', 'truncate')
                      and not has_any_column_privilege('authenticated', 'public.attendance_corrections', 'update'),
    '[2.03] authenticated can select, and cannot update, delete or truncate');

  foreach f in array array['id', 'org_id', 'site_id', 'attendance_date', 'worker_id',
                           'new_status', 'new_overtime_hours', 'new_note', 'reason'] loop
    perform test_assert(has_column_privilege('authenticated', 'public.attendance_corrections', f, 'insert'),
      '[2.04] a client can insert ' || f);
  end loop;
  foreach f in array array['old_status', 'old_overtime_hours', 'old_note', 'proposed_by', 'created_at',
                           'review_status', 'reviewed_by', 'reviewed_at', 'review_reason'] loop
    perform test_assert(not has_column_privilege('authenticated', 'public.attendance_corrections', f, 'insert'),
      '[2.05] a client cannot insert ' || f);
  end loop;

  -- The correction is found by natural key, not by an entry id (D5 of ADR-021).
  perform test_assert(not exists (select 1 from information_schema.columns
                                   where table_schema = 'public' and table_name = 'attendance_corrections'
                                     and column_name = 'entry_id'),
    '[2.06] a correction has no entry_id column');

  -- write_audit(): AFTER INSERT OR UPDATE OR DELETE FOR EACH ROW (tgtype 29), enabled,
  -- and the only write_audit trigger on the table.
  select count(*) into n from pg_trigger
   where tgrelid = 'public.attendance_corrections'::regclass and tgname = 'attendance_corrections_audit'
     and tgtype = 29 and tgenabled = 'O' and tgfoid = 'public.write_audit()'::regprocedure;
  perform test_assert(n = 1, '[2.07] attendance_corrections_audit is AFTER INSERT OR UPDATE OR DELETE FOR EACH ROW, enabled');
  select count(*) into n from pg_trigger
   where tgrelid = 'public.attendance_corrections'::regclass and tgfoid = 'public.write_audit()'::regprocedure;
  perform test_assert(n = 1, '[2.08] it is the only write_audit trigger on attendance_corrections, found ' || n);

  -- The two review functions: definer, pinned search_path, closed to public and anon.
  foreach f in array array['public.review_attendance_day(uuid,boolean,text)',
                           'public.review_attendance_correction(uuid,boolean,text)'] loop
    perform test_assert((select prosecdef from pg_proc where oid = f::regprocedure), '[2.09] ' || f || ' is SECURITY DEFINER');
    perform test_assert((select 'search_path=public' = any (proconfig) from pg_proc where oid = f::regprocedure),
      '[2.10] ' || f || ' pins search_path = public');
    perform test_assert(not has_function_privilege('anon', f, 'execute')
                        and not has_function_privilege('public', f, 'execute')
                        and has_function_privilege('authenticated', f, 'execute'),
      '[2.11] ' || f || ' is revoked from public and anon, executable by authenticated');
  end loop;
end $$;

-- ================================================ 3. corrections: proposing one
-- Approved days at A1: -5 and -8. Entries there: Ravi present 0, Sita present 2 h,
-- Arun absent 0.

do $$
declare r text; c record; w bigint; n int;
begin
  -- A supervisor's correction keeps the old value, the new value and the reason.
  r := test_propose(test_u('a03'), test_c(1), 'a1', 5, '01', 'half_day', 8, 'left early', 'Supervisor mis-marked');
  perform test_assert(r = 'ok:1', '[3.01] the assigned supervisor proposes a correction on an approved day, got ' || r);
  select * into c from attendance_corrections where id = test_c(1);
  perform test_assert(c.old_status = 'present' and c.old_overtime_hours = 0 and c.old_note is null,
    '[3.02] the old values are copied from the entry: ' || c.old_status || '/' || c.old_overtime_hours);
  perform test_assert(c.new_status = 'half_day' and c.new_overtime_hours = 8 and c.new_note = 'left early'
                      and c.reason = 'Supervisor mis-marked',
    '[3.03] the new values and the reason are stored');
  perform test_assert(c.proposed_by = test_u('a03') and c.review_status = 'pending'
                      and c.reviewed_by is null and c.reviewed_at is null and c.review_reason is null,
    '[3.04] proposed_by is the caller and the correction is pending, unreviewed');
  perform test_assert(test_ent('a1', 5, '01') = 'present|0.00|-', '[3.05] proposing a correction does not change the entry');

  -- The phone cannot choose the old value, the proposer or the review.
  r := test_try(test_u('a03'), format(
    'insert into public.attendance_corrections (id, org_id, site_id, attendance_date, worker_id, new_status, new_overtime_hours, reason, old_status) values (%L, %L, %L, current_date - 5, %L, ''absent'', 0, ''r'', ''absent'')',
    test_c(90), test_org('a'), test_site('a1'), test_w('03')));
  perform test_assert(r = '42501', '[3.06] a client cannot set old_status, got ' || r);
  r := test_try(test_u('a03'), format(
    'insert into public.attendance_corrections (id, org_id, site_id, attendance_date, worker_id, new_status, new_overtime_hours, reason, review_status) values (%L, %L, %L, current_date - 5, %L, ''present'', 0, ''r'', ''approved'')',
    test_c(91), test_org('a'), test_site('a1'), test_w('03')));
  perform test_assert(r = '42501', '[3.07] a client cannot set review_status, got ' || r);

  -- Reason: mandatory, trimmed, 1-500 characters (Sita has no pending correction yet).
  r := test_propose(test_u('a03'), test_c(92), 'a1', 5, '02', 'present', 3, null, null);
  perform test_assert(r = '23514' or r = '23502', '[3.08] a null reason is refused, got ' || r);
  r := test_propose(test_u('a03'), test_c(93), 'a1', 5, '02', 'present', 3, null, '');
  perform test_assert(r = '23514', '[3.09] an empty reason is refused (23514), got ' || r);
  r := test_propose(test_u('a03'), test_c(94), 'a1', 5, '02', 'present', 3, null, '   ');
  perform test_assert(r = '23514', '[3.10] a spaces-only reason is refused (23514), got ' || r);
  r := test_propose(test_u('a03'), test_c(95), 'a1', 5, '02', 'present', 3, null, ' padded ');
  perform test_assert(r = '23514', '[3.11] an untrimmed reason is refused (23514), got ' || r);
  r := test_propose(test_u('a03'), test_c(96), 'a1', 5, '02', 'present', 3, null, repeat('x', 501));
  perform test_assert(r = '23514', '[3.12] a 501-character reason is refused (23514), got ' || r);

  -- A correction must change something.
  r := test_propose(test_u('a03'), test_c(97), 'a1', 5, '02', 'present', 2, null, 'no change');
  perform test_assert(r = '23514', '[3.13] a correction equal to the current values is refused (23514), got ' || r);

  -- New values obey the entry rules.
  r := test_propose(test_u('a03'), test_c(98), 'a1', 5, '02', 'sick', 0, null, 'r');
  perform test_assert(r = '23514', '[3.14] an unknown status is refused, got ' || r);
  r := test_propose(test_u('a03'), test_c(98), 'a1', 5, '02', 'present', -0.01, null, 'r');
  perform test_assert(r = '23514', '[3.15] overtime -0.01 is refused, got ' || r);
  r := test_propose(test_u('a03'), test_c(98), 'a1', 5, '02', 'present', 8.01, null, 'r');
  perform test_assert(r = '23514', '[3.16] overtime 8.01 is refused, got ' || r);
  r := test_propose(test_u('a03'), test_c(98), 'a1', 5, '02', 'absent', 1, null, 'r');
  perform test_assert(r = '23514', '[3.17] overtime on absent is refused, got ' || r);
  r := test_propose(test_u('a03'), test_c(98), 'a1', 5, '02', 'leave', 1, null, 'r');
  perform test_assert(r = '23514', '[3.18] overtime on leave is refused, got ' || r);
  r := test_propose(test_u('a03'), test_c(98), 'a1', 5, '02', 'present', 2, '', 'r');
  perform test_assert(r = '23514', '[3.19] a blank note is refused, got ' || r);
  r := test_propose(test_u('a03'), test_c(98), 'a1', 5, '02', 'present', 2, repeat('n', 501), 'r');
  perform test_assert(r = '23514', '[3.20] a 501-character note is refused, got ' || r);
  r := test_propose(test_u('a03'), test_c(98), 'a1', 5, '02', 'present', 2, ' x ', 'r');
  perform test_assert(r = '23514', '[3.21] an untrimmed note is refused, got ' || r);

  -- D3 (a): a correction is for an approved day only. 55000, and nothing is written.
  select coalesce(max(id), 0) into w from audit_log;
  r := test_propose(test_u('a03'), test_c(99), 'a1', 6, '01', 'present', 1, null, 'r');
  perform test_assert(r = '55000', '[3.23] a correction on an open day is refused (55000), got ' || r);
  r := test_propose(test_u('a03'), test_c(99), 'a1', 7, '01', 'present', 1, null, 'r');
  perform test_assert(r = '55000', '[3.24] a correction on a rejected day is refused (55000), got ' || r);
  perform test_assert(not exists (select 1 from attendance_corrections where id = test_c(99)),
    '[3.25] a refused correction leaves no row');
  perform test_assert((select count(*) from audit_log where id > w) = 0, '[3.26] a refused correction leaves no audit row');

  -- Role x insert, on an approved day's entry (Sita, A1 -5), values that are valid.
  r := test_propose(test_u('a01'), test_c(80), 'a1', 5, '02', 'absent', 0, null, 'r');
  perform test_assert(r = '42501', '[3.27] owner cannot propose, got ' || r);
  r := test_propose(test_u('a02'), test_c(80), 'a1', 5, '02', 'absent', 0, null, 'r');
  perform test_assert(r = '42501', '[3.28] project manager cannot propose, got ' || r);
  r := test_propose(test_u('a04'), test_c(80), 'a1', 5, '02', 'absent', 0, null, 'r');
  perform test_assert(r = '42501', '[3.29] a supervisor of another site cannot propose, got ' || r);
  r := test_propose(test_u('a05'), test_c(80), 'a1', 5, '02', 'absent', 0, null, 'r');
  perform test_assert(r = '42501', '[3.30] an accountant cannot propose, got ' || r);
  r := test_propose(test_u('a07'), test_c(80), 'a1', 5, '02', 'absent', 0, null, 'r');
  perform test_assert(r = '42501', '[3.31] an accountant with no assignment cannot propose, got ' || r);
  r := test_propose(test_u('b03'), test_c(80), 'a1', 5, '02', 'absent', 0, null, 'r');
  perform test_assert(r = '42501', '[3.32] another organisation''s supervisor cannot propose, got ' || r);
  r := test_propose(test_u('b01'), test_c(80), 'a1', 5, '02', 'absent', 0, null, 'r');
  perform test_assert(r = '42501', '[3.33] another organisation''s owner cannot propose, got ' || r);
  r := test_propose(null, test_c(80), 'a1', 5, '02', 'absent', 0, null, 'r');
  perform test_assert(r = '42501', '[3.34] anon cannot propose, got ' || r);
  r := test_propose(test_u('a03'), test_c(80), 'a3', 5, '05', 'absent', 0, null, 'r');
  perform test_assert(r = '42501', '[3.35] a supervisor of an archived site cannot propose, got ' || r);
  r := test_propose(test_u('a03'), test_c(2), 'a1', 5, '02', 'absent', 0, null, 'Sita was on leave');
  perform test_assert(r = 'ok:1', '[3.36] the assigned supervisor can, got ' || r);

  -- The entry is not there yet (a legitimate caller): 23503, which the phone retries.
  r := test_propose(test_u('a03'), test_c(80), 'a1', 5, '06', 'absent', 0, null, 'r');
  perform test_assert(r = '23503', '[3.37] a correction for an entry that does not exist is 23503, got ' || r);

  -- Cross-organisation id swaps.
  r := test_propose(test_u('a03'), test_c(80), 'b1', 5, 'b1', 'absent', 0, null, 'r', test_org('b'));
  perform test_assert(r = '42501', '[3.38] another organisation''s site_id is refused (42501), got ' || r);
  r := test_propose(test_u('a03'), test_c(80), 'a1', 5, '03', 'present', 0, null, 'r', test_org('b'));
  perform test_assert(r = '23503', '[3.39] an org_id that does not match the site is refused (23503), got ' || r);
  r := test_propose(test_u('a03'), test_c(80), 'a1', 5, 'b1', 'absent', 0, null, 'r');
  perform test_assert(r = '23503', '[3.40] another organisation''s worker has no entry here (23503), got ' || r);

  -- D6: one pending correction per entry; the same id twice; free again once decided.
  r := test_propose(test_u('a03'), test_c(81), 'a1', 5, '01', 'absent', 0, null, 'second try');
  perform test_assert(r = '23505', '[3.41] a second pending correction for the entry is refused (23505), got ' || r);
  r := test_propose(test_u('a03'), test_c(1), 'a1', 5, '03', 'present', 0, null, 'same id');
  perform test_assert(r = '23505', '[3.42] the same id twice is a duplicate (23505), got ' || r);

  -- Visibility follows has_site_access.
  perform test_assert(test_count(test_u('a01'), 'select 1 from public.attendance_corrections') = '2', '[3.43] the owner reads the organisation''s corrections');
  perform test_assert(test_count(test_u('a02'), 'select 1 from public.attendance_corrections') = '2', '[3.44] the project manager reads them');
  perform test_assert(test_count(test_u('a03'), 'select 1 from public.attendance_corrections') = '2', '[3.45] the assigned supervisor reads them');
  perform test_assert(test_count(test_u('a05'), 'select 1 from public.attendance_corrections') = '2', '[3.46] an accountant with an assignment reads them');
  perform test_assert(test_count(test_u('a04'), 'select 1 from public.attendance_corrections') = '0', '[3.47] a supervisor of another site sees none');
  perform test_assert(test_count(test_u('a07'), 'select 1 from public.attendance_corrections') = '0', '[3.48] an accountant with no assignment sees none');
  perform test_assert(test_count(test_u('b01'), 'select 1 from public.attendance_corrections') = '0', '[3.49] another organisation sees none');
  perform test_assert(test_count(null, 'select 1 from public.attendance_corrections') = '42501', '[3.50] anon cannot read');

  -- Update and delete: refused for every client; and append-only even for the owner.
  r := test_try(test_u('a03'), format('update public.attendance_corrections set reason = ''edited'' where id = %L', test_c(1)));
  perform test_assert(r = '42501', '[3.51] a supervisor cannot update a correction, got ' || r);
  r := test_try(test_u('a01'), format('update public.attendance_corrections set review_status = ''approved'' where id = %L', test_c(1)));
  perform test_assert(r = '42501', '[3.52] an owner cannot update a correction directly, got ' || r);
  r := test_try(test_u('a02'), format('delete from public.attendance_corrections where id = %L', test_c(1)));
  perform test_assert(r = '42501', '[3.53] a project manager cannot delete a correction, got ' || r);
  r := test_try(test_u('a03'), 'truncate public.attendance_corrections');
  perform test_assert(r = '42501', '[3.54] a supervisor cannot truncate corrections, got ' || r);
  r := test_su(format('update public.attendance_corrections set reason = ''edited'' where id = %L', test_c(1)));
  perform test_assert(r = '55000', '[3.55] the table owner cannot edit a correction''s reason (55000), got ' || r);
  r := test_su(format('update public.attendance_corrections set new_status = ''absent'' where id = %L', test_c(1)));
  perform test_assert(r = '55000', '[3.56] the table owner cannot edit a correction''s new values (55000), got ' || r);
  r := test_su(format('update public.attendance_corrections set old_status = ''absent'' where id = %L', test_c(1)));
  perform test_assert(r = '55000', '[3.57] the table owner cannot rewrite the old value (55000), got ' || r);
  r := test_su(format('delete from public.attendance_corrections where id = %L', test_c(1)));
  perform test_assert(r = '55000', '[3.58] the table owner cannot delete a correction (55000), got ' || r);
  perform test_assert(test_corr_status(1) = 'pending', '[3.59] after all that the correction is still pending');
end $$;

-- ============================================================ 4. reviewing a day
-- Open days at A1: -9 .. -15. Fresh ones are used per case so a refusal can be
-- checked against an unchanged day.

do $$
declare r text; d record; u uuid;
begin
  -- Approve (an optional note is allowed).
  r := test_review_day(test_u('a02'), test_day('a1', 9), true);
  perform test_assert(r = 'ok:1', '[4.01] a project manager approves an open day, got ' || r);
  select * into d from attendance_days where id = test_day('a1', 9);
  perform test_assert(d.status = 'approved' and d.reviewed_by = test_u('a02') and d.reviewed_at is not null
                      and d.review_reason is null,
    '[4.02] the day is approved, stamped with the reviewer and the time, no note');
  -- Approving again is a no-op that keeps the first reviewer; rejecting is refused.
  r := test_review_day(test_u('a01'), test_day('a1', 9), true);
  perform test_assert(r = 'ok:1', '[4.03] approving an approved day succeeds as a no-op, got ' || r);
  perform test_assert((select reviewed_by from attendance_days where id = test_day('a1', 9)) = test_u('a02')
                      and (select reviewed_at from attendance_days where id = test_day('a1', 9)) = d.reviewed_at,
    '[4.04] the first reviewer and time are kept');
  r := test_review_day(test_u('a01'), test_day('a1', 9), false, 'changed my mind');
  perform test_assert(r = '55000', '[4.05] an approved day cannot be rejected (55000), got ' || r);
  perform test_assert(test_day_status('a1', 9) = 'approved', '[4.06] it is still approved');

  -- Reject needs a reason.
  r := test_review_day(test_u('a01'), test_day('a1', 10), false, null);
  perform test_assert(r = '22023', '[4.07] a rejection with no reason is refused (22023), got ' || r);
  r := test_review_day(test_u('a01'), test_day('a1', 10), false, '');
  perform test_assert(r = '22023', '[4.08] an empty reason is refused, got ' || r);
  r := test_review_day(test_u('a01'), test_day('a1', 10), false, '   ');
  perform test_assert(r = '22023', '[4.09] a spaces-only reason is refused, got ' || r);
  r := test_review_day(test_u('a01'), test_day('a1', 10), false, repeat('x', 501));
  perform test_assert(r = '22023', '[4.10] a 501-character reason is refused, got ' || r);
  perform test_assert(test_day_status('a1', 10) = 'open'
                      and (select reviewed_by from attendance_days where id = test_day('a1', 10)) is null,
    '[4.11] a refused rejection leaves the day open and unstamped');
  r := test_review_day(test_u('a01'), test_day('a1', 10), false, '  Headcount wrong  ');
  perform test_assert(r = 'ok:1', '[4.12] an owner rejects with a reason, got ' || r);
  select * into d from attendance_days where id = test_day('a1', 10);
  perform test_assert(d.status = 'rejected' and d.reviewed_by = test_u('a01') and d.reviewed_at is not null
                      and d.review_reason = 'Headcount wrong',
    '[4.13] the day is rejected, stamped, with the trimmed reason');

  -- D4: the supervisor edits a rejected day, and a reviewer decides again.
  r := test_edit_entry(test_u('a03'), test_entry('a1', 10, '01'), 'half_day', 0, 'fixed');
  perform test_assert(r = 'ok:1', '[4.14] the supervisor fixes the rejected day, got ' || r);
  r := test_review_day(test_u('a02'), test_day('a1', 10), false, 'Still wrong');
  perform test_assert(r = 'ok:1', '[4.15] a rejected day can be rejected again, got ' || r);
  perform test_assert((select reviewed_by from attendance_days where id = test_day('a1', 10)) = test_u('a02')
                      and (select review_reason from attendance_days where id = test_day('a1', 10)) = 'Still wrong',
    '[4.16] a second rejection restamps the day');
  r := test_review_day(test_u('a01'), test_day('a1', 10), true);
  perform test_assert(r = 'ok:1', '[4.17] a rejected day can then be approved, got ' || r);
  perform test_assert(test_day_status('a1', 10) = 'approved'
                      and (select review_reason from attendance_days where id = test_day('a1', 10)) is null,
    '[4.18] it is approved and the rejection reason no longer stands');
  -- Approval is the only way in: the lock is back.
  r := test_edit_entry(test_u('a03'), test_entry('a1', 10, '01'), 'present', 0, null);
  perform test_assert(r = 'ok:0', '[4.19] after approval the supervisor''s edit changes 0 rows, got ' || r);

  -- An approval note is optional, trimmed and capped.
  r := test_review_day(test_u('a02'), test_day('a1', 13), true, repeat('x', 501));
  perform test_assert(r = '22023', '[4.20] a 501-character approval note is refused, got ' || r);
  perform test_assert(test_day_status('a1', 13) = 'open', '[4.21] the day stays open');
  r := test_review_day(test_u('a02'), test_day('a1', 13), true, '  fine  ');
  perform test_assert(r = 'ok:1' and (select review_reason from attendance_days where id = test_day('a1', 13)) = 'fine',
    '[4.22] an approval note is stored trimmed, got ' || r);

  -- Who may review: can_review_site only. The day stays open every time.
  u := test_day('a1', 12);
  perform test_assert(test_review_day(test_u('a03'), u, true) = '42501', '[4.23] the assigned supervisor cannot review');
  perform test_assert(test_review_day(test_u('a04'), u, true) = '42501', '[4.24] a supervisor of another site cannot review');
  perform test_assert(test_review_day(test_u('a05'), u, true) = '42501', '[4.25] an accountant cannot review');
  perform test_assert(test_review_day(test_u('a07'), u, true) = '42501', '[4.26] an accountant with no assignment cannot review');
  perform test_assert(test_review_day(test_u('b01'), u, true) = '42501', '[4.27] another organisation''s owner cannot review');
  perform test_assert(test_review_day(test_u('b03'), u, false, 'no') = '42501', '[4.28] another organisation''s supervisor cannot review');
  perform test_assert(test_review_day(null, u, true) = '42501', '[4.29] anon has no execute privilege');
  perform test_assert(test_review_day(test_u('a01'), gen_random_uuid(), true) = '42501', '[4.30] an unknown day id is 42501, same as a forbidden one');
  perform test_assert(test_try(test_u('a01'), 'select public.review_attendance_day(null, true, null)') = '42501', '[4.31] a null day id is 42501');
  r := test_try(null, format('select public.review_attendance_day(%L, true, null)', u));
  perform test_assert(r = '42501', '[4.32] anon is refused, got ' || r);
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role authenticated';
  begin
    perform public.review_attendance_day(u, true, null);
    r := 'ok';
  exception when others then r := sqlstate; end;
  execute 'reset role';
  perform test_assert(r = '28000', '[4.34] a signed-in role with no user id gets 28000, got ' || r);
  perform test_assert(test_day_status('a1', 12) = 'open'
                      and (select reviewed_by from attendance_days where id = u) is null,
    '[4.35] every refused review left the day open and unstamped');

  -- Another organisation's day, and an archived site (reviewable).
  select x.id into u from attendance_days x where x.site_id = test_site('b1') and x.attendance_date = current_date - 6;
  perform test_assert(test_review_day(test_u('a01'), u, true) = '42501', '[4.36] org A''s owner cannot review org B''s day');
  perform test_assert(test_day_status('b1', 6) = 'open', '[4.37] org B''s day is untouched');
  perform test_assert(test_review_day(test_u('b01'), u, true) = 'ok:1', '[4.38] org B''s owner can');
  perform test_assert(test_review_day(test_u('a01'), test_day('a3', 6), true) = 'ok:1', '[4.39] an archived site''s day is still reviewable');
end $$;

-- ===================================================== 5. reviewing a correction
-- Pending now: C1 (Ravi, A1 -5: present 0 to half_day 8 h "left early"), C2 (Sita, A1 -5:
-- present 2 to absent 0).

do $$
declare r text; c record; before_at timestamptz; n int;
begin
  -- A pending correction on Ravi's entry at A1 -8, for the role matrix.
  r := test_propose(test_u('a03'), test_c(4), 'a1', 8, '01', 'half_day', 0.5, null, 'Half day only');
  perform test_assert(r = 'ok:1', '[5.00] (setup) C4 proposed, got ' || r);

  perform test_assert(test_review_corr(test_u('a03'), test_c(4), true) = '42501', '[5.01] the proposer cannot review their own correction');
  perform test_assert(test_review_corr(test_u('a04'), test_c(4), true) = '42501', '[5.02] a supervisor of another site cannot review');
  perform test_assert(test_review_corr(test_u('a05'), test_c(4), true) = '42501', '[5.03] an accountant cannot review');
  perform test_assert(test_review_corr(test_u('a07'), test_c(4), true) = '42501', '[5.04] an accountant with no assignment cannot review');
  perform test_assert(test_review_corr(test_u('b01'), test_c(4), true) = '42501', '[5.05] another organisation''s owner cannot review');
  perform test_assert(test_review_corr(test_u('b03'), test_c(4), false, 'no') = '42501', '[5.06] another organisation''s supervisor cannot review');
  perform test_assert(test_review_corr(null, test_c(4), true) = '42501', '[5.07] anon has no execute privilege');
  perform test_assert(test_review_corr(test_u('a01'), gen_random_uuid(), true) = '42501', '[5.08] an unknown correction id is 42501, same as a forbidden one');
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role authenticated';
  begin
    perform public.review_attendance_correction(test_c(4), true, null);
    r := 'ok';
  exception when others then r := sqlstate; end;
  execute 'reset role';
  perform test_assert(r = '28000', '[5.09] a signed-in role with no user id gets 28000, got ' || r);
  perform test_assert(test_corr_status(4) = 'pending' and test_ent('a1', 8, '01') = 'present|0.00|-',
    '[5.10] every refused review left the correction pending and the entry unchanged');

  -- Approve C1: the entry takes the new values, the correction keeps the old ones.
  r := test_review_corr(test_u('a02'), test_c(1), true);
  perform test_assert(r = 'ok:1', '[5.11] a project manager approves a correction, got ' || r);
  select * into c from attendance_corrections where id = test_c(1);
  perform test_assert(c.review_status = 'approved' and c.reviewed_by = test_u('a02') and c.reviewed_at is not null,
    '[5.12] the correction is approved and stamped');
  perform test_assert(test_ent('a1', 5, '01') = 'half_day|8.00|left early', '[5.13] the entry now holds the new values, got ' || test_ent('a1', 5, '01'));
  perform test_assert(c.old_status = 'present' and c.old_overtime_hours = 0 and c.old_note is null
                      and c.new_status = 'half_day' and c.reason = 'Supervisor mis-marked',
    '[5.14] the correction still holds the old values, the new values and the reason');
  perform test_assert(test_day_status('a1', 5) = 'approved', '[5.15] the day is still approved');

  -- Reject C2: a reason is mandatory, the entry is unchanged.
  perform test_assert(test_review_corr(test_u('a01'), test_c(2), false, null) = '22023', '[5.16] a rejection with no reason is refused (22023)');
  perform test_assert(test_review_corr(test_u('a01'), test_c(2), false, '') = '22023', '[5.17] an empty reason is refused');
  perform test_assert(test_review_corr(test_u('a01'), test_c(2), false, '   ') = '22023', '[5.18] a spaces-only reason is refused');
  perform test_assert(test_review_corr(test_u('a01'), test_c(2), false, repeat('x', 501)) = '22023', '[5.19] a 501-character reason is refused');
  perform test_assert(test_corr_status(2) = 'pending', '[5.20] a refused rejection leaves it pending');
  r := test_review_corr(test_u('a01'), test_c(2), false, '  Not credible  ');
  perform test_assert(r = 'ok:1', '[5.21] an owner rejects with a reason, got ' || r);
  select * into c from attendance_corrections where id = test_c(2);
  perform test_assert(c.review_status = 'rejected' and c.reviewed_by = test_u('a01') and c.review_reason = 'Not credible',
    '[5.22] the correction is rejected, stamped, with the trimmed reason');
  perform test_assert(test_ent('a1', 5, '02') = 'present|2.00|-', '[5.23] a rejection leaves the entry unchanged');
  -- D6: a new pending one is allowed once the first is decided.
  r := test_propose(test_u('a03'), test_c(5), 'a1', 5, '02', 'absent', 0, null, 'Sita really was on leave');
  perform test_assert(r = 'ok:1', '[5.24] a new correction is accepted once the previous one is decided, got ' || r);

  -- A decided correction: the same decision again is a no-op, the opposite is refused.
  select reviewed_at into before_at from attendance_corrections where id = test_c(1);
  r := test_review_corr(test_u('a01'), test_c(1), true);
  perform test_assert(r = 'ok:1', '[5.25] approving an approved correction succeeds as a no-op, got ' || r);
  perform test_assert((select reviewed_by from attendance_corrections where id = test_c(1)) = test_u('a02')
                      and (select reviewed_at from attendance_corrections where id = test_c(1)) = before_at,
    '[5.26] the first reviewer and time are kept');
  perform test_assert(test_review_corr(test_u('a01'), test_c(1), false, 'no') = '55000', '[5.27] an approved correction cannot be rejected (55000)');
  perform test_assert(test_review_corr(test_u('a01'), test_c(2), false, 'again') = 'ok:1', '[5.28] rejecting a rejected correction is a no-op');
  perform test_assert(test_review_corr(test_u('a01'), test_c(2), true) = '55000', '[5.29] a rejected correction cannot be approved (55000)');
  r := test_su(format('update public.attendance_corrections set review_status = ''approved'' where id = %L', test_c(2)));
  perform test_assert(r = '55000', '[5.30] the table owner cannot make a second review move either (55000), got ' || r);
  perform test_assert(test_ent('a1', 5, '02') = 'present|2.00|-', '[5.31] none of that touched the entry');

  -- D7: a correction is not applied over a change it did not see. This needs an
  -- admin-level write (the lock otherwise lets only an approved correction in), so
  -- the user triggers are switched off for that one write.
  r := test_propose(test_u('a03'), test_c(3), 'a1', 8, '03', 'present', 0, null, 'Arun did come');
  perform test_assert(r = 'ok:1', '[5.32] (setup) C3 proposed, got ' || r);
  alter table public.attendance_entries disable trigger user;
  update public.attendance_entries set note = 'admin fix' where id = test_entry('a1', 8, '03');
  alter table public.attendance_entries enable trigger user;
  r := test_review_corr(test_u('a02'), test_c(3), true);
  perform test_assert(r = '55000', '[5.33] approving a stale correction is refused (55000), got ' || r);
  perform test_assert(test_corr_status(3) = 'pending' and test_ent('a1', 8, '03') = 'absent|0.00|admin fix',
    '[5.34] the stale correction stays pending and the entry is unchanged');
  r := test_review_corr(test_u('a02'), test_c(3), false, 'Entry changed since');
  perform test_assert(r = 'ok:1', '[5.35] it can be rejected, got ' || r);

  -- Cross-organisation: org B's own flow works, org A cannot touch it.
  r := test_propose(test_u('b03'), test_c(6), 'b1', 5, 'b1', 'absent', 0, null, 'Bela absent', test_org('b'));
  perform test_assert(r = 'ok:1', '[5.36] (setup) an org B correction, got ' || r);
  perform test_assert(test_review_corr(test_u('a01'), test_c(6), true) = '42501', '[5.37] org A''s owner cannot review org B''s correction');
  perform test_assert(test_corr_status(6) = 'pending', '[5.38] it is still pending');
  perform test_assert(test_review_corr(test_u('b01'), test_c(6), true) = 'ok:1', '[5.39] org B''s owner can');
  perform test_assert(test_ent('b1', 5, 'b1') = 'absent|0.00|-', '[5.40] and it was applied to org B''s entry');
end $$;

-- ============================ 6. the lock against corrections (D8)
-- State: C1 approved (Ravi A1 -5 now half_day 8 h "left early"); C2 rejected (Sita A1 -5);
-- C4 pending (Ravi A1 -8: present 0 to half_day 0.5).

do $$
declare r text;
begin
  r := test_edit_entry(test_u('a03'), test_entry('a1', 5, '01'), 'present', 0, null);
  perform test_assert(r = 'ok:0', '[6.01] an applied correction does not open the day to plain writes, got ' || r);

  -- A pending correction does not unlock the entry, even for the exact new values.
  r := test_su(format('update public.attendance_entries set status = ''half_day'', overtime_hours = 0.5, note = null where id = %L', test_entry('a1', 8, '01')));
  perform test_assert(r = 'PS409', '[6.02] a pending correction does not unlock the entry, got ' || r);
  -- A rejected one does not either.
  r := test_su(format('update public.attendance_entries set status = ''absent'', overtime_hours = 0, note = null where id = %L', test_entry('a1', 5, '02')));
  perform test_assert(r = 'PS409', '[6.03] a rejected correction does not unlock the entry, got ' || r);
  -- An approved day's entry with no correction at all.
  r := test_su(format('update public.attendance_entries set status = ''present'' where id = %L', test_entry('a1', 5, '03')));
  perform test_assert(r = 'PS409', '[6.04] an entry with no correction stays locked, got ' || r);
  -- Putting an applied correction back is a new correction, not a write.
  r := test_su(format('update public.attendance_entries set status = ''present'', overtime_hours = 0, note = null where id = %L', test_entry('a1', 5, '01')));
  perform test_assert(r = 'PS409', '[6.05] reverting an applied correction by plain write raises PS409, got ' || r);
  perform test_assert(test_ent('a1', 5, '01') = 'half_day|8.00|left early'
                      and test_ent('a1', 8, '01') = 'present|0.00|-'
                      and test_ent('a1', 5, '02') = 'present|2.00|-',
    '[6.06] none of the refused writes changed an entry');

  -- Approving C4 is the one write that gets in.
  perform test_assert(test_review_corr(test_u('a01'), test_c(4), true) = 'ok:1', '[6.07] approving the pending correction applies it');
  perform test_assert(test_ent('a1', 8, '01') = 'half_day|0.50|-', '[6.08] the entry holds the approved values, got ' || test_ent('a1', 8, '01'));

  -- A correction can always be proposed on an approved day: the lock is on entries.
  perform test_assert(test_propose(test_u('a03'), test_c(7), 'a1', 8, '01', 'present', 0, null, 'Back to present') = 'ok:1',
    '[6.09] a correction can follow an applied one on an approved day');
end $$;

-- ===================================================================== 7. audit
-- Audit rows are counted after a watermark taken just before each action, and read
-- as the superuser (audit_log is closed to clients).

do $$
declare w bigint; n int; a public.audit_log; r text;
begin
  -- A correction insert: one row, the proposer as actor.
  select coalesce(max(id), 0) into w from audit_log;
  r := test_propose(test_u('a03'), test_c(10), 'a1', 8, '02', 'absent', 0, null, 'Sita left');
  perform test_assert(r = 'ok:1', '[7.00] (setup) proposed, got ' || r);
  select count(*) into n from audit_log where id > w;
  perform test_assert(n = 1, '[7.01] a correction insert writes one audit row, found ' || n);
  select * into a from audit_log where id > w;
  perform test_assert(a.table_name = 'attendance_corrections' and a.row_id = test_c(10) and a.operation = 'INSERT'
                      and a.actor_id = test_u('a03') and a.org_id = test_org('a') and a.new_data ->> 'reason' = 'Sita left',
    '[7.02] it names the table, the row, the proposer and the org');

  -- Approving it: one row for the correction, one for the entry, reviewer as actor.
  select coalesce(max(id), 0) into w from audit_log;
  r := test_review_corr(test_u('a02'), test_c(10), true);
  perform test_assert(r = 'ok:1', '[7.03] (setup) approved, got ' || r);
  select count(*) into n from audit_log where id > w;
  perform test_assert(n = 2, '[7.04] approving a correction writes two audit rows, found ' || n);
  perform test_assert((select count(*) from audit_log where id > w and table_name = 'attendance_corrections'
                          and operation = 'UPDATE' and actor_id = test_u('a02') and old_data ->> 'review_status' = 'pending'
                          and new_data ->> 'review_status' = 'approved') = 1,
    '[7.05] one is the correction going pending to approved, by the reviewer');
  perform test_assert((select count(*) from audit_log where id > w and table_name = 'attendance_entries'
                          and operation = 'UPDATE' and actor_id = test_u('a02') and old_data ->> 'status' = 'present'
                          and new_data ->> 'status' = 'absent') = 1,
    '[7.06] the other is the entry changing, by the reviewer');

  -- Reviewing a day: one row for the day.
  select coalesce(max(id), 0) into w from audit_log;
  r := test_review_day(test_u('a02'), test_day('a1', 14), true);
  perform test_assert(r = 'ok:1', '[7.07] (setup) day approved, got ' || r);
  select count(*) into n from audit_log where id > w;
  perform test_assert(n = 1, '[7.08] a day review writes one audit row, found ' || n);
  select * into a from audit_log where id > w;
  perform test_assert(a.table_name = 'attendance_days' and a.operation = 'UPDATE' and a.actor_id = test_u('a02')
                      and a.old_data ->> 'status' = 'open' and a.new_data ->> 'status' = 'approved',
    '[7.09] it is the day going open to approved, by the reviewer');

  -- Blocked writes leave no audit row.
  select coalesce(max(id), 0) into w from audit_log;
  perform test_add_entry(test_u('a03'), 'a1', 14, '06');                                         -- PS409
  perform test_edit_entry(test_u('a03'), test_entry('a1', 14, '01'), 'absent', 0, null);         -- 0 rows
  perform test_propose(test_u('a03'), test_c(11), 'a1', 15, '01', 'absent', 0, null, 'r');       -- 55000
  perform test_propose(test_u('a04'), test_c(11), 'a1', 14, '01', 'absent', 0, null, 'r');       -- 42501
  perform test_propose(test_u('a03'), test_c(11), 'a1', 14, '01', 'absent', 0, null, '');        -- 23514
  perform test_review_day(test_u('a02'), test_day('a1', 15), false, '');                         -- 22023
  perform test_review_day(test_u('a03'), test_day('a1', 15), true);                              -- 42501
  perform test_review_corr(test_u('a03'), test_c(10), true);                                     -- 42501
  perform test_review_corr(test_u('a01'), test_c(10), false, 'no');                              -- 55000
  select count(*) into n from audit_log where id > w;
  perform test_assert(n = 0, '[7.10] blocked writes leave no audit row, found ' || n);
end $$;

rollback;
