-- Materials & Inventory, part 1: what a site stocks. Owner: Nikhil. Issue #30.
-- Decisions in ADR-015. The stock ledger, balances, alerts and the sync handler
-- arrive in part 2 (week 4).
--
-- A material is defined per site by a manager on the dashboard. Its unit is
-- fixed once it exists, so every later ledger entry means the same thing.

-- ---------------------------------------------------------------- table

create table public.materials (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null,
  site_id             uuid not null,

  name                text not null
                      check (name = btrim(name) and char_length(name) between 1 and 120),
  -- A fixed list, so "bag", "Bags" and "BAG" cannot become three units. Text +
  -- CHECK, like sites.status, so a later migration can extend it.
  unit                text not null
                      check (unit in ('nos', 'bag', 'kg', 'tonne', 'litre', 'cft', 'cum',
                                      'sqft', 'sqm', 'rft', 'm', 'brass', 'trip')),
  -- Same type the ledger quantities will use. Null means no low-stock alert.
  low_stock_threshold numeric(12,3) check (low_stock_threshold >= 0),

  created_by          uuid not null default auth.uid() references auth.users (id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- The site is in this organisation.
  constraint materials_site_fk foreign key (site_id, org_id)
    references public.sites (id, org_id) on delete restrict,

  -- Target for the ledger's composite foreign key (part 2), which keeps a
  -- transaction on the same site and organisation as its material.
  constraint materials_id_site_org_unique unique (id, site_id, org_id)
);

-- One name per site, ignoring case. Leading on site_id, this also serves
-- "the materials of this site".
create unique index materials_site_name_unique on public.materials (site_id, lower(name));

-- ------------------------------------------------------------ updated_at

create function public.materials_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.materials_set_updated_at() from public, anon, authenticated;

create trigger materials_set_updated_at
  before update on public.materials
  for each row execute function public.materials_set_updated_at();

-- ------------------------------------------------------------------- RLS

alter table public.materials enable row level security;

-- Supabase grants everything to anon and authenticated by default, including
-- TRUNCATE, which RLS does not stop.
revoke all on public.materials from public, anon, authenticated;

-- Columns a client may set. id, created_by and the timestamps come from
-- defaults. Only the name and the threshold can change: the site, the
-- organisation and the unit are fixed once the material exists.
grant select on public.materials to authenticated;
grant insert (org_id, site_id, name, unit, low_stock_threshold) on public.materials to authenticated;
grant update (name, low_stock_threshold) on public.materials to authenticated;

-- No DELETE grant or policy: the ledger will point at a material, and its
-- history must outlive it.

create policy materials_select on public.materials
  for select to authenticated
  using (public.has_site_access(site_id));

-- has_site_access as well, so a site from another organisation fails here,
-- inside RLS, before any constraint could hint at what that site holds.
create policy materials_insert on public.materials
  for insert to authenticated
  with check (public.can_manage_sites(org_id) and public.has_site_access(site_id));

create policy materials_update on public.materials
  for update to authenticated
  using      (public.can_manage_sites(org_id))
  with check (public.can_manage_sites(org_id));

-- ----------------------------------------------------------------- audit

create trigger materials_audit
  after insert or update or delete on public.materials
  for each row execute function public.write_audit();
