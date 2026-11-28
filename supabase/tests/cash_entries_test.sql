-- Site cash book: the append-only ledger, apply_cash_entry(), cash_book_totals and
-- sync_cash_entries() through sync_push. Spec #258. Rows are read back, never assumed.
-- Shim style, no pgTAP.
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

-- One worker on site 1, so the advances part of the totals has a row.
insert into public.workers (id, org_id, code, full_name, trade, pay_type, created_by) values
  ('77000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'W-001', 'Ravi', 'mason', 'daily', 'a0000000-0000-0000-0000-00000000000a');
insert into public.worker_site_assignments (org_id, worker_id, site_id, assigned_by, assigned_at) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '77000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', now() - interval '30 days');

-- Try apply_cash_entry as a user. Returns 'ok', or the SQLSTATE and message.
create function public.ce_try(p_uid uuid, p_id uuid, p_category text, p_paise bigint,
                              p_on date default current_date - 1, p_note text default null,
                              p_reverses uuid default null,
                              p_site uuid default '51000000-0000-0000-0000-000000000001')
returns text language plpgsql as $$
begin
  perform test_as(p_uid);
  perform public.apply_cash_entry(p_id, p_site, p_on, p_category, p_paise, p_note, p_reverses);
  execute 'reset role';
  return 'ok';
exception when others then
  execute 'reset role';
  return sqlstate || ': ' || sqlerrm;
end $$;

-- One record through sync_push as a user: 'verdict / reason'.
create function public.ce_push(p_uid uuid, p_id uuid, p_payload jsonb) returns text language plpgsql as $$
declare r jsonb;
begin
  perform test_as(p_uid);
  r := public.sync_push(jsonb_build_object('version', 1, 'device_id', 'd1', 'records',
         jsonb_build_array(jsonb_build_object('entity', 'cash_entries', 'record_id', p_id, 'payload', p_payload))));
  execute 'reset role';
  return (r -> 'results' -> 0 ->> 'verdict') || ' / ' || coalesce(r -> 'results' -> 0 ->> 'reason', '');
end $$;

create function public.ce_count(p_site uuid) returns bigint language sql as $$
  select count(*) from public.cash_entries where site_id = p_site
$$;

-- --------------------------------------------------------------- structure

do $$ begin
  perform test_assert((select relrowsecurity from pg_class where oid = 'public.cash_entries'::regclass),
    'RLS is enabled on cash_entries');
  perform test_assert(
    not has_table_privilege('authenticated', 'public.cash_entries', 'INSERT')
    and not has_table_privilege('authenticated', 'public.cash_entries', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.cash_entries', 'DELETE')
    and not has_table_privilege('authenticated', 'public.cash_entries', 'TRUNCATE'),
    'no client may insert, update, delete or truncate the ledger');
  perform test_assert(
    (select reloptions @> array['security_invoker=true'] from pg_class
      where oid = 'public.cash_book_totals'::regclass),
    'the totals view is security_invoker');
  perform test_assert(
    (select count(*) from pg_trigger where tgrelid = 'public.cash_entries'::regclass
        and tgname = 'cash_entries_audit' and not tgisinternal) = 1,
    'write_audit() is attached to cash_entries');
  perform test_assert(
    (select prosecdef and proconfig @> array['search_path=public'] from pg_proc
      where oid = 'public.apply_cash_entry(uuid, uuid, date, text, bigint, text, uuid)'::regprocedure),
    'apply_cash_entry is security definer with search_path = public');
  perform test_assert(
    (select not prosecdef and proconfig @> array['search_path=public'] from pg_proc
      where oid = 'public.sync_cash_entries(uuid, jsonb)'::regprocedure),
    'the sync handler is security invoker with search_path = public');
  perform test_assert(
    not has_function_privilege('anon', 'public.apply_cash_entry(uuid, uuid, date, text, bigint, text, uuid)', 'execute'),
    'anon cannot execute apply_cash_entry');
end $$;

-- ------------------------------------------------------ who may record or read

do $$
declare r text; n bigint;
begin
  r := public.ce_try('a0000000-0000-0000-0000-00000000000a', 'c5000000-0000-0000-0000-000000000001',
                     'received', 500000, current_date - 1, '  Top up  ');
  perform test_assert(r = 'ok', 'the owner records cash in: ' || r);
  perform test_assert((select note from public.cash_entries where id = 'c5000000-0000-0000-0000-000000000001') = 'Top up'
    and (select recorded_by from public.cash_entries where id = 'c5000000-0000-0000-0000-000000000001') = 'a0000000-0000-0000-0000-00000000000a',
    'the note is trimmed and the author is the caller');

  r := public.ce_try('d0000000-0000-0000-0000-00000000000d', 'c5000000-0000-0000-0000-000000000002', 'food', 10000);
  perform test_assert(r = 'ok', 'the accountant records cash out: ' || r);
  r := public.ce_try('b0000000-0000-0000-0000-00000000000b', 'c5000000-0000-0000-0000-000000000003', 'wages', 120000);
  perform test_assert(r = 'ok', 'the supervisor of the site records cash out: ' || r);

  -- A supervisor of another site, the project manager and another organisation's owner cannot.
  r := public.ce_try('f0000000-0000-0000-0000-00000000000f', 'c5000000-0000-0000-0000-000000000004', 'other', 100);
  perform test_assert(r like '42501:%', 'a supervisor of another site is refused: ' || r);
  r := public.ce_try('c0000000-0000-0000-0000-00000000000c', 'c5000000-0000-0000-0000-000000000004', 'other', 100);
  perform test_assert(r like '42501:%', 'a project manager is refused: ' || r);
  r := public.ce_try('e0000000-0000-0000-0000-00000000000e', 'c5000000-0000-0000-0000-000000000004', 'other', 100);
  perform test_assert(r like '42501:%', 'another organisation''s owner is refused: ' || r);
  r := public.ce_try('a0000000-0000-0000-0000-00000000000a', 'c5000000-0000-0000-0000-000000000004', 'other', 100,
                     current_date - 1, null, null, '51000000-0000-0000-0000-0000000000ff');
  perform test_assert(r like '42501:%', 'a site that does not exist is refused the same way: ' || r);
  perform test_assert(public.ce_count('51000000-0000-0000-0000-000000000001') = 3, 'a refusal wrote nothing');

  -- Reads: owner and accountant see the rows, the site's supervisor sees its rows, and a
  -- supervisor of another site, a PM and another organisation see none.
  perform test_as('d0000000-0000-0000-0000-00000000000d');
  select count(*) into n from public.cash_entries; execute 'reset role';
  perform test_assert(n = 3, 'the accountant reads the entries');
  perform test_as('b0000000-0000-0000-0000-00000000000b');
  select count(*) into n from public.cash_entries; execute 'reset role';
  perform test_assert(n = 3, 'the supervisor of the site reads its entries');
  perform test_as('f0000000-0000-0000-0000-00000000000f');
  select count(*) into n from public.cash_entries; execute 'reset role';
  perform test_assert(n = 0, 'a supervisor of another site reads no entry');
  perform test_as('c0000000-0000-0000-0000-00000000000c');
  select count(*) into n from public.cash_entries; execute 'reset role';
  perform test_assert(n = 0, 'a project manager reads no entry');
  perform test_as('e0000000-0000-0000-0000-00000000000e');
  select count(*) into n from public.cash_entries; execute 'reset role';
  perform test_assert(n = 0, 'another organisation reads no entry');
end $$;

-- ------------------------------------------------------------- constraints

do $$
declare r text; a uuid := 'a0000000-0000-0000-0000-00000000000a';
begin
  r := public.ce_try(a, 'c5000000-0000-0000-0000-000000000010', 'gift', 100);
  perform test_assert(r like '23514:%', 'an unknown category is refused: ' || r);
  r := public.ce_try(a, 'c5000000-0000-0000-0000-000000000010', 'Received', 100);
  perform test_assert(r like '23514:%', 'a category is matched exactly: ' || r);
  r := public.ce_try(a, 'c5000000-0000-0000-0000-000000000010', 'food', 0);
  perform test_assert(r like '23514:%', 'a zero amount is refused: ' || r);
  r := public.ce_try(a, 'c5000000-0000-0000-0000-000000000010', 'food', -5);
  perform test_assert(r like '23514:%', 'a negative amount is refused: ' || r);
  r := public.ce_try(a, 'c5000000-0000-0000-0000-000000000010', 'food', 100000001);
  perform test_assert(r like '23514:%', 'more than 10 lakh rupees is refused: ' || r);
  r := public.ce_try(a, 'c5000000-0000-0000-0000-000000000010', 'food', 100000000);
  perform test_assert(r = 'ok', 'exactly 10 lakh rupees is allowed: ' || r);
  r := public.ce_try(a, 'c5000000-0000-0000-0000-000000000011', 'food', 100, current_date - 1, repeat('x', 501));
  perform test_assert(r like '23514:%', 'a note over 500 characters is refused: ' || r);
  r := public.ce_try(a, 'c5000000-0000-0000-0000-000000000012', 'food', 100, current_date + 3);
  perform test_assert(r like '22023:%', 'a date after tomorrow is refused: ' || r);
  r := public.ce_try(a, 'c5000000-0000-0000-0000-000000000013', 'food', 100, null);
  perform test_assert(r like '22023:%', 'a missing date is refused: ' || r);
  -- At site 2, so it does not move the totals of site 1 when tomorrow is in the next month.
  r := public.ce_try(a, 'c5000000-0000-0000-0000-000000000014', 'food', 100, (now() at time zone 'utc')::date + 1,
                     null, null, '51000000-0000-0000-0000-000000000002');
  perform test_assert(r = 'ok', 'tomorrow is allowed, for India being ahead of UTC: ' || r);
end $$;

-- -------------------------------------------------------- replay and conflict

do $$
declare r text; a uuid := 'a0000000-0000-0000-0000-00000000000a'; n bigint;
begin
  n := public.ce_count('51000000-0000-0000-0000-000000000001');
  r := public.ce_try(a, 'c5000000-0000-0000-0000-000000000001', 'received', 500000, current_date - 1, 'Top up');
  perform test_assert(r = 'ok', 'a replay of the same entry is answered done: ' || r);
  perform test_assert(public.ce_count('51000000-0000-0000-0000-000000000001') = n, 'the replay added no row');
  r := public.ce_try(a, 'c5000000-0000-0000-0000-000000000001', 'received', 500001, current_date - 1, 'Top up');
  perform test_assert(r like '23505:%', 'the same id with another amount is a conflict: ' || r);
  -- Another author's id with the same content is not a replay, and the author is told nothing more.
  r := public.ce_try('d0000000-0000-0000-0000-00000000000d', 'c5000000-0000-0000-0000-000000000001',
                     'received', 500000, current_date - 1, 'Top up');
  perform test_assert(r like '23505:%', 'another author with the same id is a conflict: ' || r);
end $$;

-- ---------------------------------------------------------------- reversals

do $$
declare r text; a uuid := 'a0000000-0000-0000-0000-00000000000a';
        t uuid := 'c5000000-0000-0000-0000-000000000020';
begin
  r := public.ce_try(a, t, 'transport', 30000);
  perform test_assert(r = 'ok', 'an entry to cancel: ' || r);

  r := public.ce_try(a, 'c5000000-0000-0000-0000-000000000021', 'transport', 29999, current_date - 1, null, t);
  perform test_assert(r like '23514:%', 'a reversal with another amount is refused: ' || r);
  r := public.ce_try(a, 'c5000000-0000-0000-0000-000000000021', 'food', 30000, current_date - 1, null, t);
  perform test_assert(r like '23514:%', 'a reversal in another category is refused: ' || r);
  r := public.ce_try(a, 'c5000000-0000-0000-0000-000000000021', 'transport', 30000, current_date - 2, null, t);
  perform test_assert(r like '23514:%', 'a reversal on another day is refused: ' || r);
  r := public.ce_try(a, 'c5000000-0000-0000-0000-000000000021', 'transport', 30000, current_date - 1, null,
                     'c5000000-0000-0000-0000-0000000000ee');
  perform test_assert(r like '23514:%', 'a reversal of an entry that does not exist is refused: ' || r);

  -- An entry of another site cannot be cancelled from this one.
  r := public.ce_try(a, 'c5000000-0000-0000-0000-000000000022', 'wages', 7000, current_date - 1, null, null,
                     '51000000-0000-0000-0000-000000000002');
  perform test_assert(r = 'ok', 'an entry at site 2: ' || r);
  r := public.ce_try(a, 'c5000000-0000-0000-0000-000000000023', 'wages', 7000, current_date - 1, null,
                     'c5000000-0000-0000-0000-000000000022');
  perform test_assert(r like '23514:%', 'a reversal naming another site''s entry is refused: ' || r);

  r := public.ce_try('b0000000-0000-0000-0000-00000000000b', 'c5000000-0000-0000-0000-000000000024', 'transport', 30000,
                     current_date - 1, null, t);
  perform test_assert(r = 'ok', 'the supervisor of the site cancels it: ' || r);
  perform test_assert((select reverses_id from public.cash_entries where id = 'c5000000-0000-0000-0000-000000000024') = t,
    'the reversal row points at the entry');
  perform test_assert(exists (select 1 from public.cash_entries where id = t), 'the cancelled entry is still there');

  r := public.ce_try(a, 'c5000000-0000-0000-0000-000000000025', 'transport', 30000, current_date - 1, null, t);
  perform test_assert(r like '23505:%', 'a second reversal of the same entry is refused: ' || r);
  r := public.ce_try(a, 'c5000000-0000-0000-0000-000000000026', 'transport', 30000, current_date - 1, null,
                     'c5000000-0000-0000-0000-000000000024');
  perform test_assert(r like '23514:%', 'a reversal cannot itself be reversed: ' || r);
end $$;

-- ---------------------------------------------------------- an archived site

do $$
declare r text; a uuid := 'a0000000-0000-0000-0000-00000000000a';
begin
  perform test_as(a);
  perform public.archive_site('51000000-0000-0000-0000-000000000002');
  execute 'reset role';
  r := public.ce_try(a, 'c5000000-0000-0000-0000-000000000030', 'food', 100, current_date - 1, null, null,
                     '51000000-0000-0000-0000-000000000002');
  perform test_assert(r like '55000:%', 'the owner cannot record at an archived site: ' || r);
  r := public.ce_try('f0000000-0000-0000-0000-00000000000f', 'c5000000-0000-0000-0000-000000000031', 'food', 100,
                     current_date - 1, null, null, '51000000-0000-0000-0000-000000000002');
  perform test_assert(r like '42501:%', 'the supervisor of an archived site is refused: ' || r);
end $$;

-- ------------------------------------------------------------------ totals

do $$
declare m date := date_trunc('month', current_date - 1)::date; t record; n bigint;
begin
  -- One advance of the same day, to see it beside the cash and not inside "out".
  perform test_as('a0000000-0000-0000-0000-00000000000a');
  perform public.apply_worker_advance('c5000000-0000-0000-0000-0000000000a1',
    '51000000-0000-0000-0000-000000000001', '77000000-0000-0000-0000-000000000001',
    current_date - 1, 20000);
  select * into t from public.cash_book_totals
   where site_id = '51000000-0000-0000-0000-000000000001' and month = m;
  execute 'reset role';
  -- in 500000; out 10000 + 120000 + 100000000 (the 10 lakh test) + a cancelled 30000 that nets to 0.
  perform test_assert(t.in_paise = 500000, 'cash in is the received entries: ' || t.in_paise);
  perform test_assert(t.out_paise = 100130000, 'cash out is the spend, a cancelled entry netted out: ' || t.out_paise);
  perform test_assert(t.advances_paise = 20000, 'advances paid are read from the advances view: ' || t.advances_paise);

  perform test_as('b0000000-0000-0000-0000-00000000000b');
  select count(*) into n from public.cash_book_totals where site_id = '51000000-0000-0000-0000-000000000001';
  execute 'reset role';
  perform test_assert(n >= 1, 'the supervisor of the site reads its totals');

  perform test_as('f0000000-0000-0000-0000-00000000000f');
  select count(*) into n from public.cash_book_totals where site_id = '51000000-0000-0000-0000-000000000001';
  execute 'reset role';
  perform test_assert(n = 0, 'a supervisor of another site reads none of its totals');
  perform test_as('c0000000-0000-0000-0000-00000000000c');
  select count(*) into n from public.cash_book_totals;
  execute 'reset role';
  perform test_assert(n = 0, 'a project manager reads no totals');
end $$;

-- ------------------------------------------------------------- append-only

do $$
declare r text;
begin
  begin
    update public.cash_entries set amount_paise = 1 where id = 'c5000000-0000-0000-0000-000000000001';
    r := 'ok';
  exception when others then r := sqlstate;
  end;
  perform test_assert(r = '42501', 'an update is refused even for the table owner: ' || r);
  begin
    delete from public.cash_entries where id = 'c5000000-0000-0000-0000-000000000001';
    r := 'ok';
  exception when others then r := sqlstate;
  end;
  perform test_assert(r = '42501', 'a delete is refused even for the table owner: ' || r);
  begin
    truncate public.cash_entries;
    r := 'ok';
  exception when others then r := sqlstate;
  end;
  perform test_assert(r = '42501', 'a truncate is refused even for the table owner: ' || r);
end $$;

-- ------------------------------------------------------- through sync_push

do $$
declare r text;
        p jsonb := jsonb_build_object('site_id', '51000000-0000-0000-0000-000000000001',
                                      'entry_date', (current_date - 1)::text, 'category', 'received',
                                      'amount_paise', 25000, 'note', null, 'reverses_id', null);
begin
  r := public.ce_push('a0000000-0000-0000-0000-00000000000a', 'c5000000-0000-0000-0000-000000000040', p);
  perform test_assert(r = 'accepted / ', 'the owner''s entry is accepted: ' || r);
  r := public.ce_push('a0000000-0000-0000-0000-00000000000a', 'c5000000-0000-0000-0000-000000000040', p);
  perform test_assert(r = 'accepted / ', 'a replay is accepted: ' || r);
  r := public.ce_push('a0000000-0000-0000-0000-00000000000a', 'c5000000-0000-0000-0000-000000000040', p || '{"amount_paise": 26000}');
  perform test_assert(r = 'conflict / duplicate', 'the same id with other content is a conflict: ' || r);
  r := public.ce_push('b0000000-0000-0000-0000-00000000000b', 'c5000000-0000-0000-0000-000000000041', p);
  perform test_assert(r = 'accepted / ', 'the supervisor of the site is accepted: ' || r);
  r := public.ce_push('f0000000-0000-0000-0000-00000000000f', 'c5000000-0000-0000-0000-000000000042', p);
  perform test_assert(r = 'rejected / permission_denied', 'a supervisor of another site is rejected: ' || r);
  r := public.ce_push('a0000000-0000-0000-0000-00000000000a', 'c5000000-0000-0000-0000-000000000043', p || '{"amount_paise": 1.5}');
  perform test_assert(r = 'rejected / invalid_input', 'a fractional amount is rejected: ' || r);
  r := public.ce_push('a0000000-0000-0000-0000-00000000000a', 'c5000000-0000-0000-0000-000000000044', p || '{"amount_paise": "100"}');
  perform test_assert(r = 'rejected / invalid_input', 'an amount sent as text is rejected: ' || r);
  r := public.ce_push('a0000000-0000-0000-0000-00000000000a', 'c5000000-0000-0000-0000-000000000045', p || '{"entry_date": "today"}');
  perform test_assert(r = 'rejected / invalid_input', 'a date that is not YYYY-MM-DD is rejected: ' || r);
  r := public.ce_push('a0000000-0000-0000-0000-00000000000a', 'c5000000-0000-0000-0000-000000000046', p || '{"category": "gift"}');
  perform test_assert(r = 'rejected / invalid_input', 'an unknown category is rejected: ' || r);
  r := public.ce_push('a0000000-0000-0000-0000-00000000000a', 'c5000000-0000-0000-0000-000000000047', p - 'category');
  perform test_assert(r = 'rejected / invalid_input', 'a missing field is rejected: ' || r);
  r := public.ce_push('a0000000-0000-0000-0000-00000000000a', 'c5000000-0000-0000-0000-000000000048',
                      p || '{"site_id": "51000000-0000-0000-0000-000000000002"}');
  perform test_assert(r = 'rejected / invalid_state', 'an archived site is rejected as invalid state: ' || r);
  r := public.ce_push('a0000000-0000-0000-0000-00000000000a', 'c5000000-0000-0000-0000-000000000049',
                      p || '{"reverses_id": "c5000000-0000-0000-0000-000000000040"}');
  perform test_assert(r = 'accepted / ', 'a reversal is accepted: ' || r);
  r := public.ce_push('a0000000-0000-0000-0000-00000000000a', 'c5000000-0000-0000-0000-00000000004a',
                      p || '{"reverses_id": "c5000000-0000-0000-0000-000000000040"}');
  perform test_assert(r = 'conflict / duplicate', 'a second reversal is a conflict: ' || r);
end $$;

rollback;
