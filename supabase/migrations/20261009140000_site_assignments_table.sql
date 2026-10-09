-- Sites: the site_assignments table, its constraints and indexes, RLS switched on.
-- Owner: Manish. Issue #8.
--
-- Closed to every client until the policies migration, which needs Identity's
-- predicates. Those predicates read this table, so it must exist before them.
--
-- D8: unassigning closes a row (unassigned_at); rows are never deleted, so
-- Attendance can always ask who was assigned to a site on a given date.

-- ---------------------------------------------------------------- table

create table public.site_assignments (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  site_id       uuid not null,
  user_id       uuid not null,

  assigned_by   uuid not null default auth.uid() references auth.users (id),
  assigned_at   timestamptz not null default now(),
  unassigned_at timestamptz,
  unassigned_by uuid references auth.users (id),

  -- The site is in this organisation.
  constraint site_assignments_site_fk foreign key (site_id, org_id)
    references public.sites (id, org_id) on delete restrict,
  -- D9: the user is a member of this organisation.
  constraint site_assignments_member_fk foreign key (org_id, user_id)
    references public.memberships (org_id, user_id) on delete restrict,

  constraint site_assignments_unassigned_consistent
    check ((unassigned_at is null) = (unassigned_by is null)),
  constraint site_assignments_unassigned_after_assigned
    check (unassigned_at is null or unassigned_at >= assigned_at)
);

-- One open assignment per user per site. A closed one does not block reassigning.
create unique index site_assignments_one_active
  on public.site_assignments (site_id, user_id)
  where unassigned_at is null;

create index site_assignments_user_id_idx on public.site_assignments (user_id);
create index site_assignments_site_id_idx on public.site_assignments (site_id);

-- --------------------------------------------------------------- guards

-- No new assignment on an archived site. SECURITY DEFINER so the check sees the
-- site whatever the caller's RLS; FOR SHARE waits for an archive_site() that
-- holds the row, so the two cannot interleave.
create function public.site_assignments_reject_archived_site()
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
  return new;
end;
$$;

-- Closing is stamped by the server: the client only says "close it", and the
-- time and the person come from now() and auth.uid().
create function public.site_assignments_stamp_unassign()
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

revoke all on function public.site_assignments_reject_archived_site() from public, anon, authenticated;
revoke all on function public.site_assignments_stamp_unassign()       from public, anon, authenticated;

create trigger site_assignments_reject_archived_site
  before insert on public.site_assignments
  for each row execute function public.site_assignments_reject_archived_site();

create trigger site_assignments_stamp_unassign
  before update on public.site_assignments
  for each row execute function public.site_assignments_stamp_unassign();

-- ------------------------------------------------------------------- RLS

alter table public.site_assignments enable row level security;

revoke all on public.site_assignments from public, anon, authenticated;
