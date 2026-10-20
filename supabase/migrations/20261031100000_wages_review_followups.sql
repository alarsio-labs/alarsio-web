-- Wage Summaries: follow-ups from the review of #103 (ADR-035). Owners: Ishant and Manish.
--
-- #103 is merged, so its two migrations are not edited; this one changes what the review
-- asked for:
--   1. Workforce publishes worker_pay_basis, and Wage Summaries reads it instead of the
--      private `workers` table (the calculation, the recalculation and wage_summary).
--   2. An adjustment is at most 10,00,000 rupees either way, so a line total always fits
--      numeric(12,2).
--   3. The overtime paid on one date is capped at 8 hours across sites; the hours as
--      recorded stay in overtime_hours and the hours paid are payable_overtime_hours.
--   4. lock_wage_period refuses until the period has ended (Asia/Kolkata).
--   5. wage_recalculate no longer carries an unused variable.

-- ------------------------------------------------------------ Workforce: worker_pay_basis
-- ARCHITECTURE.md publishes only worker_effective_rates and worker_roster for Workforce.
-- worker_roster is one row per assignment and follows has_site_access, so an accountant
-- with no site assignment reads nothing from it, and worker_effective_rates has no name or
-- pay type. This is one row per worker with the code and name to show and the pay type that
-- says what a rate means (ADR-011 W11). security_invoker, so it follows the workers
-- policies (owner, project manager, and an accountant by ADR-011 W10) and exposes nothing
-- the caller cannot already read there. No phone, status or timestamps. The wage functions
-- are SECURITY DEFINER and filter on the period's organisation themselves.

create view public.worker_pay_basis
with (security_invoker = true) as
select w.id,
       w.org_id,
       w.code,
       w.full_name,
       w.pay_type
  from public.workers w;

revoke all on public.worker_pay_basis from public, anon, authenticated;
grant select on public.worker_pay_basis to authenticated;

-- ------------------------------------------------------------ adjustment cap
-- A typo cannot push a line total out of numeric(12,2). Ten lakh rupees either way.

alter table public.wage_adjustments
  add constraint wage_adjustments_amount_cap check (abs(amount) <= 1000000);

-- ------------------------------------------------------------ overtime cap
-- Attendance allows 0 to 8 overtime hours per entry (ADR-021 D3). Across sites on one date
-- the hours paid are capped at the same 8.

create function public.wage_max_overtime_hours()
returns numeric language sql immutable
as $$ select 8::numeric $$;

revoke all on function public.wage_max_overtime_hours() from public, anon, authenticated;

-- Rows written before this migration were paid without the cap, so what was paid is what
-- was recorded. The locked-period guard is off for this one backfill, because a locked
-- period must keep exactly the hours it was locked with.
alter table public.wage_line_days
  add column payable_overtime_hours numeric(4,2) not null default 0
    check (payable_overtime_hours between 0 and 8);

alter table public.wage_line_days disable trigger wage_line_days_locked_guard;
update public.wage_line_days set payable_overtime_hours = overtime_hours;
alter table public.wage_line_days enable trigger wage_line_days_locked_guard;

alter table public.wage_line_days alter column payable_overtime_hours drop default;

-- ------------------------------------------------------------ the calculation
-- wage_compute_days has a new column, so it is dropped and created again; nothing else
-- depends on it (the two functions that call it are plpgsql).

drop function public.wage_compute_days(uuid, date, date);

create function public.wage_compute_days(p_org_id uuid, p_start date, p_end date)
returns table (
  worker_id       uuid,
  site_id         uuid,
  work_date       date,
  status          text,
  overtime_hours  numeric,
  payable_days    numeric,
  payable_overtime_hours numeric,
  rate            numeric,
  day_amount      numeric,
  overtime_amount numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with a as (
    select d.worker_id, d.site_id, d.work_date, d.status, d.overtime_hours, w.pay_type,
           case d.status when 'present' then 1.0 when 'half_day' then 0.5 else 0.0 end as v
      from public.approved_attendance_days d
      join public.worker_pay_basis w on w.id = d.worker_id and w.org_id = d.org_id
     where d.org_id = p_org_id
       and d.work_date between p_start and p_end
  ),
  c as (
    -- The caps: what earlier sites (in site id order) already used up of this date. A day
    -- is at most 1, and the overtime paid is at most 8 hours, however many sites recorded it.
    select a.*,
           greatest(0, least(a.v, 1 - coalesce(
             sum(a.v) over (partition by a.worker_id, a.work_date order by a.site_id
                            rows between unbounded preceding and 1 preceding), 0))) as pd,
           greatest(0, least(a.overtime_hours, public.wage_max_overtime_hours() - coalesce(
             sum(a.overtime_hours) over (partition by a.worker_id, a.work_date order by a.site_id
                                         rows between unbounded preceding and 1 preceding), 0))) as po
      from a
  ),
  r as (
    select c.*, public.worker_rate_on(c.worker_id, c.work_date) as rt from c
  )
  select r.worker_id, r.site_id, r.work_date, r.status, r.overtime_hours, r.pd, r.po, r.rt,
         case when r.pd = 0 then 0
              when r.rt is null then null
              when r.pay_type = 'hourly' then r.pd * public.wage_standard_day_hours() * r.rt
              else r.pd * r.rt end,
         case when r.po = 0 then 0
              when r.rt is null then null
              when r.pay_type = 'hourly' then r.po * r.rt * public.wage_overtime_multiplier()
              else r.po * (r.rt / public.wage_standard_day_hours()) * public.wage_overtime_multiplier() end
    from r;
$$;

revoke all on function public.wage_compute_days(uuid, date, date) from public, anon, authenticated;

create or replace function public.wage_recalculate(p_period_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period public.wage_periods;
begin
  select * into v_period from public.wage_periods where id = p_period_id for update;
  if not found then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if v_period.status = 'locked' then
    raise exception 'wage period % is locked', p_period_id using errcode = '55000';
  end if;

  with comp as (
    select * from public.wage_compute_days(v_period.org_id, v_period.start_date, v_period.end_date)
  ),
  agg as (
    select c.worker_id,
           sum(c.payable_days)                                       as payable_days,
           sum(c.payable_overtime_hours)                             as overtime_hours,
           min(c.rate) filter (where c.payable_days > 0 or c.payable_overtime_hours > 0) as rate_from,
           max(c.rate) filter (where c.payable_days > 0 or c.payable_overtime_hours > 0) as rate_to,
           round(coalesce(sum(c.day_amount), 0), 2)                  as pay_amount,
           round(coalesce(sum(c.overtime_amount), 0), 2)             as overtime_amount,
           count(*) filter (where c.rate is null
                              and (c.payable_days > 0 or c.payable_overtime_hours > 0)) as no_rate_days
      from comp c
     group by c.worker_id
  ),
  l as (
    insert into public.wage_lines as wl
      (org_id, period_id, worker_id, pay_type, payable_days, overtime_hours, rate_from, rate_to,
       pay_amount, overtime_amount, no_rate_days)
    select v_period.org_id, v_period.id, g.worker_id, w.pay_type, g.payable_days, g.overtime_hours,
           g.rate_from, g.rate_to, g.pay_amount, g.overtime_amount, g.no_rate_days
      from agg g
      join public.worker_pay_basis w on w.id = g.worker_id and w.org_id = v_period.org_id
    on conflict (period_id, worker_id) do update
       set pay_type = excluded.pay_type, payable_days = excluded.payable_days,
           overtime_hours = excluded.overtime_hours, rate_from = excluded.rate_from,
           rate_to = excluded.rate_to, pay_amount = excluded.pay_amount,
           overtime_amount = excluded.overtime_amount, no_rate_days = excluded.no_rate_days,
           calculated_at = now()
     where (wl.pay_type, wl.payable_days, wl.overtime_hours, wl.rate_from, wl.rate_to,
            wl.pay_amount, wl.overtime_amount, wl.no_rate_days)
           is distinct from
           (excluded.pay_type, excluded.payable_days, excluded.overtime_hours, excluded.rate_from,
            excluded.rate_to, excluded.pay_amount, excluded.overtime_amount, excluded.no_rate_days)
    returning 1
  )
  -- The lines are written by the CTE above even though nothing reads it; both writes are
  -- one statement, so the foreign key from a day to its line is checked at its end.
  insert into public.wage_line_days as wd
    (org_id, period_id, worker_id, site_id, work_date, status, overtime_hours, payable_days,
     payable_overtime_hours, rate, day_amount, overtime_amount)
  select v_period.org_id, v_period.id, c.worker_id, c.site_id, c.work_date, c.status,
         c.overtime_hours, c.payable_days, c.payable_overtime_hours, c.rate, c.day_amount, c.overtime_amount
    from comp c
  on conflict (period_id, worker_id, site_id, work_date) do update
     set status = excluded.status, overtime_hours = excluded.overtime_hours,
         payable_days = excluded.payable_days, payable_overtime_hours = excluded.payable_overtime_hours,
         rate = excluded.rate, day_amount = excluded.day_amount, overtime_amount = excluded.overtime_amount
   where (wd.status, wd.overtime_hours, wd.payable_days, wd.payable_overtime_hours, wd.rate,
          wd.day_amount, wd.overtime_amount)
         is distinct from
         (excluded.status, excluded.overtime_hours, excluded.payable_days, excluded.payable_overtime_hours,
          excluded.rate, excluded.day_amount, excluded.overtime_amount);

  update public.wage_periods set calculated_at = now() where id = p_period_id;
end;
$$;

revoke all on function public.wage_recalculate(uuid) from public, anon, authenticated;

-- Refuses until the period is over (its end date is before today, Asia/Kolkata), so a
-- day approved later cannot fall outside the snapshot of a week that was still running.
-- Recalculates first, so the snapshot is what the view says at the moment of the lock,
-- then refuses while any payable day has no rate. Locking a locked period is a no-op
-- that keeps the first locker.

create or replace function public.lock_wage_period(p_period_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period public.wage_periods;
begin
  -- Permission first, on an unlocked read, so a caller who may not lock this period never
  -- takes a row lock on it; then the row lock, and the status read again under it.
  select * into v_period from public.wage_periods where id = p_period_id;
  if not found or not public.can_view_wages(v_period.org_id) then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  select * into v_period from public.wage_periods where id = p_period_id for update;
  if v_period.status = 'locked' then
    return;
  end if;

  if v_period.end_date >= (now() at time zone 'Asia/Kolkata')::date then
    raise exception 'wage period % has not ended yet', p_period_id using errcode = '55000';
  end if;

  perform public.wage_recalculate(p_period_id);

  if exists (select 1 from public.wage_lines l where l.period_id = p_period_id and l.no_rate_days > 0) then
    raise exception 'wage period % has payable days with no rate', p_period_id using errcode = '55000';
  end if;

  update public.wage_periods
     set status = 'locked', locked_at = now(), locked_by = auth.uid()
   where id = p_period_id;
end;
$$;

create or replace function public.wage_period_attendance_changes(p_period_id uuid)
returns table (
  worker_id               uuid,
  site_id                 uuid,
  work_date               date,
  change                  text,
  snapshot_status         text,
  snapshot_overtime_hours numeric,
  current_status          text,
  current_overtime_hours  numeric,
  amount_difference       numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_period public.wage_periods;
begin
  select * into v_period from public.wage_periods p where p.id = p_period_id;
  if not found or not public.can_view_wages(v_period.org_id) then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if v_period.status <> 'locked' then
    raise exception 'wage period % is not locked', p_period_id using errcode = '55000';
  end if;

  return query
  select coalesce(s.worker_id, c.worker_id),
         coalesce(s.site_id, c.site_id),
         coalesce(s.work_date, c.work_date),
         case when s.worker_id is null then 'approved_after_lock' else 'changed' end,
         s.status, s.overtime_hours,
         c.status, c.overtime_hours,
         round((coalesce(c.day_amount, 0) + coalesce(c.overtime_amount, 0))
               - (coalesce(s.day_amount, 0) + coalesce(s.overtime_amount, 0)), 2)
    from (select d.worker_id, d.site_id, d.work_date, d.status, d.overtime_hours,
                 d.payable_days, d.payable_overtime_hours, d.rate, d.day_amount, d.overtime_amount
            from public.wage_line_days d where d.period_id = p_period_id) s
    full join public.wage_compute_days(v_period.org_id, v_period.start_date, v_period.end_date) c
      on c.worker_id = s.worker_id and c.site_id = s.site_id and c.work_date = s.work_date
   where s.worker_id is null
      or c.worker_id is null
      or (s.status, s.overtime_hours, s.payable_days, s.payable_overtime_hours, s.rate,
          coalesce(s.day_amount, 0) + coalesce(s.overtime_amount, 0))
         is distinct from
         (c.status, c.overtime_hours, c.payable_days, c.payable_overtime_hours, c.rate,
          coalesce(c.day_amount, 0) + coalesce(c.overtime_amount, 0))
   order by 3, 1, 2;
end;
$$;

-- ---------------------------------------------------------------------- views

create or replace view public.wage_summary
with (security_invoker = true) as
select l.org_id,
       l.period_id,
       p.status                                  as period_status,
       l.worker_id,
       w.code                                    as worker_code,
       w.full_name                               as worker_name,
       l.pay_type,
       l.payable_days,
       l.overtime_hours,
       l.rate_from,
       l.rate_to,
       l.pay_amount,
       l.overtime_amount,
       coalesce(a.amount, 0::numeric(12,2))      as adjustments_amount,
       (l.pay_amount + l.overtime_amount + coalesce(a.amount, 0))::numeric(12,2) as total_amount,
       l.no_rate_days
  from public.wage_lines l
  join public.wage_periods p on p.id = l.period_id
  join public.worker_pay_basis w on w.id = l.worker_id and w.org_id = l.org_id
  left join (select x.period_id, x.worker_id, sum(x.amount) as amount
               from public.wage_adjustments x
              group by x.period_id, x.worker_id) a
    on a.period_id = l.period_id and a.worker_id = l.worker_id;

create or replace view public.wage_summary_by_site
with (security_invoker = true) as
select d.org_id,
       d.period_id,
       d.worker_id,
       d.site_id,
       sum(d.payable_days)   as payable_days,
       sum(d.payable_overtime_hours) as overtime_hours
  from public.wage_line_days d
 group by d.org_id, d.period_id, d.worker_id, d.site_id;

revoke all on public.wage_summary, public.wage_summary_by_site from public, anon, authenticated;
grant select on public.wage_summary, public.wage_summary_by_site to authenticated;
