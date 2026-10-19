-- Audit, Retention & Guards: every table in public writes the audit log.
-- Issue #72. ADR-008 (write_audit), ADR-024 (this guard).
--
-- Reads the catalog after every migration has been applied, so a new table in
-- any module is covered without anyone updating a list. A table passes when it
-- has an enabled write_audit() trigger that fires AFTER INSERT OR UPDATE OR
-- DELETE FOR EACH ROW, and a uuid id, which write_audit() needs at run time.
--
-- Exempt, because they are the logs themselves (ADR-008, ADR-012):
-- audit_log, purge_log, rate_limit_counters. Adding a name here needs an ADR.
begin;

create function pg_temp.audit_coverage_violations()
returns setof text
language sql
stable
as $$
  with audited as (
    select t.tgrelid as relid
      from pg_trigger t
      join pg_proc p on p.oid = t.tgfoid
      join pg_namespace pn on pn.oid = p.pronamespace
     where pn.nspname = 'public'
       and p.proname = 'write_audit'
       and not t.tgisinternal
       -- Fires on ordinary writes: enabled (O) or always (A). Not disabled (D),
       -- and not replica-only (R), which fires only while
       -- session_replication_role = replica, so normal writes go unaudited.
       and t.tgenabled in ('O', 'A')
       -- ROW (1) + INSERT (4) + DELETE (8) + UPDATE (16) = 29, and neither
       -- BEFORE (2) nor INSTEAD OF (64). TRUNCATE (32) is allowed, not needed.
       and (t.tgtype::int & 95) = 29
       -- Every row change, unconditionally: no WHEN (...) clause, and no
       -- UPDATE OF column list, either of which lets some changes go unaudited.
       and t.tgqual is null
       and cardinality(t.tgattr::int2[]) = 0
  )
  select format('table public.%I has no write_audit trigger AFTER INSERT OR UPDATE OR DELETE FOR EACH ROW', c.relname)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind in ('r', 'p')
     and c.relname not in ('audit_log', 'purge_log', 'rate_limit_counters')
     and c.oid not in (select relid from audited)
  union all
  select format('table public.%I is audited but has no uuid id column', c.relname)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind in ('r', 'p')
     and c.oid in (select relid from audited)
     and not exists (select 1 from pg_attribute a
                      where a.attrelid = c.oid and a.attname = 'id'
                        and a.atttypid = 'uuid'::regtype and not a.attisdropped)
  order by 1;
$$;

-- ------------------------------------------------- the migrated schema

do $$
declare v text;
begin
  select string_agg(x, '; ') into v from pg_temp.audit_coverage_violations() as x;
  perform test_assert(v is null, 'audit coverage: ' || coalesce(v, ''));

  -- The exemptions name real tables, so a rename cannot quietly drop one
  -- from the guard while leaving the list looking right.
  perform test_assert(
    (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and c.relname in ('audit_log', 'purge_log', 'rate_limit_counters')) = 3,
    'the three exempt log tables exist');

  -- And the guard is looking at something: every business table so far.
  perform test_assert(
    (select count(*) from pg_trigger t join pg_proc p on p.oid = t.tgfoid
      where p.proname = 'write_audit' and not t.tgisinternal) >= 17,
    'write_audit is attached to at least the 17 tables on main at #72');
end $$;

-- ---------------------------------------------- the guard can fail
-- Each probe breaks one rule; the guard must name it, and only it.

create table public.guard_probe_unaudited (id uuid primary key);

create table public.guard_probe_before (id uuid primary key);
create trigger guard_probe_before_audit
  before insert or update or delete on public.guard_probe_before
  for each row execute function public.write_audit();

create table public.guard_probe_statement (id uuid primary key);
create trigger guard_probe_statement_audit
  after insert or update or delete on public.guard_probe_statement
  for each statement execute function public.write_audit();

create table public.guard_probe_no_delete (id uuid primary key);
create trigger guard_probe_no_delete_audit
  after insert or update on public.guard_probe_no_delete
  for each row execute function public.write_audit();

create table public.guard_probe_disabled (id uuid primary key);
create trigger guard_probe_disabled_audit
  after insert or update or delete on public.guard_probe_disabled
  for each row execute function public.write_audit();
alter table public.guard_probe_disabled disable trigger guard_probe_disabled_audit;

create table public.guard_probe_int_id (id bigint primary key);
create trigger guard_probe_int_id_audit
  after insert or update or delete on public.guard_probe_int_id
  for each row execute function public.write_audit();

create table public.guard_probe_replica (id uuid primary key);
create trigger guard_probe_replica_audit
  after insert or update or delete on public.guard_probe_replica
  for each row execute function public.write_audit();
alter table public.guard_probe_replica enable replica trigger guard_probe_replica_audit;

create table public.guard_probe_when (id uuid primary key, note text);
create trigger guard_probe_when_audit
  after insert or update or delete on public.guard_probe_when
  for each row when (false) execute function public.write_audit();

create table public.guard_probe_update_of (id uuid primary key, note text);
create trigger guard_probe_update_of_audit
  after insert or update of note or delete on public.guard_probe_update_of
  for each row execute function public.write_audit();

-- Correct, and enabled ALWAYS (fires even in replica mode), which is allowed.
create table public.guard_probe_always (id uuid primary key);
create trigger guard_probe_always_audit
  after insert or update or delete on public.guard_probe_always
  for each row execute function public.write_audit();
alter table public.guard_probe_always enable always trigger guard_probe_always_audit;

-- Correct, including an extra TRUNCATE, which is allowed.
create table public.guard_probe_ok (id uuid primary key);
create trigger guard_probe_ok_audit
  after insert or update or delete on public.guard_probe_ok
  for each row execute function public.write_audit();

do $$
declare
  v_got  text;
  v_want text := string_agg(x, '; ' order by x) from unnest(array[
    'table public.guard_probe_before has no write_audit trigger AFTER INSERT OR UPDATE OR DELETE FOR EACH ROW',
    'table public.guard_probe_disabled has no write_audit trigger AFTER INSERT OR UPDATE OR DELETE FOR EACH ROW',
    'table public.guard_probe_int_id is audited but has no uuid id column',
    'table public.guard_probe_no_delete has no write_audit trigger AFTER INSERT OR UPDATE OR DELETE FOR EACH ROW',
    'table public.guard_probe_replica has no write_audit trigger AFTER INSERT OR UPDATE OR DELETE FOR EACH ROW',
    'table public.guard_probe_statement has no write_audit trigger AFTER INSERT OR UPDATE OR DELETE FOR EACH ROW',
    'table public.guard_probe_unaudited has no write_audit trigger AFTER INSERT OR UPDATE OR DELETE FOR EACH ROW',
    'table public.guard_probe_update_of has no write_audit trigger AFTER INSERT OR UPDATE OR DELETE FOR EACH ROW',
    'table public.guard_probe_when has no write_audit trigger AFTER INSERT OR UPDATE OR DELETE FOR EACH ROW'
  ]) as x;
begin
  select string_agg(x, '; ' order by x) into v_got from pg_temp.audit_coverage_violations() as x;
  perform test_assert(v_got = v_want,
    format('the guard names each broken probe and nothing else; got [%s]', v_got));
end $$;

-- Dropping a table's audit trigger is caught too, not only a new table.
drop trigger organizations_audit on public.organizations;
do $$ begin
  perform test_assert(
    'table public.organizations has no write_audit trigger AFTER INSERT OR UPDATE OR DELETE FOR EACH ROW'
      in (select x from pg_temp.audit_coverage_violations() as x),
    'removing an existing table''s audit trigger is reported');
end $$;

rollback;
