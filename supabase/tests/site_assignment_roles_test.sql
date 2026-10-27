-- Sites module: who may NOT assign or remove a supervisor. Issue #78 (Sites web, assignment), ADR-046.
-- sites_test.sql proves a supervisor and an accountant cannot assign [2.08] [3.03] and that a manager
-- cannot assign in another org [5.03]. It does not prove the other half the web screen relies on: that
-- every role that must be refused also cannot CLOSE an assignment, and that anon can do neither.
-- Under RLS a blocked UPDATE raises nothing and touches 0 rows, so those cases assert row_count = 0.
-- Test-only: no migration, no new object.
begin;

-- Org A: owner a01, project manager a02, supervisors a03 (assigned) and a04, accountant a05 (assigned).
-- Org B: owner b01.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000a01', 'owner-a@test.local'),
  ('00000000-0000-0000-0000-000000000a02', 'pm-a@test.local'),
  ('00000000-0000-0000-0000-000000000a03', 'sup-a@test.local'),
  ('00000000-0000-0000-0000-000000000a04', 'sup-a2@test.local'),
  ('00000000-0000-0000-0000-000000000a05', 'acct-a@test.local'),
  ('00000000-0000-0000-0000-000000000b01', 'owner-b@test.local');

insert into public.organizations (id, name, created_by) values
  ('10000000-0000-0000-0000-00000000000a', 'Org A', '00000000-0000-0000-0000-000000000a01'),
  ('10000000-0000-0000-0000-00000000000b', 'Org B', '00000000-0000-0000-0000-000000000b01');

insert into public.memberships (org_id, user_id, role) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000a01', 'owner'),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000a02', 'project_manager'),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000a03', 'supervisor'),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000a04', 'supervisor'),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000a05', 'accountant'),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000b01', 'owner');

insert into public.sites (id, org_id, name, address, latitude, longitude, status, created_by) values
  ('20000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a', 'A One', 'Pune', 18.520400, 73.856700, 'active', '00000000-0000-0000-0000-000000000a01');

-- sup-a and acct-a hold an open assignment on A One, so each can read its own row: the refusal below is
-- the update policy, not a row they cannot see.
insert into public.site_assignments (org_id, site_id, user_id, assigned_by) values
  ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000a03', '00000000-0000-0000-0000-000000000a01'),
  ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000a05', '00000000-0000-0000-0000-000000000a01');

-- =========================================================== 1. cannot close
-- A supervisor, an accountant and another org's owner, each trying to close both open rows.

do $$
declare
  u uuid;
  n int;
  open_rows int;
begin
  foreach u in array array[
    '00000000-0000-0000-0000-000000000a03'::uuid,
    '00000000-0000-0000-0000-000000000a05'::uuid,
    '00000000-0000-0000-0000-000000000b01'::uuid
  ] loop
    perform test_as(u);
    update public.site_assignments set unassigned_at = now()
     where site_id = '20000000-0000-0000-0000-0000000000a1';
    get diagnostics n = row_count;
    perform test_assert(n = 0, '[1.01] ' || u || ' cannot close an assignment, touched ' || n);
    reset role;
  end loop;

  select count(*) into open_rows from public.site_assignments
   where site_id = '20000000-0000-0000-0000-0000000000a1' and unassigned_at is null;
  perform test_assert(open_rows = 2, '[1.02] both assignments are still open, found ' || open_rows);
end $$;

-- ============================================================ 2. cannot assign
-- Another org's owner cannot assign into org A, whichever org id the row names.

do $$
declare s text;
begin
  perform test_as('00000000-0000-0000-0000-000000000b01');

  s := null;
  begin
    insert into public.site_assignments (org_id, site_id, user_id)
    values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000a04');
  exception when others then s := sqlstate; end;
  perform test_assert(s = '42501', '[2.01] another org''s owner cannot assign into this org, got ' || coalesce(s, 'no error'));

  reset role;

  perform test_as('00000000-0000-0000-0000-000000000a05');
  s := null;
  begin
    insert into public.site_assignments (org_id, site_id, user_id)
    values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000a04');
  exception when others then s := sqlstate; end;
  perform test_assert(s = '42501', '[2.02] an accountant cannot assign, got ' || coalesce(s, 'no error'));
  reset role;
end $$;

-- ================================================================== 3. anon

do $$
declare s text;
begin
  perform test_as_anon();

  s := null;
  begin
    insert into public.site_assignments (org_id, site_id, user_id)
    values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000a04');
  exception when others then s := sqlstate; end;
  perform test_assert(s = '42501', '[3.01] anon cannot assign, got ' || coalesce(s, 'no error'));

  s := null;
  begin
    update public.site_assignments set unassigned_at = now()
     where site_id = '20000000-0000-0000-0000-0000000000a1';
  exception when others then s := sqlstate; end;
  perform test_assert(s = '42501', '[3.02] anon cannot close an assignment, got ' || coalesce(s, 'no error'));

  s := null;
  begin
    perform id from public.site_assignments;
  exception when others then s := sqlstate; end;
  perform test_assert(s = '42501', '[3.03] anon cannot read assignments, got ' || coalesce(s, 'no error'));

  reset role;
end $$;

-- ============================================ 4. the same statements, allowed
-- A control: the project manager runs the very statement refused above and it works, so the
-- refusals above come from the role, not from a broken fixture.

do $$
declare n int; s text;
begin
  perform test_as('00000000-0000-0000-0000-000000000a02');

  s := null;
  begin
    insert into public.site_assignments (org_id, site_id, user_id)
    values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000a04');
  exception when others then s := sqlstate; end;
  perform test_assert(s is null, '[4.01] a project manager can assign, got ' || coalesce(s, 'no error'));

  update public.site_assignments set unassigned_at = now()
   where site_id = '20000000-0000-0000-0000-0000000000a1'
     and user_id = '00000000-0000-0000-0000-000000000a03';
  get diagnostics n = row_count;
  perform test_assert(n = 1, '[4.02] a project manager can close an assignment, touched ' || n);

  reset role;
end $$;

rollback;
