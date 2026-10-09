-- Audit, Retention & Guards, week 1: audit_log and the generic write_audit()
-- row trigger every module attaches to the tables it owns.
-- Owner: Anuradha. Issue #4. See ADR-008 for the column and guard choices.
--
-- Attach it as:
--   create trigger <table>_audit
--     after insert or update or delete on public.<table>
--     for each row execute function public.write_audit();
--
-- Requires the audited table to have a uuid `id` column. Out of scope here:
-- purge_log, rate_limit_counters and the retention floor (week 2).

-- ---------------------------------------------------------------- table

create table public.audit_log (
  id          bigint generated always as identity primary key,
  table_name  text not null check (char_length(table_name) between 1 and 63),
  row_id      uuid not null,
  operation   text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  -- auth.uid() at the time of the write. Null for a migration or a superuser
  -- bootstrap. No foreign key: removing a user must never touch history.
  actor_id    uuid,
  -- The row's org_id; the row's own id for organizations; null for tables
  -- with no organisation, such as profiles.
  org_id      uuid,
  old_data    jsonb,
  new_data    jsonb,
  -- Transaction time. Rows from one transaction share it; order by id.
  occurred_at timestamptz not null default now(),

  constraint audit_log_shape check (
       (operation = 'INSERT' and old_data is null     and new_data is not null)
    or (operation = 'UPDATE' and old_data is not null and new_data is not null)
    or (operation = 'DELETE' and old_data is not null and new_data is null)
  )
);

create index audit_log_row_idx on public.audit_log (table_name, row_id);
create index audit_log_org_idx on public.audit_log (org_id, occurred_at);

-- ----------------------------------------------------------------- guard
-- Append-only, even for the table owner. A purge in the retention work must
-- come with its own decision rather than quietly disabling this.

create function public.block_audit_log_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'audit_log is append-only: % is not allowed', tg_op
    using errcode = '42501';
end;
$$;

revoke all on function public.block_audit_log_mutation() from public, anon, authenticated;

create trigger audit_log_block_mutation
  before update or delete on public.audit_log
  for each row execute function public.block_audit_log_mutation();

create trigger audit_log_block_truncate
  before truncate on public.audit_log
  for each statement execute function public.block_audit_log_mutation();

-- ----------------------------------------------------------- write_audit
-- SECURITY DEFINER so it can insert into audit_log, which no client role may
-- write. It reads nothing from its caller except auth.uid() and the row.

create function public.write_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
  v_org uuid;
begin
  -- A statement-level or BEFORE trigger would write rows that do not match
  -- the rows actually changed, including one for a statement that changed none.
  if tg_level <> 'ROW' or tg_when <> 'AFTER' then
    raise exception 'write_audit() must be attached AFTER ... FOR EACH ROW (on %)',
      tg_table_name using errcode = '39P01';
  end if;

  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;

  if not (v_row ? 'id') then
    raise exception 'write_audit(): table % has no id column', tg_table_name
      using errcode = '39P01';
  end if;

  v_org := case
    when tg_table_name = 'organizations' then (v_row ->> 'id')::uuid
    else (v_row ->> 'org_id')::uuid
  end;

  insert into public.audit_log
    (table_name, row_id, operation, actor_id, org_id, old_data, new_data)
  values (
    tg_table_name,
    (v_row ->> 'id')::uuid,
    tg_op,
    auth.uid(),
    v_org,
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end
  );

  return null;
end;
$$;

-- Trigger functions are checked for EXECUTE when a trigger is created, not
-- when it fires, so audited writes by `authenticated` still record.
revoke all on function public.write_audit() from public, anon, authenticated;

-- ------------------------------------------------------------------- RLS

alter table public.audit_log enable row level security;

-- No policies and no grants: closed to every client. Reads arrive later
-- through a deliberate policy or published function.
revoke all on public.audit_log from public, anon, authenticated;
