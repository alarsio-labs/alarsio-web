-- Workforce: pay type locked once a rate exists (W11), and a re-import keeps
-- the stored phone (W12). Review of #57.
begin;

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-00000000000a', 'alice@x'),
  ('c0000000-0000-0000-0000-00000000000c', 'carol@x');
insert into public.organizations (id, name, created_by) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Org A', 'a0000000-0000-0000-0000-00000000000a');
insert into public.memberships (org_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'owner'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000c', 'project_manager');
insert into public.workers (id, org_id, code, full_name, phone, trade, pay_type, created_by) values
  ('77000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'W-001', 'Ravi', '9876543210', 'mason', 'daily', 'a0000000-0000-0000-0000-00000000000a'),
  ('77000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'W-002', 'Sita', '9123456780', 'helper', 'daily', 'a0000000-0000-0000-0000-00000000000a');
-- W-001 has a rate; W-002 has none.
insert into public.worker_wage_rates (org_id, worker_id, rate, effective_from, created_by) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '77000000-0000-0000-0000-000000000001', 650, '2026-01-01', 'a0000000-0000-0000-0000-00000000000a');

-- W11: direct edit
do $$
declare s text; n int;
begin
  perform test_as('c0000000-0000-0000-0000-00000000000c');            -- PM, who cannot read rates
  begin update public.workers set pay_type = 'hourly' where id = '77000000-0000-0000-0000-000000000001';
  exception when others then s := sqlstate; end;
  reset role;
  perform test_assert(s = '55000', 'pay type change refused once a rate exists, even for a PM who cannot see the rate, got ' || coalesce(s, 'no error'));
  perform test_assert((select pay_type from public.workers where id = '77000000-0000-0000-0000-000000000001') = 'daily', 'pay type unchanged');

  perform test_as('c0000000-0000-0000-0000-00000000000c');
  update public.workers set pay_type = 'hourly' where id = '77000000-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  update public.workers set trade = 'senior mason' where id = '77000000-0000-0000-0000-000000000001';
  reset role;
  perform test_assert(n = 1, 'pay type can change while there is no rate');
  perform test_assert((select trade from public.workers where id = '77000000-0000-0000-0000-000000000001') = 'senior mason', 'other fields still edit on a worker with a rate');
end $$;

-- W11 and W12: through import_workers
do $$
declare r jsonb;
begin
  perform test_as('a0000000-0000-0000-0000-00000000000a');
  r := import_workers('aaaaaaaa-0000-0000-0000-000000000001', $j$[
    {"code": "W-001", "full_name": "Ravi K", "trade": "mason", "pay_type": "hourly"},
    {"code": "W-002", "full_name": "Sita Devi", "trade": "helper", "pay_type": "hourly"}
  ]$j$);
  reset role;
  perform test_assert(r -> 0 ->> 'result' = 'rejected' and r -> 0 ->> 'reason' = 'pay_type_locked', 'import refuses a pay type change once a rate exists: ' || (r -> 0)::text);
  perform test_assert(r -> 1 ->> 'result' = 'updated', 'the other row still imports');
  perform test_assert((select full_name from public.workers where code = 'W-001') = 'Ravi', 'the refused row changed nothing');
  perform test_assert((select phone from public.workers where code = 'W-002') = '9123456780', 'a row with no phone keeps the stored phone (W12)');

  perform test_as('a0000000-0000-0000-0000-00000000000a');
  r := import_workers('aaaaaaaa-0000-0000-0000-000000000001', '[{"code": "W-002", "full_name": "Sita Devi", "trade": "helper", "pay_type": "hourly", "phone": "9000000000"}]');
  reset role;
  perform test_assert((select phone from public.workers where code = 'W-002') = '9000000000', 'a phone in the file still updates it');
end $$;

do $$ begin
  perform test_assert(
    (select prosecdef and proconfig @> array['search_path=public'] from pg_proc where oid = 'public.workers_lock_pay_type()'::regprocedure),
    'pay type lock is definer with a pinned search_path');
  perform test_assert(not has_function_privilege('authenticated', 'public.workers_lock_pay_type()', 'execute'), 'clients cannot call the lock directly');
end $$;

rollback;
