-- Workforce: a worker added without a code gets the next W<number> (ADR-055).
begin;

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-00000000000a', 'alice@x'),
  ('b0000000-0000-0000-0000-00000000000b', 'bob@x'),
  ('c0000000-0000-0000-0000-00000000000c', 'carol@x');
insert into public.organizations (id, name, created_by) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Org A', 'a0000000-0000-0000-0000-00000000000a'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Org B', 'b0000000-0000-0000-0000-00000000000b');
insert into public.memberships (org_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'owner'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000c', 'supervisor'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-00000000000b', 'owner');

do $$
declare c1 text; c2 text; c3 text; c5 text; c6 text; s text;
begin
  perform test_as('a0000000-0000-0000-0000-00000000000a');
  insert into public.workers (org_id, full_name, trade, pay_type)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'Ravi', 'mason', 'daily') returning code into c1;
  insert into public.workers (org_id, full_name, trade, pay_type)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'Sita', 'helper', 'daily') returning code into c2;
  reset role;
  perform test_assert(c1 = 'W001', 'the first worker gets W001, got ' || coalesce(c1, 'null'));
  perform test_assert(c2 = 'W002', 'the next worker gets W002, got ' || coalesce(c2, 'null'));

  -- A typed code is kept. W010 then moves the counter on; MASON1 is ignored.
  perform test_as('a0000000-0000-0000-0000-00000000000a');
  insert into public.workers (org_id, code, full_name, trade, pay_type)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'W010', 'Imran', 'mason', 'daily');
  insert into public.workers (org_id, code, full_name, trade, pay_type)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'MASON1', 'Dev', 'mason', 'daily');
  insert into public.workers (org_id, full_name, trade, pay_type)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'Geeta', 'helper', 'daily') returning code into c3;
  -- A blank code is not "no code": the table's check still refuses it.
  begin
    insert into public.workers (org_id, code, full_name, trade, pay_type)
      values ('aaaaaaaa-0000-0000-0000-000000000001', '  ', 'Hari', 'helper', 'daily');
  exception when others then s := sqlstate; end;
  reset role;
  perform test_assert(c3 = 'W011', 'the code follows the highest W number, got ' || coalesce(c3, 'null'));
  perform test_assert(s = '23514', 'a blank code is still refused, got ' || coalesce(s, 'no error'));
  s := null;
  perform test_assert((select code from public.workers where full_name = 'Imran') = 'W010', 'a typed code is kept');

  -- Numbers grow past three digits and a lower-case w counts.
  perform test_as('a0000000-0000-0000-0000-00000000000a');
  insert into public.workers (org_id, code, full_name, trade, pay_type)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'w999', 'Om', 'mason', 'daily');
  insert into public.workers (org_id, full_name, trade, pay_type)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'Pia', 'helper', 'daily') returning code into c5;
  reset role;
  perform test_assert(c5 = 'W1000', 'the number grows past three digits, got ' || coalesce(c5, 'null'));

  -- Another organisation counts on its own.
  perform test_as('b0000000-0000-0000-0000-00000000000b');
  insert into public.workers (org_id, full_name, trade, pay_type)
    values ('bbbbbbbb-0000-0000-0000-000000000002', 'Zed', 'mason', 'daily') returning code into c6;
  reset role;
  perform test_assert(c6 = 'W001', 'each organisation starts at W001, got ' || coalesce(c6, 'null'));

  -- A typed code that clashes (any case) is still refused.
  perform test_as('a0000000-0000-0000-0000-00000000000a');
  begin
    insert into public.workers (org_id, code, full_name, trade, pay_type)
      values ('aaaaaaaa-0000-0000-0000-000000000001', 'w001', 'Dup', 'mason', 'daily');
  exception when others then s := sqlstate; end;
  reset role;
  perform test_assert(s = '23505', 'a clashing typed code is refused, got ' || coalesce(s, 'no error'));

  -- A supervisor still cannot add a worker, with or without a code.
  s := null;
  perform test_as('c0000000-0000-0000-0000-00000000000c');
  begin
    insert into public.workers (org_id, full_name, trade, pay_type)
      values ('aaaaaaaa-0000-0000-0000-000000000001', 'Nope', 'mason', 'daily');
  exception when others then s := sqlstate; end;
  reset role;
  perform test_assert(s = '42501', 'a supervisor cannot add a worker, got ' || coalesce(s, 'no error'));
end $$;

rollback;
