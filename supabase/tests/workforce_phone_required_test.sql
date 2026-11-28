-- Workforce: import_workers() needs a phone to create a worker, not to update one (ADR-056).
begin;

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-00000000000a', 'alice@x');
insert into public.organizations (id, name, created_by) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Org A', 'a0000000-0000-0000-0000-00000000000a');
insert into public.memberships (org_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'owner');
-- W-010 has a phone, W-020 is an old worker with none, W-030 is anonymized.
insert into public.workers (org_id, code, full_name, phone, trade, pay_type, status, anonymized_at, created_by) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'W-010', 'Ravi', '9876543210', 'mason', 'daily', 'active', null, 'a0000000-0000-0000-0000-00000000000a'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'W-020', 'Old Sita', null, 'helper', 'daily', 'active', null, 'a0000000-0000-0000-0000-00000000000a'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'W-030', 'Anonymized worker', null, 'helper', 'daily', 'inactive', now(), 'a0000000-0000-0000-0000-00000000000a');

do $$
declare r jsonb;
begin
  perform test_as('a0000000-0000-0000-0000-00000000000a');
  r := import_workers('aaaaaaaa-0000-0000-0000-000000000001', $j$[
    {"code": "W-100", "full_name": "No key", "trade": "mason", "pay_type": "daily"},
    {"code": "W-101", "full_name": "Blank", "trade": "mason", "pay_type": "daily", "phone": "   "},
    {"code": "W-102", "full_name": "Null", "trade": "mason", "pay_type": "daily", "phone": null},
    {"code": "W-103", "full_name": "Has phone", "trade": "mason", "pay_type": "daily", "phone": "9000000103"},
    {"full_name": "No code, no phone", "trade": "mason", "pay_type": "daily"},
    {"code": "", "full_name": "Blank code", "trade": "mason", "pay_type": "daily", "phone": "9000000104"}
  ]$j$);
  reset role;
  perform test_assert(r -> 0 ->> 'reason' = 'phone_required', 'a new worker with no phone key is refused: ' || (r -> 0)::text);
  perform test_assert(r -> 1 ->> 'reason' = 'phone_required', 'a blank phone is refused for a new worker');
  perform test_assert(r -> 2 ->> 'reason' = 'phone_required', 'a null phone is refused for a new worker');
  perform test_assert(r -> 3 ->> 'result' = 'created', 'a new worker with a phone is created');
  perform test_assert(r -> 4 ->> 'reason' = 'phone_required', 'a row with no code and no phone is refused');
  perform test_assert(r -> 5 ->> 'reason' = 'invalid_value', 'a blank code is still refused by the table check: ' || (r -> 5)::text);
  perform test_assert((select count(*) from public.workers where code in ('W-100', 'W-101', 'W-102')) = 0, 'refused rows left nothing behind');
  perform test_assert((select phone from public.workers where code = 'W-103') = '9000000103', 'the phone was saved');
end $$;

-- An existing worker needs no phone in the file, whatever case the code is in.
do $$
declare r jsonb;
begin
  perform test_as('a0000000-0000-0000-0000-00000000000a');
  r := import_workers('aaaaaaaa-0000-0000-0000-000000000001', $j$[
    {"code": "w-010", "full_name": "Ravi K", "trade": "mason", "pay_type": "daily"},
    {"code": "W-020", "full_name": "Sita Devi", "trade": "helper", "pay_type": "daily"},
    {"code": "W-030", "full_name": "Anyone", "trade": "helper", "pay_type": "daily"}
  ]$j$);
  reset role;
  perform test_assert(r -> 0 ->> 'result' = 'updated', 'an existing worker updates with no phone, in any case: ' || (r -> 0)::text);
  perform test_assert((select phone from public.workers where code = 'W-010') = '9876543210', 'the stored phone is kept');
  perform test_assert(r -> 1 ->> 'result' = 'updated', 'an old worker with no phone still updates');
  perform test_assert((select phone is null and full_name = 'Sita Devi' from public.workers where code = 'W-020'), 'the old worker stays without a phone until edited');
  perform test_assert(r -> 2 ->> 'result' = 'skipped' and r -> 2 ->> 'reason' = 'anonymized', 'an anonymized worker is skipped, not asked for a phone');
end $$;

rollback;
