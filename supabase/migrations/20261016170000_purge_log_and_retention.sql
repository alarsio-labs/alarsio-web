-- Audit, Retention & Guards: purge_log, the retention floor and the only purge
-- that may delete from audit_log. Owner: Anuradha. Issue #19.
--
-- How a row leaves audit_log:
--   1. Only purge_audit_log() deletes. It is executable by no client role, so it
--      is run by an operator, not by the app.
--   2. It refuses a cutoff younger than the retention floor, and refuses a purge
--      without a reason.
--   3. The append-only guard on audit_log is replaced below. It still rejects
--      UPDATE and TRUNCATE for everyone, and rejects DELETE unless the purge has
--      said so for this transaction AND the row is older than the floor. The
--      floor is therefore checked twice: a mistake in the function alone cannot
--      delete a young row.
--   4. Every purge, including one that matches no rows, writes exactly one
--      purge_log row in the same transaction. A refused purge writes none.
--
-- The floor is three years, the minimum for attendance and wage records in the
-- roadmap (CUJ-6). It lives in one place, audit_retention_floor().

-- ----------------------------------------------------------- the floor

create function public.audit_retention_floor()
returns interval
language sql
immutable
set search_path = public
as $$ select interval '3 years' $$;

revoke all on function public.audit_retention_floor() from public, anon, authenticated;

-- ------------------------------------------------------------ purge_log

create table public.purge_log (
  id              bigint generated always as identity primary key,
  table_name      text        not null check (char_length(table_name) between 1 and 63),
  -- Everything older than this was eligible, and nothing newer was touched.
  purged_before   timestamptz not null,
  retention_floor interval    not null,
  rows_purged     bigint      not null check (rows_purged >= 0),
  reason          text        not null check (char_length(btrim(reason)) between 10 and 500),
  -- auth.uid() when a signed-in user ran it; null for an operator session.
  purged_by       uuid,
  -- The database login that ran it, for the operator case.
  purged_by_role  text        not null default session_user,
  purged_at       timestamptz not null default now(),

  -- The floor is also a table rule: a row claiming a purge inside it cannot exist.
  constraint purge_log_respects_floor
    check (purged_before <= purged_at - retention_floor)
);
-- No foreign key on purged_by: removing a user must never touch history.

alter table public.purge_log enable row level security;
revoke all on public.purge_log from public, anon, authenticated;
-- No policies and no grants: closed to every client. Reading it is a later
-- decision; nothing in the MVP asks for it.

create function public.block_purge_log_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'purge_log is append-only: % is not allowed', tg_op
    using errcode = '42501';
end;
$$;

revoke all on function public.block_purge_log_mutation() from public, anon, authenticated;

create trigger purge_log_block_mutation
  before update or delete on public.purge_log
  for each row execute function public.block_purge_log_mutation();

create trigger purge_log_block_truncate
  before truncate on public.purge_log
  for each statement execute function public.block_purge_log_mutation();

-- ------------------------------------------- the audit_log guard, amended

create or replace function public.block_audit_log_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    -- Only purge_audit_log() sets this, and only for its own transaction. The
    -- floor is checked again here so the setting alone is not enough.
    if current_setting('alarsio.audit_purge', true) = 'on'
       and old.occurred_at <= now() - public.audit_retention_floor() then
      return old;
    end if;
  end if;
  raise exception 'audit_log is append-only: % is not allowed', tg_op
    using errcode = '42501';
end;
$$;

revoke all on function public.block_audit_log_mutation() from public, anon, authenticated;

-- ---------------------------------------------------------- the purge

create function public.purge_audit_log(p_before timestamptz, p_reason text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_floor interval := public.audit_retention_floor();
  v_rows  bigint;
begin
  if p_before is null then
    raise exception 'a cutoff is required' using errcode = '22023';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 10 then
    raise exception 'a reason of at least 10 characters is required' using errcode = '22023';
  end if;
  if p_before > now() - v_floor then
    raise exception 'cutoff is inside the retention floor of %', v_floor using errcode = '22023';
  end if;

  perform set_config('alarsio.audit_purge', 'on', true);

  delete from public.audit_log where occurred_at < p_before;
  get diagnostics v_rows = row_count;

  perform set_config('alarsio.audit_purge', 'off', true);

  insert into public.purge_log
    (table_name, purged_before, retention_floor, rows_purged, reason, purged_by)
  values ('audit_log', p_before, v_floor, v_rows, btrim(p_reason), auth.uid());

  return v_rows;
end;
$$;

-- Executable by no client role. An operator runs it with the database login.
revoke all on function public.purge_audit_log(timestamptz, text) from public, anon, authenticated;
