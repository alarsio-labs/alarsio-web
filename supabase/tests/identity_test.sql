-- Identity & Access: RLS, predicates, bootstrap function. Positive and negative.
begin;

-- Fixture (as superuser). Org A: alice owner, carol PM, bob supervisor, dave accountant.
-- Org B: eve owner. frank belongs to nothing.
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
  ('bbbbbbbb-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-00000000000e', 'owner');
insert into public.profiles (id, full_name) values
  ('a0000000-0000-0000-0000-00000000000a', 'Alice'),
  ('b0000000-0000-0000-0000-00000000000b', 'Bob');

-- RLS is on for all three tables.
do $$ begin
  perform test_assert(
    (select bool_and(relrowsecurity) from pg_class
      where oid in ('public.organizations'::regclass, 'public.profiles'::regclass, 'public.memberships'::regclass)),
    'RLS enabled on all identity tables');
end $$;

-- No delete policy exists on any identity table.
do $$ begin
  perform test_assert(
    not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename in ('organizations', 'profiles', 'memberships')
      and cmd in ('DELETE', 'ALL')),
    'no delete policy');
end $$;

-- Predicates: member / non-member / cross-org.
do $$ begin
  perform test_as('b0000000-0000-0000-0000-00000000000b');           -- bob, supervisor A
  perform test_assert(is_org_member('aaaaaaaa-0000-0000-0000-000000000001'), 'bob is member of A');
  perform test_assert(not is_org_owner('aaaaaaaa-0000-0000-0000-000000000001'), 'bob is not owner of A');
  perform test_assert(not is_org_member('bbbbbbbb-0000-0000-0000-000000000002'), 'bob is not member of B');
  reset role;
  perform test_as('a0000000-0000-0000-0000-00000000000a');           -- alice, owner A
  perform test_assert(is_org_owner('aaaaaaaa-0000-0000-0000-000000000001'), 'alice is owner of A');
  perform test_assert(not is_org_owner('bbbbbbbb-0000-0000-0000-000000000002'), 'alice is not owner of B');
  reset role;
  perform test_as('f0000000-0000-0000-0000-00000000000f');           -- frank, nobody
  perform test_assert(not is_org_member('aaaaaaaa-0000-0000-0000-000000000001'), 'frank not a member');
  reset role;
end $$;

-- anon cannot call the predicates or create_organization.
do $$
declare denied int := 0;
begin
  perform test_as_anon();
  begin perform is_org_member('aaaaaaaa-0000-0000-0000-000000000001');
  exception when insufficient_privilege then denied := denied + 1; end;
  begin perform is_org_owner('aaaaaaaa-0000-0000-0000-000000000001');
  exception when insufficient_privilege then denied := denied + 1; end;
  begin perform create_organization('Nope');
  exception when insufficient_privilege then denied := denied + 1; end;
  begin perform count(*) from public.organizations;
  exception when insufficient_privilege then denied := denied + 1; end;
  reset role;
  perform test_assert(denied = 4, 'anon denied on predicates, create_organization and tables');
end $$;

-- Cross-org isolation on reads, including by guessing an id.
do $$ begin
  perform test_as('a0000000-0000-0000-0000-00000000000a');           -- alice
  perform test_assert((select count(*) from organizations) = 1, 'alice sees only org A');
  perform test_assert((select count(*) from organizations where id = 'bbbbbbbb-0000-0000-0000-000000000002') = 0, 'alice cannot fetch org B by id');
  perform test_assert((select count(*) from memberships) = 4, 'alice sees the 4 memberships of org A');
  perform test_assert((select count(*) from memberships where org_id = 'bbbbbbbb-0000-0000-0000-000000000002') = 0, 'alice cannot see org B memberships');
  reset role;
  perform test_as('f0000000-0000-0000-0000-00000000000f');           -- frank
  perform test_assert((select count(*) from organizations) = 0, 'frank sees no orgs');
  perform test_assert((select count(*) from memberships) = 0, 'frank sees no memberships');
  reset role;
end $$;

-- Non-owner roles change 0 rows on memberships, and the row is read back.
do $$
declare n int; r public.app_role; u uuid;
begin
  foreach u in array array[
    'b0000000-0000-0000-0000-00000000000b',   -- supervisor
    'c0000000-0000-0000-0000-00000000000c',   -- project_manager
    'd0000000-0000-0000-0000-00000000000d'    -- accountant
  ]::uuid[] loop
    perform test_as(u);
    update memberships set role = 'owner' where user_id = u;
    get diagnostics n = row_count;
    reset role;
    perform test_assert(n = 0, 'self-promotion changed 0 rows for ' || u);
    select role into r from memberships where user_id = u;
    perform test_assert(r <> 'owner', 'role unchanged after self-promotion attempt for ' || u);
  end loop;
end $$;

-- Non-owner cannot insert a membership (not even into their own org).
do $$
declare blocked boolean := false;
begin
  perform test_as('b0000000-0000-0000-0000-00000000000b');
  begin
    insert into memberships (org_id, user_id, role)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-00000000000f', 'supervisor');
  exception when insufficient_privilege then blocked := true; end;
  reset role;
  perform test_assert(blocked, 'supervisor insert into memberships blocked');
  perform test_assert(not exists (select 1 from memberships where user_id = 'f0000000-0000-0000-0000-00000000000f'), 'no row was created');
end $$;

-- Owner of org A cannot write into org B.
do $$
declare blocked boolean := false; n int;
begin
  perform test_as('a0000000-0000-0000-0000-00000000000a');
  begin
    insert into memberships (org_id, user_id, role)
    values ('bbbbbbbb-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-00000000000f', 'owner');
  exception when insufficient_privilege then blocked := true; end;
  update organizations set name = 'Hijacked' where id = 'bbbbbbbb-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  reset role;
  perform test_assert(blocked, 'alice cannot insert membership into org B');
  perform test_assert(n = 0, 'alice cannot update org B');
  perform test_assert((select name from organizations where id = 'bbbbbbbb-0000-0000-0000-000000000002') = 'Org B', 'org B name unchanged');
end $$;

-- Owner can manage memberships; role must be one of the four; ids are immutable.
do $$
declare n int; blocked boolean := false;
begin
  perform test_as('a0000000-0000-0000-0000-00000000000a');
  insert into memberships (org_id, user_id, role)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-00000000000f', 'supervisor');
  update memberships set role = 'accountant'
   where user_id = 'f0000000-0000-0000-0000-00000000000f';
  get diagnostics n = row_count;
  perform test_assert(n = 1, 'owner changed 1 membership');
  begin
    update memberships set user_id = 'e0000000-0000-0000-0000-00000000000e'
     where user_id = 'f0000000-0000-0000-0000-00000000000f';
  exception when insufficient_privilege then blocked := true; end;
  perform test_assert(blocked, 'user_id column is not updatable');
  reset role;
  perform test_assert((select role from memberships where user_id = 'f0000000-0000-0000-0000-00000000000f') = 'accountant', 'role change persisted');
end $$;

do $$
declare bad boolean := false;
begin
  begin
    insert into memberships (org_id, user_id, role)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-00000000000e', 'admin');
  exception when invalid_text_representation then bad := true; end;
  perform test_assert(bad, 'role "admin" rejected');
end $$;

-- Duplicate membership rejected.
do $$
declare dup boolean := false;
begin
  begin
    insert into memberships (org_id, user_id, role)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b', 'owner');
  exception when unique_violation then dup := true; end;
  perform test_assert(dup, 'duplicate (org, user) rejected');
end $$;

-- Nobody can delete from identity tables, even the owner.
do $$
declare blocked int := 0;
begin
  perform test_as('a0000000-0000-0000-0000-00000000000a');
  begin delete from memberships where user_id = 'b0000000-0000-0000-0000-00000000000b';
  exception when insufficient_privilege then blocked := blocked + 1; end;
  begin delete from organizations where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  exception when insufficient_privilege then blocked := blocked + 1; end;
  begin delete from profiles where id = 'a0000000-0000-0000-0000-00000000000a';
  exception when insufficient_privilege then blocked := blocked + 1; end;
  reset role;
  perform test_assert(blocked = 3, 'delete denied on all three tables');
  perform test_assert(exists (select 1 from memberships where user_id = 'b0000000-0000-0000-0000-00000000000b'), 'bob membership still there');
end $$;

-- organizations: owner edits, others change 0 rows, currency is immutable.
do $$
declare n int; blocked boolean := false;
begin
  perform test_as('c0000000-0000-0000-0000-00000000000c');           -- PM
  update organizations set name = 'PM rename' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  reset role;
  perform test_assert(n = 0, 'project_manager cannot rename org');
  perform test_assert((select name from organizations where id = 'aaaaaaaa-0000-0000-0000-000000000001') = 'Org A', 'name unchanged');

  perform test_as('a0000000-0000-0000-0000-00000000000a');           -- owner
  update organizations set name = 'Org A renamed' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  perform test_assert(n = 1, 'owner renames org');
  begin
    update organizations set currency = 'INR' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  exception when insufficient_privilege then blocked := true; end;
  perform test_assert(blocked, 'currency column is not updatable');
  reset role;
  perform test_assert((select name from organizations where id = 'aaaaaaaa-0000-0000-0000-000000000001') = 'Org A renamed', 'rename persisted');
end $$;

-- Direct insert into organizations is blocked; only create_organization() works.
do $$
declare blocked boolean := false;
begin
  perform test_as('f0000000-0000-0000-0000-00000000000f');
  begin
    insert into organizations (name, created_by) values ('Sneaky', 'f0000000-0000-0000-0000-00000000000f');
  exception when insufficient_privilege then blocked := true; end;
  reset role;
  perform test_assert(blocked, 'direct org insert blocked');
end $$;

-- create_organization: caller becomes first owner; bad input refused.
do $$
declare org uuid; bad int := 0;
begin
  perform test_as('f0000000-0000-0000-0000-00000000000f');
  org := create_organization('  Frank Builders  ');
  perform test_assert(is_org_owner(org), 'creator is owner');
  perform test_assert((select name from organizations where id = org) = 'Frank Builders', 'name trimmed');
  perform test_assert((select currency from organizations where id = org) = 'INR', 'currency INR');
  perform test_assert((select timezone from organizations where id = org) = 'Asia/Kolkata', 'default timezone');
  begin perform create_organization('   ');            exception when invalid_parameter_value then bad := bad + 1; end;
  begin perform create_organization('X', 'Mars/Base'); exception when invalid_parameter_value then bad := bad + 1; end;
  reset role;
  perform test_assert(bad = 2, 'blank name and bad timezone refused');
  perform test_assert((select count(*) from memberships where org_id = org) = 1, 'exactly one membership created');
end $$;

-- profiles: own row only.
do $$
declare n int; blocked boolean := false;
begin
  perform test_as('b0000000-0000-0000-0000-00000000000b');           -- bob
  perform test_assert((select count(*) from profiles) = 1, 'bob sees only his profile');
  update profiles set full_name = 'Hacked' where id = 'a0000000-0000-0000-0000-00000000000a';
  get diagnostics n = row_count;
  perform test_assert(n = 0, 'bob cannot update alice profile');
  update profiles set full_name = 'Bobby' where id = 'b0000000-0000-0000-0000-00000000000b';
  get diagnostics n = row_count;
  perform test_assert(n = 1, 'bob updates own profile');
  begin
    insert into profiles (id, full_name) values ('c0000000-0000-0000-0000-00000000000c', 'Fake Carol');
  exception when insufficient_privilege then blocked := true; end;
  perform test_assert(blocked, 'cannot create a profile for someone else');
  reset role;
  perform test_assert((select full_name from profiles where id = 'a0000000-0000-0000-0000-00000000000a') = 'Alice', 'alice profile unchanged');
  perform test_assert((select full_name from profiles where id = 'b0000000-0000-0000-0000-00000000000b') = 'Bobby', 'bob rename persisted');

  perform test_as('c0000000-0000-0000-0000-00000000000c');           -- carol creates her own
  insert into profiles (id, full_name) values ('c0000000-0000-0000-0000-00000000000c', 'Carol');
  reset role;
end $$;

rollback;
