-- Identity & Access: change_member_role(), resend_invite(), the last-owner guard and
-- accepting an invite as an existing member (BUG-03). ADR-058. Positive and negative.
begin;

-- Org A: alice owner, carol PM, bob supervisor, dave accountant. Org B: eve owner.
-- frank, gina belong to nothing.
insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-00000000000a', 'alice@x.in'),
  ('b0000000-0000-0000-0000-00000000000b', 'bob@x.in'),
  ('c0000000-0000-0000-0000-00000000000c', 'carol@x.in'),
  ('d0000000-0000-0000-0000-00000000000d', 'dave@x.in'),
  ('e0000000-0000-0000-0000-00000000000e', 'eve@x.in'),
  ('f0000000-0000-0000-0000-00000000000f', 'frank@x.in'),
  ('90000000-0000-0000-0000-000000000009', 'gina@x.in');
insert into public.organizations (id, name, created_by) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Org A', 'a0000000-0000-0000-0000-00000000000a'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Org B', 'e0000000-0000-0000-0000-00000000000e');
insert into public.memberships (org_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'owner'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000c', 'project_manager'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b', 'supervisor'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-00000000000d', 'accountant'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-00000000000e', 'owner');

-- ------------------------------------------------------------- structure
do $$ begin
  perform test_assert(
    (select bool_and(prosecdef and proconfig @> array['search_path=public']) from pg_proc
      where oid in ('public.change_member_role(uuid, uuid, public.app_role)'::regprocedure,
                    'public.resend_invite(uuid)'::regprocedure,
                    'public.memberships_keep_an_owner()'::regprocedure)),
    'new functions are security definer with search_path = public');
  perform test_assert(exists (select 1 from pg_trigger where tgname = 'memberships_keep_an_owner' and not tgisinternal),
    'last-owner guard is on memberships');
end $$;

-- ------------------------------------------------------ change_member_role
do $$
declare s text; u uuid; n int;
begin
  -- the owner promotes and demotes.
  perform test_as('a0000000-0000-0000-0000-00000000000a');
  perform change_member_role('aaaaaaaa-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b', 'project_manager');
  reset role;
  perform test_assert((select role = 'project_manager' from public.memberships where user_id = 'b0000000-0000-0000-0000-00000000000b'),
    'owner changes a role');
  perform test_assert(exists (select 1 from audit_log where table_name = 'memberships' and operation = 'UPDATE'
                               and actor_id = 'a0000000-0000-0000-0000-00000000000a'
                               and new_data ->> 'role' = 'project_manager'),
    'the change is audited with the owner as actor');

  -- PM, supervisor-turned-PM, accountant and another org's owner cannot.
  foreach u in array array['c0000000-0000-0000-0000-00000000000c', 'b0000000-0000-0000-0000-00000000000b',
                           'd0000000-0000-0000-0000-00000000000d', 'e0000000-0000-0000-0000-00000000000e']::uuid[] loop
    s := null;
    perform test_as(u);
    begin perform change_member_role('aaaaaaaa-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-00000000000d', 'owner');
    exception when others then s := sqlstate; end;
    reset role;
    perform test_assert(s = '42501', 'non-owner cannot change a role: ' || u || ' got ' || coalesce(s, 'no error'));
  end loop;
  perform test_assert((select role = 'accountant' from public.memberships where user_id = 'd0000000-0000-0000-0000-00000000000d'),
    'no refused call changed a role');

  -- a direct table update by a non-owner changes nothing (RLS).
  perform test_as('c0000000-0000-0000-0000-00000000000c');
  update public.memberships set role = 'owner' where user_id = 'c0000000-0000-0000-0000-00000000000c';
  get diagnostics n = row_count;
  reset role;
  perform test_assert(n = 0, 'a direct self-promotion changed 0 rows');

  -- a person who is not a member, a missing role, anon.
  perform test_as('a0000000-0000-0000-0000-00000000000a');
  s := null;
  begin perform change_member_role('aaaaaaaa-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-00000000000f', 'supervisor');
  exception when others then s := sqlstate; end;
  perform test_assert(s = '22023', 'a non-member is refused, got ' || coalesce(s, 'no error'));
  s := null;
  begin perform change_member_role('aaaaaaaa-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b', null);
  exception when others then s := sqlstate; end;
  reset role;
  perform test_assert(s = '22023', 'a null role is refused, got ' || coalesce(s, 'no error'));

  perform test_as_anon();
  s := null;
  begin perform change_member_role('aaaaaaaa-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b', 'owner');
  exception when insufficient_privilege then s := 'denied'; end;
  reset role;
  perform test_assert(s = 'denied', 'anon cannot call change_member_role');
end $$;

-- --------------------------------------------------------- last-owner guard
do $$
declare s text; n int;
begin
  -- alice is the only owner of Org A: she cannot demote herself, by any route.
  perform test_as('a0000000-0000-0000-0000-00000000000a');
  begin perform change_member_role('aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'supervisor');
  exception when others then s := sqlstate; end;
  perform test_assert(s = 'PT422', 'the only owner cannot demote themselves by function, got ' || coalesce(s, 'no error'));
  s := null;
  begin update public.memberships set role = 'accountant' where user_id = 'a0000000-0000-0000-0000-00000000000a';
  exception when others then s := sqlstate; end;
  reset role;
  perform test_assert(s = 'PT422', 'the only owner cannot demote themselves by direct update, got ' || coalesce(s, 'no error'));
  s := null;
  begin delete from public.memberships where user_id = 'a0000000-0000-0000-0000-00000000000a';
  exception when others then s := sqlstate; end;
  perform test_assert(s = 'PT422', 'the only owner cannot be deleted, got ' || coalesce(s, 'no error'));
  perform test_assert((select role = 'owner' from public.memberships where user_id = 'a0000000-0000-0000-0000-00000000000a'),
    'alice is still the owner');

  -- an owner may "change" an owner to owner, and with two owners one may step down.
  perform test_as('a0000000-0000-0000-0000-00000000000a');
  perform change_member_role('aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'owner');
  perform change_member_role('aaaaaaaa-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000c', 'owner');
  perform change_member_role('aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'supervisor');
  reset role;
  perform test_assert((select count(*) from public.memberships
                        where org_id = 'aaaaaaaa-0000-0000-0000-000000000001' and role = 'owner') = 1,
    'with two owners one can step down, leaving one');

  -- carol is now the only owner; alice (supervisor) is a member again and cannot act.
  perform test_as('c0000000-0000-0000-0000-00000000000c');
  s := null;
  begin perform change_member_role('aaaaaaaa-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000c', 'accountant');
  exception when others then s := sqlstate; end;
  reset role;
  perform test_assert(s = 'PT422', 'the guard follows the new sole owner, got ' || coalesce(s, 'no error'));

  -- the other org is untouched by Org A's owners.
  perform test_assert((select role = 'owner' from public.memberships where user_id = 'e0000000-0000-0000-0000-00000000000e'),
    'the other organisation keeps its owner');
end $$;

-- ------------------------------------------------------------ resend_invite
do $$
declare tok text; tok2 text; s text; u uuid; inv uuid; r uuid;
begin
  perform test_as('c0000000-0000-0000-0000-00000000000c');             -- carol, owner now
  tok := create_invite('aaaaaaaa-0000-0000-0000-000000000001', 'frank@x.in', 'supervisor');
  select id into inv from public.invites where email = 'frank@x.in';

  -- someone who is not the owner cannot resend; an unknown id gives the same answer.
  foreach u in array array['a0000000-0000-0000-0000-00000000000a', 'd0000000-0000-0000-0000-00000000000d',
                           'e0000000-0000-0000-0000-00000000000e']::uuid[] loop
    s := null;
    reset role;
    perform test_as(u);
    begin perform resend_invite(inv);
    exception when others then s := sqlstate; end;
    perform test_assert(s = '42501', 'non-owner cannot resend: ' || u || ' got ' || coalesce(s, 'no error'));
  end loop;
  s := null;
  reset role;
  perform test_as('c0000000-0000-0000-0000-00000000000c');
  begin perform resend_invite('00000000-0000-0000-0000-00000000dead');
  exception when others then s := sqlstate; end;
  perform test_assert(s = '42501', 'an unknown invite is refused like a foreign one, got ' || coalesce(s, 'no error'));
  reset role;
  perform test_assert((select revoked_at is null from public.invites where id = inv), 'refused resends revoked nothing');

  -- the owner resends: the old link stops working, the new one works.
  perform test_as('c0000000-0000-0000-0000-00000000000c');
  tok2 := resend_invite(inv);
  reset role;
  perform test_assert(tok2 ~ '^[0-9a-f]{64}$' and tok2 <> tok, 'resend returns a new token');
  perform test_assert((select revoked_at is not null and revoked_by = 'c0000000-0000-0000-0000-00000000000c'
                         from public.invites where id = inv), 'the old invite is revoked by the owner');
  perform test_assert((select count(*) from public.invites
                        where email = 'frank@x.in' and accepted_at is null and revoked_at is null and expires_at > now()) = 1,
    'exactly one open invite is left for the email');
  perform test_as('f0000000-0000-0000-0000-00000000000f');
  perform test_assert(accept_invite(tok) is null, 'the old link no longer works');
  r := accept_invite(tok2);
  reset role;
  perform test_assert(r = 'aaaaaaaa-0000-0000-0000-000000000001', 'the new link works');

  -- an accepted invite cannot be resent.
  perform test_as('c0000000-0000-0000-0000-00000000000c');
  s := null;
  select id into inv from public.invites where email = 'frank@x.in' and accepted_at is not null;
  begin perform resend_invite(inv);
  exception when others then s := sqlstate; end;
  reset role;
  perform test_assert(s = '22023', 'an accepted invite is not resent, got ' || coalesce(s, 'no error'));

  -- an expired invite can be.
  perform test_as('c0000000-0000-0000-0000-00000000000c');
  perform create_invite('aaaaaaaa-0000-0000-0000-000000000001', 'gina@x.in', 'accountant');
  reset role;
  update public.invites set created_at = now() - interval '4 days', expires_at = now() - interval '1 day'
   where email = 'gina@x.in';
  select id into inv from public.invites where email = 'gina@x.in';
  perform test_as('c0000000-0000-0000-0000-00000000000c');
  perform test_assert(resend_invite(inv) ~ '^[0-9a-f]{64}$', 'an expired invite can be resent');
  reset role;

  -- if the new invite is refused (the person has since joined), the revoke rolls back.
  insert into public.memberships (org_id, user_id, role)
  values ('aaaaaaaa-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000009', 'supervisor');
  select id into inv from public.invites where email = 'gina@x.in' and revoked_at is null;
  perform test_as('c0000000-0000-0000-0000-00000000000c');
  s := null;
  begin perform resend_invite(inv);
  exception when others then s := sqlstate; end;
  reset role;
  perform test_assert(s = 'PT409', 'resending to someone who is now a member is refused, got ' || coalesce(s, 'no error'));
  perform test_assert((select revoked_at is null from public.invites where id = inv),
    'a refused resend leaves the open invite as it was');

  perform test_as_anon();
  s := null;
  begin perform resend_invite(inv);
  exception when insufficient_privilege then s := 'denied'; end;
  reset role;
  perform test_assert(s = 'denied', 'anon cannot call resend_invite');
end $$;

-- ----------------------------------------------- accept_invite, existing member
do $$
declare tok text; s text; r uuid;
begin
  -- BUG-03: bob is a supervisor in Org A; an invite for project_manager promotes him.
  update public.memberships set role = 'supervisor' where user_id = 'b0000000-0000-0000-0000-00000000000b';
  perform test_as('c0000000-0000-0000-0000-00000000000c');
  tok := create_invite('aaaaaaaa-0000-0000-0000-000000000001', 'someone@x.in', 'project_manager');
  perform test_as('b0000000-0000-0000-0000-00000000000b');
  r := accept_invite(tok);
  reset role;
  perform test_assert(r = 'aaaaaaaa-0000-0000-0000-000000000001', 'the existing member gets the org id back');
  perform test_assert((select role = 'project_manager' from public.memberships where user_id = 'b0000000-0000-0000-0000-00000000000b'),
    'an existing member takes the invited role');
  perform test_assert((select count(*) from public.memberships where user_id = 'b0000000-0000-0000-0000-00000000000b') = 1,
    'still exactly one membership');

  -- the only owner cannot be demoted by accepting a lower invite; the invite stays unused.
  perform test_as('c0000000-0000-0000-0000-00000000000c');
  tok := create_invite('aaaaaaaa-0000-0000-0000-000000000001', 'other@x.in', 'supervisor');
  s := null;
  begin perform accept_invite(tok);
  exception when others then s := sqlstate; end;
  reset role;
  perform test_assert(s = 'PT422', 'the only owner is not demoted by an invite, got ' || coalesce(s, 'no error'));
  perform test_assert((select role = 'owner' from public.memberships where user_id = 'c0000000-0000-0000-0000-00000000000c'),
    'carol is still the owner');
  perform test_assert((select accepted_at is null from public.invites where email = 'other@x.in'),
    'the refused invite is not used up');
end $$;

rollback;
