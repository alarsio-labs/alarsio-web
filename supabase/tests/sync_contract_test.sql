-- Offline Sync: the handler contract test. Issue #107. Contract: #13, ADR-014.
--
-- One suite that runs the SAME checks over all seven sync handlers, through the
-- real sync_push router, so each check is the verdict a phone would see:
--   [1] every handler exists with the shape ADR-014 fixes
--   [2] a replay creates no duplicate, one record and a whole batch
--   [3] one bad record does not block the rest of its batch
--   [4] every verdict carries a fixed reason code and leaks no database detail
-- Handler-specific business rules (the approved-day lock, the review of a daily
-- report, the stock balance) stay in each module's own suite. If a handler fails a
-- check here, that is a bug in its module: it is reported on #107 and fixed there.
--
-- Each scenario runs in its own sub-transaction that is rolled back, so a check
-- never sees rows another one wrote. Dates are relative to current_date.
begin;

-- ---------------------------------------------------------------- fixtures
-- Org A: owner, project manager, supervisor (assigned to site A1). Workers Ravi,
-- Sita and Arun are rostered at A1. A1 has a day five days ago that is approved,
-- with entries for Ravi and Sita (the target of the correction records). Cement is
-- a material at A1.

insert into auth.users (id, email) values
  ('c0000000-0000-0000-0000-0000000000a1', 'sc-owner@test.local'),
  ('c0000000-0000-0000-0000-0000000000a2', 'sc-pm@test.local'),
  ('c0000000-0000-0000-0000-0000000000a3', 'sc-sup@test.local');

insert into public.organizations (id, name, created_by) values
  ('c1000000-0000-0000-0000-00000000000a', 'Contract Org', 'c0000000-0000-0000-0000-0000000000a1');

insert into public.memberships (org_id, user_id, role) values
  ('c1000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-0000000000a1', 'owner'),
  ('c1000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-0000000000a2', 'project_manager'),
  ('c1000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-0000000000a3', 'supervisor');

insert into public.sites (id, org_id, name, address, latitude, longitude, status, created_by) values
  ('c2000000-0000-0000-0000-0000000000a1', 'c1000000-0000-0000-0000-00000000000a', 'Contract Site', 'Pune', 0, 0, 'active',
   'c0000000-0000-0000-0000-0000000000a1');

insert into public.site_assignments (org_id, site_id, user_id, assigned_by) values
  ('c1000000-0000-0000-0000-00000000000a', 'c2000000-0000-0000-0000-0000000000a1',
   'c0000000-0000-0000-0000-0000000000a3', 'c0000000-0000-0000-0000-0000000000a1');

insert into public.workers (id, org_id, code, full_name, trade, pay_type, created_by) values
  ('c7000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-00000000000a', 'W-001', 'Ravi', 'mason',  'daily', 'c0000000-0000-0000-0000-0000000000a1'),
  ('c7000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-00000000000a', 'W-002', 'Sita', 'helper', 'daily', 'c0000000-0000-0000-0000-0000000000a1'),
  ('c7000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-00000000000a', 'W-003', 'Arun', 'helper', 'daily', 'c0000000-0000-0000-0000-0000000000a1');

insert into public.worker_site_assignments (org_id, worker_id, site_id, assigned_by, assigned_at)
select 'c1000000-0000-0000-0000-00000000000a', w, 'c2000000-0000-0000-0000-0000000000a1',
       'c0000000-0000-0000-0000-0000000000a1', now() - interval '30 days'
  from (values ('c7000000-0000-0000-0000-000000000001'::uuid),
               ('c7000000-0000-0000-0000-000000000002'::uuid),
               ('c7000000-0000-0000-0000-000000000003'::uuid)) as x (w);

-- The approved day five days ago, written by the superuser, with two entries.
insert into public.attendance_days (org_id, site_id, attendance_date, recorded_by) values
  ('c1000000-0000-0000-0000-00000000000a', 'c2000000-0000-0000-0000-0000000000a1', current_date - 5,
   'c0000000-0000-0000-0000-0000000000a3');
insert into public.attendance_entries (org_id, site_id, attendance_date, worker_id, status, overtime_hours, recorded_by)
select 'c1000000-0000-0000-0000-00000000000a', 'c2000000-0000-0000-0000-0000000000a1', current_date - 5, w.id, 'present', w.ot,
       'c0000000-0000-0000-0000-0000000000a3'
  from (values ('c7000000-0000-0000-0000-000000000001'::uuid, 0),
               ('c7000000-0000-0000-0000-000000000002'::uuid, 2)) as w (id, ot);
update public.attendance_days
   set status = 'approved', reviewed_by = 'c0000000-0000-0000-0000-0000000000a2', reviewed_at = now()
 where site_id = 'c2000000-0000-0000-0000-0000000000a1' and attendance_date = current_date - 5;

insert into public.materials (id, org_id, site_id, name, unit, low_stock_threshold, created_by) values
  ('c9000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-00000000000a', 'c2000000-0000-0000-0000-0000000000a1',
   'Cement', 'bag', null, 'c0000000-0000-0000-0000-0000000000a1');

-- ----------------------------------------------------------------- helpers

-- The seven entities, in the order a batch must hold them: a day before its entries,
-- a report before its photos (ADR-016 sends a parent first).
create function public.sc_entities() returns text[] language sql immutable as $$
  select array['site_visits', 'attendance_days', 'attendance_entries', 'attendance_corrections',
               'daily_reports', 'report_photos', 'material_transactions']
$$;

create function public.sc_sup()  returns uuid language sql immutable as $$ select 'c0000000-0000-0000-0000-0000000000a3'::uuid $$;
create function public.sc_org()  returns uuid language sql immutable as $$ select 'c1000000-0000-0000-0000-00000000000a'::uuid $$;
create function public.sc_site() returns uuid language sql immutable as $$ select 'c2000000-0000-0000-0000-0000000000a1'::uuid $$;
create function public.sc_worker(n int) returns uuid language sql immutable as $$
  select ('c7000000-0000-0000-0000-00000000000' || n)::uuid
$$;

-- A record id "made on the phone", stable per entity and set number.
create function public.sc_id(p_entity text, p_n int) returns uuid language sql immutable as $$
  select md5('contract|' || p_entity || '|' || p_n)::uuid
$$;

-- A valid payload of one entity, set n (1 or 2): the two sets never share a natural
-- key, so both can be stored together. Set 1 and 2 use different days and workers.
create function public.sc_payload(p_entity text, p_n int) returns jsonb language plpgsql stable as $$
begin
  return case p_entity
    when 'site_visits' then jsonb_build_object(
      'org_id', public.sc_org(), 'site_id', public.sc_site(),
      'check_in_at', now() - (p_n || ' hours')::interval, 'check_in_lat', 0, 'check_in_lng', 0)
    when 'attendance_days' then jsonb_build_object(
      'org_id', public.sc_org(), 'site_id', public.sc_site(), 'attendance_date', current_date - (p_n + 1))
    when 'attendance_entries' then jsonb_build_object(
      'org_id', public.sc_org(), 'site_id', public.sc_site(), 'attendance_date', current_date - (p_n + 1),
      'worker_id', public.sc_worker(p_n), 'status', 'present', 'overtime_hours', 0)
    when 'attendance_corrections' then jsonb_build_object(
      'org_id', public.sc_org(), 'site_id', public.sc_site(), 'attendance_date', current_date - 5,
      'worker_id', public.sc_worker(p_n), 'new_status', 'half_day', 'new_overtime_hours', 0,
      'reason', 'Counted again')
    when 'daily_reports' then jsonb_build_object(
      'org_id', public.sc_org(), 'site_id', public.sc_site(), 'report_date', current_date - p_n,
      'status', 'submitted', 'headcount', 10 + p_n, 'work_done', 'Slab poured', 'blockers', null,
      'serious_blocker', false, 'safety_incident', false, 'next_day_plan', null)
    when 'report_photos' then jsonb_build_object(
      'report_id', public.sc_id('daily_reports', p_n),
      'storage_path', lower(public.sc_org()::text || '/' || public.sc_site()::text || '/'
                            || public.sc_id('daily_reports', p_n)::text || '/'
                            || public.sc_id('report_photos', p_n)::text || '.jpg'),
      'size_bytes', 1000 + p_n, 'content_type', 'image/jpeg', 'caption', null)
    when 'material_transactions' then jsonb_build_object(
      'material_id', 'c9000000-0000-0000-0000-000000000001', 'kind', 'receipt',
      'quantity', 5 + p_n, 'occurred_on', current_date - p_n)
  end;
end $$;

create function public.sc_rec(p_entity text, p_id uuid, p_payload jsonb) returns jsonb language sql immutable as $$
  select jsonb_build_object('entity', p_entity, 'record_id', p_id, 'payload', p_payload)
$$;

-- Push a batch as p_uid through sync_push and return the whole response. The rate
-- limit (120 a minute) is cleared first, since now() does not move inside one
-- transaction. Runs as the postgres user and switches back to it.
create function public.sc_push(p_uid uuid, p_records jsonb) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  delete from public.rate_limit_counters where user_id = p_uid;
  perform test_as(p_uid);
  v := public.sync_push(jsonb_build_object('version', 1, 'device_id', 'contract-phone', 'records', p_records));
  execute 'reset role';
  return v;
end $$;

-- "verdict:reason" for each result, in request order, comma separated.
create function public.sc_verdicts(p_response jsonb) returns text language sql as $$
  select string_agg((x ->> 'verdict') || ':' || coalesce(x ->> 'reason', '-'), ',' order by o)
    from jsonb_array_elements(p_response -> 'results') with ordinality as t (x, o)
$$;

-- Push one record and return "verdict:reason".
create function public.sc_one(p_entity text, p_id uuid, p_payload jsonb) returns text language sql as $$
  select public.sc_verdicts(public.sc_push(public.sc_sup(), jsonb_build_array(public.sc_rec(p_entity, p_id, p_payload))))
$$;

-- Rows in an entity's table, and whether one id is there.
create function public.sc_count(p_entity text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute format('select count(*) from public.%I', p_entity) into n;
  return n;
end $$;
create function public.sc_has(p_entity text, p_id uuid) returns boolean language plpgsql as $$
declare b boolean;
begin
  execute format('select exists (select 1 from public.%I where id = $1)', p_entity) into b using p_id;
  return b;
end $$;

-- What a record needs on the server before it can be stored, pushed as setup and not
-- under test: a day before its entries, a report before its photos.
create function public.sc_prereq(p_entity text, p_n int) returns void language plpgsql as $$
begin
  if p_entity = 'attendance_entries' then
    perform test_assert(public.sc_one('attendance_days', public.sc_id('attendance_days', p_n),
                                      public.sc_payload('attendance_days', p_n)) = 'accepted:-',
                        'setup: the day for set ' || p_n || ' is accepted');
  elsif p_entity = 'report_photos' then
    perform test_assert(public.sc_one('daily_reports', public.sc_id('daily_reports', p_n),
                                      public.sc_payload('daily_reports', p_n)) = 'accepted:-',
                        'setup: the report for set ' || p_n || ' is accepted');
  end if;
end $$;

-- ------------------------------------------------- 1 · every handler has the shape
-- ADR-014: sync_<entity>(uuid, jsonb) returns sync_result, security invoker, search_path
-- pinned, granted to authenticated and to no one else. A handler that is missing, or
-- returns another type, fails here by name, so no entity passes by silence.
do $$
declare e text; f regprocedure;
begin
  perform test_assert(cardinality(public.sc_entities()) = 7, '[1.00] the contract covers seven entities');
  foreach e in array public.sc_entities() loop
    f := to_regprocedure('public.sync_' || e || '(uuid, jsonb)');
    perform test_assert(f is not null, '[1.01] handler sync_' || e || '(uuid, jsonb) exists');
    perform test_assert((select prorettype = 'public.sync_result'::regtype from pg_proc where oid = f),
      '[1.02] sync_' || e || ' returns sync_result');
    perform test_assert((select not prosecdef from pg_proc where oid = f),
      '[1.03] sync_' || e || ' is security invoker, so it writes under the caller''s RLS');
    perform test_assert((select proconfig @> array['search_path=public'] from pg_proc where oid = f),
      '[1.04] sync_' || e || ' pins search_path');
    perform test_assert(
      has_function_privilege('authenticated', f, 'execute')
      and not has_function_privilege('anon', f, 'execute')
      and not has_function_privilege('public', f, 'execute'),
      '[1.05] sync_' || e || ' is granted to authenticated and not to anon or public');
    perform test_assert(public.sc_payload(e, 1) is not null and public.sc_payload(e, 2) is not null,
      '[1.06] the suite holds a valid payload for ' || e);
  end loop;
end $$;

-- ------------------------------------------------- 2 · a replay creates no duplicate
-- 2a. One record pushed twice, per entity. The phone sends again when it missed the
-- answer, so the second push must be answered `accepted` and must write nothing.
do $$
declare
  e text; v_id uuid; v_first text; v_second text; v_rows bigint; v_audit bigint;
begin
  foreach e in array public.sc_entities() loop
    begin
      perform public.sc_prereq(e, 1);
      v_id := public.sc_id(e, 1);

      v_first := public.sc_one(e, v_id, public.sc_payload(e, 1));
      perform test_assert(v_first = 'accepted:-', '[2.01] ' || e || ': a new valid record is accepted, got ' || v_first);
      perform test_assert(public.sc_has(e, v_id), '[2.02] ' || e || ': it is stored under the phone''s id');

      v_rows  := public.sc_count(e);
      v_audit := (select count(*) from public.audit_log where table_name = e);
      v_second := public.sc_one(e, v_id, public.sc_payload(e, 1));
      perform test_assert(v_second = 'accepted:-', '[2.03] ' || e || ': the same record again is accepted, got ' || v_second);
      perform test_assert(public.sc_count(e) = v_rows, '[2.04] ' || e || ': a replay creates no row');
      perform test_assert((select count(*) from public.audit_log where table_name = e) = v_audit,
        '[2.05] ' || e || ': a replay writes no audit row');
      perform test_assert(v_first = v_second, '[2.06] ' || e || ': a replay gets the same answer as the first push');

      raise exception 'sc_rollback';
    exception when others then
      if sqlerrm <> 'sc_rollback' then raise; end if;
    end;
  end loop;
end $$;

-- 2b. The whole batch pushed twice. One batch holds one record of every entity, in
-- batch order. The second push answers every record the same way and writes nothing.
do $$
declare
  e text; v_recs jsonb := '[]'; v_first jsonb; v_second jsonb;
  v_expected text := 'accepted:-,accepted:-,accepted:-,accepted:-,accepted:-,accepted:-,accepted:-';
  v_rows bigint; v_audit bigint;
begin
  begin
    foreach e in array public.sc_entities() loop
      v_recs := v_recs || jsonb_build_array(public.sc_rec(e, public.sc_id(e, 1), public.sc_payload(e, 1)));
    end loop;

    v_first := public.sc_push(public.sc_sup(), v_recs);
    perform test_assert(public.sc_verdicts(v_first) = v_expected,
      '[2.07] a batch of all seven entities is accepted record by record, got ' || public.sc_verdicts(v_first));
    foreach e in array public.sc_entities() loop
      perform test_assert(public.sc_has(e, public.sc_id(e, 1)), '[2.08] ' || e || ': the batch stored its record');
    end loop;

    v_rows  := (select sum(public.sc_count(x)) from unnest(public.sc_entities()) as x);
    v_audit := (select count(*) from public.audit_log);
    v_second := public.sc_push(public.sc_sup(), v_recs);
    perform test_assert(public.sc_verdicts(v_second) = v_expected,
      '[2.09] the whole batch again is accepted record by record, got ' || public.sc_verdicts(v_second));
    perform test_assert(v_first = v_second, '[2.10] a replayed batch gets the same response as the first push');
    perform test_assert((select sum(public.sc_count(x)) from unnest(public.sc_entities()) as x) = v_rows,
      '[2.11] a replayed batch creates no row in any of the seven tables');
    perform test_assert((select count(*) from public.audit_log) = v_audit, '[2.12] a replayed batch writes no audit row');

    raise exception 'sc_rollback';
  exception when others then
    if sqlerrm <> 'sc_rollback' then raise; end if;
  end;
end $$;

-- ------------------------------------------------- 3 · one bad record does not block the rest
-- A batch of three for each entity: a good record, a bad one, a good one. `{}` is bad
-- for every handler, since each requires fields. The good ones are stored and accepted,
-- the bad one is rejected with a reason and leaves no row, and the batch carries on past
-- it (ADR-014: each record runs in its own sub-transaction).
do $$
declare
  e text; v_resp jsonb; v_bad uuid; v_rows bigint; v_audit bigint; v_v text;
begin
  foreach e in array public.sc_entities() loop
    begin
      perform public.sc_prereq(e, 1);
      perform public.sc_prereq(e, 2);
      v_bad := public.sc_id(e, 9);
      v_rows  := public.sc_count(e);
      v_audit := (select count(*) from public.audit_log where table_name = e and row_id = v_bad);

      v_resp := public.sc_push(public.sc_sup(), jsonb_build_array(
        public.sc_rec(e, public.sc_id(e, 1), public.sc_payload(e, 1)),
        public.sc_rec(e, v_bad, '{}'::jsonb),
        public.sc_rec(e, public.sc_id(e, 2), public.sc_payload(e, 2))));
      v_v := public.sc_verdicts(v_resp);

      perform test_assert(jsonb_array_length(v_resp -> 'results') = 3,
        '[3.01] ' || e || ': one result per record, the bad one does not drop the batch');
      perform test_assert(split_part(v_v, ',', 1) = 'accepted:-',
        '[3.02] ' || e || ': the record before the bad one is accepted, got ' || v_v);
      perform test_assert(split_part(v_v, ',', 3) = 'accepted:-',
        '[3.03] ' || e || ': the record after the bad one is accepted, got ' || v_v);
      perform test_assert(split_part(split_part(v_v, ',', 2), ':', 1) = 'rejected',
        '[3.04] ' || e || ': the bad record is rejected, got ' || v_v);
      perform test_assert(split_part(split_part(v_v, ',', 2), ':', 2) <> '-',
        '[3.05] ' || e || ': the rejection carries a reason');
      perform test_assert(public.sc_has(e, public.sc_id(e, 1)) and public.sc_has(e, public.sc_id(e, 2)),
        '[3.06] ' || e || ': both good records are stored');
      perform test_assert(not public.sc_has(e, v_bad), '[3.07] ' || e || ': the bad record leaves no row');
      perform test_assert(public.sc_count(e) = v_rows + 2,
        '[3.08] ' || e || ': exactly the two good rows were added');
      perform test_assert((select count(*) from public.audit_log where table_name = e and row_id = v_bad) = v_audit,
        '[3.09] ' || e || ': the bad record leaves no audit row');

      raise exception 'sc_rollback';
    exception when others then
      if sqlerrm <> 'sc_rollback' then raise; end if;
    end;
  end loop;
end $$;

-- ------------------------------------------------- 4 · every verdict is a fixed code, no detail leaks
-- For each entity, push its valid payload with each field broken in turn (set to a
-- value of the wrong kind), and `{}`. A handler may accept a harmless change (an optional
-- text field), reject it, or ask for a retry of a parent that is missing. It must never
-- answer with a code outside the fixed list, never fall through to `server_error` or
-- `handler_unavailable` (an error the handler did not map), and never put database
-- detail in the response (ADR-014: "database error text never reaches the client").
do $$
declare
  e text; k text; v_payload jsonb; v_resp jsonb; v_r jsonb; v_text text; n int := 0;
  -- The codes a phone is told to expect: the router's (ADR-014, ADR-033) and the
  -- conflicts each handler returns itself. server_error, handler_unavailable,
  -- rate_limited and busy are infrastructure answers, not a verdict on a record.
  c_codes text[] := array['invalid_record_id', 'unknown_entity', 'invalid_payload', 'permission_denied',
    'invalid_input', 'invalid_state', 'duplicate', 'missing_parent', 'locked', 'reviewed', 'checked_out',
    'different_visit', 'different_day', 'different_entry', 'different_correction', 'different_report'];
  c_leaks text[] := array['violates', 'constraint', 'duplicate key', 'null value', 'invalid input syntax',
    'column', 'relation', 'ERROR', 'SQLSTATE', 'PS409', 'public.', 'c1000000-', 'c2000000-', 'Contract'];
  w text;
begin
  foreach e in array public.sc_entities() loop
    begin
      perform public.sc_prereq(e, 1);
      -- one `{}`, then each field of the valid payload broken in turn
      for k in select unnest(array['{}']::text[]) union all select jsonb_object_keys(public.sc_payload(e, 1)) loop
        v_payload := case when k = '{}' then '{}'::jsonb
                          else jsonb_set(public.sc_payload(e, 1), array[k], to_jsonb('not-valid'::text)) end;
        -- a fresh id each time, so every push is a new record and no replay masks a verdict
        v_resp := public.sc_push(public.sc_sup(), jsonb_build_array(
          public.sc_rec(e, md5('hygiene|' || e || '|' || k)::uuid, v_payload)));
        v_r := v_resp -> 'results' -> 0;
        v_text := v_resp::text;
        n := n + 1;

        perform test_assert(v_resp ? 'results', '[4.01] ' || e || '/' || k || ': the router answers with results, not an error');
        perform test_assert((v_r ->> 'verdict') in ('accepted', 'conflict', 'rejected', 'retryable_error'),
          '[4.02] ' || e || '/' || k || ': the verdict is one of the four');
        perform test_assert((v_r ->> 'verdict') = 'accepted' or (v_r ->> 'reason') is not null,
          '[4.03] ' || e || '/' || k || ': a verdict that is not accepted carries a reason');
        perform test_assert((v_r ->> 'verdict') = 'accepted' or (v_r ->> 'reason') = any (c_codes),
          '[4.04] ' || e || '/' || k || ': the reason is in the fixed list, got ' || coalesce(v_r ->> 'reason', 'null')
          || ' (' || (v_r ->> 'verdict') || ')');
        foreach w in array c_leaks loop
          perform test_assert(position(w in v_text) = 0,
            '[4.05] ' || e || '/' || k || ': the response holds no database detail, found "' || w || '"');
        end loop;
      end loop;

      raise exception 'sc_rollback';
    exception when others then
      if sqlerrm <> 'sc_rollback' then raise; end if;
    end;
  end loop;
  perform test_assert(n >= 7 * 5, '[4.06] the hygiene check really pushed many broken records, ' || n);
end $$;

rollback;
