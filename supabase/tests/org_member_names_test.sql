-- Identity & Access: org_member_names(). Issue #78, ADR-044.
begin;

-- Org A: alice owner, carol PM, bob supervisor, dave accountant, nia owner with
-- no profile row yet. Org B: eve owner.
insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-00000000000a', 'alice@secret.in'),
  ('b0000000-0000-0000-0000-00000000000b', 'bob@secret.in'),
  ('c0000000-0000-0000-0000-00000000000c', 'carol@secret.in'),
  ('d0000000-0000-0000-0000-00000000000d', 'dave@secret.in'),
  ('e0000000-0000-0000-0000-00000000000e', 'eve@secret.in'),
  ('90000000-0000-0000-0000-000000000009', 'nia@secret.in');
insert into public.organizations (id, name, created_by) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Org A', 'a0000000-0000-0000-0000-00000000000a'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Org B', 'e0000000-0000-0000-0000-00000000000e');
insert into public.memberships (org_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'owner'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000c', 'project_manager'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b', 'supervisor'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-00000000000d', 'accountant'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000009', 'owner'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-00000000000e', 'owner');
insert into public.profiles (id, full_name) values
  ('a0000000-0000-0000-0000-00000000000a', 'Alice'),
  ('b0000000-0000-0000-0000-00000000000b', 'Bob'),
  ('c0000000-0000-0000-0000-00000000000c', 'Carol'),
  ('d0000000-0000-0000-0000-00000000000d', 'Dave'),
  ('e0000000-0000-0000-0000-00000000000e', 'Eve');

do $$
declare n int; s text; u uuid;
begin
  -- owner and project manager list every member of their org, all four roles.
  foreach u in array array['a0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000c']::uuid[] loop
    perform test_as(u);
    select count(*) into n from org_member_names('aaaaaaaa-0000-0000-0000-000000000001');
    perform test_assert(n = 5, 'manager lists all 5 members of their org: ' || u);
    perform test_assert(
      (select array_agg(role::text order by role::text) from org_member_names('aaaaaaaa-0000-0000-0000-000000000001'))
        = array['accountant', 'owner', 'owner', 'project_manager', 'supervisor'],
      'every role is listed, not only supervisors');
    reset role;
  end loop;

  -- names come from profiles; a member with no profile row has a null name, listed last.
  perform test_as('a0000000-0000-0000-0000-00000000000a');
  perform test_assert((select full_name from org_member_names('aaaaaaaa-0000-0000-0000-000000000001') where user_id = 'b0000000-0000-0000-0000-00000000000b') = 'Bob', 'name comes from profiles');
  perform test_assert((select full_name is null from org_member_names('aaaaaaaa-0000-0000-0000-000000000001') where user_id = '90000000-0000-0000-0000-000000000009'), 'no profile row gives a null name');
  perform test_assert((select user_id from org_member_names('aaaaaaaa-0000-0000-0000-000000000001') order by 1 limit 1) is not null, 'rows carry the user id');
  perform test_assert((select user_id = '90000000-0000-0000-0000-000000000009' from (select * from org_member_names('aaaaaaaa-0000-0000-0000-000000000001')) t offset 4 limit 1), 'a member with no name is last');
  reset role;

  -- only those four columns exist: no email, phone or auth data.
  perform test_assert(
    (select proargnames from pg_proc where oid = 'public.org_member_names(uuid)'::regprocedure) = array['p_org_id', 'user_id', 'full_name', 'role'],
    'the function returns exactly user_id, full_name and role');
  perform test_assert(
    not exists (select 1 from org_member_names('aaaaaaaa-0000-0000-0000-000000000001') t where to_jsonb(t)::text like '%secret.in%'),
    'no email address is returned');

  -- supervisor, accountant, other org's owner, and an unknown org: the same error.
  foreach u in array array['b0000000-0000-0000-0000-00000000000b', 'd0000000-0000-0000-0000-00000000000d', 'e0000000-0000-0000-0000-00000000000e']::uuid[] loop
    s := null;
    perform test_as(u);
    begin perform * from org_member_names('aaaaaaaa-0000-0000-0000-000000000001');
    exception when others then s := sqlstate; end;
    reset role;
    perform test_assert(s = '42501', 'not permitted for ' || u || ', got ' || coalesce(s, 'no error'));
  end loop;

  s := null;
  perform test_as('a0000000-0000-0000-0000-00000000000a');
  begin perform * from org_member_names('00000000-0000-0000-0000-00000000dead');
  exception when others then s := sqlstate; end;
  perform test_assert(s = '42501', 'an unknown org gives the same error as a forbidden one');
  s := null;
  begin perform * from org_member_names(null);
  exception when others then s := sqlstate; end;
  perform test_assert(s = '42501', 'a null org gives the same error');
  reset role;

  -- eve lists only her own org.
  perform test_as('e0000000-0000-0000-0000-00000000000e');
  perform test_assert((select count(*) from org_member_names('bbbbbbbb-0000-0000-0000-000000000002')) = 1, 'owner B lists org B only');
  reset role;
end $$;

-- anon cannot run it, the function is definer with a pinned path, and it is not a table.
do $$
declare denied boolean := false;
begin
  perform test_as_anon();
  begin perform * from org_member_names('aaaaaaaa-0000-0000-0000-000000000001');
  exception when insufficient_privilege then denied := true; end;
  reset role;
  perform test_assert(denied, 'anon cannot execute org_member_names');
  perform test_assert(
    (select prosecdef and proconfig @> array['search_path=public'] from pg_proc where oid = 'public.org_member_names(uuid)'::regprocedure),
    'definer with search_path = public');
  perform test_assert(has_function_privilege('authenticated', 'public.org_member_names(uuid)', 'execute'), 'authenticated can execute it');
end $$;

rollback;
