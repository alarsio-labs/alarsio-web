-- Identity & Access: can_record_on_site(), can_review_site(), can_view_wages().
-- Every role against each predicate, plus cross-org, closed assignment,
-- archived site, unknown id, null and anon.
begin;

-- Org A: alice owner, carol PM, bob supervisor (open assignment on site 1),
-- dave accountant (assigned to site 1 as well, to prove role beats assignment),
-- gina supervisor (closed assignment on site 1), hank supervisor (open
-- assignment on archived site 3). Org B: eve owner with site B.
insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-00000000000a', 'alice@x'),
  ('b0000000-0000-0000-0000-00000000000b', 'bob@x'),
  ('c0000000-0000-0000-0000-00000000000c', 'carol@x'),
  ('d0000000-0000-0000-0000-00000000000d', 'dave@x'),
  ('e0000000-0000-0000-0000-00000000000e', 'eve@x'),
  ('f0000000-0000-0000-0000-00000000000f', 'frank@x'),
  ('90000000-0000-0000-0000-000000000009', 'gina@x'),
  ('80000000-0000-0000-0000-000000000008', 'hank@x');
insert into public.organizations (id, name, created_by) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Org A', 'a0000000-0000-0000-0000-00000000000a'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Org B', 'e0000000-0000-0000-0000-00000000000e');
insert into public.memberships (org_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'owner'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000c', 'project_manager'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b', 'supervisor'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-00000000000d', 'accountant'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000009', 'supervisor'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000008', 'supervisor'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-00000000000e', 'owner');
insert into public.sites (id, org_id, name, address, latitude, longitude, created_by) values
  ('51000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Site 1', 'x', 19.0, 73.0, 'a0000000-0000-0000-0000-00000000000a'),
  ('51000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Site 2', 'x', 19.1, 73.1, 'a0000000-0000-0000-0000-00000000000a'),
  ('51000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'Site 3', 'x', 19.2, 73.2, 'a0000000-0000-0000-0000-00000000000a'),
  ('51000000-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-000000000002', 'Site B', 'x', 18.0, 72.0, 'e0000000-0000-0000-0000-00000000000e');
insert into public.site_assignments (org_id, site_id, user_id, assigned_by) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-00000000000a'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-00000000000d', 'a0000000-0000-0000-0000-00000000000a'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-00000000000a'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000003', '80000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-00000000000a');
-- The server stamps unassigned_by from auth.uid(), so close gina's as alice.
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000a', true);
update public.site_assignments set unassigned_at = now()
  where user_id = '90000000-0000-0000-0000-000000000009';
select set_config('request.jwt.claim.sub', '', true);
-- Archive site 3 directly (fixture, as superuser).
update public.sites set status = 'archived', archived_at = now(),
  archived_by = 'a0000000-0000-0000-0000-00000000000a'
  where id = '51000000-0000-0000-0000-000000000003';

-- --------------------------------------------------------- can_record_on_site
do $$ begin
  perform test_as('b0000000-0000-0000-0000-00000000000b');           -- bob, assigned supervisor
  perform test_assert(can_record_on_site('51000000-0000-0000-0000-000000000001'), 'assigned supervisor records on own site');
  perform test_assert(not can_record_on_site('51000000-0000-0000-0000-000000000002'), 'supervisor cannot record on unassigned site');
  perform test_assert(not can_record_on_site('51000000-0000-0000-0000-0000000000b1'), 'supervisor cannot record on another org site');
  reset role;
  perform test_as('90000000-0000-0000-0000-000000000009');           -- gina, closed assignment
  perform test_assert(not can_record_on_site('51000000-0000-0000-0000-000000000001'), 'a closed assignment cannot record');
  reset role;
  perform test_as('80000000-0000-0000-0000-000000000008');           -- hank, archived site
  perform test_assert(not can_record_on_site('51000000-0000-0000-0000-000000000003'), 'nobody records on an archived site');
  reset role;
  perform test_as('a0000000-0000-0000-0000-00000000000a');           -- owner
  perform test_assert(not can_record_on_site('51000000-0000-0000-0000-000000000001'), 'owner does not record, they review');
  reset role;
  perform test_as('c0000000-0000-0000-0000-00000000000c');           -- PM
  perform test_assert(not can_record_on_site('51000000-0000-0000-0000-000000000001'), 'project_manager does not record');
  reset role;
  perform test_as('d0000000-0000-0000-0000-00000000000d');           -- accountant, assigned
  perform test_assert(not can_record_on_site('51000000-0000-0000-0000-000000000001'), 'an assigned accountant still cannot record');
  reset role;
  perform test_as('f0000000-0000-0000-0000-00000000000f');           -- nobody
  perform test_assert(not can_record_on_site('51000000-0000-0000-0000-000000000001'), 'non-member cannot record');
  perform test_assert(not can_record_on_site('00000000-0000-0000-0000-00000000dead'), 'unknown site is false');
  perform test_assert(not can_record_on_site(null), 'null site is false, not null');
  reset role;
end $$;

-- ----------------------------------------------------------- can_review_site
do $$ begin
  perform test_as('a0000000-0000-0000-0000-00000000000a');           -- owner
  perform test_assert(can_review_site('51000000-0000-0000-0000-000000000001'), 'owner reviews a site in own org');
  perform test_assert(can_review_site('51000000-0000-0000-0000-000000000003'), 'owner reviews an archived site');
  perform test_assert(not can_review_site('51000000-0000-0000-0000-0000000000b1'), 'owner cannot review another org site');
  reset role;
  perform test_as('c0000000-0000-0000-0000-00000000000c');           -- PM
  perform test_assert(can_review_site('51000000-0000-0000-0000-000000000002'), 'project_manager reviews every site in own org');
  reset role;
  perform test_as('b0000000-0000-0000-0000-00000000000b');           -- supervisor, assigned
  perform test_assert(not can_review_site('51000000-0000-0000-0000-000000000001'), 'supervisor cannot review, even own site');
  reset role;
  perform test_as('d0000000-0000-0000-0000-00000000000d');           -- accountant
  perform test_assert(not can_review_site('51000000-0000-0000-0000-000000000001'), 'accountant cannot review');
  reset role;
  perform test_as('f0000000-0000-0000-0000-00000000000f');           -- nobody
  perform test_assert(not can_review_site('51000000-0000-0000-0000-000000000001'), 'non-member cannot review');
  perform test_assert(not can_review_site('00000000-0000-0000-0000-00000000dead'), 'unknown site is false');
  perform test_assert(not can_review_site(null), 'null site is false, not null');
  reset role;
end $$;

-- ------------------------------------------------------------ can_view_wages
do $$ begin
  perform test_as('a0000000-0000-0000-0000-00000000000a');           -- owner
  perform test_assert(can_view_wages('aaaaaaaa-0000-0000-0000-000000000001'), 'owner views wages');
  perform test_assert(not can_view_wages('bbbbbbbb-0000-0000-0000-000000000002'), 'owner cannot view another org wages');
  reset role;
  perform test_as('d0000000-0000-0000-0000-00000000000d');           -- accountant
  perform test_assert(can_view_wages('aaaaaaaa-0000-0000-0000-000000000001'), 'accountant views wages');
  reset role;
  perform test_as('c0000000-0000-0000-0000-00000000000c');           -- PM
  perform test_assert(not can_view_wages('aaaaaaaa-0000-0000-0000-000000000001'), 'project_manager cannot view wages');
  reset role;
  perform test_as('b0000000-0000-0000-0000-00000000000b');           -- supervisor
  perform test_assert(not can_view_wages('aaaaaaaa-0000-0000-0000-000000000001'), 'supervisor cannot view wages');
  reset role;
  perform test_as('f0000000-0000-0000-0000-00000000000f');           -- nobody
  perform test_assert(not can_view_wages('aaaaaaaa-0000-0000-0000-000000000001'), 'non-member cannot view wages');
  perform test_assert(not can_view_wages(null), 'null org is false, not null');
  reset role;
end $$;

-- ------------------------------------------------- anon, definer, search_path
do $$
declare denied int := 0;
begin
  perform test_as_anon();
  begin perform can_record_on_site('51000000-0000-0000-0000-000000000001');
  exception when insufficient_privilege then denied := denied + 1; end;
  begin perform can_review_site('51000000-0000-0000-0000-000000000001');
  exception when insufficient_privilege then denied := denied + 1; end;
  begin perform can_view_wages('aaaaaaaa-0000-0000-0000-000000000001');
  exception when insufficient_privilege then denied := denied + 1; end;
  reset role;
  perform test_assert(denied = 3, 'anon denied on all three role predicates');
  perform test_assert(
    (select bool_and(prosecdef and proconfig @> array['search_path=public'])
       from pg_proc
      where oid in ('public.can_record_on_site(uuid)'::regprocedure,
                    'public.can_review_site(uuid)'::regprocedure,
                    'public.can_view_wages(uuid)'::regprocedure)),
    'role predicates are security definer with search_path = public');
end $$;

rollback;
