-- Identity & Access, week 1: organizations, profiles, memberships and the two
-- permission predicates every other module's RLS calls.
-- Owner: Ishant. See ADR-006 for the column and enum choices.

create type public.app_role as enum (
  'owner', 'project_manager', 'supervisor', 'accountant'
);

-- ---------------------------------------------------------------- tables

create table public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) between 1 and 120),
  timezone   text not null default 'Asia/Kolkata',
  currency   text not null default 'INR' check (currency = 'INR'),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

create table public.profiles (
  id         uuid primary key references auth.users (id),
  full_name  text not null check (char_length(btrim(full_name)) between 1 and 120),
  created_at timestamptz not null default now()
);

create table public.memberships (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id),
  user_id    uuid not null references auth.users (id),
  role       public.app_role not null,
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);

create index memberships_user_id_idx on public.memberships (user_id);

-- ------------------------------------------------------------ predicates
-- SECURITY DEFINER so policies on memberships can call them without recursing
-- into their own RLS.

create function public.is_org_member(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    where m.org_id = p_org_id and m.user_id = auth.uid()
  );
$$;

create function public.is_org_owner(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    where m.org_id = p_org_id and m.user_id = auth.uid() and m.role = 'owner'
  );
$$;

-- Bootstrap: the only way to create an organization. The caller becomes its
-- first owner. Checks the caller itself because it runs as the definer.
create function public.create_organization(
  p_name     text,
  p_timezone text default 'Asia/Kolkata'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 120 then
    raise exception 'invalid organization name' using errcode = '22023';
  end if;
  if not exists (select 1 from pg_timezone_names where name = p_timezone) then
    raise exception 'invalid timezone' using errcode = '22023';
  end if;

  insert into public.organizations (name, timezone, created_by)
  values (btrim(p_name), p_timezone, v_uid)
  returning id into v_org;

  insert into public.memberships (org_id, user_id, role)
  values (v_org, v_uid, 'owner');

  return v_org;
end;
$$;

revoke all on function public.is_org_member(uuid)               from public, anon;
revoke all on function public.is_org_owner(uuid)                from public, anon;
revoke all on function public.create_organization(text, text)   from public, anon;
grant execute on function public.is_org_member(uuid)             to authenticated;
grant execute on function public.is_org_owner(uuid)              to authenticated;
grant execute on function public.create_organization(text, text) to authenticated;

-- ------------------------------------------------------------------- RLS

alter table public.organizations enable row level security;
alter table public.profiles      enable row level security;
alter table public.memberships   enable row level security;

-- Table privileges: nothing for anon, and no delete for anyone.
revoke all on public.organizations, public.profiles, public.memberships
  from public, anon, authenticated;

grant select on public.organizations to authenticated;
grant update (name, timezone) on public.organizations to authenticated;

grant select, insert on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;

grant select, insert on public.memberships to authenticated;
grant update (role) on public.memberships to authenticated;

-- organizations: members read, owners edit. Rows are created only through
-- create_organization(), so there is no insert policy.
create policy organizations_select on public.organizations
  for select to authenticated
  using (public.is_org_member(id));

create policy organizations_update on public.organizations
  for update to authenticated
  using (public.is_org_owner(id))
  with check (public.is_org_owner(id));

-- profiles: each user sees and edits only their own.
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid());

create policy profiles_insert on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

create policy profiles_update on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- memberships: members read their org, owners write.
create policy memberships_select on public.memberships
  for select to authenticated
  using (public.is_org_member(org_id));

create policy memberships_insert on public.memberships
  for insert to authenticated
  with check (public.is_org_owner(org_id));

create policy memberships_update on public.memberships
  for update to authenticated
  using (public.is_org_owner(org_id))
  with check (public.is_org_owner(org_id));
