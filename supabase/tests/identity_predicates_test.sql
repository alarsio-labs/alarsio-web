-- Identity & Access: can_manage_sites(), has_site_access(), and the audit
-- triggers on Identity's tables. Issues #5, #12, #4. Positive and negative.
begin;

-- Fixture (as superuser). Org A: alice owner, carol PM, bob supervisor
-- (assigned to site 1 only), dave accountant (unassigned), gina supervisor
-- (assignment closed). Org B: eve owner, with her own site. frank is nobody.
insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-00000000000a', 'alice@x'),
  ('b0000000-0000-0000-0000-00000000000b', 'bob@x'),
  ('c0000000-0000-0000-0000-00000000000c', 'carol@x'),
  ('d0000000-0000-0000-0000-00000000000d', 'dave@x'),
  ('e0000000-0000-0000-0000-00000000000e', 'eve@x'),
  ('f0000000-0000-0000-0000-00000000000f', 'frank@x'),
  ('90000000-0000-0000-0000-000000000009', 'gina@x');
insert into public.organizations (id, name, created_by) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Org A', 'a0000000-0000-0000-0000-00000000000a'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Org B', 'e0000000-0000-0000-0000-00000000000e');
insert into public.memberships (org_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'owner'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000c', 'project_manager'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b', 'supervisor'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-00000000000d', 'accountant'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000009', 'supervisor'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-00000000000e', 'owner');
insert into public.sites (id, org_id, name, address, latitude, longitude, created_by) values
  ('51000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Site 1', 'x', 19.0, 73.0, 'a0000000-0000-0000-0000-00000000000a'),
  ('51000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Site 2', 'x', 19.1, 73.1, 'a0000000-0000-0000-0000-00000000000a'),
  ('51000000-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-000000000002', 'Site B', 'x', 18.0, 72.0, 'e0000000-0000-0000-0000-00000000000e');
insert into public.site_assignments (org_id, site_id, user_id, assigned_by) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-00000000000a'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000002', '90000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-00000000000a');
-- gina's assignment is closed, so she holds no open one. The server stamps
-- unassigned_by from auth.uid(), so set the claim as alice for this update.
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000a', true);
update public.site_assignments set unassigned_at = now()
  where user_id = '90000000-0000-0000-0000-000000000009';
select set_config('request.jwt.claim.sub', '', true);

-- ------------------------------------------------------- can_manage_sites

do $$ begin
  perform test_as('a0000000-0000-0000-0000-00000000000a');           -- owner A
  perform test_assert(can_manage_sites('aaaaaaaa-0000-0000-0000-000000000001'), 'owner manages sites in own org');
  perform test_assert(not can_manage_sites('bbbbbbbb-0000-0000-0000-000000000002'), 'owner cannot manage sites in another org');
  reset role;
  perform test_as('c0000000-0000-0000-0000-00000000000c');           -- PM A
  perform test_assert(can_manage_sites('aaaaaaaa-0000-0000-0000-000000000001'), 'project_manager manages sites');
  reset role;
  perform test_as('b0000000-0000-0000-0000-00000000000b');           -- supervisor A
  perform test_assert(not can_manage_sites('aaaaaaaa-0000-0000-0000-000000000001'), 'supervisor cannot manage sites');
  reset role;
  perform test_as('d0000000-0000-0000-0000-00000000000d');           -- accountant A
  perform test_assert(not can_manage_sites('aaaaaaaa-0000-0000-0000-000000000001'), 'accountant cannot manage sites');
  reset role;
  perform test_as('f0000000-0000-0000-0000-00000000000f');           -- nobody
  perform test_assert(not can_manage_sites('aaaaaaaa-0000-0000-0000-000000000001'), 'non-member cannot manage sites');
  perform test_assert(not can_manage_sites(null), 'null org is false, not null');
  reset role;
end $$;

-- --------------------------------------------------------- has_site_access

do $$ begin
  perform test_as('a0000000-0000-0000-0000-00000000000a');           -- owner A
  perform test_assert(has_site_access('51000000-0000-0000-0000-000000000001'), 'owner has access to site 1');
  perform test_assert(has_site_access('51000000-0000-0000-0000-000000000002'), 'owner has access to site 2');
  perform test_assert(not has_site_access('51000000-0000-0000-0000-0000000000b1'), 'owner has no access to another org site');
  reset role;
  perform test_as('c0000000-0000-0000-0000-00000000000c');           -- PM A
  perform test_assert(has_site_access('51000000-0000-0000-0000-000000000002'), 'project_manager has access to every org site');
  perform test_assert(not has_site_access('51000000-0000-0000-0000-0000000000b1'), 'project_manager has no access to another org site');
  reset role;
  perform test_as('b0000000-0000-0000-0000-00000000000b');           -- supervisor A
  perform test_assert(has_site_access('51000000-0000-0000-0000-000000000001'), 'supervisor has access to assigned site');
  perform test_assert(not has_site_access('51000000-0000-0000-0000-000000000002'), 'supervisor has no access to unassigned site in own org');
  perform test_assert(not has_site_access('51000000-0000-0000-0000-0000000000b1'), 'supervisor has no access to another org site');
  reset role;
  perform test_as('90000000-0000-0000-0000-000000000009');           -- gina, closed assignment
  perform test_assert(not has_site_access('51000000-0000-0000-0000-000000000002'), 'a closed assignment gives no access');
  reset role;
  perform test_as('d0000000-0000-0000-0000-00000000000d');           -- accountant A, unassigned
  perform test_assert(not has_site_access('51000000-0000-0000-0000-000000000001'), 'unassigned accountant has no site access');
  reset role;
  perform test_as('f0000000-0000-0000-0000-00000000000f');           -- nobody
  perform test_assert(not has_site_access('51000000-0000-0000-0000-000000000001'), 'non-member has no site access');
  reset role;
  perform test_as('a0000000-0000-0000-0000-00000000000a');
  perform test_assert(not has_site_access('00000000-0000-0000-0000-00000000dead'), 'unknown site id is false');
  perform test_assert(not has_site_access(null), 'null site is false, not null');
  reset role;
end $$;

-- A reassigned supervisor regains access: closing then reopening works.
do $$ begin
  insert into public.site_assignments (org_id, site_id, user_id, assigned_by)
  values ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000002',
          '90000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-00000000000a');
  perform test_as('90000000-0000-0000-0000-000000000009');
  perform test_assert(has_site_access('51000000-0000-0000-0000-000000000002'), 'a new open assignment restores access');
  reset role;
end $$;

-- End to end through Sites' real policy: a supervisor reads only their site.
do $$ begin
  perform test_as('b0000000-0000-0000-0000-00000000000b');           -- bob
  perform test_assert((select count(*) from public.sites) = 1, 'supervisor reads exactly one site through RLS');
  perform test_assert((select count(*) from public.sites where id = '51000000-0000-0000-0000-000000000002') = 0, 'supervisor cannot fetch an unassigned site by id');
  perform test_assert((select count(*) from public.sites where id = '51000000-0000-0000-0000-0000000000b1') = 0, 'supervisor cannot fetch another org site by id');
  reset role;
  perform test_as('c0000000-0000-0000-0000-00000000000c');           -- carol, PM
  perform test_assert((select count(*) from public.sites) = 2, 'project_manager reads every site of own org, none of org B');
  reset role;
end $$;

-- anon cannot execute either predicate.
do $$
declare denied int := 0;
begin
  perform test_as_anon();
  begin perform can_manage_sites('aaaaaaaa-0000-0000-0000-000000000001');
  exception when insufficient_privilege then denied := denied + 1; end;
  begin perform has_site_access('51000000-0000-0000-0000-000000000001');
  exception when insufficient_privilege then denied := denied + 1; end;
  reset role;
  perform test_assert(denied = 2, 'anon denied on both site predicates');
end $$;

-- Both are SECURITY DEFINER with a pinned search_path.
do $$ begin
  perform test_assert(
    (select bool_and(prosecdef and proconfig @> array['search_path=public'])
       from pg_proc
      where oid in ('public.can_manage_sites(uuid)'::regprocedure,
                    'public.has_site_access(uuid)'::regprocedure)),
    'site predicates are security definer with search_path = public');
end $$;

-- ------------------------------------------------------------ audit triggers

do $$
declare before_n int; n int;
begin
  perform test_assert(
    (select count(*) from pg_trigger
      where tgname in ('organizations_audit', 'profiles_audit', 'memberships_audit')
        and not tgisinternal) = 3,
    'audit trigger attached to all three identity tables');

  select count(*) into before_n from audit_log where table_name = 'memberships';
  perform test_as('a0000000-0000-0000-0000-00000000000a');           -- alice
  update memberships set role = 'accountant'
    where user_id = 'b0000000-0000-0000-0000-00000000000b';
  reset role;
  select count(*) into n from audit_log where table_name = 'memberships';
  perform test_assert(n = before_n + 1, 'one audit row for one changed membership');

  -- A blocked write (0 rows changed) leaves no audit row.
  before_n := n;
  perform test_as('b0000000-0000-0000-0000-00000000000b');           -- bob, no longer owner
  update memberships set role = 'owner' where user_id = 'b0000000-0000-0000-0000-00000000000b';
  reset role;
  select count(*) into n from audit_log where table_name = 'memberships';
  perform test_assert(n = before_n, 'a blocked update leaves no audit row');
end $$;

rollback;
