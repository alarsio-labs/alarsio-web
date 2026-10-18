-- Materials & Inventory, part 2: the ledger, apply_material_transaction(),
-- material_balances, material_alerts and sync_material_transactions().
-- Issue #30, ADR-017. Rows are read back, never assumed. Shim style, no pgTAP.
begin;

-- Org A: alice owner, carol PM, bob supervisor (sites 1 and 3), dave accountant
-- (site 1), gina supervisor (no assignment). Org B: eve owner.
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
  ('51000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'Site 3', 'x', 19.2, 73.2, 'a0000000-0000-0000-0000-00000000000a'),
  ('51000000-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-000000000002', 'Site B', 'x', 18.0, 72.0, 'e0000000-0000-0000-0000-00000000000e');
insert into public.site_assignments (org_id, site_id, user_id, assigned_by) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-00000000000a'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-00000000000a'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-00000000000d', 'a0000000-0000-0000-0000-00000000000a');
insert into public.materials (id, org_id, site_id, name, unit, low_stock_threshold, created_by) values
  ('a1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'Cement', 'bag',   20, 'a0000000-0000-0000-0000-00000000000a'),
  ('a1000000-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'Sand',   'cft',   null, 'a0000000-0000-0000-0000-00000000000a'),
  ('a1000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000002', 'Steel',  'tonne', null, 'a0000000-0000-0000-0000-00000000000a'),
  ('a1000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000003', 'Bricks', 'nos',   null, 'a0000000-0000-0000-0000-00000000000a'),
  ('a1000000-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-000000000002', '51000000-0000-0000-0000-0000000000b1', 'Tiles',  'sqft',  null, 'e0000000-0000-0000-0000-00000000000e');
-- A movement on site 2, where bob is not assigned (as superuser, for read tests).
insert into public.material_transactions (id, org_id, site_id, material_id, kind, quantity, occurred_on, recorded_by) values
  ('f2000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000002',
   'a1000000-0000-0000-0000-000000000002', 'receipt', 3, current_date, 'a0000000-0000-0000-0000-00000000000a');

-- Try apply_material_transaction as a user. Returns 'ok', or the SQLSTATE and message.
create function public.ml_try(p_uid uuid, p_id uuid, p_material uuid, p_kind text,
                              p_qty numeric, p_on date, p_reason text default null)
returns text language plpgsql as $$
begin
  perform test_as(p_uid);
  perform public.apply_material_transaction(p_id, p_material, p_kind, p_qty, p_on, p_reason);
  execute 'reset role';
  return 'ok';
exception when others then
  execute 'reset role';
  return sqlstate || ': ' || sqlerrm;
end $$;

create function public.ml_balance(p_material uuid) returns numeric language sql as $$
  select balance from public.material_balances where material_id = p_material
$$;

create function public.ml_count(p_material uuid) returns bigint language sql as $$
  select count(*) from public.material_transactions where material_id = p_material
$$;

-- --------------------------------------------------------------- structure

do $$ begin
  perform test_assert((select relrowsecurity from pg_class where oid = 'public.material_transactions'::regclass),
    'RLS is enabled on material_transactions');
  perform test_assert(
    not has_table_privilege('authenticated', 'public.material_transactions', 'INSERT')
    and not has_table_privilege('authenticated', 'public.material_transactions', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.material_transactions', 'DELETE')
    and not has_table_privilege('authenticated', 'public.material_transactions', 'TRUNCATE'),
    'no client may insert, update, delete or truncate the ledger');
  perform test_assert(
    (select bool_and(reloptions @> array['security_invoker=true']) from pg_class
      where oid in ('public.material_balances'::regclass, 'public.material_alerts'::regclass)),
    'both views are security_invoker');
  perform test_assert(
    (select count(*) from pg_trigger where tgrelid = 'public.material_transactions'::regclass
        and tgname = 'material_transactions_audit' and not tgisinternal) = 1,
    'write_audit() is attached to material_transactions');
  perform test_assert(
    (select prosecdef and proconfig @> array['search_path=public'] from pg_proc
      where oid = 'public.apply_material_transaction(uuid, uuid, text, numeric, date, text)'::regprocedure),
    'apply_material_transaction is security definer with search_path = public');
  perform test_assert(
    (select not prosecdef and proconfig @> array['search_path=public'] from pg_proc
      where oid = 'public.sync_material_transactions(uuid, jsonb)'::regprocedure),
    'the sync handler is security invoker with search_path = public');
  perform test_assert(
    not has_function_privilege('anon', 'public.apply_material_transaction(uuid, uuid, text, numeric, date, text)', 'execute'),
    'anon cannot execute apply_material_transaction');
  perform test_assert(
    (select count(*) from pg_indexes where tablename = 'material_transactions'
        and indexname in ('material_transactions_material_idx', 'material_transactions_site_idx')) = 2,
    'indexes on material_id and site_id');
end $$;

-- ------------------------------------------- recording, and the balance

do $$
declare r text;
begin
  -- Worked by hand: opening 100 + receipt 50 - usage 30 + adjustment (-5) = 115.
  r := public.ml_try('b0000000-0000-0000-0000-00000000000b', 'c1000000-0000-0000-0000-000000000001',
                     'a1000000-0000-0000-0000-000000000001', 'opening', 100, current_date - 3);
  perform test_assert(r = 'ok', format('opening recorded: %s', r));
  r := public.ml_try('b0000000-0000-0000-0000-00000000000b', 'c1000000-0000-0000-0000-000000000002',
                     'a1000000-0000-0000-0000-000000000001', 'receipt', 50, current_date - 2);
  perform test_assert(r = 'ok', format('receipt recorded: %s', r));
  r := public.ml_try('b0000000-0000-0000-0000-00000000000b', 'c1000000-0000-0000-0000-000000000003',
                     'a1000000-0000-0000-0000-000000000001', 'usage', 30, current_date - 1);
  perform test_assert(r = 'ok', format('usage recorded: %s', r));
  r := public.ml_try('b0000000-0000-0000-0000-00000000000b', 'c1000000-0000-0000-0000-000000000004',
                     'a1000000-0000-0000-0000-000000000001', 'adjustment', -5, current_date, '  5 bags torn  ');
  perform test_assert(r = 'ok', format('adjustment recorded: %s', r));

  perform test_assert(public.ml_balance('a1000000-0000-0000-0000-000000000001') = 115,
    format('balance is 100 + 50 - 30 - 5 = 115, got %s', public.ml_balance('a1000000-0000-0000-0000-000000000001')));
  perform test_assert(
    (select reason from public.material_transactions where id = 'c1000000-0000-0000-0000-000000000004') = '5 bags torn',
    'the reason is stored trimmed');
  perform test_assert(
    (select recorded_by = 'b0000000-0000-0000-0000-00000000000b' and org_id = 'aaaaaaaa-0000-0000-0000-000000000001'
            and site_id = '51000000-0000-0000-0000-000000000001'
       from public.material_transactions where id = 'c1000000-0000-0000-0000-000000000001'),
    'org, site and recorder come from the server, not the caller');
  perform test_assert(public.ml_balance('a1000000-0000-0000-0000-000000000004') = 0,
    'a material with no movements has a balance of 0');
  perform test_assert(
    (select transaction_count from public.material_balances where material_id = 'a1000000-0000-0000-0000-000000000001') = 4,
    'the balance view counts four movements');
end $$;

-- ------------------------------------------------------------------ alerts

do $$ begin
  perform test_assert(
    not exists (select 1 from public.material_alerts where material_id = 'a1000000-0000-0000-0000-000000000001'),
    'no alert at 115 with a threshold of 20');

  perform test_assert(public.ml_try('b0000000-0000-0000-0000-00000000000b', 'c1000000-0000-0000-0000-000000000005',
    'a1000000-0000-0000-0000-000000000001', 'usage', 100, current_date) = 'ok', 'usage down to 15');
  perform test_assert(
    (select alert from public.material_alerts where material_id = 'a1000000-0000-0000-0000-000000000001') = 'low',
    'at 15, under a threshold of 20, the material is low');

  perform test_assert(public.ml_try('b0000000-0000-0000-0000-00000000000b', 'c1000000-0000-0000-0000-000000000006',
    'a1000000-0000-0000-0000-000000000001', 'usage', 40, current_date) = 'ok',
    'usage below zero is allowed, not blocked');
  perform test_assert(public.ml_balance('a1000000-0000-0000-0000-000000000001') = -25, 'balance is -25');
  perform test_assert(
    (select alert from public.material_alerts where material_id = 'a1000000-0000-0000-0000-000000000001') = 'negative',
    'below zero the material is flagged negative');

  perform test_assert(
    not exists (select 1 from public.material_alerts where material_id = 'a1000000-0000-0000-0000-000000000004'),
    'with no threshold there is no low alert');
end $$;

-- -------------------------------------------------- refused, and no row left

do $$
declare
  v_before bigint := public.ml_count('a1000000-0000-0000-0000-000000000001');
  v_forbidden text;
  v_missing text;
begin
  perform test_assert(public.ml_try('b0000000-0000-0000-0000-00000000000b', 'c2000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000001', 'adjustment', 3, current_date) like '23514:%',
    'an adjustment without a reason is refused');
  perform test_assert(public.ml_try('b0000000-0000-0000-0000-00000000000b', 'c2000000-0000-0000-0000-000000000002',
    'a1000000-0000-0000-0000-000000000001', 'adjustment', 3, current_date, '   ') like '23514:%',
    'a blank reason counts as none');
  perform test_assert(public.ml_try('b0000000-0000-0000-0000-00000000000b', 'c2000000-0000-0000-0000-000000000003',
    'a1000000-0000-0000-0000-000000000001', 'receipt', 0, current_date) like '23514:%',
    'a receipt of zero is refused');
  perform test_assert(public.ml_try('b0000000-0000-0000-0000-00000000000b', 'c2000000-0000-0000-0000-000000000004',
    'a1000000-0000-0000-0000-000000000001', 'usage', -4, current_date) like '23514:%',
    'a negative usage is refused');
  perform test_assert(public.ml_try('b0000000-0000-0000-0000-00000000000b', 'c2000000-0000-0000-0000-000000000005',
    'a1000000-0000-0000-0000-000000000001', 'adjustment', 0, current_date, 'nothing') like '23514:%',
    'an adjustment of zero is refused');
  perform test_assert(public.ml_try('b0000000-0000-0000-0000-00000000000b', 'c2000000-0000-0000-0000-000000000006',
    'a1000000-0000-0000-0000-000000000001', 'opening', 10, current_date) like '23505:%',
    'a second opening balance is refused');
  perform test_assert(public.ml_try('b0000000-0000-0000-0000-00000000000b', 'c2000000-0000-0000-0000-000000000007',
    'a1000000-0000-0000-0000-000000000001', 'transfer', 1, current_date) like '23514:%',
    'an unknown kind is refused');
  perform test_assert(public.ml_try('b0000000-0000-0000-0000-00000000000b', 'c2000000-0000-0000-0000-000000000008',
    'a1000000-0000-0000-0000-000000000001', 'receipt', 1, current_date + 5) like '22023:%',
    'a date in the future is refused');

  -- Wrong people, all with one and the same error.
  v_forbidden := public.ml_try('a0000000-0000-0000-0000-00000000000a', 'c2000000-0000-0000-0000-000000000011',
    'a1000000-0000-0000-0000-000000000001', 'receipt', 1, current_date);
  perform test_assert(v_forbidden like '42501:%', 'the owner does not record, they review');
  perform test_assert(public.ml_try('c0000000-0000-0000-0000-00000000000c', 'c2000000-0000-0000-0000-000000000012',
    'a1000000-0000-0000-0000-000000000001', 'receipt', 1, current_date) = v_forbidden,
    'a project_manager does not record');
  perform test_assert(public.ml_try('d0000000-0000-0000-0000-00000000000d', 'c2000000-0000-0000-0000-000000000013',
    'a1000000-0000-0000-0000-000000000001', 'receipt', 1, current_date) = v_forbidden,
    'an assigned accountant does not record');
  perform test_assert(public.ml_try('90000000-0000-0000-0000-000000000009', 'c2000000-0000-0000-0000-000000000014',
    'a1000000-0000-0000-0000-000000000001', 'receipt', 1, current_date) = v_forbidden,
    'an unassigned supervisor does not record');
  perform test_assert(public.ml_try('b0000000-0000-0000-0000-00000000000b', 'c2000000-0000-0000-0000-000000000015',
    'a1000000-0000-0000-0000-000000000002', 'receipt', 1, current_date) = v_forbidden,
    'a supervisor cannot record on another site of the org');
  perform test_assert(public.ml_try('b0000000-0000-0000-0000-00000000000b', 'c2000000-0000-0000-0000-000000000016',
    'a1000000-0000-0000-0000-0000000000b1', 'receipt', 1, current_date) = v_forbidden,
    'a supervisor cannot record on another organisation''s material');
  v_missing := public.ml_try('b0000000-0000-0000-0000-00000000000b', 'c2000000-0000-0000-0000-000000000017',
    '00000000-0000-0000-0000-00000000dead', 'receipt', 1, current_date);
  perform test_assert(v_missing = v_forbidden, 'a missing material gives exactly the same error as a forbidden one');

  perform test_assert(public.ml_count('a1000000-0000-0000-0000-000000000001') = v_before,
    'no refused call left a row');
  perform test_assert(not exists (select 1 from public.material_transactions where id::text like 'c2000000-%'),
    'none of the refused ids exist');
end $$;

-- --------------------------------------------------------- archived site

do $$
begin
  perform test_assert(public.ml_try('b0000000-0000-0000-0000-00000000000b', 'c3000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000003', 'opening', 500, current_date) = 'ok',
    'bob records on site 3 while it is open');

  update public.sites set status = 'archived', archived_at = now(),
    archived_by = 'a0000000-0000-0000-0000-00000000000a'
   where id = '51000000-0000-0000-0000-000000000003';

  perform test_assert(public.ml_try('b0000000-0000-0000-0000-00000000000b', 'c3000000-0000-0000-0000-000000000002',
    'a1000000-0000-0000-0000-000000000003', 'usage', 10, current_date) like '42501:%',
    'a transaction on an archived site is refused');
  perform test_assert(public.ml_try('b0000000-0000-0000-0000-00000000000b', 'c3000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000003', 'opening', 500, current_date) = 'ok',
    'a replay of bob''s own earlier record still answers done after the archive');
  perform test_assert(public.ml_count('a1000000-0000-0000-0000-000000000003') = 1,
    'and adds nothing');
end $$;

-- ------------------------------------------------------------ replay, conflict

do $$
declare v_before bigint := (select count(*) from public.material_transactions);
begin
  perform test_assert(public.ml_try('b0000000-0000-0000-0000-00000000000b', 'c1000000-0000-0000-0000-000000000002',
    'a1000000-0000-0000-0000-000000000001', 'receipt', 50, current_date - 2) = 'ok',
    'the same id with the same content is a harmless replay');
  perform test_assert(public.ml_try('b0000000-0000-0000-0000-00000000000b', 'c1000000-0000-0000-0000-000000000002',
    'a1000000-0000-0000-0000-000000000001', 'receipt', 50.0004, current_date - 2) = 'ok',
    'a quantity that rounds to the stored one is still the same content');
  perform test_assert((select count(*) from public.material_transactions) = v_before, 'replays create no row');

  perform test_assert(public.ml_try('b0000000-0000-0000-0000-00000000000b', 'c1000000-0000-0000-0000-000000000002',
    'a1000000-0000-0000-0000-000000000001', 'receipt', 55, current_date - 2) like '23505:%',
    'the same id with different content is a conflict');
  perform test_assert(
    (select quantity from public.material_transactions where id = 'c1000000-0000-0000-0000-000000000002') = 50,
    'and the stored row is unchanged');
end $$;

-- ------------------------------------------------------------- append-only

do $$
declare refused int := 0;
begin
  begin update public.material_transactions set quantity = 1 where id = 'c1000000-0000-0000-0000-000000000002';
  exception when insufficient_privilege then refused := refused + 1; end;
  begin delete from public.material_transactions where id = 'c1000000-0000-0000-0000-000000000002';
  exception when insufficient_privilege then refused := refused + 1; end;
  begin truncate public.material_transactions;
  exception when insufficient_privilege then refused := refused + 1; end;
  perform test_assert(refused = 3, 'update, delete and truncate are refused even for the table owner');

  refused := 0;
  perform test_as('b0000000-0000-0000-0000-00000000000b');
  begin
    insert into public.material_transactions (org_id, site_id, material_id, kind, quantity, occurred_on, recorded_by)
    values ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001',
            'a1000000-0000-0000-0000-000000000001', 'receipt', 999, current_date, 'b0000000-0000-0000-0000-00000000000b');
  exception when insufficient_privilege then refused := 1;
  end;
  reset role;
  perform test_assert(refused = 1, 'a client cannot insert into the ledger directly');
end $$;

-- ------------------------------------------------------------------ reading

do $$
declare n int;
begin
  perform test_as('b0000000-0000-0000-0000-00000000000b');
  select count(*) into n from public.material_transactions where site_id = '51000000-0000-0000-0000-000000000002';
  perform test_assert(n = 0, 'bob cannot read movements on a site he is not assigned to');
  select count(*) into n from public.material_transactions where id = 'f2000000-0000-0000-0000-000000000001';
  perform test_assert(n = 0, 'not even by id');
  select count(*) into n from public.material_balances where material_id = 'a1000000-0000-0000-0000-000000000002';
  perform test_assert(n = 0, 'nor its balance');
  reset role;

  perform test_as('c0000000-0000-0000-0000-00000000000c');
  select count(*) into n from public.material_balances where org_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  perform test_assert(n = 4, format('the project_manager sees every Org A balance, saw %s', n));
  reset role;

  perform test_as('e0000000-0000-0000-0000-00000000000e');
  select count(*) into n from public.material_transactions where org_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  perform test_assert(n = 0, 'Org B sees no Org A movement');
  select count(*) into n from public.material_alerts where org_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  perform test_assert(n = 0, 'nor any Org A alert');
  reset role;
end $$;

-- ------------------------------------------------------------------- audit

do $$ begin
  perform test_assert(
    (select count(*) from public.audit_log
      where table_name = 'material_transactions' and row_id = 'c1000000-0000-0000-0000-000000000001'
        and operation = 'INSERT' and actor_id = 'b0000000-0000-0000-0000-00000000000b'
        and org_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 1,
    'exactly one audit row for a recorded movement, with actor and org');
  perform test_assert(
    not exists (select 1 from public.audit_log where table_name = 'material_transactions' and row_id::text like 'c2000000-%'),
    'refused calls left no audit row');
end $$;

-- ---------------------------------------------- end to end through sync_push

create function public.ml_push(p_uid uuid, p_records jsonb) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform test_as(p_uid);
  v := public.sync_push(jsonb_build_object('version', 1, 'device_id', 'test-phone', 'records', p_records));
  execute 'reset role';
  return v;
end $$;

create function public.ml_verdicts(p_response jsonb) returns text language sql as $$
  select string_agg((x ->> 'verdict') || ':' || coalesce(x ->> 'reason', '-'), ',' order by n)
  from jsonb_array_elements(p_response -> 'results') with ordinality as t (x, n)
$$;

do $$
declare
  v_batch  jsonb := jsonb_build_array(
    jsonb_build_object('entity', 'material_transactions', 'record_id', 'c4000000-0000-0000-0000-000000000001',
      'payload', jsonb_build_object('material_id', 'a1000000-0000-0000-0000-000000000004', 'kind', 'opening',
                                    'quantity', 40, 'occurred_on', current_date)),
    jsonb_build_object('entity', 'material_transactions', 'record_id', 'c4000000-0000-0000-0000-000000000002',
      'payload', jsonb_build_object('material_id', 'a1000000-0000-0000-0000-000000000004', 'kind', 'usage',
                                    'quantity', 12.5, 'occurred_on', current_date)));
  v_first  jsonb;
  v_second jsonb;
  v_after_first bigint;
begin
  v_first := public.ml_push('b0000000-0000-0000-0000-00000000000b', v_batch);
  v_after_first := public.ml_count('a1000000-0000-0000-0000-000000000004');
  v_second := public.ml_push('b0000000-0000-0000-0000-00000000000b', v_batch);

  perform test_assert(public.ml_verdicts(v_first) = 'accepted:-,accepted:-',
    format('both records accepted through sync_push, got %s', v_first));
  perform test_assert(v_after_first = 2, 'the first push wrote two movements');
  perform test_assert(public.ml_count('a1000000-0000-0000-0000-000000000004') = 2,
    'the same batch pushed twice creates nothing the second time');
  perform test_assert(v_first = v_second, 'and gets the same answer');
  perform test_assert(public.ml_balance('a1000000-0000-0000-0000-000000000004') = 27.5,
    'the synced movements give a balance of 40 - 12.5 = 27.5');
end $$;

do $$
declare v jsonb;
begin
  v := public.ml_push('b0000000-0000-0000-0000-00000000000b', jsonb_build_array(
    -- same id as an accepted record, different quantity
    jsonb_build_object('entity', 'material_transactions', 'record_id', 'c4000000-0000-0000-0000-000000000002',
      'payload', jsonb_build_object('material_id', 'a1000000-0000-0000-0000-000000000004', 'kind', 'usage',
                                    'quantity', 99, 'occurred_on', current_date)),
    jsonb_build_object('entity', 'material_transactions', 'record_id', 'c4000000-0000-0000-0000-000000000003',
      'payload', jsonb_build_object('material_id', 'a1000000-0000-0000-0000-000000000004', 'kind', 'usage',
                                    'quantity', 'abc', 'occurred_on', current_date)),
    jsonb_build_object('entity', 'material_transactions', 'record_id', 'c4000000-0000-0000-0000-000000000004',
      'payload', jsonb_build_object('material_id', 'a1000000-0000-0000-0000-000000000004', 'kind', 'usage',
                                    'quantity', 1)),
    jsonb_build_object('entity', 'material_transactions', 'record_id', 'c4000000-0000-0000-0000-000000000005',
      'payload', jsonb_build_object('material_id', 'a1000000-0000-0000-0000-000000000004', 'kind', 'adjustment',
                                    'quantity', 2, 'occurred_on', current_date)),
    jsonb_build_object('entity', 'material_transactions', 'record_id', 'c4000000-0000-0000-0000-000000000006',
      'payload', jsonb_build_object('material_id', 'a1000000-0000-0000-0000-000000000003', 'kind', 'usage',
                                    'quantity', 1, 'occurred_on', current_date)),
    jsonb_build_object('entity', 'material_transactions', 'record_id', 'c4000000-0000-0000-0000-000000000007',
      'payload', jsonb_build_object('material_id', 'a1000000-0000-0000-0000-000000000004', 'kind', 'opening',
                                    'quantity', 5, 'occurred_on', current_date))));

  perform test_assert(
    public.ml_verdicts(v) = 'conflict:duplicate,rejected:invalid_input,rejected:invalid_input,'
      || 'rejected:invalid_input,rejected:permission_denied,conflict:duplicate',
    format('sync verdicts for bad records, got %s', public.ml_verdicts(v)));
  perform test_assert(
    (select quantity from public.material_transactions where id = 'c4000000-0000-0000-0000-000000000002') = 12.5,
    'the conflicting push left the stored movement unchanged');
  perform test_assert(public.ml_count('a1000000-0000-0000-0000-000000000004') = 2,
    'no refused sync record left a row');

  v := public.ml_push('90000000-0000-0000-0000-000000000009', jsonb_build_array(
    jsonb_build_object('entity', 'material_transactions', 'record_id', 'c4000000-0000-0000-0000-000000000008',
      'payload', jsonb_build_object('material_id', 'a1000000-0000-0000-0000-000000000004', 'kind', 'receipt',
                                    'quantity', 1, 'occurred_on', current_date))));
  perform test_assert(public.ml_verdicts(v) = 'rejected:permission_denied',
    'an unassigned supervisor''s push is rejected');
end $$;

rollback;
