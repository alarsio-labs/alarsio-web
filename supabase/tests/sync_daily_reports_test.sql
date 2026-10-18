-- Daily Reporting: sync_daily_reports() and daily_report_matches(). Issue #63.
-- Every case goes through sync_push, so each check is the verdict a phone
-- would see, and then reads the rows back. Positive and negative. Runs on the
-- team runner (shim, no pgTAP).
begin;

-- Org A: alice owner, carol PM, dave accountant, bob and fred supervisors on
-- site 1, gina supervisor on site 2 only. Site 3 is archived (bob keeps his
-- assignment there). Org B: eve owner, hank supervisor on site B.
insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-00000000000a', 'alice@x'),
  ('b0000000-0000-0000-0000-00000000000b', 'bob@x'),
  ('c0000000-0000-0000-0000-00000000000c', 'carol@x'),
  ('d0000000-0000-0000-0000-00000000000d', 'dave@x'),
  ('e0000000-0000-0000-0000-00000000000e', 'eve@x'),
  ('f0000000-0000-0000-0000-00000000000f', 'fred@x'),
  ('90000000-0000-0000-0000-000000000009', 'gina@x'),
  ('80000000-0000-0000-0000-000000000008', 'hank@x');
insert into public.organizations (id, name, created_by) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Org A', 'a0000000-0000-0000-0000-00000000000a'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Org B', 'e0000000-0000-0000-0000-00000000000e');
insert into public.memberships (org_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'owner'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000c', 'project_manager'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-00000000000d', 'accountant'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b', 'supervisor'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-00000000000f', 'supervisor'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000009', 'supervisor'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-00000000000e', 'owner'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '80000000-0000-0000-0000-000000000008', 'supervisor');
insert into public.sites (id, org_id, name, address, latitude, longitude, created_by) values
  ('51000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Site 1', 'x', 19.0, 73.0, 'a0000000-0000-0000-0000-00000000000a'),
  ('51000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Site 2', 'x', 19.1, 73.1, 'a0000000-0000-0000-0000-00000000000a'),
  ('51000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'Site 3 archived', 'x', 19.2, 73.2, 'a0000000-0000-0000-0000-00000000000a'),
  ('51000000-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-000000000002', 'Site B', 'x', 18.0, 72.0, 'e0000000-0000-0000-0000-00000000000e');
insert into public.site_assignments (org_id, site_id, user_id, assigned_by) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-00000000000a'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-00000000000f', 'a0000000-0000-0000-0000-00000000000a'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000002', '90000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-00000000000a'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-00000000000a'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '51000000-0000-0000-0000-0000000000b1', '80000000-0000-0000-0000-000000000008', 'e0000000-0000-0000-0000-00000000000e');
update public.sites set status = 'archived', archived_at = now(),
  archived_by = 'a0000000-0000-0000-0000-00000000000a'
  where id = '51000000-0000-0000-0000-000000000003';

-- ------------------------------------------------------------------ helpers

-- Push as a user and switch back, so assertions run as postgres.
create function public.sdr_push(p_uid uuid, p_records jsonb) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform test_as(p_uid);
  v := public.sync_push(jsonb_build_object('version', 1, 'device_id', 'test-phone', 'records', p_records));
  execute 'reset role';
  return v;
end $$;

-- One daily_reports record.
create function public.sdr_rec(p_id uuid, p_payload jsonb) returns jsonb language sql as $$
  select jsonb_build_object('entity', 'daily_reports', 'record_id', p_id, 'payload', p_payload)
$$;

-- Push one record and return "verdict:reason".
create function public.sdr_one(p_uid uuid, p_id uuid, p_payload jsonb) returns text language sql as $$
  select (x ->> 'verdict') || ':' || coalesce(x ->> 'reason', '-')
  from jsonb_array_elements(public.sdr_push(p_uid, jsonb_build_array(public.sdr_rec(p_id, p_payload))) -> 'results') as t (x)
$$;

-- A complete submitted report for site 1 on the given day; override with ||.
create function public.sdr_report(p_date date) returns jsonb language sql as $$
  select jsonb_build_object(
    'org_id', 'aaaaaaaa-0000-0000-0000-000000000001', 'site_id', '51000000-0000-0000-0000-000000000001',
    'report_date', p_date, 'status', 'submitted', 'headcount', 12, 'work_done', 'Slab poured',
    'blockers', null, 'serious_blocker', false, 'safety_incident', false, 'next_day_plan', 'Curing')
$$;

create function public.sdr_audit_count(p_id uuid) returns bigint language sql as $$
  select count(*) from public.audit_log where table_name = 'daily_reports' and row_id = p_id
$$;

create function public.sdr_revisions(p_id uuid) returns bigint language sql as $$
  select count(*) from public.daily_report_revisions where report_id = p_id
$$;

-- ---------------------------------------------------------------- structure

do $$ begin
  perform test_assert(
    (select not prosecdef and proconfig @> array['search_path=public']
       from pg_proc where oid = 'public.sync_daily_reports(uuid, jsonb)'::regprocedure),
    'sync_daily_reports is security invoker and pins search_path');
  perform test_assert(
    not has_function_privilege('anon', 'public.sync_daily_reports(uuid, jsonb)', 'execute')
    and not has_function_privilege('public', 'public.sync_daily_reports(uuid, jsonb)', 'execute')
    and has_function_privilege('authenticated', 'public.sync_daily_reports(uuid, jsonb)', 'execute'),
    'sync_daily_reports is revoked from public and anon, granted to authenticated');
  perform test_assert(
    (select prosecdef and proconfig @> array['search_path=public']
       from pg_proc where proname = 'daily_report_matches'),
    'daily_report_matches is security definer and pins search_path');
  perform test_assert(
    (select not has_function_privilege('anon', p.oid, 'execute')
            and not has_function_privilege('public', p.oid, 'execute')
       from pg_proc p where p.proname = 'daily_report_matches'),
    'daily_report_matches is revoked from public and anon');
end $$;

-- ------------------------------------------------- new reports and the replay

do $$
declare
  v_id  uuid := 'd3000000-0000-0000-0000-000000000001';
  v_p   jsonb := public.sdr_report('2026-10-10') || '{"status": "draft", "headcount": null, "work_done": ""}';
  v_r   text;
  v_audit bigint;
begin
  -- a draft, half filled in.
  v_r := public.sdr_one('b0000000-0000-0000-0000-00000000000b', v_id, v_p);
  perform test_assert(v_r = 'accepted:-', 'a new draft is accepted, got ' || v_r);
  perform test_assert(
    (select status = 'draft' and author_id = 'b0000000-0000-0000-0000-00000000000b' and submitted_at is null
            and headcount is null and work_done = ''
       from public.daily_reports where id = v_id),
    'the draft is stored under the phone''s id, authored by the caller');

  -- the same draft again: accepted, and nothing is written.
  v_audit := public.sdr_audit_count(v_id);
  v_r := public.sdr_one('b0000000-0000-0000-0000-00000000000b', v_id, v_p);
  perform test_assert(v_r = 'accepted:-', 'a replayed draft is accepted, got ' || v_r);
  perform test_assert(public.sdr_audit_count(v_id) = v_audit and v_audit = 1,
    'a replay writes no audit row');

  -- submit it: the server stamps the submit, and no revision is written.
  v_r := public.sdr_one('b0000000-0000-0000-0000-00000000000b', v_id, public.sdr_report('2026-10-10'));
  perform test_assert(v_r = 'accepted:-', 'draft -> submitted is accepted, got ' || v_r);
  perform test_assert(
    (select status = 'submitted' and submitted_by = 'b0000000-0000-0000-0000-00000000000b'
            and submitted_at is not null and headcount = 12
       from public.daily_reports where id = v_id),
    'the report is submitted with the server''s stamp');
  perform test_assert(public.sdr_revisions(v_id) = 0, 'submitting a draft writes no revision');

  -- a whole report filed offline arrives as one submitted record.
  v_r := public.sdr_one('b0000000-0000-0000-0000-00000000000b', 'd3000000-0000-0000-0000-000000000002',
                        public.sdr_report('2026-10-11'));
  perform test_assert(v_r = 'accepted:-', 'a new submitted report is accepted, got ' || v_r);
  perform test_assert(
    (select status = 'submitted' and submitted_at is not null
       from public.daily_reports where id = 'd3000000-0000-0000-0000-000000000002'),
    'it is stored as submitted');
end $$;

-- ---------------------------------------------------- edits after submit

do $$
declare
  v_id uuid := 'd3000000-0000-0000-0000-000000000001';
  v_edit jsonb := public.sdr_report('2026-10-10') || '{"headcount": 14, "work_done": "Slab poured, shuttering struck"}';
  v_r text;
begin
  -- no reason: refused, nothing changes.
  v_r := public.sdr_one('b0000000-0000-0000-0000-00000000000b', v_id, v_edit);
  perform test_assert(v_r = 'rejected:invalid_input', 'an edit after submit with no reason is rejected, got ' || v_r);
  perform test_assert((select headcount = 12 from public.daily_reports where id = v_id)
                      and public.sdr_revisions(v_id) = 0,
    'the refused edit changed nothing and wrote no revision');

  -- with a reason: applied, one revision with the old values.
  v_r := public.sdr_one('b0000000-0000-0000-0000-00000000000b', v_id,
                        v_edit || '{"edit_reason": "Miscounted the masons"}');
  perform test_assert(v_r = 'accepted:-', 'an edit with a reason is accepted, got ' || v_r);
  perform test_assert(
    (select headcount = 14 and work_done = 'Slab poured, shuttering struck' and edit_reason is null
       from public.daily_reports where id = v_id),
    'the edit is applied and edit_reason is not stored');
  perform test_assert(
    (select count(*) = 1 and bool_and(headcount = 12 and work_done = 'Slab poured'
                                      and reason = 'Miscounted the masons'
                                      and edited_by = 'b0000000-0000-0000-0000-00000000000b')
       from public.daily_report_revisions where report_id = v_id),
    'exactly one revision holds the previous values, the editor and the reason');

  -- the same edit replayed: accepted, still one revision.
  v_r := public.sdr_one('b0000000-0000-0000-0000-00000000000b', v_id,
                        v_edit || '{"edit_reason": "Miscounted the masons"}');
  perform test_assert(v_r = 'accepted:-' and public.sdr_revisions(v_id) = 1,
    'a replayed edit is accepted and writes no second revision, got ' || v_r);

  -- back to draft: refused as an invalid move.
  v_r := public.sdr_one('b0000000-0000-0000-0000-00000000000b', v_id, v_edit || '{"status": "draft"}');
  perform test_assert(v_r = 'rejected:invalid_state', 'submitted -> draft is rejected, got ' || v_r);
  perform test_assert((select status = 'submitted' from public.daily_reports where id = v_id),
    'the report is still submitted');

  -- the same id for another day or another site: a different report.
  v_r := public.sdr_one('b0000000-0000-0000-0000-00000000000b', v_id, v_edit || '{"report_date": "2026-10-09"}');
  perform test_assert(v_r = 'conflict:different_report', 'a changed date is a conflict, got ' || v_r);
  v_r := public.sdr_one('b0000000-0000-0000-0000-00000000000b', v_id,
                        v_edit || '{"site_id": "51000000-0000-0000-0000-000000000002"}');
  perform test_assert(v_r = 'conflict:different_report', 'a changed site is a conflict, got ' || v_r);
  perform test_assert(
    (select site_id = '51000000-0000-0000-0000-000000000001' and report_date = '2026-10-10' and headcount = 14
       from public.daily_reports where id = v_id),
    'the stored report kept its site, date and content');

  -- fred, on the same site, cannot change bob's report through sync.
  v_r := public.sdr_one('f0000000-0000-0000-0000-00000000000f', v_id,
                        v_edit || '{"headcount": 1, "edit_reason": "Not mine"}');
  perform test_assert(v_r = 'rejected:permission_denied', 'another supervisor''s edit is rejected, got ' || v_r);
  perform test_assert((select headcount = 14 from public.daily_reports where id = v_id),
    'bob''s report is unchanged');

  -- fred files his own report for the same site and day: one report per site-day.
  v_r := public.sdr_one('f0000000-0000-0000-0000-00000000000f', 'd3000000-0000-0000-0000-000000000003',
                        public.sdr_report('2026-10-10'));
  perform test_assert(v_r = 'conflict:duplicate', 'a second report for the site and day is a conflict, got ' || v_r);
  perform test_assert(not exists (select 1 from public.daily_reports where id = 'd3000000-0000-0000-0000-000000000003'),
    'and is not stored');
end $$;

-- ---------------------------------------------------------- reviewed is final

do $$
declare
  v_id uuid := 'd3000000-0000-0000-0000-000000000002';
  v_r  text;
begin
  perform test_as('c0000000-0000-0000-0000-00000000000c');
  perform public.review_daily_report(v_id, 'Seen');
  reset role;

  -- the phone missed the answer and sends the submitted report again.
  v_r := public.sdr_one('b0000000-0000-0000-0000-00000000000b', v_id, public.sdr_report('2026-10-11'));
  perform test_assert(v_r = 'accepted:-', 'a replay of a since-reviewed report is accepted, got ' || v_r);

  -- a stale phone edits it.
  v_r := public.sdr_one('b0000000-0000-0000-0000-00000000000b', v_id,
                        public.sdr_report('2026-10-11') || '{"headcount": 30, "edit_reason": "Late change"}');
  perform test_assert(v_r = 'conflict:reviewed', 'an edit to a reviewed report is a conflict, got ' || v_r);
  perform test_assert(
    (select status = 'reviewed' and headcount = 12 and review_note = 'Seen'
       from public.daily_reports where id = v_id)
    and public.sdr_revisions(v_id) = 0,
    'the reviewed report is unchanged and has no revision');
end $$;

-- -------------------------------------------------------------- who may push

do $$
declare
  u    uuid;
  v_r  text;
  n    int := 0;
begin
  -- owner, project manager, accountant, and a supervisor of another site.
  foreach u in array array['a0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000c',
                           'd0000000-0000-0000-0000-00000000000d', '90000000-0000-0000-0000-000000000009']::uuid[] loop
    n := n + 1;
    v_r := public.sdr_one(u, ('d3000000-0000-0000-0000-0000000001' || lpad(n::text, 2, '0'))::uuid,
                          public.sdr_report('2026-10-12'));
    perform test_assert(v_r = 'rejected:permission_denied', 'cannot file a site 1 report: ' || u || ', got ' || v_r);
  end loop;

  -- bob on the archived site.
  v_r := public.sdr_one('b0000000-0000-0000-0000-00000000000b', 'd3000000-0000-0000-0000-000000000110',
                        public.sdr_report('2026-10-12') || '{"site_id": "51000000-0000-0000-0000-000000000003"}');
  perform test_assert(v_r = 'rejected:permission_denied', 'an archived site takes no report, got ' || v_r);

  -- hank (org B) on org A's site, and bob on org B's site.
  v_r := public.sdr_one('80000000-0000-0000-0000-000000000008', 'd3000000-0000-0000-0000-000000000111',
                        public.sdr_report('2026-10-12'));
  perform test_assert(v_r = 'rejected:permission_denied', 'another organisation''s supervisor is rejected, got ' || v_r);
  v_r := public.sdr_one('b0000000-0000-0000-0000-00000000000b', 'd3000000-0000-0000-0000-000000000112',
                        public.sdr_report('2026-10-12')
                        || '{"org_id": "bbbbbbbb-0000-0000-0000-000000000002", "site_id": "51000000-0000-0000-0000-0000000000b1"}');
  perform test_assert(v_r = 'rejected:permission_denied', 'bob cannot file on org B''s site, got ' || v_r);

  -- hank cannot touch bob's report by its id either.
  v_r := public.sdr_one('80000000-0000-0000-0000-000000000008', 'd3000000-0000-0000-0000-000000000001',
                        public.sdr_report('2026-10-10') || '{"headcount": 1, "edit_reason": "x"}');
  perform test_assert(v_r = 'rejected:permission_denied', 'a cross-org id swap is rejected, got ' || v_r);
  perform test_assert((select headcount = 14 from public.daily_reports where id = 'd3000000-0000-0000-0000-000000000001'),
    'bob''s report is untouched by org B');

  perform test_assert(not exists (select 1 from public.daily_reports where id::text like 'd3000000-0000-0000-0000-0000000001%'),
    'no refused push left a report');
end $$;

-- ------------------------------------------------------------- bad payloads

do $$
declare
  v_base jsonb := public.sdr_report('2026-10-13');
  v_bad  jsonb[] := array[
    v_base - 'site_id',                                         -- missing site
    v_base - 'org_id',                                          -- missing org
    v_base || '{"report_date": "not a date"}',
    v_base || '{"site_id": "not-a-uuid"}',
    v_base || '{"headcount": "12"}',                            -- a string, not a number
    v_base || '{"headcount": 12.5}',
    v_base || '{"headcount": 1001}',
    v_base || '{"serious_blocker": "yes"}',
    v_base || '{"work_done": 7}',
    v_base || '{"status": "reviewed"}',
    v_base || '{"status": "archived"}',
    v_base || '{"work_done": "   "}',                            -- submitted with nothing done
    v_base || '{"headcount": null}',                            -- submitted with no headcount
    v_base || jsonb_build_object('report_date', (now() at time zone 'utc')::date + 3),
    v_base || jsonb_build_object('work_done', repeat('x', 4001)),
    v_base || '{"serious_blocker": true, "blockers": ""}',
    v_base || '{"org_id": "bbbbbbbb-0000-0000-0000-000000000002"}', -- site 1 is not in org B
    '[]'::jsonb];
  v_r text;
  i   int;
begin
  for i in 1 .. array_length(v_bad, 1) loop
    v_r := public.sdr_one('b0000000-0000-0000-0000-00000000000b',
                          ('d3000000-0000-0000-0000-0000000002' || lpad(i::text, 2, '0'))::uuid, v_bad[i]);
    -- sync_push itself answers a non-object payload, before any handler.
    perform test_assert(v_r = case when jsonb_typeof(v_bad[i]) = 'object' then 'rejected:invalid_input'
                                   else 'rejected:invalid_payload' end,
      format('bad payload %s is rejected, got %s', i, v_r));
  end loop;
  perform test_assert(not exists (select 1 from public.daily_reports where id::text like 'd3000000-0000-0000-0000-0000000002%'),
    'no bad payload left a report');

  -- the handler itself refuses a non-object payload when called directly.
  perform test_as('b0000000-0000-0000-0000-00000000000b');
  begin
    perform public.sync_daily_reports('d3000000-0000-0000-0000-000000000299', '[]');
    i := 0;
  exception when invalid_parameter_value then i := 1;
  end;
  reset role;
  perform test_assert(i = 1, 'the handler refuses a payload that is not an object');
end $$;

-- ------------------------------------------- one bad record, the rest go on

do $$
declare v jsonb;
begin
  v := public.sdr_push('b0000000-0000-0000-0000-00000000000b', jsonb_build_array(
    public.sdr_rec('d3000000-0000-0000-0000-000000000301', public.sdr_report('2026-10-14')),
    public.sdr_rec('d3000000-0000-0000-0000-000000000302', public.sdr_report('2026-10-15') || '{"headcount": -1}'),
    public.sdr_rec('d3000000-0000-0000-0000-000000000303', public.sdr_report('2026-10-14')),   -- same day as 301
    public.sdr_rec('d3000000-0000-0000-0000-000000000304', public.sdr_report('2026-10-16') || '{"status": "draft"}')));
  perform test_assert(
    (select string_agg((x ->> 'verdict') || ':' || coalesce(x ->> 'reason', '-'), ',' order by n)
       from jsonb_array_elements(v -> 'results') with ordinality as t (x, n))
    = 'accepted:-,rejected:invalid_input,conflict:duplicate,accepted:-',
    'a mixed batch gets one verdict per record, in order: ' || (v -> 'results')::text);
  perform test_assert(
    (select count(*) from public.daily_reports where id::text like 'd3000000-0000-0000-0000-0000000003%') = 2
    and exists (select 1 from public.daily_reports where id = 'd3000000-0000-0000-0000-000000000304'),
    'the two good reports are stored and the bad ones are not');
end $$;

-- ----------------------------------------- replay after losing the site

do $$
declare
  v_id   uuid := 'd3000000-0000-0000-0000-000000000001';
  v_last jsonb := public.sdr_report('2026-10-10') || '{"headcount": 14, "work_done": "Slab poured, shuttering struck"}';
  v_r    text;
  v_audit bigint;
begin
  update public.site_assignments
     set unassigned_at = now(), unassigned_by = 'a0000000-0000-0000-0000-00000000000a'
   where site_id = '51000000-0000-0000-0000-000000000001' and user_id = 'b0000000-0000-0000-0000-00000000000b';

  perform test_as('b0000000-0000-0000-0000-00000000000b');
  perform test_assert(not exists (select 1 from public.daily_reports where id = v_id),
    'bob, unassigned, can no longer read his report');
  reset role;

  -- his phone missed the last answer and sends the same report again.
  v_audit := public.sdr_audit_count(v_id);
  v_r := public.sdr_one('b0000000-0000-0000-0000-00000000000b', v_id, v_last);
  perform test_assert(v_r = 'accepted:-', 'a replay after losing the site is still accepted, got ' || v_r);
  perform test_assert(public.sdr_audit_count(v_id) = v_audit, 'and writes nothing');

  -- but a new edit is refused.
  v_r := public.sdr_one('b0000000-0000-0000-0000-00000000000b', v_id,
                        v_last || '{"headcount": 2, "edit_reason": "After I left"}');
  perform test_assert(v_r = 'rejected:permission_denied', 'an edit after losing the site is rejected, got ' || v_r);
  perform test_assert((select headcount = 14 from public.daily_reports where id = v_id), 'the report is unchanged');

  -- fred's phone cannot pass bob's content off as a replay: the matcher only
  -- compares the caller's own reports.
  perform test_as('f0000000-0000-0000-0000-00000000000f');
  perform test_assert(not public.daily_report_matches(
      v_id, '51000000-0000-0000-0000-000000000001', '2026-10-10', 'submitted',
      14, 'Slab poured, shuttering struck', null, false, false, 'Curing'),
    'daily_report_matches is false for someone else''s report');
  reset role;
  perform test_as('b0000000-0000-0000-0000-00000000000b');
  perform test_assert(public.daily_report_matches(
      v_id, '51000000-0000-0000-0000-000000000001', '2026-10-10', 'submitted',
      14, 'Slab poured, shuttering struck', null, false, false, 'Curing'),
    'and true for the caller''s own');
  reset role;
end $$;

rollback;
