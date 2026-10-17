-- Workforce: worker_roster view and the widened has_worker_access. Issue #23.
begin;

-- Org A: alice owner, dave accountant, bob supervisor on site 1, gina
-- supervisor on site 2. Org B: eve owner.
insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-00000000000a', 'alice@x'),
  ('b0000000-0000-0000-0000-00000000000b', 'bob@x'),
  ('d0000000-0000-0000-0000-00000000000d', 'dave@x'),
  ('e0000000-0000-0000-0000-00000000000e', 'eve@x'),
  ('90000000-0000-0000-0000-000000000009', 'gina@x');
insert into public.organizations (id, name, created_by) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Org A', 'a0000000-0000-0000-0000-00000000000a'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Org B', 'e0000000-0000-0000-0000-00000000000e');
insert into public.memberships (org_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'owner'),
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

-- w1 open on site 1. w2 closed on site 1, now open on site 2. w3 never assigned.
-- wb in org B on site B.
insert into public.workers (id, org_id, code, full_name, trade, pay_type, created_by) values
  ('77000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'W-001', 'Ravi', 'mason', 'daily', 'a0000000-0000-0000-0000-00000000000a'),
  ('77000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'W-002', 'Sita', 'helper', 'daily', 'a0000000-0000-0000-0000-00000000000a'),
  ('77000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'W-003', 'Arun', 'helper', 'daily', 'a0000000-0000-0000-0000-00000000000a'),
  ('77000000-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-000000000002', 'W-001', 'Bela', 'mason', 'daily', 'e0000000-0000-0000-0000-00000000000e');
insert into public.worker_site_assignments (org_id, worker_id, site_id, assigned_by) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '77000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '77000000-0000-0000-0000-000000000002', '51000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '77000000-0000-0000-0000-0000000000b1', '51000000-0000-0000-0000-0000000000b1', 'e0000000-0000-0000-0000-00000000000e');
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000a', true);
update public.worker_site_assignments set unassigned_at = now()
  where worker_id = '77000000-0000-0000-0000-000000000002';
select set_config('request.jwt.claim.sub', '', true);
insert into public.worker_site_assignments (org_id, worker_id, site_id, assigned_by) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '77000000-0000-0000-0000-000000000002', '51000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000a');
insert into public.worker_wage_rates (org_id, worker_id, rate, effective_from, created_by) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '77000000-0000-0000-0000-000000000001', 500, '2026-01-01', 'a0000000-0000-0000-0000-00000000000a');

do $$ begin
  -- shape: security_invoker, the agreed columns, no rate column.
  perform test_assert(
    (select reloptions @> array['security_invoker=true'] from pg_class where oid = 'public.worker_roster'::regclass),
    'worker_roster is security_invoker');
  perform test_assert(
    (select array_agg(attname::text order by attnum) from pg_attribute
      where attrelid = 'public.worker_roster'::regclass and attnum > 0 and not attisdropped)
    = array['assignment_id', 'org_id', 'site_id', 'worker_id', 'worker_code', 'name', 'trade', 'status', 'assigned_at', 'unassigned_at'],
    'worker_roster has exactly the agreed columns, no rate');

  -- owner: every assignment of org A, open and closed, none of org B.
  perform test_as('a0000000-0000-0000-0000-00000000000a');
  perform test_assert((select count(*) from worker_roster) = 3, 'owner sees all 3 org A assignments');
  perform test_assert((select count(*) from worker_roster where org_id = 'bbbbbbbb-0000-0000-0000-000000000002') = 0, 'owner sees no org B roster');
  reset role;

  -- bob, site 1: w1 open and w2 closed, with name and code; nothing from site 2.
  perform test_as('b0000000-0000-0000-0000-00000000000b');
  perform test_assert((select count(*) from worker_roster) = 2, 'site 1 supervisor sees both site 1 rows');
  perform test_assert(
    (select count(*) from worker_roster where worker_code = 'W-002' and name = 'Sita' and unassigned_at is not null) = 1,
    'a closed assignment still shows the worker name and code');
  perform test_assert((select count(*) from worker_roster where site_id = '51000000-0000-0000-0000-000000000002') = 0, 'site 1 supervisor sees nothing of site 2');
  perform test_assert((select count(*) from workers where id = '77000000-0000-0000-0000-000000000003') = 0, 'an unrostered worker stays hidden from a supervisor');
  perform test_assert((select count(*) from worker_effective_rates) = 0, 'supervisor still reads no rates');
  reset role;

  -- gina, site 2: only w2 open on site 2; w1 never there.
  perform test_as('90000000-0000-0000-0000-000000000009');
  perform test_assert((select count(*) from worker_roster) = 1, 'site 2 supervisor sees one row');
  perform test_assert((select count(*) from workers where id = '77000000-0000-0000-0000-000000000001') = 0, 'site 2 supervisor cannot read a site 1 worker by id');
  reset role;

  -- accountant with no site assignment: no roster rows.
  perform test_as('d0000000-0000-0000-0000-00000000000d');
  perform test_assert((select count(*) from worker_roster) = 0, 'unassigned accountant sees no roster');
  reset role;
end $$;

do $$
declare denied boolean := false;
begin
  perform test_as_anon();
  begin perform count(*) from worker_roster;
  exception when insufficient_privilege then denied := true; end;
  reset role;
  perform test_assert(denied, 'anon cannot read worker_roster');
end $$;

rollback;
