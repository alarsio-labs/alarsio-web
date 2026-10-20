-- Wage Summaries: wage_periods, wage_lines, wage_line_days, wage_adjustments,
-- wage_period_reopens, calculate / lock / reopen, wage_summary. Issue #61, ADR-035.
--
-- Conventions as in attendance_views_test.sql: test_as / test_assert, SQLSTATE asserts.
-- Dates are relative to current_date, never literals.
--
-- Period P is a week: current_date - 10 .. current_date - 4. Approved days inside it
-- are -9, -8, -7 and -5 at A1 (and -9, -8 at A2); -6 at A1 is open; -3 is approved but
-- outside the period.
begin;

-- ---------------------------------------------------------------- fixtures
-- Org A: owner a01, project manager a02, supervisor a03, accountants a05 and a07.
-- Org B: owner b01.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000a01', 'owner-a@test.local'),
  ('00000000-0000-0000-0000-000000000a02', 'pm-a@test.local'),
  ('00000000-0000-0000-0000-000000000a03', 'sup-a@test.local'),
  ('00000000-0000-0000-0000-000000000a05', 'acct-a@test.local'),
  ('00000000-0000-0000-0000-000000000a07', 'acct-a2@test.local'),
  ('00000000-0000-0000-0000-000000000b01', 'owner-b@test.local');

insert into public.organizations (id, name, created_by) values
  ('10000000-0000-0000-0000-00000000000a', 'Org A', '00000000-0000-0000-0000-000000000a01'),
  ('10000000-0000-0000-0000-00000000000b', 'Org B', '00000000-0000-0000-0000-000000000b01');

insert into public.memberships (org_id, user_id, role) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000a01', 'owner'),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000a02', 'project_manager'),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000a03', 'supervisor'),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000a05', 'accountant'),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000a07', 'accountant'),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000b01', 'owner');

insert into public.sites (id, org_id, name, address, latitude, longitude, status, created_by) values
  ('20000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a', 'A One', 'Pune',   0,  0,  'active', '00000000-0000-0000-0000-000000000a01'),
  ('20000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a', 'A Two', 'Nagpur', 10, 10, 'active', '00000000-0000-0000-0000-000000000a01'),
  ('20000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-00000000000b', 'B One', 'Indore', 0,  0,  'active', '00000000-0000-0000-0000-000000000b01');

insert into public.site_assignments (org_id, site_id, user_id, assigned_by) values
  ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000a03', '00000000-0000-0000-0000-000000000a01');

create function public.test_u(k text)    returns uuid language sql immutable as $$ select ('00000000-0000-0000-0000-000000000' || k)::uuid $$;
create function public.test_site(k text) returns uuid language sql immutable as $$ select ('20000000-0000-0000-0000-0000000000' || k)::uuid $$;
create function public.test_w(k text)    returns uuid language sql immutable as $$ select ('77000000-0000-0000-0000-0000000000' || k)::uuid $$;
create function public.test_org(k text)  returns uuid language sql immutable as $$ select ('10000000-0000-0000-0000-00000000000' || k)::uuid $$;
create function public.test_c(n int)     returns uuid language sql immutable as $$ select ('60000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid $$;

-- Workers: 01 Ravi daily 800, 02 Sita daily 800 then 1000 from -7, 03 Hari hourly 100,
-- 04 Latha daily 600 (two sites), 05 Mala daily with no rate, 06 Dev daily 833.33.
-- All rostered at A1 since 30 days ago; Latha also at A2. b1 Bela, org B.
insert into public.workers (id, org_id, code, full_name, trade, pay_type, created_by) values
  (public.test_w('01'), public.test_org('a'), 'W-001', 'Ravi',  'mason',  'daily',  public.test_u('a01')),
  (public.test_w('02'), public.test_org('a'), 'W-002', 'Sita',  'helper', 'daily',  public.test_u('a01')),
  (public.test_w('03'), public.test_org('a'), 'W-003', 'Hari',  'helper', 'hourly', public.test_u('a01')),
  (public.test_w('04'), public.test_org('a'), 'W-004', 'Latha', 'helper', 'daily',  public.test_u('a01')),
  (public.test_w('05'), public.test_org('a'), 'W-005', 'Mala',  'helper', 'daily',  public.test_u('a01')),
  (public.test_w('06'), public.test_org('a'), 'W-006', 'Dev',   'helper', 'daily',  public.test_u('a01')),
  (public.test_w('b1'), public.test_org('b'), 'W-001', 'Bela',  'mason',  'daily',  public.test_u('b01'));

insert into public.worker_site_assignments (org_id, worker_id, site_id, assigned_by, assigned_at)
select public.test_org('a'), w, public.test_site('a1'), public.test_u('a01'), now() - interval '30 days'
  from (values (public.test_w('01')), (public.test_w('02')), (public.test_w('03')),
               (public.test_w('04')), (public.test_w('05')), (public.test_w('06'))) as x (w);
insert into public.worker_site_assignments (org_id, worker_id, site_id, assigned_by, assigned_at) values
  (public.test_org('a'), public.test_w('04'), public.test_site('a2'), public.test_u('a01'), now() - interval '30 days'),
  (public.test_org('b'), public.test_w('b1'), public.test_site('b1'), public.test_u('b01'), now() - interval '30 days');

insert into public.worker_wage_rates (org_id, worker_id, rate, effective_from, created_by) values
  (public.test_org('a'), public.test_w('01'),  800.00, current_date - 30, public.test_u('a01')),
  (public.test_org('a'), public.test_w('02'),  800.00, current_date - 30, public.test_u('a01')),
  (public.test_org('a'), public.test_w('02'), 1000.00, current_date - 7,  public.test_u('a01')),
  (public.test_org('a'), public.test_w('03'),  100.00, current_date - 30, public.test_u('a01')),
  (public.test_org('a'), public.test_w('04'),  600.00, current_date - 30, public.test_u('a01')),
  (public.test_org('a'), public.test_w('06'),  833.33, current_date - 30, public.test_u('a01'));

-- Days, written by the superuser. A1: -9 -8 -7 -6 -5 -3. A2: -9 -8. B1: -9.
insert into public.attendance_days (org_id, site_id, attendance_date, recorded_by)
select public.test_org('a'), public.test_site('a1'), current_date - d, public.test_u('a03')
  from unnest(array[9, 8, 7, 6, 5, 3]) as d;
insert into public.attendance_days (org_id, site_id, attendance_date, recorded_by)
select public.test_org('a'), public.test_site('a2'), current_date - d, public.test_u('a03')
  from unnest(array[9, 8]) as d;
insert into public.attendance_days (org_id, site_id, attendance_date, recorded_by) values
  (public.test_org('b'), public.test_site('b1'), current_date - 9, public.test_u('b01'));

create function public.test_entry(p_site text, p_n int, p_worker text, p_status text, p_ot numeric default 0)
returns void language sql as $$
  insert into public.attendance_entries (org_id, site_id, attendance_date, worker_id, status, overtime_hours, recorded_by)
  values (case when p_site = 'b1' then public.test_org('b') else public.test_org('a') end,
          public.test_site(p_site), current_date - p_n, public.test_w(p_worker), p_status, p_ot, public.test_u('a03'));
$$;

-- Ravi present on every A1 day, including the open -6 and the outside -3.
select public.test_entry('a1', n, '01', 'present') from unnest(array[9, 8, 7, 6, 5, 3]) as n;
-- Sita present every day, 2 h overtime on -9 and -7.
select public.test_entry('a1', 9, '02', 'present', 2);
select public.test_entry('a1', 8, '02', 'present');
select public.test_entry('a1', 7, '02', 'present', 2);
select public.test_entry('a1', 5, '02', 'present');
-- Hari (hourly): present with 1 h overtime, half day, absent, leave.
select public.test_entry('a1', 9, '03', 'present', 1);
select public.test_entry('a1', 8, '03', 'half_day');
select public.test_entry('a1', 7, '03', 'absent');
select public.test_entry('a1', 5, '03', 'leave');
-- Latha: present at both sites on -9 and -8 (the cap: 1 day, not 2).
select public.test_entry('a1', 9, '04', 'present');
select public.test_entry('a2', 9, '04', 'present');
select public.test_entry('a1', 8, '04', 'present');
select public.test_entry('a2', 8, '04', 'present');
-- Mala (no rate): present on -9, leave on -8.
select public.test_entry('a1', 9, '05', 'present');
select public.test_entry('a1', 8, '05', 'leave');
-- Dev (833.33): present with 1 h overtime on -9 and -8.
select public.test_entry('a1', 9, '06', 'present', 1);
select public.test_entry('a1', 8, '06', 'present', 1);
-- Org B.
select public.test_entry('b1', 9, 'b1', 'present');

-- Approve: A1 -9 -8 -7 -5 -3 and A2 -9 -8 and B1 -9. A1 -6 stays open.
update public.attendance_days
   set status = 'approved', reviewed_by = public.test_u('a02'), reviewed_at = now() - interval '3 hours'
 where org_id = public.test_org('a')
   and ((site_id = public.test_site('a1') and attendance_date = any (array[current_date - 9, current_date - 8, current_date - 7, current_date - 5, current_date - 3]))
     or (site_id = public.test_site('a2') and attendance_date = any (array[current_date - 9, current_date - 8])));
update public.attendance_days
   set status = 'approved', reviewed_by = public.test_u('b01'), reviewed_at = now() - interval '3 hours'
 where org_id = public.test_org('b');

-- ----------------------------------------------------------------- helpers

create function public.test_try(p_user uuid, p_sql text) returns text language plpgsql as $$
declare s text; n int;
begin
  if p_user is null then perform test_as_anon(); else perform test_as(p_user); end if;
  begin
    execute p_sql;
    get diagnostics n = row_count;
  exception when others then s := sqlstate; end;
  execute 'reset role';
  return coalesce(s, 'ok:' || n);
end $$;

create function public.test_count(p_user uuid, p_sql text) returns text language plpgsql as $$
declare s text; n bigint;
begin
  if p_user is null then perform test_as_anon(); else perform test_as(p_user); end if;
  begin
    execute 'select count(*) from (' || p_sql || ') q' into n;
  exception when others then s := sqlstate; end;
  execute 'reset role';
  return coalesce(s, n::text);
end $$;

-- The week P in org A, created as p_user.
create function public.test_period_id() returns uuid language sql as $$
  select id from public.wage_periods
   where org_id = public.test_org('a') and start_date = current_date - 10
$$;
create function public.test_make_period(p_user uuid, p_org uuid, p_type text, p_start date, p_end date)
returns text language sql as $$
  select public.test_try(p_user, format(
    'insert into public.wage_periods (org_id, period_type, start_date, end_date) values (%L, %L, %L, %L)',
    p_org, p_type, p_start, p_end));
$$;
create function public.test_calc(p_user uuid, p_period uuid) returns text language sql as $$
  select public.test_try(p_user, format('select public.calculate_wage_period(%L)', p_period));
$$;
create function public.test_lock(p_user uuid, p_period uuid) returns text language sql as $$
  select public.test_try(p_user, format('select public.lock_wage_period(%L)', p_period));
$$;
create function public.test_reopen(p_user uuid, p_period uuid, p_reason text) returns text language sql as $$
  select public.test_try(p_user, format('select public.reopen_wage_period(%L, %L)', p_period, p_reason));
$$;
create function public.test_adjust(p_user uuid, p_period uuid, p_worker text, p_amount numeric, p_reason text)
returns text language sql as $$
  select public.test_try(p_user, format(
    'insert into public.wage_adjustments (org_id, period_id, worker_id, amount, reason) values (%L, %L, %L, %s, %L)',
    public.test_org('a'), p_period, public.test_w(p_worker), p_amount, p_reason));
$$;

-- One summary line as p_user: "days|pay|overtime hours|overtime pay|adjustments|total|no_rate_days"
-- ('-' when not visible).
create function public.test_line(p_user uuid, p_worker text) returns text language plpgsql as $$
declare r text;
begin
  perform test_as(p_user);
  select payable_days || '|' || pay_amount || '|' || overtime_hours || '|' || overtime_amount || '|'
         || adjustments_amount || '|' || total_amount || '|' || no_rate_days into r
    from public.wage_summary
   where period_id = public.test_period_id() and worker_id = public.test_w(p_worker);
  execute 'reset role';
  return coalesce(r, '-');
end $$;

create function public.test_cols(p_rel text) returns text language sql as $$
  select string_agg(column_name::text, ',' order by ordinal_position)
    from information_schema.columns where table_schema = 'public' and table_name = p_rel
$$;

-- ------------------------------------------------- 1 · catalog: shape and grants
do $$
declare t text;
begin
  foreach t in array array['wage_periods', 'wage_lines', 'wage_line_days', 'wage_adjustments', 'wage_period_reopens'] loop
    perform test_assert((select relrowsecurity from pg_class where oid = ('public.' || t)::regclass),
      '[1.01] ' || t || ' has RLS enabled');
    perform test_assert(not has_table_privilege('anon', 'public.' || t, 'select,insert,update,delete,truncate'),
      '[1.02] anon has no privilege on ' || t);
    perform test_assert(not has_table_privilege('authenticated', 'public.' || t, 'delete,truncate'),
      '[1.03] authenticated cannot delete from or truncate ' || t);
    perform test_assert((select count(*) from pg_trigger
                          where tgrelid = ('public.' || t)::regclass and tgfoid = 'public.write_audit()'::regprocedure) = 1,
      '[1.04] ' || t || ' has the audit trigger');
  end loop;

  -- The computed tables take no client write at all; the two ledgers take an insert only.
  perform test_assert(not has_any_column_privilege('authenticated', 'public.wage_lines', 'insert,update')
                  and not has_any_column_privilege('authenticated', 'public.wage_line_days', 'insert,update'),
    '[1.05] wage_lines and wage_line_days have no client write grant');
  perform test_assert(not has_any_column_privilege('authenticated', 'public.wage_period_reopens', 'insert,update'),
    '[1.06] the reopen history has no client write grant');
  perform test_assert(has_any_column_privilege('authenticated', 'public.wage_adjustments', 'insert')
                  and not has_any_column_privilege('authenticated', 'public.wage_adjustments', 'update'),
    '[1.07] adjustments take an insert and no update');
  perform test_assert(not has_any_column_privilege('authenticated', 'public.wage_periods', 'update'),
    '[1.08] a period cannot be updated by a client; status moves only through the functions');
  perform test_assert(not has_column_privilege('authenticated', 'public.wage_periods', 'status', 'insert'),
    '[1.09] a client cannot set a period''s status on insert');

  perform test_assert(
    (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'v'
        and c.relname in ('wage_summary', 'wage_summary_by_site')
        and 'security_invoker=true' = any (c.reloptions)) = 2,
    '[1.10] both wage views are security_invoker');
  perform test_assert(not has_table_privilege('anon', 'public.wage_summary', 'select')
                  and has_table_privilege('authenticated', 'public.wage_summary', 'select')
                  and not has_table_privilege('authenticated', 'public.wage_summary', 'insert,update,delete'),
    '[1.11] wage_summary is readable by authenticated only, never writable');

  foreach t in array array['calculate_wage_period(uuid)', 'lock_wage_period(uuid)', 'reopen_wage_period(uuid,text)',
                           'wage_period_attendance_changes(uuid)'] loop
    perform test_assert(has_function_privilege('authenticated', 'public.' || t, 'execute')
                    and not has_function_privilege('anon', 'public.' || t, 'execute'),
      '[1.12] ' || t || ' is executable by authenticated, not anon');
  end loop;
  perform test_assert(not has_function_privilege('authenticated', 'public.wage_compute_days(uuid,date,date)', 'execute')
                  and not has_function_privilege('authenticated', 'public.wage_recalculate(uuid)', 'execute'),
    '[1.13] the two internal functions are not callable by a client');
end $$;

-- ------------------------------------------------------------ 2 · creating periods
do $$
declare r text;
begin
  r := test_make_period(test_u('a05'), test_org('a'), 'week', current_date - 10, current_date - 4);
  perform test_assert(r = 'ok:1', '[2.01] an accountant creates a week, got ' || r);
  perform test_assert((select status from public.wage_periods where id = test_period_id()) = 'draft',
    '[2.02] a new period is a draft');
  perform test_assert((select created_by from public.wage_periods where id = test_period_id()) = test_u('a05'),
    '[2.03] created_by is the caller');

  r := test_make_period(test_u('a02'), test_org('a'), 'week', current_date - 30, current_date - 24);
  perform test_assert(r = '42501', '[2.04] a project manager cannot create a period, got ' || r);
  r := test_make_period(test_u('a03'), test_org('a'), 'week', current_date - 30, current_date - 24);
  perform test_assert(r = '42501', '[2.05] a supervisor cannot create a period, got ' || r);
  r := test_make_period(null, test_org('a'), 'week', current_date - 30, current_date - 24);
  perform test_assert(r = '42501', '[2.06] anon cannot create a period, got ' || r);
  r := test_make_period(test_u('b01'), test_org('a'), 'week', current_date - 30, current_date - 24);
  perform test_assert(r = '42501', '[2.07] another organisation''s owner cannot create one in org A, got ' || r);

  -- Shape: a week is 7 days, a month is a whole calendar month.
  r := test_make_period(test_u('a05'), test_org('a'), 'week', current_date - 30, current_date - 25);
  perform test_assert(r = '23514', '[2.08] a 6-day week is refused, got ' || r);
  r := test_make_period(test_u('a05'), test_org('a'), 'week', current_date - 30, current_date - 23);
  perform test_assert(r = '23514', '[2.09] an 8-day week is refused, got ' || r);
  r := test_make_period(test_u('a05'), test_org('a'), 'month', date '2020-02-02', date '2020-02-29');
  perform test_assert(r = '23514', '[2.10] a month not starting on the 1st is refused, got ' || r);
  r := test_make_period(test_u('a05'), test_org('a'), 'month', date '2020-02-01', date '2020-02-28');
  perform test_assert(r = '23514', '[2.11] a month not ending on its last day is refused, got ' || r);
  r := test_make_period(test_u('a05'), test_org('a'), 'month', date '2020-02-01', date '2020-02-29');
  perform test_assert(r = 'ok:1', '[2.12] a whole calendar month (leap February) is accepted, got ' || r);
  r := test_make_period(test_u('a05'), test_org('a'), 'fortnight', current_date - 30, current_date - 17);
  perform test_assert(r = '23514', '[2.13] an unknown period type is refused, got ' || r);

  -- Overlap (decision 7): not within one organisation, any type, edges included.
  r := test_make_period(test_u('a05'), test_org('a'), 'week', current_date - 4, current_date + 2);
  perform test_assert(r = '23P01', '[2.14] a week sharing one day with P is refused, got ' || r);
  r := test_make_period(test_u('a05'), test_org('a'), 'week', current_date - 16, current_date - 10);
  perform test_assert(r = '23P01', '[2.15] a week ending on P''s first day is refused, got ' || r);
  r := test_make_period(test_u('a05'), test_org('a'), 'week', current_date - 3, current_date + 3);
  perform test_assert(r = 'ok:1', '[2.16] the next week, starting the day after P ends, is accepted, got ' || r);
  r := test_make_period(test_u('b01'), test_org('b'), 'week', current_date - 10, current_date - 4);
  perform test_assert(r = 'ok:1', '[2.17] the same dates in another organisation are fine, got ' || r);
end $$;

-- ------------------------------------------------------------- 3 · calculate
do $$
declare r text; n_days bigint; n_lines bigint; before_hash text;
begin
  r := test_calc(test_u('a02'), test_period_id());
  perform test_assert(r = '42501', '[3.01] a project manager cannot calculate, got ' || r);
  r := test_calc(test_u('a03'), test_period_id());
  perform test_assert(r = '42501', '[3.02] a supervisor cannot calculate, got ' || r);
  r := test_calc(null, test_period_id());
  perform test_assert(r = '42501', '[3.03] anon cannot calculate, got ' || r);
  r := test_calc(test_u('b01'), test_period_id());
  perform test_assert(r = '42501', '[3.04] another organisation''s owner gets the same refusal, got ' || r);
  r := test_calc(test_u('a05'), gen_random_uuid());
  perform test_assert(r = '42501', '[3.05] a missing period answers the same as a forbidden one, got ' || r);
  perform test_assert((select count(*) from public.wage_lines) = 0, '[3.06] refused calls wrote nothing');

  r := test_calc(test_u('a05'), test_period_id());
  perform test_assert(r = 'ok:1', '[3.07] an accountant calculates, got ' || r);
  perform test_assert((select calculated_at is not null from public.wage_periods where id = test_period_id()),
    '[3.08] calculated_at is stamped');

  -- Who is on the summary: every worker with an approved row; nobody from org B or off-period.
  perform test_assert((select count(*) from public.wage_lines where period_id = test_period_id()) = 6,
    '[3.09] six workers have a line (Ravi, Sita, Hari, Latha, Mala, Dev)');
  perform test_assert(not exists (select 1 from public.wage_lines where worker_id = test_w('b1')),
    '[3.10] org B''s worker is on no line of org A''s period');

  -- Hand-computed amounts. Daily rate / 8 x overtime x 2; hourly 8 h a day.
  perform test_assert(test_line(test_u('a05'), '01') = '4.00|3200.00|0.00|0.00|0.00|3200.00|0',
    '[3.11] Ravi: 4 approved days x 800, the open day and the day outside are excluded, got ' || test_line(test_u('a05'), '01'));
  perform test_assert(test_line(test_u('a05'), '02') = '4.00|3600.00|4.00|900.00|0.00|4500.00|0',
    '[3.12] Sita: the rate change mid-period is honoured per day (800, 800, 1000, 1000), got ' || test_line(test_u('a05'), '02'));
  perform test_assert(test_line(test_u('a05'), '03') = '1.50|1200.00|1.00|200.00|0.00|1400.00|0',
    '[3.13] Hari (hourly): present 8 h + half day 4 h at 100, 1 h overtime at 2 x, got ' || test_line(test_u('a05'), '03'));
  perform test_assert(test_line(test_u('a05'), '04') = '2.00|1200.00|0.00|0.00|0.00|1200.00|0',
    '[3.14] Latha: present at two sites on one date is 1 day, got ' || test_line(test_u('a05'), '04'));
  perform test_assert(test_line(test_u('a05'), '05') = '1.00|0.00|0.00|0.00|0.00|0.00|1',
    '[3.15] Mala: a present day with no rate shows as no rate, never a rupee amount, got ' || test_line(test_u('a05'), '05'));
  perform test_assert(test_line(test_u('a05'), '06') = '2.00|1666.66|2.00|416.67|0.00|2083.33|0',
    '[3.16] Dev: rounded once per line (2 x 208.3325 = 416.665 -> 416.67), got ' || test_line(test_u('a05'), '06'));

  -- Per-site breakdown (decision 8): the capped day lands on the first site.
  perform test_assert(
    (select string_agg(site_id::text || ':' || payable_days, ',' order by site_id)
       from public.wage_summary_by_site
      where period_id = test_period_id() and worker_id = test_w('04'))
    = test_site('a1')::text || ':2.00,' || test_site('a2')::text || ':0.00',
    '[3.17] the by-site view gives Latha''s 2 days to A1 and 0 to A2');

  -- Idempotent: a second run changes no count and no figure.
  select count(*) into n_days from public.wage_line_days where period_id = test_period_id();
  select count(*) into n_lines from public.wage_lines where period_id = test_period_id();
  select md5(string_agg(worker_id::text || payable_days || pay_amount || overtime_amount, ',' order by worker_id))
    into before_hash from public.wage_lines where period_id = test_period_id();
  r := test_calc(test_u('a01'), test_period_id());
  perform test_assert(r = 'ok:1', '[3.18] the owner may recalculate a draft, got ' || r);
  perform test_assert((select count(*) from public.wage_line_days where period_id = test_period_id()) = n_days
                  and (select count(*) from public.wage_lines where period_id = test_period_id()) = n_lines
                  and (select md5(string_agg(worker_id::text || payable_days || pay_amount || overtime_amount, ',' order by worker_id))
                         from public.wage_lines where period_id = test_period_id()) = before_hash,
    '[3.19] recalculating a draft gives the same lines');
end $$;

-- ----------------------------------------------------------- 4 · who reads wages
do $$
begin
  perform test_assert(test_count(test_u('a05'), 'select 1 from public.wage_summary') = '6',
    '[4.01] an accountant reads six lines');
  perform test_assert(test_count(test_u('a07'), 'select 1 from public.wage_summary') = '6',
    '[4.02] an accountant with no site assignment reads the same six');
  perform test_assert(test_count(test_u('a01'), 'select 1 from public.wage_summary') = '6',
    '[4.03] the owner reads six lines');
  perform test_assert(test_count(test_u('a02'), 'select 1 from public.wage_summary') = '0',
    '[4.04] a project manager reads zero rows from wage_summary');
  perform test_assert(test_count(test_u('a03'), 'select 1 from public.wage_summary') = '0',
    '[4.05] a supervisor reads zero rows from wage_summary');
  perform test_assert(test_count(null, 'select 1 from public.wage_summary') = '42501',
    '[4.06] anon is refused the view');
  perform test_assert(test_count(test_u('b01'), 'select 1 from public.wage_summary') = '0',
    '[4.07] another organisation''s owner reads zero rows');
  perform test_assert(test_count(test_u('a02'), 'select 1 from public.wage_lines') = '0'
                  and test_count(test_u('a03'), 'select 1 from public.wage_line_days') = '0'
                  and test_count(test_u('a02'), 'select 1 from public.wage_periods') = '0',
    '[4.08] a project manager and a supervisor read none of the base tables either');
  perform test_assert(test_count(test_u('a02'), 'select 1 from public.wage_adjustments') = '0'
                  and test_count(test_u('a03'), 'select 1 from public.wage_adjustments') = '0'
                  and test_count(test_u('a02'), 'select 1 from public.wage_period_reopens') = '0'
                  and test_count(test_u('a03'), 'select 1 from public.wage_period_reopens') = '0'
                  and test_count(test_u('a03'), 'select 1 from public.wage_summary_by_site') = '0',
    '[4.08b] a project manager and a supervisor read none of the ledgers or the by-site view either');
  begin
    delete from public.wage_lines;
    perform test_assert(false, '[4.08c] even the table owner cannot delete a line');
  exception when sqlstate '55000' then null; end;
  begin
    delete from public.wage_line_days;
    perform test_assert(false, '[4.08d] even the table owner cannot delete a snapshot day');
  exception when sqlstate '55000' then null; end;
  begin
    delete from public.wage_periods;
    perform test_assert(false, '[4.08e] even the table owner cannot delete a period');
  exception when sqlstate '55000' then null; end;
  perform test_assert(test_count(test_u('b01'), 'select 1 from public.wage_periods') = '1',
    '[4.09] org B''s owner sees only org B''s own period');
  perform test_assert(test_count(test_u('a05'), 'select 1 from public.wage_summary_by_site') > '0'
                  and test_count(test_u('a02'), 'select 1 from public.wage_summary_by_site') = '0',
    '[4.10] the by-site view follows the same rule');
  perform test_assert(
    test_try(test_u('a05'), 'update public.wage_lines set pay_amount = 1') in ('42501')
    and test_try(test_u('a05'), 'insert into public.wage_lines (org_id, period_id, worker_id) values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid())') = '42501'
    and test_try(test_u('a01'), 'delete from public.wage_lines') = '42501',
    '[4.11] a line cannot be typed in, edited or deleted by any client');
end $$;

-- --------------------------------------------------------------- 5 · adjustments
do $$
declare r text;
begin
  r := test_adjust(test_u('a05'), test_period_id(), '05', 800, 'Paid leave 12 Oct');
  perform test_assert(r = 'ok:1', '[5.01] an accountant adds an adjustment, got ' || r);
  perform test_assert(test_line(test_u('a05'), '05') = '1.00|0.00|0.00|0.00|800.00|800.00|1',
    '[5.02] the summary total includes the adjustment, got ' || test_line(test_u('a05'), '05'));
  r := test_adjust(test_u('a01'), test_period_id(), '01', -200, 'Advance recovered');
  perform test_assert(r = 'ok:1', '[5.03] a negative adjustment is allowed, got ' || r);
  perform test_assert(test_line(test_u('a05'), '01') = '4.00|3200.00|0.00|0.00|-200.00|3000.00|0',
    '[5.04] the total is pay + overtime + adjustments, got ' || test_line(test_u('a05'), '01'));

  r := test_adjust(test_u('a05'), test_period_id(), '01', 0, 'nothing');
  perform test_assert(r = '23514', '[5.05] a zero adjustment is refused, got ' || r);
  r := test_adjust(test_u('a05'), test_period_id(), '01', 50, '   ');
  perform test_assert(r = '23514', '[5.06] a blank reason is refused, got ' || r);
  r := test_adjust(test_u('a05'), test_period_id(), '01', 50, repeat('x', 501));
  perform test_assert(r = '23514', '[5.07] a 501-character reason is refused, got ' || r);
  r := test_adjust(test_u('a02'), test_period_id(), '01', 50, 'x');
  perform test_assert(r = '42501', '[5.08] a project manager cannot add one, got ' || r);
  r := test_adjust(test_u('a03'), test_period_id(), '01', 50, 'x');
  perform test_assert(r = '42501', '[5.09] a supervisor cannot add one, got ' || r);
  r := test_adjust(null, test_period_id(), '01', 50, 'x');
  perform test_assert(r = '42501', '[5.10] anon cannot add one, got ' || r);
  r := test_adjust(test_u('b01'), test_period_id(), '01', 50, 'x');
  perform test_assert(r = '42501', '[5.11] another organisation cannot add one to org A''s period, got ' || r);
  r := test_adjust(test_u('a05'), test_period_id(), 'b1', 50, 'x');
  perform test_assert(r = '23503', '[5.12] a worker with no line in the period is refused, got ' || r);

  -- Append-only: no client update or delete; a corrected figure is a new row.
  perform test_assert(test_try(test_u('a05'), 'update public.wage_adjustments set amount = 1') = '42501'
                  and test_try(test_u('a01'), 'delete from public.wage_adjustments') = '42501',
    '[5.13] clients cannot update or delete an adjustment');
  begin
    update public.wage_adjustments set amount = 1;
    perform test_assert(false, '[5.14] even the table owner cannot update an adjustment');
  exception when sqlstate '55000' then null; end;
  begin
    delete from public.wage_adjustments;
    perform test_assert(false, '[5.15] even the table owner cannot delete an adjustment');
  exception when sqlstate '55000' then null; end;
  perform test_assert((select count(*) from public.wage_adjustments) = 2, '[5.16] two adjustments exist, refused ones left none');
end $$;

-- ------------------------------------------------------------------- 6 · lock
do $$
declare r text;
begin
  r := test_lock(test_u('a02'), test_period_id());
  perform test_assert(r = '42501', '[6.01] a project manager cannot lock, got ' || r);
  r := test_lock(test_u('a03'), test_period_id());
  perform test_assert(r = '42501', '[6.02] a supervisor cannot lock, got ' || r);
  r := test_lock(test_u('b01'), test_period_id());
  perform test_assert(r = '42501', '[6.03] another organisation cannot lock, got ' || r);

  -- Mala has a payable day and no rate: locking is blocked (decision 5).
  r := test_lock(test_u('a05'), test_period_id());
  perform test_assert(r = '55000', '[6.04] a payable day with no rate blocks locking, got ' || r);
  perform test_assert((select status from public.wage_periods where id = test_period_id()) = 'draft',
    '[6.05] the blocked lock left the period a draft');

  -- Adding a rate (Workforce, owner/accountant) clears it; lock recalculates first.
  insert into public.worker_wage_rates (org_id, worker_id, rate, effective_from, created_by)
  values (test_org('a'), test_w('05'), 500.00, current_date - 30, test_u('a05'));
  r := test_lock(test_u('a05'), test_period_id());
  perform test_assert(r = 'ok:1', '[6.06] the accountant locks once every payable day has a rate, got ' || r);
  perform test_assert((select status = 'locked' and locked_by = test_u('a05') and locked_at is not null
                         from public.wage_periods where id = test_period_id()),
    '[6.07] the period is locked, stamped with who and when');
  perform test_assert(test_line(test_u('a05'), '05') = '1.00|500.00|0.00|0.00|800.00|1300.00|0',
    '[6.08] lock recalculated: Mala''s day is now paid at 500, got ' || test_line(test_u('a05'), '05'));
  r := test_lock(test_u('a05'), test_period_id());
  perform test_assert(r = 'ok:1', '[6.09] locking a locked period is a no-op');
  perform test_assert((select locked_by from public.wage_periods where id = test_period_id()) = test_u('a05'),
    '[6.10] the first locker is kept');

  -- A locked period is frozen for everyone.
  r := test_calc(test_u('a05'), test_period_id());
  perform test_assert(r = '55000', '[6.11] a locked period cannot be recalculated, got ' || r);
  r := test_calc(test_u('a01'), test_period_id());
  perform test_assert(r = '55000', '[6.12] not even by the owner, got ' || r);
  r := test_adjust(test_u('a05'), test_period_id(), '01', 10, 'late');
  perform test_assert(r = '55000', '[6.13] an adjustment cannot be added to a locked period, got ' || r);
  begin
    update public.wage_lines set pay_amount = 1 where period_id = test_period_id();
    perform test_assert(false, '[6.14] a locked line cannot be updated, even by the table owner');
  exception when sqlstate '55000' then null; end;
  begin
    update public.wage_periods set end_date = end_date + 1 where id = test_period_id();
    perform test_assert(false, '[6.15] a locked period cannot be updated, even by the table owner');
  exception when sqlstate '55000' then null; end;
end $$;

-- ------------------------------------------- 7 · attendance changing after the lock
do $$
declare r text; v_corr uuid := test_c(1);
begin
  perform test_assert(
    test_try(test_u('a05'), format('select * from public.wage_period_attendance_changes(%L)', test_period_id())) = 'ok:0',
    '[7.01] right after the lock the snapshot and the view agree: no changes');

  -- Not a locked period: refused (nothing to compare to).
  perform test_assert(
    test_try(test_u('a05'), format('select * from public.wage_period_attendance_changes(%L)',
      (select id from public.wage_periods where org_id = test_org('a') and start_date = current_date - 3))) = '55000',
    '[7.02] the check is for a locked period only');
  perform test_assert(
    test_try(test_u('a02'), format('select * from public.wage_period_attendance_changes(%L)', test_period_id())) = '42501',
    '[7.03] a project manager is refused the check');

  -- An approved correction on a locked day: Sita on -9, 2 h overtime becomes 0, present.
  perform test_as(test_u('a03'));
  insert into public.attendance_corrections (id, org_id, site_id, attendance_date, worker_id, new_status, new_overtime_hours, new_note, reason)
  values (v_corr, test_org('a'), test_site('a1'), current_date - 9, test_w('02'), 'present', 0, null, 'Overtime was not worked');
  perform test_as(test_u('a02'));
  perform public.review_attendance_correction(v_corr, true, null);
  execute 'reset role';

  perform test_assert(test_line(test_u('a05'), '02') = '4.00|3600.00|4.00|900.00|0.00|4500.00|0',
    '[7.04] the locked line did not move, got ' || test_line(test_u('a05'), '02'));
  perform test_assert(
    (select count(*) from public.wage_line_days
      where period_id = test_period_id() and worker_id = test_w('02') and work_date = current_date - 9 and overtime_hours = 2) = 1,
    '[7.05] the snapshot still holds the value the period was locked with');

  perform test_as(test_u('a05'));
  perform test_assert(
    (select count(*) from public.wage_period_attendance_changes(test_period_id())) = 1
    and (select change || '|' || snapshot_overtime_hours || '|' || current_overtime_hours || '|' || amount_difference
           from public.wage_period_attendance_changes(test_period_id())) = 'changed|2.00|0.00|-400.00',
    '[7.06] the check reports the corrected day with old, new and the rupee difference');
  execute 'reset role';

  -- A day approved after the lock, inside the period (the late-approval case).
  update public.attendance_days set status = 'approved', reviewed_by = test_u('a02'), reviewed_at = now()
   where site_id = test_site('a1') and attendance_date = current_date - 6;
  perform test_as(test_u('a05'));
  perform test_assert(
    (select count(*) from public.wage_period_attendance_changes(test_period_id()) where change = 'approved_after_lock') > 0,
    '[7.07] a day approved after the lock is reported as approved_after_lock');
  execute 'reset role';
end $$;

-- ----------------------------------------------------------------- 8 · reopen
do $$
declare r text;
begin
  r := test_reopen(test_u('a05'), test_period_id(), 'Fix a typo');
  perform test_assert(r = '42501', '[8.01] an accountant cannot reopen, got ' || r);
  r := test_reopen(test_u('a02'), test_period_id(), 'Fix a typo');
  perform test_assert(r = '42501', '[8.02] a project manager cannot reopen, got ' || r);
  r := test_reopen(test_u('a03'), test_period_id(), 'Fix a typo');
  perform test_assert(r = '42501', '[8.03] a supervisor cannot reopen, got ' || r);
  r := test_reopen(test_u('b01'), test_period_id(), 'Fix a typo');
  perform test_assert(r = '42501', '[8.04] another organisation''s owner cannot reopen, got ' || r);
  r := test_reopen(null, test_period_id(), 'Fix a typo');
  perform test_assert(r = '42501', '[8.05] anon cannot reopen, got ' || r);
  perform test_assert((select status from public.wage_periods where id = test_period_id()) = 'locked'
                  and (select count(*) from public.wage_period_reopens) = 0,
    '[8.06] refused reopens changed nothing and left no history row');

  r := test_reopen(test_u('a01'), test_period_id(), '   ');
  perform test_assert(r = '22023', '[8.07] a blank reason is refused, got ' || r);
  r := test_reopen(test_u('a01'), test_period_id(), repeat('x', 501));
  perform test_assert(r = '22023', '[8.08] a 501-character reason is refused, got ' || r);
  r := test_reopen(test_u('a01'), test_c(99), 'No such period');
  perform test_assert(r = '42501', '[8.09] a missing period answers 42501, got ' || r);

  r := test_reopen(test_u('a01'), test_period_id(), 'Sita overtime corrected after lock');
  perform test_assert(r = 'ok:1', '[8.10] the owner reopens with a reason, got ' || r);
  perform test_assert((select status = 'draft' and locked_at is null and locked_by is null
                         from public.wage_periods where id = test_period_id()),
    '[8.11] the period is a draft again');
  perform test_assert((select count(*) from public.wage_period_reopens
                        where period_id = test_period_id() and reopened_by = test_u('a01')
                          and reason = 'Sita overtime corrected after lock'
                          and locked_by = test_u('a05') and locked_at is not null) = 1,
    '[8.12] the history row records who, why and the lock it undid');
  r := test_reopen(test_u('a01'), test_period_id(), 'again');
  perform test_assert(r = '55000', '[8.13] reopening a draft is refused, got ' || r);

  -- Recalculating the reopened period picks up the correction.
  r := test_calc(test_u('a05'), test_period_id());
  perform test_assert(r = 'ok:1', '[8.14] a reopened period can be recalculated, got ' || r);
  perform test_assert(test_line(test_u('a05'), '02') = '4.00|3600.00|2.00|500.00|0.00|4100.00|0',
    '[8.15] Sita keeps only the day -7 overtime (2 h at 1000 / 8 x 2 = 500), got ' || test_line(test_u('a05'), '02'));
  perform test_assert(test_line(test_u('a05'), '01') = '5.00|4000.00|0.00|0.00|-200.00|3800.00|0',
    '[8.15b] the day approved after the lock is paid once the period is recalculated, got ' || test_line(test_u('a05'), '01'));
  r := test_lock(test_u('a01'), test_period_id());
  perform test_assert(r = 'ok:1', '[8.16] the owner may lock too, got ' || r);

  -- The history is append-only for everyone.
  perform test_assert(test_try(test_u('a01'), 'update public.wage_period_reopens set reason = ''x''') = '42501'
                  and test_try(test_u('a01'), 'delete from public.wage_period_reopens') = '42501',
    '[8.17] clients cannot edit or delete the reopen history');
  begin
    update public.wage_period_reopens set reason = 'x';
    perform test_assert(false, '[8.18] even the table owner cannot edit the history');
  exception when sqlstate '55000' then null; end;
  begin
    delete from public.wage_period_reopens;
    perform test_assert(false, '[8.19] even the table owner cannot delete from the history');
  exception when sqlstate '55000' then null; end;
  perform test_assert((select count(*) from public.wage_period_reopens) = 1, '[8.20] one history row');
end $$;

-- --------------------------------------------------- 9 · cross-organisation, audit
do $$
begin
  perform test_assert(test_try(test_u('b01'), format('select public.calculate_wage_period(%L)',
      (select id from public.wage_periods where org_id = test_org('b')))) = 'ok:1',
    '[9.01] org B''s owner calculates org B''s own period');
  perform test_assert((select count(*) from public.wage_lines where org_id = test_org('b')) = 1
                  and (select count(*) from public.wage_lines where org_id = test_org('a')
                                 and worker_id = test_w('b1')) = 0,
    '[9.02] each organisation''s lines hold only its own workers');
  perform test_assert(test_count(test_u('a05'), 'select 1 from public.wage_summary where org_id = ''' || test_org('b') || '''') = '0',
    '[9.03] org A''s accountant cannot read org B''s lines');

  -- A composite key stops an id swap: org B's period id with org A's org_id.
  perform test_assert(test_try(test_u('a05'), format(
      'insert into public.wage_adjustments (org_id, period_id, worker_id, amount, reason) values (%L, %L, %L, 5, ''x'')',
      test_org('a'), (select id from public.wage_periods where org_id = test_org('b')), test_w('01'))) in ('23503', '42501'),
    '[9.04] an adjustment cannot point org A at org B''s period');

  perform test_assert((select count(*) from public.audit_log where table_name = 'wage_periods') > 0
                  and (select count(*) from public.audit_log where table_name = 'wage_lines') > 0
                  and (select count(*) from public.audit_log where table_name = 'wage_adjustments') = 2
                  and (select count(*) from public.audit_log where table_name = 'wage_period_reopens') = 1,
    '[9.05] writes to the wage tables are audited');
end $$;

rollback;
