-- Materials & Inventory, part 2: the stock ledger, its one writer, balances,
-- alerts and the sync handler. Owner: Nikhil. Issue #30. Decisions: ADR-015,
-- ADR-017. Handler contract: #13, ADR-014.
--
-- The ledger is append-only. A mistake is corrected by an adjustment, never by
-- an edit. The balance is computed here from the ledger and never sent by a
-- phone. Only apply_material_transaction() writes, for the web and, through
-- sync_material_transactions(), for the phone alike.

-- ---------------------------------------------------------------- table

create table public.material_transactions (
  -- Made on the phone, so a replayed push lands on the same row.
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  site_id     uuid not null,
  material_id uuid not null,

  kind        text not null
              check (kind in ('opening', 'receipt', 'usage', 'adjustment')),
  -- Opening, receipt and usage are positive amounts; an adjustment is signed
  -- (+ found, − lost) and never zero. Usage may take the balance below zero:
  -- that is warned in material_alerts, not blocked (ADR-015).
  quantity    numeric(12,3) not null,
  reason      text check (reason is null
                          or (reason = btrim(reason) and char_length(reason) between 1 and 500)),
  -- The day it happened on site, which may be before it reached the server.
  occurred_on date not null,

  recorded_by uuid not null references auth.users (id),
  created_at  timestamptz not null default now(),

  -- The material is on this site and in this organisation.
  constraint material_transactions_material_fk foreign key (material_id, site_id, org_id)
    references public.materials (id, site_id, org_id) on delete restrict,

  constraint material_transactions_quantity_sign check (
    (kind = 'adjustment' and quantity <> 0)
    or (kind <> 'adjustment' and quantity > 0)
  ),
  constraint material_transactions_adjustment_reason check (
    kind <> 'adjustment' or reason is not null
  )
);

-- One opening balance per material.
create unique index material_transactions_one_opening
  on public.material_transactions (material_id) where kind = 'opening';

create index material_transactions_material_idx on public.material_transactions (material_id, occurred_on);
create index material_transactions_site_idx     on public.material_transactions (site_id, occurred_on);

-- ---------------------------------------------------------- append-only
-- Refused even for the table owner, like audit_log. A purge or a customer's
-- offboarding would need its own decision rather than quietly lifting this.

create function public.block_material_transaction_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'material_transactions is append-only: % is not allowed', tg_op
    using errcode = '42501';
end;
$$;

revoke all on function public.block_material_transaction_mutation() from public, anon, authenticated;

create trigger material_transactions_block_mutation
  before update or delete on public.material_transactions
  for each row execute function public.block_material_transaction_mutation();

create trigger material_transactions_block_truncate
  before truncate on public.material_transactions
  for each statement execute function public.block_material_transaction_mutation();

-- ------------------------------------------------------------------- RLS

alter table public.material_transactions enable row level security;

-- Readable like the material it belongs to. No client may write: there is no
-- insert, update or delete grant, so apply_material_transaction() is the way in.
revoke all on public.material_transactions from public, anon, authenticated;
grant select on public.material_transactions to authenticated;

create policy material_transactions_select on public.material_transactions
  for select to authenticated
  using (public.has_site_access(site_id));

create trigger material_transactions_audit
  after insert or update or delete on public.material_transactions
  for each row execute function public.write_audit();

-- ------------------------------------------------ apply_material_transaction

create function public.apply_material_transaction(
  p_id          uuid,
  p_material_id uuid,
  p_kind        text,
  p_quantity    numeric,
  p_occurred_on date,
  p_reason      text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  -- Rounded to the column's scale first, so a replay compares like with like.
  v_quantity numeric(12,3) := p_quantity;
  v_reason   text := nullif(btrim(p_reason), '');
  v_site_id  uuid;
  v_org_id   uuid;
  v_existing public.material_transactions%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_id is null then
    raise exception 'a transaction id is required' using errcode = '22023';
  end if;

  -- A replay of the caller's own record is answered before any permission
  -- check, so a phone that missed the answer still hears "done" even if, say,
  -- the site was archived since. It reveals nothing: only the author's exact
  -- record matches.
  select * into v_existing from public.material_transactions where id = p_id;
  if found and public.material_transaction_matches(v_existing, v_uid, p_material_id,
                                                   p_kind, v_quantity, p_occurred_on, v_reason) then
    return;
  end if;

  -- Same error for a missing material, another organisation's, another site's,
  -- an archived site and the wrong role, so a caller cannot probe for ids.
  select m.site_id, m.org_id into v_site_id, v_org_id
    from public.materials m
   where m.id = p_material_id;
  if not found or not public.can_record_on_site(v_site_id) then
    raise exception 'not permitted to record on this material' using errcode = '42501';
  end if;

  if v_existing.id is not null then
    raise exception 'transaction % already exists with different content', p_id
      using errcode = '23505';
  end if;

  -- India is ahead of UTC, so the local "today" is at most UTC today + 1.
  if p_occurred_on is null or p_occurred_on > (now() at time zone 'utc')::date + 1 then
    raise exception 'occurred_on is missing or in the future' using errcode = '22023';
  end if;

  insert into public.material_transactions
    (id, org_id, site_id, material_id, kind, quantity, reason, occurred_on, recorded_by)
  values
    (p_id, v_org_id, v_site_id, p_material_id, p_kind, v_quantity, v_reason, p_occurred_on, v_uid)
  on conflict (id) do nothing;

  if found then
    return;
  end if;

  -- Lost a race with the same id: a replay if it matches, a conflict if not.
  select * into v_existing from public.material_transactions where id = p_id;
  if not public.material_transaction_matches(v_existing, v_uid, p_material_id,
                                             p_kind, v_quantity, p_occurred_on, v_reason) then
    raise exception 'transaction % already exists with different content', p_id
      using errcode = '23505';
  end if;
end;
$$;

-- Is this stored row exactly what the caller is sending again?
create function public.material_transaction_matches(
  p_row         public.material_transactions,
  p_uid         uuid,
  p_material_id uuid,
  p_kind        text,
  p_quantity    numeric,
  p_occurred_on date,
  p_reason      text
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_row.recorded_by = p_uid
     and p_row.material_id = p_material_id
     and p_row.kind = p_kind
     and p_row.quantity = p_quantity
     and p_row.occurred_on = p_occurred_on
     and p_row.reason is not distinct from p_reason;
$$;

revoke all on function public.apply_material_transaction(uuid, uuid, text, numeric, date, text) from public, anon;
grant execute on function public.apply_material_transaction(uuid, uuid, text, numeric, date, text) to authenticated;
revoke all on function public.material_transaction_matches(public.material_transactions, uuid, uuid, text, numeric, date, text)
  from public, anon, authenticated;

-- ----------------------------------------------------------------- views
-- security_invoker, so each reads with the caller's RLS: a supervisor sees the
-- balances of their own sites only.

create view public.material_balances
with (security_invoker = true) as
select m.id      as material_id,
       m.org_id,
       m.site_id,
       m.name,
       m.unit,
       m.low_stock_threshold,
       coalesce(sum(case t.kind when 'usage' then -t.quantity else t.quantity end), 0)::numeric(14,3)
                 as balance,
       count(t.id) as transaction_count,
       max(t.occurred_on) as last_movement_on
from public.materials m
left join public.material_transactions t on t.material_id = m.id
group by m.id;

-- What needs attention today: stock below zero, or at or under its threshold.
create view public.material_alerts
with (security_invoker = true) as
select b.material_id,
       b.org_id,
       b.site_id,
       b.name,
       b.unit,
       b.balance,
       b.low_stock_threshold,
       case when b.balance < 0 then 'negative' else 'low' end as alert
from public.material_balances b
where b.balance < 0
   or (b.low_stock_threshold is not null and b.balance <= b.low_stock_threshold);

revoke all on public.material_balances, public.material_alerts from public, anon, authenticated;
grant select on public.material_balances, public.material_alerts to authenticated;

-- ------------------------------------------------- the sync handler (#13)
-- Thin on purpose: it reads the payload and calls the same function the web
-- does. sync_push turns any error it raises into a verdict (ADR-014).

create function public.sync_material_transactions(p_record_id uuid, p_payload jsonb)
returns public.sync_result
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not (p_payload ? 'material_id' and p_payload ? 'kind'
          and p_payload ? 'quantity' and p_payload ? 'occurred_on') then
    raise exception 'material_id, kind, quantity and occurred_on are required'
      using errcode = '22023';
  end if;

  perform public.apply_material_transaction(
    p_record_id,
    (p_payload ->> 'material_id')::uuid,
    p_payload ->> 'kind',
    (p_payload ->> 'quantity')::numeric,
    (p_payload ->> 'occurred_on')::date,
    p_payload ->> 'reason'
  );

  return ('accepted', null)::public.sync_result;
end;
$$;

revoke all on function public.sync_material_transactions(uuid, jsonb) from public, anon;
grant execute on function public.sync_material_transactions(uuid, jsonb) to authenticated;
