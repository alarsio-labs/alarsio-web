-- Sites module: sites, site_assignments, archive_site(). Issue #8.
-- pgTAP, run by `supabase test db`. Everything happens in one transaction and
-- is rolled back, so the database is left as it was.
--
-- Assumes Identity's predicates behave as agreed in the spec:
--   can_manage_sites(org)  true for owner and project_manager of that org
--   has_site_access(site)  true for owner and project_manager on every site of
--                          their org, and for a supervisor on assigned sites
-- Audit rows are not asserted yet: write_audit() does not exist.

begin;
create extension if not exists pgtap with schema extensions;

select plan(57);

-- ----------------------------------------------------------------- helpers

create schema tests;
grant usage on schema tests to anon, authenticated;

-- Act as a signed-in user: auth.uid() reads this claim.
create function tests.login(p_uid uuid) returns void
language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;

-- Rows touched by a statement. Under RLS a blocked UPDATE raises nothing and
-- touches 0 rows, so "no error" proves nothing; this counts.
create function tests.affected(p_sql text) returns integer
language plpgsql as $$
declare n integer;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end;
$$;

grant execute on all functions in schema tests to anon, authenticated;

-- ---------------------------------------------------------------- fixtures
-- Inserted as the migration owner, so RLS does not apply here.

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000a01', 'owner-a@test.local'),
  ('00000000-0000-0000-0000-000000000a02', 'pm-a@test.local'),
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
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000a02', 'project_manager'),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000a03', 'supervisor'),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000a04', 'supervisor'),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000a05', 'accountant'),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000b01', 'owner'),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000b03', 'supervisor');

insert into public.sites (id, org_id, name, address, latitude, longitude, status, created_by) values
  ('20000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a', 'A One', 'Pune',   18.520400, 73.856700, 'active', '00000000-0000-0000-0000-000000000a01'),
  ('20000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a', 'A Two', 'Nagpur', 21.145800, 79.088200, 'active', '00000000-0000-0000-0000-000000000a01'),
  ('20000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-00000000000b', 'B One', 'Indore', 22.719600, 75.857700, 'active', '00000000-0000-0000-0000-000000000b01');

-- sup-a is assigned to A One only.
insert into public.site_assignments (org_id, site_id, user_id, assigned_by) values
  ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-000000000a03', '00000000-0000-0000-0000-000000000a01');

-- ========================================================== 1. constraints
-- Checked as the owner role: a check constraint applies whoever writes.

select throws_ok($$ insert into public.sites (org_id, name, address, latitude, longitude, created_by)
  values ('10000000-0000-0000-0000-00000000000a', 'Lat high', 'x', 90.000001, 0, '00000000-0000-0000-0000-000000000a01') $$,
  '23514', null, 'latitude above 90 is rejected');
select throws_ok($$ insert into public.sites (org_id, name, address, latitude, longitude, created_by)
  values ('10000000-0000-0000-0000-00000000000a', 'Lat low', 'x', -90.000001, 0, '00000000-0000-0000-0000-000000000a01') $$,
  '23514', null, 'latitude below -90 is rejected');
select throws_ok($$ insert into public.sites (org_id, name, address, latitude, longitude, created_by)
  values ('10000000-0000-0000-0000-00000000000a', 'Lng high', 'x', 0, 180.000001, '00000000-0000-0000-0000-000000000a01') $$,
  '23514', null, 'longitude above 180 is rejected');
select throws_ok($$ insert into public.sites (org_id, name, address, latitude, longitude, created_by)
  values ('10000000-0000-0000-0000-00000000000a', 'Lng low', 'x', 0, -180.000001, '00000000-0000-0000-0000-000000000a01') $$,
  '23514', null, 'longitude below -180 is rejected');
select lives_ok($$ insert into public.sites (org_id, name, address, latitude, longitude, created_by)
  values ('10000000-0000-0000-0000-00000000000a', 'Edge max', 'x', 90, 180, '00000000-0000-0000-0000-000000000a01') $$,
  'latitude 90 and longitude 180 are accepted');
select lives_ok($$ insert into public.sites (org_id, name, address, latitude, longitude, created_by)
  values ('10000000-0000-0000-0000-00000000000a', 'Edge min', 'x', -90, -180, '00000000-0000-0000-0000-000000000a01') $$,
  'latitude -90 and longitude -180 are accepted');

select throws_ok($$ insert into public.sites (org_id, name, address, latitude, longitude, geofence_radius_m, created_by)
  values ('10000000-0000-0000-0000-00000000000a', 'R49', 'x', 0, 0, 49, '00000000-0000-0000-0000-000000000a01') $$,
  '23514', null, 'radius 49 m is rejected');
select throws_ok($$ insert into public.sites (org_id, name, address, latitude, longitude, geofence_radius_m, created_by)
  values ('10000000-0000-0000-0000-00000000000a', 'R2001', 'x', 0, 0, 2001, '00000000-0000-0000-0000-000000000a01') $$,
  '23514', null, 'radius 2001 m is rejected');
select lives_ok($$ insert into public.sites (org_id, name, address, latitude, longitude, geofence_radius_m, created_by)
  values ('10000000-0000-0000-0000-00000000000a', 'R50', 'x', 0, 0, 50, '00000000-0000-0000-0000-000000000a01') $$,
  'radius 50 m is accepted');
select lives_ok($$ insert into public.sites (org_id, name, address, latitude, longitude, geofence_radius_m, created_by)
  values ('10000000-0000-0000-0000-00000000000a', 'R2000', 'x', 0, 0, 2000, '00000000-0000-0000-0000-000000000a01') $$,
  'radius 2000 m is accepted');

select throws_ok($$ insert into public.sites (org_id, name, address, latitude, longitude, status, created_by)
  values ('10000000-0000-0000-0000-00000000000a', 'Bad status', 'x', 0, 0, 'deleted', '00000000-0000-0000-0000-000000000a01') $$,
  '23514', null, 'an unknown status is rejected');
select throws_ok($$ insert into public.sites (org_id, name, address, latitude, longitude, created_by)
  values ('10000000-0000-0000-0000-00000000000a', '   ', 'x', 0, 0, '00000000-0000-0000-0000-000000000a01') $$,
  '23514', null, 'a blank name is rejected');
select throws_ok($$ insert into public.sites (org_id, name, address, latitude, longitude, created_by)
  values ('10000000-0000-0000-0000-00000000000a', ' Padded ', 'x', 0, 0, '00000000-0000-0000-0000-000000000a01') $$,
  '23514', null, 'an untrimmed name is rejected');
select throws_ok($$ insert into public.sites (org_id, name, address, latitude, longitude, created_by)
  values ('10000000-0000-0000-0000-00000000000a', 'a one', 'x', 0, 0, '00000000-0000-0000-0000-000000000a01') $$,
  '23505', null, 'a name differing only in case is rejected within one org');
select lives_ok($$ insert into public.sites (org_id, name, address, latitude, longitude, created_by)
  values ('10000000-0000-0000-0000-00000000000b', 'A One', 'x', 0, 0, '00000000-0000-0000-0000-000000000b01') $$,
  'the same name is allowed in another org');
select throws_ok($$ insert into public.sites (org_id, name, address, latitude, longitude, status, created_by)
  values ('10000000-0000-0000-0000-00000000000a', 'Half archived', 'x', 0, 0, 'archived', '00000000-0000-0000-0000-000000000a01') $$,
  '23514', null, 'archived without archived_at is rejected');

-- ============================================================ 2. supervisor

select tests.login('00000000-0000-0000-0000-000000000a03');
set local role authenticated;

select results_eq($$ select id from public.sites order by id $$,
  $$ values ('20000000-0000-0000-0000-0000000000a1'::uuid) $$,
  'supervisor sees exactly their assigned site');
select is((select count(*)::int from public.sites where id = '20000000-0000-0000-0000-0000000000a2'),
  0, 'supervisor cannot read an unassigned site in their org by id');
select is((select count(*)::int from public.sites where id = '20000000-0000-0000-0000-0000000000b1'),
  0, 'supervisor cannot read another org''s site by id');
select throws_ok($$ insert into public.sites (org_id, name, address, latitude, longitude)
  values ('10000000-0000-0000-0000-00000000000a', 'Sup site', 'x', 0, 0) $$,
  '42501', null, 'supervisor cannot create a site');
select is(tests.affected($$ update public.sites set name = 'Renamed' where id = '20000000-0000-0000-0000-0000000000a1' $$),
  0, 'supervisor update of their own site touches 0 rows');
select throws_ok($$ delete from public.sites where id = '20000000-0000-0000-0000-0000000000a1' $$,
  '42501', null, 'supervisor cannot delete a site');
select throws_ok($$ truncate public.sites cascade $$,
  '42501', null, 'supervisor cannot truncate sites');
select throws_ok($$ insert into public.site_assignments (org_id, site_id, user_id)
  values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000a04') $$,
  '42501', null, 'supervisor cannot assign anyone');
select throws_ok($$ select public.archive_site('20000000-0000-0000-0000-0000000000a1') $$,
  '42501', null, 'supervisor cannot archive a site');

reset role;

-- ============================================================ 3. accountant

select tests.login('00000000-0000-0000-0000-000000000a05');
set local role authenticated;

select throws_ok($$ insert into public.sites (org_id, name, address, latitude, longitude)
  values ('10000000-0000-0000-0000-00000000000a', 'Acct site', 'x', 0, 0) $$,
  '42501', null, 'accountant cannot create a site');
select is(tests.affected($$ update public.sites set name = 'Renamed' where id = '20000000-0000-0000-0000-0000000000a2' $$),
  0, 'accountant update touches 0 rows');
select throws_ok($$ insert into public.site_assignments (org_id, site_id, user_id)
  values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000a04') $$,
  '42501', null, 'accountant cannot assign anyone');
select throws_ok($$ select public.archive_site('20000000-0000-0000-0000-0000000000a2') $$,
  '42501', null, 'accountant cannot archive a site');

reset role;

-- ================================================================= 4. owner

select tests.login('00000000-0000-0000-0000-000000000a01');
set local role authenticated;

select lives_ok($$ insert into public.sites (org_id, name, address, latitude, longitude)
  values ('10000000-0000-0000-0000-00000000000a', 'Owner new', 'Nashik', 19.997500, 73.789800) $$,
  'owner can create a site in their org');
select throws_ok($$ insert into public.sites (org_id, name, address, latitude, longitude)
  values ('10000000-0000-0000-0000-00000000000b', 'Into B', 'x', 0, 0) $$,
  '42501', null, 'owner cannot create a site in another org');
select is(tests.affected($$ update public.sites set name = 'A Two Renamed' where id = '20000000-0000-0000-0000-0000000000a2' $$),
  1, 'owner can edit a site in their org');
select is(tests.affected($$ update public.sites set name = 'Hijack' where id = '20000000-0000-0000-0000-0000000000b1' $$),
  0, 'owner update of another org''s site touches 0 rows');
select throws_ok($$ update public.sites set org_id = '10000000-0000-0000-0000-00000000000b' where id = '20000000-0000-0000-0000-0000000000a2' $$,
  '42501', null, 'org_id cannot be changed');
select throws_ok($$ update public.sites set status = 'archived' where id = '20000000-0000-0000-0000-0000000000a2' $$,
  '42501', null, 'a plain update cannot archive a site');
select throws_ok($$ delete from public.sites where id = '20000000-0000-0000-0000-0000000000a2' $$,
  '42501', null, 'owner cannot delete a site');

reset role;
select is((select count(*)::int from public.sites where id = '20000000-0000-0000-0000-0000000000a2'),
  1, 'the site is still there after the delete attempts');

-- =========================================================== 5. assignments

select tests.login('00000000-0000-0000-0000-000000000a02');   -- project manager
set local role authenticated;

select throws_ok($$ insert into public.site_assignments (org_id, site_id, user_id)
  values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000b03') $$,
  '23503', null, 'a user from another org cannot be assigned');
select throws_ok($$ insert into public.site_assignments (org_id, site_id, user_id)
  values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000a04') $$,
  '23503', null, 'another org''s site cannot be used by swapping its id in');
select throws_ok($$ insert into public.site_assignments (org_id, site_id, user_id)
  values ('10000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000b03') $$,
  '42501', null, 'a manager cannot assign inside another org');
select lives_ok($$ insert into public.site_assignments (org_id, site_id, user_id)
  values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000a04') $$,
  'project manager can assign a member to a site');
select throws_ok($$ insert into public.site_assignments (org_id, site_id, user_id)
  values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000a04') $$,
  '23505', null, 'a second open assignment for the same user and site is rejected');
select is(tests.affected($$ update public.site_assignments set unassigned_at = '2000-01-01'
  where site_id = '20000000-0000-0000-0000-0000000000a2' and user_id = '00000000-0000-0000-0000-000000000a04' $$),
  1, 'project manager can unassign');

reset role;
select ok((select unassigned_at = now() and unassigned_by = '00000000-0000-0000-0000-000000000a02'
             from public.site_assignments
            where site_id = '20000000-0000-0000-0000-0000000000a2' and user_id = '00000000-0000-0000-0000-000000000a04'),
  'unassign is stamped with server time and the caller, not the client''s value');
set local role authenticated;

select is(tests.affected($$ update public.site_assignments set unassigned_at = now()
  where site_id = '20000000-0000-0000-0000-0000000000a2' and user_id = '00000000-0000-0000-0000-000000000a04' $$),
  0, 'a closed assignment cannot be updated again');
select lives_ok($$ insert into public.site_assignments (org_id, site_id, user_id)
  values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000a04') $$,
  'the user can be reassigned after being unassigned');
select throws_ok($$ delete from public.site_assignments where site_id = '20000000-0000-0000-0000-0000000000a2' $$,
  '42501', null, 'an assignment cannot be deleted');

reset role;

-- =============================================================== 6. archive

select tests.login('00000000-0000-0000-0000-000000000b01');   -- owner of org B
set local role authenticated;
select throws_ok($$ select public.archive_site('20000000-0000-0000-0000-0000000000a1') $$,
  '42501', null, 'an owner cannot archive another org''s site');
reset role;

select tests.login('00000000-0000-0000-0000-000000000a01');   -- owner of org A
set local role authenticated;

select throws_ok($$ select public.archive_site('20000000-0000-0000-0000-00000000dead') $$,
  '42501', null, 'a missing site gives the same error as a forbidden one');
select lives_ok($$ select public.archive_site('20000000-0000-0000-0000-0000000000a1') $$,
  'owner can archive a site');

reset role;
select ok((select status = 'archived' and archived_at = now() and archived_by = '00000000-0000-0000-0000-000000000a01'
             from public.sites where id = '20000000-0000-0000-0000-0000000000a1'),
  'archive sets status, archived_at and archived_by');
select is((select count(*)::int from public.site_assignments
            where site_id = '20000000-0000-0000-0000-0000000000a1' and unassigned_at is null),
  0, 'archiving closes every open assignment on the site');
set local role authenticated;

select lives_ok($$ select public.archive_site('20000000-0000-0000-0000-0000000000a1') $$,
  'archiving an archived site again succeeds and does nothing');
select is(tests.affected($$ update public.sites set name = 'Edited after archive' where id = '20000000-0000-0000-0000-0000000000a1' $$),
  0, 'an archived site is read-only: update touches 0 rows');
select throws_ok($$ insert into public.site_assignments (org_id, site_id, user_id)
  values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000a04') $$,
  '55000', null, 'an archived site cannot get a new assignment');

reset role;

-- ================================================================== 7. anon

set local role anon;
select throws_ok($$ select public.archive_site('20000000-0000-0000-0000-0000000000a2') $$,
  '42501', null, 'anon cannot execute archive_site');
select throws_ok($$ select id from public.sites $$,
  '42501', null, 'anon cannot read sites');
reset role;

select * from finish();
rollback;
