-- Offline Sync: sync_push answers a stale write to an approved record as a conflict.
-- Owner: Nikhil. Issue #28 (the ask on PR 2), PS409 agreed on #13. ADR-009, ADR-014.
--
-- Attendance's approved-day lock (20261025110000) raises SQLSTATE PS409 when a phone
-- writes to an approved day. Until now sync_push had no clause for it, so the router
-- answered retryable_error / server_error and the phone would have retried the same
-- record for ever. It is now conflict / locked: the server keeps its version, and the
-- phone shows the record for review (ADR-009).
--
-- The only change from 20261017100000 is the PS409 clause. It is a new migration, not
-- an edit of the merged one, so a project that already ran the old one gets it. A
-- `create or replace` keeps the grants, so sync_push stays executable by authenticated
-- only.

create or replace function public.sync_push(p_batch jsonb)
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
        -- because PL/pgSQL variables are not rolled back. PS001 is private to
        -- this function; nothing else may raise it.
        if v_result.verdict <> 'accepted' then
          raise sqlstate 'PS001';
        end if;
      exception
        when sqlstate 'PS001' then
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
        -- A guard refused a move the record's state does not allow, such as
        -- submitted back to draft (Daily Reporting) or a new assignment on an
        -- archived site (Sites). Sending it again cannot help. This must come
        -- after the lock clause above: a code ending in 000 matches its whole
        -- class, so this also catches 55P03 if it is reached first.
        when sqlstate '55000' then
          v_result := ('rejected', 'invalid_state');
        -- A lock trigger refused a write to a record a manager has already approved
        -- (Attendance's approved-day lock, agreed on #13). The phone is stale, and
        -- sending the same record again can only be refused again, so this is a
        -- conflict, never a retry. Only this exact code: PS409 shares no class with
        -- another clause (only a code ending in 000 matches a whole class), and the
        -- internal PS001 above is matched exactly, so the order is safe.
        when sqlstate 'PS409' then
          v_result := ('conflict', 'locked');
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
