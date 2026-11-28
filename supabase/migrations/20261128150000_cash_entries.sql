-- Site cash book: money in and out of a site's cash box, as an append-only ledger.
-- Owner: Nikhil. Spec: #258 (Phase 4 of #234). Pattern: worker_advances (ADR-054).
--
-- A supervisor records the cash they receive and spend at their sites. An owner or
-- accountant (can_view_wages) reads and records for the whole organisation. A project
-- manager does neither. The direction comes from the category: 'received' is cash in,
-- every other category is cash out. A mistake is cancelled by a reversal row, never by
-- an edit (rule 5). Only apply_cash_entry() writes, for the phone (through
-- sync_cash_entries) and, later, the web.

-- ---------------------------------------------------------------- table

create table public.cash_entries (
  -- Made on the phone, so a replayed push lands on the same row.
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null,
  site_id      uuid not null,

  entry_date   date not null,
  category     text not null
    check (category in ('received', 'wages', 'material', 'transport', 'food', 'other')),
  -- Whole paise, never a float. At most 10 lakh rupees in one entry.
  amount_paise bigint not null check (amount_paise > 0 and amount_paise <= 100000000),
  note         text check (note is null or (note = btrim(note) and char_length(note) between 1 and 500)),
  -- Null for an entry; the entry it cancels for a reversal.
  reverses_id  uuid,

  recorded_by  uuid not null references auth.users (id),
  created_at   timestamptz not null default now(),

  constraint cash_entries_site_fk foreign key (site_id, org_id)
    references public.sites (id, org_id) on delete restrict,

  -- A reversal repeats the day, site, category and amount of the entry it cancels, so a
  -- month's totals net out exactly.
  constraint cash_entries_row_key unique (id, site_id, entry_date, category, amount_paise),
  constraint cash_entries_reverses_fk
    foreign key (reverses_id, site_id, entry_date, category, amount_paise)
    references public.cash_entries (id, site_id, entry_date, category, amount_paise)
    on delete restrict,
  -- An entry is cancelled once.
  constraint cash_entries_reverses_once unique (reverses_id)
);

create index cash_entries_site_idx on public.cash_entries (site_id, entry_date);

-- ---------------------------------------------------------- append-only
-- Refused even for the table owner, like worker_advances.

create function public.block_cash_entry_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'cash_entries is append-only: % is not allowed', tg_op
    using errcode = '42501';
end;
$$;

revoke all on function public.block_cash_entry_mutation() from public, anon, authenticated;

create trigger cash_entries_block_mutation
  before update or delete on public.cash_entries
  for each row execute function public.block_cash_entry_mutation();

create trigger cash_entries_block_truncate
  before truncate on public.cash_entries
  for each statement execute function public.block_cash_entry_mutation();

-- ------------------------------------------------------------------- RLS

alter table public.cash_entries enable row level security;

-- No client may write: there is no insert, update or delete grant, so
-- apply_cash_entry() is the only way in.
revoke all on public.cash_entries from public, anon, authenticated;
grant select on public.cash_entries to authenticated;

create policy cash_entries_select on public.cash_entries
  for select to authenticated
  using (public.can_view_wages(org_id) or public.can_record_on_site(site_id));

create trigger cash_entries_audit
  after insert or update or delete on public.cash_entries
  for each row execute function public.write_audit();

-- ----------------------------------------------------------- apply_cash_entry
-- SECURITY DEFINER so it can read the site whatever the caller's access, but it checks
-- the caller itself: can_view_wages for the site's organisation, or can_record_on_site
-- for the site. A missing site, a foreign one and the wrong role are all the same 42501,
-- so a caller cannot probe for ids. Sites is read through its published view (rule 4).

create function public.apply_cash_entry(
  p_id           uuid,
  p_site_id      uuid,
  p_entry_date   date,
  p_category     text,
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
  v_status   text;
  v_existing public.cash_entries%rowtype;
  v_target   public.cash_entries%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_id is null then
    raise exception 'a cash entry id is required' using errcode = '22023';
  end if;

  -- A replay of the caller's own record is answered before any permission check, so a
  -- phone that missed the answer still hears "done". Only the author's exact record
  -- matches, so it reveals nothing.
  select * into v_existing from public.cash_entries where id = p_id;
  if found and public.cash_entry_matches(v_existing, v_uid, p_site_id, p_entry_date,
                                         p_category, p_amount_paise, v_note, p_reverses_id) then
    return;
  end if;

  select d.org_id, d.status into v_org_id, v_status
    from public.site_directory d
   where d.id = p_site_id;
  if v_org_id is null
     or not (public.can_view_wages(v_org_id) or public.can_record_on_site(p_site_id)) then
    raise exception 'not permitted to record cash at this site' using errcode = '42501';
  end if;

  if v_existing.id is not null then
    raise exception 'cash entry % already exists with different content', p_id
      using errcode = '23505';
  end if;

  if v_status = 'archived' then
    raise exception 'site % is archived', p_site_id using errcode = '55000';
  end if;

  -- India is ahead of UTC, so the local "today" is at most UTC today + 1.
  if p_entry_date is null or p_entry_date > (now() at time zone 'utc')::date + 1 then
    raise exception 'entry_date is missing or in the future' using errcode = '22023';
  end if;

  if p_reverses_id is not null then
    -- A reversal cancels one entry of this site for its whole amount, on its day, in its
    -- category. It cannot itself be cancelled.
    select * into v_target from public.cash_entries where id = p_reverses_id;
    if not found
       or v_target.site_id <> p_site_id
       or v_target.reverses_id is not null
       or v_target.entry_date <> p_entry_date
       or v_target.category <> p_category
       or v_target.amount_paise <> p_amount_paise then
      raise exception 'cash entry % cannot be reversed this way', p_reverses_id
        using errcode = '23514';
    end if;
  end if;

  -- A second reversal of the same entry hits cash_entries_reverses_once (23505).
  insert into public.cash_entries
    (id, org_id, site_id, entry_date, category, amount_paise, note, reverses_id, recorded_by)
  values
    (p_id, v_org_id, p_site_id, p_entry_date, p_category, p_amount_paise, v_note, p_reverses_id, v_uid)
  on conflict (id) do nothing;

  if found then
    return;
  end if;

  -- Lost a race with the same id: a replay if it matches, a conflict if not.
  select * into v_existing from public.cash_entries where id = p_id;
  if not public.cash_entry_matches(v_existing, v_uid, p_site_id, p_entry_date,
                                   p_category, p_amount_paise, v_note, p_reverses_id) then
    raise exception 'cash entry % already exists with different content', p_id
      using errcode = '23505';
  end if;
end;
$$;

-- Is this stored row exactly what the caller is sending again?
create function public.cash_entry_matches(
  p_row          public.cash_entries,
  p_uid          uuid,
  p_site_id      uuid,
  p_entry_date   date,
  p_category     text,
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
     and p_row.entry_date = p_entry_date
     and p_row.category = p_category
     and p_row.amount_paise = p_amount_paise
     and p_row.note is not distinct from p_note
     and p_row.reverses_id is not distinct from p_reverses_id;
$$;

revoke all on function public.apply_cash_entry(uuid, uuid, date, text, bigint, text, uuid)
  from public, anon;
grant execute on function public.apply_cash_entry(uuid, uuid, date, text, bigint, text, uuid)
  to authenticated;
revoke all on function public.cash_entry_matches(public.cash_entries, uuid, uuid, date, text, bigint, text, uuid)
  from public, anon, authenticated;

-- ----------------------------------------------------------------- view
-- Per site and month: cash in, cash out and advances paid, each net of reversals.
-- security_invoker, so it reads with the caller's RLS and a supervisor sees only their
-- own sites. Advances are read through the view Worker advances publishes (rule 4).
-- The box balance is in - out - advances; it is never stored.

create view public.cash_book_totals
with (security_invoker = true) as
with cash as (
  select e.org_id,
         e.site_id,
         date_trunc('month', e.entry_date)::date as month,
         sum(case when e.category = 'received'
                  then (case when e.reverses_id is null then e.amount_paise else -e.amount_paise end)
                  else 0 end)::bigint as in_paise,
         sum(case when e.category <> 'received'
                  then (case when e.reverses_id is null then e.amount_paise else -e.amount_paise end)
                  else 0 end)::bigint as out_paise
    from public.cash_entries e
   group by e.org_id, e.site_id, date_trunc('month', e.entry_date)
),
adv as (
  select l.org_id,
         l.site_id,
         date_trunc('month', l.paid_on)::date as month,
         sum(case when l.reverses_id is null then l.amount_paise else -l.amount_paise end)::bigint
           as advances_paise
    from public.worker_advance_lines l
   group by l.org_id, l.site_id, date_trunc('month', l.paid_on)
)
select coalesce(c.org_id, a.org_id)     as org_id,
       coalesce(c.site_id, a.site_id)   as site_id,
       coalesce(c.month, a.month)       as month,
       coalesce(c.in_paise, 0)::bigint        as in_paise,
       coalesce(c.out_paise, 0)::bigint       as out_paise,
       coalesce(a.advances_paise, 0)::bigint  as advances_paise
  from cash c
  full join adv a on a.org_id = c.org_id and a.site_id = c.site_id and a.month = c.month;

revoke all on public.cash_book_totals from public, anon, authenticated;
grant select on public.cash_book_totals to authenticated;
