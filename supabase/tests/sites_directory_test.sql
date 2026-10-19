-- Sites: the site_directory view Daily Reporting reads site names through. Issue #74.
begin;

-- Org A: alice owner, pat project manager, bob supervisor on site 1, gina
-- supervisor on site 2, dave accountant, ula supervisor with no site.
-- Org B: eve owner.
insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-00000000000a', 'alice@x'),
  ('a1000000-0000-0000-0000-0000000000a1', 'pat@x'),
  ('b0000000-0000-0000-0000-00000000000b', 'bob@x'),
  ('d0000000-0000-0000-0000-00000000000d', 'dave@x'),
  ('e0000000-0000-0000-0000-00000000000e', 'eve@x'),
  ('90000000-0000-0000-0000-000000000009', 'gina@x'),
  ('c0000000-0000-0000-0000-0000000000c1', 'ula@x');
insert into public.organizations (id, name, created_by) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Org A', 'a0000000-0000-0000-0000-00000000000a'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Org B', 'e0000000-0000-0000-0000-00000000000e');
insert into public.memberships (org_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'owner'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-0000000000a1', 'project_manager'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b', 'supervisor'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000009', 'supervisor'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-00000000000d', 'accountant'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-0000000000c1', 'supervisor'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-00000000000e', 'owner');
insert into public.sites (id, org_id, name, address, latitude, longitude, created_by) values
  ('51000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Site 1', 'secret address 1', 19.0, 73.0, 'a0000000-0000-0000-0000-00000000000a'),
  ('51000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Site 2', 'secret address 2', 19.1, 73.1, 'a0000000-0000-0000-0000-00000000000a'),
  ('51000000-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-000000000002', 'Site B', 'x', 18.0, 72.0, 'e0000000-0000-0000-0000-00000000000e');
insert into public.site_assignments (org_id, site_id, user_id, assigned_by) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-00000000000a'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000002', '90000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-00000000000a');

do $$ begin
  -- shape: security_invoker and exactly the four agreed columns.
  perform test_assert(
    (select reloptions @> array['security_invoker=true'] from pg_class where oid = 'public.site_directory'::regclass),
    'site_directory is security_invoker');
  perform test_assert(
    (select array_agg(attname::text order by attnum) from pg_attribute
      where attrelid = 'public.site_directory'::regclass and attnum > 0 and not attisdropped)
    = array['id', 'org_id', 'name', 'status'],
    'site_directory has exactly id, org_id, name, status: no address, no pin');

  -- owner and project manager: both org A sites, never org B.
  perform test_as('a0000000-0000-0000-0000-00000000000a');
  perform test_assert((select count(*) from site_directory) = 2, 'owner sees both org A sites');
  perform test_assert((select count(*) from site_directory where org_id = 'bbbbbbbb-0000-0000-0000-000000000002') = 0, 'owner sees no org B site');
  perform test_assert((select name from site_directory where id = '51000000-0000-0000-0000-000000000001') = 'Site 1', 'owner reads the site name');
  reset role;

  perform test_as('a1000000-0000-0000-0000-0000000000a1');
  perform test_assert((select count(*) from site_directory) = 2, 'project manager sees both org A sites');
  reset role;

  -- supervisors: only the assigned site; a supervisor with no site sees none.
  perform test_as('b0000000-0000-0000-0000-00000000000b');
  perform test_assert((select count(*) from site_directory) = 1, 'bob sees one site');
  perform test_assert((select id from site_directory) = '51000000-0000-0000-0000-000000000001', 'bob sees only his own site');
  reset role;

  perform test_as('90000000-0000-0000-0000-000000000009');
  perform test_assert((select id from site_directory) = '51000000-0000-0000-0000-000000000002', 'gina sees only her own site');
  reset role;

  perform test_as('c0000000-0000-0000-0000-0000000000c1');
  perform test_assert((select count(*) from site_directory) = 0, 'an unassigned supervisor sees no site');
  reset role;

  -- accountant: no site access, so no rows.
  perform test_as('d0000000-0000-0000-0000-00000000000d');
  perform test_assert((select count(*) from site_directory) = 0, 'accountant sees no site');
  reset role;

  -- org B owner: only their own site, never org A, even asking by id.
  perform test_as('e0000000-0000-0000-0000-00000000000e');
  perform test_assert((select count(*) from site_directory) = 1, 'eve sees only org B');
  perform test_assert((select count(*) from site_directory where id = '51000000-0000-0000-0000-000000000001') = 0, 'eve cannot read an org A site by id');
  reset role;
end $$;

-- An archived site stays in the directory: a report filed there must keep its name.
update public.sites set status = 'archived', archived_at = now(),
  archived_by = 'a0000000-0000-0000-0000-00000000000a'
  where id = '51000000-0000-0000-0000-000000000002';
do $$ begin
  perform test_as('a0000000-0000-0000-0000-00000000000a');
  perform test_assert(
    (select status from site_directory where id = '51000000-0000-0000-0000-000000000002') = 'archived',
    'an archived site is still named in the directory');
  reset role;
end $$;

-- The view is select-only for a signed-in user, and closed to anon.
do $$
declare denied boolean := false;
begin
  perform test_as('a0000000-0000-0000-0000-00000000000a');
  begin update public.site_directory set name = 'x';
  exception when insufficient_privilege then denied := true; end;
  reset role;
  perform test_assert(denied, 'a signed-in user cannot write through site_directory');

  denied := false;
  perform test_as_anon();
  begin perform count(*) from site_directory;
  exception when insufficient_privilege then denied := true; end;
  reset role;
  perform test_assert(denied, 'anon cannot read site_directory');
end $$;

rollback;
