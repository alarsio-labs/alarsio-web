-- Audit, Retention & Guards: the CLAUDE.md non-negotiables, checked on the
-- migrated schema. Issue #72. ADR-024.
--
-- Reads the catalog after every migration, so every module is covered:
--   * every table has row level security on;
--   * every view is security_invoker, and there are no materialized views
--     (they cannot be invoker, so they would bypass RLS) and no foreign tables
--     (Postgres cannot enforce RLS on them);
--   * every SECURITY DEFINER function pins search_path = public, and neither
--     anon nor PUBLIC may execute it;
--   * no client (anon, authenticated) may DELETE or TRUNCATE a table;
--   * anon has no privilege on any table or view, nor on any column.
-- Audit coverage has its own suite, audit_coverage_test.sql.
begin;

create function pg_temp.schema_guard_violations()
returns setof text
language sql
stable
as $$
  with rels as (
    select c.oid, c.relname, c.relkind, c.relrowsecurity, c.reloptions
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('r', 'p', 'v', 'm', 'f')
  ),
  definers as (
    select p.oid, p.proname, p.proconfig, p.proacl,
           pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosecdef
  )
  select format('table public.%I does not have row level security enabled', relname)
    from rels
   where relkind in ('r', 'p') and not relrowsecurity
  union all
  select format('view public.%I is not security_invoker', relname)
    from rels
   where relkind = 'v'
     and not exists (select 1 from unnest(coalesce(reloptions, '{}')) as o
                      where lower(o) in ('security_invoker=true', 'security_invoker=on',
                                         'security_invoker=1', 'security_invoker=yes'))
  union all
  select format('materialized view public.%I bypasses RLS; use a security_invoker view', relname)
    from rels
   where relkind = 'm'
  union all
  select format('foreign table public.%I cannot have RLS; keep it out of public', relname)
    from rels
   where relkind = 'f'
  union all
  select format('security definer function public.%I(%s) does not set search_path = public', proname, args)
    from definers
   where not ('search_path=public' = any (coalesce(proconfig, '{}')))
  union all
  select format('security definer function public.%I(%s) is executable by %s', proname, args, who)
    from definers,
         lateral (
           select 'PUBLIC' as who
            where proacl is null   -- never revoked: PUBLIC keeps the default EXECUTE
               or exists (select 1 from aclexplode(proacl) a
                           where a.grantee = 0 and a.privilege_type = 'EXECUTE')
           union all
           select 'anon'
            where has_function_privilege('anon', oid, 'EXECUTE')
         ) as w
  union all
  select format('table public.%I lets %s %s', relname, r.rolname, priv)
    from rels,
         lateral (values ('anon'), ('authenticated')) as r (rolname),
         lateral (values ('DELETE'), ('TRUNCATE')) as pr (priv)
   where relkind in ('r', 'p')
     and has_table_privilege(r.rolname, oid, priv)
  union all
  select format('%s public.%I grants anon %s', case when relkind = 'v' then 'view' else 'table' end,
                relname, priv)
    from rels,
         lateral (values ('SELECT'), ('INSERT'), ('UPDATE'), ('REFERENCES'), ('TRIGGER')) as pr (priv)
   where relkind in ('r', 'p', 'v')
     and (has_table_privilege('anon', oid, priv)
          or (priv in ('SELECT', 'INSERT', 'UPDATE', 'REFERENCES')
              and has_any_column_privilege('anon', oid, priv)))
  order by 1;
$$;

-- ------------------------------------------------- the migrated schema

do $$
declare v text;
begin
  select string_agg(x, '; ') into v from pg_temp.schema_guard_violations() as x;
  perform test_assert(v is null, 'schema guards: ' || coalesce(v, ''));

  -- The guard is looking at something.
  perform test_assert((select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
                        where n.nspname = 'public' and c.relkind = 'r') >= 20,
    'the guard sees the tables on main at #72');
  perform test_assert((select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
                        where n.nspname = 'public' and c.relkind = 'v') >= 6,
    'the guard sees the views on main at #72');
  perform test_assert((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                        where n.nspname = 'public' and p.prosecdef) >= 20,
    'the guard sees the security definer functions on main at #72');
end $$;

-- ---------------------------------------------- the guard can fail
-- Each probe breaks one rule, and the guard must name it and nothing else.
-- The shim grants everything to the client roles by default, as a hosted
-- project does, so each probe revokes first, like a real migration, and then
-- grants only what its rule needs.

-- The usual mistake: RLS on, but the migration forgot to revoke the defaults.
create table public.guard_probe_forgot_revoke (id uuid primary key);
alter table public.guard_probe_forgot_revoke enable row level security;

-- No RLS.
create table public.guard_probe_no_rls (id uuid primary key);
revoke all on public.guard_probe_no_rls from public, anon, authenticated;

-- RLS on, but clients may delete or truncate.
create table public.guard_probe_deletable (id uuid primary key);
alter table public.guard_probe_deletable enable row level security;
revoke all on public.guard_probe_deletable from public, anon, authenticated;
grant select, delete on public.guard_probe_deletable to authenticated;
grant truncate on public.guard_probe_deletable to anon;

-- RLS on, but anon may read one column.
create table public.guard_probe_anon_column (id uuid primary key, note text);
alter table public.guard_probe_anon_column enable row level security;
revoke all on public.guard_probe_anon_column from public, anon, authenticated;
grant select (note) on public.guard_probe_anon_column to anon;

-- Correct: RLS on, authenticated may read and insert.
create table public.guard_probe_ok (id uuid primary key);
alter table public.guard_probe_ok enable row level security;
revoke all on public.guard_probe_ok from public, anon, authenticated;
grant select, insert on public.guard_probe_ok to authenticated;

-- A definer view, an invoker view anon can read, a correct view, a matview.
create view public.guard_probe_definer_view as select id from public.guard_probe_ok;
revoke all on public.guard_probe_definer_view from public, anon, authenticated;
create view public.guard_probe_anon_view with (security_invoker = true) as
  select id from public.guard_probe_ok;
revoke all on public.guard_probe_anon_view from public, anon, authenticated;
grant select on public.guard_probe_anon_view to anon;
create view public.guard_probe_ok_view with (security_invoker = on) as
  select id from public.guard_probe_ok;
revoke all on public.guard_probe_ok_view from public, anon, authenticated;
grant select on public.guard_probe_ok_view to authenticated;
create materialized view public.guard_probe_matview as select id from public.guard_probe_ok;
revoke all on public.guard_probe_matview from public, anon, authenticated;

-- A foreign table, with its grants revoked, so only the relkind rule fires.
-- The wrapper has no handler: the table is never read, only seen in the catalog.
create foreign data wrapper guard_probe_fdw;
create server guard_probe_server foreign data wrapper guard_probe_fdw;
create foreign table public.guard_probe_foreign (id uuid) server guard_probe_server;
revoke all on public.guard_probe_foreign from public, anon, authenticated;

-- A definer function never revoked from PUBLIC, one with no search_path, one
-- granted to anon, and a correct one.
create function public.guard_probe_open() returns int language sql
  security definer set search_path = public as $$ select 1 $$;

create function public.guard_probe_no_path() returns int language sql
  security definer as $$ select 1 $$;
revoke all on function public.guard_probe_no_path() from public, anon;

create function public.guard_probe_anon(p int) returns int language sql
  security definer set search_path = public as $$ select p $$;
revoke all on function public.guard_probe_anon(int) from public;
grant execute on function public.guard_probe_anon(int) to anon;

create function public.guard_probe_ok_fn() returns int language sql
  security definer set search_path = public as $$ select 1 $$;
revoke all on function public.guard_probe_ok_fn() from public, anon;
grant execute on function public.guard_probe_ok_fn() to authenticated;

do $$
declare
  v_got  text;
  v_want text := string_agg(x, '; ' order by x) from unnest(array[
    'foreign table public.guard_probe_foreign cannot have RLS; keep it out of public',
    'materialized view public.guard_probe_matview bypasses RLS; use a security_invoker view',
    'security definer function public.guard_probe_anon(p integer) is executable by anon',
    'security definer function public.guard_probe_no_path() does not set search_path = public',
    'security definer function public.guard_probe_open() is executable by PUBLIC',
    'security definer function public.guard_probe_open() is executable by anon',
    'table public.guard_probe_anon_column grants anon SELECT',
    'table public.guard_probe_forgot_revoke grants anon INSERT',
    'table public.guard_probe_forgot_revoke grants anon REFERENCES',
    'table public.guard_probe_forgot_revoke grants anon SELECT',
    'table public.guard_probe_forgot_revoke grants anon TRIGGER',
    'table public.guard_probe_forgot_revoke grants anon UPDATE',
    'table public.guard_probe_forgot_revoke lets anon DELETE',
    'table public.guard_probe_forgot_revoke lets anon TRUNCATE',
    'table public.guard_probe_forgot_revoke lets authenticated DELETE',
    'table public.guard_probe_forgot_revoke lets authenticated TRUNCATE',
    'table public.guard_probe_deletable lets anon TRUNCATE',
    'table public.guard_probe_deletable lets authenticated DELETE',
    'table public.guard_probe_no_rls does not have row level security enabled',
    'view public.guard_probe_anon_view grants anon SELECT',
    'view public.guard_probe_definer_view is not security_invoker'
  ]) as x;
begin
  select string_agg(x, '; ' order by x) into v_got
    from pg_temp.schema_guard_violations() as x
   where x like '%guard_probe%';
  perform test_assert(v_got = v_want,
    format('the guard names each broken probe and nothing else; got [%s]', v_got));
  perform test_assert(
    not exists (select 1 from pg_temp.schema_guard_violations() as x
                 where x not like '%guard_probe%'),
    'the probes did not make the guard report any real object');
end $$;

-- Weakening a real object is caught too, not only a new one.
alter table public.daily_reports disable row level security;
alter view public.daily_report_status set (security_invoker = false);
grant execute on function public.review_daily_report(uuid, text) to anon;
grant delete on public.audit_log to authenticated;
do $$
declare v text;
begin
  select string_agg(x, '; ' order by x) into v from pg_temp.schema_guard_violations() as x
   where x not like '%guard_probe%';
  perform test_assert(v =
    'security definer function public.review_daily_report(p_report_id uuid, p_note text) is executable by anon; '
    || 'table public.audit_log lets authenticated DELETE; '
    || 'table public.daily_reports does not have row level security enabled; '
    || 'view public.daily_report_status is not security_invoker',
    format('weakening existing objects is reported; got [%s]', v));
end $$;

rollback;
