-- Audit, Retention & Guards: audit_log and write_audit(). Issue #4, one block
-- per acceptance criterion. Positive and negative.
--
-- Identity attaches the real triggers in its own migration. Here they are
-- attached inside this transaction and rolled back with everything else.
begin;

create trigger organizations_audit
  after insert or update or delete on public.organizations
  for each row execute function public.write_audit();
create trigger profiles_audit
  after insert or update or delete on public.profiles
  for each row execute function public.write_audit();
create trigger memberships_audit
  after insert or update or delete on public.memberships
  for each row execute function public.write_audit();

-- Fixture (as superuser, no JWT claim). Org A: alice owner, carol PM, bob
-- supervisor. Org B: eve owner. frank and grace belong to nothing.
insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-00000000000a', 'alice@x'),
  ('b0000000-0000-0000-0000-00000000000b', 'bob@x'),
  ('c0000000-0000-0000-0000-00000000000c', 'carol@x'),
  ('e0000000-0000-0000-0000-00000000000e', 'eve@x'),
  ('f0000000-0000-0000-0000-00000000000f', 'frank@x'),
  ('00000000-0000-0000-0000-000000000009', 'grace@x');
insert into public.organizations (id, name, created_by) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Org A', 'a0000000-0000-0000-0000-00000000000a'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Org B', 'e0000000-0000-0000-0000-00000000000e');
insert into public.memberships (org_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'owner'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000c', 'project_manager'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b', 'supervisor'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-00000000000e', 'owner');
insert into public.profiles (id, full_name) values
  ('a0000000-0000-0000-0000-00000000000a', 'Alice'),
  ('b0000000-0000-0000-0000-00000000000b', 'Bob');

-- ------------------------------------------------- AC1 · RLS, append-only

do $$
declare r text; p text;
begin
  perform test_assert(
    (select relrowsecurity from pg_class where oid = 'public.audit_log'::regclass),
    'RLS enabled on audit_log');
  perform test_assert(
    not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'audit_log'),
    'audit_log has no policies at all');
  foreach r in array array['anon', 'authenticated'] loop
    foreach p in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'] loop
      perform test_assert(not has_table_privilege(r, 'public.audit_log', p),
        r || ' has no ' || p || ' on audit_log');
    end loop;
  end loop;
end $$;

-- Clients are refused outright, even the owner of the org the rows belong to.
do $$
declare denied int := 0;
begin
  perform test_as('a0000000-0000-0000-0000-00000000000a');
  begin perform count(*) from audit_log;
  exception when insufficient_privilege then denied := denied + 1; end;
  begin insert into audit_log (table_name, row_id, operation, new_data)
        values ('memberships', gen_random_uuid(), 'INSERT', '{}');
  exception when insufficient_privilege then denied := denied + 1; end;
  begin update audit_log set table_name = 'x';
  exception when insufficient_privilege then denied := denied + 1; end;
  begin delete from audit_log;
  exception when insufficient_privilege then denied := denied + 1; end;
  reset role;
  perform test_as_anon();
  begin perform count(*) from audit_log;
  exception when insufficient_privilege then denied := denied + 1; end;
  reset role;
  perform test_assert(denied = 5, 'authenticated and anon refused on audit_log');
end $$;

-- The guard stops even the table owner.
do $$
declare blocked int := 0; n int;
begin
  select count(*) into n from audit_log;
  perform test_assert(n > 0, 'fixture produced audit rows to guard');
  begin update audit_log set table_name = 'tampered';
  exception when insufficient_privilege then
    if sqlerrm like '%append-only%' then blocked := blocked + 1; end if;
  end;
  begin delete from audit_log;
  exception when insufficient_privilege then
    if sqlerrm like '%append-only%' then blocked := blocked + 1; end if;
  end;
  begin truncate audit_log;
  exception when insufficient_privilege then
    if sqlerrm like '%append-only%' then blocked := blocked + 1; end if;
  end;
  perform test_assert(blocked = 3, 'superuser update, delete and truncate blocked by guard');
  perform test_assert((select count(*) from audit_log) = n, 'audit rows unchanged');
  perform test_assert(not exists (select 1 from audit_log where table_name = 'tampered'), 'no row tampered');
end $$;

-- ------------------------------------- AC2 · exactly one row per changed row

do $$
declare before_n bigint; last_id bigint; n int; ids uuid[];
begin
  select count(*), coalesce(max(id), 0) into before_n, last_id from audit_log;
  perform test_as('a0000000-0000-0000-0000-00000000000a');           -- alice, owner A
  insert into memberships (org_id, user_id, role) values
    ('aaaaaaaa-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-00000000000f', 'supervisor'),
    ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000009', 'supervisor');
  reset role;
  perform test_assert((select count(*) from audit_log) = before_n + 2, 'two-row insert wrote exactly 2 audit rows');
  select array_agg(id order by id) into ids from memberships
   where user_id in ('f0000000-0000-0000-0000-00000000000f', '00000000-0000-0000-0000-000000000009');
  perform test_assert(
    (select array_agg(row_id order by row_id) from audit_log where id > last_id) = ids,
    'one audit row for each inserted membership');

  select count(*) into before_n from audit_log;
  perform test_as('a0000000-0000-0000-0000-00000000000a');
  update memberships set role = 'accountant'
   where user_id = 'f0000000-0000-0000-0000-00000000000f';
  get diagnostics n = row_count;
  reset role;
  perform test_assert(n = 1, 'update changed 1 row');
  perform test_assert((select count(*) from audit_log) = before_n + 1, 'one-row update wrote exactly 1 audit row');

  select count(*) into before_n from audit_log;
  perform test_as('a0000000-0000-0000-0000-00000000000a');
  update memberships set role = 'project_manager'
   where user_id in ('f0000000-0000-0000-0000-00000000000f', '00000000-0000-0000-0000-000000000009');
  get diagnostics n = row_count;
  reset role;
  perform test_assert(n = 2, 'update changed 2 rows');
  perform test_assert((select count(*) from audit_log) = before_n + 2, 'two-row update wrote exactly 2 audit rows');
end $$;

-- Attached the wrong way, write_audit() refuses rather than miscounting.
create table public.audit_scratch (id uuid primary key default gen_random_uuid());
create trigger audit_scratch_stmt
  after insert on public.audit_scratch
  for each statement execute function public.write_audit();
create table public.audit_scratch_noid (k int);
alter table public.audit_scratch      enable row level security;
alter table public.audit_scratch_noid enable row level security;
create trigger audit_scratch_noid_audit
  after insert on public.audit_scratch_noid
  for each row execute function public.write_audit();

do $$
declare refused int := 0;
begin
  begin insert into audit_scratch default values;
  exception when trigger_protocol_violated then refused := refused + 1; end;
  begin insert into audit_scratch_noid values (1);
  exception when trigger_protocol_violated then refused := refused + 1; end;
  perform test_assert(refused = 2, 'statement-level attach and table without id refused');
  perform test_assert(not exists (select 1 from audit_log where table_name like 'audit_scratch%'),
    'no audit row from a refused attach');
end $$;

-- ------------------------------------------ AC3 · what each row records

do $$
declare m_id uuid; a public.audit_log;
begin
  select id into m_id from memberships where user_id = 'f0000000-0000-0000-0000-00000000000f';

  -- INSERT
  select * into a from audit_log
   where table_name = 'memberships' and row_id = m_id and operation = 'INSERT';
  perform test_assert(a.id is not null, 'INSERT audit row exists');
  perform test_assert(a.actor_id = 'a0000000-0000-0000-0000-00000000000a', 'INSERT actor is alice');
  perform test_assert(a.old_data is null, 'INSERT has no old_data');
  perform test_assert(a.new_data ->> 'role' = 'supervisor', 'INSERT new_data holds the row');
  perform test_assert((a.new_data ->> 'id')::uuid = m_id, 'INSERT new_data id matches row_id');
  perform test_assert(a.occurred_at = now(), 'INSERT occurred_at is the transaction time');

  -- UPDATE (the first of the two above)
  select * into a from audit_log
   where table_name = 'memberships' and row_id = m_id and operation = 'UPDATE'
   order by id limit 1;
  perform test_assert(a.actor_id = 'a0000000-0000-0000-0000-00000000000a', 'UPDATE actor is alice');
  perform test_assert(a.old_data ->> 'role' = 'supervisor', 'UPDATE old_data holds the old role');
  perform test_assert(a.new_data ->> 'role' = 'accountant', 'UPDATE new_data holds the new role');
  perform test_assert(a.occurred_at is not null, 'UPDATE has a timestamp');

  -- DELETE (superuser: no role has a delete grant on memberships)
  perform set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-00000000000e', true);
  delete from memberships where id = m_id;
  select * into a from audit_log
   where table_name = 'memberships' and row_id = m_id and operation = 'DELETE';
  perform test_assert(a.id is not null, 'DELETE audit row exists');
  perform test_assert(a.actor_id = 'e0000000-0000-0000-0000-00000000000e', 'DELETE actor recorded from auth.uid()');
  perform test_assert(a.old_data ->> 'role' = 'project_manager', 'DELETE old_data holds the last row');
  perform test_assert(a.new_data is null, 'DELETE has no new_data');
  perform test_assert(a.org_id = 'aaaaaaaa-0000-0000-0000-000000000001', 'DELETE org_id from the old row');
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

-- ---------------------------------------- AC4 · tables without an org_id

do $$
declare before_n bigint; last_id bigint; org uuid; a public.audit_log;
begin
  -- profiles: no org_id column at all.
  select count(*), coalesce(max(id), 0) into before_n, last_id from audit_log;
  perform test_as('b0000000-0000-0000-0000-00000000000b');           -- bob
  update profiles set full_name = 'Bobby' where id = 'b0000000-0000-0000-0000-00000000000b';
  reset role;
  perform test_assert((select count(*) from audit_log) = before_n + 1, 'profile update wrote 1 audit row');
  select * into a from audit_log where id > last_id;
  perform test_assert(a.table_name = 'profiles', 'profiles table_name');
  perform test_assert(a.row_id = 'b0000000-0000-0000-0000-00000000000b', 'profiles row_id is the profile id');
  perform test_assert(a.org_id is null, 'profiles org_id is null');
  perform test_assert(a.actor_id = 'b0000000-0000-0000-0000-00000000000b', 'profiles actor is bob');
  perform test_assert(a.old_data ->> 'full_name' = 'Bob' and a.new_data ->> 'full_name' = 'Bobby', 'profiles old and new');

  -- organizations: id is the org. Created through create_organization().
  select count(*), coalesce(max(id), 0) into before_n, last_id from audit_log;
  perform test_as('f0000000-0000-0000-0000-00000000000f');           -- frank
  org := create_organization('Frank Builders');
  reset role;
  perform test_assert((select count(*) from audit_log) = before_n + 2, 'create_organization wrote 2 audit rows');
  select * into a from audit_log where id > last_id and table_name = 'organizations';
  perform test_assert(a.row_id = org and a.org_id = org, 'organizations org_id is its own id');
  perform test_assert(a.operation = 'INSERT', 'organizations INSERT');
  select * into a from audit_log where id > last_id and table_name = 'memberships';
  perform test_assert(a.org_id = org, 'memberships org_id from its column');
end $$;

-- ------------------------------------------------------ AC5 · null actor

do $$
begin
  -- The fixture ran as superuser with no JWT claim.
  perform test_assert(
    (select count(*) from audit_log
      where row_id = 'bbbbbbbb-0000-0000-0000-000000000002' and operation = 'INSERT') = 1,
    'fixture org insert audited once');
  perform test_assert(
    (select actor_id from audit_log
      where row_id = 'bbbbbbbb-0000-0000-0000-000000000002' and operation = 'INSERT') is null,
    'fixture insert has a null actor');
  perform test_assert(
    (select count(*) from audit_log where actor_id is null and table_name = 'memberships') >= 4,
    'fixture memberships audited with a null actor');
  -- Through a SECURITY DEFINER bootstrap the caller is still the actor.
  perform test_assert(
    (select bool_and(actor_id = 'f0000000-0000-0000-0000-00000000000f') from audit_log a
       join organizations o on o.id = a.org_id
      where o.name = 'Frank Builders'),
    'create_organization rows carry the caller as actor');
end $$;

-- --------------------------------------- AC6 · definer, search_path, grants

do $$
declare p pg_proc;
begin
  select * into p from pg_proc where oid = 'public.write_audit()'::regprocedure;
  perform test_assert(p.prosecdef, 'write_audit is SECURITY DEFINER');
  perform test_assert('search_path=public' = any (p.proconfig), 'write_audit sets search_path = public');
  perform test_assert(p.proacl is not null, 'write_audit has explicit privileges, not the PUBLIC default');
  perform test_assert(
    not exists (select 1 from aclexplode(p.proacl) x where x.grantee = 0),
    'no EXECUTE for PUBLIC');
  perform test_assert(not has_function_privilege('anon', 'public.write_audit()', 'EXECUTE'), 'no EXECUTE for anon');
  perform test_assert(not has_function_privilege('authenticated', 'public.write_audit()', 'EXECUTE'), 'no EXECUTE for authenticated');
  perform test_assert(not has_function_privilege('anon', 'public.block_audit_log_mutation()', 'EXECUTE'), 'guard not executable by anon');
end $$;

-- ------------------------------- AC7 · a blocked write leaves no audit row

do $$
declare before_n bigint; n int; blocked boolean := false;
begin
  select count(*) into before_n from audit_log;

  -- Under RLS a blocked UPDATE raises nothing and changes 0 rows.
  perform test_as('b0000000-0000-0000-0000-00000000000b');           -- bob, supervisor
  update memberships set role = 'owner' where user_id = 'b0000000-0000-0000-0000-00000000000b';
  get diagnostics n = row_count;
  perform test_assert(n = 0, 'supervisor self-promotion changed 0 rows');
  update profiles set full_name = 'Hacked' where id = 'a0000000-0000-0000-0000-00000000000a';
  get diagnostics n = row_count;
  perform test_assert(n = 0, 'bob changed 0 rows of alice profile');
  reset role;

  perform test_as('c0000000-0000-0000-0000-00000000000c');           -- carol, PM
  update organizations set name = 'PM rename' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  perform test_assert(n = 0, 'PM rename changed 0 rows');
  reset role;

  -- A write RLS rejects with an error is rolled back with its audit row.
  perform test_as('b0000000-0000-0000-0000-00000000000b');
  begin
    insert into memberships (org_id, user_id, role)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-00000000000e', 'owner');
  exception when insufficient_privilege then blocked := true; end;
  reset role;
  perform test_assert(blocked, 'supervisor insert into memberships blocked');

  perform test_assert((select count(*) from audit_log) = before_n, 'blocked writes left no audit row');
end $$;

rollback;
