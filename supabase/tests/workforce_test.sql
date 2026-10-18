-- Workforce: workers, worker_site_assignments, worker_wage_rates, the
-- effective-rate view, anonymize_worker() and import_workers(). Issue #23.
-- Positive and negative. Runs on the team runner (shim, no pgTAP).
begin;

-- Org A: alice owner, carol PM, bob supervisor (assigned to site 1 only),
-- dave accountant, gina supervisor (no assignment). Org B: eve owner.
insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-00000000000a', 'alice@x'),
  ('b0000000-0000-0000-0000-00000000000b', 'bob@x'),
  ('c0000000-0000-0000-0000-00000000000c', 'carol@x'),
  ('d0000000-0000-0000-0000-00000000000d', 'dave@x'),
  ('e0000000-0000-0000-0000-00000000000e', 'eve@x'),
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
  ('51000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'Site 3 archived', 'x', 19.2, 73.2, 'a0000000-0000-0000-0000-00000000000a'),
  ('51000000-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-000000000002', 'Site B', 'x', 18.0, 72.0, 'e0000000-0000-0000-0000-00000000000e');
update public.sites set status = 'archived', archived_at = now(),
  archived_by = 'a0000000-0000-0000-0000-00000000000a'
  where id = '51000000-0000-0000-0000-000000000003';
insert into public.site_assignments (org_id, site_id, user_id, assigned_by) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-00000000000a');

-- Workers (as superuser). w1 at site 1, w2 unassigned, wb in Org B.
insert into public.workers (id, org_id, code, full_name, trade, pay_type, created_by) values
  ('77000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'W-001', 'Ravi', 'mason', 'daily', 'a0000000-0000-0000-0000-00000000000a'),
  ('77000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'W-002', 'Sita', 'helper', 'hourly', 'a0000000-0000-0000-0000-00000000000a'),
  ('77000000-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-000000000002', 'W-001', 'Bela', 'mason', 'daily', 'e0000000-0000-0000-0000-00000000000e');
insert into public.worker_site_assignments (org_id, worker_id, site_id, assigned_by) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '77000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a');
insert into public.worker_wage_rates (org_id, worker_id, rate, effective_from, created_by) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '77000000-0000-0000-0000-000000000001', 500.00, '2026-01-01', 'a0000000-0000-0000-0000-00000000000a');

-- ---------------------------------------------------------------- structure
do $$ begin
  perform test_assert(
    (select bool_and(relrowsecurity) from pg_class
      where oid in ('public.workers'::regclass, 'public.worker_site_assignments'::regclass, 'public.worker_wage_rates'::regclass)),
    'RLS enabled on all three workforce tables');
  perform test_assert(
    not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename in ('workers', 'worker_site_assignments', 'worker_wage_rates')
      and cmd in ('DELETE', 'ALL')),
    'no delete policy on any workforce table');
  perform test_assert(
    not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'worker_wage_rates' and cmd = 'UPDATE'),
    'no update policy on worker_wage_rates');
  perform test_assert(
    (select count(*) from pg_trigger where not tgisinternal
      and tgname in ('workers_audit', 'worker_site_assignments_audit', 'worker_wage_rates_audit')) = 3,
    'audit trigger attached to all three tables');
  perform test_assert(
    (select bool_and(prosecdef and proconfig @> array['search_path=public'])
       from pg_proc where oid in ('public.anonymize_worker(uuid)'::regprocedure,
                                  'public.has_worker_access(uuid)'::regprocedure)),
    'definer functions pin search_path');
  perform test_assert(
    (select not prosecdef from pg_proc where oid = 'public.import_workers(uuid, jsonb)'::regprocedure),
    'import_workers is security invoker');
end $$;

-- ------------------------------------------------------------ anon is denied
do $$
declare denied int := 0;
begin
  perform test_as_anon();
  begin perform count(*) from public.workers;
  exception when insufficient_privilege then denied := denied + 1; end;
  begin perform count(*) from public.worker_wage_rates;
  exception when insufficient_privilege then denied := denied + 1; end;
  begin perform anonymize_worker('77000000-0000-0000-0000-000000000001');
  exception when insufficient_privilege then denied := denied + 1; end;
  begin perform import_workers('aaaaaaaa-0000-0000-0000-000000000001', '[]');
  exception when insufficient_privilege then denied := denied + 1; end;
  reset role;
  perform test_assert(denied = 4, 'anon denied on tables and functions');
end $$;

-- --------------------------------------------------------------- reads, roles
do $$ begin
  perform test_as('a0000000-0000-0000-0000-00000000000a');           -- owner
  perform test_assert((select count(*) from public.workers) = 2, 'owner sees both org A workers and none of org B');
  perform test_assert((select count(*) from public.workers where id = '77000000-0000-0000-0000-0000000000b1') = 0, 'owner cannot fetch an org B worker by id');
  perform test_assert((select count(*) from public.worker_wage_rates) = 1, 'owner reads rates');
  reset role;
  perform test_as('c0000000-0000-0000-0000-00000000000c');           -- PM
  perform test_assert((select count(*) from public.workers) = 2, 'project_manager sees all org workers');
  perform test_assert((select count(*) from public.worker_wage_rates) = 0, 'project_manager reads zero rates');
  perform test_assert((select count(*) from public.worker_effective_rates) = 0, 'project_manager reads zero effective rates');
  reset role;
  perform test_as('d0000000-0000-0000-0000-00000000000d');           -- accountant
  perform test_assert((select count(*) from public.worker_wage_rates) = 1, 'accountant reads rates');
  perform test_assert((select count(*) from public.workers) = 2, 'accountant reads every org A worker, to pay them (W10)');
  perform test_assert((select count(*) from public.workers where id = '77000000-0000-0000-0000-0000000000b1') = 0, 'accountant cannot read an org B worker by id');
  reset role;
  perform test_as('b0000000-0000-0000-0000-00000000000b');           -- supervisor at site 1
  perform test_assert((select count(*) from public.workers) = 1, 'supervisor sees only the worker at their site');
  perform test_assert((select count(*) from public.workers where id = '77000000-0000-0000-0000-000000000002') = 0, 'supervisor cannot fetch an unassigned worker by id');
  perform test_assert((select count(*) from public.worker_wage_rates) = 0, 'supervisor reads zero rates');
  perform test_assert((select count(*) from public.worker_effective_rates) = 0, 'supervisor reads zero effective rates');
  perform test_assert(worker_rate_on('77000000-0000-0000-0000-000000000001', '2026-06-01') is null, 'supervisor gets no rate from worker_rate_on');
  perform test_assert((select count(*) from public.worker_site_assignments) = 1, 'supervisor sees assignments of their site');
  reset role;
  perform test_as('90000000-0000-0000-0000-000000000009');           -- gina, no site
  perform test_assert((select count(*) from public.workers) = 0, 'unassigned supervisor sees no workers');
  perform test_assert((select count(*) from public.worker_site_assignments) = 0, 'unassigned supervisor sees no assignments');
  reset role;
end $$;

-- ------------------------------------------------------------ writes: workers
do $$
declare n int; denied int; u uuid;
begin
  -- owner and PM create workers.
  perform test_as('c0000000-0000-0000-0000-00000000000c');
  insert into public.workers (org_id, code, full_name, trade, pay_type)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'W-100', 'Mohan', 'carpenter', 'daily');
  reset role;
  perform test_assert(exists (select 1 from public.workers where code = 'W-100'), 'project_manager created a worker');

  -- supervisor and accountant cannot create.
  foreach u in array array['b0000000-0000-0000-0000-00000000000b', 'd0000000-0000-0000-0000-00000000000d']::uuid[] loop
    denied := 0;
    perform test_as(u);
    begin
      insert into public.workers (org_id, code, full_name, trade, pay_type)
      values ('aaaaaaaa-0000-0000-0000-000000000001', 'W-X-' || left(u::text, 2), 'Nope', 'mason', 'daily');
    exception when insufficient_privilege then denied := 1; end;
    reset role;
    perform test_assert(denied = 1, 'non-manager cannot create a worker: ' || u);
  end loop;
  perform test_assert(not exists (select 1 from public.workers where code like 'W-X-%'), 'no row was created by a blocked insert');

  -- owner of A cannot create in B.
  denied := 0;
  perform test_as('a0000000-0000-0000-0000-00000000000a');
  begin
    insert into public.workers (org_id, code, full_name, trade, pay_type)
    values ('bbbbbbbb-0000-0000-0000-000000000002', 'W-A-IN-B', 'Nope', 'mason', 'daily');
  exception when insufficient_privilege then denied := 1; end;
  reset role;
  perform test_assert(denied = 1, 'owner A cannot create a worker in org B');

  -- constraints: bad pay type, blank trade, duplicate code (any case), same code in another org is fine.
  perform test_as('a0000000-0000-0000-0000-00000000000a');
  denied := 0;
  begin insert into public.workers (org_id, code, full_name, trade, pay_type) values ('aaaaaaaa-0000-0000-0000-000000000001', 'W-200', 'X', 'mason', 'monthly');
  exception when check_violation then denied := denied + 1; end;
  begin insert into public.workers (org_id, code, full_name, trade, pay_type) values ('aaaaaaaa-0000-0000-0000-000000000001', 'W-201', 'X', '   ', 'daily');
  exception when check_violation then denied := denied + 1; end;
  begin insert into public.workers (org_id, code, full_name, trade, pay_type) values ('aaaaaaaa-0000-0000-0000-000000000001', 'w-001', 'X', 'mason', 'daily');
  exception when unique_violation then denied := denied + 1; end;
  begin insert into public.workers (org_id, code, full_name, trade, pay_type, phone) values ('aaaaaaaa-0000-0000-0000-000000000001', 'W-202', 'X', 'mason', 'daily', 'not a phone');
  exception when check_violation then denied := denied + 1; end;
  reset role;
  perform test_assert(denied = 4, 'bad pay type, blank trade, duplicate code and bad phone are rejected');

  -- updates: manager edits, code and org are immutable, others change 0 rows.
  perform test_as('a0000000-0000-0000-0000-00000000000a');
  update public.workers set trade = 'senior mason' where id = '77000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  perform test_assert(n = 1, 'owner edits a worker');
  denied := 0;
  begin update public.workers set code = 'HACK' where id = '77000000-0000-0000-0000-000000000001';
  exception when insufficient_privilege then denied := denied + 1; end;
  begin update public.workers set org_id = 'bbbbbbbb-0000-0000-0000-000000000002' where id = '77000000-0000-0000-0000-000000000001';
  exception when insufficient_privilege then denied := denied + 1; end;
  update public.workers set trade = 'hijack' where id = '77000000-0000-0000-0000-0000000000b1';
  get diagnostics n = row_count;
  reset role;
  perform test_assert(denied = 2, 'code and org_id are immutable');
  perform test_assert(n = 0, 'owner A changes 0 rows of an org B worker');
  perform test_assert((select trade from public.workers where id = '77000000-0000-0000-0000-0000000000b1') = 'mason', 'org B worker unchanged');

  foreach u in array array['b0000000-0000-0000-0000-00000000000b', 'd0000000-0000-0000-0000-00000000000d']::uuid[] loop
    perform test_as(u);
    update public.workers set trade = 'hijack' where id = '77000000-0000-0000-0000-000000000001';
    get diagnostics n = row_count;
    reset role;
    perform test_assert(n = 0, 'non-manager update changes 0 rows: ' || u);
  end loop;
  perform test_assert((select trade from public.workers where id = '77000000-0000-0000-0000-000000000001') = 'senior mason', 'worker not changed by blocked updates');

  -- nobody can delete or truncate.
  foreach u in array array['a0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000c']::uuid[] loop
    denied := 0;
    perform test_as(u);
    begin delete from public.workers where id = '77000000-0000-0000-0000-000000000002';
    exception when insufficient_privilege then denied := 1; end;
    reset role;
    perform test_assert(denied = 1, 'delete on workers is denied: ' || u);
  end loop;
  perform test_assert(exists (select 1 from public.workers where id = '77000000-0000-0000-0000-000000000002'), 'worker still present after delete attempts');
end $$;

-- ------------------------------------------------------ writes: assignments
do $$
declare n int; denied int; u uuid;
begin
  -- manager assigns w2 to site 2; supervisor then cannot see it (not their site).
  perform test_as('c0000000-0000-0000-0000-00000000000c');
  insert into public.worker_site_assignments (org_id, worker_id, site_id)
  values ('aaaaaaaa-0000-0000-0000-000000000001', '77000000-0000-0000-0000-000000000002', '51000000-0000-0000-0000-000000000002');
  reset role;
  perform test_assert(exists (select 1 from public.worker_site_assignments where worker_id = '77000000-0000-0000-0000-000000000002' and unassigned_at is null), 'manager assigned a worker');

  -- duplicate open assignment, archived site, cross-org site, cross-org worker.
  perform test_as('c0000000-0000-0000-0000-00000000000c');
  denied := 0;
  begin insert into public.worker_site_assignments (org_id, worker_id, site_id) values ('aaaaaaaa-0000-0000-0000-000000000001', '77000000-0000-0000-0000-000000000002', '51000000-0000-0000-0000-000000000002');
  exception when unique_violation then denied := denied + 1; end;
  begin insert into public.worker_site_assignments (org_id, worker_id, site_id) values ('aaaaaaaa-0000-0000-0000-000000000001', '77000000-0000-0000-0000-000000000002', '51000000-0000-0000-0000-000000000003');
  exception when object_not_in_prerequisite_state then denied := denied + 1; end;
  begin insert into public.worker_site_assignments (org_id, worker_id, site_id) values ('aaaaaaaa-0000-0000-0000-000000000001', '77000000-0000-0000-0000-000000000002', '51000000-0000-0000-0000-0000000000b1');
  exception when foreign_key_violation then denied := denied + 1; end;
  begin insert into public.worker_site_assignments (org_id, worker_id, site_id) values ('aaaaaaaa-0000-0000-0000-000000000001', '77000000-0000-0000-0000-0000000000b1', '51000000-0000-0000-0000-000000000001');
  exception when foreign_key_violation then denied := denied + 1; end;
  reset role;
  perform test_assert(denied = 4, 'duplicate, archived-site, cross-org site and cross-org worker assignments are rejected');

  -- supervisor and accountant cannot assign.
  foreach u in array array['b0000000-0000-0000-0000-00000000000b', 'd0000000-0000-0000-0000-00000000000d']::uuid[] loop
    denied := 0;
    perform test_as(u);
    begin insert into public.worker_site_assignments (org_id, worker_id, site_id) values ('aaaaaaaa-0000-0000-0000-000000000001', '77000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000002');
    exception when insufficient_privilege then denied := 1; end;
    reset role;
    perform test_assert(denied = 1, 'non-manager cannot assign: ' || u);
  end loop;

  -- unassign is stamped by the server and is final; supervisor cannot do it.
  perform test_as('b0000000-0000-0000-0000-00000000000b');
  update public.worker_site_assignments set unassigned_at = now() where worker_id = '77000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  reset role;
  perform test_assert(n = 0, 'supervisor unassign changes 0 rows');

  perform test_as('a0000000-0000-0000-0000-00000000000a');
  update public.worker_site_assignments set unassigned_at = '2000-01-01' where worker_id = '77000000-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  reset role;
  perform test_assert(n = 1, 'manager closes an assignment');
  perform test_assert(
    (select unassigned_at > '2020-01-01' and unassigned_by = 'a0000000-0000-0000-0000-00000000000a'
       from public.worker_site_assignments where worker_id = '77000000-0000-0000-0000-000000000002'),
    'server stamped the time and the caller, not the client value');

  perform test_as('a0000000-0000-0000-0000-00000000000a');
  update public.worker_site_assignments set unassigned_at = null where worker_id = '77000000-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  reset role;
  perform test_assert(n = 0, 'a closed assignment cannot be reopened');

  -- a closed assignment does not block assigning again.
  perform test_as('a0000000-0000-0000-0000-00000000000a');
  insert into public.worker_site_assignments (org_id, worker_id, site_id)
  values ('aaaaaaaa-0000-0000-0000-000000000001', '77000000-0000-0000-0000-000000000002', '51000000-0000-0000-0000-000000000002');
  reset role;
  perform test_assert((select count(*) from public.worker_site_assignments where worker_id = '77000000-0000-0000-0000-000000000002') = 2, 'reassigning after a close keeps the history');

  -- deletion is denied.
  perform test_as('a0000000-0000-0000-0000-00000000000a');
  denied := 0;
  begin delete from public.worker_site_assignments;
  exception when insufficient_privilege then denied := 1; end;
  reset role;
  perform test_assert(denied = 1, 'delete on assignments is denied');
end $$;

-- ------------------------------------------------------------- writes: rates
do $$
declare n int; denied int;
begin
  -- accountant adds a new rate: the old row stays.
  perform test_as('d0000000-0000-0000-0000-00000000000d');
  insert into public.worker_wage_rates (org_id, worker_id, rate, effective_from)
  values ('aaaaaaaa-0000-0000-0000-000000000001', '77000000-0000-0000-0000-000000000001', 600.00, '2026-07-01');
  reset role;
  perform test_assert((select count(*) from public.worker_wage_rates where worker_id = '77000000-0000-0000-0000-000000000001') = 2, 'a new rate adds a row, the old one stays');

  -- the rate in force before, on and after the change date.
  perform test_as('a0000000-0000-0000-0000-00000000000a');
  perform test_assert(worker_rate_on('77000000-0000-0000-0000-000000000001', '2025-12-31') is null, 'no rate before the first effective date');
  perform test_assert(worker_rate_on('77000000-0000-0000-0000-000000000001', '2026-01-01') = 500.00, 'first rate on its effective date');
  perform test_assert(worker_rate_on('77000000-0000-0000-0000-000000000001', '2026-06-30') = 500.00, 'first rate the day before the change');
  perform test_assert(worker_rate_on('77000000-0000-0000-0000-000000000001', '2026-07-01') = 600.00, 'new rate on its effective date');
  perform test_assert(worker_rate_on('77000000-0000-0000-0000-000000000001', '2027-01-01') = 600.00, 'new rate afterwards');
  perform test_assert((select rate from public.worker_effective_rates where worker_id = '77000000-0000-0000-0000-000000000001') = 600.00 or current_date < '2026-07-01', 'effective view returns one row per worker');
  perform test_assert((select count(*) from public.worker_effective_rates where worker_id = '77000000-0000-0000-0000-000000000001') <= 1, 'effective view never returns two rows for a worker');
  reset role;

  -- update and delete are denied for every role; the value is unchanged.
  perform test_as('a0000000-0000-0000-0000-00000000000a');
  denied := 0;
  begin update public.worker_wage_rates set rate = 1 where worker_id = '77000000-0000-0000-0000-000000000001';
  exception when insufficient_privilege then denied := denied + 1; end;
  begin delete from public.worker_wage_rates;
  exception when insufficient_privilege then denied := denied + 1; end;
  reset role;
  perform test_assert(denied = 2, 'rates cannot be updated or deleted');
  perform test_assert((select min(rate) from public.worker_wage_rates where worker_id = '77000000-0000-0000-0000-000000000001') = 500.00, 'rate values unchanged');

  -- PM and supervisor cannot add a rate; same-day duplicate, zero rate, cross-org worker rejected.
  denied := 0;
  perform test_as('c0000000-0000-0000-0000-00000000000c');
  begin insert into public.worker_wage_rates (org_id, worker_id, rate, effective_from) values ('aaaaaaaa-0000-0000-0000-000000000001', '77000000-0000-0000-0000-000000000001', 700, '2026-08-01');
  exception when insufficient_privilege then denied := denied + 1; end;
  reset role;
  perform test_as('b0000000-0000-0000-0000-00000000000b');
  begin insert into public.worker_wage_rates (org_id, worker_id, rate, effective_from) values ('aaaaaaaa-0000-0000-0000-000000000001', '77000000-0000-0000-0000-000000000001', 700, '2026-08-01');
  exception when insufficient_privilege then denied := denied + 1; end;
  reset role;
  perform test_as('a0000000-0000-0000-0000-00000000000a');
  begin insert into public.worker_wage_rates (org_id, worker_id, rate, effective_from) values ('aaaaaaaa-0000-0000-0000-000000000001', '77000000-0000-0000-0000-000000000001', 650, '2026-07-01');
  exception when unique_violation then denied := denied + 1; end;
  begin insert into public.worker_wage_rates (org_id, worker_id, rate, effective_from) values ('aaaaaaaa-0000-0000-0000-000000000001', '77000000-0000-0000-0000-000000000001', 0, '2026-09-01');
  exception when check_violation then denied := denied + 1; end;
  begin insert into public.worker_wage_rates (org_id, worker_id, rate, effective_from) values ('aaaaaaaa-0000-0000-0000-000000000001', '77000000-0000-0000-0000-0000000000b1', 100, '2026-09-01');
  exception when foreign_key_violation then denied := denied + 1; end;
  reset role;
  perform test_assert(denied = 5, 'PM, supervisor, duplicate day, zero rate and cross-org worker are all rejected');
end $$;

-- ------------------------------------------------------------ anonymize_worker
do $$
declare denied int; u uuid;
begin
  foreach u in array array['b0000000-0000-0000-0000-00000000000b', 'd0000000-0000-0000-0000-00000000000d', 'e0000000-0000-0000-0000-00000000000e']::uuid[] loop
    denied := 0;
    perform test_as(u);
    begin perform anonymize_worker('77000000-0000-0000-0000-000000000001');
    exception when insufficient_privilege then denied := 1; end;
    reset role;
    perform test_assert(denied = 1, 'anonymize denied for supervisor, accountant and other-org owner: ' || u);
  end loop;
  perform test_assert((select full_name from public.workers where id = '77000000-0000-0000-0000-000000000001') = 'Ravi', 'worker unchanged after blocked anonymize');

  -- same error for an id that does not exist.
  denied := 0;
  perform test_as('a0000000-0000-0000-0000-00000000000a');
  begin perform anonymize_worker('00000000-0000-0000-0000-00000000dead');
  exception when insufficient_privilege then denied := 1; end;
  reset role;
  perform test_assert(denied = 1, 'unknown worker id gives the same error as a forbidden one');

  perform test_as('a0000000-0000-0000-0000-00000000000a');
  perform anonymize_worker('77000000-0000-0000-0000-000000000001');
  reset role;
  perform test_assert(
    (select full_name = 'Anonymized worker' and phone is null and status = 'inactive' and anonymized_at is not null
       from public.workers where id = '77000000-0000-0000-0000-000000000001'),
    'anonymize removes personal fields and retires the worker');
  perform test_assert((select count(*) from public.worker_wage_rates where worker_id = '77000000-0000-0000-0000-000000000001') = 2, 'rate history survives anonymize');
  perform test_assert((select count(*) from public.worker_site_assignments where worker_id = '77000000-0000-0000-0000-000000000001') = 1, 'assignment history survives anonymize');
  perform test_assert(not exists (select 1 from public.worker_site_assignments where worker_id = '77000000-0000-0000-0000-000000000001' and unassigned_at is null), 'anonymize closes open assignments');

  -- an anonymized worker cannot be edited or assigned again.
  perform test_as('a0000000-0000-0000-0000-00000000000a');
  update public.workers set full_name = 'Back again' where id = '77000000-0000-0000-0000-000000000001';
  denied := 0;
  begin insert into public.worker_site_assignments (org_id, worker_id, site_id) values ('aaaaaaaa-0000-0000-0000-000000000001', '77000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001');
  exception when object_not_in_prerequisite_state then denied := 1; end;
  reset role;
  perform test_assert((select full_name from public.workers where id = '77000000-0000-0000-0000-000000000001') = 'Anonymized worker', 'an anonymized worker cannot be edited');
  perform test_assert(denied = 1, 'an anonymized worker cannot be assigned');
end $$;

-- --------------------------------------------------------------- import_workers
do $$
declare r jsonb; denied int; u uuid; n int;
begin
  -- A mixed file: one new, one existing (update), one invalid pay type, one blank code, one anonymized.
  perform test_as('a0000000-0000-0000-0000-00000000000a');
  r := import_workers('aaaaaaaa-0000-0000-0000-000000000001', $j$[
    {"code": "W-300", "full_name": "Anil", "trade": "painter", "pay_type": "daily"},
    {"code": "W-002", "full_name": "Sita Devi", "trade": "helper", "pay_type": "hourly"},
    {"code": "W-301", "full_name": "Bad", "trade": "painter", "pay_type": "monthly"},
    {"code": "",      "full_name": "Blank", "trade": "painter", "pay_type": "daily"},
    {"code": "W-001", "full_name": "Ravi again", "trade": "mason", "pay_type": "daily"}
  ]$j$);
  reset role;
  perform test_assert(r -> 0 ->> 'result' = 'created',  'new code is created: ' || r::text);
  perform test_assert(r -> 1 ->> 'result' = 'updated',  'existing code is updated');
  perform test_assert(r -> 2 ->> 'result' = 'rejected', 'invalid pay type is rejected');
  perform test_assert(r -> 3 ->> 'result' = 'rejected', 'blank code is rejected');
  perform test_assert(r -> 4 ->> 'result' = 'skipped',  'an anonymized worker is skipped');
  perform test_assert((select full_name from public.workers where code = 'W-002' and org_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 'Sita Devi', 'update applied');
  perform test_assert((select full_name from public.workers where code = 'W-001' and org_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 'Anonymized worker', 'skipped row left the anonymized worker alone');
  perform test_assert(not exists (select 1 from public.workers where code in ('W-301', '')), 'rejected rows left nothing behind');

  -- the same file twice creates no duplicate.
  select count(*) into n from public.workers where org_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  perform test_as('a0000000-0000-0000-0000-00000000000a');
  r := import_workers('aaaaaaaa-0000-0000-0000-000000000001', '[{"code": "W-300", "full_name": "Anil", "trade": "painter", "pay_type": "daily"}]');
  reset role;
  perform test_assert(r -> 0 ->> 'result' = 'updated', 'a repeated row is an update, not a duplicate');
  perform test_assert((select count(*) from public.workers where org_id = 'aaaaaaaa-0000-0000-0000-000000000001') = n, 'worker count unchanged by the repeat');

  -- a code used in another org is a separate worker.
  perform test_as('e0000000-0000-0000-0000-00000000000e');
  r := import_workers('bbbbbbbb-0000-0000-0000-000000000002', '[{"code": "W-300", "full_name": "Anil B", "trade": "painter", "pay_type": "daily"}]');
  reset role;
  perform test_assert(r -> 0 ->> 'result' = 'created', 'same code in another org is created separately');
  perform test_assert((select full_name from public.workers where code = 'W-300' and org_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 'Anil', 'the org A worker was not touched');

  -- who may import: supervisor and accountant, and an owner into another org.
  foreach u in array array['b0000000-0000-0000-0000-00000000000b', 'd0000000-0000-0000-0000-00000000000d']::uuid[] loop
    denied := 0;
    perform test_as(u);
    begin perform import_workers('aaaaaaaa-0000-0000-0000-000000000001', '[]');
    exception when insufficient_privilege then denied := 1; end;
    reset role;
    perform test_assert(denied = 1, 'non-manager cannot import: ' || u);
  end loop;
  denied := 0;
  perform test_as('a0000000-0000-0000-0000-00000000000a');
  begin perform import_workers('bbbbbbbb-0000-0000-0000-000000000002', '[]');
  exception when insufficient_privilege then denied := 1; end;
  reset role;
  perform test_assert(denied = 1, 'owner A cannot import into org B');

  -- not an array, and too many rows.
  denied := 0;
  perform test_as('a0000000-0000-0000-0000-00000000000a');
  begin perform import_workers('aaaaaaaa-0000-0000-0000-000000000001', '{"a": 1}');
  exception when invalid_parameter_value then denied := denied + 1; end;
  begin perform import_workers('aaaaaaaa-0000-0000-0000-000000000001',
    (select jsonb_agg(jsonb_build_object('code', 'M' || g, 'full_name', 'x', 'trade', 'x', 'pay_type', 'daily')) from generate_series(1, 1001) g));
  exception when invalid_parameter_value then denied := denied + 1; end;
  reset role;
  perform test_assert(denied = 2, 'a non-array and an oversized file are refused whole');
end $$;

-- ----------------------------------------------------------------------- audit
do $$
declare before_n int;
begin
  select count(*) into before_n from audit_log where table_name = 'workers';
  perform test_as('a0000000-0000-0000-0000-00000000000a');
  update public.workers set trade = 'audited' where id = '77000000-0000-0000-0000-000000000002';
  update public.workers set trade = 'blocked' where id = '77000000-0000-0000-0000-0000000000b1';   -- org B: 0 rows
  reset role;
  perform test_assert((select count(*) from audit_log where table_name = 'workers') = before_n + 1,
    'one audit row for one changed worker, none for a blocked update');
  perform test_assert(
    (select actor_id = 'a0000000-0000-0000-0000-00000000000a' and org_id = 'aaaaaaaa-0000-0000-0000-000000000001'
       from audit_log where table_name = 'workers' order by id desc limit 1),
    'audit row records the actor and the org');
end $$;

rollback;
