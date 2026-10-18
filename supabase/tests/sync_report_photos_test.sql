-- Daily Reporting: sync_report_photos(), report_photo_matches() and
-- is_own_daily_report(). Issue #63. Every case goes through sync_push and then
-- reads the rows back. Positive and negative. Runs on the team runner (shim,
-- no pgTAP).
begin;

-- Org A: alice owner, carol PM, bob and fred supervisors on site 1. Org B: hank
-- supervisor on site B.
insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-00000000000a', 'alice@x'),
  ('b0000000-0000-0000-0000-00000000000b', 'bob@x'),
  ('c0000000-0000-0000-0000-00000000000c', 'carol@x'),
  ('e0000000-0000-0000-0000-00000000000e', 'eve@x'),
  ('f0000000-0000-0000-0000-00000000000f', 'fred@x'),
  ('80000000-0000-0000-0000-000000000008', 'hank@x');
insert into public.organizations (id, name, created_by) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Org A', 'a0000000-0000-0000-0000-00000000000a'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Org B', 'e0000000-0000-0000-0000-00000000000e');
insert into public.memberships (org_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'owner'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000c', 'project_manager'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b', 'supervisor'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-00000000000f', 'supervisor'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-00000000000e', 'owner'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '80000000-0000-0000-0000-000000000008', 'supervisor');
insert into public.sites (id, org_id, name, address, latitude, longitude, created_by) values
  ('51000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Site 1', 'x', 19.0, 73.0, 'a0000000-0000-0000-0000-00000000000a'),
  ('51000000-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-000000000002', 'Site B', 'x', 18.0, 72.0, 'e0000000-0000-0000-0000-00000000000e');
insert into public.site_assignments (org_id, site_id, user_id, assigned_by) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-00000000000a'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-00000000000f', 'a0000000-0000-0000-0000-00000000000a'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '51000000-0000-0000-0000-0000000000b1', '80000000-0000-0000-0000-000000000008', 'e0000000-0000-0000-0000-00000000000e');

-- Reports (as superuser). R1: bob's submitted. R2: bob's draft. R3: fred's
-- draft, which bob cannot see. R4: bob's, reviewed.
insert into public.daily_reports
  (id, org_id, site_id, report_date, author_id, status, headcount, work_done) values
  ('d4000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001',
   '2026-10-10', 'b0000000-0000-0000-0000-00000000000b', 'submitted', 12, 'Slab poured'),
  ('d4000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001',
   '2026-10-11', 'b0000000-0000-0000-0000-00000000000b', 'draft', null, null),
  ('d4000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001',
   '2026-10-12', 'f0000000-0000-0000-0000-00000000000f', 'draft', null, null),
  ('d4000000-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001',
   '2026-10-13', 'b0000000-0000-0000-0000-00000000000b', 'submitted', 8, 'Plastering');
do $$ begin
  perform test_as('c0000000-0000-0000-0000-00000000000c');
  perform public.review_daily_report('d4000000-0000-0000-0000-000000000004');
  reset role;
end $$;

-- ------------------------------------------------------------------ helpers

create function public.srp_push(p_uid uuid, p_records jsonb) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform test_as(p_uid);
  v := public.sync_push(jsonb_build_object('version', 1, 'device_id', 'test-phone', 'records', p_records));
  execute 'reset role';
  return v;
end $$;

create function public.srp_verdicts(p_response jsonb) returns text language sql as $$
  select string_agg((x ->> 'verdict') || ':' || coalesce(x ->> 'reason', '-'), ',' order by n)
  from jsonb_array_elements(p_response -> 'results') with ordinality as t (x, n)
$$;

-- A valid jpeg payload for photo p_id on report p_report (site 1, org A).
create function public.srp_photo(p_id uuid, p_report uuid) returns jsonb language sql as $$
  select jsonb_build_object(
    'report_id', p_report,
    'storage_path', 'aaaaaaaa-0000-0000-0000-000000000001/51000000-0000-0000-0000-000000000001/'
                    || p_report || '/' || p_id || '.jpg',
    'caption', 'North wall', 'size_bytes', 250000, 'content_type', 'image/jpeg')
$$;

-- Push one photo and return "verdict:reason".
create function public.srp_one(p_uid uuid, p_id uuid, p_payload jsonb) returns text language sql as $$
  select public.srp_verdicts(public.srp_push(p_uid, jsonb_build_array(
    jsonb_build_object('entity', 'report_photos', 'record_id', p_id, 'payload', p_payload))))
$$;

create function public.srp_count(p_report uuid) returns bigint language sql as $$
  select count(*) from public.report_photos where report_id = p_report
$$;

-- ---------------------------------------------------------------- structure

do $$ begin
  perform test_assert(
    (select not prosecdef and proconfig @> array['search_path=public']
       from pg_proc where oid = 'public.sync_report_photos(uuid, jsonb)'::regprocedure),
    'sync_report_photos is security invoker and pins search_path');
  perform test_assert(
    not has_function_privilege('anon', 'public.sync_report_photos(uuid, jsonb)', 'execute')
    and not has_function_privilege('public', 'public.sync_report_photos(uuid, jsonb)', 'execute')
    and has_function_privilege('authenticated', 'public.sync_report_photos(uuid, jsonb)', 'execute'),
    'sync_report_photos is revoked from public and anon, granted to authenticated');
  perform test_assert(
    (select bool_and(prosecdef and proconfig @> array['search_path=public']
                     and not has_function_privilege('anon', oid, 'execute')
                     and not has_function_privilege('public', oid, 'execute'))
       from pg_proc where proname in ('report_photo_matches', 'is_own_daily_report')),
    'the two helpers are security definer, pin search_path and are revoked from public and anon');
end $$;

-- ---------------------------------------------------- a photo and its replay

do $$
declare
  v_id  uuid := 'e4000000-0000-0000-0000-000000000001';
  v_r   text;
  v_audit bigint;
begin
  v_r := public.srp_one('b0000000-0000-0000-0000-00000000000b', v_id,
                        public.srp_photo(v_id, 'd4000000-0000-0000-0000-000000000001'));
  perform test_assert(v_r = 'accepted:-', 'bob''s photo on his submitted report is accepted, got ' || v_r);
  perform test_assert(
    (select uploaded_by = 'b0000000-0000-0000-0000-00000000000b'
            and site_id = '51000000-0000-0000-0000-000000000001'
            and org_id = 'aaaaaaaa-0000-0000-0000-000000000001'
            and caption = 'North wall' and size_bytes = 250000
       from public.report_photos where id = v_id),
    'the photo row takes its site and organisation from the report');

  select count(*) into v_audit from public.audit_log where table_name = 'report_photos' and row_id = v_id;
  v_r := public.srp_one('b0000000-0000-0000-0000-00000000000b', v_id,
                        public.srp_photo(v_id, 'd4000000-0000-0000-0000-000000000001'));
  perform test_assert(v_r = 'accepted:-', 'a replayed photo is accepted, got ' || v_r);
  perform test_assert(public.srp_count('d4000000-0000-0000-0000-000000000001') = 1
                      and v_audit = 1
                      and (select count(*) from public.audit_log where table_name = 'report_photos' and row_id = v_id) = 1,
    'the replay wrote no row and no audit row');

  -- the same id with another caption: the stored photo stays.
  v_r := public.srp_one('b0000000-0000-0000-0000-00000000000b', v_id,
                        public.srp_photo(v_id, 'd4000000-0000-0000-0000-000000000001') || '{"caption": "South wall"}');
  perform test_assert(v_r = 'conflict:duplicate', 'the same id with other content is a conflict, got ' || v_r);
  perform test_assert((select caption = 'North wall' from public.report_photos where id = v_id),
    'the stored photo is unchanged');

  -- photos on his own draft and on his reviewed report are accepted (D6).
  v_r := public.srp_one('b0000000-0000-0000-0000-00000000000b', 'e4000000-0000-0000-0000-000000000002',
                        public.srp_photo('e4000000-0000-0000-0000-000000000002', 'd4000000-0000-0000-0000-000000000002'));
  perform test_assert(v_r = 'accepted:-', 'a photo on a draft is accepted, got ' || v_r);
  v_r := public.srp_one('b0000000-0000-0000-0000-00000000000b', 'e4000000-0000-0000-0000-000000000004',
                        public.srp_photo('e4000000-0000-0000-0000-000000000004', 'd4000000-0000-0000-0000-000000000004'));
  perform test_assert(v_r = 'accepted:-', 'a photo on a reviewed report is accepted, got ' || v_r);
end $$;

-- ------------------------------------------------ before and with its report

do $$
declare
  v_report uuid := 'd4000000-0000-0000-0000-000000000005';
  v_photo  uuid := 'e4000000-0000-0000-0000-000000000005';
  v_rep    jsonb := jsonb_build_object(
    'entity', 'daily_reports', 'record_id', v_report,
    'payload', jsonb_build_object('org_id', 'aaaaaaaa-0000-0000-0000-000000000001',
      'site_id', '51000000-0000-0000-0000-000000000001', 'report_date', '2026-10-14',
      'status', 'submitted', 'headcount', 9, 'work_done', 'Columns cast'));
  v_pho    jsonb := jsonb_build_object('entity', 'report_photos', 'record_id', v_photo,
                                       'payload', public.srp_photo(v_photo, v_report));
  v jsonb;
begin
  -- the photo alone, before its report: try again later.
  v := public.srp_push('b0000000-0000-0000-0000-00000000000b', jsonb_build_array(v_pho));
  perform test_assert(public.srp_verdicts(v) = 'retryable_error:missing_parent',
    'a photo before its report is retried, got ' || public.srp_verdicts(v));
  perform test_assert(not exists (select 1 from public.report_photos where id = v_photo), 'and is not stored');

  -- the report first, then the photo, in one batch, as the outbox sends them.
  v := public.srp_push('b0000000-0000-0000-0000-00000000000b', jsonb_build_array(v_rep, v_pho));
  perform test_assert(public.srp_verdicts(v) = 'accepted:-,accepted:-',
    'report then photo in one batch are both accepted, got ' || public.srp_verdicts(v));
  perform test_assert(public.srp_count(v_report) = 1, 'the photo is stored');
end $$;

-- -------------------------------------------------------------- who may push

do $$
declare v_r text;
begin
  -- fred can see bob's submitted report, but cannot add to it.
  v_r := public.srp_one('f0000000-0000-0000-0000-00000000000f', 'e4000000-0000-0000-0000-000000000101',
                        public.srp_photo('e4000000-0000-0000-0000-000000000101', 'd4000000-0000-0000-0000-000000000001'));
  perform test_assert(v_r = 'rejected:permission_denied', 'a photo on someone else''s report is rejected, got ' || v_r);

  -- the owner cannot add one either.
  v_r := public.srp_one('a0000000-0000-0000-0000-00000000000a', 'e4000000-0000-0000-0000-000000000102',
                        public.srp_photo('e4000000-0000-0000-0000-000000000102', 'd4000000-0000-0000-0000-000000000001'));
  perform test_assert(v_r = 'rejected:permission_denied', 'the owner''s photo is rejected, got ' || v_r);

  -- a report the caller cannot see looks like one still on its way, the same
  -- as an id that does not exist: fred's draft for bob, bob's report for hank.
  v_r := public.srp_one('b0000000-0000-0000-0000-00000000000b', 'e4000000-0000-0000-0000-000000000103',
                        public.srp_photo('e4000000-0000-0000-0000-000000000103', 'd4000000-0000-0000-0000-000000000003'));
  perform test_assert(v_r = 'retryable_error:missing_parent', 'a photo on a report bob cannot see is retried, got ' || v_r);
  v_r := public.srp_one('80000000-0000-0000-0000-000000000008', 'e4000000-0000-0000-0000-000000000104',
                        public.srp_photo('e4000000-0000-0000-0000-000000000104', 'd4000000-0000-0000-0000-000000000001'));
  perform test_assert(v_r = 'retryable_error:missing_parent', 'org B cannot tell bob''s report exists, got ' || v_r);

  perform test_assert(not exists (select 1 from public.report_photos where id::text like 'e4000000-0000-0000-0000-0000000001%'),
    'no refused photo was stored');

  -- is_own_daily_report says false for another user's report and for nothing.
  perform test_as('80000000-0000-0000-0000-000000000008');
  perform test_assert(not public.is_own_daily_report('d4000000-0000-0000-0000-000000000001')
                      and not public.is_own_daily_report('d4000000-0000-0000-0000-0000000009ff'),
    'is_own_daily_report is false for another user''s report and for an unknown id');
  reset role;
  perform test_as('b0000000-0000-0000-0000-00000000000b');
  perform test_assert(public.is_own_daily_report('d4000000-0000-0000-0000-000000000001'),
    'and true for the caller''s own');
  perform test_assert(not public.report_photo_matches('e4000000-0000-0000-0000-000000000001',
      'd4000000-0000-0000-0000-000000000001', 'x', null, 1, 'image/jpeg'),
    'report_photo_matches is false when the content differs');
  reset role;
end $$;

-- ------------------------------------------------------------- bad payloads

do $$
declare
  v_id   uuid;
  v_good jsonb;
  v_bad  jsonb[];
  v_r    text;
  i      int;
begin
  for i in 1 .. 10 loop
    v_id := ('e4000000-0000-0000-0000-0000000002' || lpad(i::text, 2, '0'))::uuid;
    v_good := public.srp_photo(v_id, 'd4000000-0000-0000-0000-000000000002');
    v_bad := array[
      v_good - 'report_id',
      v_good - 'storage_path',
      v_good || '{"size_bytes": "250000"}',                                 -- a string
      v_good || '{"size_bytes": 0}',
      v_good || '{"size_bytes": 10485761}',                                 -- over 10 MB
      v_good || '{"content_type": "image/gif"}',
      v_good || '{"caption": 5}',
      v_good || jsonb_build_object('caption', repeat('x', 201)),
      v_good || '{"storage_path": "../../elsewhere.jpg"}',
      v_good || jsonb_build_object('storage_path', replace(v_good ->> 'storage_path', '.jpg', '.png'))];
    v_r := public.srp_one('b0000000-0000-0000-0000-00000000000b', v_id, v_bad[i]);
    perform test_assert(v_r = 'rejected:invalid_input', format('bad photo payload %s is rejected, got %s', i, v_r));
  end loop;
  perform test_assert(not exists (select 1 from public.report_photos where id::text like 'e4000000-0000-0000-0000-0000000002%'),
    'no bad payload left a photo');
end $$;

-- ------------------------------------------------------- at most ten photos

do $$
declare v_r text; i int;
begin
  -- R1 has one photo; add eight more as superuser to reach nine.
  for i in 1 .. 8 loop
    insert into public.report_photos (id, org_id, site_id, report_id, storage_path, size_bytes, content_type, uploaded_by)
    select v_id, 'aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001',
           'd4000000-0000-0000-0000-000000000001', public.srp_photo(v_id, 'd4000000-0000-0000-0000-000000000001') ->> 'storage_path',
           1000, 'image/jpeg', 'b0000000-0000-0000-0000-00000000000b'
    from (select ('e4000000-0000-0000-0000-0000000003' || lpad(i::text, 2, '0'))::uuid as v_id) as x;
  end loop;

  v_r := public.srp_one('b0000000-0000-0000-0000-00000000000b', 'e4000000-0000-0000-0000-000000000310',
                        public.srp_photo('e4000000-0000-0000-0000-000000000310', 'd4000000-0000-0000-0000-000000000001'));
  perform test_assert(v_r = 'accepted:-', 'the tenth photo is accepted, got ' || v_r);
  v_r := public.srp_one('b0000000-0000-0000-0000-00000000000b', 'e4000000-0000-0000-0000-000000000311',
                        public.srp_photo('e4000000-0000-0000-0000-000000000311', 'd4000000-0000-0000-0000-000000000001'));
  perform test_assert(v_r = 'rejected:invalid_input', 'the eleventh photo is rejected, got ' || v_r);
  perform test_assert(public.srp_count('d4000000-0000-0000-0000-000000000001') = 10, 'the report has ten photos');
end $$;

-- ----------------------------------------- replay after losing the site

do $$
declare v_r text;
begin
  update public.site_assignments
     set unassigned_at = now(), unassigned_by = 'a0000000-0000-0000-0000-00000000000a'
   where site_id = '51000000-0000-0000-0000-000000000001' and user_id = 'b0000000-0000-0000-0000-00000000000b';

  -- the phone missed the answer to an accepted photo and sends it again.
  v_r := public.srp_one('b0000000-0000-0000-0000-00000000000b', 'e4000000-0000-0000-0000-000000000002',
                        public.srp_photo('e4000000-0000-0000-0000-000000000002', 'd4000000-0000-0000-0000-000000000002'));
  perform test_assert(v_r = 'accepted:-', 'a photo replay after losing the site is accepted, got ' || v_r);

  -- a new photo for his own report, which he can no longer reach: refused, not retried.
  v_r := public.srp_one('b0000000-0000-0000-0000-00000000000b', 'e4000000-0000-0000-0000-000000000401',
                        public.srp_photo('e4000000-0000-0000-0000-000000000401', 'd4000000-0000-0000-0000-000000000002'));
  perform test_assert(v_r = 'rejected:permission_denied', 'a new photo after losing the site is rejected, got ' || v_r);
  perform test_assert(public.srp_count('d4000000-0000-0000-0000-000000000002') = 1, 'and is not stored');
end $$;

rollback;
