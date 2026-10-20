-- Wage Summaries: the tables. Owners: Ishant and Manish. Issue #61, ADR-035.
--
--   wage_periods         one per organisation per week or month; draft or locked
--   wage_lines           one per worker per period, computed by calculate_wage_period()
--   wage_line_days       the snapshot a line was computed from: one row per worker, site and
--                        date, with the status and hours Attendance published, the rate in
--                        force that day and the day's unrounded amounts
--   wage_adjustments     append-only signed rupee rows with a reason (a paid leave day, an
--                        advance recovered, the difference from a correction after a lock)
--   wage_period_reopens  append-only history of every reopen, with the owner's reason
--
-- A client writes exactly two things here: a draft period (insert) and an adjustment
-- (insert). Everything else is written by the functions in the next migration, which
-- check the caller themselves. Nothing is ever deleted.

-- Two periods of one organisation may not share a day (decision 7). The exclusion
-- constraint below needs btree_gist for the uuid equality.
create extension if not exists btree_gist;

-- ---------------------------------------------------------------- constants
-- One place for the two numbers the formulas share (decisions 3 and 4). Changing
-- either is a migration, and only a draft period picks it up.

create function public.wage_standard_day_hours()
returns numeric language sql immutable
as $$ select 8::numeric $$;

create function public.wage_overtime_multiplier()
returns numeric language sql immutable
as $$ select 2::numeric $$;

revoke all on function public.wage_standard_day_hours()   from public, anon, authenticated;
revoke all on function public.wage_overtime_multiplier()  from public, anon, authenticated;

-- ------------------------------------------------------------- wage_periods

create table public.wage_periods (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id),
  period_type   text not null check (period_type in ('week', 'month')),
  start_date    date not null,
  end_date      date not null,
  status        text not null default 'draft' check (status in ('draft', 'locked')),
  calculated_at timestamptz,
  locked_at     timestamptz,
  locked_by     uuid references auth.users (id),

  created_by    uuid not null default auth.uid() references auth.users (id),
  created_at    timestamptz not null default now(),

  constraint wage_periods_id_org_unique unique (id, org_id),

  -- A week is seven days from any start; a month is a whole calendar month.
  constraint wage_periods_shape check (
    (period_type = 'week' and end_date = start_date + 6)
    or (period_type = 'month'
        and extract(day from start_date) = 1
        and end_date = (start_date + interval '1 month')::date - 1)
  ),
  -- Locked says who and when; a draft carries no lock stamp.
  constraint wage_periods_lock_stamp check (
    (status = 'locked') = (locked_at is not null)
    and (status = 'locked') = (locked_by is not null)
  ),
  constraint wage_periods_no_overlap
    exclude using gist (org_id with =, daterange(start_date, end_date, '[]') with &&)
);

-- ---------------------------------------------------------------- wage_lines
-- Amounts are rupees, kept to the paisa (decision 6): each of pay and overtime is the
-- full-precision sum of the line's days, rounded once. The total is pay + overtime +
-- adjustments and is computed by wage_summary, so an adjustment never edits a line.

create table public.wage_lines (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null,
  period_id       uuid not null,
  worker_id       uuid not null,
  pay_type        text not null check (pay_type in ('daily', 'hourly')),
  payable_days    numeric(6,2) not null default 0 check (payable_days >= 0),
  overtime_hours  numeric(8,2) not null default 0 check (overtime_hours >= 0),
  -- The lowest and highest rate paid in the period, so a mid-period change shows.
  rate_from       numeric(12,2),
  rate_to         numeric(12,2),
  pay_amount      numeric(12,2) not null default 0,
  overtime_amount numeric(12,2) not null default 0,
  -- Rows (one per site and date) that are payable but have no rate (decision 5).
  no_rate_days    integer not null default 0 check (no_rate_days >= 0),
  calculated_at   timestamptz not null default now(),

  constraint wage_lines_period_fk foreign key (period_id, org_id)
    references public.wage_periods (id, org_id) on delete restrict,
  constraint wage_lines_worker_fk foreign key (worker_id, org_id)
    references public.workers (id, org_id) on delete restrict,
  constraint wage_lines_one_per_worker unique (period_id, worker_id)
);

create index wage_lines_org_id_idx on public.wage_lines (org_id);

-- ------------------------------------------------------------ wage_line_days
-- The snapshot. status and overtime_hours are what approved_attendance_days showed when
-- the period was last calculated, so a locked period can be compared with the view later.
-- payable_days is after the one-day-per-date cap (decision 2): a worker present at two
-- sites on one date is one day, given to the first site in site id order.

create table public.wage_line_days (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null,
  period_id       uuid not null,
  worker_id       uuid not null,
  site_id         uuid not null,
  work_date       date not null,
  status          text not null check (status in ('present', 'absent', 'half_day', 'leave')),
  overtime_hours  numeric(4,2) not null default 0 check (overtime_hours between 0 and 8),
  payable_days    numeric(3,2) not null check (payable_days between 0 and 1),
  rate            numeric(12,2),
  -- Unrounded, so the line rounds once. Null only when there is no rate.
  day_amount      numeric,
  overtime_amount numeric,

  constraint wage_line_days_line_fk foreign key (period_id, worker_id)
    references public.wage_lines (period_id, worker_id) on delete restrict,
  constraint wage_line_days_period_fk foreign key (period_id, org_id)
    references public.wage_periods (id, org_id) on delete restrict,
  constraint wage_line_days_site_fk foreign key (site_id, org_id)
    references public.sites (id, org_id) on delete restrict,
  constraint wage_line_days_one_row unique (period_id, worker_id, site_id, work_date)
);

create index wage_line_days_org_id_idx on public.wage_line_days (org_id);

-- ----------------------------------------------------------- wage_adjustments
-- Signed rupees: positive pays, negative recovers. A correction is a new row.

create table public.wage_adjustments (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  period_id   uuid not null,
  worker_id   uuid not null,
  amount      numeric(12,2) not null check (amount <> 0),
  reason      text not null check (char_length(btrim(reason)) between 1 and 500),

  created_by  uuid not null default auth.uid() references auth.users (id),
  created_at  timestamptz not null default now(),

  constraint wage_adjustments_period_fk foreign key (period_id, org_id)
    references public.wage_periods (id, org_id) on delete restrict,
  -- The worker must have a line, or the summary would not show the row.
  constraint wage_adjustments_line_fk foreign key (period_id, worker_id)
    references public.wage_lines (period_id, worker_id) on delete restrict
);

create index wage_adjustments_org_id_idx on public.wage_adjustments (org_id);
create index wage_adjustments_line_idx on public.wage_adjustments (period_id, worker_id);

-- ------------------------------------------------------- wage_period_reopens

create table public.wage_period_reopens (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  period_id   uuid not null,
  reopened_by uuid not null default auth.uid() references auth.users (id),
  reopened_at timestamptz not null default now(),
  reason      text not null check (char_length(btrim(reason)) between 1 and 500),
  -- The lock this reopen undid.
  locked_at   timestamptz not null,
  locked_by   uuid not null references auth.users (id),

  constraint wage_period_reopens_period_fk foreign key (period_id, org_id)
    references public.wage_periods (id, org_id) on delete restrict
);

create index wage_period_reopens_org_id_idx on public.wage_period_reopens (org_id);

-- --------------------------------------------------------------------- guards

-- Ledgers are append-only for every writer, the table owner included.
create function public.wage_block_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception '% is append-only: add a new row instead', tg_table_name using errcode = '55000';
end;
$$;

create trigger wage_adjustments_append_only
  before update or delete on public.wage_adjustments
  for each row execute function public.wage_block_mutation();

create trigger wage_period_reopens_append_only
  before update or delete on public.wage_period_reopens
  for each row execute function public.wage_block_mutation();

-- Nothing is ever deleted, by any writer, the table owner included. Recalculation
-- upserts, so it never needs a delete.
create trigger wage_periods_no_delete
  before delete on public.wage_periods
  for each row execute function public.wage_block_mutation();
create trigger wage_lines_no_delete
  before delete on public.wage_lines
  for each row execute function public.wage_block_mutation();
create trigger wage_line_days_no_delete
  before delete on public.wage_line_days
  for each row execute function public.wage_block_mutation();

-- A locked period is frozen: no line, no snapshot day and no adjustment can be written
-- while it is locked. SECURITY DEFINER so the caller's RLS cannot hide the period.
-- The read takes FOR KEY SHARE, so a write that arrives while lock_wage_period holds the
-- period FOR UPDATE waits for it and then sees the row as locked. A plain read would see
-- the committed draft and let an adjustment into a period that is being locked.
create function public.wage_reject_locked_period()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  select p.status into v_status from public.wage_periods p where p.id = new.period_id for key share;
  if v_status = 'locked' then
    raise exception 'wage period % is locked', new.period_id using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger wage_lines_locked_guard
  before insert or update on public.wage_lines
  for each row execute function public.wage_reject_locked_period();
create trigger wage_line_days_locked_guard
  before insert or update on public.wage_line_days
  for each row execute function public.wage_reject_locked_period();
create trigger wage_adjustments_locked_guard
  before insert on public.wage_adjustments
  for each row execute function public.wage_reject_locked_period();

-- A locked period takes no update at all (reopen_wage_period changes it back to draft
-- in the one UPDATE that this guard lets through, because the row is still locked in
-- old and draft in new). Its organisation, type and dates never change.
create function public.wage_periods_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'locked' and new.status = 'locked' then
    raise exception 'wage period % is locked', old.id using errcode = '55000';
  end if;
  if (new.org_id, new.period_type, new.start_date, new.end_date, new.created_by, new.created_at)
     is distinct from
     (old.org_id, old.period_type, old.start_date, old.end_date, old.created_by, old.created_at) then
    raise exception 'a wage period''s organisation, type and dates cannot change' using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger wage_periods_guard
  before update on public.wage_periods
  for each row execute function public.wage_periods_guard();

revoke all on function public.wage_block_mutation()        from public, anon, authenticated;
revoke all on function public.wage_reject_locked_period()  from public, anon, authenticated;
revoke all on function public.wage_periods_guard()         from public, anon, authenticated;

-- ------------------------------------------------------------------- audit

create trigger wage_periods_audit
  after insert or update or delete on public.wage_periods
  for each row execute function public.write_audit();
create trigger wage_lines_audit
  after insert or update or delete on public.wage_lines
  for each row execute function public.write_audit();
create trigger wage_line_days_audit
  after insert or update or delete on public.wage_line_days
  for each row execute function public.write_audit();
create trigger wage_adjustments_audit
  after insert or update or delete on public.wage_adjustments
  for each row execute function public.write_audit();
create trigger wage_period_reopens_audit
  after insert or update or delete on public.wage_period_reopens
  for each row execute function public.write_audit();

-- --------------------------------------------------------------- RLS and grants
-- Owner and accountant only (can_view_wages). A project manager and a supervisor read
-- nothing here (SECURITY.md).

alter table public.wage_periods        enable row level security;
alter table public.wage_lines          enable row level security;
alter table public.wage_line_days      enable row level security;
alter table public.wage_adjustments    enable row level security;
alter table public.wage_period_reopens enable row level security;

revoke all on public.wage_periods, public.wage_lines, public.wage_line_days,
              public.wage_adjustments, public.wage_period_reopens
  from public, anon, authenticated;

grant select on public.wage_periods, public.wage_lines, public.wage_line_days,
                public.wage_adjustments, public.wage_period_reopens to authenticated;

-- status, the lock stamp and calculated_at have no client grant: they move only through
-- the functions.
grant insert (org_id, period_type, start_date, end_date) on public.wage_periods to authenticated;
grant insert (org_id, period_id, worker_id, amount, reason) on public.wage_adjustments to authenticated;

create policy wage_periods_select on public.wage_periods
  for select to authenticated using (public.can_view_wages(org_id));
create policy wage_periods_insert on public.wage_periods
  for insert to authenticated with check (public.can_view_wages(org_id));

create policy wage_lines_select on public.wage_lines
  for select to authenticated using (public.can_view_wages(org_id));
create policy wage_line_days_select on public.wage_line_days
  for select to authenticated using (public.can_view_wages(org_id));
create policy wage_period_reopens_select on public.wage_period_reopens
  for select to authenticated using (public.can_view_wages(org_id));

create policy wage_adjustments_select on public.wage_adjustments
  for select to authenticated using (public.can_view_wages(org_id));
create policy wage_adjustments_insert on public.wage_adjustments
  for insert to authenticated with check (public.can_view_wages(org_id));
