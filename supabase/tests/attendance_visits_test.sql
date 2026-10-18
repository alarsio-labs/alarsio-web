-- Attendance & Site Presence, PR 1: site_visits, the geofence, and the Sites view
-- site_geofence the geofence reads. Issue #28, decisions D1-D13 in ADR-021.
--
-- Plain postgres:15 with auth_shim.sql, no PostGIS: the distance is pure SQL.
--
-- Conventions as in sites_test.sql:
--   * test_as(uuid) / test_as_anon() switch role; every block ends with reset role.
--   * A blocked UPDATE under RLS raises nothing and touches 0 rows, so those cases
--     assert row_count = 0. Errors are asserted by SQLSTATE; the message shows the
--     state actually raised.
--   * The helpers below switch role themselves and return 'ok', 'ok:<rows>' or the
--     SQLSTATE they hit, so a case reads as one line.
--
-- Order of checks inside one INSERT, which fixes the SQLSTATE a case expects:
--   BEFORE triggers, then the policy WITH CHECK, then constraints and foreign keys.
--   The geofence trigger reads site_geofence under the caller's RLS, so a caller who
--   cannot see the site is stopped there with 42501.
--
-- Geofence cases sit on the equator, where 1 degree of longitude is about
-- 111 195 m: 0.000449 deg = 49.93 m, 0.000450 deg = 50.04 m. Coordinates are
-- numeric(9,6), so "exactly on the edge" is not representable; the edge cases are
-- within 0.1 m either side, and the rule is distance <= radius.
begin;

-- ---------------------------------------------------------------- fixtures
-- Org A: owner a01, project manager a02, supervisors a03 (A1, A3, A4), a04 (A2) and
-- a06 (A1), accountant a05 (assigned A1) and a07 (no assignment).
-- Org B: owner b01, supervisor b03 (B1).
-- Sites: A1 (0,0) 50 m · A2 (10,10) 200 m · A3 (0,0) 50 m, archived · A4 (0,0) 2000 m
--        B1 (20,20) 200 m.

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

insert into public.sites (id, org_id, name, address, latitude, longitude, geofence_radius_m, status, created_by) values
  ('20000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a', 'A One',   'Pune',   0,  0,   50, 'active', '00000000-0000-0000-0000-000000000a01'),
  ('20000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a', 'A Two',   'Nagpur', 10, 10, 200, 'active', '00000000-0000-0000-0000-000000000a01'),
  ('20000000-0000-0000-0000-0000000000a3', '10000000-0000-0000-0000-00000000000a', 'A Three', 'Nashik', 0,  0,   50, 'active', '00000000-0000-0000-0000-000000000a01'),
  ('20000000-0000-0000-0000-0000000000a4', '10000000-0000-0000-0000-00000000000a', 'A Four',  'Thane',  0,  0, 2000, 'active', '00000000-0000-0000-0000-000000000a01'),
  ('20000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-00000000000b', 'B One',   'Indore', 20, 20, 200, 'active', '00000000-0000-0000-0000-000000000b01');

insert into public.site_assignments (org_id, site_id, user_id, assigned_by) values
  ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000a03', '00000000-0000-0000-0000-000000000a01'),
  ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-000000000a03', '00000000-0000-0000-0000-000000000a01'),
  ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-000000000a03', '00000000-0000-0000-0000-000000000a01'),
  ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000a04', '00000000-0000-0000-0000-000000000a01'),
  ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000a05', '00000000-0000-0000-0000-000000000a01'),
  ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000a06', '00000000-0000-0000-0000-000000000a01'),
  ('10000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000b03', '00000000-0000-0000-0000-000000000b01');

-- A3 is archived directly, as the superuser: its assignments stay open, so
-- has_site_access is still true for a03 while can_record_on_site is false.
update public.sites
   set status = 'archived', archived_at = now(), archived_by = '00000000-0000-0000-0000-000000000a01'
 where id = '20000000-0000-0000-0000-0000000000a3';

-- Three visits written by the superuser (the triggers still run):
--   V0 a03 at A1 · V2 a04 at A2 · V3 a03 at A3 (archived).
insert into public.site_visits (id, org_id, site_id, user_id, check_in_at, check_in_lat, check_in_lng) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-000000000a03', now() - interval '1 day', 0, 0),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a2',
   '00000000-0000-0000-0000-000000000a04', now() - interval '1 day', 10, 10),
  ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a3',
   '00000000-0000-0000-0000-000000000a03', now() - interval '1 day', 0, 0);

-- ----------------------------------------------------------------- helpers
-- A check-in as p_user. Returns 'ok' or the SQLSTATE raised.
create function public.test_check_in(
  p_user   uuid,
  p_id     uuid,
  p_site   uuid,
  p_lat    numeric,
  p_lng    numeric,
  p_reason text default null,
  p_at     timestamptz default now() - interval '1 hour',
  p_org    uuid default '10000000-0000-0000-0000-00000000000a'
) returns text language plpgsql as $$
declare s text;
begin
  perform test_as(p_user);
  begin
    insert into public.site_visits (id, org_id, site_id, check_in_at, check_in_lat, check_in_lng, check_in_reason)
    values (p_id, p_org, p_site, p_at, p_lat, p_lng, p_reason);
  exception when others then s := sqlstate; end;
  execute 'reset role';
  return coalesce(s, 'ok');
end $$;

-- A check-out as p_user. Returns 'ok:<rows touched>' or the SQLSTATE raised.
create function public.test_check_out(
  p_user   uuid,
  p_id     uuid,
  p_lat    numeric,
  p_lng    numeric,
  p_reason text default null,
  p_at     timestamptz default now() - interval '30 minutes'
) returns text language plpgsql as $$
declare s text; n int;
begin
  perform test_as(p_user);
  begin
    update public.site_visits
       set check_out_at = p_at, check_out_lat = p_lat, check_out_lng = p_lng, check_out_reason = p_reason
     where id = p_id;
    get diagnostics n = row_count;
  exception when others then s := sqlstate; end;
  execute 'reset role';
  return coalesce(s, 'ok:' || n);
end $$;

-- ================================================================= 1. shape

do $$
declare n int;
begin
  perform test_assert((select relrowsecurity from pg_class where oid = 'public.site_visits'::regclass),
    '[1.01] site_visits has RLS enabled');

  perform test_assert(not has_table_privilege('anon', 'public.site_visits', 'select')
                      and not has_table_privilege('anon', 'public.site_visits', 'insert')
                      and not has_table_privilege('anon', 'public.site_visits', 'update')
                      and not has_table_privilege('anon', 'public.site_visits', 'delete'),
    '[1.02] anon holds no privilege on site_visits');

  perform test_assert(has_table_privilege('authenticated', 'public.site_visits', 'select')
                      and not has_table_privilege('authenticated', 'public.site_visits', 'delete')
                      and not has_table_privilege('authenticated', 'public.site_visits', 'truncate'),
    '[1.03] authenticated can select, and cannot delete or truncate');

  perform test_assert(has_column_privilege('authenticated', 'public.site_visits', 'check_in_lat', 'insert')
                      and has_column_privilege('authenticated', 'public.site_visits', 'check_in_reason', 'insert')
                      and not has_column_privilege('authenticated', 'public.site_visits', 'check_in_distance_m', 'insert')
                      and not has_column_privilege('authenticated', 'public.site_visits', 'check_in_outside_geofence', 'insert')
                      and not has_column_privilege('authenticated', 'public.site_visits', 'user_id', 'insert')
                      and not has_column_privilege('authenticated', 'public.site_visits', 'check_out_at', 'insert'),
    '[1.04] insert is limited to the check-in columns the phone captures');

  perform test_assert(has_column_privilege('authenticated', 'public.site_visits', 'check_out_at', 'update')
                      and has_column_privilege('authenticated', 'public.site_visits', 'check_out_lat', 'update')
                      and has_column_privilege('authenticated', 'public.site_visits', 'check_out_lng', 'update')
                      and has_column_privilege('authenticated', 'public.site_visits', 'check_out_reason', 'update')
                      and not has_column_privilege('authenticated', 'public.site_visits', 'check_in_lat', 'update')
                      and not has_column_privilege('authenticated', 'public.site_visits', 'check_out_distance_m', 'update')
                      and not has_column_privilege('authenticated', 'public.site_visits', 'user_id', 'update')
                      and not has_column_privilege('authenticated', 'public.site_visits', 'site_id', 'update'),
    '[1.05] update is limited to the four check-out columns');

  select count(*) into n from pg_indexes
   where schemaname = 'public' and tablename = 'site_visits' and indexdef like '%(site_id, check_in_at)%';
  perform test_assert(n = 1, '[1.06] site_visits is indexed on (site_id, check_in_at), found ' || n);

  select count(*) into n from pg_indexes
   where schemaname = 'public' and tablename = 'site_visits' and indexdef like '%(user_id, check_in_at)%';
  perform test_assert(n = 1, '[1.07] site_visits is indexed on (user_id, check_in_at), found ' || n);

  -- Location lives only in the check-in and check-out columns of site_visits.
  select count(*) into n from information_schema.columns
   where table_schema = 'public'
     and table_name in ('site_visits', 'attendance_days', 'attendance_entries')
     and column_name ~ '(^|_)(lat|lng|latitude|longitude)$';
  perform test_assert(n = 4, '[1.08] exactly four coordinate columns exist across the attendance tables, found ' || n);

  -- The Sites view the geofence reads (D9).
  perform test_assert(
    (select reloptions @> array['security_invoker=true'] from pg_class where oid = 'public.site_geofence'::regclass),
    '[1.09] site_geofence is security_invoker');
  perform test_assert(
    (select array_agg(attname::text order by attnum) from pg_attribute
      where attrelid = 'public.site_geofence'::regclass and attnum > 0 and not attisdropped)
    = array['id', 'org_id', 'latitude', 'longitude', 'geofence_radius_m'],
    '[1.10] site_geofence has exactly id, org_id, latitude, longitude, geofence_radius_m');
  perform test_assert(not has_table_privilege('anon', 'public.site_geofence', 'select'),
    '[1.11] anon cannot read site_geofence');

  -- A trigger wired AFTER ... FOR EACH ROW on insert, update and delete (tgtype 29),
  -- enabled, and the only write_audit trigger on the table.
  select count(*) into n from pg_trigger
   where tgrelid = 'public.site_visits'::regclass and tgname = 'site_visits_audit'
     and tgtype = 29 and tgenabled = 'O' and tgfoid = 'public.write_audit()'::regprocedure;
  perform test_assert(n = 1, '[1.12] site_visits_audit is AFTER INSERT OR UPDATE OR DELETE FOR EACH ROW, enabled');
  select count(*) into n from pg_trigger
   where tgrelid = 'public.site_visits'::regclass and tgfoid = 'public.write_audit()'::regprocedure;
  perform test_assert(n = 1, '[1.13] it is the only write_audit trigger on site_visits, found ' || n);
end $$;

-- site_geofence reads through the caller's RLS on sites.
do $$
declare n int;
begin
  perform test_as('00000000-0000-0000-0000-000000000a01');          -- owner A
  select count(*) into n from public.site_geofence;
  perform test_assert(n = 4, '[1.14] owner sees the 4 sites of their org in site_geofence, saw ' || n);
  reset role;

  perform test_as('00000000-0000-0000-0000-000000000a04');          -- supervisor of A2
  select count(*) into n from public.site_geofence;
  perform test_assert(n = 1, '[1.15] a supervisor sees only their site in site_geofence, saw ' || n);
  select count(*) into n from public.site_geofence where id = '20000000-0000-0000-0000-0000000000a1';
  perform test_assert(n = 0, '[1.16] a supervisor cannot read another site''s geofence by id, saw ' || n);
  reset role;

  perform test_as('00000000-0000-0000-0000-000000000b03');          -- supervisor B
  select count(*) into n from public.site_geofence where org_id = '10000000-0000-0000-0000-00000000000a';
  perform test_assert(n = 0, '[1.17] another org''s supervisor reads no geofence of org A, saw ' || n);
  reset role;
end $$;

-- ===================================================== 2. role x operation
-- Fixtures V0 (a03, A1), V2 (a04, A2), V3 (a03, A3 archived) are the only visits.

do $$
declare s text; n int;
begin
  -- owner and project manager: read the whole org, record nothing.
  foreach s in array array['00000000-0000-0000-0000-000000000a01', '00000000-0000-0000-0000-000000000a02'] loop
    perform test_as(s::uuid);
    select count(*) into n from public.site_visits;
    perform test_assert(n = 3, '[2.01] ' || s || ' reads every visit of their org, saw ' || n);
    reset role;

    perform test_assert(
      public.test_check_in(s::uuid, '30000000-0000-0000-0000-000000000101', '20000000-0000-0000-0000-0000000000a1', 0, 0) = '42501',
      '[2.02] ' || s || ' cannot check in (supervisor-only recording)');

    perform test_assert(
      public.test_check_out(s::uuid, '30000000-0000-0000-0000-000000000001', 0, 0) = 'ok:0',
      '[2.03] ' || s || ' check-out touches 0 rows');
  end loop;
end $$;

do $$
declare s text; n int;
begin
  -- assigned supervisor a03 (A1, A3, A4): reads own sites' visits, not A2's.
  perform test_as('00000000-0000-0000-0000-000000000a03');
  select count(*) into n from public.site_visits;
  perform test_assert(n = 2, '[2.04] a03 sees the visits of A1 and A3 only, saw ' || n);
  select count(*) into n from public.site_visits where id = '30000000-0000-0000-0000-000000000002';
  perform test_assert(n = 0, '[2.05] a03 cannot read another site''s visit by id, saw ' || n);

  s := null;
  begin
    delete from public.site_visits where id = '30000000-0000-0000-0000-000000000001';
  exception when others then s := sqlstate; end;
  perform test_assert(s = '42501', '[2.06] a supervisor cannot delete a visit, got ' || coalesce(s, 'no error'));

  s := null;
  begin
    truncate public.site_visits;
  exception when others then s := sqlstate; end;
  perform test_assert(s = '42501', '[2.07] a supervisor cannot truncate site_visits, got ' || coalesce(s, 'no error'));
  reset role;

  -- a04 (A2 only): sees only its own site, cannot touch A1's visit.
  perform test_as('00000000-0000-0000-0000-000000000a04');
  select count(*) into n from public.site_visits;
  perform test_assert(n = 1, '[2.08] a04 sees only A2''s visit, saw ' || n);
  reset role;
  perform test_assert(
    public.test_check_out('00000000-0000-0000-0000-000000000a04', '30000000-0000-0000-0000-000000000001', 0, 0) = 'ok:0',
    '[2.09] a supervisor of another site cannot check out someone else''s visit (0 rows)');
  perform test_assert(
    public.test_check_in('00000000-0000-0000-0000-000000000a04', '30000000-0000-0000-0000-000000000102', '20000000-0000-0000-0000-0000000000a1', 0, 0) = '42501',
    '[2.10] a supervisor not assigned to the site cannot check in there');

  -- a06 shares A1 with a03: reads a03's visit, cannot check it out.
  perform test_as('00000000-0000-0000-0000-000000000a06');
  select count(*) into n from public.site_visits;
  perform test_assert(n = 1, '[2.11] a06 sees A1''s visit, saw ' || n);
  reset role;
  perform test_assert(
    public.test_check_out('00000000-0000-0000-0000-000000000a06', '30000000-0000-0000-0000-000000000001', 0, 0) = 'ok:0',
    '[2.12] a colleague on the same site cannot check out another supervisor''s visit (0 rows)');

  -- accountant a05 is assigned to A1: reads, records nothing. a07 has no assignment.
  perform test_as('00000000-0000-0000-0000-000000000a05');
  select count(*) into n from public.site_visits;
  perform test_assert(n = 1, '[2.13] an assigned accountant reads the visits of their site, saw ' || n);
  s := null;
  begin
    delete from public.site_visits where id = '30000000-0000-0000-0000-000000000001';
  exception when others then s := sqlstate; end;
  perform test_assert(s = '42501', '[2.14] an accountant cannot delete a visit, got ' || coalesce(s, 'no error'));
  reset role;
  perform test_assert(
    public.test_check_in('00000000-0000-0000-0000-000000000a05', '30000000-0000-0000-0000-000000000103', '20000000-0000-0000-0000-0000000000a1', 0, 0) = '42501',
    '[2.15] an accountant cannot check in');
  perform test_assert(
    public.test_check_out('00000000-0000-0000-0000-000000000a05', '30000000-0000-0000-0000-000000000001', 0, 0) = 'ok:0',
    '[2.16] an accountant check-out touches 0 rows');

  perform test_as('00000000-0000-0000-0000-000000000a07');
  select count(*) into n from public.site_visits;
  perform test_assert(n = 0, '[2.17] an unassigned accountant reads no visit, saw ' || n);
  reset role;

  -- org B: nothing of org A is readable or writable.
  perform test_as('00000000-0000-0000-0000-000000000b01');
  select count(*) into n from public.site_visits;
  perform test_assert(n = 0, '[2.18] another org''s owner reads no visit, saw ' || n);
  reset role;
  perform test_as('00000000-0000-0000-0000-000000000b03');
  select count(*) into n from public.site_visits;
  perform test_assert(n = 0, '[2.19] another org''s supervisor reads no visit, saw ' || n);
  reset role;
  perform test_assert(
    public.test_check_out('00000000-0000-0000-0000-000000000b03', '30000000-0000-0000-0000-000000000001', 0, 0) = 'ok:0',
    '[2.20] another org''s supervisor check-out touches 0 rows');

  -- anon
  perform test_as_anon();
  s := null;
  begin
    perform id from public.site_visits;
  exception when others then s := sqlstate; end;
  perform test_assert(s = '42501', '[2.21] anon cannot read site_visits, got ' || coalesce(s, 'no error'));
  s := null;
  begin
    insert into public.site_visits (id, org_id, site_id, check_in_at, check_in_lat, check_in_lng)
    values ('30000000-0000-0000-0000-000000000104', '10000000-0000-0000-0000-00000000000a',
            '20000000-0000-0000-0000-0000000000a1', now(), 0, 0);
  exception when others then s := sqlstate; end;
  perform test_assert(s = '42501', '[2.22] anon cannot insert a visit, got ' || coalesce(s, 'no error'));
  reset role;
end $$;

-- ============================================================= 3. geofence
-- A1 (0,0) radius 50, checked in by a03. Read the stored flag and distance back
-- as the superuser.

do $$
declare r text; v public.site_visits; long_reason text := repeat('x', 501);
begin
  -- Inside, on the pin, no reason.
  r := public.test_check_in('00000000-0000-0000-0000-000000000a03', '30000000-0000-0000-0000-000000000201',
         '20000000-0000-0000-0000-0000000000a1', 0, 0);
  perform test_assert(r = 'ok', '[3.01] a check-in on the pin needs no reason, got ' || r);
  select * into v from public.site_visits where id = '30000000-0000-0000-0000-000000000201';
  perform test_assert(v.check_in_outside_geofence is false and v.check_in_distance_m = 0.0,
    '[3.02] on the pin: not flagged, distance 0.0, got ' || v.check_in_outside_geofence || ' / ' || v.check_in_distance_m);
  perform test_assert(v.user_id = '00000000-0000-0000-0000-000000000a03'
                      and v.org_id = '10000000-0000-0000-0000-00000000000a'
                      and v.check_out_at is null and v.check_out_outside_geofence is null,
    '[3.03] the row carries the caller as user_id and an empty check-out leg');

  -- Edge, inside by 0.07 m.
  r := public.test_check_in('00000000-0000-0000-0000-000000000a03', '30000000-0000-0000-0000-000000000202',
         '20000000-0000-0000-0000-0000000000a1', 0, 0.000449);
  perform test_assert(r = 'ok', '[3.04] 49.93 m from a 50 m fence is inside and needs no reason, got ' || r);
  select * into v from public.site_visits where id = '30000000-0000-0000-0000-000000000202';
  perform test_assert(v.check_in_outside_geofence is false and abs(v.check_in_distance_m - 49.9) < 0.11,
    '[3.05] edge inside: not flagged, distance about 49.9, got ' || v.check_in_outside_geofence || ' / ' || v.check_in_distance_m);

  -- The same edge on the other side of the pin (west, and south).
  r := public.test_check_in('00000000-0000-0000-0000-000000000a03', '30000000-0000-0000-0000-000000000203',
         '20000000-0000-0000-0000-0000000000a1', -0.000449, -0.000001);
  perform test_assert(r = 'ok', '[3.06] a point just inside to the south-west needs no reason, got ' || r);

  -- Edge, outside by 0.04 m: refused without a reason, with a blank one, or with a padded one.
  r := public.test_check_in('00000000-0000-0000-0000-000000000a03', '30000000-0000-0000-0000-000000000204',
         '20000000-0000-0000-0000-0000000000a1', 0, 0.000450);
  perform test_assert(r = '23514', '[3.07] 50.04 m from a 50 m fence with no reason is refused, got ' || r);

  r := public.test_check_in('00000000-0000-0000-0000-000000000a03', '30000000-0000-0000-0000-000000000204',
         '20000000-0000-0000-0000-0000000000a1', 0, 0.000450, '   ');
  perform test_assert(r = '23514', '[3.08] a blank reason is refused, got ' || r);

  r := public.test_check_in('00000000-0000-0000-0000-000000000a03', '30000000-0000-0000-0000-000000000204',
         '20000000-0000-0000-0000-0000000000a1', 0, 0.000450, ' gate across road ');
  perform test_assert(r = '23514', '[3.09] a reason with leading or trailing spaces is refused, got ' || r);

  r := public.test_check_in('00000000-0000-0000-0000-000000000a03', '30000000-0000-0000-0000-000000000204',
         '20000000-0000-0000-0000-0000000000a1', 0, 0.000450, long_reason);
  perform test_assert(r = '23514', '[3.10] a 501-character reason is refused, got ' || r);

  perform test_assert((select count(*) from public.site_visits where id = '30000000-0000-0000-0000-000000000204') = 0,
    '[3.11] the refused attempts left no row');

  -- Outside with a reason: accepted and flagged, distance stored.
  r := public.test_check_in('00000000-0000-0000-0000-000000000a03', '30000000-0000-0000-0000-000000000205',
         '20000000-0000-0000-0000-0000000000a1', 0, 0.000450, 'Gate is across the road');
  perform test_assert(r = 'ok', '[3.12] outside with a reason is accepted, got ' || r);
  select * into v from public.site_visits where id = '30000000-0000-0000-0000-000000000205';
  perform test_assert(v.check_in_outside_geofence is true and abs(v.check_in_distance_m - 50.0) < 0.11
                      and v.check_in_reason = 'Gate is across the road',
    '[3.13] edge outside: flagged, distance about 50.0, reason kept, got ' || v.check_in_outside_geofence || ' / ' || v.check_in_distance_m);

  -- Far outside: about 111 195 m for one degree of latitude.
  r := public.test_check_in('00000000-0000-0000-0000-000000000a03', '30000000-0000-0000-0000-000000000206',
         '20000000-0000-0000-0000-0000000000a1', 1, 0, 'Checked in from the wrong city');
  perform test_assert(r = 'ok', '[3.14] a far-away check-in with a reason is accepted, got ' || r);
  select * into v from public.site_visits where id = '30000000-0000-0000-0000-000000000206';
  perform test_assert(v.check_in_outside_geofence is true and v.check_in_distance_m between 111100 and 111300,
    '[3.15] one degree of latitude is about 111 195 m, stored ' || v.check_in_distance_m);

  -- A reason given while inside is kept and does not flag.
  r := public.test_check_in('00000000-0000-0000-0000-000000000a03', '30000000-0000-0000-0000-000000000207',
         '20000000-0000-0000-0000-0000000000a1', 0, 0.0001, 'Just a note');
  perform test_assert(r = 'ok', '[3.16] a reason while inside is accepted, got ' || r);
  select * into v from public.site_visits where id = '30000000-0000-0000-0000-000000000207';
  perform test_assert(v.check_in_outside_geofence is false and v.check_in_reason = 'Just a note',
    '[3.17] a reason while inside does not flag the visit');

  -- The radius is the site's own: 2000 m at A4.
  r := public.test_check_in('00000000-0000-0000-0000-000000000a03', '30000000-0000-0000-0000-000000000208',
         '20000000-0000-0000-0000-0000000000a4', 0, 0.017);
  perform test_assert(r = 'ok', '[3.18] 1890 m from a 2000 m fence is inside, got ' || r);
  r := public.test_check_in('00000000-0000-0000-0000-000000000a03', '30000000-0000-0000-0000-000000000209',
         '20000000-0000-0000-0000-0000000000a4', 0, 0.018);
  perform test_assert(r = '23514', '[3.19] 2001 m from a 2000 m fence without a reason is refused, got ' || r);

  -- The same point is inside a 2000 m fence and outside a 50 m one.
  r := public.test_check_in('00000000-0000-0000-0000-000000000a03', '30000000-0000-0000-0000-00000000020a',
         '20000000-0000-0000-0000-0000000000a1', 0, 0.017);
  perform test_assert(r = '23514', '[3.20] 1890 m from a 50 m fence without a reason is refused, got ' || r);
end $$;

-- The phone cannot choose the flag or the distance, or whose visit this is.
do $$
declare s text;
begin
  perform test_as('00000000-0000-0000-0000-000000000a03');

  s := null;
  begin
    insert into public.site_visits (id, org_id, site_id, check_in_at, check_in_lat, check_in_lng, check_in_outside_geofence)
    values ('30000000-0000-0000-0000-000000000211', '10000000-0000-0000-0000-00000000000a',
            '20000000-0000-0000-0000-0000000000a1', now(), 1, 0, false);
  exception when others then s := sqlstate; end;
  perform test_assert(s = '42501', '[3.21] the phone cannot set the outside flag, got ' || coalesce(s, 'no error'));

  s := null;
  begin
    insert into public.site_visits (id, org_id, site_id, check_in_at, check_in_lat, check_in_lng, check_in_distance_m)
    values ('30000000-0000-0000-0000-000000000212', '10000000-0000-0000-0000-00000000000a',
            '20000000-0000-0000-0000-0000000000a1', now(), 1, 0, 0);
  exception when others then s := sqlstate; end;
  perform test_assert(s = '42501', '[3.22] the phone cannot set the distance, got ' || coalesce(s, 'no error'));

  s := null;
  begin
    insert into public.site_visits (id, org_id, site_id, user_id, check_in_at, check_in_lat, check_in_lng)
    values ('30000000-0000-0000-0000-000000000213', '10000000-0000-0000-0000-00000000000a',
            '20000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000a06', now(), 0, 0);
  exception when others then s := sqlstate; end;
  perform test_assert(s = '42501', '[3.23] a visit cannot be created in someone else''s name, got ' || coalesce(s, 'no error'));

  s := null;
  begin
    insert into public.site_visits (id, org_id, site_id, check_in_at, check_in_lat, check_in_lng, check_out_at)
    values ('30000000-0000-0000-0000-000000000214', '10000000-0000-0000-0000-00000000000a',
            '20000000-0000-0000-0000-0000000000a1', now(), 0, 0, now());
  exception when others then s := sqlstate; end;
  perform test_assert(s = '42501', '[3.24] a visit cannot be created already checked out, got ' || coalesce(s, 'no error'));

  reset role;
end $$;

-- ====================================================== 4. clock and ranges

do $$
declare r text;
begin
  r := public.test_check_in('00000000-0000-0000-0000-000000000a03', '30000000-0000-0000-0000-000000000301',
         '20000000-0000-0000-0000-0000000000a1', 0, 0, null, now() + interval '23 hours');
  perform test_assert(r = 'ok', '[4.01] a phone clock 23 hours ahead is within the 1-day tolerance, got ' || r);

  r := public.test_check_in('00000000-0000-0000-0000-000000000a03', '30000000-0000-0000-0000-000000000302',
         '20000000-0000-0000-0000-0000000000a1', 0, 0, null, now() + interval '25 hours');
  perform test_assert(r = '23514', '[4.02] a phone clock 25 hours ahead is refused, got ' || r);

  r := public.test_check_in('00000000-0000-0000-0000-000000000a03', '30000000-0000-0000-0000-000000000303',
         '20000000-0000-0000-0000-0000000000a1', 0, 0, null, now() - interval '10 days');
  perform test_assert(r = 'ok', '[4.03] a check-in made offline 10 days ago is accepted, got ' || r);
  perform test_assert(
    (select created_at > check_in_at + interval '9 days' from public.site_visits where id = '30000000-0000-0000-0000-000000000303'),
    '[4.04] created_at is the server''s time, check_in_at the phone''s');

  r := public.test_check_in('00000000-0000-0000-0000-000000000a03', '30000000-0000-0000-0000-000000000304',
         '20000000-0000-0000-0000-0000000000a1', 90.000001, 0, 'x');
  perform test_assert(r = '23514', '[4.05] latitude above 90 is refused, got ' || r);

  r := public.test_check_in('00000000-0000-0000-0000-000000000a03', '30000000-0000-0000-0000-000000000305',
         '20000000-0000-0000-0000-0000000000a1', 0, -180.000001, 'x');
  perform test_assert(r = '23514', '[4.06] longitude below -180 is refused, got ' || r);

  r := public.test_check_in('00000000-0000-0000-0000-000000000a03', '30000000-0000-0000-0000-000000000306',
         '20000000-0000-0000-0000-0000000000a1', 0, 0);
  perform test_assert(r = 'ok', '[4.07] a fresh uuid is accepted, got ' || r);
  r := public.test_check_in('00000000-0000-0000-0000-000000000a03', '30000000-0000-0000-0000-000000000306',
         '20000000-0000-0000-0000-0000000000a1', 0, 0);
  perform test_assert(r = '23505', '[4.08] the same phone-made id twice is a unique violation, got ' || r);
end $$;

-- ============================================================ 5. check-out
-- D1: check-out sets the check-out columns of the same row, once. Visits c1..c6.

do $$
declare r text; v public.site_visits;
begin
  r := public.test_check_in('00000000-0000-0000-0000-000000000a03', '30000000-0000-0000-0000-000000000401',
         '20000000-0000-0000-0000-0000000000a1', 0, 0, null, now() - interval '3 hours');
  perform test_assert(r = 'ok', '[5.00] fixture check-in, got ' || r);

  r := public.test_check_out('00000000-0000-0000-0000-000000000a03', '30000000-0000-0000-0000-000000000401', 0, 0);
  perform test_assert(r = 'ok:1', '[5.01] the visit''s own supervisor can check out inside the fence, got ' || r);
  select * into v from public.site_visits where id = '30000000-0000-0000-0000-000000000401';
  perform test_assert(v.check_out_at is not null and v.check_out_outside_geofence is false and v.check_out_distance_m = 0.0
                      and v.check_in_lat = 0 and v.check_in_lng = 0 and v.check_in_outside_geofence is false,
    '[5.02] check-out filled the same row, left the check-in leg alone, and stamped the distance');

  r := public.test_check_out('00000000-0000-0000-0000-000000000a03', '30000000-0000-0000-0000-000000000401', 0, 0);
  perform test_assert(r = 'ok:0', '[5.03] a second check-out changes 0 rows (it can be set once), got ' || r);

  -- Outside on check-out follows the same rule as check-in (D8).
  r := public.test_check_in('00000000-0000-0000-0000-000000000a03', '30000000-0000-0000-0000-000000000402',
         '20000000-0000-0000-0000-0000000000a1', 0, 0, null, now() - interval '3 hours');
  r := public.test_check_out('00000000-0000-0000-0000-000000000a03', '30000000-0000-0000-0000-000000000402', 0, 0.000450);
  perform test_assert(r = '23514', '[5.04] checking out outside the fence with no reason is refused, got ' || r);
  r := public.test_check_out('00000000-0000-0000-0000-000000000a03', '30000000-0000-0000-0000-000000000402', 0, 0.000450, '  ');
  perform test_assert(r = '23514', '[5.05] a blank check-out reason is refused, got ' || r);
  r := public.test_check_out('00000000-0000-0000-0000-000000000a03', '30000000-0000-0000-0000-000000000402', 0, 0.000450, 'Left for the bank');
  perform test_assert(r = 'ok:1', '[5.06] checking out outside with a reason is accepted, got ' || r);
  select * into v from public.site_visits where id = '30000000-0000-0000-0000-000000000402';
  perform test_assert(v.check_out_outside_geofence is true and v.check_out_reason = 'Left for the bank'
                      and v.check_in_outside_geofence is false,
    '[5.07] the check-out leg is flagged on its own, the check-in leg is not');

  -- Check-out before check-in.
  r := public.test_check_in('00000000-0000-0000-0000-000000000a03', '30000000-0000-0000-0000-000000000403',
         '20000000-0000-0000-0000-0000000000a1', 0, 0, null, now() - interval '2 hours');
  r := public.test_check_out('00000000-0000-0000-0000-000000000a03', '30000000-0000-0000-0000-000000000403', 0, 0, null, now() - interval '3 hours');
  perform test_assert(r = '23514', '[5.08] a check-out earlier than the check-in is refused, got ' || r);

  -- A check-out with no coordinates.
  r := public.test_check_in('00000000-0000-0000-0000-000000000a03', '30000000-0000-0000-0000-000000000404',
         '20000000-0000-0000-0000-0000000000a1', 0, 0, null, now() - interval '2 hours');
  r := public.test_check_out('00000000-0000-0000-0000-000000000a03', '30000000-0000-0000-0000-000000000404', null, null);
  perform test_assert(r = '23514', '[5.09] a check-out time with no location is refused, got ' || r);
  r := public.test_check_out('00000000-0000-0000-0000-000000000a03', '30000000-0000-0000-0000-000000000404', 0, null);
  perform test_assert(r = '23514', '[5.10] a check-out with only a latitude is refused, got ' || r);

  -- Phone clock too far ahead on check-out.
  r := public.test_check_out('00000000-0000-0000-0000-000000000a03', '30000000-0000-0000-0000-000000000404', 0, 0, null, now() + interval '25 hours');
  perform test_assert(r = '23514', '[5.11] a check-out 25 hours ahead is refused, got ' || r);

  perform test_assert((select check_out_at is null from public.site_visits where id = '30000000-0000-0000-0000-000000000404'),
    '[5.12] the refused check-outs left the visit open');

  -- An archived site is closed to recording: the visit cannot be checked out.
  r := public.test_check_out('00000000-0000-0000-0000-000000000a03', '30000000-0000-0000-0000-000000000003', 0, 0);
  perform test_assert(r = 'ok:0', '[5.13] a visit on an archived site cannot be checked out (0 rows), got ' || r);
  r := public.test_check_in('00000000-0000-0000-0000-000000000a03', '30000000-0000-0000-0000-000000000405',
         '20000000-0000-0000-0000-0000000000a3', 0, 0);
  perform test_assert(r = '42501', '[5.14] nobody can check in on an archived site, got ' || r);
end $$;

-- Columns the phone may not change after the fact.
do $$
declare s text; n int;
begin
  perform test_as('00000000-0000-0000-0000-000000000a03');

  s := null;
  begin
    update public.site_visits set check_in_lat = 5 where id = '30000000-0000-0000-0000-000000000402';
  exception when others then s := sqlstate; end;
  perform test_assert(s = '42501', '[5.15] a check-in coordinate cannot be edited afterwards, got ' || coalesce(s, 'no error'));

  s := null;
  begin
    update public.site_visits set check_in_at = now() where id = '30000000-0000-0000-0000-000000000404';
  exception when others then s := sqlstate; end;
  perform test_assert(s = '42501', '[5.16] the check-in time cannot be edited afterwards, got ' || coalesce(s, 'no error'));

  s := null;
  begin
    update public.site_visits set user_id = '00000000-0000-0000-0000-000000000a06' where id = '30000000-0000-0000-0000-000000000404';
  exception when others then s := sqlstate; end;
  perform test_assert(s = '42501', '[5.17] a visit cannot be handed to someone else, got ' || coalesce(s, 'no error'));

  s := null;
  begin
    update public.site_visits set site_id = '20000000-0000-0000-0000-0000000000a4' where id = '30000000-0000-0000-0000-000000000404';
  exception when others then s := sqlstate; end;
  perform test_assert(s = '42501', '[5.18] a visit cannot move to another site, got ' || coalesce(s, 'no error'));

  s := null;
  begin
    update public.site_visits set check_out_outside_geofence = false where id = '30000000-0000-0000-0000-000000000404';
  exception when others then s := sqlstate; end;
  perform test_assert(s = '42501', '[5.19] the check-out flag cannot be written by the phone, got ' || coalesce(s, 'no error'));

  reset role;
end $$;

-- ======================================================= 6. cross-org swaps

do $$
declare r text;
begin
  -- A site of another organisation: refused by the geofence read or the policy.
  r := public.test_check_in('00000000-0000-0000-0000-000000000a03', '30000000-0000-0000-0000-000000000501',
         '20000000-0000-0000-0000-0000000000b1', 20, 20);
  perform test_assert(r = '42501', '[6.01] a supervisor cannot check in at another org''s site, got ' || r);

  -- Own site, other org's org_id: the composite foreign key refuses the pair.
  r := public.test_check_in('00000000-0000-0000-0000-000000000a03', '30000000-0000-0000-0000-000000000502',
         '20000000-0000-0000-0000-0000000000a1', 0, 0, null, now() - interval '1 hour',
         '10000000-0000-0000-0000-00000000000b');
  perform test_assert(r = '23503', '[6.02] a site paired with another org''s org_id is refused, got ' || r);

  -- Org B people against org A's site.
  r := public.test_check_in('00000000-0000-0000-0000-000000000b03', '30000000-0000-0000-0000-000000000503',
         '20000000-0000-0000-0000-0000000000a1', 0, 0);
  perform test_assert(r = '42501', '[6.03] another org''s supervisor cannot check in at A1, got ' || r);
  r := public.test_check_in('00000000-0000-0000-0000-000000000b01', '30000000-0000-0000-0000-000000000504',
         '20000000-0000-0000-0000-0000000000a1', 0, 0, null, now() - interval '1 hour',
         '10000000-0000-0000-0000-00000000000b');
  perform test_assert(r = '42501', '[6.04] another org''s owner cannot check in at A1, got ' || r);

  -- A site id that does not exist gives the same answer as one that is not yours.
  r := public.test_check_in('00000000-0000-0000-0000-000000000a03', '30000000-0000-0000-0000-000000000505',
         '20000000-0000-0000-0000-00000000dead', 0, 0);
  perform test_assert(r = '42501', '[6.05] a missing site gives the same 42501 as a forbidden one, got ' || r);
end $$;

-- ================================================================= 7. audit
-- site_visits_audit writes one audit_log row per changed row. audit_log is closed
-- to every client, so each block reads it as the superuser. Every case counts the
-- rows after a watermark taken just before its action.

do $$
declare w bigint; n int; a public.audit_log; r text;
begin
  select coalesce(max(id), 0) into w from audit_log;
  r := public.test_check_in('00000000-0000-0000-0000-000000000a03', '30000000-0000-0000-0000-000000000601',
         '20000000-0000-0000-0000-0000000000a1', 0, 0, null, now() - interval '2 hours');
  perform test_assert(r = 'ok', '[7.01] fixture check-in, got ' || r);

  select count(*) into n from audit_log where id > w;
  perform test_assert(n = 1, '[7.02] a check-in wrote exactly 1 audit row, wrote ' || n);
  select * into a from audit_log where id > w;
  perform test_assert(a.table_name = 'site_visits' and a.operation = 'INSERT'
                      and a.row_id = '30000000-0000-0000-0000-000000000601',
    '[7.03] the row says site_visits / INSERT and row_id is the visit id');
  perform test_assert(a.actor_id = '00000000-0000-0000-0000-000000000a03'
                      and a.org_id = '10000000-0000-0000-0000-00000000000a',
    '[7.04] actor_id is the supervisor and org_id the visit''s org');
  perform test_assert(a.old_data is null
                      and a.new_data ->> 'site_id' = '20000000-0000-0000-0000-0000000000a1'
                      and a.new_data ->> 'check_in_outside_geofence' = 'false',
    '[7.05] INSERT has no old_data and new_data holds the row, including the server-stamped flag');

  select coalesce(max(id), 0) into w from audit_log;
  r := public.test_check_out('00000000-0000-0000-0000-000000000a03', '30000000-0000-0000-0000-000000000601', 0, 0);
  perform test_assert(r = 'ok:1', '[7.06] fixture check-out, got ' || r);
  select count(*) into n from audit_log where id > w;
  perform test_assert(n = 1, '[7.07] a check-out wrote exactly 1 audit row, wrote ' || n);
  select * into a from audit_log where id > w;
  perform test_assert(a.operation = 'UPDATE' and a.row_id = '30000000-0000-0000-0000-000000000601'
                      and a.actor_id = '00000000-0000-0000-0000-000000000a03'
                      and a.old_data ->> 'check_out_at' is null and a.new_data ->> 'check_out_at' is not null,
    '[7.08] the UPDATE row shows check_out_at going from null to set, with the caller as actor');

  -- Blocked writes leave no audit row: an error rolls back with its row, and an
  -- UPDATE filtered to 0 rows fires no row trigger.
  select coalesce(max(id), 0) into w from audit_log;
  r := public.test_check_in('00000000-0000-0000-0000-000000000a04', '30000000-0000-0000-0000-000000000602',
         '20000000-0000-0000-0000-0000000000a1', 0, 0);
  perform test_assert(r = '42501', '[7.09] a blocked check-in raises 42501, got ' || r);
  r := public.test_check_in('00000000-0000-0000-0000-000000000a01', '30000000-0000-0000-0000-000000000603',
         '20000000-0000-0000-0000-0000000000a1', 0, 0);
  perform test_assert(r = '42501', '[7.10] an owner check-in raises 42501, got ' || r);
  r := public.test_check_out('00000000-0000-0000-0000-000000000a05', '30000000-0000-0000-0000-000000000001', 0, 0);
  perform test_assert(r = 'ok:0', '[7.11] an accountant check-out touches 0 rows, got ' || r);
  r := public.test_check_in('00000000-0000-0000-0000-000000000a03', '30000000-0000-0000-0000-000000000604',
         '20000000-0000-0000-0000-0000000000a1', 0, 0.000450);
  perform test_assert(r = '23514', '[7.12] a refused outside check-in raises 23514, got ' || r);
  select count(*) into n from audit_log where id > w;
  perform test_assert(n = 0, '[7.13] the blocked writes left no audit row, left ' || n);
end $$;

rollback;
