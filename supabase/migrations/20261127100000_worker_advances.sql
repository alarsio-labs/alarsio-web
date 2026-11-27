-- Worker advances: money paid to a worker before pay day, as an append-only ledger.
-- Owner: Nikhil. Spec: #239 (Phase 2 of #234). Pattern: material_transactions.
--
-- An owner or accountant (can_view_wages) reads and records advances for the whole
-- organisation. A supervisor (can_record_on_site) reads and records them for the sites
-- they are assigned to: they hand the money over, so the amount is theirs to know. This
-- is money paid, not a rate or pay (ADR-054). A project manager does neither.
-- A mistake is cancelled by a reversal row, never by an edit (rule 5). Only
-- apply_worker_advance() writes, for the phone (through sync_worker_advances) and,
-- later, the web.

-- ---------------------------------------------------------------- table

create table public.worker_advances (
  -- Made on the phone, so a replayed push lands on the same row.
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null,
  site_id      uuid not null,
  worker_id    uuid not null,

  paid_on      date not null,
  -- Whole paise, never a float. At most 10 lakh rupees in one advance.
  amount_paise bigint not null check (amount_paise > 0 and amount_paise <= 100000000),
  note         text check (note is null or (note = btrim(note) and char_length(note) between 1 and 500)),
  -- Null for an advance; the advance it cancels for a reversal.
  reverses_id  uuid,

  recorded_by  uuid not null references auth.users (id),
  created_at   timestamptz not null default now(),

  constraint worker_advances_site_fk foreign key (site_id, org_id)
    references public.sites (id, org_id) on delete restrict,
  constraint worker_advances_worker_fk foreign key (worker_id, org_id)
    references public.workers (id, org_id) on delete restrict,

  -- A reversal names an advance of the same worker and site.
  constraint worker_advances_row_key unique (id, worker_id, site_id),
  constraint worker_advances_reverses_fk foreign key (reverses_id, worker_id, site_id)
    references public.worker_advances (id, worker_id, site_id) on delete restrict,
  -- An advance is cancelled once.
  constraint worker_advances_reverses_once unique (reverses_id)
);

create index worker_advances_worker_idx on public.worker_advances (worker_id, paid_on);
create index worker_advances_site_idx   on public.worker_advances (site_id, paid_on);

-- ---------------------------------------------------------- append-only
-- Refused even for the table owner, like material_transactions.

create function public.block_worker_advance_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'worker_advances is append-only: % is not allowed', tg_op
    using errcode = '42501';
end;
$$;

revoke all on function public.block_worker_advance_mutation() from public, anon, authenticated;

create trigger worker_advances_block_mutation
  before update or delete on public.worker_advances
  for each row execute function public.block_worker_advance_mutation();

create trigger worker_advances_block_truncate
  before truncate on public.worker_advances
  for each statement execute function public.block_worker_advance_mutation();

-- ------------------------------------------------------------------- RLS

alter table public.worker_advances enable row level security;

-- No client may write: there is no insert, update or delete grant, so
-- apply_worker_advance() is the only way in.
revoke all on public.worker_advances from public, anon, authenticated;
grant select on public.worker_advances to authenticated;

create policy worker_advances_select on public.worker_advances
  for select to authenticated
  using (public.can_view_wages(org_id) or public.can_record_on_site(site_id));

create trigger worker_advances_audit
  after insert or update or delete on public.worker_advances
  for each row execute function public.write_audit();

-- -------------------------------------------------------- apply_worker_advance
-- SECURITY DEFINER so it can read the roster whatever the caller's site access, but
-- it checks the caller itself: can_view_wages for the worker's organisation, or
-- can_record_on_site for the site. Every refusal for a missing worker, a foreign one
-- and the wrong role is the same 42501, so a caller cannot probe for ids.

create function public.apply_worker_advance(
  p_id           uuid,
  p_site_id      uuid,
  p_worker_id    uuid,
  p_paid_on      date,
  p_amount_paise bigint,
  p_note         text default null,
  p_reverses_id  uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_note     text := nullif(btrim(p_note), '');
  v_org_id   uuid;
  v_existing public.worker_advances%rowtype;
  v_target   public.worker_advances%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_id is null then
    raise exception 'an advance id is required' using errcode = '22023';
  end if;

  -- A replay of the caller's own record is answered before any permission check, so a
  -- phone that missed the answer still hears "done". Only the author's exact record
  -- matches, so it reveals nothing.
  select * into v_existing from public.worker_advances where id = p_id;
  if found and public.worker_advance_matches(v_existing, v_uid, p_site_id, p_worker_id,
                                             p_paid_on, p_amount_paise, v_note, p_reverses_id) then
    return;
  end if;

  select r.org_id into v_org_id
    from public.worker_roster r
   where r.worker_id = p_worker_id and r.site_id = p_site_id
   limit 1;
  if v_org_id is null
     or not (public.can_view_wages(v_org_id) or public.can_record_on_site(p_site_id)) then
    raise exception 'not permitted to record an advance for this worker' using errcode = '42501';
  end if;

  if v_existing.id is not null then
    raise exception 'advance % already exists with different content', p_id
      using errcode = '23505';
  end if;

  -- India is ahead of UTC, so the local "today" is at most UTC today + 1.
  if p_paid_on is null or p_paid_on > (now() at time zone 'utc')::date + 1 then
    raise exception 'paid_on is missing or in the future' using errcode = '22023';
  end if;

  if p_reverses_id is null then
    -- A new advance needs a worker rostered at the site on that date (ADR-021 D10).
    if not exists (
      select 1
        from public.worker_roster r
       where r.worker_id = p_worker_id
         and r.site_id = p_site_id
         and public.attendance_local_date(r.assigned_at) <= p_paid_on
         and (r.unassigned_at is null
              or public.attendance_local_date(r.unassigned_at) >= p_paid_on)
    ) then
      raise exception 'worker % was not rostered at site % on %', p_worker_id, p_site_id, p_paid_on
        using errcode = '23514';
    end if;
  else
    -- A reversal cancels one advance of this worker and site for its whole amount.
    -- It needs no roster check: a mistake can always be undone.
    select * into v_target from public.worker_advances where id = p_reverses_id;
    if not found
       or v_target.worker_id <> p_worker_id
       or v_target.site_id <> p_site_id
       or v_target.reverses_id is not null
       or v_target.amount_paise <> p_amount_paise then
      raise exception 'advance % cannot be reversed this way', p_reverses_id
        using errcode = '23514';
    end if;
  end if;

  -- A second reversal of the same advance hits worker_advances_reverses_once (23505).
  insert into public.worker_advances
    (id, org_id, site_id, worker_id, paid_on, amount_paise, note, reverses_id, recorded_by)
  values
    (p_id, v_org_id, p_site_id, p_worker_id, p_paid_on, p_amount_paise, v_note, p_reverses_id, v_uid)
  on conflict (id) do nothing;

  if found then
    return;
  end if;

  -- Lost a race with the same id: a replay if it matches, a conflict if not.
  select * into v_existing from public.worker_advances where id = p_id;
  if not public.worker_advance_matches(v_existing, v_uid, p_site_id, p_worker_id,
                                       p_paid_on, p_amount_paise, v_note, p_reverses_id) then
    raise exception 'advance % already exists with different content', p_id
      using errcode = '23505';
  end if;
end;
$$;

-- Is this stored row exactly what the caller is sending again?
create function public.worker_advance_matches(
  p_row          public.worker_advances,
  p_uid          uuid,
  p_site_id      uuid,
  p_worker_id    uuid,
  p_paid_on      date,
  p_amount_paise bigint,
  p_note         text,
  p_reverses_id  uuid
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_row.recorded_by = p_uid
     and p_row.site_id = p_site_id
     and p_row.worker_id = p_worker_id
     and p_row.paid_on = p_paid_on
     and p_row.amount_paise = p_amount_paise
     and p_row.note is not distinct from p_note
     and p_row.reverses_id is not distinct from p_reverses_id;
$$;

revoke all on function public.apply_worker_advance(uuid, uuid, uuid, date, bigint, text, uuid)
  from public, anon;
grant execute on function public.apply_worker_advance(uuid, uuid, uuid, date, bigint, text, uuid)
  to authenticated;
revoke all on function public.worker_advance_matches(public.worker_advances, uuid, uuid, uuid, date, bigint, text, uuid)
  from public, anon, authenticated;

-- ----------------------------------------------------------------- view
-- Per worker and month: advances minus reversals. security_invoker, so it reads with
-- the caller's RLS, so a supervisor sees only their own sites. Published for the web later.

create view public.worker_advance_totals
with (security_invoker = true) as
select a.org_id,
       a.worker_id,
       date_trunc('month', a.paid_on)::date as month,
       sum(case when a.reverses_id is null then a.amount_paise else -a.amount_paise end)::bigint
         as total_paise
from public.worker_advances a
group by a.org_id, a.worker_id, date_trunc('month', a.paid_on);

revoke all on public.worker_advance_totals from public, anon, authenticated;
grant select on public.worker_advance_totals to authenticated;
