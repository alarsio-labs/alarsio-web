-- Daily Reporting: send a report back with a reason, and resubmit it (#114, ADR-042).
--
-- send_back_daily_report(), the 'rejected' status (shown as "Sent back"), the
-- review function refusing a sent-back report, resubmission by the author with a
-- reason and a revision that names the send-back it answers, and the view.
-- Conventions as in daily_reports_test.sql: test_as / test_as_anon / test_assert,
-- SQLSTATE asserts. Dates are relative to current_date.
begin;

-- ---------------------------------------------------------------- fixtures
-- Org A: owner a01, project manager a02, supervisors a03 and a04 on site S1,
-- accountant a05. Org B: owner b01.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000a01', 'owner-a@test.local'),
  ('00000000-0000-0000-0000-000000000a02', 'pm-a@test.local'),
  ('00000000-0000-0000-0000-000000000a03', 'sup-a@test.local'),
  ('00000000-0000-0000-0000-000000000a04', 'sup-a2@test.local'),
  ('00000000-0000-0000-0000-000000000a05', 'acct-a@test.local'),
  ('00000000-0000-0000-0000-000000000b01', 'owner-b@test.local');

create function public.test_u(k text)   returns uuid language sql immutable as $$ select ('00000000-0000-0000-0000-000000000' || k)::uuid $$;
create function public.test_org(k text) returns uuid language sql immutable as $$ select ('10000000-0000-0000-0000-00000000000' || k)::uuid $$;
create function public.test_r(n int)    returns uuid language sql immutable as $$ select ('d1000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid $$;
create function public.test_s1()        returns uuid language sql immutable as $$ select '20000000-0000-0000-0000-0000000000a1'::uuid $$;

insert into public.organizations (id, name, created_by) values
  (public.test_org('a'), 'Org A', public.test_u('a01')),
  (public.test_org('b'), 'Org B', public.test_u('b01'));
insert into public.memberships (org_id, user_id, role) values
  (public.test_org('a'), public.test_u('a01'), 'owner'),
  (public.test_org('a'), public.test_u('a02'), 'project_manager'),
  (public.test_org('a'), public.test_u('a03'), 'supervisor'),
  (public.test_org('a'), public.test_u('a04'), 'supervisor'),
  (public.test_org('a'), public.test_u('a05'), 'accountant'),
  (public.test_org('b'), public.test_u('b01'), 'owner');
insert into public.sites (id, org_id, name, address, latitude, longitude, status, created_by) values
  (public.test_s1(), public.test_org('a'), 'S One', 'Pune', 0, 0, 'active', public.test_u('a01'));
insert into public.site_assignments (org_id, site_id, user_id, assigned_by) values
  (public.test_org('a'), public.test_s1(), public.test_u('a03'), public.test_u('a01')),
  (public.test_org('a'), public.test_s1(), public.test_u('a04'), public.test_u('a01'));

-- Reports, written by the superuser:
--   1  a03, submitted   the one sent back and resubmitted
--   2  a03, draft       cannot be sent back
--   3  a03, submitted   reviewed in the setup below, then cannot be sent back
--   4  a01, submitted   the owner's own report: they cannot send it back, the PM can
--   5  a03, submitted   ordinary edits, never sent back
insert into public.daily_reports
  (id, org_id, site_id, report_date, author_id, status, headcount, work_done, submitted_at, submitted_by) values
  (public.test_r(1), public.test_org('a'), public.test_s1(), current_date - 1, public.test_u('a03'), 'submitted', 12, 'Slab poured', now(), public.test_u('a03')),
  (public.test_r(3), public.test_org('a'), public.test_s1(), current_date - 3, public.test_u('a03'), 'submitted', 8,  'Shuttering',  now(), public.test_u('a03')),
  (public.test_r(4), public.test_org('a'), public.test_s1(), current_date - 4, public.test_u('a01'), 'submitted', 4,  'Inspection',  now(), public.test_u('a01')),
  (public.test_r(5), public.test_org('a'), public.test_s1(), current_date - 5, public.test_u('a03'), 'submitted', 6,  'Plaster',     now(), public.test_u('a03'));
insert into public.daily_reports (id, org_id, site_id, report_date, author_id, status, headcount, work_done) values
  (public.test_r(2), public.test_org('a'), public.test_s1(), current_date - 2, public.test_u('a03'), 'draft', null, 'Half written');

-- ----------------------------------------------------------------- helpers

-- Run p_sql as p_user ('anon' when null). Returns 'ok:<rows>' or the SQLSTATE raised.
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

create function public.test_send_back(p_user uuid, p_report uuid, p_reason text) returns text language sql as $$
  select public.test_try(p_user, format('select public.send_back_daily_report(%L, %L)', p_report, p_reason));
$$;

create function public.test_audit_count(p_report uuid) returns bigint language sql as $$
  select count(*) from public.audit_log where table_name = 'daily_reports' and row_id = p_report;
$$;

create function public.test_status(p_report uuid) returns text language sql as $$
  select status from public.daily_reports where id = p_report;
$$;

-- A reviewed report for case 3, through the real function.
do $$ begin
  perform test_as(test_u('a02'));
  perform public.review_daily_report(test_r(3), 'Fine');
  execute 'reset role';
  perform test_assert(test_status(test_r(3)) = 'reviewed', '[0.01] (setup) report 3 is reviewed');
end $$;

-- ------------------------------------------------- 1 · who may send back
do $$
declare r text; before bigint;
begin
  before := test_audit_count(test_r(1));

  r := test_send_back(null, test_r(1), 'Recount');
  perform test_assert(r = '42501', '[1.01] anon cannot send back, got ' || r);
  r := test_send_back(test_u('a03'), test_r(1), 'Recount');
  perform test_assert(r = '42501', '[1.02] the author (a supervisor) cannot send back, got ' || r);
  r := test_send_back(test_u('a04'), test_r(1), 'Recount');
  perform test_assert(r = '42501', '[1.03] another supervisor of the site cannot send back, got ' || r);
  r := test_send_back(test_u('a05'), test_r(1), 'Recount');
  perform test_assert(r = '42501', '[1.04] the accountant cannot send back, got ' || r);
  r := test_send_back(test_u('b01'), test_r(1), 'Recount');
  perform test_assert(r = '42501', '[1.05] another organisation''s owner cannot send back, got ' || r);
  r := test_send_back(test_u('a01'), '99999999-0000-0000-0000-000000000000', 'Recount');
  perform test_assert(r = '42501', '[1.06] an unknown id is the same 42501, got ' || r);
  r := test_send_back(test_u('a01'), test_r(2), 'Recount');
  perform test_assert(r = '42501', '[1.07] a draft cannot be sent back, and says so as 42501, got ' || r);
  r := test_send_back(test_u('a01'), test_r(4), 'Mine');
  perform test_assert(r = '42501', '[1.08] nobody sends back their own report, got ' || r);
  r := test_send_back(test_u('a01'), test_r(3), 'Too late');
  perform test_assert(r = '55000', '[1.09] a reviewed report is final, got ' || r);

  -- The reason: required, trimmed, at most 1000 characters.
  r := test_send_back(test_u('a02'), test_r(1), null);
  perform test_assert(r = '22023', '[1.10] a null reason is refused, got ' || r);
  r := test_send_back(test_u('a02'), test_r(1), '   ');
  perform test_assert(r = '22023', '[1.11] a blank reason is refused, got ' || r);
  r := test_send_back(test_u('a02'), test_r(1), repeat('x', 1001));
  perform test_assert(r = '22023', '[1.12] a reason of 1001 characters is refused, got ' || r);

  perform test_assert(test_status(test_r(1)) = 'submitted', '[1.13] every refusal left report 1 submitted');
  perform test_assert(test_audit_count(test_r(1)) = before, '[1.14] no refused send-back wrote an audit row');
  perform test_assert(test_status(test_r(3)) = 'reviewed', '[1.15] the reviewed report is still reviewed');
end $$;

-- ------------------------------------------------- 2 · sending back
do $$
declare r text; v record; before bigint;
begin
  before := test_audit_count(test_r(1));
  r := test_send_back(test_u('a02'), test_r(1), '  Headcount does not match the register  ');
  perform test_assert(r = 'ok:1', '[2.01] the project manager sends back report 1, got ' || r);

  select * into v from public.daily_reports where id = test_r(1);
  perform test_assert(v.status = 'rejected', '[2.02] the status is rejected, got ' || v.status);
  perform test_assert(v.review_note = 'Headcount does not match the register', '[2.03] the reason is stored trimmed, got ' || coalesce(v.review_note, 'null'));
  perform test_assert(v.reviewed_by = test_u('a02') and v.reviewed_at is not null, '[2.04] who and when are stamped');
  perform test_assert(v.headcount = 12 and v.work_done = 'Slab poured', '[2.05] the content did not change');
  perform test_assert(v.submitted_by = test_u('a03') and v.submitted_at is not null, '[2.06] the submit stamp is kept');
  perform test_assert(test_audit_count(test_r(1)) = before + 1, '[2.07] the send-back wrote one audit row');

  -- A second send-back does nothing and keeps the first reason and sender.
  r := test_send_back(test_u('a01'), test_r(1), 'Another reason');
  perform test_assert(r = 'ok:1', '[2.08] sending back again succeeds, got ' || r);
  perform test_assert((select review_note from public.daily_reports where id = test_r(1)) = 'Headcount does not match the register'
                  and (select reviewed_by from public.daily_reports where id = test_r(1)) = test_u('a02'),
    '[2.09] the first reason and sender are kept');
  perform test_assert(test_audit_count(test_r(1)) = before + 1, '[2.10] the no-op wrote no audit row');

  -- The owner cannot send back their own report (1.08), but the project manager can.
  r := test_send_back(test_u('a02'), test_r(4), 'Add the inspector''s name');
  perform test_assert(r = 'ok:1', '[2.11] the PM sends back the owner''s report, got ' || r);

  -- A sent-back report cannot be reviewed until it is resubmitted.
  r := test_try(test_u('a01'), format('select public.review_daily_report(%L, null)', test_r(1)));
  perform test_assert(r = '42501', '[2.12] review_daily_report refuses a sent-back report, got ' || r);
  perform test_assert(test_status(test_r(1)) = 'rejected', '[2.13] it is still sent back');
end $$;

-- ------------------------------------------------- 3 · who can read it
do $$
declare r text;
begin
  foreach r in array array['a01', 'a02', 'a03', 'a04'] loop
    perform test_assert(
      public.test_try(test_u(r), format('select 1 from public.daily_report_status where id = %L and status = ''rejected''', test_r(1))) = 'ok:1',
      '[3.01] ' || r || ' sees the sent-back report in daily_report_status');
  end loop;
  r := test_try(test_u('a05'), format('select 1 from public.daily_report_status where id = %L', test_r(1)));
  perform test_assert(r = 'ok:0', '[3.02] the accountant sees nothing, got ' || r);
  r := test_try(test_u('b01'), format('select 1 from public.daily_report_status where id = %L', test_r(1)));
  perform test_assert(r = 'ok:0', '[3.03] another organisation sees nothing, got ' || r);
end $$;

-- ------------------------------------------------- 4 · a client cannot send back
do $$
declare r text;
begin
  r := test_try(test_u('a03'), format('update public.daily_reports set status = ''rejected'' where id = %L', test_r(5)));
  perform test_assert(r = '42501', '[4.01] the author cannot set rejected, got ' || r);
  r := test_try(test_u('a02'), format('update public.daily_reports set status = ''rejected'' where id = %L', test_r(5)));
  perform test_assert(r in ('42501', 'ok:0'), '[4.02] a manager cannot update to rejected directly, got ' || r);
  r := test_try(test_u('a03'), format('update public.daily_reports set review_note = ''x'' where id = %L', test_r(1)));
  perform test_assert(r = '42501', '[4.03] no client writes the review note, got ' || r);
  perform test_assert(test_status(test_r(5)) = 'submitted', '[4.04] report 5 is still submitted');
end $$;

-- ------------------------------------------------- 5 · resubmitting
do $$
declare r text; v record; rv record; before bigint;
begin
  before := test_audit_count(test_r(1));

  r := test_try(test_u('a03'), format('update public.daily_reports set status = ''submitted'' where id = %L', test_r(1)));
  perform test_assert(r = '22023', '[5.01] resubmitting needs a reason even with no other change, got ' || r);
  r := test_try(test_u('a03'), format('update public.daily_reports set status = ''submitted'', edit_reason = ''  '' where id = %L', test_r(1)));
  perform test_assert(r = '22023', '[5.02] a blank reason is refused, got ' || r);
  r := test_try(test_u('a03'), format('update public.daily_reports set status = ''draft'' where id = %L', test_r(1)));
  perform test_assert(r = '55000', '[5.03] a sent-back report cannot go back to draft, got ' || r);
  r := test_try(test_u('a04'), format('update public.daily_reports set status = ''submitted'', edit_reason = ''Mine now'' where id = %L', test_r(1)));
  perform test_assert(r = 'ok:0', '[5.04] another supervisor cannot resubmit it, got ' || r);
  r := test_try(test_u('a02'), format('update public.daily_reports set status = ''submitted'', edit_reason = ''Fixed it'' where id = %L', test_r(1)));
  perform test_assert(r = 'ok:0', '[5.05] the manager cannot resubmit it, got ' || r);
  perform test_assert(test_status(test_r(1)) = 'rejected', '[5.06] still sent back after every refusal');
  perform test_assert(test_audit_count(test_r(1)) = before, '[5.07] no refused resubmission wrote an audit row');
  perform test_assert(not exists (select 1 from public.daily_report_revisions where report_id = test_r(1)), '[5.08] and no revision');

  -- The author answers with no content change: a revision is still written.
  r := test_try(test_u('a03'), format(
    'update public.daily_reports set status = ''submitted'', edit_reason = ''Register was wrong, 12 is right'' where id = %L', test_r(1)));
  perform test_assert(r = 'ok:1', '[5.09] the author resubmits with a reason, got ' || r);

  select * into v from public.daily_reports where id = test_r(1);
  perform test_assert(v.status = 'submitted', '[5.10] the report is submitted again');
  perform test_assert(v.reviewed_at is null and v.reviewed_by is null and v.review_note is null, '[5.11] the review fields are cleared');
  perform test_assert(v.edit_reason is null, '[5.12] the edit reason is not stored on the report');

  select * into rv from public.daily_report_revisions where report_id = test_r(1) and revision_no = 1;
  perform test_assert(found, '[5.13] revision 1 exists');
  perform test_assert(rv.reason = 'Register was wrong, 12 is right' and rv.edited_by = test_u('a03'), '[5.14] it keeps the author''s reason and name');
  perform test_assert(rv.sent_back_reason = 'Headcount does not match the register'
                  and rv.sent_back_by = test_u('a02') and rv.sent_back_at is not null,
    '[5.15] it names the send-back it answers');
  perform test_assert(rv.headcount = 12 and rv.work_done = 'Slab poured', '[5.16] it keeps the content as it was');

  -- Sent back a second time, then fixed with a content change.
  r := test_send_back(test_u('a01'), test_r(1), 'Still wrong: count the helpers');
  perform test_assert(r = 'ok:1', '[5.17] the owner sends it back again, got ' || r);
  r := test_try(test_u('a03'), format(
    'update public.daily_reports set status = ''submitted'', headcount = 14, edit_reason = ''Added two helpers'' where id = %L', test_r(1)));
  perform test_assert(r = 'ok:1', '[5.18] the author fixes and resubmits, got ' || r);
  select * into rv from public.daily_report_revisions where report_id = test_r(1) and revision_no = 2;
  perform test_assert(rv.headcount = 12 and rv.sent_back_reason = 'Still wrong: count the helpers' and rv.sent_back_by = test_u('a01'),
    '[5.19] revision 2 keeps headcount 12 and the second send-back');
  perform test_assert((select headcount from public.daily_reports where id = test_r(1)) = 14, '[5.20] the report now says 14');

  -- An ordinary edit of a submitted report names no send-back.
  r := test_try(test_u('a03'), format(
    'update public.daily_reports set headcount = 7, edit_reason = ''Late arrival'' where id = %L', test_r(5)));
  perform test_assert(r = 'ok:1', '[5.21] an ordinary edit still works, got ' || r);
  select * into rv from public.daily_report_revisions where report_id = test_r(5);
  perform test_assert(rv.sent_back_reason is null and rv.sent_back_by is null and rv.sent_back_at is null,
    '[5.22] an ordinary edit''s revision names no send-back');

  -- Resubmitted, it can be reviewed, and then it is final again.
  r := test_try(test_u('a02'), format('select public.review_daily_report(%L, ''Good now'')', test_r(1)));
  perform test_assert(r = 'ok:1' and test_status(test_r(1)) = 'reviewed', '[5.23] a resubmitted report can be reviewed, got ' || r);
  r := test_send_back(test_u('a02'), test_r(1), 'Changed my mind');
  perform test_assert(r = '55000', '[5.24] and then it cannot be sent back, got ' || r);
end $$;

-- ------------------------------------------------- 6 · shape guards
do $$
declare denied int := 0;
begin
  -- The three sent-back columns are all set or all null.
  begin
    insert into public.daily_report_revisions
      (org_id, site_id, report_id, revision_no, headcount, work_done, serious_blocker, safety_incident, reason, edited_by, sent_back_reason)
    values (test_org('a'), test_s1(), test_r(5), 99, 1, 'x', false, false, 'r', test_u('a03'), 'only the reason');
  exception when check_violation then denied := denied + 1; end;
  -- A sent-back report always carries its reason.
  begin
    update public.daily_reports set status = 'rejected', reviewed_at = now(), reviewed_by = test_u('a02'), review_note = null
     where id = test_r(5);
  exception when check_violation then denied := denied + 1; end;
  -- ... and not a blank one.
  begin
    update public.daily_reports set status = 'rejected', reviewed_at = now(), reviewed_by = test_u('a02'), review_note = '  '
     where id = test_r(5);
  exception when check_violation then denied := denied + 1; end;
  perform test_assert(denied = 3, '[6.01] partial sent-back columns and a missing or blank send-back reason are refused, got ' || denied);
end $$;

-- ------------------------------------------------- 7 · the guard's transitions, direct
-- Even an owner of the table (no RLS) cannot take a shortcut through the lifecycle.
do $$
declare denied int := 0; v_id uuid := 'd1000000-0000-0000-0000-000000000077';
begin
  insert into public.daily_reports (id, org_id, site_id, report_date, author_id, status, headcount, work_done)
  values (v_id, test_org('a'), test_s1(), current_date - 7, test_u('a03'), 'draft', 3, 'Draft');

  -- draft -> rejected
  begin
    update public.daily_reports set status = 'rejected', reviewed_at = now(), reviewed_by = test_u('a02'), review_note = 'x'
     where id = v_id;
  exception when sqlstate '55000' then denied := denied + 1; end;

  update public.daily_reports set status = 'submitted' where id = v_id;
  update public.daily_reports set status = 'rejected', reviewed_at = now(), reviewed_by = test_u('a02'), review_note = 'First'
   where id = v_id;

  -- rejected -> rejected (a second reason), and rejected -> reviewed
  begin
    update public.daily_reports set review_note = 'Second' where id = v_id;
  exception when sqlstate '55000' then denied := denied + 1; end;
  begin
    update public.daily_reports set status = 'reviewed', reviewed_at = now(), reviewed_by = test_u('a02'), review_note = null
     where id = v_id;
  exception when sqlstate '55000' then denied := denied + 1; end;
  perform test_assert(denied = 3, '[7.01] draft->rejected, rejected->rejected and rejected->reviewed are refused with 55000, got ' || denied);

  -- A resubmit with no signed-in editor is refused, even with a reason. test_as
  -- leaves the last user's id in the claim, so clear it as daily_reports_test does.
  perform set_config('request.jwt.claim.sub', '', true);
  begin
    update public.daily_reports set status = 'submitted', edit_reason = 'From a script' where id = v_id;
    perform test_assert(false, '[7.02] a resubmit with no auth.uid() must be refused');
  exception when sqlstate '28000' then null; end;
  perform test_assert(test_status(v_id) = 'rejected' and (select review_note from public.daily_reports where id = v_id) = 'First',
    '[7.03] the report is still sent back with its first reason');
end $$;

rollback;
