-- Offline Sync: the sync_push router and the result type every handler returns.
-- Owner: Nikhil. Issue #33. Verdicts: ADR-009. Handler contract: #13. Shape: ADR-011.
--
-- sync_push is a thin router (ARCHITECTURE rule 5). It checks the envelope, calls
-- the rate limit once, then hands each record to its owning module's handler,
-- public.sync_<entity>(record_id uuid, payload jsonb) returns sync_result. It
-- writes no table itself, and holds no business logic.

-- ----------------------------------------------------------------- types

create type public.sync_verdict as enum (
  'accepted', 'conflict', 'rejected', 'retryable_error'
);

-- What a handler returns: the verdict, and a short reason code for anything
-- other than accepted. Never a database error message.
-- Cast it in RETURN: `return ('accepted', null)::public.sync_result;`. Without the
-- cast PL/pgSQL fails at run time, and sync_push reports server_error (ADR-011).
create type public.sync_result as (
  verdict public.sync_verdict,
  reason  text
);

-- ------------------------------------------------------------- sync_push

-- SECURITY INVOKER on purpose: every handler then writes under the caller's own
-- RLS, so syncing gives a phone no right it would not have online (#13).
create function public.sync_push(p_batch jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  -- The seven field entities (FEATURES.md, technical design §8). Adding one is a
  -- handler plus one entry here, never a new branch of logic (IMPROVEMENTS #4).
  c_entities constant text[] := array[
    'site_visits', 'attendance_days', 'attendance_entries', 'attendance_corrections',
    'daily_reports', 'report_photos',
    'material_transactions'
  ];
  c_max_records constant int := 100;

  v_records      jsonb;
  v_record       jsonb;
  v_entity       text;
  v_record_id    uuid;
  v_result       public.sync_result;
  v_results      jsonb := '[]'::jsonb;
  v_rate_limited boolean := false;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- 1. Rate limit, once per call, before anything else, so a malformed call
  --    still counts. Only PT429 means "slow down". Any other error, including
  --    the function being missing, fails the whole call: there is no skip.
  begin
    perform public.enforce_rate_limit('sync_push', 120, interval '1 minute');
  exception when sqlstate 'PT429' then
    v_rate_limited := true;
  end;

  -- 2. The envelope. A bad one is a phone bug, answered as a normal response
  --    rather than raised, so the rate-limit increment above is not rolled back.
  if jsonb_typeof(p_batch) is distinct from 'object' then
    return public.sync_push_envelope_error('not_an_object');
  end if;
  if p_batch -> 'version' is distinct from to_jsonb(1) then
    return public.sync_push_envelope_error('unsupported_version');
  end if;
  if jsonb_typeof(p_batch -> 'device_id') is distinct from 'string'
     or char_length(p_batch ->> 'device_id') not between 1 and 64 then
    return public.sync_push_envelope_error('invalid_device_id');
  end if;

  v_records := p_batch -> 'records';
  if jsonb_typeof(v_records) is distinct from 'array' then
    return public.sync_push_envelope_error('records_not_an_array');
  end if;
  if jsonb_array_length(v_records) > c_max_records then
    return public.sync_push_envelope_error('too_many_records');
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_records) as r (item)
    where jsonb_typeof(item) is distinct from 'object'
       or jsonb_typeof(item -> 'entity') is distinct from 'string'
       or jsonb_typeof(item -> 'record_id') is distinct from 'string'
  ) then
    return public.sync_push_envelope_error('invalid_record_shape');
  end if;
  -- The outbox is keyed on (entity, record_id), so one batch never holds the
  -- same key twice. Two answers for one outbox row would be ambiguous.
  if exists (
    select 1 from jsonb_array_elements(v_records) as r (item)
    group by item ->> 'entity', lower(item ->> 'record_id')
    having count(*) > 1
  ) then
    return public.sync_push_envelope_error('duplicate_record');
  end if;

  -- 3. One verdict per record, in request order. Each record runs in its own
  --    sub-transaction, so one bad record never blocks or undoes another.
  for v_record in
    select r.item from jsonb_array_elements(v_records) with ordinality as r (item, n)
    order by r.n
  loop
    v_entity := v_record ->> 'entity';
    v_result := null;

    begin
      v_record_id := (v_record ->> 'record_id')::uuid;
    exception when invalid_text_representation then
      v_record_id := null;
    end;

    -- A refused batch answers every record the same way (ADR-009): nothing in
    -- it was looked at, so nothing in it can be called rejected yet.
    if v_rate_limited then
      v_result := ('retryable_error', 'rate_limited');
    elsif v_record_id is null then
      v_result := ('rejected', 'invalid_record_id');
    elsif not (v_entity = any (c_entities)) then
      v_result := ('rejected', 'unknown_entity');
    elsif jsonb_typeof(v_record -> 'payload') is distinct from 'object' then
      v_result := ('rejected', 'invalid_payload');
    else
      begin
        -- v_entity is one of c_entities, and %I quotes it, so this is not
        -- injectable.
        execute format('select * from public.%I($1, $2)', 'sync_' || v_entity)
          into v_result
          using v_record_id, v_record -> 'payload';

        if v_result.verdict is null then
          raise exception 'sync handler for % returned no verdict', v_entity;
        end if;
        -- Only an accepted record may leave rows behind. Raising here rolls back
        -- whatever a rejecting or conflicting handler wrote; v_result survives,
        -- because PL/pgSQL variables are not rolled back.
        if v_result.verdict <> 'accepted' then
          raise sqlstate 'PS409';
        end if;
      exception
        when sqlstate 'PS409' then
          null;
        when undefined_function then
          v_result := ('retryable_error', 'handler_unavailable');
        when insufficient_privilege then
          v_result := ('rejected', 'permission_denied');
        when check_violation or not_null_violation or data_exception then
          v_result := ('rejected', 'invalid_input');
        when unique_violation then
          v_result := ('conflict', 'duplicate');
        when foreign_key_violation then
          v_result := ('retryable_error', 'missing_parent');
        when serialization_failure or deadlock_detected or lock_not_available then
          v_result := ('retryable_error', 'busy');
        when others then
          v_result := ('retryable_error', 'server_error');
      end;
    end if;

    v_results := v_results || jsonb_build_object(
      'entity',    v_entity,
      'record_id', v_record ->> 'record_id',
      'verdict',   v_result.verdict,
      'reason',    v_result.reason
    );
  end loop;

  return jsonb_build_object('results', v_results);
end;
$$;

-- The one shape of an envelope error, so the phone parses a single format.
create function public.sync_push_envelope_error(p_reason text)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select jsonb_build_object('error', 'invalid_envelope', 'reason', p_reason);
$$;

revoke all on function public.sync_push(jsonb)                from public, anon;
revoke all on function public.sync_push_envelope_error(text)  from public, anon;
grant execute on function public.sync_push(jsonb)               to authenticated;
grant execute on function public.sync_push_envelope_error(text) to authenticated;
