-- Attendance & Site Presence, PR 1: attendance_days, attendance_entries and
-- mark_all_present(). Issue #28, decisions D4-D6, D10, D11 in ADR-021.
--
-- Conventions as in sites_test.sql: test_as / test_as_anon / test_assert, SQLSTATE
-- asserts, row_count = 0 for an UPDATE that RLS filters out. The helpers below
-- switch role themselves and return 'ok', 'ok:<rows>' or the SQLSTATE they hit.
--
-- Order of checks inside one INSERT into attendance_entries, which fixes the
-- SQLSTATE a case expects: the policy WITH CHECK (42501), then the foreign keys
-- (23503), then the roster rule (23514), which is an AFTER trigger so that an
-- unrelated caller is stopped by the policy first and a worker from another
-- organisation by the foreign key.
--
-- Dates are relative to current_date, never literals, so the suite does not age.
-- An assignment's timestamps are 09:00 / 18:00 IST on a stated day (test_ist), and
-- "rostered on a date" means the Asia/Kolkata calendar day, both ends inclusive.
begin;

-- ---------------------------------------------------------------- fixtures
-- Org A: owner a01, project manager a02, supervisors a03 (A1, A3), a04 (A2) and a06
-- (A1), accountant a05 (assigned A1) and a07 (no assignment).
-- Org B: owner b01, supervisor b03 (B1), worker wb.
-- Sites: A1, A2, A3 (archived), B1.

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000a01', 'owner-a@test.local'),
  ('00000000-0000-0000-0000-000000000a02', 'pm-a@test.local'),
  ('00000000-0000-0000-0000-000000000a03', 'sup-a@test.local'),
  ('00000000-0000-0000-0000-000000000a04', 'sup-a2@test.local'),
  ('00000000-0000-0000-0000-000000000a05', 'acct-a@test.local'),
  ('00000000-0000-0000-0000-000000000a06', 'sup-a3@test.local'),
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
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000a06', 'supervisor'),
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
  ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000a06', '00000000-0000-0000-0000-000000000a01'),
  ('10000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000b03', '00000000-0000-0000-0000-000000000b01');

-- A3 is archived directly: its assignments stay open, so has_site_access is still
-- true for a03 while can_record_on_site is false.
update public.sites
   set status = 'archived', archived_at = now(), archived_by = '00000000-0000-0000-0000-000000000a01'
 where id = '20000000-0000-0000-0000-0000000000a3';

-- A moment on a stated day in India: p_days days ago, p_hour o'clock IST.
create function public.test_ist(p_days int, p_hour int) returns timestamptz language sql as $$
  select ((current_date - p_days)::timestamp + make_interval(hours => p_hour)) at time zone 'Asia/Kolkata'
$$;

-- Workers (all org A unless noted):
--   w1 Ravi    A1 open since day -10
--   w2 Sita    A1 from -20, closed -8
--   w3 Arun    A1 twice, both closed: -30..-12 and -25..-14 (they overlap on -25..-14)
--   w4 Latha   A2 open since -10
--   w5 Inder   A1 open since -30, then made inactive
--   w6 Never   never rostered
--   wb Bela    org B, at B1
insert into public.workers (id, org_id, code, full_name, trade, pay_type, created_by) values
  ('77000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a', 'W-001', 'Ravi',  'mason',  'daily', '00000000-0000-0000-0000-000000000a01'),
  ('77000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-00000000000a', 'W-002', 'Sita',  'helper', 'daily', '00000000-0000-0000-0000-000000000a01'),
  ('77000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-00000000000a', 'W-003', 'Arun',  'helper', 'daily', '00000000-0000-0000-0000-000000000a01'),
  ('77000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-00000000000a', 'W-004', 'Latha', 'helper', 'daily', '00000000-0000-0000-0000-000000000a01'),
  ('77000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-00000000000a', 'W-005', 'Inder', 'helper', 'daily', '00000000-0000-0000-0000-000000000a01'),
  ('77000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-00000000000a', 'W-006', 'Never', 'helper', 'daily', '00000000-0000-0000-0000-000000000a01'),
  ('77000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-00000000000b', 'W-001', 'Bela',  'mason',  'daily', '00000000-0000-0000-0000-000000000b01');

insert into public.worker_site_assignments
  (org_id, worker_id, site_id, assigned_by, assigned_at, unassigned_at, unassigned_by) values
  ('10000000-0000-0000-0000-00000000000a', '77000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-000000000a01', public.test_ist(10, 9), null, null),
  ('10000000-0000-0000-0000-00000000000a', '77000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-000000000a01', public.test_ist(20, 9), public.test_ist(8, 18), '00000000-0000-0000-0000-000000000a01'),
  ('10000000-0000-0000-0000-00000000000a', '77000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-000000000a01', public.test_ist(30, 9), public.test_ist(12, 18), '00000000-0000-0000-0000-000000000a01'),
  ('10000000-0000-0000-0000-00000000000a', '77000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-000000000a01', public.test_ist(25, 9), public.test_ist(14, 18), '00000000-0000-0000-0000-000000000a01'),
  ('10000000-0000-0000-0000-00000000000a', '77000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-0000000000a2',
   '00000000-0000-0000-0000-000000000a01', public.test_ist(10, 9), null, null),
  ('10000000-0000-0000-0000-00000000000a', '77000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-000000000a01', public.test_ist(30, 9), null, null),
  ('10000000-0000-0000-0000-00000000000b', '77000000-0000-0000-0000-0000000000b1', '20000000-0000-0000-0000-0000000000b1',
   '00000000-0000-0000-0000-000000000b01', public.test_ist(10, 9), null, null);

update public.workers set status = 'inactive' where id = '77000000-0000-0000-0000-000000000005';

-- Days written by the superuser (the triggers still run), all recorded by a03:
--   A1 on days -5 -6 -7 -8 -10 -11 -12 -15 · A2 on -5 · A3 on -6.
-- Days -9 and -16 at A1 are left for mark_all_present() to create.
insert into public.attendance_days (org_id, site_id, attendance_date, recorded_by)
select '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', current_date - d,
       '00000000-0000-0000-0000-000000000a03'
  from unnest(array[5, 6, 7, 8, 10, 11, 12, 15]) as d;
insert into public.attendance_days (org_id, site_id, attendance_date, recorded_by) values
  ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a2', current_date - 5, '00000000-0000-0000-0000-000000000a04'),
  ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a3', current_date - 6, '00000000-0000-0000-0000-000000000a03');

-- E0: w1 present at A1 on day -5 (a03). E2: w4 present at A2 on day -5 (a04).
insert into public.attendance_entries (id, org_id, site_id, attendance_date, worker_id, status, recorded_by) values
  ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1',
   current_date - 5, '77000000-0000-0000-0000-000000000001', 'present', '00000000-0000-0000-0000-000000000a03'),
  ('50000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a2',
   current_date - 5, '77000000-0000-0000-0000-000000000004', 'present', '00000000-0000-0000-0000-000000000a04');

-- ----------------------------------------------------------------- helpers
-- Add a day as p_user. Returns 'ok' or the SQLSTATE raised.
create function public.test_add_day(
  p_user uuid, p_site uuid, p_date date,
  p_org  uuid default '10000000-0000-0000-0000-00000000000a'
) returns text language plpgsql as $$
declare s text;
begin
  perform test_as(p_user);
  begin
    insert into public.attendance_days (id, org_id, site_id, attendance_date)
    values (gen_random_uuid(), p_org, p_site, p_date);
  exception when others then s := sqlstate; end;
  execute 'reset role';
  return coalesce(s, 'ok');
end $$;

-- Add an entry as p_user. Returns 'ok' or the SQLSTATE raised.
create function public.test_add_entry(
  p_user   uuid, p_site uuid, p_date date, p_worker uuid,
  p_status text default 'present',
  p_ot     numeric default 0,
  p_note   text default null,
  p_org    uuid default '10000000-0000-0000-0000-00000000000a'
) returns text language plpgsql as $$
declare s text;
begin
  perform test_as(p_user);
  begin
    insert into public.attendance_entries
      (id, org_id, site_id, attendance_date, worker_id, status, overtime_hours, note)
    values (gen_random_uuid(), p_org, p_site, p_date, p_worker, p_status, p_ot, p_note);
  exception when others then s := sqlstate; end;
  execute 'reset role';
  return coalesce(s, 'ok');
end $$;

-- Edit an entry as p_user. Returns 'ok:<rows touched>' or the SQLSTATE raised.
create function public.test_edit_entry(
  p_user uuid, p_id uuid, p_status text, p_ot numeric, p_note text
) returns text language plpgsql as $$
declare s text; n int;
begin
  perform test_as(p_user);
  begin
    update public.attendance_entries
       set status = p_status, overtime_hours = p_ot, note = p_note
     where id = p_id;
    get diagnostics n = row_count;
  exception when others then s := sqlstate; end;
  execute 'reset role';
  return coalesce(s, 'ok:' || n);
end $$;

-- mark_all_present as p_user. Returns 'ok:<entries created>' or the SQLSTATE raised.
create function public.test_mark_all(p_user uuid, p_site uuid, p_date date)
returns text language plpgsql as $$
declare s text; n int;
begin
  perform test_as(p_user);
  begin
    n := public.mark_all_present(p_site, p_date);
  exception when others then s := sqlstate; end;
  execute 'reset role';
  return coalesce(s, 'ok:' || n);
end $$;

-- ================================================================= 1. shape

do $$
declare t text; n int;
begin
  foreach t in array array['attendance_days', 'attendance_entries'] loop
    perform test_assert((select relrowsecurity from pg_class where oid = ('public.' || t)::regclass),
      '[1.01] ' || t || ' has RLS enabled');
    perform test_assert(not has_table_privilege('anon', 'public.' || t, 'select')
                        and not has_table_privilege('anon', 'public.' || t, 'insert')
                        and not has_table_privilege('anon', 'public.' || t, 'update')
                        and not has_table_privilege('anon', 'public.' || t, 'delete'),
      '[1.02] anon holds no privilege on ' || t);
    perform test_assert(has_table_privilege('authenticated', 'public.' || t, 'select')
                        and not has_table_privilege('authenticated', 'public.' || t, 'delete')
                        and not has_table_privilege('authenticated', 'public.' || t, 'truncate'),
      '[1.03] authenticated can select, and cannot delete or truncate ' || t);

    -- write_audit(): AFTER INSERT OR UPDATE OR DELETE FOR EACH ROW (tgtype 29),
    -- enabled, and the only write_audit trigger on the table.
    select count(*) into n from pg_trigger
     where tgrelid = ('public.' || t)::regclass and tgname = t || '_audit'
       and tgtype = 29 and tgenabled = 'O' and tgfoid = 'public.write_audit()'::regprocedure;
    perform test_assert(n = 1, '[1.04] ' || t || '_audit is AFTER INSERT OR UPDATE OR DELETE FOR EACH ROW, enabled');
    select count(*) into n from pg_trigger
     where tgrelid = ('public.' || t)::regclass and tgfoid = 'public.write_audit()'::regprocedure;
    perform test_assert(n = 1, '[1.05] it is the only write_audit trigger on ' || t || ', found ' || n);
  end loop;

  -- A day can only be inserted by a client: its status, reviewer and reason are
  -- written by the review function in PR 2 (D11).
  perform test_assert(has_column_privilege('authenticated', 'public.attendance_days', 'attendance_date', 'insert')
                      and not has_column_privilege('authenticated', 'public.attendance_days', 'status', 'insert')
                      and not has_column_privilege('authenticated', 'public.attendance_days', 'recorded_by', 'insert')
                      and not has_column_privilege('authenticated', 'public.attendance_days', 'reviewed_by', 'insert')
                      and not has_any_column_privilege('authenticated', 'public.attendance_days', 'update'),
    '[1.06] days: insert is limited to id, org, site and date, and no column is updatable');

  perform test_assert(has_column_privilege('authenticated', 'public.attendance_entries', 'worker_id', 'insert')
                      and has_column_privilege('authenticated', 'public.attendance_entries', 'overtime_hours', 'insert')
                      and not has_column_privilege('authenticated', 'public.attendance_entries', 'recorded_by', 'insert'),
    '[1.07] entries: insert is limited to the columns the phone captures');
  perform test_assert(has_column_privilege('authenticated', 'public.attendance_entries', 'status', 'update')
                      and has_column_privilege('authenticated', 'public.attendance_entries', 'overtime_hours', 'update')
                      and has_column_privilege('authenticated', 'public.attendance_entries', 'note', 'update')
                      and not has_column_privilege('authenticated', 'public.attendance_entries', 'worker_id', 'update')
                      and not has_column_privilege('authenticated', 'public.attendance_entries', 'site_id', 'update')
                      and not has_column_privilege('authenticated', 'public.attendance_entries', 'attendance_date', 'update')
                      and not has_column_privilege('authenticated', 'public.attendance_entries', 'recorded_by', 'update'),
    '[1.08] entries: only status, overtime_hours and note are updatable');

  select count(*) into n from pg_indexes
   where schemaname = 'public' and tablename = 'attendance_days'
     and indexdef like '%UNIQUE%' and indexdef like '%(site_id, attendance_date)%';
  perform test_assert(n = 1, '[1.09] one day per site per date is a unique index on (site_id, attendance_date), found ' || n);
  select count(*) into n from pg_indexes
   where schemaname = 'public' and tablename = 'attendance_entries' and indexdef like '%(worker_id)%';
  perform test_assert(n = 1, '[1.10] attendance_entries is indexed on worker_id, found ' || n);
  select count(*) into n from pg_indexes
   where schemaname = 'public' and tablename = 'attendance_entries' and indexdef like '%(site_id)%';
  perform test_assert(n = 1, '[1.11] attendance_entries is indexed on site_id, found ' || n);

  -- The roster rule is an AFTER trigger on entries (see the header).
  select count(*) into n from pg_trigger
   where tgrelid = 'public.attendance_entries'::regclass and tgname = 'attendance_entries_check_roster'
     and (tgtype & 2) = 0 and tgenabled = 'O';
  perform test_assert(n = 1, '[1.12] the roster rule is an enabled AFTER trigger on attendance_entries');

  -- mark_all_present: not executable by anon, executable by authenticated, SECURITY INVOKER.
  perform test_assert(not has_function_privilege('anon', 'public.mark_all_present(uuid, date)', 'execute')
                      and has_function_privilege('authenticated', 'public.mark_all_present(uuid, date)', 'execute'),
    '[1.13] mark_all_present is executable by authenticated and not by anon');
  perform test_assert(not (select prosecdef from pg_proc where oid = 'public.mark_all_present(uuid, date)'::regprocedure),
    '[1.14] mark_all_present is SECURITY INVOKER');
  perform test_assert(
    (select proconfig @> array['search_path=public'] from pg_proc where oid = 'public.mark_all_present(uuid, date)'::regprocedure),
    '[1.15] mark_all_present sets search_path = public');
end $$;

-- ===================================================== 2. role x operation
-- Counts first, while only the fixtures exist: 10 days (A1 8, A2 1, A3 1) and
-- 2 entries (E0 at A1, E2 at A2).

do $$
declare s text; u text; n int;
begin
  -- owner and project manager read the whole org and record nothing.
  foreach u in array array['00000000-0000-0000-0000-000000000a01', '00000000-0000-0000-0000-000000000a02'] loop
    perform test_as(u::uuid);
    select count(*) into n from public.attendance_days;
    perform test_assert(n = 10, '[2.01] ' || u || ' reads every day of their org, saw ' || n);
    select count(*) into n from public.attendance_entries;
    perform test_assert(n = 2, '[2.02] ' || u || ' reads every entry of their org, saw ' || n);

    s := null;
    begin
      delete from public.attendance_entries where id = '50000000-0000-0000-0000-000000000001';
    exception when others then s := sqlstate; end;
    perform test_assert(s = '42501', '[2.03] ' || u || ' cannot delete an entry, got ' || coalesce(s, 'no error'));
    s := null;
    begin
      delete from public.attendance_days;
    exception when others then s := sqlstate; end;
    perform test_assert(s = '42501', '[2.04] ' || u || ' cannot delete a day, got ' || coalesce(s, 'no error'));
    reset role;

    perform test_assert(
      public.test_add_day(u::uuid, '20000000-0000-0000-0000-0000000000a1', current_date - 3) = '42501',
      '[2.05] ' || u || ' cannot create a day (supervisor-only recording)');
    perform test_assert(
      public.test_add_entry(u::uuid, '20000000-0000-0000-0000-0000000000a1', current_date - 6, '77000000-0000-0000-0000-000000000001') = '42501',
      '[2.06] ' || u || ' cannot create an entry');
    perform test_assert(
      public.test_edit_entry(u::uuid, '50000000-0000-0000-0000-000000000001', 'absent', 0, null) = 'ok:0',
      '[2.07] ' || u || ' editing an entry touches 0 rows');
  end loop;
end $$;

do $$
declare s text; n int;
begin
  -- a03 (A1, A3): reads own sites' days and entries, nothing of A2.
  perform test_as('00000000-0000-0000-0000-000000000a03');
  select count(*) into n from public.attendance_days;
  perform test_assert(n = 9, '[2.08] a03 sees the days of A1 and A3, saw ' || n);
  select count(*) into n from public.attendance_entries;
  perform test_assert(n = 1, '[2.09] a03 sees the one entry at A1, saw ' || n);
  select count(*) into n from public.attendance_entries where id = '50000000-0000-0000-0000-000000000002';
  perform test_assert(n = 0, '[2.10] a03 cannot read another site''s entry by id, saw ' || n);

  s := null;
  begin
    delete from public.attendance_entries where id = '50000000-0000-0000-0000-000000000001';
  exception when others then s := sqlstate; end;
  perform test_assert(s = '42501', '[2.11] a supervisor cannot delete an entry, got ' || coalesce(s, 'no error'));
  s := null;
  begin
    delete from public.attendance_days where site_id = '20000000-0000-0000-0000-0000000000a1';
  exception when others then s := sqlstate; end;
  perform test_assert(s = '42501', '[2.12] a supervisor cannot delete a day, got ' || coalesce(s, 'no error'));
  s := null;
  begin
    truncate public.attendance_entries;
  exception when others then s := sqlstate; end;
  perform test_assert(s = '42501', '[2.13] a supervisor cannot truncate entries, got ' || coalesce(s, 'no error'));
  s := null;
  begin
    truncate public.attendance_days cascade;
  exception when others then s := sqlstate; end;
  perform test_assert(s = '42501', '[2.14] a supervisor cannot truncate days, got ' || coalesce(s, 'no error'));

  -- A supervisor cannot approve a day, or stamp a reviewer: nothing on days is updatable.
  s := null;
  begin
    update public.attendance_days set status = 'approved'
     where site_id = '20000000-0000-0000-0000-0000000000a1' and attendance_date = current_date - 5;
  exception when others then s := sqlstate; end;
  perform test_assert(s = '42501', '[2.15] a supervisor cannot approve a day, got ' || coalesce(s, 'no error'));
  s := null;
  begin
    update public.attendance_days set recorded_by = '00000000-0000-0000-0000-000000000a06'
     where site_id = '20000000-0000-0000-0000-0000000000a1' and attendance_date = current_date - 5;
  exception when others then s := sqlstate; end;
  perform test_assert(s = '42501', '[2.16] a supervisor cannot rewrite a day, got ' || coalesce(s, 'no error'));
  reset role;

  -- a04 (A2 only).
  perform test_as('00000000-0000-0000-0000-000000000a04');
  select count(*) into n from public.attendance_days;
  perform test_assert(n = 1, '[2.17] a04 sees only A2''s day, saw ' || n);
  select count(*) into n from public.attendance_entries;
  perform test_assert(n = 1, '[2.18] a04 sees only A2''s entry, saw ' || n);
  reset role;
  perform test_assert(
    public.test_edit_entry('00000000-0000-0000-0000-000000000a04', '50000000-0000-0000-0000-000000000001', 'absent', 0, null) = 'ok:0',
    '[2.19] a supervisor of another site cannot edit A1''s entry (0 rows)');
  perform test_assert(
    public.test_add_day('00000000-0000-0000-0000-000000000a04', '20000000-0000-0000-0000-0000000000a1', current_date - 3) = '42501',
    '[2.20] a supervisor of another site cannot create a day at A1');
  perform test_assert(
    public.test_add_entry('00000000-0000-0000-0000-000000000a04', '20000000-0000-0000-0000-0000000000a1', current_date - 6,
                          '77000000-0000-0000-0000-000000000001') = '42501',
    '[2.21] a supervisor of another site cannot create an entry at A1');

  -- accountants: a05 is assigned to A1 and reads, a07 reads nothing.
  perform test_as('00000000-0000-0000-0000-000000000a05');
  select count(*) into n from public.attendance_days;
  perform test_assert(n = 8, '[2.22] an assigned accountant reads the days of their site, saw ' || n);
  select count(*) into n from public.attendance_entries;
  perform test_assert(n = 1, '[2.23] an assigned accountant reads the entries of their site, saw ' || n);
  reset role;
  perform test_assert(
    public.test_add_day('00000000-0000-0000-0000-000000000a05', '20000000-0000-0000-0000-0000000000a1', current_date - 3) = '42501',
    '[2.24] an accountant cannot create a day');
  perform test_assert(
    public.test_add_entry('00000000-0000-0000-0000-000000000a05', '20000000-0000-0000-0000-0000000000a1', current_date - 6,
                          '77000000-0000-0000-0000-000000000001') = '42501',
    '[2.25] an accountant cannot create an entry');
  perform test_assert(
    public.test_edit_entry('00000000-0000-0000-0000-000000000a05', '50000000-0000-0000-0000-000000000001', 'absent', 0, null) = 'ok:0',
    '[2.26] an accountant editing an entry touches 0 rows');

  perform test_as('00000000-0000-0000-0000-000000000a07');
  select count(*) into n from public.attendance_days;
  perform test_assert(n = 0, '[2.27] an unassigned accountant reads no day, saw ' || n);
  select count(*) into n from public.attendance_entries;
  perform test_assert(n = 0, '[2.28] an unassigned accountant reads no entry, saw ' || n);
  reset role;

  -- org B reads and writes nothing of org A.
  perform test_as('00000000-0000-0000-0000-000000000b01');
  select count(*) into n from public.attendance_days;
  perform test_assert(n = 0, '[2.29] another org''s owner reads no day, saw ' || n);
  reset role;
  perform test_as('00000000-0000-0000-0000-000000000b03');
  select count(*) into n from public.attendance_entries;
  perform test_assert(n = 0, '[2.30] another org''s supervisor reads no entry, saw ' || n);
  reset role;
  perform test_assert(
    public.test_edit_entry('00000000-0000-0000-0000-000000000b03', '50000000-0000-0000-0000-000000000001', 'absent', 0, null) = 'ok:0',
    '[2.31] another org''s supervisor editing an entry touches 0 rows');

  -- anon
  perform test_as_anon();
  s := null;
  begin
    perform id from public.attendance_days;
  exception when others then s := sqlstate; end;
  perform test_assert(s = '42501', '[2.32] anon cannot read days, got ' || coalesce(s, 'no error'));
  s := null;
  begin
    perform id from public.attendance_entries;
  exception when others then s := sqlstate; end;
  perform test_assert(s = '42501', '[2.33] anon cannot read entries, got ' || coalesce(s, 'no error'));
  s := null;
  begin
    insert into public.attendance_days (id, org_id, site_id, attendance_date)
    values (gen_random_uuid(), '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', current_date - 3);
  exception when others then s := sqlstate; end;
  perform test_assert(s = '42501', '[2.34] anon cannot create a day, got ' || coalesce(s, 'no error'));
  reset role;
end $$;

-- a06 shares A1 with a03: reads a03's work and may edit its entries (site-level edit).
do $$
declare n int; r text;
begin
  perform test_as('00000000-0000-0000-0000-000000000a06');
  select count(*) into n from public.attendance_entries;
  perform test_assert(n = 1, '[2.35] a colleague on the site reads the entry, saw ' || n);
  reset role;
  r := public.test_edit_entry('00000000-0000-0000-0000-000000000a06', '50000000-0000-0000-0000-000000000001', 'present', 0, 'checked by a06');
  perform test_assert(r = 'ok:1', '[2.36] a colleague on the same site can edit an entry, got ' || r);
  r := public.test_edit_entry('00000000-0000-0000-0000-000000000a06', '50000000-0000-0000-0000-000000000001', 'present', 0, null);
  perform test_assert(r = 'ok:1', '[2.37] and put it back, got ' || r);
end $$;

-- ================================================================== 3. days

do $$
declare r text; d public.attendance_days; utc_today date := (now() at time zone 'utc')::date;
begin
  r := public.test_add_day('00000000-0000-0000-0000-000000000a03', '20000000-0000-0000-0000-0000000000a1', current_date - 3);
  perform test_assert(r = 'ok', '[3.01] an assigned supervisor can open a day, got ' || r);
  select * into d from public.attendance_days
   where site_id = '20000000-0000-0000-0000-0000000000a1' and attendance_date = current_date - 3;
  perform test_assert(d.status = 'open' and d.recorded_by = '00000000-0000-0000-0000-000000000a03'
                      and d.reviewed_by is null and d.reviewed_at is null and d.review_reason is null,
    '[3.02] a new day is open, recorded by the caller, with no review stamp');

  r := public.test_add_day('00000000-0000-0000-0000-000000000a03', '20000000-0000-0000-0000-0000000000a1', current_date - 3);
  perform test_assert(r = '23505', '[3.03] a second day for the same site and date is a unique violation, got ' || r);
  r := public.test_add_day('00000000-0000-0000-0000-000000000a06', '20000000-0000-0000-0000-0000000000a1', current_date - 3);
  perform test_assert(r = '23505', '[3.04] a colleague opening the same site and date is a unique violation too (D4), got ' || r);

  r := public.test_add_day('00000000-0000-0000-0000-000000000a03', '20000000-0000-0000-0000-0000000000a1', utc_today + 1);
  perform test_assert(r = 'ok', '[3.05] UTC today + 1 is accepted (India is ahead of UTC), got ' || r);
  r := public.test_add_day('00000000-0000-0000-0000-000000000a03', '20000000-0000-0000-0000-0000000000a1', utc_today + 2);
  perform test_assert(r = '23514', '[3.06] UTC today + 2 is refused, got ' || r);
  r := public.test_add_day('00000000-0000-0000-0000-000000000a03', '20000000-0000-0000-0000-0000000000a1', current_date - 400);
  perform test_assert(r = 'ok', '[3.07] an old day is accepted (a phone offline for months), got ' || r);

  -- An archived site is closed.
  r := public.test_add_day('00000000-0000-0000-0000-000000000a03', '20000000-0000-0000-0000-0000000000a3', current_date - 3);
  perform test_assert(r = '42501', '[3.08] nobody opens a day on an archived site, got ' || r);
end $$;

-- What the client cannot set at insert.
do $$
declare s text;
begin
  perform test_as('00000000-0000-0000-0000-000000000a03');

  s := null;
  begin
    insert into public.attendance_days (id, org_id, site_id, attendance_date, status)
    values (gen_random_uuid(), '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', current_date - 20, 'approved');
  exception when others then s := sqlstate; end;
  perform test_assert(s = '42501', '[3.09] a supervisor cannot create an approved day, got ' || coalesce(s, 'no error'));

  s := null;
  begin
    insert into public.attendance_days (id, org_id, site_id, attendance_date, recorded_by)
    values (gen_random_uuid(), '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', current_date - 20,
            '00000000-0000-0000-0000-000000000a06');
  exception when others then s := sqlstate; end;
  perform test_assert(s = '42501', '[3.10] a day cannot be recorded in someone else''s name, got ' || coalesce(s, 'no error'));

  reset role;
end $$;

-- Table rules on the review columns, written as the superuser: a CHECK applies to
-- every writer. PR 2's review function will be the only way a client reaches them.
do $$
declare s text; sid constant uuid := '20000000-0000-0000-0000-0000000000a1';
begin
  s := null;
  begin
    insert into public.attendance_days (org_id, site_id, attendance_date, recorded_by, status)
    values ('10000000-0000-0000-0000-00000000000a', sid, current_date - 40, '00000000-0000-0000-0000-000000000a03', 'bogus');
  exception when others then s := sqlstate; end;
  perform test_assert(s = '23514', '[3.11] an unknown day status is refused, got ' || coalesce(s, 'no error'));

  s := null;
  begin
    insert into public.attendance_days (org_id, site_id, attendance_date, recorded_by, status, reviewed_by)
    values ('10000000-0000-0000-0000-00000000000a', sid, current_date - 40, '00000000-0000-0000-0000-000000000a03', 'open',
            '00000000-0000-0000-0000-000000000a01');
  exception when others then s := sqlstate; end;
  perform test_assert(s = '23514', '[3.12] an open day cannot carry a reviewer, got ' || coalesce(s, 'no error'));

  s := null;
  begin
    insert into public.attendance_days (org_id, site_id, attendance_date, recorded_by, status, reviewed_by, reviewed_at)
    values ('10000000-0000-0000-0000-00000000000a', sid, current_date - 40, '00000000-0000-0000-0000-000000000a03', 'approved',
            null, null);
  exception when others then s := sqlstate; end;
  perform test_assert(s = '23514', '[3.13] an approved day must say who and when, got ' || coalesce(s, 'no error'));

  s := null;
  begin
    insert into public.attendance_days (org_id, site_id, attendance_date, recorded_by, status, reviewed_by, reviewed_at)
    values ('10000000-0000-0000-0000-00000000000a', sid, current_date - 40, '00000000-0000-0000-0000-000000000a03', 'rejected',
            '00000000-0000-0000-0000-000000000a01', now());
  exception when others then s := sqlstate; end;
  perform test_assert(s = '23514', '[3.14] a rejected day needs a reason, got ' || coalesce(s, 'no error'));

  s := null;
  begin
    insert into public.attendance_days (org_id, site_id, attendance_date, recorded_by, status, reviewed_by, reviewed_at, review_reason)
    values ('10000000-0000-0000-0000-00000000000a', sid, current_date - 40, '00000000-0000-0000-0000-000000000a03', 'rejected',
            '00000000-0000-0000-0000-000000000a01', now(), '   ');
  exception when others then s := sqlstate; end;
  perform test_assert(s = '23514', '[3.15] a blank rejection reason is refused, got ' || coalesce(s, 'no error'));

  s := null;
  begin
    insert into public.attendance_days (org_id, site_id, attendance_date, recorded_by, status, reviewed_by, reviewed_at)
    values ('10000000-0000-0000-0000-00000000000a', sid, current_date - 41, '00000000-0000-0000-0000-000000000a03', 'approved',
            '00000000-0000-0000-0000-000000000a01', now());
  exception when others then s := sqlstate; end;
  perform test_assert(s is null, '[3.16] an approved day with a reviewer and a time is accepted, got ' || coalesce(s, 'no error'));

  s := null;
  begin
    insert into public.attendance_days (org_id, site_id, attendance_date, recorded_by, status, reviewed_by, reviewed_at, review_reason)
    values ('10000000-0000-0000-0000-00000000000a', sid, current_date - 42, '00000000-0000-0000-0000-000000000a03', 'rejected',
            '00000000-0000-0000-0000-000000000a01', now(), 'Headcount does not match the register');
  exception when others then s := sqlstate; end;
  perform test_assert(s is null, '[3.17] a rejected day with a reason is accepted, got ' || coalesce(s, 'no error'));
end $$;

-- ================================================= 4. entries: values and edits
-- E0 is w1 at A1 on day -5, present, 0 overtime, no note.

do $$
declare r text; st text; v public.attendance_entries;
begin
  -- all four statuses, and back.
  foreach st in array array['half_day', 'leave', 'absent', 'present'] loop
    r := public.test_edit_entry('00000000-0000-0000-0000-000000000a03', '50000000-0000-0000-0000-000000000001', st, 0, null);
    perform test_assert(r = 'ok:1', '[4.01] status ' || st || ' is accepted, got ' || r);
  end loop;
  r := public.test_edit_entry('00000000-0000-0000-0000-000000000a03', '50000000-0000-0000-0000-000000000001', 'sick', 0, null);
  perform test_assert(r = '23514', '[4.02] an unknown status is refused, got ' || r);

  -- overtime: 0 to 8 inclusive.
  r := public.test_edit_entry('00000000-0000-0000-0000-000000000a03', '50000000-0000-0000-0000-000000000001', 'present', 8, null);
  perform test_assert(r = 'ok:1', '[4.03] 8 hours of overtime is accepted, got ' || r);
  r := public.test_edit_entry('00000000-0000-0000-0000-000000000a03', '50000000-0000-0000-0000-000000000001', 'present', 8.01, null);
  perform test_assert(r = '23514', '[4.04] 8.01 hours is refused, got ' || r);
  r := public.test_edit_entry('00000000-0000-0000-0000-000000000a03', '50000000-0000-0000-0000-000000000001', 'present', -0.01, null);
  perform test_assert(r = '23514', '[4.05] -0.01 hours is refused, got ' || r);
  r := public.test_edit_entry('00000000-0000-0000-0000-000000000a03', '50000000-0000-0000-0000-000000000001', 'half_day', 4.25, null);
  perform test_assert(r = 'ok:1', '[4.06] a half day with 4.25 hours of overtime is accepted, got ' || r);
  r := public.test_edit_entry('00000000-0000-0000-0000-000000000a03', '50000000-0000-0000-0000-000000000001', 'absent', 1, null);
  perform test_assert(r = '23514', '[4.07] overtime on an absent worker is refused, got ' || r);
  r := public.test_edit_entry('00000000-0000-0000-0000-000000000a03', '50000000-0000-0000-0000-000000000001', 'leave', 0.5, null);
  perform test_assert(r = '23514', '[4.08] overtime on a worker on leave is refused, got ' || r);
  r := public.test_edit_entry('00000000-0000-0000-0000-000000000a03', '50000000-0000-0000-0000-000000000001', 'leave', 0, null);
  perform test_assert(r = 'ok:1', '[4.09] leave with 0 overtime is accepted, got ' || r);

  -- note: null, or a trimmed 1-500 characters.
  r := public.test_edit_entry('00000000-0000-0000-0000-000000000a03', '50000000-0000-0000-0000-000000000001', 'present', 0, 'came late');
  perform test_assert(r = 'ok:1', '[4.10] a note is accepted, got ' || r);
  r := public.test_edit_entry('00000000-0000-0000-0000-000000000a03', '50000000-0000-0000-0000-000000000001', 'present', 0, '  ');
  perform test_assert(r = '23514', '[4.11] a blank note is refused, got ' || r);
  r := public.test_edit_entry('00000000-0000-0000-0000-000000000a03', '50000000-0000-0000-0000-000000000001', 'present', 0, ' padded');
  perform test_assert(r = '23514', '[4.12] a note with leading spaces is refused, got ' || r);
  r := public.test_edit_entry('00000000-0000-0000-0000-000000000a03', '50000000-0000-0000-0000-000000000001', 'present', 0, repeat('n', 500));
  perform test_assert(r = 'ok:1', '[4.13] a 500-character note is accepted, got ' || r);
  r := public.test_edit_entry('00000000-0000-0000-0000-000000000a03', '50000000-0000-0000-0000-000000000001', 'present', 0, repeat('n', 501));
  perform test_assert(r = '23514', '[4.14] a 501-character note is refused, got ' || r);

  -- back to the fixture, and check what stuck.
  r := public.test_edit_entry('00000000-0000-0000-0000-000000000a03', '50000000-0000-0000-0000-000000000001', 'present', 0, null);
  select * into v from public.attendance_entries where id = '50000000-0000-0000-0000-000000000001';
  perform test_assert(r = 'ok:1' and v.status = 'present' and v.overtime_hours = 0 and v.note is null
                      and v.worker_id = '77000000-0000-0000-0000-000000000001'
                      and v.recorded_by = '00000000-0000-0000-0000-000000000a03',
    '[4.15] the edits changed only status, overtime and note, and the refused ones left nothing behind');
end $$;

-- Columns a supervisor cannot change on an entry.
do $$
declare s text; c text;
begin
  perform test_as('00000000-0000-0000-0000-000000000a03');
  foreach c in array array[
    'worker_id = ''77000000-0000-0000-0000-000000000002''',
    'site_id = ''20000000-0000-0000-0000-0000000000a3''',
    'attendance_date = current_date - 6',
    'org_id = ''10000000-0000-0000-0000-00000000000b''',
    'recorded_by = ''00000000-0000-0000-0000-000000000a06''',
    'id = gen_random_uuid()'
  ] loop
    s := null;
    begin
      execute 'update public.attendance_entries set ' || c || ' where id = ''50000000-0000-0000-0000-000000000001''';
    exception when others then s := sqlstate; end;
    perform test_assert(s = '42501', '[4.16] "' || c || '" cannot be updated, got ' || coalesce(s, 'no error'));
  end loop;
  reset role;
end $$;

-- ============================================================= 5. roster rule
-- A worker must have been rostered at the site on the entry's date, from
-- worker_roster only, with both ends of the assignment counted.

do $$
declare r text; a03 constant uuid := '00000000-0000-0000-0000-000000000a03';
        a1  constant uuid := '20000000-0000-0000-0000-0000000000a1';
begin
  r := public.test_add_entry(a03, a1, current_date - 6, '77000000-0000-0000-0000-000000000001');
  perform test_assert(r = 'ok', '[5.01] w1 (open since day -10) on day -6 is accepted, got ' || r);

  r := public.test_add_entry(a03, a1, current_date - 10, '77000000-0000-0000-0000-000000000001');
  perform test_assert(r = 'ok', '[5.02] w1 on the day the assignment began (day -10) is accepted, got ' || r);

  r := public.test_add_entry(a03, a1, current_date - 8, '77000000-0000-0000-0000-000000000002');
  perform test_assert(r = 'ok', '[5.03] w2 on the day the assignment ended (day -8) is accepted, got ' || r);

  r := public.test_add_entry(a03, a1, current_date - 15, '77000000-0000-0000-0000-000000000002');
  perform test_assert(r = 'ok', '[5.04] w2 on day -15, inside its closed assignment, is accepted, got ' || r);

  r := public.test_add_entry(a03, a1, current_date - 6, '77000000-0000-0000-0000-000000000005');
  perform test_assert(r = 'ok', '[5.05] an inactive worker who was rostered that day can still be marked (history), got ' || r);

  r := public.test_add_entry(a03, a1, current_date - 12, '77000000-0000-0000-0000-000000000001');
  perform test_assert(r = '23514', '[5.06] w1 on day -12, before the assignment began, is refused, got ' || r);

  r := public.test_add_entry(a03, a1, current_date - 7, '77000000-0000-0000-0000-000000000002');
  perform test_assert(r = '23514', '[5.07] w2 on day -7, after the assignment ended, is refused, got ' || r);

  r := public.test_add_entry(a03, a1, current_date - 6, '77000000-0000-0000-0000-000000000004');
  perform test_assert(r = '23514', '[5.08] a worker rostered at another site is refused, got ' || r);

  r := public.test_add_entry(a03, a1, current_date - 6, '77000000-0000-0000-0000-000000000006');
  perform test_assert(r = '23514', '[5.09] a worker never rostered anywhere is refused, got ' || r);

  r := public.test_add_entry(a03, a1, current_date - 6, '77000000-0000-0000-0000-0000000000b1');
  perform test_assert(r = '23503', '[5.10] another organisation''s worker is refused by the foreign key, got ' || r);

  r := public.test_add_entry(a03, a1, current_date - 6, '77000000-0000-0000-0000-000000000001');
  perform test_assert(r = '23505', '[5.11] the same worker twice on one day is a unique violation, got ' || r);

  r := public.test_add_entry(a03, a1, current_date - 4, '77000000-0000-0000-0000-000000000001');
  perform test_assert(r = '23503', '[5.12] an entry for a day that was never opened is refused by the foreign key, got ' || r);

  r := public.test_add_entry(a03, '20000000-0000-0000-0000-0000000000a3', current_date - 6, '77000000-0000-0000-0000-000000000001');
  perform test_assert(r = '42501', '[5.13] nobody records on an archived site, got ' || r);

  r := public.test_add_entry(a03, a1, current_date - 11, '77000000-0000-0000-0000-000000000002', 'sick');
  perform test_assert(r = '23514', '[5.14] an entry with an unknown status is refused at insert, got ' || r);
  r := public.test_add_entry(a03, a1, current_date - 11, '77000000-0000-0000-0000-000000000002', 'present', 9);
  perform test_assert(r = '23514', '[5.15] an entry with 9 hours of overtime is refused at insert, got ' || r);
  r := public.test_add_entry(a03, a1, current_date - 11, '77000000-0000-0000-0000-000000000002', 'absent', 1);
  perform test_assert(r = '23514', '[5.16] an absent entry with overtime is refused at insert, got ' || r);
  r := public.test_add_entry(a03, a1, current_date - 11, '77000000-0000-0000-0000-000000000002', 'half_day', 2, 'left at noon');
  perform test_assert(r = 'ok', '[5.17] a half-day entry with overtime and a note is accepted, got ' || r);

  perform test_assert((select count(*) from public.attendance_entries
                        where site_id = a1 and attendance_date = current_date - 6) = 2,
    '[5.18] the refused attempts on day -6 left nothing behind: only w1 and w5 are on it');
end $$;

-- The roster is read through worker_roster under the caller's RLS, so a worker the
-- supervisor cannot see is simply not rostered.
do $$
declare n int;
begin
  perform test_as('00000000-0000-0000-0000-000000000a03');
  select count(*) into n from public.worker_roster where worker_id = '77000000-0000-0000-0000-000000000004';
  perform test_assert(n = 0, '[5.19] a03 cannot see the roster row of a worker at another site, saw ' || n);
  reset role;
end $$;

-- ============================================================ 6. mark-all
-- A1 roster by day: w1 from -10 · w2 -20..-8 · w3 -30..-12 (two rows) · w5 inactive.
--   day -9  : w1, w2        day -16 : w2, w3 (w3 on two overlapping rows)
--   day -11 : w2 (day already open)

do $$
declare r text; n int; ids uuid[]; w2_entry uuid;
        a03 constant uuid := '00000000-0000-0000-0000-000000000a03';
        a1  constant uuid := '20000000-0000-0000-0000-0000000000a1';
begin
  r := public.test_mark_all(a03, a1, current_date - 9);
  perform test_assert(r = 'ok:2', '[6.01] mark-all on day -9 creates 2 entries (w1, w2), got ' || r);

  select count(*) into n from public.attendance_days where site_id = a1 and attendance_date = current_date - 9;
  perform test_assert(n = 1, '[6.02] it opened the day, found ' || n);
  perform test_assert((select recorded_by = a03 and status = 'open' from public.attendance_days
                        where site_id = a1 and attendance_date = current_date - 9),
    '[6.03] the day is open and recorded by the caller');

  select array_agg(worker_id order by worker_id) into ids from public.attendance_entries
   where site_id = a1 and attendance_date = current_date - 9;
  perform test_assert(ids = array['77000000-0000-0000-0000-000000000001', '77000000-0000-0000-0000-000000000002']::uuid[],
    '[6.04] the entries are w1 and w2: not the inactive w5, not w3 (closed), not w4 (other site)');
  perform test_assert((select bool_and(status = 'present' and overtime_hours = 0 and note is null and recorded_by = a03)
                         from public.attendance_entries where site_id = a1 and attendance_date = current_date - 9),
    '[6.05] every entry is present, 0 overtime, no note, recorded by the caller');

  -- Idempotent, and an exception survives a repeat.
  r := public.test_mark_all(a03, a1, current_date - 9);
  perform test_assert(r = 'ok:0', '[6.06] a second call creates nothing, got ' || r);

  select id into w2_entry from public.attendance_entries
   where site_id = a1 and attendance_date = current_date - 9 and worker_id = '77000000-0000-0000-0000-000000000002';
  r := public.test_edit_entry(a03, w2_entry, 'leave', 0, 'family event');
  perform test_assert(r = 'ok:1', '[6.07] w2 is changed to leave, got ' || r);
  r := public.test_mark_all(a03, a1, current_date - 9);
  perform test_assert(r = 'ok:0', '[6.08] a call after an exception creates nothing, got ' || r);
  perform test_assert((select status = 'leave' and note = 'family event' from public.attendance_entries where id = w2_entry),
    '[6.09] the exception is untouched by the repeat call');

  -- A worker on two overlapping assignment rows still gets one entry.
  r := public.test_mark_all(a03, a1, current_date - 16);
  perform test_assert(r = 'ok:2', '[6.10] mark-all on day -16 creates 2 entries (w2, w3), got ' || r);
  select count(*) into n from public.attendance_entries
   where site_id = a1 and attendance_date = current_date - 16 and worker_id = '77000000-0000-0000-0000-000000000003';
  perform test_assert(n = 1, '[6.11] w3, on two overlapping assignment rows, has exactly one entry, found ' || n);

  -- A day that is already open: only the entries are added.
  r := public.test_mark_all(a03, a1, current_date - 11);
  perform test_assert(r = 'ok:0', '[6.12] on day -11 w2 already has an entry from test 5.17, so nothing is created, got ' || r);
  r := public.test_mark_all(a03, a1, current_date - 12);
  perform test_assert(r = 'ok:2', '[6.13] on the open day -12 mark-all creates w2 and w3, got ' || r);
  select count(*) into n from public.attendance_days where site_id = a1 and attendance_date = current_date - 12;
  perform test_assert(n = 1, '[6.14] it did not open a second day, found ' || n);

  -- Nobody rostered.
  r := public.test_mark_all(a03, a1, current_date - 60);
  perform test_assert(r = 'ok:0', '[6.15] a date with nobody rostered creates no entries, got ' || r);

  -- Future date.
  r := public.test_mark_all(a03, a1, (now() at time zone 'utc')::date + 5);
  perform test_assert(r = '23514', '[6.16] a date beyond UTC today + 1 is refused, got ' || r);
end $$;

do $$
declare r text; n int; s text;
        a1 constant uuid := '20000000-0000-0000-0000-0000000000a1';
begin
  r := public.test_mark_all('00000000-0000-0000-0000-000000000a04', a1, current_date - 14);
  perform test_assert(r = '42501', '[6.17] a supervisor of another site cannot mark all, got ' || r);
  select count(*) into n from public.attendance_days where site_id = a1 and attendance_date = current_date - 14;
  perform test_assert(n = 0, '[6.18] and nothing was written, found ' || n);

  r := public.test_mark_all('00000000-0000-0000-0000-000000000a01', a1, current_date - 14);
  perform test_assert(r = '42501', '[6.19] an owner cannot mark all (supervisor-only recording), got ' || r);
  r := public.test_mark_all('00000000-0000-0000-0000-000000000a02', a1, current_date - 14);
  perform test_assert(r = '42501', '[6.20] a project manager cannot mark all, got ' || r);
  r := public.test_mark_all('00000000-0000-0000-0000-000000000a05', a1, current_date - 14);
  perform test_assert(r = '42501', '[6.21] an accountant cannot mark all, got ' || r);
  r := public.test_mark_all('00000000-0000-0000-0000-000000000a03', '20000000-0000-0000-0000-0000000000a3', current_date - 14);
  perform test_assert(r = '42501', '[6.22] nobody can mark all on an archived site, got ' || r);
  r := public.test_mark_all('00000000-0000-0000-0000-000000000a03', '20000000-0000-0000-0000-0000000000b1', current_date - 14);
  perform test_assert(r = '42501', '[6.23] a supervisor cannot mark all at another org''s site, got ' || r);
  r := public.test_mark_all('00000000-0000-0000-0000-000000000b03', a1, current_date - 14);
  perform test_assert(r = '42501', '[6.24] another org''s supervisor cannot mark all at A1, got ' || r);
  r := public.test_mark_all('00000000-0000-0000-0000-000000000a03', '20000000-0000-0000-0000-00000000dead', current_date - 14);
  perform test_assert(r = '42501', '[6.25] a missing site gives the same 42501 as a forbidden one, got ' || r);

  perform test_as_anon();
  s := null;
  begin
    perform public.mark_all_present(a1, current_date - 14);
  exception when others then s := sqlstate; end;
  perform test_assert(s = '42501', '[6.26] anon cannot execute mark_all_present, got ' || coalesce(s, 'no error'));
  reset role;

  select count(*) into n from public.attendance_entries where site_id = a1 and attendance_date = current_date - 14;
  perform test_assert(n = 0, '[6.27] the refused calls wrote no entry, found ' || n);
end $$;

-- ======================================================= 7. cross-org swaps

do $$
declare r text;
        a03 constant uuid := '00000000-0000-0000-0000-000000000a03';
begin
  -- Own site, another org's org_id: the composite foreign key refuses the pair.
  r := public.test_add_day(a03, '20000000-0000-0000-0000-0000000000a1', current_date - 21,
                           '10000000-0000-0000-0000-00000000000b');
  perform test_assert(r = '23503', '[7.01] a day pairing A1 with org B is refused, got ' || r);

  r := public.test_add_entry(a03, '20000000-0000-0000-0000-0000000000a1', current_date - 6,
                             '77000000-0000-0000-0000-000000000002', 'present', 0, null,
                             '10000000-0000-0000-0000-00000000000b');
  perform test_assert(r = '23503', '[7.02] an entry pairing A1 with org B finds no day and is refused, got ' || r);

  -- Another org's site.
  r := public.test_add_day(a03, '20000000-0000-0000-0000-0000000000b1', current_date - 21,
                           '10000000-0000-0000-0000-00000000000b');
  perform test_assert(r = '42501', '[7.03] a supervisor cannot open a day at another org''s site, got ' || r);

  -- Org B's people against org A's site.
  r := public.test_add_day('00000000-0000-0000-0000-000000000b03', '20000000-0000-0000-0000-0000000000a1', current_date - 21);
  perform test_assert(r = '42501', '[7.04] another org''s supervisor cannot open a day at A1, got ' || r);
  r := public.test_add_day('00000000-0000-0000-0000-000000000b01', '20000000-0000-0000-0000-0000000000a1', current_date - 21,
                           '10000000-0000-0000-0000-00000000000b');
  perform test_assert(r = '42501', '[7.05] another org''s owner cannot open a day at A1, got ' || r);
  r := public.test_add_entry('00000000-0000-0000-0000-000000000b03', '20000000-0000-0000-0000-0000000000a1', current_date - 6,
                             '77000000-0000-0000-0000-000000000002');
  perform test_assert(r = '42501', '[7.06] another org''s supervisor cannot create an entry at A1, got ' || r);

  -- A supervisor of org B recording for their own site with org A's worker.
  r := public.test_add_day('00000000-0000-0000-0000-000000000b03', '20000000-0000-0000-0000-0000000000b1', current_date - 6,
                           '10000000-0000-0000-0000-00000000000b');
  perform test_assert(r = 'ok', '[7.07] org B''s supervisor can open a day at their own site, got ' || r);
  r := public.test_add_entry('00000000-0000-0000-0000-000000000b03', '20000000-0000-0000-0000-0000000000b1', current_date - 6,
                             '77000000-0000-0000-0000-000000000002', 'present', 0, null,
                             '10000000-0000-0000-0000-00000000000b');
  perform test_assert(r = '23503', '[7.08] an org A worker cannot be marked at an org B site, got ' || r);
  r := public.test_add_entry('00000000-0000-0000-0000-000000000b03', '20000000-0000-0000-0000-0000000000b1', current_date - 6,
                             '77000000-0000-0000-0000-0000000000b1', 'present', 0, null,
                             '10000000-0000-0000-0000-00000000000b');
  perform test_assert(r = 'ok', '[7.09] and org B''s own worker can, got ' || r);
end $$;

-- ================================================================= 8. audit
-- Every case counts the audit_log rows after a watermark taken just before its
-- action, and reads them as the superuser (audit_log is closed to clients).

do $$
declare w bigint; n int; a public.audit_log; r text; eid uuid;
        a03 constant uuid := '00000000-0000-0000-0000-000000000a03';
        a1  constant uuid := '20000000-0000-0000-0000-0000000000a1';
begin
  -- A day.
  select coalesce(max(id), 0) into w from audit_log;
  r := public.test_add_day(a03, a1, current_date - 2);
  perform test_assert(r = 'ok', '[8.01] fixture day, got ' || r);
  select count(*) into n from audit_log where id > w;
  perform test_assert(n = 1, '[8.02] opening a day wrote exactly 1 audit row, wrote ' || n);
  select * into a from audit_log where id > w;
  perform test_assert(a.table_name = 'attendance_days' and a.operation = 'INSERT'
                      and a.actor_id = a03 and a.org_id = '10000000-0000-0000-0000-00000000000a'
                      and a.old_data is null and a.new_data ->> 'status' = 'open',
    '[8.03] the row says attendance_days / INSERT with the supervisor as actor and the org of the day');

  -- An entry insert.
  select coalesce(max(id), 0) into w from audit_log;
  r := public.test_add_entry(a03, a1, current_date - 2, '77000000-0000-0000-0000-000000000001');
  perform test_assert(r = 'ok', '[8.04] fixture entry, got ' || r);
  select count(*) into n from audit_log where id > w;
  perform test_assert(n = 1, '[8.05] adding an entry wrote exactly 1 audit row, wrote ' || n);
  select * into a from audit_log where id > w;
  perform test_assert(a.table_name = 'attendance_entries' and a.operation = 'INSERT' and a.actor_id = a03
                      and a.org_id = '10000000-0000-0000-0000-00000000000a'
                      and a.new_data ->> 'worker_id' = '77000000-0000-0000-0000-000000000001',
    '[8.06] the row says attendance_entries / INSERT with the supervisor as actor');
  eid := a.row_id;

  -- An entry update.
  select coalesce(max(id), 0) into w from audit_log;
  r := public.test_edit_entry(a03, eid, 'half_day', 2, 'left early');
  perform test_assert(r = 'ok:1', '[8.07] fixture edit, got ' || r);
  select count(*) into n from audit_log where id > w;
  perform test_assert(n = 1, '[8.08] editing an entry wrote exactly 1 audit row, wrote ' || n);
  select * into a from audit_log where id > w;
  perform test_assert(a.operation = 'UPDATE' and a.row_id = eid and a.actor_id = a03
                      and a.old_data ->> 'status' = 'present' and a.new_data ->> 'status' = 'half_day'
                      and a.new_data ->> 'note' = 'left early',
    '[8.09] the UPDATE row shows present -> half_day and the note, with the caller as actor');

  -- mark_all_present writes through the same triggers: one row per row created.
  select coalesce(max(id), 0) into w from audit_log;
  r := public.test_mark_all(a03, a1, current_date - 1);
  perform test_assert(r = 'ok:1', '[8.10] mark-all on day -1 creates w1 only, got ' || r);
  select count(*) into n from audit_log where id > w;
  perform test_assert(n = 2, '[8.11] mark-all wrote 1 day row and 1 entry row and nothing else, wrote ' || n);
  select count(*) into n from audit_log where id > w and actor_id = a03;
  perform test_assert(n = 2, '[8.12] both rows name the caller as actor, found ' || n);

  -- Blocked writes leave no audit row: an error rolls back with its row (including
  -- one raised by the AFTER roster trigger), and an UPDATE filtered to 0 rows fires
  -- no row trigger.
  select coalesce(max(id), 0) into w from audit_log;
  r := public.test_add_day('00000000-0000-0000-0000-000000000a02', a1, current_date - 22);
  perform test_assert(r = '42501', '[8.13] a project manager day insert is blocked, got ' || r);
  r := public.test_add_entry('00000000-0000-0000-0000-000000000a04', a1, current_date - 6, '77000000-0000-0000-0000-000000000002');
  perform test_assert(r = '42501', '[8.14] another site''s supervisor entry insert is blocked, got ' || r);
  r := public.test_add_entry(a03, a1, current_date - 7, '77000000-0000-0000-0000-000000000006');
  perform test_assert(r = '23514', '[8.15] an unrostered worker is refused by the roster rule, got ' || r);
  r := public.test_edit_entry('00000000-0000-0000-0000-000000000a05', eid, 'absent', 0, null);
  perform test_assert(r = 'ok:0', '[8.16] an accountant edit touches 0 rows, got ' || r);
  r := public.test_edit_entry(a03, eid, 'half_day', 99, null);
  perform test_assert(r = '23514', '[8.17] an out-of-range overtime is refused, got ' || r);
  r := public.test_mark_all('00000000-0000-0000-0000-000000000a04', a1, current_date - 14);
  perform test_assert(r = '42501', '[8.18] a blocked mark-all raises 42501, got ' || r);
  select count(*) into n from audit_log where id > w;
  perform test_assert(n = 0, '[8.19] the blocked writes left no audit row, left ' || n);
end $$;

rollback;
