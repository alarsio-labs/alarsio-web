-- Audit, Retention & Guards: staff usage. Owner: Anuradha. ADR-052 (Proposed).
--
-- A team-only read of how each organisation uses Alarsio, for design-partner
-- evidence and support. It adds no role, uses no service key and changes no
-- policy on any existing table.
--
--   * staff_members is an allowlist. RLS is on and there is no policy, and no client
--     role holds any privilege on it, so nobody can read or write it through the
--     API, a staff user included. Rows are added by hand in the Supabase SQL editor.
--   * is_staff() says whether the caller is on the list. It answers only about the
--     caller (auth.uid()).
--   * staff_org_usage() raises 42501 unless is_staff(), then returns one row per
--     organisation: counts and dates only. No name of a person, no email, no phone,
--     no coordinate. It is SECURITY DEFINER because no published view can show one
--     user every organisation (ARCHITECTURE rule 4; a named exception, ADR-052 S5).
--
-- "Records" are attendance_entries, daily_reports, material_transactions and
-- site_visits, by created_at: when the record reached the server, so it cannot be
-- backdated. "Active" and "last active" also count a site or worker an organisation
-- created, as the hand-run usage query always did. Weeks start Monday in
-- Asia/Kolkata, and week_start is the current week's Monday, so the page labels the
-- weeks from the database's own clock.
--
-- staff_members has no id and no organisation, so it is exempt from the audit
-- coverage and export guards (audit_coverage_test.sql, lib/export/tables.ts).

create table public.staff_members (
  user_id  uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now(),
  added_by text not null check (length(btrim(added_by)) > 0)
);

alter table public.staff_members enable row level security;
revoke all on table public.staff_members from public, anon, authenticated;

create function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.staff_members s where s.user_id = auth.uid())
$$;

revoke all on function public.is_staff() from public, anon;
grant execute on function public.is_staff() to authenticated;

create function public.staff_org_usage()
returns table (
  org_id           uuid,
  org_name         text,
  created_at       timestamptz,
  owners           integer,
  project_managers integer,
  supervisors      integer,
  accountants      integer,
  active_users_28d integer,
  sites            integer,
  workers          integer,
  attendance_marks integer,
  daily_reports    integer,
  material_entries integer,
  site_check_ins   integer,
  last_active      timestamptz,
  last_sign_in     timestamptz,
  week_start       date,
  weekly_records   integer[]
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_now    timestamptz := now();
  v_monday date := date_trunc('week', now() at time zone 'Asia/Kolkata')::date;
begin
  if not public.is_staff() then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  return query
  with recs as (
    select a.org_id, a.recorded_by as user_id, a.created_at, 'attendance'::text as kind
      from public.attendance_entries a
    union all
    select r.org_id, r.author_id, r.created_at, 'daily_report'
      from public.daily_reports r
    union all
    select m.org_id, m.recorded_by, m.created_at, 'material_entry'
      from public.material_transactions m
    union all
    select v.org_id, v.user_id, v.created_at, 'site_check_in'
      from public.site_visits v
  ),
  acts as (
    select x.org_id, x.user_id, x.created_at, x.kind from recs x
    union all
    select s.org_id, s.created_by, s.created_at, 'site'
      from public.sites s
    union all
    select w.org_id, w.created_by, w.created_at, 'worker'
      from public.workers w
  ),
  totals as (
    select t.org_id,
           count(*) filter (where t.kind = 'site')           as sites,
           count(*) filter (where t.kind = 'worker')         as workers,
           count(*) filter (where t.kind = 'attendance')     as attendance_marks,
           count(*) filter (where t.kind = 'daily_report')   as daily_reports,
           count(*) filter (where t.kind = 'material_entry') as material_entries,
           count(*) filter (where t.kind = 'site_check_in')  as site_check_ins,
           count(distinct t.user_id) filter (where t.created_at > v_now - interval '28 days') as active_users_28d,
           max(t.created_at)                                 as last_active
      from acts t
     group by t.org_id
  ),
  weekly as (
    -- 0 is the current week, 3 the oldest of the four. A record outside them is not counted.
    select b.org_id,
           count(*) filter (where b.bucket = 3) as w3,
           count(*) filter (where b.bucket = 2) as w2,
           count(*) filter (where b.bucket = 1) as w1,
           count(*) filter (where b.bucket = 0) as w0
      from (
        select y.org_id,
               (v_monday - date_trunc('week', y.created_at at time zone 'Asia/Kolkata')::date) / 7 as bucket
          from recs y
      ) b
     group by b.org_id
  ),
  roles as (
    select m.org_id,
           count(*) filter (where m.role = 'owner')           as owners,
           count(*) filter (where m.role = 'project_manager') as project_managers,
           count(*) filter (where m.role = 'supervisor')      as supervisors,
           count(*) filter (where m.role = 'accountant')      as accountants,
           max(u.last_sign_in_at)                             as last_sign_in
      from public.memberships m
      left join auth.users u on u.id = m.user_id
     group by m.org_id
  )
  select o.id,
         o.name,
         o.created_at,
         coalesce(r.owners, 0)::integer,
         coalesce(r.project_managers, 0)::integer,
         coalesce(r.supervisors, 0)::integer,
         coalesce(r.accountants, 0)::integer,
         coalesce(t.active_users_28d, 0)::integer,
         coalesce(t.sites, 0)::integer,
         coalesce(t.workers, 0)::integer,
         coalesce(t.attendance_marks, 0)::integer,
         coalesce(t.daily_reports, 0)::integer,
         coalesce(t.material_entries, 0)::integer,
         coalesce(t.site_check_ins, 0)::integer,
         t.last_active,
         r.last_sign_in,
         v_monday,
         array[coalesce(w.w3, 0), coalesce(w.w2, 0), coalesce(w.w1, 0), coalesce(w.w0, 0)]::integer[]
    from public.organizations o
    left join roles  r on r.org_id = o.id
    left join totals t on t.org_id = o.id
    left join weekly w on w.org_id = o.id
   order by o.created_at, o.id;
end;
$$;

revoke all on function public.staff_org_usage() from public, anon;
grant execute on function public.staff_org_usage() to authenticated;
