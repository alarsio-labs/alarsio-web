-- Audit, Retention & Guards: purge_log, the retention floor and
-- purge_audit_log(). Issue #19, criteria 1 to 3. Positive and negative.
--
-- now() is fixed inside one transaction, so old rows are made by inserting
-- audit_log rows with a backdated occurred_at (as superuser).
begin;

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-00000000000a', 'alice@x');
insert into public.organizations (id, name, created_by) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Org A', 'a0000000-0000-0000-0000-00000000000a');
insert into public.memberships (org_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'owner');

-- Four rows 4 years old, one 2 years old, one 3 years and 1 day old.
insert into public.audit_log (table_name, row_id, operation, new_data, occurred_at)
select 'memberships', gen_random_uuid(), 'INSERT', '{}', now() - interval '4 years'
  from generate_series(1, 4);
insert into public.audit_log (table_name, row_id, operation, new_data, occurred_at) values
  ('memberships', gen_random_uuid(), 'INSERT', '{"age":"2y"}', now() - interval '2 years'),
  ('memberships', gen_random_uuid(), 'INSERT', '{"age":"3y1d"}', now() - interval '3 years 1 day');

-- ------------------------------------------------ AC1 · purge_log is closed

do $$
declare r text; p text; denied int := 0; blocked int := 0;
begin
  perform test_assert(
    (select relrowsecurity from pg_class where oid = 'public.purge_log'::regclass),
    'RLS enabled on purge_log');
  perform test_assert(
    not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'purge_log'),
    'purge_log has no policies');
  foreach r in array array['anon', 'authenticated'] loop
    foreach p in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'] loop
      perform test_assert(not has_table_privilege(r, 'public.purge_log', p),
        r || ' has no ' || p || ' on purge_log');
    end loop;
  end loop;

  perform test_as('a0000000-0000-0000-0000-00000000000a');
  begin perform count(*) from purge_log;
  exception when insufficient_privilege then denied := denied + 1; end;
  begin insert into purge_log (table_name, purged_before, retention_floor, rows_purged, reason)
        values ('audit_log', now() - interval '5 years', interval '3 years', 0, 'forged by the owner');
  exception when insufficient_privilege then denied := denied + 1; end;
  reset role;
  perform test_assert(denied = 2, 'an owner can neither read nor write purge_log');

  -- Append-only for everyone, including the table owner.
  insert into purge_log (table_name, purged_before, retention_floor, rows_purged, reason)
  values ('audit_log', now() - interval '5 years', interval '3 years', 0, 'fixture row for guard test');
  begin update purge_log set rows_purged = 99;
  exception when insufficient_privilege then
    if sqlerrm like '%append-only%' then blocked := blocked + 1; end if; end;
  begin delete from purge_log;
  exception when insufficient_privilege then
    if sqlerrm like '%append-only%' then blocked := blocked + 1; end if; end;
  begin truncate purge_log;
  exception when insufficient_privilege then
    if sqlerrm like '%append-only%' then blocked := blocked + 1; end if; end;
  perform test_assert(blocked = 3, 'update, delete and truncate of purge_log blocked');
  perform test_assert((select count(*) from purge_log) = 1 and (select rows_purged from purge_log) = 0,
    'purge_log row unchanged');
end $$;

-- A row that claims a purge inside the floor cannot exist, even if inserted directly.
do $$
declare refused boolean := false;
begin
  begin
    insert into purge_log (table_name, purged_before, retention_floor, rows_purged, reason)
    values ('audit_log', now() - interval '1 year', interval '3 years', 0, 'inside the floor');
  exception when check_violation then refused := true; end;
  perform test_assert(refused, 'purge_log rejects a cutoff inside its own floor');
end $$;

-- ------------------------------------------- the floor and the function

do $$
declare p pg_proc;
begin
  perform test_assert(audit_retention_floor() = interval '3 years', 'the floor is 3 years');
  perform test_assert(not has_function_privilege('authenticated', 'public.audit_retention_floor()', 'EXECUTE'),
    'authenticated cannot execute the floor helper');

  select * into p from pg_proc
   where oid = 'public.purge_audit_log(timestamptz,text)'::regprocedure;
  perform test_assert(p.prosecdef, 'purge_audit_log is SECURITY DEFINER');
  perform test_assert('search_path=public' = any (p.proconfig), 'purge_audit_log sets search_path = public');
  perform test_assert(not exists (select 1 from aclexplode(p.proacl) x where x.grantee = 0),
    'no EXECUTE for PUBLIC');
  perform test_assert(not has_function_privilege('anon', p.oid, 'EXECUTE'), 'no EXECUTE for anon');
  perform test_assert(not has_function_privilege('authenticated', p.oid, 'EXECUTE'),
    'no EXECUTE for authenticated');
end $$;

do $$
declare denied int := 0; n_audit bigint; n_log bigint;
begin
  select count(*) into n_audit from audit_log;
  select count(*) into n_log from purge_log;
  perform test_as('a0000000-0000-0000-0000-00000000000a');
  begin perform purge_audit_log(now() - interval '10 years', 'owner tries to purge');
  exception when insufficient_privilege then denied := denied + 1; end;
  reset role;
  perform test_as_anon();
  begin perform purge_audit_log(now() - interval '10 years', 'anon tries to purge');
  exception when insufficient_privilege then denied := denied + 1; end;
  reset role;
  perform test_assert(denied = 2, 'owner and anon cannot call the purge');
  perform test_assert((select count(*) from audit_log) = n_audit, 'nothing was deleted');
  perform test_assert((select count(*) from purge_log) = n_log, 'nothing was logged');
end $$;

-- ------------------------------------- AC2 and AC3 · refused purges write nothing

do $$
declare refused int := 0; n_audit bigint; n_log bigint;
begin
  select count(*) into n_audit from audit_log;
  select count(*) into n_log from purge_log;

  begin perform purge_audit_log(now() - interval '2 years', 'cutoff well inside the floor');
  exception when invalid_parameter_value then
    if sqlerrm like '%retention floor%' then refused := refused + 1; end if; end;
  begin perform purge_audit_log(now() - interval '3 years' + interval '1 second', 'one second inside the floor');
  exception when invalid_parameter_value then
    if sqlerrm like '%retention floor%' then refused := refused + 1; end if; end;
  begin perform purge_audit_log(now() + interval '1 day', 'a cutoff in the future');
  exception when invalid_parameter_value then refused := refused + 1; end;
  begin perform purge_audit_log(null, 'no cutoff given at all');
  exception when invalid_parameter_value then refused := refused + 1; end;
  begin perform purge_audit_log(now() - interval '10 years', null);
  exception when invalid_parameter_value then refused := refused + 1; end;
  begin perform purge_audit_log(now() - interval '10 years', '   short   ');
  exception when invalid_parameter_value then refused := refused + 1; end;

  perform test_assert(refused = 6, 'every refused purge raised the right error, got ' || refused);
  perform test_assert((select count(*) from audit_log) = n_audit, 'refused purges deleted nothing');
  perform test_assert((select count(*) from purge_log) = n_log, 'refused purges wrote no purge_log row');
end $$;

-- ---------------------------------------------------- a purge that succeeds

do $$
declare n_audit bigint; n_log bigint; v_rows bigint; l public.purge_log;
begin
  select count(*) into n_audit from audit_log;
  select count(*) into n_log from purge_log;

  -- Exactly at the floor: the 3y1d and the four 4y rows go, the 2y row stays.
  v_rows := purge_audit_log(now() - interval '3 years', '  yearly retention run  ');
  perform test_assert(v_rows = 5, 'purged 5 rows, got ' || v_rows);
  perform test_assert((select count(*) from audit_log) = n_audit - 5, 'audit_log lost exactly 5 rows');
  perform test_assert(not exists (select 1 from audit_log where occurred_at < now() - interval '3 years'),
    'nothing older than the floor remains');
  perform test_assert(exists (select 1 from audit_log where new_data ->> 'age' = '2y'),
    'the row inside the floor survived');
  perform test_assert(exists (select 1 from audit_log where table_name = 'organizations'),
    'recent rows survived');

  perform test_assert((select count(*) from purge_log) = n_log + 1, 'exactly one purge_log row');
  select * into l from purge_log order by id desc limit 1;
  perform test_assert(l.table_name = 'audit_log', 'logs the table');
  perform test_assert(l.rows_purged = 5, 'logs the row count');
  perform test_assert(l.purged_before = now() - interval '3 years', 'logs the cutoff');
  perform test_assert(l.retention_floor = interval '3 years', 'logs the floor in force');
  perform test_assert(l.reason = 'yearly retention run', 'logs the trimmed reason');
  perform test_assert(l.purged_by is null, 'no signed-in user, so purged_by is null');
  perform test_assert(l.purged_by_role is not null, 'logs the database role');
  perform test_assert(l.purged_at = now(), 'logs when');

  -- The permission to delete ended with the purge.
  perform test_assert(current_setting('alarsio.audit_purge', true) = 'off', 'the purge switch is off again');
end $$;

-- A purge that matches nothing still writes exactly one row.
do $$
declare n_log bigint; v_rows bigint;
begin
  select count(*) into n_log from purge_log;
  v_rows := purge_audit_log(now() - interval '3 years', 'second run with nothing left');
  perform test_assert(v_rows = 0, 'purged 0 rows');
  perform test_assert((select count(*) from purge_log) = n_log + 1, 'still exactly one purge_log row');
  perform test_assert((select rows_purged from purge_log order by id desc limit 1) = 0, 'it records 0 rows');
end $$;

-- A signed-in caller is recorded when one runs it (for example an operator
-- session that carries a user).
do $$
begin
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000a', true);
  perform purge_audit_log(now() - interval '3 years', 'run carrying a signed-in user');
  perform set_config('request.jwt.claim.sub', '', true);
  perform test_assert(
    (select purged_by from purge_log order by id desc limit 1) = 'a0000000-0000-0000-0000-00000000000a',
    'purged_by records auth.uid()');
end $$;

-- ---------------------- the guard on audit_log is still shut except via the purge

do $$
declare blocked int := 0; n bigint;
begin
  insert into public.audit_log (table_name, row_id, operation, new_data, occurred_at)
  values ('memberships', gen_random_uuid(), 'INSERT', '{}', now() - interval '5 years');
  select count(*) into n from audit_log;

  -- Old row, no purge in progress: still refused.
  begin delete from audit_log where occurred_at < now() - interval '4 years';
  exception when insufficient_privilege then
    if sqlerrm like '%append-only%' then blocked := blocked + 1; end if; end;

  -- Switch on, young row: the floor in the guard still refuses.
  perform set_config('alarsio.audit_purge', 'on', true);
  begin delete from audit_log where occurred_at > now() - interval '1 year';
  exception when insufficient_privilege then
    if sqlerrm like '%append-only%' then blocked := blocked + 1; end if; end;

  -- Switch on never opens UPDATE or TRUNCATE.
  begin update audit_log set table_name = 'tampered';
  exception when insufficient_privilege then
    if sqlerrm like '%append-only%' then blocked := blocked + 1; end if; end;
  begin truncate audit_log;
  exception when insufficient_privilege then
    if sqlerrm like '%append-only%' then blocked := blocked + 1; end if; end;
  perform set_config('alarsio.audit_purge', 'off', true);

  perform test_assert(blocked = 4, 'the guard held in all four cases, got ' || blocked);
  perform test_assert((select count(*) from audit_log) = n, 'no row was lost');
  perform test_assert(not exists (select 1 from audit_log where table_name = 'tampered'), 'no row tampered');
end $$;

rollback;
