-- Audit, Retention & Guards: the owner data export (issue #76, ADR-026).
--
-- The export lives in apps/web and reads each table as the signed-in owner,
-- one page at a time: select <columns> from <table> where <org> [and id > x]
-- order by id limit 1000. This suite proves that query shape works under the
-- real grants and RLS for every table, and returns only the owner's
-- organisation. apps/web/src/lib/export/tables.test.ts proves the web list
-- matches the migrations; this proves the database lets the owner read it.
begin;

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-00000000000a', 'alice@x'),   -- org A owner
  ('c0000000-0000-0000-0000-00000000000c', 'pat@x'),     -- org A project manager
  ('e0000000-0000-0000-0000-00000000000e', 'eve@x');     -- org B owner
insert into public.organizations (id, name, created_by) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Org A', 'a0000000-0000-0000-0000-00000000000a'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Org B', 'e0000000-0000-0000-0000-00000000000e');
insert into public.profiles (id, full_name) values
  ('a0000000-0000-0000-0000-00000000000a', 'Alice'),
  ('c0000000-0000-0000-0000-00000000000c', 'Pat'),
  ('e0000000-0000-0000-0000-00000000000e', 'Eve');
insert into public.memberships (org_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'owner'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000c', 'project_manager'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-00000000000e', 'owner');
insert into public.sites (id, org_id, name, address, latitude, longitude, created_by) values
  ('51000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Site A', 'x', 19.0, 73.0, 'a0000000-0000-0000-0000-00000000000a'),
  ('51000000-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-000000000002', 'Site B', 'x', 18.0, 72.0, 'e0000000-0000-0000-0000-00000000000e');
insert into public.workers (id, org_id, code, full_name, trade, pay_type, created_by) values
  ('77000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'W-001', 'Ravi', 'mason', 'daily', 'a0000000-0000-0000-0000-00000000000a'),
  ('77000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'W-002', '=Sita', 'helper', 'daily', 'a0000000-0000-0000-0000-00000000000a'),
  ('77000000-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-000000000002', 'W-001', 'Bela', 'mason', 'daily', 'e0000000-0000-0000-0000-00000000000e');

-- ------------------------------------------------- grants the export relies on

-- authenticated may SELECT every column of every table, except the two closed
-- logs and invites.token_hash. A new column-limited grant breaks the export's
-- query; this names the column so tables.ts WITHHELD_COLUMNS can follow.
do $$
declare r record;
begin
  for r in
    select c.relname as tbl, a.attname as col
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
     where n.nspname = 'public' and c.relkind in ('r', 'p')
       and c.relname not in ('purge_log', 'rate_limit_counters')
  loop
    if r.tbl = 'invites' and r.col = 'token_hash' then
      perform test_assert(not has_column_privilege('authenticated', format('public.%I', r.tbl), r.col, 'SELECT'),
        'export: invites.token_hash stays unreadable');
    else
      perform test_assert(has_column_privilege('authenticated', format('public.%I', r.tbl), r.col, 'SELECT'),
        format('export: authenticated cannot SELECT public.%I.%I; add it to WITHHELD_COLUMNS in apps/web/src/lib/export/tables.ts or grant it', r.tbl, r.col));
    end if;
  end loop;

  perform test_assert(not has_table_privilege('authenticated', 'public.purge_log', 'SELECT'), 'purge_log stays closed');
  perform test_assert(not has_table_privilege('authenticated', 'public.rate_limit_counters', 'SELECT'), 'rate_limit_counters stays closed');
end $$;

-- ---------------------------------------- the export's query, as each user

-- Runs the export's first page for every table as the current user and returns
-- the rows it would write per table. Fails the suite if any query raises.
create function pg_temp.export_counts(p_org uuid)
returns table (tbl text, n bigint)
language plpgsql as $$
declare r record; v_cols text; v_where text;
begin
  for r in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p')
       and c.relname not in ('purge_log', 'rate_limit_counters')
     order by 1
  loop
    select string_agg(format('%I', a.attname), ', ' order by a.attnum) into v_cols
      from pg_attribute a
     where a.attrelid = format('public.%I', r.relname)::regclass and a.attnum > 0 and not a.attisdropped
       and not (r.relname = 'invites' and a.attname = 'token_hash');
    v_where := case r.relname
                 when 'organizations' then format('where id = %L', p_org)
                 when 'profiles'      then ''
                 else format('where org_id = %L', p_org) end;
    tbl := r.relname;
    execute format('select count(*) from (select %s from public.%I %s order by id limit 1000) s',
                   v_cols, r.relname, v_where) into n;
    return next;
  end loop;
end $$;

do $$
declare v_alice jsonb; v_eve_reads_a jsonb; v_pat jsonb; v_other bigint; r record;
begin
  perform test_as('a0000000-0000-0000-0000-00000000000a');
  select jsonb_object_agg(tbl, n) into v_alice from pg_temp.export_counts('aaaaaaaa-0000-0000-0000-000000000001');
  reset role;

  perform test_assert((v_alice ->> 'organizations')::int = 1, 'owner exports their organisation row');
  perform test_assert((v_alice ->> 'sites')::int = 1, 'owner exports org A sites only, got ' || (v_alice ->> 'sites'));
  perform test_assert((v_alice ->> 'workers')::int = 2, 'owner exports org A workers only, got ' || (v_alice ->> 'workers'));
  perform test_assert((v_alice ->> 'memberships')::int = 2, 'owner exports org A memberships');
  perform test_assert((v_alice ->> 'profiles')::int = 1, 'owner exports only their own profile (manifest note)');
  perform test_assert((v_alice ->> 'audit_log')::int > 0, 'owner exports the audit log of org A');

  -- Asking for another organisation's id returns nothing, table by table.
  perform test_as('e0000000-0000-0000-0000-00000000000e');
  select jsonb_object_agg(tbl, n) into v_eve_reads_a from pg_temp.export_counts('aaaaaaaa-0000-0000-0000-000000000001');
  reset role;
  for r in select key, value from jsonb_each_text(v_eve_reads_a) where key <> 'profiles' loop
    perform test_assert(r.value::int = 0, format('org B owner reads 0 rows of org A from %s, got %s', r.key, r.value));
  end loop;

  -- No table leaks org B rows into org A's export: every row read under the
  -- org A filter is org A's. (Checked as alice, without the filter.)
  perform test_as('a0000000-0000-0000-0000-00000000000a');
  for r in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attname = 'org_id'
     where n.nspname = 'public' and c.relkind = 'r'
       and c.relname not in ('purge_log', 'rate_limit_counters')
  loop
    execute format('select count(*) from public.%I where org_id <> %L', r.relname,
                   'aaaaaaaa-0000-0000-0000-000000000001') into v_other;
    perform test_assert(v_other = 0, format('owner of org A sees %s rows of another org in %s', v_other, r.relname));
  end loop;
  reset role;

  -- A project manager's queries also run (the owner gate is the web page's);
  -- RLS still keeps the audit log from them (ADR-012).
  perform test_as('c0000000-0000-0000-0000-00000000000c');
  select jsonb_object_agg(tbl, n) into v_pat from pg_temp.export_counts('aaaaaaaa-0000-0000-0000-000000000001');
  reset role;
  perform test_assert((v_pat ->> 'audit_log')::int = 0, 'a project manager reads no audit log');

  -- anon cannot run the queries at all.
  perform test_as_anon();
  begin
    perform count(*) from public.workers;
    raise exception 'ASSERT FAILED: anon read workers';
  exception when insufficient_privilege then null; end;
  reset role;
end $$;

-- ------------------------------------------------------------- paging by id

-- The second page starts after the last id of the first, for uuid and for the
-- bigint id of audit_log.
do $$
declare v_first uuid; v_rest bigint; v_first_audit bigint; v_all_audit bigint; v_rest_audit bigint;
begin
  perform test_as('a0000000-0000-0000-0000-00000000000a');
  select id into v_first from public.workers
   where org_id = 'aaaaaaaa-0000-0000-0000-000000000001' order by id limit 1;
  select count(*) into v_rest from public.workers
   where org_id = 'aaaaaaaa-0000-0000-0000-000000000001' and id > v_first;
  select count(*) into v_all_audit from public.audit_log where org_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  select id into v_first_audit from public.audit_log
   where org_id = 'aaaaaaaa-0000-0000-0000-000000000001' order by id limit 1;
  select count(*) into v_rest_audit from public.audit_log
   where org_id = 'aaaaaaaa-0000-0000-0000-000000000001' and id > v_first_audit;
  reset role;
  perform test_assert(v_rest = 1, 'the page after the first worker holds the other one');
  perform test_assert(v_rest_audit = v_all_audit - 1, 'audit_log pages by its bigint id');
end $$;

-- ---------------------------------------------------- the export writes nothing

-- Apart from the rate-limit counter, an export changes no row: running every
-- query adds no audit row.
do $$
declare v_before bigint; v_after bigint;
begin
  select count(*) into v_before from public.audit_log;
  perform test_as('a0000000-0000-0000-0000-00000000000a');
  perform * from pg_temp.export_counts('aaaaaaaa-0000-0000-0000-000000000001');
  reset role;
  select count(*) into v_after from public.audit_log;
  perform test_assert(v_after = v_before, 'reading for an export writes no audit row');
end $$;

rollback;
