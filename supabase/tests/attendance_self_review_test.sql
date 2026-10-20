-- Attendance & Site Presence: nobody reviews a day they recorded, and nobody reviews a
-- correction they proposed (#80 AC 3, ADR-040). review_attendance_day and
-- review_attendance_correction answer 42501, the same as for a caller who may not review
-- at all.
--
-- Why this needs a test of its own: the rule used to hold only because recorders
-- (supervisor) and reviewers (owner, project_manager) are different roles. An owner can
-- change a member's role, so a supervisor made a project manager could review their own
-- days. The suite makes that happen the same way the product would: the superuser
-- updates memberships.role, as an owner's role change does.
--
-- Conventions as in attendance_review_test.sql: test_as, test_assert, SQLSTATE asserts.
-- Dates are relative to current_date, never literals.
begin;

-- ---------------------------------------------------------------- fixtures
-- Org A: owner a01, project manager a02, supervisors a03 and a04, both on site A1.
-- Org B: owner b01.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000a01', 'owner-a@test.local'),
  ('00000000-0000-0000-0000-000000000a02', 'pm-a@test.local'),
  ('00000000-0000-0000-0000-000000000a03', 'sup-a@test.local'),
  ('00000000-0000-0000-0000-000000000a04', 'sup-a2@test.local'),
  ('00000000-0000-0000-0000-000000000b01', 'owner-b@test.local');

insert into public.organizations (id, name, created_by) values
  ('10000000-0000-0000-0000-00000000000a', 'Org A', '00000000-0000-0000-0000-000000000a01'),
  ('10000000-0000-0000-0000-00000000000b', 'Org B', '00000000-0000-0000-0000-000000000b01');

insert into public.memberships (org_id, user_id, role) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000a01', 'owner'),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000a02', 'project_manager'),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000a03', 'supervisor'),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000a04', 'supervisor'),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000b01', 'owner');

insert into public.sites (id, org_id, name, address, latitude, longitude, status, created_by) values
  ('20000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a', 'A One', 'Pune', 0, 0, 'active', '00000000-0000-0000-0000-000000000a01');

insert into public.site_assignments (org_id, site_id, user_id, assigned_by) values
  ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000a03', '00000000-0000-0000-0000-000000000a01'),
  ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000a04', '00000000-0000-0000-0000-000000000a01');

create function public.test_ist(p_days int, p_hour int) returns timestamptz language sql as $$
  select ((current_date - p_days)::timestamp + make_interval(hours => p_hour)) at time zone 'Asia/Kolkata'
$$;
create function public.test_u(k text)    returns uuid language sql immutable as $$ select ('00000000-0000-0000-0000-000000000' || k)::uuid $$;
create function public.test_site(k text) returns uuid language sql immutable as $$ select ('20000000-0000-0000-0000-0000000000' || k)::uuid $$;
create function public.test_w(k text)    returns uuid language sql immutable as $$ select ('77000000-0000-0000-0000-0000000000' || k)::uuid $$;
create function public.test_org(k text)  returns uuid language sql immutable as $$ select ('10000000-0000-0000-0000-00000000000' || k)::uuid $$;
create function public.test_c(n int)     returns uuid language sql immutable as $$ select ('60000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid $$;

insert into public.workers (id, org_id, code, full_name, trade, pay_type, created_by) values
  (public.test_w('01'), public.test_org('a'), 'W-001', 'Ravi', 'mason',  'daily', public.test_u('a01')),
  (public.test_w('02'), public.test_org('a'), 'W-002', 'Sita', 'helper', 'daily', public.test_u('a01')),
  (public.test_w('03'), public.test_org('a'), 'W-003', 'Arun', 'helper', 'daily', public.test_u('a01'));

insert into public.worker_site_assignments (org_id, worker_id, site_id, assigned_by, assigned_at)
select public.test_org('a'), w, public.test_site('a1'), public.test_u('a01'), public.test_ist(30, 9)
  from unnest(array[public.test_w('01'), public.test_w('02'), public.test_w('03')]) as w;

-- Days on A1, all opened by supervisor a03 (written by the superuser; the triggers run).
--   -5 a  open      entries Ravi, Sita by a03
--   -6 b  open      Ravi by a03, Sita by a04      (a04 recorded an entry, not the day)
--   -7 c  open      Ravi by a03
--   -8 d  rejected  Ravi by a03
--   -9 e  approved  Ravi, Sita, Arun by a03       (the correction day)
--  -10 f  approved  Ravi by a03
--  -11 g  open      Ravi by a03
insert into public.attendance_days (org_id, site_id, attendance_date, recorded_by)
select public.test_org('a'), public.test_site('a1'), current_date - d, public.test_u('a03')
  from generate_series(5, 11) as d;

insert into public.attendance_entries (org_id, site_id, attendance_date, worker_id, status, overtime_hours, recorded_by) values
  (public.test_org('a'), public.test_site('a1'), current_date - 5,  public.test_w('01'), 'present', 0, public.test_u('a03')),
  (public.test_org('a'), public.test_site('a1'), current_date - 5,  public.test_w('02'), 'present', 0, public.test_u('a03')),
  (public.test_org('a'), public.test_site('a1'), current_date - 6,  public.test_w('01'), 'present', 0, public.test_u('a03')),
  (public.test_org('a'), public.test_site('a1'), current_date - 6,  public.test_w('02'), 'present', 0, public.test_u('a04')),
  (public.test_org('a'), public.test_site('a1'), current_date - 7,  public.test_w('01'), 'present', 0, public.test_u('a03')),
  (public.test_org('a'), public.test_site('a1'), current_date - 8,  public.test_w('01'), 'present', 0, public.test_u('a03')),
  (public.test_org('a'), public.test_site('a1'), current_date - 9,  public.test_w('01'), 'present', 0, public.test_u('a03')),
  (public.test_org('a'), public.test_site('a1'), current_date - 9,  public.test_w('02'), 'present', 0, public.test_u('a03')),
  (public.test_org('a'), public.test_site('a1'), current_date - 9,  public.test_w('03'), 'present', 0, public.test_u('a03')),
  (public.test_org('a'), public.test_site('a1'), current_date - 10, public.test_w('01'), 'present', 0, public.test_u('a03')),
  (public.test_org('a'), public.test_site('a1'), current_date - 11, public.test_w('01'), 'present', 0, public.test_u('a03'));

-- Fixture states are set by the superuser so they do not depend on the function under test.
create function public.test_force_review(p_day uuid, p_status text, p_by uuid, p_reason text default null)
returns void language sql as $$
  update public.attendance_days
     set status = p_status, reviewed_by = p_by, reviewed_at = now(), review_reason = p_reason
   where id = p_day;
$$;

-- ----------------------------------------------------------------- helpers
create function public.test_day(p_n int) returns uuid language sql as $$
  select id from public.attendance_days where site_id = public.test_site('a1') and attendance_date = current_date - p_n
$$;
create function public.test_day_status(p_n int) returns text language sql as $$
  select status || '|' || coalesce(reviewed_by::text, '-') from public.attendance_days
   where site_id = public.test_site('a1') and attendance_date = current_date - p_n
$$;
create function public.test_ent(p_n int, p_worker text) returns text language sql as $$
  select status from public.attendance_entries
   where site_id = public.test_site('a1') and attendance_date = current_date - p_n and worker_id = public.test_w(p_worker)
$$;
create function public.test_corr(p_n int) returns text language sql as $$
  select review_status || '|' || coalesce(reviewed_by::text, '-') from public.attendance_corrections where id = public.test_c(p_n)
$$;

-- Run p_sql as p_user. Returns 'ok:<rows>' or the SQLSTATE raised.
create function public.test_try(p_user uuid, p_sql text) returns text language plpgsql as $$
declare s text; n int;
begin
  perform test_as(p_user);
  begin
    execute p_sql;
    get diagnostics n = row_count;
  exception when others then s := sqlstate; end;
  execute 'reset role';
  return coalesce(s, 'ok:' || n);
end $$;

create function public.test_review_day(p_user uuid, p_day uuid, p_approve boolean, p_reason text default null)
returns text language sql as $$
  select public.test_try(p_user, format('select public.review_attendance_day(%L, %L, %L)', p_day, p_approve, p_reason));
$$;
create function public.test_review_corr(p_user uuid, p_id uuid, p_approve boolean, p_reason text default null)
returns text language sql as $$
  select public.test_try(p_user, format('select public.review_attendance_correction(%L, %L, %L)', p_id, p_approve, p_reason));
$$;

-- Propose a correction as p_user: one Ravi/Sita/Arun entry on day -9 becomes absent.
create function public.test_propose(p_user uuid, p_id uuid, p_worker text) returns text language sql as $$
  select public.test_try(p_user, format(
    'insert into public.attendance_corrections (id, org_id, site_id, attendance_date, worker_id, new_status, new_overtime_hours, reason) values (%L, %L, %L, current_date - 9, %L, ''absent'', 0, ''Was not on site'')',
    p_id, public.test_org('a'), public.test_site('a1'), public.test_w(p_worker)));
$$;

-- Days d (-8) and e, f (-9, -10) take their states now; c, g and the open ones stay open.
select public.test_force_review(public.test_day(8), 'rejected', public.test_u('a02'), 'Recount headcount');
select public.test_force_review(public.test_day(9), 'approved', public.test_u('a02'));
select public.test_force_review(public.test_day(10), 'approved', public.test_u('a01'));

-- Three pending corrections on day -9, proposed while a03 and a04 are still supervisors:
-- C1 Ravi and C3 Arun by a03, C2 Sita by a04.
do $$
declare r text;
begin
  r := test_propose(test_u('a03'), test_c(1), '01');
  perform test_assert(r = 'ok:1', '[0.01] (setup) C1 proposed by a03, got ' || r);
  r := test_propose(test_u('a04'), test_c(2), '02');
  perform test_assert(r = 'ok:1', '[0.02] (setup) C2 proposed by a04, got ' || r);
  r := test_propose(test_u('a03'), test_c(3), '03');
  perform test_assert(r = 'ok:1', '[0.03] (setup) C3 proposed by a03, got ' || r);
end $$;

-- ============================================ 1. before any role change (the baseline)
-- A supervisor is refused for being a supervisor. This is how the rule held until now.
do $$
declare r text;
begin
  r := test_review_day(test_u('a03'), test_day(5), true);
  perform test_assert(r = '42501', '[1.01] a supervisor cannot review a day, got ' || r);
  r := test_review_corr(test_u('a03'), test_c(1), true);
  perform test_assert(r = '42501', '[1.02] a supervisor cannot review a correction, got ' || r);
  perform test_assert(test_day_status(5) = 'open|-', '[1.03] day -5 is unchanged');
end $$;

-- ============================================ 2. a supervisor made a project manager
-- The owner changes a03's role. a03 recorded day -5, -6, -7, -8, -9, -10, -11 and
-- proposed C1 and C3.
update public.memberships set role = 'project_manager'
 where org_id = public.test_org('a') and user_id = public.test_u('a03');

do $$
declare r text; w bigint;
begin
  -- Positive control: the role change really made a03 a reviewer.
  perform test_as(test_u('a03'));
  perform test_assert(public.can_review_site(public.test_site('a1')), '[2.00] a03 can now review site A1');
  execute 'reset role';

  select coalesce(max(id), 0) into w from audit_log;

  r := test_review_day(test_u('a03'), test_day(5), true);
  perform test_assert(r = '42501', '[2.01] the day recorder cannot approve their day, got ' || r);
  r := test_review_day(test_u('a03'), test_day(5), false, 'Wrong count');
  perform test_assert(r = '42501', '[2.02] the day recorder cannot reject their day, got ' || r);
  perform test_assert(test_day_status(5) = 'open|-', '[2.03] the refused reviews left day -5 open and unstamped');

  r := test_review_day(test_u('a03'), test_day(10), true);
  perform test_assert(r = '42501', '[2.04] a no-op approval of an approved day they recorded is refused too, got ' || r);
  r := test_review_day(test_u('a03'), test_day(10), false, 'Wrong count');
  perform test_assert(r = '42501', '[2.05] the refusal comes before the "approved day cannot be rejected" rule, got ' || r);

  r := test_review_day(test_u('a03'), test_day(8), true);
  perform test_assert(r = '42501', '[2.06] a rejected day they recorded cannot be decided again by them, got ' || r);
  perform test_assert(test_day_status(8) = 'rejected|' || test_u('a02'), '[2.07] day -8 keeps its first reviewer');

  -- The reason rules still come second: a blank reject by the recorder is 42501, not 22023.
  r := test_review_day(test_u('a03'), test_day(7), false);
  perform test_assert(r = '42501', '[2.08] 42501 comes before the reason rule, got ' || r);

  -- Corrections: the proposer.
  r := test_review_corr(test_u('a03'), test_c(1), true);
  perform test_assert(r = '42501', '[2.09] the proposer cannot approve their correction, got ' || r);
  r := test_review_corr(test_u('a03'), test_c(3), false, 'Changed my mind');
  perform test_assert(r = '42501', '[2.10] the proposer cannot reject their correction, got ' || r);
  perform test_assert(test_corr(1) = 'pending|-' and test_corr(3) = 'pending|-', '[2.11] C1 and C3 are still pending');
  perform test_assert(test_ent(9, '01') = 'present' and test_ent(9, '03') = 'present', '[2.12] the entries were not changed');

  perform test_assert((select count(*) from audit_log where id > w) = 0, '[2.13] the refused calls left no audit row');

  -- A correction proposed by someone else, on a day a03 recorded, is not covered by this rule.
  r := test_review_corr(test_u('a03'), test_c(2), true);
  perform test_assert(r = 'ok:1', '[2.14] the day recorder may decide a correction proposed by another, got ' || r);
  perform test_assert(test_corr(2) = 'approved|' || test_u('a03'), '[2.15] C2 is approved by a03');
  perform test_assert(test_ent(9, '02') = 'absent', '[2.16] C2 was applied to the entry');
end $$;

-- ============================================ 3. a supervisor who recorded only an entry
update public.memberships set role = 'project_manager'
 where org_id = public.test_org('a') and user_id = public.test_u('a04');

do $$
declare r text; w bigint;
begin
  select coalesce(max(id), 0) into w from audit_log;

  -- Day -6 was opened by a03, but a04 recorded Sita's entry on it.
  r := test_review_day(test_u('a04'), test_day(6), true);
  perform test_assert(r = '42501', '[3.01] recording one entry of a day is enough to be refused, got ' || r);
  perform test_assert(test_day_status(6) = 'open|-', '[3.02] day -6 is unchanged');
  perform test_assert((select count(*) from audit_log where id > w) = 0, '[3.03] the refused call left no audit row');

  -- The proposer is refused even for a correction that is already decided.
  r := test_review_corr(test_u('a04'), test_c(2), true);
  perform test_assert(r = '42501', '[3.04] the proposer cannot repeat the approval of their decided correction, got ' || r);

  -- Positive controls: a04 recorded nothing on day -7, and did not propose C3.
  r := test_review_day(test_u('a04'), test_day(7), true);
  perform test_assert(r = 'ok:1', '[3.05] a reviewer who recorded nothing on that day may approve it, got ' || r);
  perform test_assert(test_day_status(7) = 'approved|' || test_u('a04'), '[3.06] day -7 is approved by a04');
  r := test_review_corr(test_u('a04'), test_c(3), false, 'Not needed');
  perform test_assert(r = 'ok:1', '[3.07] a reviewer may reject a correction proposed by another, got ' || r);
  perform test_assert(test_corr(3) = 'rejected|' || test_u('a04'), '[3.08] C3 is rejected by a04');
end $$;

-- ============================================ 4. the rest still work
do $$
declare r text;
begin
  r := test_review_day(test_u('a02'), test_day(5), true, 'Checked');
  perform test_assert(r = 'ok:1', '[4.01] the project manager approves the day a03 could not, got ' || r);
  perform test_assert(test_day_status(5) = 'approved|' || test_u('a02'), '[4.02] day -5 is approved by a02');
  r := test_review_day(test_u('a02'), test_day(5), true);
  perform test_assert(r = 'ok:1', '[4.03] approving it again is still a no-op, got ' || r);

  r := test_review_day(test_u('a01'), test_day(6), true);
  perform test_assert(r = 'ok:1', '[4.04] the owner approves day -6, got ' || r);
  r := test_review_day(test_u('a02'), test_day(8), true);
  perform test_assert(r = 'ok:1', '[4.05] a rejected day can be approved by another reviewer, got ' || r);
  r := test_review_day(test_u('a02'), test_day(11), false, 'Wrong date');
  perform test_assert(r = 'ok:1', '[4.06] a reviewer can reject with a reason, got ' || r);
  r := test_review_day(test_u('a02'), test_day(11), false);
  perform test_assert(r = '22023', '[4.07] a blank reject is still 22023 for a reviewer who recorded nothing, got ' || r);

  r := test_review_corr(test_u('a02'), test_c(1), true);
  perform test_assert(r = 'ok:1', '[4.08] another reviewer approves C1, got ' || r);
  perform test_assert(test_corr(1) = 'approved|' || test_u('a02'), '[4.09] C1 is approved by a02');
  perform test_assert(test_ent(9, '01') = 'absent', '[4.10] C1 was applied through the day lock');

  -- Other organisations and unknown ids are the same 42501 as before.
  r := test_review_day(test_u('b01'), test_day(11), true);
  perform test_assert(r = '42501', '[4.11] another organisation''s owner is refused, got ' || r);
  r := test_review_day(test_u('a02'), gen_random_uuid(), true);
  perform test_assert(r = '42501', '[4.12] an unknown day id is 42501, got ' || r);
  r := test_review_corr(test_u('a02'), gen_random_uuid(), true);
  perform test_assert(r = '42501', '[4.13] an unknown correction id is 42501, got ' || r);
end $$;

-- ============================================ 5. the privileges did not change
do $$
begin
  perform test_assert(
    not has_function_privilege('anon', 'public.review_attendance_day(uuid, boolean, text)', 'execute')
    and not has_function_privilege('anon', 'public.review_attendance_correction(uuid, boolean, text)', 'execute'),
    '[5.01] anon still has no execute privilege');
  perform test_assert(
    has_function_privilege('authenticated', 'public.review_attendance_day(uuid, boolean, text)', 'execute')
    and has_function_privilege('authenticated', 'public.review_attendance_correction(uuid, boolean, text)', 'execute'),
    '[5.02] authenticated still has execute');
  perform test_assert(
    (select p.prosecdef and p.proconfig @> array['search_path=public'] from pg_proc p
      where p.oid = 'public.review_attendance_day(uuid, boolean, text)'::regprocedure)
    and (select p.prosecdef and p.proconfig @> array['search_path=public'] from pg_proc p
      where p.oid = 'public.review_attendance_correction(uuid, boolean, text)'::regprocedure),
    '[5.03] both stay SECURITY DEFINER with search_path = public');
end $$;

rollback;
