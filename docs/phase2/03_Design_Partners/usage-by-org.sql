-- Alarsio Phase 2: usage evidence per organisation. READ-ONLY (select only).
-- Run in Supabase dashboard > SQL editor. Screenshot the result for each partner,
-- blur personal names if the partner asks. Uses created_at = when the record really
-- reached the server, so it cannot be backdated.
--
-- Change the org filter in the "orgs" CTE: leave as is to see every org except tests.

-- Query 1: one row per organisation (account date, users, records, last active)
with orgs as (
  select id, name, created_at from public.organizations
  where name not ilike '%test%' and name not ilike '%(demo)%'   -- hides Audit Test Co and the reviewer demo org
),
events as (
  select org_id, recorded_by as user_id, created_at, 'attendance' as kind from public.attendance_entries
  union all select org_id, author_id, created_at, 'daily_report' from public.daily_reports
  union all select org_id, recorded_by, created_at, 'material_entry' from public.material_transactions
  union all select org_id, user_id, created_at, 'site_check_in' from public.site_visits
  union all select org_id, created_by, created_at, 'worker' from public.workers
  union all select org_id, created_by, created_at, 'site' from public.sites
)
select o.name                                                    as organisation,
       to_char(o.created_at at time zone 'Asia/Kolkata', 'DD Mon YYYY') as account_created,
       (select count(*) from public.memberships m where m.org_id = o.id) as members,
       count(distinct e.user_id) filter (where e.created_at > now() - interval '28 days') as active_users_28d,
       count(*) filter (where e.kind = 'site')            as sites,
       count(*) filter (where e.kind = 'worker')          as workers,
       count(*) filter (where e.kind = 'attendance')      as attendance_marks,
       count(*) filter (where e.kind = 'daily_report')    as daily_reports,
       count(*) filter (where e.kind = 'material_entry')  as material_entries,
       count(*) filter (where e.kind = 'site_check_in')   as site_check_ins,
       to_char(max(e.created_at) at time zone 'Asia/Kolkata', 'DD Mon YYYY HH24:MI') as last_active
from orgs o
left join events e on e.org_id = o.id
group by o.id, o.name, o.created_at
order by o.created_at;

-- Query 2: activity by week for the last 4 weeks (weeks start Monday, IST)
with orgs as (
  select id, name from public.organizations where name not ilike '%test%' and name not ilike '%(demo)%'
),
weeks as (
  select generate_series(
           date_trunc('week', (now() at time zone 'Asia/Kolkata'))::date - 21,
           date_trunc('week', (now() at time zone 'Asia/Kolkata'))::date,
           interval '7 days')::date as week_start
),
events as (
  select org_id, recorded_by as user_id, created_at from public.attendance_entries
  union all select org_id, author_id, created_at from public.daily_reports
  union all select org_id, recorded_by, created_at from public.material_transactions
  union all select org_id, user_id, created_at from public.site_visits
)
select o.name as organisation,
       to_char(w.week_start, 'DD Mon') || ' – ' || to_char(w.week_start + 6, 'DD Mon') as week,
       count(e.*)                  as records_created,
       count(distinct e.user_id)   as active_users,
       count(distinct (e.created_at at time zone 'Asia/Kolkata')::date) as days_with_activity
from orgs o
cross join weeks w
left join events e
  on e.org_id = o.id
 and (e.created_at at time zone 'Asia/Kolkata')::date between w.week_start and w.week_start + 6
group by o.name, w.week_start
order by o.name, w.week_start;

-- Query 3 (Supabase only): last sign-in per member, without emails
select o.name as organisation, m.role, p.full_name,
       to_char(u.last_sign_in_at at time zone 'Asia/Kolkata', 'DD Mon YYYY HH24:MI') as last_sign_in
from public.memberships m
join public.organizations o on o.id = m.org_id
join auth.users u on u.id = m.user_id
left join public.profiles p on p.id = m.user_id
where o.name not ilike '%test%' and o.name not ilike '%(demo)%'
order by o.name, m.role;
