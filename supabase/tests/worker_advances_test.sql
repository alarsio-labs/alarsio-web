-- Worker advances: the append-only ledger, apply_worker_advance(), worker_advance_totals
-- and sync_worker_advances() through sync_push. Spec #239. Rows are read back, never
-- assumed. Shim style, no pgTAP.
begin;

-- Org A: alice owner, carol PM, bob supervisor (site 1), frank supervisor (site 2 only),
-- dave accountant. Org B: eve owner.
insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-00000000000a', 'alice@x'),
  ('b0000000-0000-0000-0000-00000000000b', 'bob@x'),
  ('c0000000-0000-0000-0000-00000000000c', 'carol@x'),
  ('d0000000-0000-0000-0000-00000000000d', 'dave@x'),
  ('e0000000-0000-0000-0000-00000000000e', 'eve@x'),
  ('f0000000-0000-0000-0000-00000000000f', 'frank@x');
insert into public.organizations (id, name, created_by) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Org A', 'a0000000-0000-0000-0000-00000000000a'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Org B', 'e0000000-0000-0000-0000-00000000000e');
insert into public.memberships (org_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'owner'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000c', 'project_manager'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b', 'supervisor'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-00000000000d', 'accountant'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-00000000000f', 'supervisor'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-00000000000e', 'owner');
insert into public.sites (id, org_id, name, address, latitude, longitude, created_by) values
  ('51000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Site 1', 'x', 19.0, 73.0, 'a0000000-0000-0000-0000-00000000000a'),
  ('51000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Site 2', 'x', 19.1, 73.1, 'a0000000-0000-0000-0000-00000000000a'),
  ('51000000-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-000000000002', 'Site B', 'x', 18.0, 72.0, 'e0000000-0000-0000-0000-00000000000e');
insert into public.site_assignments (org_id, site_id, user_id, assigned_by) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-00000000000a'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-00000000000f', 'a0000000-0000-0000-0000-00000000000a');

-- Workers: 1 Ravi (site 1 for 30 days), 2 Sita (site 1 for 2 days), 3 Bela (org B).
insert into public.workers (id, org_id, code, full_name, trade, pay_type, created_by) values
  ('77000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'W-001', 'Ravi', 'mason',  'daily', 'a0000000-0000-0000-0000-00000000000a'),
  ('77000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'W-002', 'Sita', 'helper', 'daily', 'a0000000-0000-0000-0000-00000000000a'),
  ('77000000-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000002', 'W-001', 'Bela', 'mason',  'daily', 'e0000000-0000-0000-0000-00000000000e');
insert into public.worker_site_assignments (org_id, worker_id, site_id, assigned_by, assigned_at) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '77000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', now() - interval '30 days'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '77000000-0000-0000-0000-000000000002', '51000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', now() - interval '2 days'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '77000000-0000-0000-0000-000000000003', '51000000-0000-0000-0000-0000000000b1', 'e0000000-0000-0000-0000-00000000000e', now() - interval '30 days');

-- Try apply_worker_advance as a user. Returns 'ok', or the SQLSTATE and message.
create function public.wa_try(p_uid uuid, p_id uuid, p_worker uuid, p_on date, p_paise bigint,
                              p_note text default null, p_reverses uuid default null,
                              p_site uuid default '51000000-0000-0000-0000-000000000001')
returns text language plpgsql as $$
begin
  perform test_as(p_uid);
  perform public.apply_worker_advance(p_id, p_site, p_worker, p_on, p_paise, p_note, p_reverses);
  execute 'reset role';
  return 'ok';
exception when others then
  execute 'reset role';
  return sqlstate || ': ' || sqlerrm;
end $$;

-- One record through sync_push as a user: 'verdict / reason'.
create function public.wa_push(p_uid uuid, p_id uuid, p_payload jsonb) returns text language plpgsql as $$
declare r jsonb;
begin
  perform test_as(p_uid);
  r := public.sync_push(jsonb_build_object('version', 1, 'device_id', 'd1', 'records',
         jsonb_build_array(jsonb_build_object('entity', 'worker_advances', 'record_id', p_id, 'payload', p_payload))));
  execute 'reset role';
  return (r -> 'results' -> 0 ->> 'verdict') || ' / ' || coalesce(r -> 'results' -> 0 ->> 'reason', '');
end $$;

create function public.wa_count(p_worker uuid) returns bigint language sql as $$
  select count(*) from public.worker_advances where worker_id = p_worker
$$;

-- --------------------------------------------------------------- structure

do $$ begin
  perform test_assert((select relrowsecurity from pg_class where oid = 'public.worker_advances'::regclass),
    'RLS is enabled on worker_advances');
  perform test_assert(
    not has_table_privilege('authenticated', 'public.worker_advances', 'INSERT')
    and not has_table_privilege('authenticated', 'public.worker_advances', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.worker_advances', 'DELETE')
    and not has_table_privilege('authenticated', 'public.worker_advances', 'TRUNCATE'),
    'no client may insert, update, delete or truncate the ledger');
  perform test_assert(
    (select reloptions @> array['security_invoker=true'] from pg_class
      where oid = 'public.worker_advance_totals'::regclass),
    'the totals view is security_invoker');
  perform test_assert(
    (select count(*) from pg_trigger where tgrelid = 'public.worker_advances'::regclass
        and tgname = 'worker_advances_audit' and not tgisinternal) = 1,
    'write_audit() is attached to worker_advances');
  perform test_assert(
    (select prosecdef and proconfig @> array['search_path=public'] from pg_proc
      where oid = 'public.apply_worker_advance(uuid, uuid, uuid, date, bigint, text, uuid)'::regprocedure),
    'apply_worker_advance is security definer with search_path = public');
  perform test_assert(
    (select not prosecdef and proconfig @> array['search_path=public'] from pg_proc
      where oid = 'public.sync_worker_advances(uuid, jsonb)'::regprocedure),
    'the sync handler is security invoker with search_path = public');
  perform test_assert(
    not has_function_privilege('anon', 'public.apply_worker_advance(uuid, uuid, uuid, date, bigint, text, uuid)', 'execute'),
    'anon cannot execute apply_worker_advance');
end $$;

-- ------------------------------------------------------ who may record or read

do $$
declare r text; n bigint;
begin
  r := public.wa_try('a0000000-0000-0000-0000-00000000000a', 'f3000000-0000-0000-0000-000000000001',
                     '77000000-0000-0000-0000-000000000001', current_date - 1, 50000, '  Diwali  ');
  perform test_assert(r = 'ok', 'the owner records an advance: ' || r);
  perform test_assert((select note from public.worker_advances where id = 'f3000000-0000-0000-0000-000000000001') = 'Diwali'
    and (select recorded_by from public.worker_advances where id = 'f3000000-0000-0000-0000-000000000001') = 'a0000000-0000-0000-0000-00000000000a',
    'the note is trimmed and the author is the caller');

  r := public.wa_try('d0000000-0000-0000-0000-00000000000d', 'f3000000-0000-0000-0000-000000000002',
                     '77000000-0000-0000-0000-000000000001', current_date - 1, 30000);
  perform test_assert(r = 'ok', 'the accountant records an advance: ' || r);

  -- A supervisor of another site, the project manager and another organisation's owner cannot.
  r := public.wa_try('f0000000-0000-0000-0000-00000000000f', 'f3000000-0000-0000-0000-000000000003',
                     '77000000-0000-0000-0000-000000000001', current_date - 1, 100);
  perform test_assert(r like '42501:%', 'a supervisor of another site is refused: ' || r);
  r := public.wa_try('c0000000-0000-0000-0000-00000000000c', 'f3000000-0000-0000-0000-000000000003',
                     '77000000-0000-0000-0000-000000000001', current_date - 1, 100);
  perform test_assert(r like '42501:%', 'a project manager is refused: ' || r);
  r := public.wa_try('e0000000-0000-0000-0000-00000000000e', 'f3000000-0000-0000-0000-000000000003',
                     '77000000-0000-0000-0000-000000000001', current_date - 1, 100);
  perform test_assert(r like '42501:%', 'another organisation''s owner is refused: ' || r);
  -- A worker who is not on that site looks the same as no worker.
  r := public.wa_try('a0000000-0000-0000-0000-00000000000a', 'f3000000-0000-0000-0000-000000000003',
                     '77000000-0000-0000-0000-000000000001', current_date - 1, 100, null, null,
                     '51000000-0000-0000-0000-000000000002');
  perform test_assert(r like '42501:%', 'a worker not on the site is refused: ' || r);
  perform test_assert(public.wa_count('77000000-0000-0000-0000-000000000001') = 2, 'a refusal wrote nothing');

  -- Reads: owner and accountant see the rows, the site's supervisor sees its rows, and a
  -- supervisor of another site and a PM see none.
  perform test_as('d0000000-0000-0000-0000-00000000000d');
  select count(*) into n from public.worker_advances; execute 'reset role';
  perform test_assert(n = 2, 'the accountant reads the advances');
  perform test_as('b0000000-0000-0000-0000-00000000000b');
  select count(*) into n from public.worker_advances; execute 'reset role';
  perform test_assert(n = 2, 'the supervisor of the site reads its advances');
  perform test_as('f0000000-0000-0000-0000-00000000000f');
  select count(*) into n from public.worker_advances; execute 'reset role';
  perform test_assert(n = 0, 'a supervisor of another site reads no advance');
  perform test_as('c0000000-0000-0000-0000-00000000000c');
  select count(*) into n from public.worker_advances; execute 'reset role';
  perform test_assert(n = 0, 'a project manager reads no advance');
  perform test_as('e0000000-0000-0000-0000-00000000000e');
  select count(*) into n from public.worker_advances; execute 'reset role';
  perform test_assert(n = 0, 'another organisation reads no advance');
end $$;

-- ------------------------------------------------------------- constraints

do $$
declare r text; w uuid := '77000000-0000-0000-0000-000000000001'; a uuid := 'a0000000-0000-0000-0000-00000000000a';
begin
  r := public.wa_try(a, 'f3000000-0000-0000-0000-000000000010', w, current_date - 1, 0);
  perform test_assert(r like '23514:%', 'a zero amount is refused: ' || r);
  r := public.wa_try(a, 'f3000000-0000-0000-0000-000000000010', w, current_date - 1, -5);
  perform test_assert(r like '23514:%', 'a negative amount is refused: ' || r);
  r := public.wa_try(a, 'f3000000-0000-0000-0000-000000000010', w, current_date - 1, 100000001);
  perform test_assert(r like '23514:%', 'more than 10 lakh rupees is refused: ' || r);
  r := public.wa_try(a, 'f3000000-0000-0000-0000-000000000011', w, current_date - 1, 100000000);
  perform test_assert(r = 'ok', 'exactly 10 lakh rupees is allowed: ' || r);
  r := public.wa_try(a, 'f3000000-0000-0000-0000-000000000010', w, current_date - 1, 100, repeat('x', 501));
  perform test_assert(r like '23514:%', 'a note over 500 characters is refused: ' || r);
  r := public.wa_try(a, 'f3000000-0000-0000-0000-000000000010', w, current_date + 2, 100);
  perform test_assert(r like '22023:%', 'a date after tomorrow is refused: ' || r);
  r := public.wa_try(a, 'f3000000-0000-0000-0000-000000000012', w, current_date + 1, 100);
  perform test_assert(r = 'ok', 'tomorrow (India) is allowed: ' || r);
  r := public.wa_try(a, 'f3000000-0000-0000-0000-000000000010', w, null, 100);
  perform test_assert(r like '22023:%', 'a missing date is refused: ' || r);
  -- Sita joined the site 2 days ago: an advance dated before that is refused.
  r := public.wa_try(a, 'f3000000-0000-0000-0000-000000000010', '77000000-0000-0000-0000-000000000002', current_date - 5, 100);
  perform test_assert(r like '23514:%', 'a date before the worker joined the site is refused: ' || r);
  r := public.wa_try(a, 'f3000000-0000-0000-0000-000000000013', '77000000-0000-0000-0000-000000000002', current_date - 1, 100);
  perform test_assert(r = 'ok', 'a date after the worker joined is allowed: ' || r);
end $$;

-- ------------------------------------------------------------------- replay

do $$
declare r text; w uuid := '77000000-0000-0000-0000-000000000001'; a uuid := 'a0000000-0000-0000-0000-00000000000a';
        before_n bigint := public.wa_count('77000000-0000-0000-0000-000000000001');
begin
  r := public.wa_try(a, 'f3000000-0000-0000-0000-000000000001', w, current_date - 1, 50000, 'Diwali');
  perform test_assert(r = 'ok', 'the same record again is answered ok: ' || r);
  perform test_assert(public.wa_count(w) = before_n, 'a replay adds no row');
  r := public.wa_try(a, 'f3000000-0000-0000-0000-000000000001', w, current_date - 1, 50001, 'Diwali');
  perform test_assert(r like '23505:%', 'the same id with another amount is a conflict: ' || r);
  -- Another user cannot replay the owner's record to learn it, and cannot reuse its id.
  r := public.wa_try('d0000000-0000-0000-0000-00000000000d', 'f3000000-0000-0000-0000-000000000001', w, current_date - 1, 50000, 'Diwali');
  perform test_assert(r like '23505:%', 'another author cannot replay the record: ' || r);
end $$;

-- ----------------------------------------------------------------- reversal

do $$
declare r text; w uuid := '77000000-0000-0000-0000-000000000001'; a uuid := 'a0000000-0000-0000-0000-00000000000a';
begin
  -- Undo the accountant's 30000 advance (f3...02).
  r := public.wa_try(a, 'f3000000-0000-0000-0000-000000000020', w, current_date - 1, 30000, 'wrong worker', 'f3000000-0000-0000-0000-000000000002');
  perform test_assert(r = 'ok', 'an advance is reversed: ' || r);
  perform test_assert((select reverses_id from public.worker_advances where id = 'f3000000-0000-0000-0000-000000000020')
                      = 'f3000000-0000-0000-0000-000000000002', 'the reversal points at the advance');

  r := public.wa_try(a, 'f3000000-0000-0000-0000-000000000021', w, current_date - 1, 30000, null, 'f3000000-0000-0000-0000-000000000002');
  perform test_assert(r like '23505:%', 'an advance is reversed once: ' || r);
  r := public.wa_try(a, 'f3000000-0000-0000-0000-000000000022', w, current_date - 1, 40000, null, 'f3000000-0000-0000-0000-000000000001');
  perform test_assert(r like '23514:%', 'a reversal must repeat the whole amount: ' || r);
  r := public.wa_try(a, 'f3000000-0000-0000-0000-000000000023', w, current_date - 1, 30000, null, 'f3000000-0000-0000-0000-000000000020');
  perform test_assert(r like '23514:%', 'a reversal cannot be reversed: ' || r);
  r := public.wa_try(a, 'f3000000-0000-0000-0000-000000000024', '77000000-0000-0000-0000-000000000002', current_date - 1, 50000, null, 'f3000000-0000-0000-0000-000000000001');
  perform test_assert(r like '23514:%', 'a reversal must name the same worker: ' || r);
  r := public.wa_try(a, 'f3000000-0000-0000-0000-000000000025', w, current_date - 1, 50000, null, 'f3000000-0000-0000-0000-0000000000ff');
  perform test_assert(r like '23514:%', 'a reversal of an unknown advance is refused: ' || r);
  perform test_assert(public.wa_count(w) = 5, 'the refused reversals wrote nothing');
end $$;

-- ------------------------------------------------------------------- totals

do $$
declare n bigint; t bigint;
begin
  -- Worker 1 holds 50000 + 30000 - 30000 + 100000000 + 100 (tomorrow), all on the same day or the
  -- next, so read the month of the first advance back and compare with the ledger.
  perform test_as('a0000000-0000-0000-0000-00000000000a');
  select total_paise into t from public.worker_advance_totals
   where worker_id = '77000000-0000-0000-0000-000000000001'
     and month = date_trunc('month', current_date - 1)::date;
  execute 'reset role';
  perform test_assert(t = (select sum(case when reverses_id is null then amount_paise else -amount_paise end)
                             from public.worker_advances
                            where worker_id = '77000000-0000-0000-0000-000000000001'
                              and date_trunc('month', paid_on) = date_trunc('month', current_date - 1)),
    'the total is advances minus reversals');

  perform test_as('b0000000-0000-0000-0000-00000000000b');
  select count(*) into n from public.worker_advance_totals; execute 'reset role';
  perform test_assert(n >= 1, 'the supervisor of the site reads its totals');
  perform test_as('f0000000-0000-0000-0000-00000000000f');
  select count(*) into n from public.worker_advance_totals; execute 'reset role';
  perform test_assert(n = 0, 'a supervisor of another site reads no total');
end $$;

-- ------------------------------------------------------------------- lines

do $$
declare n bigint;
begin
  perform test_assert(
    (select reloptions @> array['security_invoker=true'] from pg_class
      where oid = 'public.worker_advance_lines'::regclass),
    'the lines view is security_invoker');
  perform test_assert(
    not has_table_privilege('anon', 'public.worker_advance_lines', 'SELECT')
    and not has_table_privilege('authenticated', 'public.worker_advance_lines', 'INSERT'),
    'anon cannot read the lines view and no client can write through it');

  perform test_as('a0000000-0000-0000-0000-00000000000a');
  select count(*) into n from public.worker_advance_lines; execute 'reset role';
  perform test_assert(n = (select count(*) from public.worker_advances), 'the owner reads every line');

  perform test_as('b0000000-0000-0000-0000-00000000000b');
  select count(*) into n from public.worker_advance_lines; execute 'reset role';
  perform test_assert(n >= 1, 'the supervisor of the site reads its lines');

  perform test_as('f0000000-0000-0000-0000-00000000000f');
  select count(*) into n from public.worker_advance_lines; execute 'reset role';
  perform test_assert(n = 0, 'a supervisor of another site reads no line');
  perform test_as('c0000000-0000-0000-0000-00000000000c');
  select count(*) into n from public.worker_advance_lines; execute 'reset role';
  perform test_assert(n = 0, 'a project manager reads no line');
  perform test_as('e0000000-0000-0000-0000-00000000000e');
  select count(*) into n from public.worker_advance_lines; execute 'reset role';
  perform test_assert(n = 0, 'another organisation reads no line');
end $$;

-- ------------------------------------------------------------- append-only

do $$
declare r text;
begin
  begin
    update public.worker_advances set amount_paise = 1 where id = 'f3000000-0000-0000-0000-000000000001';
    r := 'ok';
  exception when others then r := sqlstate;
  end;
  perform test_assert(r = '42501', 'an update is refused even for the table owner: ' || r);
  begin
    delete from public.worker_advances where id = 'f3000000-0000-0000-0000-000000000001';
    r := 'ok';
  exception when others then r := sqlstate;
  end;
  perform test_assert(r = '42501', 'a delete is refused even for the table owner: ' || r);
  begin
    truncate public.worker_advances;
    r := 'ok';
  exception when others then r := sqlstate;
  end;
  perform test_assert(r = '42501', 'a truncate is refused even for the table owner: ' || r);
end $$;

-- ------------------------------------------------------- through sync_push

do $$
declare r text;
        p jsonb := jsonb_build_object('site_id', '51000000-0000-0000-0000-000000000001',
                                      'worker_id', '77000000-0000-0000-0000-000000000001',
                                      'paid_on', (current_date - 1)::text, 'amount_paise', 25000,
                                      'note', null, 'reverses_id', null);
begin
  r := public.wa_push('a0000000-0000-0000-0000-00000000000a', 'f3000000-0000-0000-0000-000000000030', p);
  perform test_assert(r = 'accepted / ', 'the owner''s advance is accepted: ' || r);
  r := public.wa_push('a0000000-0000-0000-0000-00000000000a', 'f3000000-0000-0000-0000-000000000030', p);
  perform test_assert(r = 'accepted / ', 'a replay is accepted: ' || r);
  perform test_assert(public.wa_count('77000000-0000-0000-0000-000000000001') = 6, 'the replay added no row');
  r := public.wa_push('a0000000-0000-0000-0000-00000000000a', 'f3000000-0000-0000-0000-000000000030', p || '{"amount_paise": 26000}');
  perform test_assert(r = 'conflict / duplicate', 'the same id with other content is a conflict: ' || r);
  -- The supervisor of the site records for another worker, so worker 1's count is unchanged.
  r := public.wa_push('b0000000-0000-0000-0000-00000000000b', 'f3000000-0000-0000-0000-000000000031',
                      p || '{"worker_id": "77000000-0000-0000-0000-000000000002"}');
  perform test_assert(r = 'accepted / ', 'the supervisor of the site is accepted: ' || r);
  r := public.wa_push('f0000000-0000-0000-0000-00000000000f', 'f3000000-0000-0000-0000-000000000037', p);
  perform test_assert(r = 'rejected / permission_denied', 'a supervisor of another site is rejected: ' || r);
  r := public.wa_push('a0000000-0000-0000-0000-00000000000a', 'f3000000-0000-0000-0000-000000000032', p || '{"amount_paise": 1.5}');
  perform test_assert(r = 'rejected / invalid_input', 'a fractional amount is rejected: ' || r);
  r := public.wa_push('a0000000-0000-0000-0000-00000000000a', 'f3000000-0000-0000-0000-000000000033', p || '{"amount_paise": "100"}');
  perform test_assert(r = 'rejected / invalid_input', 'an amount sent as text is rejected: ' || r);
  r := public.wa_push('a0000000-0000-0000-0000-00000000000a', 'f3000000-0000-0000-0000-000000000034', p || '{"paid_on": "today"}');
  perform test_assert(r = 'rejected / invalid_input', 'a date that is not YYYY-MM-DD is rejected: ' || r);
  r := public.wa_push('a0000000-0000-0000-0000-00000000000a', 'f3000000-0000-0000-0000-000000000035', p - 'worker_id');
  perform test_assert(r = 'rejected / invalid_input', 'a missing field is rejected: ' || r);
  r := public.wa_push('a0000000-0000-0000-0000-00000000000a', 'f3000000-0000-0000-0000-000000000036',
                      p || '{"amount_paise": 25000, "reverses_id": "f3000000-0000-0000-0000-000000000030"}');
  perform test_assert(r = 'accepted / ', 'a reversal is accepted: ' || r);
  r := public.wa_push('a0000000-0000-0000-0000-00000000000a', 'f3000000-0000-0000-0000-000000000037',
                      p || '{"amount_paise": 25000, "reverses_id": "f3000000-0000-0000-0000-000000000030"}');
  perform test_assert(r = 'conflict / duplicate', 'a second reversal is a conflict: ' || r);
end $$;

rollback;
