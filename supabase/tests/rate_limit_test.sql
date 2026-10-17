-- Audit, Retention & Guards: rate_limit_counters and enforce_rate_limit().
-- Issue #19, criteria 4 and 5. Positive and negative.
--
-- now() is fixed inside one transaction, so a window is expired by backdating
-- its window_ends_at as superuser rather than by waiting.
begin;

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-00000000000a', 'alice@x'),   -- org A
  ('e0000000-0000-0000-0000-00000000000e', 'eve@x');     -- org B
insert into public.organizations (id, name, created_by) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Org A', 'a0000000-0000-0000-0000-00000000000a'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Org B', 'e0000000-0000-0000-0000-00000000000e');
insert into public.memberships (org_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'owner'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-00000000000e', 'owner');

-- ------------------------------------------------ table is closed to clients

do $$
declare r text; p text; denied int := 0;
begin
  perform test_assert(
    (select relrowsecurity from pg_class where oid = 'public.rate_limit_counters'::regclass),
    'RLS enabled on rate_limit_counters');
  foreach r in array array['anon', 'authenticated'] loop
    foreach p in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'] loop
      perform test_assert(not has_table_privilege(r, 'public.rate_limit_counters', p),
        r || ' has no ' || p || ' on rate_limit_counters');
    end loop;
  end loop;

  perform test_as('a0000000-0000-0000-0000-00000000000a');
  perform enforce_rate_limit('accept_invite', 5, interval '1 hour');
  begin perform count(*) from rate_limit_counters;
  exception when insufficient_privilege then denied := denied + 1; end;
  begin update rate_limit_counters set hits = 1;
  exception when insufficient_privilege then denied := denied + 1; end;
  begin delete from rate_limit_counters;
  exception when insufficient_privilege then denied := denied + 1; end;
  begin insert into rate_limit_counters (user_id, key, hits, window_ends_at)
        values ('e0000000-0000-0000-0000-00000000000e', 'sync_push', 1, now());
  exception when insufficient_privilege then denied := denied + 1; end;
  reset role;
  perform test_assert(denied = 4, 'an owner cannot read, edit, delete or forge counters');
end $$;

-- ------------------------------------------------ definer, search_path, grants

do $$
declare p pg_proc;
begin
  select * into p from pg_proc where oid = 'public.enforce_rate_limit(text,int,interval)'::regprocedure;
  perform test_assert(p.prosecdef, 'enforce_rate_limit is SECURITY DEFINER');
  perform test_assert('search_path=public' = any (p.proconfig), 'enforce_rate_limit sets search_path = public');
  perform test_assert(
    not exists (select 1 from aclexplode(p.proacl) x where x.grantee = 0),
    'no EXECUTE for PUBLIC');
  perform test_assert(not has_function_privilege('anon', p.oid, 'EXECUTE'), 'no EXECUTE for anon');
  perform test_assert(has_function_privilege('authenticated', p.oid, 'EXECUTE'), 'authenticated may execute');
  perform test_assert(p.prorettype = 'void'::regtype, 'returns void');
end $$;

do $$
begin
  perform test_as_anon();
  begin
    perform enforce_rate_limit('sync_push', 1, interval '1 minute');
    raise exception 'ASSERT FAILED: anon call should be refused';
  exception when insufficient_privilege then null; end;
  reset role;
end $$;


-- ----------------------------------------------- within and over the limit

do $$
declare i int; raised boolean := false; v_hint text; v_state text;
begin
  perform test_as('a0000000-0000-0000-0000-00000000000a');
  for i in 1..3 loop
    perform enforce_rate_limit('create_invite', 3, interval '1 hour');
  end loop;
  begin
    perform enforce_rate_limit('create_invite', 3, interval '1 hour');
  exception when others then
    raised := true;
    get stacked diagnostics v_state = returned_sqlstate, v_hint = pg_exception_hint;
  end;
  reset role;
  perform test_assert(raised, 'the 4th call over a limit of 3 raises');
  perform test_assert(v_state = 'PT429', 'it raises SQLSTATE PT429, got ' || coalesce(v_state, 'null'));
  perform test_assert(v_hint like 'retry after % seconds', 'the hint says when to retry, got ' || coalesce(v_hint, 'null'));
  perform test_assert(
    (select hits from rate_limit_counters
      where user_id = 'a0000000-0000-0000-0000-00000000000a' and key = 'create_invite') = 3,
    'the refused call did not count');
end $$;

-- ------------------------------------------ per user: nobody shares or resets

do $$
declare raised boolean := false; v_state text;
begin
  -- eve (org B) uses the same key with the same limit and is not affected.
  perform test_as('e0000000-0000-0000-0000-00000000000e');
  perform enforce_rate_limit('create_invite', 3, interval '1 hour');
  reset role;
  perform test_assert(
    (select hits from rate_limit_counters
      where user_id = 'e0000000-0000-0000-0000-00000000000e' and key = 'create_invite') = 1,
    'eve has her own counter');
  perform test_assert(
    (select hits from rate_limit_counters
      where user_id = 'a0000000-0000-0000-0000-00000000000a' and key = 'create_invite') = 3,
    'eve did not touch the counter of alice');

  -- Eve cannot reset alice by calling with a looser limit or a short window:
  -- both are refused, and alice is still limited.
  perform test_as('e0000000-0000-0000-0000-00000000000e');
  begin perform enforce_rate_limit('create_invite', 1000, interval '1 hour');
  exception when invalid_parameter_value then raised := true; end;
  perform test_assert(raised, 'a looser limit is refused');
  raised := false;
  begin perform enforce_rate_limit('create_invite', 3, interval '1 second');
  exception when invalid_parameter_value then raised := true; end;
  perform test_assert(raised, 'a shorter window is refused');
  reset role;

  perform test_as('a0000000-0000-0000-0000-00000000000a');
  raised := false;
  begin perform enforce_rate_limit('create_invite', 3, interval '1 hour');
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    raised := (v_state = 'PT429');
  end;
  reset role;
  perform test_assert(raised, 'alice is still over her limit after the calls of eve');
end $$;

-- ------------------------------------------------------------ the window

do $$
declare v_end timestamptz;
begin
  -- A later caller does not move the window an earlier call opened.
  select window_ends_at into v_end from rate_limit_counters
   where user_id = 'e0000000-0000-0000-0000-00000000000e' and key = 'create_invite';
  perform test_assert(v_end = now() + interval '1 hour', 'the window opened 1 hour ahead');
  perform test_as('e0000000-0000-0000-0000-00000000000e');
  perform enforce_rate_limit('create_invite', 3, interval '1 day');
  reset role;
  perform test_assert(
    (select window_ends_at from rate_limit_counters
      where user_id = 'e0000000-0000-0000-0000-00000000000e' and key = 'create_invite') = v_end,
    'a later call with a longer window does not move it');

  -- Once the window has ended the count starts again.
  update rate_limit_counters set window_ends_at = now() - interval '1 second'
   where user_id = 'a0000000-0000-0000-0000-00000000000a' and key = 'create_invite';
  perform test_as('a0000000-0000-0000-0000-00000000000a');
  perform enforce_rate_limit('create_invite', 3, interval '1 hour');
  reset role;
  perform test_assert(
    (select hits from rate_limit_counters
      where user_id = 'a0000000-0000-0000-0000-00000000000a' and key = 'create_invite') = 1,
    'an expired window starts again at 1');
end $$;

-- ------------------------------------------------------- bad input refused

do $$
declare refused int := 0; n_before bigint;
begin
  select count(*) into n_before from rate_limit_counters;
  perform test_as('a0000000-0000-0000-0000-00000000000a');
  begin perform enforce_rate_limit('not_a_key', 5, interval '1 minute');
  exception when invalid_parameter_value then refused := refused + 1; end;
  begin perform enforce_rate_limit(null, 5, interval '1 minute');
  exception when invalid_parameter_value then refused := refused + 1; end;
  begin perform enforce_rate_limit('sync_push', 0, interval '1 minute');
  exception when invalid_parameter_value then refused := refused + 1; end;
  begin perform enforce_rate_limit('sync_push', null, interval '1 minute');
  exception when invalid_parameter_value then refused := refused + 1; end;
  begin perform enforce_rate_limit('sync_push', 121, interval '1 minute');
  exception when invalid_parameter_value then refused := refused + 1; end;
  begin perform enforce_rate_limit('sync_push', 120, interval '59 seconds');
  exception when invalid_parameter_value then refused := refused + 1; end;
  begin perform enforce_rate_limit('sync_push', 120, interval '2 days');
  exception when invalid_parameter_value then refused := refused + 1; end;
  begin perform enforce_rate_limit('sync_push', 120, null);
  exception when invalid_parameter_value then refused := refused + 1; end;
  reset role;
  perform test_assert(refused = 8, 'every bad argument refused, got ' || refused);
  perform test_assert((select count(*) from rate_limit_counters) = n_before, 'refused calls wrote no counter');

  -- The agreed setting for sync_push works.
  perform test_as('a0000000-0000-0000-0000-00000000000a');
  perform enforce_rate_limit('sync_push', 120, interval '1 minute');
  reset role;
end $$;

-- No signed-in user: refused, nothing written. (Superuser, no JWT claim.)
do $$
declare n_before bigint; raised boolean := false;
begin
  perform set_config('request.jwt.claim.sub', '', true);
  select count(*) into n_before from rate_limit_counters;
  begin perform enforce_rate_limit('sync_push', 120, interval '1 minute');
  exception when invalid_authorization_specification then raised := true; end;
  perform test_assert(raised, 'a call with no auth.uid() is refused');
  perform test_assert((select count(*) from rate_limit_counters) = n_before, 'and writes nothing');
end $$;

-- The increment belongs to the caller's transaction: an aborted batch does not
-- use up the limit.
do $$
begin
  perform test_as('e0000000-0000-0000-0000-00000000000e');
  begin
    perform enforce_rate_limit('accept_invite', 10, interval '1 hour');
    raise exception 'batch aborted' using errcode = 'P0001';
  exception when raise_exception then null; end;
  reset role;
  perform test_assert(
    not exists (select 1 from rate_limit_counters
                 where user_id = 'e0000000-0000-0000-0000-00000000000e' and key = 'accept_invite'),
    'an aborted transaction leaves no count');
end $$;

rollback;
