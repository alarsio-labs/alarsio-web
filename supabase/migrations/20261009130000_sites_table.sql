-- Sites: the sites table, its constraints, and RLS switched on.
-- Owner: Manish. Issue #8. Decisions D1–D13 in ADR-007.
--
-- RLS is enabled with no policies and no grants, so the table is closed to every
-- client until the policies migration. Those call has_site_access and
-- can_manage_sites, which Identity publishes after this table exists.
-- The audit trigger arrives once Audit publishes write_audit().

-- ---------------------------------------------------------------- table

create table public.sites (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations (id) on delete restrict,

  name              text not null
                    check (name = btrim(name) and char_length(name) between 1 and 120),
  address           text not null
                    check (char_length(btrim(address)) between 1 and 500),

  -- numeric(9,6) is about 0.1 m of precision, and compares exactly.
  latitude          numeric(9,6) not null check (latitude  between  -90 and  90),
  longitude         numeric(9,6) not null check (longitude between -180 and 180),
  -- D1: whole metres. Phone GPS is not better than ~10 m, so fractions add nothing.
  geofence_radius_m integer not null default 200
                    check (geofence_radius_m between 50 and 2000),

  -- D2: text + check, so a value can be replaced in a later migration.
  -- D5: 'archived' is terminal and is reached only through archive_site().
  status            text not null default 'planned'
                    check (status in ('planned', 'active', 'paused', 'completed', 'archived')),

  created_by        uuid not null default auth.uid() references auth.users (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  archived_at       timestamptz,
  archived_by       uuid references auth.users (id),

  -- An archived site always says when and by whom; a live one never does.
  constraint sites_archived_consistent check (
    (status = 'archived') = (archived_at is not null)
    and (archived_at is null) = (archived_by is null)
  ),

  -- Target for site_assignments' composite FK, which keeps an assignment in
  -- the same organisation as its site.
  constraint sites_id_org_unique unique (id, org_id)
);

-- D4: one name per organisation, case-insensitive, archived sites included.
-- Leading on org_id, this also serves "all sites in my organisation".
create unique index sites_org_name_unique on public.sites (org_id, lower(name));

-- ------------------------------------------------------------ updated_at

create function public.sites_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.sites_set_updated_at() from public, anon, authenticated;

create trigger sites_set_updated_at
  before update on public.sites
  for each row execute function public.sites_set_updated_at();

-- ------------------------------------------------------------------- RLS

alter table public.sites enable row level security;

-- Closed until the policies migration. Supabase grants everything to anon and
-- authenticated by default, including TRUNCATE, which RLS does not stop.
revoke all on public.sites from public, anon, authenticated;
