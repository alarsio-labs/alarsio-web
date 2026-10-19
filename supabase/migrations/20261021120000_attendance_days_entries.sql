-- Attendance & Site Presence: attendance_days and attendance_entries, with RLS,
-- the roster rule and audit. Owner: Manish. Issue #28. Decisions D2-D6, D10, D11
-- in ADR-021.
--
-- A day is one row per site per date (D4). An entry is one row per worker per day,
-- and points at its day by the natural key (org_id, site_id, attendance_date), not
-- by the day's id (D5). So two phones that each open the same day offline, with
-- different uuids, do not strand each other's entries.
--
-- The day carries its final shape now (D11): a status and the reviewer's stamp.
-- In this PR no client can write them, so every day is 'open'. The review
-- function and the approved-day lock arrive in the next PR.

-- ------------------------------------------------------------ local date
-- "Which day was this" for an assignment timestamp: the Asia/Kolkata calendar
-- day (D10). One function, so a different rule is one change. Pure, so it is
-- safe to execute for every signed-in user (the roster trigger runs as the caller).
create function public.attendance_local_date(p_ts timestamptz)
returns date
language sql
immutable
set search_path = public
as $$
  select (p_ts at time zone 'Asia/Kolkata')::date;
$$;

revoke all on function public.attendance_local_date(timestamptz) from public, anon;
grant execute on function public.attendance_local_date(timestamptz) to authenticated;

-- ----------------------------------------------------------- attendance_days

create table public.attendance_days (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null,
  site_id         uuid not null,
  -- The day the work was done, chosen on the phone as a calendar date.
  attendance_date date not null,

  recorded_by     uuid not null default auth.uid() references auth.users (id),

  -- D11. Written only by the review function (next PR).
  status          text not null default 'open'
                  check (status in ('open', 'approved', 'rejected')),
  reviewed_by     uuid references auth.users (id),
  reviewed_at     timestamptz,
  review_reason   text,

  created_at      timestamptz not null default now(),

  -- The site is in this organisation.
  constraint attendance_days_site_fk foreign key (site_id, org_id)
    references public.sites (id, org_id) on delete restrict,

  -- Target of the entries' composite foreign key (D5).
  constraint attendance_days_natural_key unique (org_id, site_id, attendance_date),

  constraint attendance_days_reason_trimmed
    check (review_reason is null
           or (review_reason = btrim(review_reason) and char_length(review_reason) between 1 and 500)),
  -- An open day carries no review stamp, a reviewed one says who and when, and a
  -- rejection says why.
  constraint attendance_days_review_consistent check (
    (status = 'open' and reviewed_by is null and reviewed_at is null and review_reason is null)
    or (status = 'approved' and reviewed_by is not null and reviewed_at is not null)
    or (status = 'rejected' and reviewed_by is not null and reviewed_at is not null
        and review_reason is not null)
  )
);

-- D4: one day per site per date. Leading on site_id, this also serves "the days of
-- this site" and the date lookups of Wage Summaries.
create unique index attendance_days_site_date_unique
  on public.attendance_days (site_id, attendance_date);

-- A date can be at most UTC today + 1 (India is ahead of UTC), as in ADR-017.
create function public.attendance_days_check_date()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.attendance_date > (now() at time zone 'utc')::date + 1 then
    raise exception 'attendance_date % is in the future', new.attendance_date
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.attendance_days_check_date() from public, anon, authenticated;

create trigger attendance_days_check_date
  before insert on public.attendance_days
  for each row execute function public.attendance_days_check_date();

-- ------------------------------------------------------- attendance_entries

create table public.attendance_entries (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null,
  site_id         uuid not null,
  attendance_date date not null,
  worker_id       uuid not null,

  -- D2: half a day is a status, not a fraction.
  status          text not null
                  check (status in ('present', 'absent', 'half_day', 'leave')),
  -- D3: hours, 0 to 8. Raising the maximum is a migration.
  overtime_hours  numeric(4,2) not null default 0
                  check (overtime_hours between 0 and 8),
  note            text
                  check (note is null or (note = btrim(note) and char_length(note) between 1 and 500)),

  recorded_by     uuid not null default auth.uid() references auth.users (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- D5: the day, by natural key. It also keeps the entry in the day's site and
  -- organisation.
  constraint attendance_entries_day_fk foreign key (org_id, site_id, attendance_date)
    references public.attendance_days (org_id, site_id, attendance_date) on delete restrict,
  -- The worker is in this organisation.
  constraint attendance_entries_worker_fk foreign key (worker_id, org_id)
    references public.workers (id, org_id) on delete restrict,

  -- One entry per worker per day. Two phones marking the same worker is a real
  -- disagreement: the first writer wins, the second hears conflict (#34).
  constraint attendance_entries_one_per_day unique (site_id, attendance_date, worker_id),
  -- Overtime belongs to a day worked.
  constraint attendance_entries_overtime_needs_work
    check (status in ('present', 'half_day') or overtime_hours = 0)
);

create index attendance_entries_worker_idx on public.attendance_entries (worker_id);
create index attendance_entries_site_idx   on public.attendance_entries (site_id);

create function public.attendance_entries_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.attendance_entries_set_updated_at() from public, anon, authenticated;

create trigger attendance_entries_set_updated_at
  before update on public.attendance_entries
  for each row execute function public.attendance_entries_set_updated_at();

-- ------------------------------------------------------------- roster rule
-- A worker must have been rostered at the site on the entry's date, read through
-- Workforce's published view worker_roster and nothing else. "Rostered on a date"
-- is the Asia/Kolkata calendar day, both ends inclusive: the day the assignment
-- began and the day it ended both count.
--
-- An AFTER trigger, on purpose. It runs as the caller, so worker_roster answers
-- under the caller's RLS, and it runs after the policy and the foreign keys: a
-- caller who may not record here gets 42501, another organisation's worker gets
-- 23503, and only a real roster miss gets 23514. Raising rolls the row back.
-- The worker's own status is not tested: a worker retired since is still on
-- the roster of the days they worked.

create function public.attendance_entries_check_roster()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.worker_roster r
    where r.worker_id = new.worker_id
      and r.site_id = new.site_id
      and public.attendance_local_date(r.assigned_at) <= new.attendance_date
      and (r.unassigned_at is null
           or public.attendance_local_date(r.unassigned_at) >= new.attendance_date)
  ) then
    raise exception 'worker % was not rostered at site % on %',
      new.worker_id, new.site_id, new.attendance_date
      using errcode = '23514';
  end if;
  return null;
end;
$$;

revoke all on function public.attendance_entries_check_roster() from public, anon, authenticated;

create trigger attendance_entries_check_roster
  after insert on public.attendance_entries
  for each row execute function public.attendance_entries_check_roster();

-- ------------------------------------------------------------------- RLS

alter table public.attendance_days    enable row level security;
alter table public.attendance_entries enable row level security;

-- Supabase grants everything to anon and authenticated by default, including
-- TRUNCATE, which RLS does not stop. Nobody deletes a day or an entry.
revoke all on public.attendance_days, public.attendance_entries from public, anon, authenticated;

grant select on public.attendance_days to authenticated;
-- A day is opened by naming it. No column of a day is updatable by a client: its
-- status and review stamp are written by the review function (next PR).
grant insert (id, org_id, site_id, attendance_date) on public.attendance_days to authenticated;

grant select on public.attendance_entries to authenticated;
grant insert (id, org_id, site_id, attendance_date, worker_id, status, overtime_hours, note)
  on public.attendance_entries to authenticated;
-- The worker, the day and the site are fixed once the entry exists.
grant update (status, overtime_hours, note) on public.attendance_entries to authenticated;

create policy attendance_days_select on public.attendance_days
  for select to authenticated
  using (public.has_site_access(site_id));

create policy attendance_days_insert on public.attendance_days
  for insert to authenticated
  with check (public.can_record_on_site(site_id));

create policy attendance_entries_select on public.attendance_entries
  for select to authenticated
  using (public.has_site_access(site_id));

create policy attendance_entries_insert on public.attendance_entries
  for insert to authenticated
  with check (public.can_record_on_site(site_id));

-- Any supervisor assigned to the site may fix an exception on it. The lock on an
-- approved day is added to this policy in the next PR.
create policy attendance_entries_update on public.attendance_entries
  for update to authenticated
  using      (public.can_record_on_site(site_id))
  with check (public.can_record_on_site(site_id));

-- ----------------------------------------------------------------- audit

create trigger attendance_days_audit
  after insert or update or delete on public.attendance_days
  for each row execute function public.write_audit();

create trigger attendance_entries_audit
  after insert or update or delete on public.attendance_entries
  for each row execute function public.write_audit();
