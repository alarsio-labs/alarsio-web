-- Identity & Access: invites, create_invite(), accept_invite(), revoke_invite().
-- Issue #25, ADR-019. Positive and negative.
begin;

-- Org A: alice owner, carol PM, bob supervisor, dave accountant.
-- Org B: eve owner. frank, gina, hank, ivy belong to nothing.
insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-00000000000a', 'alice@x.in'),
  ('b0000000-0000-0000-0000-00000000000b', 'bob@x.in'),
  ('c0000000-0000-0000-0000-00000000000c', 'carol@x.in'),
  ('d0000000-0000-0000-0000-00000000000d', 'dave@x.in'),
  ('e0000000-0000-0000-0000-00000000000e', 'eve@x.in'),
  ('f0000000-0000-0000-0000-00000000000f', 'frank@x.in'),
  ('90000000-0000-0000-0000-000000000009', 'gina@x.in'),
  ('80000000-0000-0000-0000-000000000008', 'hank@x.in'),
  ('70000000-0000-0000-0000-000000000007', 'ivy@x.in');
insert into public.organizations (id, name, created_by) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Org A', 'a0000000-0000-0000-0000-00000000000a'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Org B', 'e0000000-0000-0000-0000-00000000000e');
insert into public.memberships (org_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'owner'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000c', 'project_manager'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b', 'supervisor'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-00000000000d', 'accountant'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-00000000000e', 'owner');

create temp table t (name text primary key, token text);
grant all on t to authenticated;

-- ------------------------------------------------------------- structure
do $$ begin
  perform test_assert((select relrowsecurity from pg_class where oid = 'public.invites'::regclass), 'RLS on invites');
  perform test_assert(not exists (select 1 from pg_policies where tablename = 'invites' and cmd <> 'SELECT'), 'invites has only a select policy');
  perform test_assert(exists (select 1 from pg_trigger where tgname = 'invites_audit' and not tgisinternal), 'audit trigger on invites');
  perform test_assert(
    (select bool_and(prosecdef and proconfig @> array['search_path=public']) from pg_proc
      where oid in ('public.create_invite(uuid, text, public.app_role)'::regprocedure,
                    'public.accept_invite(text)'::regprocedure,
                    'public.revoke_invite(uuid)'::regprocedure)),
    'invite functions are security definer with search_path = public');
end $$;

-- ---------------------------------------------------------- create_invite
do $$
declare tok text; s text; u uuid;
begin
  perform test_as('a0000000-0000-0000-0000-00000000000a');            -- alice, owner
  tok := create_invite('aaaaaaaa-0000-0000-0000-000000000001', '  Frank@X.in ', 'supervisor');
  insert into t values ('frank', tok);
  reset role;
  perform test_assert(tok ~ '^[0-9a-f]{64}$', 'token is 64 hex characters');
  perform test_assert(
    (select email = 'frank@x.in' and role = 'supervisor'
            and expires_at between now() + interval '71 hours 59 minutes' and now() + interval '72 hours 1 minute'
            and token_hash = sha256(convert_to(tok, 'UTF8'))
            and token_hash <> convert_to(tok, 'UTF8')
       from public.invites where email = 'frank@x.in'),
    'invite stored with normalised email, 72-hour expiry and only a hash of the token');

  -- I3: an owner may invite another owner.
  perform test_as('a0000000-0000-0000-0000-00000000000a');
  insert into t values ('gina', create_invite('aaaaaaaa-0000-0000-0000-000000000001', 'gina@x.in', 'owner'));
  reset role;
  perform test_assert(exists (select 1 from public.invites where email = 'gina@x.in' and role = 'owner'), 'owner can invite an owner');

  -- PM, supervisor, accountant and the other org's owner cannot invite.
  foreach u in array array['c0000000-0000-0000-0000-00000000000c', 'b0000000-0000-0000-0000-00000000000b',
                           'd0000000-0000-0000-0000-00000000000d', 'e0000000-0000-0000-0000-00000000000e']::uuid[] loop
    s := null;
    perform test_as(u);
    begin perform create_invite('aaaaaaaa-0000-0000-0000-000000000001', 'nope@x.in', 'supervisor');
    exception when others then s := sqlstate; end;
    reset role;
    perform test_assert(s = '42501', 'non-owner cannot invite, got ' || coalesce(s, 'no error') || ' for ' || u);
  end loop;
  perform test_assert(not exists (select 1 from public.invites where email = 'nope@x.in'), 'no invite created by a refused call');

  -- bad email, existing member, second open invite.
  perform test_as('a0000000-0000-0000-0000-00000000000a');
  s := null;
  begin perform create_invite('aaaaaaaa-0000-0000-0000-000000000001', 'not-an-email', 'supervisor');
  exception when others then s := sqlstate; end;
  perform test_assert(s = '22023', 'invalid email refused, got ' || coalesce(s, 'no error'));
  s := null;
  begin perform create_invite('aaaaaaaa-0000-0000-0000-000000000001', 'BOB@x.in', 'owner');
  exception when others then s := sqlstate; end;
  perform test_assert(s = '23505', 'existing member refused, got ' || coalesce(s, 'no error'));
  s := null;
  begin perform create_invite('aaaaaaaa-0000-0000-0000-000000000001', 'frank@x.in', 'accountant');
  exception when others then s := sqlstate; end;
  perform test_assert(s = '23505', 'second open invite for the same email refused, got ' || coalesce(s, 'no error'));
  reset role;

  -- the same email may be invited by another organisation.
  perform test_as('e0000000-0000-0000-0000-00000000000e');
  perform create_invite('bbbbbbbb-0000-0000-0000-000000000002', 'frank@x.in', 'supervisor');
  reset role;
  perform test_assert((select count(*) from public.invites where email = 'frank@x.in') = 2, 'another org may invite the same email');
end $$;

-- ---------------------------------------------------------- reading invites
do $$
declare denied boolean := false; n int;
begin
  perform test_as('a0000000-0000-0000-0000-00000000000a');
  perform test_assert((select count(*) from public.invites) = 2, 'owner A sees only org A invites');
  begin perform token_hash from public.invites limit 1;
  exception when insufficient_privilege then denied := true; end;
  perform test_assert(denied, 'token_hash is not readable by any client');
  denied := false;
  begin insert into public.invites (org_id, email, role, token_hash, expires_at, created_by)
        values ('aaaaaaaa-0000-0000-0000-000000000001', 'x@x.in', 'owner', sha256('x'), now() + interval '1 day', 'a0000000-0000-0000-0000-00000000000a');
  exception when insufficient_privilege then denied := true; end;
  perform test_assert(denied, 'direct insert into invites is denied');
  denied := false;
  begin delete from public.invites;
  exception when insufficient_privilege then denied := true; end;
  perform test_assert(denied, 'delete on invites is denied');
  reset role;

  perform test_as('c0000000-0000-0000-0000-00000000000c');            -- PM
  perform test_assert((select count(*) from public.invites) = 0, 'project_manager sees no invites');
  reset role;
  perform test_as('b0000000-0000-0000-0000-00000000000b');            -- supervisor
  perform test_assert((select count(*) from public.invites) = 0, 'supervisor sees no invites');
  reset role;
  perform test_as('e0000000-0000-0000-0000-00000000000e');            -- owner B
  perform test_assert((select count(*) from public.invites where org_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 0, 'owner B sees no org A invites');
  reset role;
end $$;

-- ---------------------------------------------------------- accept_invite
do $$
declare r uuid; tok text;
begin
  select token into tok from t where name = 'frank';

  -- I1: the link alone grants access, whatever email the acceptor has.
  perform test_as('70000000-0000-0000-0000-000000000007');            -- ivy, not frank
  r := accept_invite(tok);
  reset role;
  perform test_assert(r = 'aaaaaaaa-0000-0000-0000-000000000001', 'any signed-in holder of the link joins');
  perform test_assert(
    (select role = 'supervisor' from public.memberships
      where user_id = '70000000-0000-0000-0000-000000000007' and org_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
    'membership created with the invited role');
  perform test_assert(
    (select accepted_by = '70000000-0000-0000-0000-000000000007' and accepted_at is not null
       from public.invites where token_hash = sha256(convert_to(tok, 'UTF8'))),
    'invite marked accepted by the caller');

  -- a token works once: same user again, then another user.
  perform test_as('70000000-0000-0000-0000-000000000007');
  r := accept_invite(tok);
  reset role;
  perform test_assert(r is null, 'accepting a used invite again returns null');
  perform test_assert((select count(*) from public.memberships where user_id = '70000000-0000-0000-0000-000000000007') = 1, 'still exactly one membership');
  perform test_as('f0000000-0000-0000-0000-00000000000f');
  r := accept_invite(tok);
  reset role;
  perform test_assert(r is null, 'a used invite returns null for someone else');
  perform test_assert(not exists (select 1 from public.memberships where user_id = 'f0000000-0000-0000-0000-00000000000f'), 'no membership from a used invite');
end $$;

-- expired, revoked, unknown and malformed tokens all return null.
do $$
declare tok_exp text; tok_rev text; inv uuid; s text; r uuid;
begin
  perform test_as('a0000000-0000-0000-0000-00000000000a');
  tok_exp := create_invite('aaaaaaaa-0000-0000-0000-000000000001', 'late@x.in', 'supervisor');
  tok_rev := create_invite('aaaaaaaa-0000-0000-0000-000000000001', 'gone@x.in', 'supervisor');
  reset role;
  -- I2: age the first invite past its 72 hours (as superuser).
  update public.invites set created_at = now() - interval '73 hours', expires_at = now() - interval '1 minute'
   where email = 'late@x.in';

  -- revoke: non-owner, other org owner and unknown id get the same error.
  select id into inv from public.invites where email = 'gone@x.in';
  perform test_as('c0000000-0000-0000-0000-00000000000c');
  s := null; begin perform revoke_invite(inv); exception when others then s := sqlstate; end;
  reset role;
  perform test_assert(s = '42501', 'project_manager cannot revoke');
  perform test_as('e0000000-0000-0000-0000-00000000000e');
  s := null; begin perform revoke_invite(inv); exception when others then s := sqlstate; end;
  perform test_assert(s = '42501', 'other org owner cannot revoke');
  s := null; begin perform revoke_invite('00000000-0000-0000-0000-00000000dead'); exception when others then s := sqlstate; end;
  perform test_assert(s = '42501', 'unknown invite gives the same error');
  reset role;
  perform test_as('a0000000-0000-0000-0000-00000000000a');
  perform revoke_invite(inv);
  reset role;
  perform test_assert((select revoked_by = 'a0000000-0000-0000-0000-00000000000a' from public.invites where id = inv), 'owner revoked the invite');

  perform test_as('f0000000-0000-0000-0000-00000000000f');
  perform test_assert(accept_invite(tok_exp) is null, 'expired invite returns null');
  perform test_assert(accept_invite(tok_rev) is null, 'revoked invite returns null');
  perform test_assert(accept_invite(repeat('0', 64)) is null, 'unknown token returns null');
  perform test_assert(accept_invite('short') is null, 'malformed token returns null');
  perform test_assert(accept_invite(null) is null, 'null token returns null');
  reset role;
  perform test_assert(not exists (select 1 from public.memberships where user_id = 'f0000000-0000-0000-0000-00000000000f'), 'no membership from any refused token');

  -- after a revoke the email can be invited again.
  perform test_as('a0000000-0000-0000-0000-00000000000a');
  perform create_invite('aaaaaaaa-0000-0000-0000-000000000001', 'gone@x.in', 'supervisor');
  perform create_invite('aaaaaaaa-0000-0000-0000-000000000001', 'late@x.in', 'supervisor');
  reset role;
  perform test_assert((select count(*) from public.invites where email in ('gone@x.in', 'late@x.in')) = 4, 'a revoked or expired invite does not block a new one');
end $$;

-- an existing member accepting keeps their role; the invite is used up.
do $$
declare tok text; r uuid;
begin
  -- gina was invited as owner; make her a supervisor first (fixture, superuser).
  insert into public.memberships (org_id, user_id, role)
  values ('aaaaaaaa-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000009', 'supervisor');
  select token into tok from t where name = 'gina';
  perform test_as('90000000-0000-0000-0000-000000000009');
  r := accept_invite(tok);
  reset role;
  perform test_assert(r = 'aaaaaaaa-0000-0000-0000-000000000001', 'existing member gets the org id back');
  perform test_assert(
    (select role = 'supervisor' from public.memberships where user_id = '90000000-0000-0000-0000-000000000009'),
    'existing role is not changed by an invite');
  perform test_assert(
    (select accepted_at is not null from public.invites where email = 'gina@x.in'), 'the invite is used up');
end $$;

-- ------------------------------------------------------------- rate limit
-- Refusals return null instead of raising, so the counter is not rolled back
-- and guessing tokens is counted.
do $$
declare i int; s text;
begin
  perform test_as('80000000-0000-0000-0000-000000000008');            -- hank
  for i in 1..10 loop
    perform accept_invite(repeat('f', 64));
  end loop;
  begin perform accept_invite(repeat('f', 64));
  exception when others then s := sqlstate; end;
  reset role;
  perform test_assert(s = 'PT429', 'the 11th accept attempt in an hour is rate limited, got ' || coalesce(s, 'no error'));
end $$;

-- ------------------------------------------------------------------ anon
do $$
declare denied int := 0;
begin
  perform test_as_anon();
  begin perform create_invite('aaaaaaaa-0000-0000-0000-000000000001', 'a@x.in', 'owner');
  exception when insufficient_privilege then denied := denied + 1; end;
  begin perform accept_invite(repeat('0', 64));
  exception when insufficient_privilege then denied := denied + 1; end;
  begin perform revoke_invite('00000000-0000-0000-0000-00000000dead');
  exception when insufficient_privilege then denied := denied + 1; end;
  begin perform count(*) from public.invites;
  exception when insufficient_privilege then denied := denied + 1; end;
  reset role;
  perform test_assert(denied = 4, 'anon denied on all invite functions and the table');
end $$;

-- ------------------------------------------------------------------ audit
do $$ begin
  perform test_assert(
    (select count(*) from audit_log where table_name = 'invites' and operation = 'INSERT') =
    (select count(*) from public.invites),
    'one audit row per invite created');
  perform test_assert(
    exists (select 1 from audit_log where table_name = 'invites' and operation = 'UPDATE'
             and actor_id = '70000000-0000-0000-0000-000000000007'),
    'accepting is audited with the acceptor as actor');
end $$;

rollback;
