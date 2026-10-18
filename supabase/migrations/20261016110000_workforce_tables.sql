-- Workforce: workers, worker_site_assignments, worker_wage_rates.
-- Owner: Ishant. Issue #23. Decisions W1-W8 in ADR-010.
--
-- All three tables have RLS enabled and no grants here, so they are closed to
-- every client until the policies migration. Nothing is ever deleted: a worker
-- is deactivated or anonymized, an assignment is closed, a rate is superseded.

-- ---------------------------------------------------------------- workers

create table public.workers (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete restrict,

  -- W4: chosen by the contractor (their own register number), unique per
  -- organisation ignoring case. Import is keyed on it.
  code          text not null
                check (code = btrim(code) and char_length(code) between 1 and 40),
  full_name     text not null
                check (char_length(btrim(full_name)) between 1 and 120),
  -- W5: name and an optional phone. Nothing else personal in the MVP.
  phone         text check (phone is null or phone ~ '^[0-9+][0-9 ()-]{5,19}$'),
  trade         text not null
                check (char_length(btrim(trade)) between 1 and 60),
  -- W1: daily or hourly. Overtime pay is a Wage Summaries concern.
  pay_type      text not null check (pay_type in ('daily', 'hourly')),
  status        text not null default 'active' check (status in ('active', 'inactive')),

  created_by    uuid not null default auth.uid() references auth.users (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- Set only by anonymize_worker(). An anonymized worker keeps the row and its
  -- history but no personal fields.
  anonymized_at timestamptz,

  constraint workers_anonymized_inactive check (anonymized_at is null or status = 'inactive'),
  -- Target for the composite foreign keys that keep child rows in one org.
  constraint workers_id_org_unique unique (id, org_id)
);

create unique index workers_org_code_unique on public.workers (org_id, lower(code));

create function public.workers_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.workers_set_updated_at() from public, anon, authenticated;

create trigger workers_set_updated_at
  before update on public.workers
  for each row execute function public.workers_set_updated_at();

-- -------------------------------------------------- worker_site_assignments

create table public.worker_site_assignments (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  worker_id     uuid not null,
  site_id       uuid not null,

  assigned_by   uuid not null default auth.uid() references auth.users (id),
  assigned_at   timestamptz not null default now(),
  unassigned_at timestamptz,
  unassigned_by uuid references auth.users (id),

  -- The worker and the site are both in this organisation.
  constraint wsa_worker_fk foreign key (worker_id, org_id)
    references public.workers (id, org_id) on delete restrict,
  constraint wsa_site_fk foreign key (site_id, org_id)
    references public.sites (id, org_id) on delete restrict,

  constraint wsa_unassigned_consistent
    check ((unassigned_at is null) = (unassigned_by is null)),
  constraint wsa_unassigned_after_assigned
    check (unassigned_at is null or unassigned_at >= assigned_at)
);

-- One open assignment per worker per site. A closed one does not block it.
create unique index wsa_one_active
  on public.worker_site_assignments (worker_id, site_id)
  where unassigned_at is null;

create index wsa_worker_id_idx on public.worker_site_assignments (worker_id);
create index wsa_site_id_idx   on public.worker_site_assignments (site_id);

-- No new assignment on an archived site, and none for an inactive worker.
-- SECURITY DEFINER so the check sees both rows whatever the caller's RLS;
-- FOR SHARE waits for a concurrent archive_site() or deactivation.
create function public.wsa_reject_archived_or_inactive()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform 1 from public.sites s
  where s.id = new.site_id and s.status = 'archived'
  for share;
  if found then
    raise exception 'site % is archived', new.site_id using errcode = '55000';
  end if;

  perform 1 from public.workers w
  where w.id = new.worker_id and w.status <> 'active'
  for share;
  if found then
    raise exception 'worker % is not active', new.worker_id using errcode = '55000';
  end if;

  return new;
end;
$$;

-- Closing is stamped by the server: the client says "close it", the time and
-- the person come from now() and auth.uid().
create function public.wsa_stamp_unassign()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.unassigned_at is null and new.unassigned_at is not null then
    new.unassigned_at := now();
    new.unassigned_by := auth.uid();
  end if;
  return new;
end;
$$;

revoke all on function public.wsa_reject_archived_or_inactive() from public, anon, authenticated;
revoke all on function public.wsa_stamp_unassign()              from public, anon, authenticated;

create trigger wsa_reject_archived_or_inactive
  before insert on public.worker_site_assignments
  for each row execute function public.wsa_reject_archived_or_inactive();

create trigger wsa_stamp_unassign
  before update on public.worker_site_assignments
  for each row execute function public.wsa_stamp_unassign();

-- ------------------------------------------------------ worker_wage_rates
-- W2/W3: effective-dated, append-only. A new rate is a new row; the old one
-- stays. Amounts are rupees (currency is INR for every organisation).

create table public.worker_wage_rates (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null,
  worker_id      uuid not null,
  rate           numeric(12,2) not null check (rate > 0),
  effective_from date not null,

  created_by     uuid not null default auth.uid() references auth.users (id),
  created_at     timestamptz not null default now(),

  constraint wwr_worker_fk foreign key (worker_id, org_id)
    references public.workers (id, org_id) on delete restrict,
  -- Two rates for the same worker cannot start the same day.
  constraint wwr_worker_effective_unique unique (worker_id, effective_from)
);

create index wwr_org_id_idx on public.worker_wage_rates (org_id);

-- ------------------------------------------------------------------- RLS

alter table public.workers                 enable row level security;
alter table public.worker_site_assignments enable row level security;
alter table public.worker_wage_rates       enable row level security;

-- Supabase grants everything to anon and authenticated by default, including
-- TRUNCATE, which RLS does not stop.
revoke all on public.workers, public.worker_site_assignments, public.worker_wage_rates
  from public, anon, authenticated;
