-- Alarsio Phase 2: realistic data for the faculty reviewer account.
-- Run ONCE in the Supabase dashboard > SQL editor (production project).
--
-- BEFORE YOU RUN IT (about 10 min, all in the live app):
--   1. In an incognito window, sign up the reviewer owner at www.alarsio.com
--      (a new email you control, e.g. a new address you control).
--   2. Create the organisation, named exactly: Sharma Constructions (Demo)
--   3. From Team, invite a second email you control as SUPERVISOR, and accept the invite.
--   4. Put both emails in the two lines marked EDIT below.
--
-- What it creates (dates 3–11 Nov 2026, Sunday 9 Nov off):
--   2 active sites in Lucknow, supervisor assigned to both, 12 workers with daily rates,
--   site check-ins, attendance for 7 working days, 3–8 Nov approved by the owner,
--   10–11 Nov left OPEN so the reviewer can approve them,
--   daily reports (some reviewed, the latest left for review), 4 materials per site with
--   opening stock, receipts and usage (cement at Site B goes low),
--   one weekly wage period 3–9 Nov with one advance, calculated and LOCKED.
--
-- Reviews, material entries and the wage lock go through the app's own functions,
-- acting as the right user, so every rule (self-review, roster, lock) is checked.
-- It stops with an error if the org already has sites, so it cannot run twice.
-- There is no undo: ledgers are append-only by design. To retire the demo, archive its sites.

do $$
declare
  c_owner_email text := 'REVIEWER_OWNER_EMAIL';      -- EDIT
  c_sup_email   text := 'REVIEWER_SUPERVISOR_EMAIL'; -- EDIT
  c_org_name    text := 'Sharma Constructions (Demo)';

  v_owner uuid; v_sup uuid; v_org uuid;
  v_site_a uuid := gen_random_uuid();
  v_site_b uuid := gen_random_uuid();
  v_period uuid := gen_random_uuid();
  v_day    date;
  v_site   uuid;
  v_day_id uuid;
  v_w      record;
  v_i      int;
  v_k      int;
  v_status text;
  v_ot     numeric;
  v_rep    uuid;
  v_mat    uuid;
  v_names  text[] := array[
    'Ramesh Yadav','Suresh Kumar','Mohd. Irfan','Rajesh Verma','Dinesh Pal','Santosh Gupta','Anil Nishad',
    'Pappu Rawat','Mukesh Kashyap','Raju Prajapati','Vinod Maurya','Shyam Lal'];
  v_trades text[] := array[
    'Mason','Mason','Carpenter','Bar bender','Helper','Helper','Electrician',
    'Mason','Helper','Helper','Plumber','Helper'];
  v_rates  numeric[] := array[900,900,850,750,550,550,950, 900,550,550,900,550];
  v_worker uuid[] := array[]::uuid[];
  v_days   date[] := array['2026-11-03','2026-11-04','2026-11-05','2026-11-06','2026-11-07',
                           '2026-11-08','2026-11-10','2026-11-11']::date[];
begin
  -- 0. Find the two users and the organisation
  select id into v_owner from auth.users where lower(email) = lower(c_owner_email);
  select id into v_sup   from auth.users where lower(email) = lower(c_sup_email);
  if v_owner is null or v_sup is null then
    raise exception 'owner or supervisor email not found in auth.users';
  end if;

  select o.id into v_org
    from public.organizations o
    join public.memberships m on m.org_id = o.id and m.user_id = v_owner and m.role = 'owner'
   where o.name = c_org_name;
  if v_org is null then
    raise exception 'org "%" owned by % not found', c_org_name, c_owner_email;
  end if;
  if not exists (select 1 from public.memberships
                  where org_id = v_org and user_id = v_sup and role = 'supervisor') then
    raise exception 'the supervisor has not joined the org yet (accept the invite first)';
  end if;
  if exists (select 1 from public.sites where org_id = v_org) then
    raise exception 'org already has sites: seed already ran, stopping';
  end if;

  -- 1. Sites (owner) and supervisor assignment
  insert into public.sites (id, org_id, name, address, latitude, longitude, geofence_radius_m, status, created_by)
  values
    (v_site_a, v_org, 'Gomti Nagar G+3 Residence',
     'Plot 14, Vipul Khand 2, Gomti Nagar, Lucknow 226010', 26.852400, 80.999700, 200, 'active', v_owner),
    (v_site_b, v_org, 'Jankipuram Shop Complex',
     'Sector H, Near Engineering College Crossing, Jankipuram, Lucknow 226021', 26.925600, 80.941900, 250, 'active', v_owner);

  insert into public.site_assignments (org_id, site_id, user_id, assigned_by, assigned_at)
  values (v_org, v_site_a, v_sup, v_owner, '2026-10-25 10:00+05:30'),
         (v_org, v_site_b, v_sup, v_owner, '2026-10-25 10:00+05:30');

  -- 2. Workers, daily rates, site roster (7 at Site A, 5 at Site B)
  for v_i in 1..12 loop
    insert into public.workers (org_id, code, full_name, trade, pay_type, created_by, created_at)
    values (v_org, 'SC-' || lpad(v_i::text, 3, '0'), v_names[v_i], v_trades[v_i], 'daily',
            v_owner, '2026-10-25 11:00+05:30')
    returning id into v_mat;  -- reuse a uuid variable
    v_worker := v_worker || v_mat;

    insert into public.worker_wage_rates (org_id, worker_id, rate, effective_from, created_by)
    values (v_org, v_mat, v_rates[v_i], '2026-10-01', v_owner);

    insert into public.worker_site_assignments (org_id, worker_id, site_id, assigned_by, assigned_at)
    values (v_org, v_mat, case when v_i <= 7 then v_site_a else v_site_b end,
            v_owner, '2026-10-25 11:30+05:30');
  end loop;

  -- 3. Supervisor check-ins, attendance days and entries
  foreach v_day in array v_days loop
    for v_k in 1..2 loop
      v_site := case when v_k = 1 then v_site_a else v_site_b end;

      insert into public.site_visits (org_id, site_id, user_id, check_in_at, check_in_lat, check_in_lng,
                                      check_in_distance_m, check_in_outside_geofence,
                                      check_out_at, check_out_lat, check_out_lng,
                                      check_out_distance_m, check_out_outside_geofence)
      values (v_org, v_site, v_sup,
              (v_day + case when v_k = 1 then time '08:55' else time '13:10' end) at time zone 'Asia/Kolkata',
              case when v_k = 1 then 26.852550 else 26.925500 end,
              case when v_k = 1 then 80.999820 else 80.942050 end, 0, false,
              (v_day + case when v_k = 1 then time '12:40' else time '18:05' end) at time zone 'Asia/Kolkata',
              case when v_k = 1 then 26.852480 else 26.925700 end,
              case when v_k = 1 then 80.999650 else 80.941800 end, 0, false);

      v_day_id := gen_random_uuid();
      insert into public.attendance_days (id, org_id, site_id, attendance_date, recorded_by)
      values (v_day_id, v_org, v_site, v_day, v_sup);

      for v_i in 1..12 loop
        continue when (v_k = 1 and v_i > 7) or (v_k = 2 and v_i <= 7);
        v_status := case
          when (v_i * 3 + extract(day from v_day)::int) % 13 = 0 then 'absent'
          when (v_i * 5 + extract(day from v_day)::int) % 11 = 0 then 'half_day'
          else 'present' end;
        v_ot := case when v_status = 'present'
                       and (v_i + extract(day from v_day)::int) % 6 = 0 then 2 else 0 end;
        insert into public.attendance_entries (org_id, site_id, attendance_date, worker_id,
                                               status, overtime_hours, note, recorded_by)
        values (v_org, v_site, v_day, v_worker[v_i], v_status, v_ot,
                case when v_status = 'absent' then 'Did not come, no call' end, v_sup);
      end loop;
    end loop;
  end loop;

  -- 4. Owner approves 3–8 Nov through the app function (10–11 Nov stay open for the reviewer)
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  for v_day_id in
    select id from public.attendance_days
     where org_id = v_org and attendance_date between '2026-11-03' and '2026-11-08'
  loop
    perform public.review_attendance_day(v_day_id, true, null);
  end loop;

  -- 5. Daily reports by the supervisor
  perform set_config('request.jwt.claims', json_build_object('sub', v_sup, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_sup::text, true);
  insert into public.daily_reports (org_id, site_id, report_date, author_id, status, headcount,
                                    work_done, blockers, serious_blocker, next_day_plan)
  values
    (v_org, v_site_a, '2026-11-06', v_sup, 'submitted', 7,
     'First floor slab shuttering completed on the east side. Column casting for C4 to C7 done.',
     null, false, 'Start steel binding for the first floor slab.'),
    (v_org, v_site_a, '2026-11-07', v_sup, 'submitted', 6,
     'Steel binding for the slab 60% done. Electrician laid conduit pipes in the slab area.',
     'One mason absent. Binding will finish tomorrow.', false, 'Finish binding, checking by engineer at 4 PM.'),
    (v_org, v_site_a, '2026-11-10', v_sup, 'submitted', 7,
     'Slab binding finished and checked. Cover blocks placed. Ready for casting on Wednesday.',
     'RMC truck booked for 7 AM, need confirmation from the plant.', false, 'Slab casting, 32 cum M20.'),
    (v_org, v_site_b, '2026-11-06', v_sup, 'submitted', 5,
     'Brick work on the ground floor rear wall up to lintel level. Plastering of shop 3 started.',
     null, false, 'Continue plaster in shops 3 and 4.'),
    (v_org, v_site_b, '2026-11-07', v_sup, 'submitted', 5,
     'Plaster done in shop 3. Plumber fixed the drain line in the back passage.',
     'Cement stock is low, about 20 bags left.', false, 'Plaster shop 4. Order 100 bags of cement.'),
    (v_org, v_site_b, '2026-11-10', v_sup, 'submitted', 4,
     'Shop 4 plaster 70% done. Lintel shuttering on the rear wall.',
     'Cement down to 12 bags. Work will stop on Thursday if the order is not delivered.', true,
     'Finish shop 4 plaster if cement arrives.');

  -- 6. Materials (owner creates) and stock movements (supervisor records through the app function)
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  insert into public.materials (org_id, site_id, name, unit, low_stock_threshold, created_by)
  values (v_org, v_site_a, 'Cement OPC 53 (Ultratech)', 'bag', 50, v_owner),
         (v_org, v_site_a, 'TMT Steel 12 mm', 'kg', 500, v_owner),
         (v_org, v_site_a, 'Coarse sand', 'cft', 200, v_owner),
         (v_org, v_site_a, 'Red bricks', 'nos', 2000, v_owner),
         (v_org, v_site_b, 'Cement PPC (ACC)', 'bag', 30, v_owner),
         (v_org, v_site_b, 'Fine sand (plaster)', 'cft', 150, v_owner),
         (v_org, v_site_b, 'Red bricks', 'nos', 1500, v_owner),
         (v_org, v_site_b, 'Binding wire', 'kg', 10, v_owner);

  perform set_config('request.jwt.claims', json_build_object('sub', v_sup, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_sup::text, true);
  for v_mat, v_site in select id, site_id from public.materials where org_id = v_org loop
    -- opening stock on 3 Nov, one receipt, two usage entries
    perform public.apply_material_transaction(gen_random_uuid(), v_mat, 'opening',
      case (select name from public.materials where id = v_mat)
        when 'Cement OPC 53 (Ultratech)' then 120 when 'TMT Steel 12 mm' then 2400
        when 'Coarse sand' then 600 when 'Cement PPC (ACC)' then 80
        when 'Fine sand (plaster)' then 400 when 'Binding wire' then 40 else 6000 end,
      '2026-11-03', null);
    perform public.apply_material_transaction(gen_random_uuid(), v_mat, 'receipt',
      case (select name from public.materials where id = v_mat)
        when 'Cement OPC 53 (Ultratech)' then 100 when 'TMT Steel 12 mm' then 1800
        when 'Coarse sand' then 300 when 'Cement PPC (ACC)' then 20
        when 'Fine sand (plaster)' then 200 when 'Binding wire' then 25 else 4000 end,
      '2026-11-05', null);
    perform public.apply_material_transaction(gen_random_uuid(), v_mat, 'usage',
      case (select name from public.materials where id = v_mat)
        when 'Cement OPC 53 (Ultratech)' then 85 when 'TMT Steel 12 mm' then 1650
        when 'Coarse sand' then 280 when 'Cement PPC (ACC)' then 48
        when 'Fine sand (plaster)' then 230 when 'Binding wire' then 22 else 5200 end,
      '2026-11-06', null);
    perform public.apply_material_transaction(gen_random_uuid(), v_mat, 'usage',
      case (select name from public.materials where id = v_mat)
        when 'Cement OPC 53 (Ultratech)' then 60 when 'TMT Steel 12 mm' then 900
        when 'Coarse sand' then 190 when 'Cement PPC (ACC)' then 40
        when 'Fine sand (plaster)' then 160 when 'Binding wire' then 18 else 2600 end,
      '2026-11-10', null);
  end loop;

  -- 7. Owner reviews the older reports (10 Nov reports stay "submitted" for the reviewer)
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  for v_rep in
    select id from public.daily_reports where org_id = v_org and report_date < '2026-11-10'
  loop
    perform public.review_daily_report(v_rep, 'Seen. Keep the photos coming.');
  end loop;

  -- 8. Weekly wage period 3–9 Nov: calculate, one advance, lock (all as the owner)
  insert into public.wage_periods (id, org_id, period_type, start_date, end_date, created_by)
  values (v_period, v_org, 'week', '2026-11-03', '2026-11-09', v_owner);
  perform public.calculate_wage_period(v_period);
  insert into public.wage_adjustments (org_id, period_id, worker_id, amount, reason, created_by)
  values (v_org, v_period, v_worker[5], -500, 'Advance taken on 5 Nov for family function', v_owner);
  perform public.lock_wage_period(v_period);

  raise notice 'Seed done for org % (sites %, %)', v_org, v_site_a, v_site_b;
end;
$$;

-- Quick check after it runs (should show 2 sites, 12 workers, 16 attendance days, 6 reports, 8 materials, 1 locked period):
-- select (select count(*) from sites s join organizations o on o.id=s.org_id where o.name='Sharma Constructions (Demo)') sites,
--        (select count(*) from workers w join organizations o on o.id=w.org_id where o.name='Sharma Constructions (Demo)') workers,
--        (select count(*) from attendance_days d join organizations o on o.id=d.org_id where o.name='Sharma Constructions (Demo)') days,
--        (select count(*) from daily_reports r join organizations o on o.id=r.org_id where o.name='Sharma Constructions (Demo)') reports,
--        (select count(*) from materials m join organizations o on o.id=m.org_id where o.name='Sharma Constructions (Demo)') materials,
--        (select status from wage_periods p join organizations o on o.id=p.org_id where o.name='Sharma Constructions (Demo)') wage_period;
