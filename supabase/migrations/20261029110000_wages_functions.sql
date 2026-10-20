-- Wage Summaries: the calculation, the lock, the reopen and the two views. Owners:
-- Ishant and Manish. Issue #61, ADR-035.
--
-- The calculation reads only approved_attendance_days (Attendance, published) and
-- worker_rate_on() (Workforce, published), plus workers.pay_type, which an accountant
-- may already read (ADR-011 W10). The published functions are SECURITY DEFINER because
-- the tables they write have no client write grant; each checks the caller itself with
-- can_view_wages (owner, accountant) or is_org_owner, and answers 42501 for both "no
-- such period" and "not yours".
--
-- Formulas (ADR-035):
--   day value        present 1, half_day 0.5, leave and absent 0
--   payable days     per worker per date, summed across sites and capped at 1
--   daily worker     day value x rate;  overtime = hours x (rate / 8) x 2
--   hourly worker    day value x 8 x rate;  overtime = hours x rate x 2
--   a payable day with no rate is "no rate", never 0, and blocks the lock

-- ------------------------------------------------------------ wage_compute_days
-- The day-by-day figures for one organisation and date range, from the live view. Used by
-- the recalculation and by the after-lock comparison, so the two can never disagree.
-- Internal: not callable by a client.

create function public.wage_compute_days(p_org_id uuid, p_start date, p_end date)
returns table (
  worker_id       uuid,
  site_id         uuid,
  work_date       date,
  status          text,
  overtime_hours  numeric,
  payable_days    numeric,
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
      join public.workers w on w.id = d.worker_id and w.org_id = d.org_id
     where d.org_id = p_org_id
       and d.work_date between p_start and p_end
  ),
  c as (
    -- The cap: what earlier sites (in site id order) already used up of this date.
    select a.*,
           greatest(0, least(a.v, 1 - coalesce(
             sum(a.v) over (partition by a.worker_id, a.work_date order by a.site_id
                            rows between unbounded preceding and 1 preceding), 0))) as pd
      from a
  ),
  r as (
    select c.*, public.worker_rate_on(c.worker_id, c.work_date) as rt from c
  )
  select r.worker_id, r.site_id, r.work_date, r.status, r.overtime_hours, r.pd, r.rt,
         case when r.pd = 0 then 0
              when r.rt is null then null
              when r.pay_type = 'hourly' then r.pd * public.wage_standard_day_hours() * r.rt
              else r.pd * r.rt end,
         case when r.overtime_hours = 0 then 0
              when r.rt is null then null
              when r.pay_type = 'hourly' then r.overtime_hours * r.rt * public.wage_overtime_multiplier()
              else r.overtime_hours * (r.rt / public.wage_standard_day_hours()) * public.wage_overtime_multiplier() end
    from r;
$$;

revoke all on function public.wage_compute_days(uuid, date, date) from public, anon, authenticated;

-- ---------------------------------------------------------------- wage_recalculate
-- Rewrites a draft period's lines and snapshot from the live view. Idempotent: it upserts
-- and writes a row only when a figure changed. No row is ever deleted; an approved day
-- never leaves the view, so the set of rows for a draft only grows. Internal.

create function public.wage_recalculate(p_period_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period public.wage_periods;
  v_n      bigint;
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
           sum(c.overtime_hours)                                     as overtime_hours,
           min(c.rate) filter (where c.payable_days > 0 or c.overtime_hours > 0) as rate_from,
           max(c.rate) filter (where c.payable_days > 0 or c.overtime_hours > 0) as rate_to,
           round(coalesce(sum(c.day_amount), 0), 2)                  as pay_amount,
           round(coalesce(sum(c.overtime_amount), 0), 2)             as overtime_amount,
           count(*) filter (where c.rate is null
                              and (c.payable_days > 0 or c.overtime_hours > 0)) as no_rate_days
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
      join public.workers w on w.id = g.worker_id and w.org_id = v_period.org_id
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
  ),
  d as (
    insert into public.wage_line_days as wd
      (org_id, period_id, worker_id, site_id, work_date, status, overtime_hours, payable_days,
       rate, day_amount, overtime_amount)
    select v_period.org_id, v_period.id, c.worker_id, c.site_id, c.work_date, c.status,
           c.overtime_hours, c.payable_days, c.rate, c.day_amount, c.overtime_amount
      from comp c
    on conflict (period_id, worker_id, site_id, work_date) do update
       set status = excluded.status, overtime_hours = excluded.overtime_hours,
           payable_days = excluded.payable_days, rate = excluded.rate,
           day_amount = excluded.day_amount, overtime_amount = excluded.overtime_amount
     where (wd.status, wd.overtime_hours, wd.payable_days, wd.rate, wd.day_amount, wd.overtime_amount)
           is distinct from
           (excluded.status, excluded.overtime_hours, excluded.payable_days, excluded.rate,
            excluded.day_amount, excluded.overtime_amount)
    returning 1
  )
  select (select count(*) from l) + (select count(*) from d) into v_n;

  update public.wage_periods set calculated_at = now() where id = p_period_id;
end;
$$;

revoke all on function public.wage_recalculate(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------ calculate_wage_period

create function public.calculate_wage_period(p_period_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  select p.org_id into v_org from public.wage_periods p where p.id = p_period_id;
  if v_org is null or not public.can_view_wages(v_org) then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  perform public.wage_recalculate(p_period_id);
end;
$$;

-- --------------------------------------------------------------- lock_wage_period
-- Recalculates first, so the snapshot is what the view says at the moment of the lock,
-- then refuses while any payable day has no rate. Locking a locked period is a no-op
-- that keeps the first locker.

create function public.lock_wage_period(p_period_id uuid)
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

  perform public.wage_recalculate(p_period_id);

  if exists (select 1 from public.wage_lines l where l.period_id = p_period_id and l.no_rate_days > 0) then
    raise exception 'wage period % has payable days with no rate', p_period_id using errcode = '55000';
  end if;

  update public.wage_periods
     set status = 'locked', locked_at = now(), locked_by = auth.uid()
   where id = p_period_id;
end;
$$;

-- ------------------------------------------------------------ reopen_wage_period
-- Owner only. An accountant gets the same 42501 as anyone else (CLAUDE.md, four roles).

create function public.reopen_wage_period(p_period_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period public.wage_periods;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  select * into v_period from public.wage_periods where id = p_period_id;
  if not found or not public.is_org_owner(v_period.org_id) then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  select * into v_period from public.wage_periods where id = p_period_id for update;
  if v_reason = '' or char_length(v_reason) > 500 then
    raise exception 'a reason of 1 to 500 characters is required' using errcode = '22023';
  end if;
  if v_period.status <> 'locked' then
    raise exception 'wage period % is not locked', p_period_id using errcode = '55000';
  end if;

  insert into public.wage_period_reopens (org_id, period_id, reopened_by, reason, locked_at, locked_by)
  values (v_period.org_id, v_period.id, auth.uid(), v_reason, v_period.locked_at, v_period.locked_by);

  update public.wage_periods
     set status = 'draft', locked_at = null, locked_by = null
   where id = p_period_id;
end;
$$;

-- ------------------------------------------------- wage_period_attendance_changes
-- For a locked period: every place where Attendance now differs from the snapshot the
-- period was locked with (ADR-032 consequence, ADR-035 D11). A corrected day shows as
-- 'changed'; a day approved after the lock as 'approved_after_lock'. It reports and
-- never edits: the way to pay a difference is an adjustment in the next open period, or
-- the owner reopens.

create function public.wage_period_attendance_changes(p_period_id uuid)
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
                 d.payable_days, d.rate, d.day_amount, d.overtime_amount
            from public.wage_line_days d where d.period_id = p_period_id) s
    full join public.wage_compute_days(v_period.org_id, v_period.start_date, v_period.end_date) c
      on c.worker_id = s.worker_id and c.site_id = s.site_id and c.work_date = s.work_date
   where s.worker_id is null
      or c.worker_id is null
      or (s.status, s.overtime_hours, s.payable_days, s.rate,
          coalesce(s.day_amount, 0) + coalesce(s.overtime_amount, 0))
         is distinct from
         (c.status, c.overtime_hours, c.payable_days, c.rate,
          coalesce(c.day_amount, 0) + coalesce(c.overtime_amount, 0))
   order by 3, 1, 2;
end;
$$;

revoke all on function public.calculate_wage_period(uuid)           from public, anon;
revoke all on function public.lock_wage_period(uuid)                from public, anon;
revoke all on function public.reopen_wage_period(uuid, text)        from public, anon;
revoke all on function public.wage_period_attendance_changes(uuid)  from public, anon;
grant execute on function public.calculate_wage_period(uuid)          to authenticated;
grant execute on function public.lock_wage_period(uuid)               to authenticated;
grant execute on function public.reopen_wage_period(uuid, text)       to authenticated;
grant execute on function public.wage_period_attendance_changes(uuid) to authenticated;

-- ---------------------------------------------------------------------- views
-- security_invoker, so they follow can_view_wages on the base tables: a project manager
-- and a supervisor read zero rows (SECURITY.md). Never writable.

create view public.wage_summary
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
  join public.workers w on w.id = l.worker_id and w.org_id = l.org_id
  left join (select x.period_id, x.worker_id, sum(x.amount) as amount
               from public.wage_adjustments x
              group by x.period_id, x.worker_id) a
    on a.period_id = l.period_id and a.worker_id = l.worker_id;

create view public.wage_summary_by_site
with (security_invoker = true) as
select d.org_id,
       d.period_id,
       d.worker_id,
       d.site_id,
       sum(d.payable_days)   as payable_days,
       sum(d.overtime_hours) as overtime_hours
  from public.wage_line_days d
 group by d.org_id, d.period_id, d.worker_id, d.site_id;

revoke all on public.wage_summary, public.wage_summary_by_site from public, anon, authenticated;
grant select on public.wage_summary, public.wage_summary_by_site to authenticated;
