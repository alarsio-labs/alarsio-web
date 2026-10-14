-- Sites module: sites, site_assignments, archive_site(), and their audit trail.
-- Issue #8. Runs on the team runner (supabase/tests/run.sh): plain postgres:15,
-- auth_shim.sql, psql. One transaction, rolled back, so the database is left as
-- it was. Sections 1-7 carry the 57 cases of the first version, tagged [S.NN],
-- plus [4.09]-[4.12] (editing pin and radius, moving between free statuses);
-- section 8 adds the audit cases.
--
-- Conventions, as in identity_test.sql:
--   * test_as(uuid) / test_as_anon() switch role; every block ends with reset role.
--   * Under RLS a blocked UPDATE raises nothing and touches 0 rows, so those
--     cases assert row_count = 0. Errors are asserted by SQLSTATE, and the
--     failure message shows the state actually raised.
--
-- ASSUMES these Identity predicates, which are NOT created here. Until they
-- exist, migration 20261009160000 fails and this suite cannot run.
--   can_manage_sites(org_id uuid) -> boolean
--       true for owner and project_manager of that org; false for supervisor,
--       accountant, a non-member, and the other org's people.
--   has_site_access(site_id uuid) -> boolean
--       true for owner and project_manager on every site of their org, so their
--       UPDATE ... WHERE can see the row; for a supervisor true only on a site
--       where they hold an open assignment; false across orgs; false, not an
--       error, for a site that does not exist.
--   Both SECURITY DEFINER with search_path = public (has_site_access reads
--   sites and site_assignments under policies that call it, so it must not
--   recurse into RLS), and EXECUTE granted to authenticated.
-- Not asserted here: whether an accountant passes has_site_access, and whether
-- a closed assignment still lets a supervisor read the site.
begin;

-- ---------------------------------------------------------------- fixtures
-- Inserted as the superuser, so RLS does not apply and the audit rows they
-- produce have a null actor.
-- Org A: owner a01, project manager a02, supervisors a03 and a04, accountant a05.
-- Org B: owner b01, supervisor b03.

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

-- sup-a (a03) is assigned to A One only.
insert into public.site_assignments (org_id, site_id, user_id, assigned_by) values
  ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-000000000a03', '00000000-0000-0000-0000-000000000a01');

-- ========================================================== 1. constraints
-- Run as the superuser: a check or unique constraint applies whoever writes.

do $$
declare s text;
begin
  s := null;
  begin
    insert into public.sites (org_id, name, address, latitude, longitude, created_by)
    values ('10000000-0000-0000-0000-00000000000a', 'Lat high', 'x', 90.000001, 0, '00000000-0000-0000-0000-000000000a01');
  exception when others then s := sqlstate; end;
  perform test_assert(s = '23514', '[1.01] latitude above 90 is rejected, got ' || coalesce(s, 'no error'));

  s := null;
  begin
    insert into public.sites (org_id, name, address, latitude, longitude, created_by)
    values ('10000000-0000-0000-0000-00000000000a', 'Lat low', 'x', -90.000001, 0, '00000000-0000-0000-0000-000000000a01');
  exception when others then s := sqlstate; end;
  perform test_assert(s = '23514', '[1.02] latitude below -90 is rejected, got ' || coalesce(s, 'no error'));

  s := null;
  begin
    insert into public.sites (org_id, name, address, latitude, longitude, created_by)
    values ('10000000-0000-0000-0000-00000000000a', 'Lng high', 'x', 0, 180.000001, '00000000-0000-0000-0000-000000000a01');
  exception when others then s := sqlstate; end;
  perform test_assert(s = '23514', '[1.03] longitude above 180 is rejected, got ' || coalesce(s, 'no error'));

  s := null;
  begin
    insert into public.sites (org_id, name, address, latitude, longitude, created_by)
    values ('10000000-0000-0000-0000-00000000000a', 'Lng low', 'x', 0, -180.000001, '00000000-0000-0000-0000-000000000a01');
  exception when others then s := sqlstate; end;
  perform test_assert(s = '23514', '[1.04] longitude below -180 is rejected, got ' || coalesce(s, 'no error'));

  s := null;
  begin
    insert into public.sites (org_id, name, address, latitude, longitude, created_by)
    values ('10000000-0000-0000-0000-00000000000a', 'Edge max', 'x', 90, 180, '00000000-0000-0000-0000-000000000a01');
  exception when others then s := sqlstate; end;
  perform test_assert(s is null, '[1.05] latitude 90 and longitude 180 are accepted, got ' || coalesce(s, 'no error'));

  s := null;
  begin
    insert into public.sites (org_id, name, address, latitude, longitude, created_by)
    values ('10000000-0000-0000-0000-00000000000a', 'Edge min', 'x', -90, -180, '00000000-0000-0000-0000-000000000a01');
  exception when others then s := sqlstate; end;
  perform test_assert(s is null, '[1.06] latitude -90 and longitude -180 are accepted, got ' || coalesce(s, 'no error'));

  s := null;
  begin
    insert into public.sites (org_id, name, address, latitude, longitude, geofence_radius_m, created_by)
    values ('10000000-0000-0000-0000-00000000000a', 'R49', 'x', 0, 0, 49, '00000000-0000-0000-0000-000000000a01');
  exception when others then s := sqlstate; end;
  perform test_assert(s = '23514', '[1.07] radius 49 m is rejected, got ' || coalesce(s, 'no error'));

  s := null;
  begin
    insert into public.sites (org_id, name, address, latitude, longitude, geofence_radius_m, created_by)
    values ('10000000-0000-0000-0000-00000000000a', 'R2001', 'x', 0, 0, 2001, '00000000-0000-0000-0000-000000000a01');
  exception when others then s := sqlstate; end;
  perform test_assert(s = '23514', '[1.08] radius 2001 m is rejected, got ' || coalesce(s, 'no error'));

  s := null;
  begin
    insert into public.sites (org_id, name, address, latitude, longitude, geofence_radius_m, created_by)
    values ('10000000-0000-0000-0000-00000000000a', 'R50', 'x', 0, 0, 50, '00000000-0000-0000-0000-000000000a01');
  exception when others then s := sqlstate; end;
  perform test_assert(s is null, '[1.09] radius 50 m is accepted, got ' || coalesce(s, 'no error'));

  s := null;
  begin
    insert into public.sites (org_id, name, address, latitude, longitude, geofence_radius_m, created_by)
    values ('10000000-0000-0000-0000-00000000000a', 'R2000', 'x', 0, 0, 2000, '00000000-0000-0000-0000-000000000a01');
  exception when others then s := sqlstate; end;
  perform test_assert(s is null, '[1.10] radius 2000 m is accepted, got ' || coalesce(s, 'no error'));

  s := null;
  begin
    insert into public.sites (org_id, name, address, latitude, longitude, status, created_by)
    values ('10000000-0000-0000-0000-00000000000a', 'Bad status', 'x', 0, 0, 'deleted', '00000000-0000-0000-0000-000000000a01');
  exception when others then s := sqlstate; end;
  perform test_assert(s = '23514', '[1.11] an unknown status is rejected, got ' || coalesce(s, 'no error'));

  s := null;
  begin
    insert into public.sites (org_id, name, address, latitude, longitude, created_by)
    values ('10000000-0000-0000-0000-00000000000a', '   ', 'x', 0, 0, '00000000-0000-0000-0000-000000000a01');
  exception when others then s := sqlstate; end;
  perform test_assert(s = '23514', '[1.12] a blank name is rejected, got ' || coalesce(s, 'no error'));

  s := null;
  begin
    insert into public.sites (org_id, name, address, latitude, longitude, created_by)
    values ('10000000-0000-0000-0000-00000000000a', ' Padded ', 'x', 0, 0, '00000000-0000-0000-0000-000000000a01');
  exception when others then s := sqlstate; end;
  perform test_assert(s = '23514', '[1.13] an untrimmed name is rejected, got ' || coalesce(s, 'no error'));

  s := null;
  begin
    insert into public.sites (org_id, name, address, latitude, longitude, created_by)
    values ('10000000-0000-0000-0000-00000000000a', 'a one', 'x', 0, 0, '00000000-0000-0000-0000-000000000a01');
  exception when others then s := sqlstate; end;
  perform test_assert(s = '23505', '[1.14] a name differing only in case is rejected within one org, got ' || coalesce(s, 'no error'));

  s := null;
  begin
    insert into public.sites (org_id, name, address, latitude, longitude, created_by)
    values ('10000000-0000-0000-0000-00000000000b', 'A One', 'x', 0, 0, '00000000-0000-0000-0000-000000000b01');
  exception when others then s := sqlstate; end;
  perform test_assert(s is null, '[1.15] the same name is allowed in another org, got ' || coalesce(s, 'no error'));

  s := null;
  begin
    insert into public.sites (org_id, name, address, latitude, longitude, status, created_by)
    values ('10000000-0000-0000-0000-00000000000a', 'Half archived', 'x', 0, 0, 'archived', '00000000-0000-0000-0000-000000000a01');
  exception when others then s := sqlstate; end;
  perform test_assert(s = '23514', '[1.16] archived without archived_at is rejected, got ' || coalesce(s, 'no error'));
end $$;

-- ============================================================ 2. supervisor
-- sup-a (a03) holds A One only.

do $$
declare s text; n int; ids uuid[];
begin
  perform test_as('00000000-0000-0000-0000-000000000a03');

  select array_agg(id order by id) into ids from public.sites;
  perform test_assert(ids = array['20000000-0000-0000-0000-0000000000a1']::uuid[],
    '[2.01] supervisor sees exactly their assigned site, saw ' || coalesce(ids::text, 'nothing'));

  select count(*) into n from public.sites where id = '20000000-0000-0000-0000-0000000000a2';
  perform test_assert(n = 0, '[2.02] supervisor cannot read an unassigned site in their org by id, saw ' || n);

  select count(*) into n from public.sites where id = '20000000-0000-0000-0000-0000000000b1';
  perform test_assert(n = 0, '[2.03] supervisor cannot read another org''s site by id, saw ' || n);

  s := null;
  begin
    insert into public.sites (org_id, name, address, latitude, longitude)
    values ('10000000-0000-0000-0000-00000000000a', 'Sup site', 'x', 0, 0);
  exception when others then s := sqlstate; end;
  perform test_assert(s = '42501', '[2.04] supervisor cannot create a site, got ' || coalesce(s, 'no error'));

  update public.sites set name = 'Renamed' where id = '20000000-0000-0000-0000-0000000000a1';
  get diagnostics n = row_count;
  perform test_assert(n = 0, '[2.05] supervisor update of their own site touches 0 rows, touched ' || n);

  s := null;
  begin
    delete from public.sites where id = '20000000-0000-0000-0000-0000000000a1';
  exception when others then s := sqlstate; end;
  perform test_assert(s = '42501', '[2.06] supervisor cannot delete a site, got ' || coalesce(s, 'no error'));

  s := null;
  begin
    truncate public.sites cascade;
  exception when others then s := sqlstate; end;
  perform test_assert(s = '42501', '[2.07] supervisor cannot truncate sites, got ' || coalesce(s, 'no error'));

  s := null;
  begin
    insert into public.site_assignments (org_id, site_id, user_id)
    values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000a04');
  exception when others then s := sqlstate; end;
  perform test_assert(s = '42501', '[2.08] supervisor cannot assign anyone, got ' || coalesce(s, 'no error'));

  s := null;
  begin
    perform public.archive_site('20000000-0000-0000-0000-0000000000a1');
  exception when others then s := sqlstate; end;
  perform test_assert(s = '42501', '[2.09] supervisor cannot archive a site, got ' || coalesce(s, 'no error'));

  reset role;
end $$;

-- ============================================================ 3. accountant

do $$
declare s text; n int;
begin
  perform test_as('00000000-0000-0000-0000-000000000a05');

  s := null;
  begin
    insert into public.sites (org_id, name, address, latitude, longitude)
    values ('10000000-0000-0000-0000-00000000000a', 'Acct site', 'x', 0, 0);
  exception when others then s := sqlstate; end;
  perform test_assert(s = '42501', '[3.01] accountant cannot create a site, got ' || coalesce(s, 'no error'));

  update public.sites set name = 'Renamed' where id = '20000000-0000-0000-0000-0000000000a2';
  get diagnostics n = row_count;
  perform test_assert(n = 0, '[3.02] accountant update touches 0 rows, touched ' || n);

  s := null;
  begin
    insert into public.site_assignments (org_id, site_id, user_id)
    values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000a04');
  exception when others then s := sqlstate; end;
  perform test_assert(s = '42501', '[3.03] accountant cannot assign anyone, got ' || coalesce(s, 'no error'));

  s := null;
  begin
    perform public.archive_site('20000000-0000-0000-0000-0000000000a2');
  exception when others then s := sqlstate; end;
  perform test_assert(s = '42501', '[3.04] accountant cannot archive a site, got ' || coalesce(s, 'no error'));

  reset role;
end $$;

-- ================================================================= 4. owner

do $$
declare s text; n int;
begin
  perform test_as('00000000-0000-0000-0000-000000000a01');

  s := null;
  begin
    insert into public.sites (org_id, name, address, latitude, longitude)
    values ('10000000-0000-0000-0000-00000000000a', 'Owner new', 'Nashik', 19.997500, 73.789800);
  exception when others then s := sqlstate; end;
  perform test_assert(s is null, '[4.01] owner can create a site in their org, got ' || coalesce(s, 'no error'));

  s := null;
  begin
    insert into public.sites (org_id, name, address, latitude, longitude)
    values ('10000000-0000-0000-0000-00000000000b', 'Into B', 'x', 0, 0);
  exception when others then s := sqlstate; end;
  perform test_assert(s = '42501', '[4.02] owner cannot create a site in another org, got ' || coalesce(s, 'no error'));

  update public.sites set name = 'A Two Renamed' where id = '20000000-0000-0000-0000-0000000000a2';
  get diagnostics n = row_count;
  perform test_assert(n = 1, '[4.03] owner can edit a site in their org, touched ' || n);

  update public.sites set name = 'Hijack' where id = '20000000-0000-0000-0000-0000000000b1';
  get diagnostics n = row_count;
  perform test_assert(n = 0, '[4.04] owner update of another org''s site touches 0 rows, touched ' || n);

  s := null;
  begin
    update public.sites set org_id = '10000000-0000-0000-0000-00000000000b'
     where id = '20000000-0000-0000-0000-0000000000a2';
  exception when others then s := sqlstate; end;
  perform test_assert(s = '42501', '[4.05] org_id cannot be changed, got ' || coalesce(s, 'no error'));

  s := null;
  begin
    update public.sites set status = 'archived' where id = '20000000-0000-0000-0000-0000000000a2';
  exception when others then s := sqlstate; end;
  perform test_assert(s = '42501', '[4.06] a plain update cannot archive a site, got ' || coalesce(s, 'no error'));

  s := null;
  begin
    delete from public.sites where id = '20000000-0000-0000-0000-0000000000a2';
  exception when others then s := sqlstate; end;
  perform test_assert(s = '42501', '[4.07] owner cannot delete a site, got ' || coalesce(s, 'no error'));

  reset role;
  select count(*) into n from public.sites where id = '20000000-0000-0000-0000-0000000000a2';
  perform test_assert(n = 1, '[4.08] the site is still there after the delete attempts, found ' || n);

  -- An owner can edit the address, pin and radius, and move a site among the
  -- four statuses that are free to change. 'archived' is archive_site()'s alone
  -- ([4.06]).
  declare
    st text;
    v  public.sites;
  begin
    perform test_as('00000000-0000-0000-0000-000000000a01');
    update public.sites
       set address = 'Nagpur Ring Road', latitude = 21.150000, longitude = 79.090000,
           geofence_radius_m = 350
     where id = '20000000-0000-0000-0000-0000000000a2';
    get diagnostics n = row_count;
    perform test_assert(n = 1, '[4.09] owner can edit address, pin and radius in one update, touched ' || n);
    reset role;

    select * into v from public.sites where id = '20000000-0000-0000-0000-0000000000a2';
    perform test_assert(v.address = 'Nagpur Ring Road' and v.latitude = 21.150000
                        and v.longitude = 79.090000 and v.geofence_radius_m = 350,
      '[4.10] the edited address, pin and radius persisted');

    perform test_as('00000000-0000-0000-0000-000000000a01');
    foreach st in array array['paused', 'completed', 'planned', 'active'] loop
      update public.sites set status = st where id = '20000000-0000-0000-0000-0000000000a2';
      get diagnostics n = row_count;
      perform test_assert(n = 1, '[4.11] owner can set status ' || st || ', touched ' || n);
    end loop;
    reset role;

    select * into v from public.sites where id = '20000000-0000-0000-0000-0000000000a2';
    perform test_assert(v.status = 'active' and v.archived_at is null and v.archived_by is null,
      '[4.12] after the moves the site is active and carries no archive stamp');
  end;
end $$;

-- =========================================================== 5. assignments
-- Project manager (a02) of org A.

do $$
declare s text; n int; closed_ok boolean;
begin
  perform test_as('00000000-0000-0000-0000-000000000a02');

  s := null;
  begin
    insert into public.site_assignments (org_id, site_id, user_id)
    values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000b03');
  exception when others then s := sqlstate; end;
  perform test_assert(s = '23503', '[5.01] a user from another org cannot be assigned, got ' || coalesce(s, 'no error'));

  s := null;
  begin
    insert into public.site_assignments (org_id, site_id, user_id)
    values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000a04');
  exception when others then s := sqlstate; end;
  perform test_assert(s = '23503', '[5.02] another org''s site cannot be used by swapping its id in, got ' || coalesce(s, 'no error'));

  s := null;
  begin
    insert into public.site_assignments (org_id, site_id, user_id)
    values ('10000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000b03');
  exception when others then s := sqlstate; end;
  perform test_assert(s = '42501', '[5.03] a manager cannot assign inside another org, got ' || coalesce(s, 'no error'));

  s := null;
  begin
    insert into public.site_assignments (org_id, site_id, user_id)
    values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000a04');
  exception when others then s := sqlstate; end;
  perform test_assert(s is null, '[5.04] project manager can assign a member to a site, got ' || coalesce(s, 'no error'));

  s := null;
  begin
    insert into public.site_assignments (org_id, site_id, user_id)
    values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000a04');
  exception when others then s := sqlstate; end;
  perform test_assert(s = '23505', '[5.05] a second open assignment for the same user and site is rejected, got ' || coalesce(s, 'no error'));

  update public.site_assignments set unassigned_at = '2000-01-01'
   where site_id = '20000000-0000-0000-0000-0000000000a2'
     and user_id = '00000000-0000-0000-0000-000000000a04';
  get diagnostics n = row_count;
  perform test_assert(n = 1, '[5.06] project manager can unassign, touched ' || n);

  reset role;
  select (unassigned_at = now() and unassigned_by = '00000000-0000-0000-0000-000000000a02')
    into closed_ok
    from public.site_assignments
   where site_id = '20000000-0000-0000-0000-0000000000a2'
     and user_id = '00000000-0000-0000-0000-000000000a04';
  perform test_assert(closed_ok is true,
    '[5.07] unassign is stamped with server time and the caller, not the client''s value');
  perform test_as('00000000-0000-0000-0000-000000000a02');

  update public.site_assignments set unassigned_at = now()
   where site_id = '20000000-0000-0000-0000-0000000000a2'
     and user_id = '00000000-0000-0000-0000-000000000a04';
  get diagnostics n = row_count;
  perform test_assert(n = 0, '[5.08] a closed assignment cannot be updated again, touched ' || n);

  s := null;
  begin
    insert into public.site_assignments (org_id, site_id, user_id)
    values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000a04');
  exception when others then s := sqlstate; end;
  perform test_assert(s is null, '[5.09] the user can be reassigned after being unassigned, got ' || coalesce(s, 'no error'));

  s := null;
  begin
    delete from public.site_assignments where site_id = '20000000-0000-0000-0000-0000000000a2';
  exception when others then s := sqlstate; end;
  perform test_assert(s = '42501', '[5.10] an assignment cannot be deleted, got ' || coalesce(s, 'no error'));

  reset role;
end $$;

-- =============================================================== 6. archive

do $$
declare s text; n int; archived_ok boolean;
begin
  perform test_as('00000000-0000-0000-0000-000000000b01');          -- owner of org B
  s := null;
  begin
    perform public.archive_site('20000000-0000-0000-0000-0000000000a1');
  exception when others then s := sqlstate; end;
  perform test_assert(s = '42501', '[6.01] an owner cannot archive another org''s site, got ' || coalesce(s, 'no error'));
  reset role;

  perform test_as('00000000-0000-0000-0000-000000000a01');          -- owner of org A

  s := null;
  begin
    perform public.archive_site('20000000-0000-0000-0000-00000000dead');
  exception when others then s := sqlstate; end;
  perform test_assert(s = '42501', '[6.02] a missing site gives the same error as a forbidden one, got ' || coalesce(s, 'no error'));

  s := null;
  begin
    perform public.archive_site('20000000-0000-0000-0000-0000000000a1');
  exception when others then s := sqlstate; end;
  perform test_assert(s is null, '[6.03] owner can archive a site, got ' || coalesce(s, 'no error'));

  reset role;
  select (status = 'archived' and archived_at = now() and archived_by = '00000000-0000-0000-0000-000000000a01')
    into archived_ok
    from public.sites where id = '20000000-0000-0000-0000-0000000000a1';
  perform test_assert(archived_ok is true, '[6.04] archive sets status, archived_at and archived_by');

  select count(*) into n from public.site_assignments
   where site_id = '20000000-0000-0000-0000-0000000000a1' and unassigned_at is null;
  perform test_assert(n = 0, '[6.05] archiving closes every open assignment on the site, ' || n || ' still open');

  perform test_as('00000000-0000-0000-0000-000000000a01');

  s := null;
  begin
    perform public.archive_site('20000000-0000-0000-0000-0000000000a1');
  exception when others then s := sqlstate; end;
  perform test_assert(s is null, '[6.06] archiving an archived site again succeeds and does nothing, got ' || coalesce(s, 'no error'));

  update public.sites set name = 'Edited after archive' where id = '20000000-0000-0000-0000-0000000000a1';
  get diagnostics n = row_count;
  perform test_assert(n = 0, '[6.07] an archived site is read-only: update touches 0 rows, touched ' || n);

  s := null;
  begin
    insert into public.site_assignments (org_id, site_id, user_id)
    values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000a04');
  exception when others then s := sqlstate; end;
  perform test_assert(s = '55000', '[6.08] an archived site cannot get a new assignment, got ' || coalesce(s, 'no error'));

  reset role;
end $$;

-- ================================================================== 7. anon

do $$
declare s text;
begin
  perform test_as_anon();

  s := null;
  begin
    perform public.archive_site('20000000-0000-0000-0000-0000000000a2');
  exception when others then s := sqlstate; end;
  perform test_assert(s = '42501', '[7.01] anon cannot execute archive_site, got ' || coalesce(s, 'no error'));

  s := null;
  begin
    perform id from public.sites;
  exception when others then s := sqlstate; end;
  perform test_assert(s = '42501', '[7.02] anon cannot read sites, got ' || coalesce(s, 'no error'));

  reset role;
end $$;

-- ================================================================ 8. audit
-- sites_audit and site_assignments_audit (20261012100000) write one audit_log
-- row per changed row. audit_log is closed to every client, so each block reads
-- it as the superuser after reset role. Sections 1-7 also write audit rows, so
-- every case counts only the rows after a watermark taken just before its action.
-- Each action runs as its real caller; no RETURNING is used, because a SELECT
-- policy that reads sites may not see a row inserted by the same statement.

-- Fresh fixture for the archive cases: an active site with one open assignment.
insert into public.sites (id, org_id, name, address, latitude, longitude, status, created_by) values
  ('20000000-0000-0000-0000-0000000000c2', '10000000-0000-0000-0000-00000000000a', 'Audit archive', 'Thane', 19.218300, 72.978100, 'active', '00000000-0000-0000-0000-000000000a01');
insert into public.site_assignments (org_id, site_id, user_id, assigned_by) values
  ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000c2',
   '00000000-0000-0000-0000-000000000a04', '00000000-0000-0000-0000-000000000a01');

-- Wiring: AFTER ... FOR EACH ROW on insert, update and delete (tgtype 29 =
-- row 1 + insert 4 + delete 8 + update 16), enabled, and the only write_audit
-- trigger on the table, so a change can never be recorded twice.
do $$
declare n int;
begin
  select count(*) into n from pg_trigger
   where tgrelid = 'public.sites'::regclass and tgname = 'sites_audit'
     and tgtype = 29 and tgenabled = 'O' and tgfoid = 'public.write_audit()'::regprocedure;
  perform test_assert(n = 1, '[8.01] sites_audit is AFTER INSERT OR UPDATE OR DELETE FOR EACH ROW, enabled');

  select count(*) into n from pg_trigger
   where tgrelid = 'public.site_assignments'::regclass and tgname = 'site_assignments_audit'
     and tgtype = 29 and tgenabled = 'O' and tgfoid = 'public.write_audit()'::regprocedure;
  perform test_assert(n = 1, '[8.02] site_assignments_audit is AFTER INSERT OR UPDATE OR DELETE FOR EACH ROW, enabled');
end $$;

-- The fixtures above ran as the superuser with no JWT claim.
do $$
declare n int;
begin
  select count(*) into n from audit_log
   where table_name = 'sites' and operation = 'INSERT' and actor_id is null
     and row_id in ('20000000-0000-0000-0000-0000000000a1',
                    '20000000-0000-0000-0000-0000000000a2',
                    '20000000-0000-0000-0000-0000000000b1');
  perform test_assert(n = 3, '[8.03] fixture sites were audited once each with a null actor, found ' || n);

  select count(*) into n from audit_log
   where table_name = 'site_assignments' and operation = 'INSERT' and actor_id is null
     and new_data ->> 'site_id' = '20000000-0000-0000-0000-0000000000a1';
  perform test_assert(n = 1, '[8.04] fixture assignment was audited once with a null actor, found ' || n);
end $$;

-- INSERT of a site by the owner of org A.
do $$
declare w bigint; n int; sid uuid; a public.audit_log;
begin
  select coalesce(max(id), 0) into w from audit_log;
  perform test_as('00000000-0000-0000-0000-000000000a01');
  insert into public.sites (org_id, name, address, latitude, longitude)
  values ('10000000-0000-0000-0000-00000000000a', 'Audit new', 'Nashik', 19.997500, 73.789800);
  reset role;

  select id into sid from public.sites
   where org_id = '10000000-0000-0000-0000-00000000000a' and name = 'Audit new';
  select count(*) into n from audit_log where id > w;
  perform test_assert(n = 1, '[8.05] a site insert wrote exactly 1 audit row, wrote ' || n);

  select * into a from audit_log where id > w;
  perform test_assert(a.table_name = 'sites' and a.operation = 'INSERT',
    '[8.06] the row says sites / INSERT, says ' || coalesce(a.table_name, '?') || ' / ' || coalesce(a.operation, '?'));
  perform test_assert(a.row_id = sid, '[8.07] row_id is the new site id');
  perform test_assert(a.actor_id = '00000000-0000-0000-0000-000000000a01', '[8.08] actor_id is the owner');
  perform test_assert(a.org_id = '10000000-0000-0000-0000-00000000000a', '[8.09] org_id is the site''s org');
  perform test_assert(a.old_data is null
                      and a.new_data ->> 'name' = 'Audit new'
                      and a.new_data ->> 'created_by' = '00000000-0000-0000-0000-000000000a01',
    '[8.10] INSERT has no old_data and new_data holds the row, including created_by');
end $$;

-- INSERT of an assignment by the project manager.
do $$
declare w bigint; n int; sid uuid; aid uuid; a public.audit_log;
begin
  select id into sid from public.sites
   where org_id = '10000000-0000-0000-0000-00000000000a' and name = 'Audit new';
  select coalesce(max(id), 0) into w from audit_log;
  perform test_as('00000000-0000-0000-0000-000000000a02');
  insert into public.site_assignments (org_id, site_id, user_id)
  values ('10000000-0000-0000-0000-00000000000a', sid, '00000000-0000-0000-0000-000000000a04');
  reset role;

  select id into aid from public.site_assignments
   where site_id = sid and user_id = '00000000-0000-0000-0000-000000000a04';
  select count(*) into n from audit_log where id > w;
  perform test_assert(n = 1, '[8.11] an assignment insert wrote exactly 1 audit row, wrote ' || n);

  select * into a from audit_log where id > w;
  perform test_assert(a.table_name = 'site_assignments' and a.operation = 'INSERT' and a.row_id = aid,
    '[8.12] the row says site_assignments / INSERT and row_id is the assignment id');
  perform test_assert(a.actor_id = '00000000-0000-0000-0000-000000000a02', '[8.13] actor_id is the project manager');
  perform test_assert(a.org_id = '10000000-0000-0000-0000-00000000000a', '[8.14] org_id is the assignment''s org');
  perform test_assert(a.old_data is null
                      and a.new_data ->> 'site_id' = sid::text
                      and a.new_data ->> 'user_id' = '00000000-0000-0000-0000-000000000a04',
    '[8.15] INSERT has no old_data and new_data holds site_id and user_id');
end $$;

-- UPDATE of a site by the owner.
do $$
declare w bigint; n int; k int; sid uuid; a public.audit_log;
begin
  select id into sid from public.sites
   where org_id = '10000000-0000-0000-0000-00000000000a' and name = 'Audit new';
  select coalesce(max(id), 0) into w from audit_log;
  perform test_as('00000000-0000-0000-0000-000000000a01');
  update public.sites set name = 'Audit renamed' where id = sid;
  get diagnostics k = row_count;
  reset role;

  select count(*) into n from audit_log where id > w;
  perform test_assert(k = 1 and n = 1, '[8.16] a one-row update wrote exactly 1 audit row, touched ' || k || ' and wrote ' || n);

  select * into a from audit_log where id > w;
  perform test_assert(a.table_name = 'sites' and a.operation = 'UPDATE' and a.row_id = sid,
    '[8.17] the row says sites / UPDATE and row_id is the site id');
  perform test_assert(a.actor_id = '00000000-0000-0000-0000-000000000a01', '[8.18] actor_id is the owner');
  perform test_assert(a.org_id = '10000000-0000-0000-0000-00000000000a', '[8.19] org_id is the site''s org');
  perform test_assert(a.old_data ->> 'name' = 'Audit new' and a.new_data ->> 'name' = 'Audit renamed',
    '[8.20] old_data holds the old name and new_data the new one');
end $$;

-- UPDATE of an assignment (unassign) by the project manager.
do $$
declare w bigint; n int; k int; sid uuid; aid uuid; a public.audit_log;
begin
  select id into sid from public.sites
   where org_id = '10000000-0000-0000-0000-00000000000a' and name = 'Audit renamed';
  select id into aid from public.site_assignments
   where site_id = sid and user_id = '00000000-0000-0000-0000-000000000a04';
  select coalesce(max(id), 0) into w from audit_log;
  perform test_as('00000000-0000-0000-0000-000000000a02');
  update public.site_assignments set unassigned_at = now() where id = aid;
  get diagnostics k = row_count;
  reset role;

  select count(*) into n from audit_log where id > w;
  perform test_assert(k = 1 and n = 1, '[8.21] unassigning wrote exactly 1 audit row, touched ' || k || ' and wrote ' || n);

  select * into a from audit_log where id > w;
  perform test_assert(a.table_name = 'site_assignments' and a.operation = 'UPDATE' and a.row_id = aid,
    '[8.22] the row says site_assignments / UPDATE and row_id is the assignment id');
  perform test_assert(a.actor_id = '00000000-0000-0000-0000-000000000a02', '[8.23] actor_id is the project manager');
  perform test_assert(a.org_id = '10000000-0000-0000-0000-00000000000a', '[8.24] org_id is the assignment''s org');
  perform test_assert(a.old_data ->> 'unassigned_at' is null
                      and a.new_data ->> 'unassigned_at' is not null
                      and a.new_data ->> 'unassigned_by' = '00000000-0000-0000-0000-000000000a02',
    '[8.25] the audited row is the server-stamped one: unassigned_by is the caller');
end $$;

-- archive_site() on a site with one open assignment: one sites UPDATE and one
-- site_assignments UPDATE, both by the caller, even though the function is
-- SECURITY DEFINER.
do $$
declare w bigint; n int; n_sites int; n_asg int; aid uuid; a public.audit_log;
begin
  select id into aid from public.site_assignments
   where site_id = '20000000-0000-0000-0000-0000000000c2'
     and user_id = '00000000-0000-0000-0000-000000000a04';
  select coalesce(max(id), 0) into w from audit_log;
  perform test_as('00000000-0000-0000-0000-000000000a01');
  perform public.archive_site('20000000-0000-0000-0000-0000000000c2');
  reset role;

  select count(*) into n from audit_log where id > w;
  select count(*) into n_sites from audit_log
   where id > w and table_name = 'sites' and operation = 'UPDATE'
     and row_id = '20000000-0000-0000-0000-0000000000c2';
  select count(*) into n_asg from audit_log
   where id > w and table_name = 'site_assignments' and operation = 'UPDATE' and row_id = aid;
  perform test_assert(n = 2 and n_sites = 1 and n_asg = 1,
    '[8.26] archive_site wrote 1 sites UPDATE and 1 site_assignments UPDATE and nothing else, wrote ' || n
    || ' (' || n_sites || ' sites, ' || n_asg || ' assignments)');

  select * into a from audit_log where id > w and table_name = 'sites';
  perform test_assert(a.actor_id = '00000000-0000-0000-0000-000000000a01', '[8.27] the sites row has the owner as actor_id');
  perform test_assert(a.org_id = '10000000-0000-0000-0000-00000000000a', '[8.28] the sites row has the site''s org_id');
  perform test_assert(a.old_data ->> 'status' = 'active'
                      and a.new_data ->> 'status' = 'archived'
                      and a.new_data ->> 'archived_by' = '00000000-0000-0000-0000-000000000a01',
    '[8.29] the sites row records active -> archived and archived_by');

  select * into a from audit_log where id > w and table_name = 'site_assignments';
  perform test_assert(a.actor_id = '00000000-0000-0000-0000-000000000a01', '[8.30] the assignment row has the owner as actor_id');
  perform test_assert(a.org_id = '10000000-0000-0000-0000-00000000000a', '[8.31] the assignment row has the assignment''s org_id');
  perform test_assert(a.old_data ->> 'unassigned_at' is null and a.new_data ->> 'unassigned_at' is not null,
    '[8.32] the assignment row records the open assignment being closed');
end $$;

-- Archiving again changes nothing, so it records nothing.
do $$
declare w bigint; n int;
begin
  select coalesce(max(id), 0) into w from audit_log;
  perform test_as('00000000-0000-0000-0000-000000000a01');
  perform public.archive_site('20000000-0000-0000-0000-0000000000c2');
  reset role;
  select count(*) into n from audit_log where id > w;
  perform test_assert(n = 0, '[8.33] archiving an archived site wrote no audit row, wrote ' || n);
end $$;

-- Blocked writes leave no audit row: an RLS error rolls back with its row, and
-- an UPDATE that RLS filters to 0 rows fires no row trigger at all.
do $$
declare w bigint; n int; s text;
begin
  select coalesce(max(id), 0) into w from audit_log;

  perform test_as('00000000-0000-0000-0000-000000000a03');          -- supervisor
  s := null;
  begin
    insert into public.sites (org_id, name, address, latitude, longitude)
    values ('10000000-0000-0000-0000-00000000000a', 'Blocked', 'x', 0, 0);
  exception when others then s := sqlstate; end;
  perform test_assert(s = '42501', '[8.34] a supervisor site insert is blocked, got ' || coalesce(s, 'no error'));
  s := null;
  begin
    perform public.archive_site('20000000-0000-0000-0000-0000000000a2');
  exception when others then s := sqlstate; end;
  perform test_assert(s = '42501', '[8.35] a supervisor archive_site is blocked, got ' || coalesce(s, 'no error'));
  reset role;

  perform test_as('00000000-0000-0000-0000-000000000a05');          -- accountant
  update public.sites set name = 'Blocked' where id = '20000000-0000-0000-0000-0000000000a2';
  get diagnostics n = row_count;
  perform test_assert(n = 0, '[8.36] an accountant site update touches 0 rows, touched ' || n);
  reset role;

  perform test_as('00000000-0000-0000-0000-000000000b01');          -- owner of org B
  update public.sites set name = 'Blocked' where id = '20000000-0000-0000-0000-0000000000a2';
  get diagnostics n = row_count;
  perform test_assert(n = 0, '[8.37] the other org''s owner updating this org''s site touches 0 rows, touched ' || n);
  reset role;

  select count(*) into n from audit_log where id > w;
  perform test_assert(n = 0, '[8.38] the blocked writes left no audit row, left ' || n);
end $$;

-- DELETE is wired too. No client can delete, so this is the superuser, acting
-- under a JWT claim to show the actor is read from auth.uid().
do $$
declare w bigint; n int; k int; sid uuid; aid uuid; a public.audit_log;
begin
  select id into sid from public.sites
   where org_id = '10000000-0000-0000-0000-00000000000a' and name = 'Audit renamed';
  select id into aid from public.site_assignments
   where site_id = sid and user_id = '00000000-0000-0000-0000-000000000a04';
  select coalesce(max(id), 0) into w from audit_log;

  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000a01', true);
  delete from public.site_assignments where id = aid;
  get diagnostics k = row_count;
  perform set_config('request.jwt.claim.sub', '', true);

  select count(*) into n from audit_log where id > w;
  perform test_assert(k = 1 and n = 1, '[8.39] deleting one assignment wrote exactly 1 audit row, deleted ' || k || ' and wrote ' || n);

  select * into a from audit_log where id > w;
  perform test_assert(a.table_name = 'site_assignments' and a.operation = 'DELETE' and a.row_id = aid,
    '[8.40] the row says site_assignments / DELETE and row_id is the assignment id');
  perform test_assert(a.new_data is null and a.old_data ->> 'site_id' = sid::text,
    '[8.41] DELETE has no new_data and old_data holds the last row');
  perform test_assert(a.org_id = '10000000-0000-0000-0000-00000000000a'
                      and a.actor_id = '00000000-0000-0000-0000-000000000a01',
    '[8.42] DELETE records the org from the old row and the actor from auth.uid()');
end $$;

rollback;
