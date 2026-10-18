-- Materials & Inventory, part 1: the materials table. Issue #30, ADR-015.
-- Every role against every operation, positive and negative, every constraint,
-- and the audit trigger. Rows are read back rather than trusting "no error".
-- Runs on the team runner (shim, no pgTAP).
begin;

-- Org A: alice owner, carol PM, bob supervisor (assigned to site 1 only),
-- dave accountant (assigned to site 1), gina supervisor (no assignment).
-- Org B: eve owner with site B.
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
  ('51000000-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-000000000002', 'Site B', 'x', 18.0, 72.0, 'e0000000-0000-0000-0000-00000000000e');
insert into public.site_assignments (org_id, site_id, user_id, assigned_by) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-00000000000a'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-00000000000d', 'a0000000-0000-0000-0000-00000000000a');

-- Fixture rows as superuser: cement on site 1, steel on site 2, sand on site B.
insert into public.materials (id, org_id, site_id, name, unit, low_stock_threshold, created_by) values
  ('a1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'Cement OPC 53', 'bag',   20, 'a0000000-0000-0000-0000-00000000000a'),
  ('a1000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000002', 'Steel 12mm',    'tonne', null, 'a0000000-0000-0000-0000-00000000000a'),
  ('a1000000-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-000000000002', '51000000-0000-0000-0000-0000000000b1', 'Sand',          'brass', 2, 'e0000000-0000-0000-0000-00000000000e');

-- --------------------------------------------------------------- structure

do $$ begin
  perform test_assert((select relrowsecurity from pg_class where oid = 'public.materials'::regclass),
    'RLS is enabled on materials');
  perform test_assert(
    not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'materials'
                and cmd in ('DELETE', 'ALL')),
    'no delete policy on materials');
  perform test_assert(not has_table_privilege('authenticated', 'public.materials', 'DELETE'),
    'authenticated has no DELETE grant on materials');
  perform test_assert(not has_table_privilege('authenticated', 'public.materials', 'TRUNCATE'),
    'authenticated has no TRUNCATE grant on materials');
  perform test_assert(not has_table_privilege('anon', 'public.materials', 'SELECT'),
    'anon cannot read materials');
  perform test_assert(not has_column_privilege('authenticated', 'public.materials', 'unit', 'UPDATE'),
    'the unit cannot be updated by a client');
  perform test_assert(not has_column_privilege('authenticated', 'public.materials', 'site_id', 'UPDATE'),
    'the site cannot be updated by a client');
  perform test_assert(
    (select count(*) from pg_trigger where tgrelid = 'public.materials'::regclass
        and tgname = 'materials_audit' and not tgisinternal) = 1,
    'write_audit() is attached to materials');
end $$;

-- ----------------------------------------------------------------- reading

do $$
declare n int;
begin
  perform test_as('a0000000-0000-0000-0000-00000000000a');            -- owner
  select count(*) into n from public.materials;
  perform test_assert(n = 2, format('owner sees both Org A materials, saw %s', n));
  reset role;

  perform test_as('c0000000-0000-0000-0000-00000000000c');            -- PM
  select count(*) into n from public.materials;
  perform test_assert(n = 2, 'project_manager sees every material in the org');
  reset role;

  perform test_as('b0000000-0000-0000-0000-00000000000b');            -- bob, site 1 only
  select count(*) into n from public.materials;
  perform test_assert(n = 1, 'assigned supervisor sees only the materials of their site');
  select count(*) into n from public.materials where id = 'a1000000-0000-0000-0000-000000000002';
  perform test_assert(n = 0, 'supervisor cannot read another site''s material by id');
  reset role;

  perform test_as('d0000000-0000-0000-0000-00000000000d');            -- accountant, site 1
  select count(*) into n from public.materials;
  perform test_assert(n = 1, 'accountant sees materials only where assigned');
  reset role;

  perform test_as('90000000-0000-0000-0000-000000000009');            -- gina, unassigned
  select count(*) into n from public.materials;
  perform test_assert(n = 0, 'unassigned supervisor sees no materials');
  reset role;

  perform test_as('e0000000-0000-0000-0000-00000000000e');            -- other org
  select count(*) into n from public.materials where org_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  perform test_assert(n = 0, 'owner of Org B sees no Org A material');
  select count(*) into n from public.materials where id = 'a1000000-0000-0000-0000-000000000001';
  perform test_assert(n = 0, 'owner of Org B cannot read an Org A material by id');
  reset role;
end $$;

-- --------------------------------------------------------------- inserting

do $$
declare denied boolean;
begin
  perform test_as('a0000000-0000-0000-0000-00000000000a');            -- owner
  insert into public.materials (org_id, site_id, name, unit, low_stock_threshold)
  values ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'River sand', 'cft', 100);
  reset role;
  perform test_assert(
    (select created_by = 'a0000000-0000-0000-0000-00000000000a' from public.materials where name = 'River sand'),
    'owner defines a material, stamped with their id');

  perform test_as('c0000000-0000-0000-0000-00000000000c');            -- PM
  insert into public.materials (org_id, site_id, name, unit)
  values ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000002', 'Bricks', 'nos');
  reset role;
  perform test_assert(exists (select 1 from public.materials where name = 'Bricks'),
    'project_manager defines a material');

  denied := false;
  perform test_as('b0000000-0000-0000-0000-00000000000b');            -- supervisor
  begin
    insert into public.materials (org_id, site_id, name, unit)
    values ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'Gravel', 'cft');
  exception when insufficient_privilege then denied := true;
  end;
  reset role;
  perform test_assert(denied and not exists (select 1 from public.materials where name = 'Gravel'),
    'supervisor cannot define a material, even on their own site');

  denied := false;
  perform test_as('d0000000-0000-0000-0000-00000000000d');            -- accountant
  begin
    insert into public.materials (org_id, site_id, name, unit)
    values ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'Paint', 'litre');
  exception when insufficient_privilege then denied := true;
  end;
  reset role;
  perform test_assert(denied and not exists (select 1 from public.materials where name = 'Paint'),
    'accountant cannot define a material');

  denied := false;
  perform test_as('a0000000-0000-0000-0000-00000000000a');            -- owner of A, into org B
  begin
    insert into public.materials (org_id, site_id, name, unit)
    values ('bbbbbbbb-0000-0000-0000-000000000002', '51000000-0000-0000-0000-0000000000b1', 'Planted', 'bag');
  exception when insufficient_privilege then denied := true;
  end;
  reset role;
  perform test_assert(denied and not exists (select 1 from public.materials where name = 'Planted'),
    'owner of Org A cannot define a material in Org B');

  denied := false;
  perform test_as('a0000000-0000-0000-0000-00000000000a');            -- own org id, other org's site
  begin
    insert into public.materials (org_id, site_id, name, unit)
    values ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-0000000000b1', 'Swapped', 'bag');
  exception when insufficient_privilege then denied := true;
  end;
  reset role;
  perform test_assert(denied and not exists (select 1 from public.materials where name = 'Swapped'),
    'a material cannot point at another organisation''s site by swapping ids (refused by RLS, not by the FK)');

  denied := false;
  perform test_as_anon();
  begin
    insert into public.materials (org_id, site_id, name, unit)
    values ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'Anon', 'bag');
  exception when insufficient_privilege then denied := true;
  end;
  reset role;
  perform test_assert(denied, 'anon cannot define a material');
end $$;

-- ---------------------------------------------------------------- updating

do $$
declare n int; denied boolean;
begin
  perform test_as('c0000000-0000-0000-0000-00000000000c');            -- PM
  update public.materials set low_stock_threshold = 30, name = 'Cement OPC 53 grade'
   where id = 'a1000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  reset role;
  perform test_assert(n = 1
    and (select low_stock_threshold from public.materials where id = 'a1000000-0000-0000-0000-000000000001') = 30
    and (select name from public.materials where id = 'a1000000-0000-0000-0000-000000000001') = 'Cement OPC 53 grade',
    'project_manager edits the name and threshold');

  perform test_as('b0000000-0000-0000-0000-00000000000b');            -- supervisor
  update public.materials set low_stock_threshold = 0
   where id = 'a1000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  reset role;
  perform test_assert(n = 0
    and (select low_stock_threshold from public.materials where id = 'a1000000-0000-0000-0000-000000000001') = 30,
    'supervisor update changes 0 rows and leaves the threshold alone');

  perform test_as('e0000000-0000-0000-0000-00000000000e');            -- other org
  update public.materials set name = 'hijacked'
   where id = 'a1000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  reset role;
  perform test_assert(n = 0
    and (select name from public.materials where id = 'a1000000-0000-0000-0000-000000000001') = 'Cement OPC 53 grade',
    'owner of Org B cannot edit an Org A material');

  denied := false;
  perform test_as('a0000000-0000-0000-0000-00000000000a');            -- owner, unit change
  begin
    update public.materials set unit = 'kg' where id = 'a1000000-0000-0000-0000-000000000001';
  exception when insufficient_privilege then denied := true;
  end;
  reset role;
  perform test_assert(denied
    and (select unit from public.materials where id = 'a1000000-0000-0000-0000-000000000001') = 'bag',
    'even the owner cannot change a material''s unit');

  denied := false;
  perform test_as('a0000000-0000-0000-0000-00000000000a');            -- owner, move site
  begin
    update public.materials set site_id = '51000000-0000-0000-0000-000000000002'
     where id = 'a1000000-0000-0000-0000-000000000001';
  exception when insufficient_privilege then denied := true;
  end;
  reset role;
  perform test_assert(denied
    and (select site_id from public.materials where id = 'a1000000-0000-0000-0000-000000000001')
        = '51000000-0000-0000-0000-000000000001',
    'a material cannot move to another site');
end $$;

-- ---------------------------------------------------------------- deleting

do $$
declare denied int := 0; v_uid uuid;
begin
  foreach v_uid in array array[
    'a0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000c',
    'b0000000-0000-0000-0000-00000000000b', 'd0000000-0000-0000-0000-00000000000d']::uuid[]
  loop
    perform test_as(v_uid);
    begin
      delete from public.materials where id = 'a1000000-0000-0000-0000-000000000001';
    exception when insufficient_privilege then denied := denied + 1;
    end;
    reset role;
  end loop;
  perform test_assert(denied = 4, 'every role is refused a delete');
  perform test_assert(exists (select 1 from public.materials where id = 'a1000000-0000-0000-0000-000000000001'),
    'the material is still there');
end $$;

-- ------------------------------------------------------------- constraints

do $$
declare
  v_cases text[][] := array[
    array['blank name',          '',                  'bag',  '1'],
    array['padded name',         ' Cement ',          'bag',  '1'],
    array['name over 120',       repeat('x', 121),    'bag',  '1'],
    array['unknown unit',        'Gravel',            'bags', '1'],
    array['negative threshold',  'Gravel',            'bag',  '-1']
  ];
  v_case text[];
  refused boolean;
begin
  foreach v_case slice 1 in array v_cases loop
    refused := false;
    begin
      insert into public.materials (org_id, site_id, name, unit, low_stock_threshold, created_by)
      values ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001',
              v_case[2], v_case[3], v_case[4]::numeric, 'a0000000-0000-0000-0000-00000000000a');
    exception when check_violation then refused := true;
    end;
    perform test_assert(refused, format('%s is refused by a CHECK', v_case[1]));
  end loop;

  refused := false;
  begin
    insert into public.materials (org_id, site_id, name, unit, created_by)
    values ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001',
            'cement opc 53 GRADE', 'bag', 'a0000000-0000-0000-0000-00000000000a');
  exception when unique_violation then refused := true;
  end;
  perform test_assert(refused, 'a second material with the same name on one site is refused, ignoring case');

  insert into public.materials (org_id, site_id, name, unit, created_by)
  values ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000002',
          'Cement OPC 53 grade', 'bag', 'a0000000-0000-0000-0000-00000000000a');
  perform test_assert(
    (select count(*) from public.materials where lower(name) = 'cement opc 53 grade') = 2,
    'the same name is fine on another site');

  insert into public.materials (org_id, site_id, name, unit, low_stock_threshold, created_by)
  values ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001',
          'Tile adhesive', 'kg', 12.375, 'a0000000-0000-0000-0000-00000000000a');
  perform test_assert(
    (select low_stock_threshold from public.materials where name = 'Tile adhesive') = 12.375,
    'a threshold keeps three decimals');
end $$;

-- ------------------------------------------------------------------- audit

do $$
declare v_id uuid; n int;
begin
  perform test_as('a0000000-0000-0000-0000-00000000000a');
  insert into public.materials (org_id, site_id, name, unit)
  values ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'Waterproofing', 'litre')
  returning id into v_id;
  reset role;

  select count(*) into n from public.audit_log
   where table_name = 'materials' and row_id = v_id and operation = 'INSERT'
     and actor_id = 'a0000000-0000-0000-0000-00000000000a'
     and org_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  perform test_assert(n = 1, format('one audit row for the insert, with actor and org, got %s', n));

  -- A refused update writes no audit row.
  perform test_as('b0000000-0000-0000-0000-00000000000b');
  update public.materials set name = 'nope' where id = v_id;
  reset role;
  perform test_assert(
    not exists (select 1 from public.audit_log where table_name = 'materials' and row_id = v_id and operation = 'UPDATE'),
    'a refused update writes no audit row');
end $$;

rollback;
