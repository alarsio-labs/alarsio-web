-- Offline Sync: sync_push router. Issue #33, ADR-009, ADR-014.
--
-- No real handlers exist yet, so this file creates test-only stand-ins inside
-- its own transaction and rolls them back: a handler for material_transactions
-- that writes to a scratch table, and an enforce_rate_limit we can switch to
-- "limited" or "broken". Every check reads rows back rather than trusting that
-- no error was raised.
begin;

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-00000000000a', 'supervisor@x');

-- ---------------------------------------------------------- test doubles

create table public.sync_test_rows (id uuid primary key, body jsonb not null);
create table public.sync_test_rate_calls (key text, max_hits int, win interval);
grant select, insert, update on public.sync_test_rows, public.sync_test_rate_calls
  to authenticated;

-- Replaces Anuradha's enforce_rate_limit (#32) for this file only. Records each call, and
-- raises PT429 or an unrelated error when the test asks it to.
create or replace function public.enforce_rate_limit(p_key text, p_limit int, p_window interval)
returns void language plpgsql as $$
begin
  insert into public.sync_test_rate_calls values (p_key, p_limit, p_window);
  if current_setting('sync_test.mode', true) = 'limited' then
    raise exception 'rate limit exceeded' using errcode = 'PT429';
  elsif current_setting('sync_test.mode', true) = 'broken' then
    raise exception 'rate limiter broken' using errcode = 'XX000';
  end if;
end $$;
grant execute on function public.enforce_rate_limit(text, int, interval) to authenticated;

-- Stand-in handler. payload.mode picks the behaviour; the default path is a
-- correct idempotent handler: insert once, then accepted for the same content
-- and conflict for different content.
create or replace function public.sync_material_transactions(p_record_id uuid, p_payload jsonb)
returns public.sync_result language plpgsql as $$
declare v_existing jsonb;
begin
  case p_payload ->> 'mode'
    when 'insert_then_fail' then
      insert into public.sync_test_rows values (p_record_id, p_payload);
      raise exception 'bad quantity' using errcode = '23514';
    when 'insert_then_reject' then
      insert into public.sync_test_rows values (p_record_id, p_payload);
      return ('rejected', 'bad_quantity')::public.sync_result;
    when 'permission'     then raise exception 'rls' using errcode = '42501';
    when 'not_null'       then raise exception 'nn'  using errcode = '23502';
    when 'bad_number'     then perform ('not a number')::int;
    when 'unique'         then raise exception 'uq'  using errcode = '23505';
    when 'invalid_state'  then raise exception 'st'  using errcode = '55000';
    when 'missing_parent' then raise exception 'fk'  using errcode = '23503';
    when 'busy'           then raise exception 'ser' using errcode = '40001';
    when 'deadlock'       then raise exception 'dl'  using errcode = '40P01';
    when 'locked'         then raise exception 'lk'  using errcode = '55P03';
    when 'boom'           then raise exception 'secret internal detail';
    when 'null'           then return null;
    else null;
  end case;

  insert into public.sync_test_rows (id, body) values (p_record_id, p_payload)
    on conflict (id) do nothing;
  if found then
    return ('accepted', null)::public.sync_result;
  end if;
  select body into v_existing from public.sync_test_rows where id = p_record_id;
  if v_existing = p_payload then
    return ('accepted', null)::public.sync_result;
  end if;
  return ('conflict', 'different_content')::public.sync_result;
end $$;
grant execute on function public.sync_material_transactions(uuid, jsonb) to authenticated;

-- report_photos has no handler in this test, whatever is deployed later.
drop function if exists public.sync_report_photos(uuid, jsonb);

-- Push as the supervisor and switch back, so assertions run as postgres.
create function public.sync_test_push(p_batch jsonb) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform test_as('a0000000-0000-0000-0000-00000000000a');
  v := public.sync_push(p_batch);
  execute 'reset role';
  return v;
end $$;

-- "verdict:reason" per record, in response order, for compact assertions.
create function public.sync_test_verdicts(p_response jsonb) returns text language sql as $$
  select string_agg((x ->> 'verdict') || ':' || coalesce(x ->> 'reason', '-'), ',' order by n)
  from jsonb_array_elements(p_response -> 'results') with ordinality as t (x, n)
$$;

-- An envelope with the given records.
create function public.sync_test_batch(p_records jsonb) returns jsonb language sql as $$
  select jsonb_build_object('version', 1, 'device_id', 'test-phone', 'records', p_records)
$$;

create function public.sync_test_rate_call_count() returns bigint language sql as $$
  select count(*) from public.sync_test_rate_calls
$$;

-- ----------------------------------------------------- who may call it

do $$
declare denied boolean := false;
begin
  perform test_as_anon();
  begin
    perform public.sync_push(public.sync_test_batch('[]'));
  exception when insufficient_privilege then denied := true;
  end;
  reset role;
  perform test_assert(denied, 'anon cannot execute sync_push');
end $$;

do $$
declare raised boolean := false;
begin
  perform test_as(null);
  begin
    perform public.sync_push(public.sync_test_batch('[]'));
  exception when sqlstate '28000' then raised := true;
  end;
  reset role;
  perform test_assert(raised, 'a call with no auth.uid() raises 28000');
end $$;

do $$ begin
  perform test_assert(
    (select not prosecdef and proconfig @> array['search_path=public']
       from pg_proc where oid = 'public.sync_push(jsonb)'::regprocedure),
    'sync_push is security invoker with search_path = public');
  perform test_assert(has_function_privilege('authenticated', 'public.sync_push(jsonb)', 'execute'),
    'authenticated may execute sync_push');
  perform test_assert(not has_function_privilege('anon', 'public.sync_push(jsonb)', 'execute'),
    'anon may not execute sync_push');
end $$;

-- ----------------------------------------------------- envelope errors

do $$
declare
  v_cases jsonb := jsonb_build_array(
    jsonb_build_array('[]'::jsonb, 'not_an_object'),
    jsonb_build_array('{"device_id": "p", "records": []}'::jsonb, 'unsupported_version'),
    jsonb_build_array('{"version": 2, "device_id": "p", "records": []}'::jsonb, 'unsupported_version'),
    jsonb_build_array('{"version": "1", "device_id": "p", "records": []}'::jsonb, 'unsupported_version'),
    jsonb_build_array('{"version": 1, "records": []}'::jsonb, 'invalid_device_id'),
    jsonb_build_array('{"version": 1, "device_id": "", "records": []}'::jsonb, 'invalid_device_id'),
    jsonb_build_array(jsonb_build_object('version', 1, 'device_id', repeat('x', 65), 'records', '[]'::jsonb), 'invalid_device_id'),
    jsonb_build_array('{"version": 1, "device_id": "p"}'::jsonb, 'records_not_an_array'),
    jsonb_build_array('{"version": 1, "device_id": "p", "records": {}}'::jsonb, 'records_not_an_array'),
    jsonb_build_array(public.sync_test_batch(
      (select jsonb_agg(jsonb_build_object('entity', 'material_transactions',
              'record_id', gen_random_uuid()::text, 'payload', '{}'::jsonb))
         from generate_series(1, 101))), 'too_many_records'),
    jsonb_build_array(public.sync_test_batch('[1]'), 'invalid_record_shape'),
    jsonb_build_array(public.sync_test_batch('[{"entity": "material_transactions"}]'), 'invalid_record_shape'),
    jsonb_build_array(public.sync_test_batch(
      '[{"entity": "material_transactions", "record_id": "11111111-1111-1111-1111-11111111aaaa", "payload": {}},
        {"entity": "material_transactions", "record_id": "11111111-1111-1111-1111-11111111AAAA", "payload": {}}]'),
      'duplicate_record')
  );
  v_case     jsonb;
  v_response jsonb;
  v_calls    bigint;
begin
  for v_case in select c from jsonb_array_elements(v_cases) as t (c) loop
    v_calls := public.sync_test_rate_call_count();
    v_response := public.sync_test_push(v_case -> 0);

    perform test_assert(
      v_response = jsonb_build_object('error', 'invalid_envelope', 'reason', v_case ->> 1),
      format('envelope error %s, got %s', v_case ->> 1, v_response));
    perform test_assert(public.sync_test_rate_call_count() = v_calls + 1,
      format('rate limit still counted for %s', v_case ->> 1));
  end loop;

  perform test_assert((select count(*) from public.sync_test_rows) = 0,
    'no envelope error wrote anything');
  perform test_assert(
    (select bool_and(key = 'sync_push' and max_hits = 120 and win = interval '1 minute')
       from public.sync_test_rate_calls),
    'enforce_rate_limit is called with key sync_push, 120, 1 minute');
end $$;

do $$
declare v_response jsonb;
begin
  v_response := public.sync_test_push(public.sync_test_batch('[]'));
  perform test_assert(v_response = '{"results": []}'::jsonb, 'an empty batch returns no results');

  -- Exactly 100 is allowed. Unknown entities, so no handler runs.
  v_response := public.sync_test_push(public.sync_test_batch(
    (select jsonb_agg(jsonb_build_object('entity', 'punch_list',
            'record_id', gen_random_uuid()::text, 'payload', '{}'::jsonb))
       from generate_series(1, 100))));
  perform test_assert(jsonb_array_length(v_response -> 'results') = 100,
    '100 records are allowed and each gets a result');
end $$;

-- ------------------------------------------------------------ rate limit

do $$
declare v_response jsonb;
begin
  perform set_config('sync_test.mode', 'limited', true);
  v_response := public.sync_test_push(public.sync_test_batch(
    '[{"entity": "material_transactions", "record_id": "22222222-0000-0000-0000-000000000001", "payload": {}},
      {"entity": "punch_list",            "record_id": "22222222-0000-0000-0000-000000000002", "payload": {}},
      {"entity": "material_transactions", "record_id": "not-a-uuid",                           "payload": {}}]'));
  perform set_config('sync_test.mode', '', true);

  perform test_assert(
    public.sync_test_verdicts(v_response)
      = 'retryable_error:rate_limited,retryable_error:rate_limited,retryable_error:rate_limited',
    format('a limited batch answers every record rate_limited, got %s', v_response));
  perform test_assert(
    not exists (select 1 from public.sync_test_rows where id = '22222222-0000-0000-0000-000000000001'),
    'no handler runs when the batch is rate limited');
end $$;

do $$
declare raised boolean := false;
begin
  perform set_config('sync_test.mode', 'broken', true);
  begin
    perform public.sync_test_push(public.sync_test_batch('[]'));
  exception when sqlstate 'XX000' then raised := true;
  end;
  reset role;
  perform set_config('sync_test.mode', '', true);
  perform test_assert(raised, 'any rate limit error other than PT429 fails the whole call');
end $$;

do $$
declare raised boolean := false;
begin
  begin
    drop function public.enforce_rate_limit(text, int, interval);
    perform public.sync_test_push(public.sync_test_batch('[]'));
  exception when undefined_function then raised := true;
  end;
  reset role;
  perform test_assert(raised, 'a missing enforce_rate_limit fails closed, it is never skipped');
  perform test_assert(to_regprocedure('public.enforce_rate_limit(text, int, interval)') is not null,
    'the stand-in survives, because the drop rolled back with the failed call');
end $$;

-- ---------------------------------------------- one verdict per record

do $$
declare v_response jsonb;
begin
  v_response := public.sync_test_push(public.sync_test_batch(
    '[{"entity": "material_transactions",  "record_id": "33333333-0000-0000-0000-000000000001", "payload": {"qty": 1}},
      {"entity": "material_transactions",  "record_id": "not-a-uuid",                           "payload": {}},
      {"entity": "punch_list",             "record_id": "33333333-0000-0000-0000-000000000003", "payload": {}},
      {"entity": "material_transactions",  "record_id": "33333333-0000-0000-0000-000000000004", "payload": [1]},
      {"entity": "report_photos",          "record_id": "33333333-0000-0000-0000-000000000005", "payload": {}},
      {"entity": "material_transactions",  "record_id": "33333333-0000-0000-0000-000000000006", "payload": {"mode": "insert_then_fail"}},
      {"entity": "material_transactions",  "record_id": "33333333-0000-0000-0000-000000000007", "payload": {"mode": "insert_then_reject"}},
      {"entity": "material_transactions",  "record_id": "33333333-0000-0000-0000-000000000008", "payload": {"qty": 8}}]'));

  perform test_assert(
    public.sync_test_verdicts(v_response) = 'accepted:-,rejected:invalid_record_id,rejected:unknown_entity,'
      || 'rejected:invalid_payload,retryable_error:handler_unavailable,rejected:invalid_input,'
      || 'rejected:bad_quantity,accepted:-',
    format('mixed batch verdicts, got %s', public.sync_test_verdicts(v_response)));

  perform test_assert(
    (v_response -> 'results' -> 0 ->> 'record_id') = '33333333-0000-0000-0000-000000000001'
    and (v_response -> 'results' -> 1 ->> 'record_id') = 'not-a-uuid'
    and (v_response -> 'results' -> 7 ->> 'record_id') = '33333333-0000-0000-0000-000000000008'
    and (v_response -> 'results' -> 2 ->> 'entity') = 'punch_list',
    'results echo each entity and record_id in request order');

  -- Read the rows back: good records saved, failed ones left nothing.
  perform test_assert(exists (select 1 from public.sync_test_rows where id = '33333333-0000-0000-0000-000000000001'),
    'the first good record is saved');
  perform test_assert(exists (select 1 from public.sync_test_rows where id = '33333333-0000-0000-0000-000000000008'),
    'a good record after failing ones is still saved');
  perform test_assert(not exists (select 1 from public.sync_test_rows where id = '33333333-0000-0000-0000-000000000006'),
    'a handler that wrote a row and then raised leaves no row');
  perform test_assert(not exists (select 1 from public.sync_test_rows where id = '33333333-0000-0000-0000-000000000007'),
    'a handler that wrote a row and then returned rejected leaves no row');
  perform test_assert((select count(*) from public.sync_test_rows) = 2, 'exactly the two good rows exist');
end $$;

-- ---------------------------------------------------- replay and conflict

do $$
declare
  v_batch  jsonb := public.sync_test_batch(
    '[{"entity": "material_transactions", "record_id": "44444444-0000-0000-0000-000000000001", "payload": {"qty": 5}},
      {"entity": "material_transactions", "record_id": "44444444-0000-0000-0000-000000000002", "payload": {"qty": 6}}]');
  v_first  jsonb;
  v_second jsonb;
  v_before bigint;
  v_after_first bigint;
begin
  v_before := (select count(*) from public.sync_test_rows);
  v_first := public.sync_test_push(v_batch);
  v_after_first := (select count(*) from public.sync_test_rows);
  v_second := public.sync_test_push(v_batch);

  perform test_assert(v_after_first = v_before + 2, 'the first push creates two rows');
  perform test_assert((select count(*) from public.sync_test_rows) = v_after_first,
    'the same batch pushed twice creates nothing the second time');
  perform test_assert(public.sync_test_verdicts(v_second) = 'accepted:-,accepted:-',
    'a replayed batch is accepted again');
  perform test_assert(v_first = v_second, 'a replay gets the same answer as the first push');
end $$;

do $$
declare v_response jsonb;
begin
  v_response := public.sync_test_push(public.sync_test_batch(
    '[{"entity": "material_transactions", "record_id": "44444444-0000-0000-0000-000000000001", "payload": {"qty": 999}}]'));
  perform test_assert(public.sync_test_verdicts(v_response) = 'conflict:different_content',
    format('same id with different content is a conflict, got %s', v_response));
  perform test_assert(
    (select body from public.sync_test_rows where id = '44444444-0000-0000-0000-000000000001') = '{"qty": 5}'::jsonb,
    'a conflict leaves the stored row unchanged');
end $$;

-- ------------------------------------------- exceptions mapped to verdicts

do $$
declare v_response jsonb;
begin
  v_response := public.sync_test_push(public.sync_test_batch(
    '[{"entity": "material_transactions", "record_id": "55555555-0000-0000-0000-000000000001", "payload": {"mode": "permission"}},
      {"entity": "material_transactions", "record_id": "55555555-0000-0000-0000-000000000002", "payload": {"mode": "not_null"}},
      {"entity": "material_transactions", "record_id": "55555555-0000-0000-0000-000000000003", "payload": {"mode": "bad_number"}},
      {"entity": "material_transactions", "record_id": "55555555-0000-0000-0000-000000000004", "payload": {"mode": "unique"}},
      {"entity": "material_transactions", "record_id": "55555555-0000-0000-0000-000000000005", "payload": {"mode": "missing_parent"}},
      {"entity": "material_transactions", "record_id": "55555555-0000-0000-0000-000000000006", "payload": {"mode": "busy"}},
      {"entity": "material_transactions", "record_id": "55555555-0000-0000-0000-000000000007", "payload": {"mode": "deadlock"}},
      {"entity": "material_transactions", "record_id": "55555555-0000-0000-0000-000000000008", "payload": {"mode": "locked"}},
      {"entity": "material_transactions", "record_id": "55555555-0000-0000-0000-000000000009", "payload": {"mode": "boom"}},
      {"entity": "material_transactions", "record_id": "55555555-0000-0000-0000-000000000010", "payload": {"mode": "null"}},
      {"entity": "material_transactions", "record_id": "55555555-0000-0000-0000-000000000011", "payload": {"mode": "invalid_state"}}]'));

  perform test_assert(
    public.sync_test_verdicts(v_response) = 'rejected:permission_denied,rejected:invalid_input,'
      || 'rejected:invalid_input,conflict:duplicate,retryable_error:missing_parent,'
      || 'retryable_error:busy,retryable_error:busy,retryable_error:busy,'
      || 'retryable_error:server_error,retryable_error:server_error,rejected:invalid_state',
    format('exception mapping, got %s', public.sync_test_verdicts(v_response)));
  perform test_assert(position('secret internal detail' in v_response::text) = 0,
    'a database error message never reaches the phone');
  perform test_assert(
    not exists (select 1 from public.sync_test_rows where id::text like '55555555-%'),
    'none of the failing records left a row');
end $$;

rollback;
