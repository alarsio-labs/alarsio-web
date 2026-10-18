-- Identity & Access, week 2: the three role predicates the field and wage
-- modules call from their policies. Owner: Ishant.
--
--   can_record_on_site(site)  Attendance, Daily Reporting, Materials insert policies
--   can_review_site(site)     Attendance and Reporting review functions
--   can_view_wages(org)       Wage Summaries read policies
--
-- Same shape as has_site_access: SECURITY DEFINER so a policy can call them
-- without recursing into RLS, auth.uid() only, no user id argument, and false
-- (never null) for an unknown or foreign id, so the answer does not reveal
-- which ids exist.

-- Capture field records: the assigned supervisor, on a site that is not
-- archived. An archived site is read-only (ADR-007).
-- Owners and project managers fix and approve through review and correction
-- paths, not by recording. This is a proposal; Attendance may ask to change it.
create function public.can_record_on_site(p_site_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.sites s
    join public.memberships m
      on m.org_id = s.org_id and m.user_id = auth.uid()
    join public.site_assignments a
      on a.site_id = s.id and a.user_id = m.user_id and a.unassigned_at is null
    where s.id = p_site_id
      and s.status <> 'archived'
      and m.role = 'supervisor'
  );
$$;

-- Approve or reject records for a site: owner and project_manager of the
-- site's organisation. Archived sites stay reviewable.
create function public.can_review_site(p_site_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.sites s
    join public.memberships m
      on m.org_id = s.org_id and m.user_id = auth.uid()
    where s.id = p_site_id
      and m.role in ('owner', 'project_manager')
  );
$$;

-- Read wage amounts: owner and accountant. A project_manager reviews work
-- but never sees wage amounts; a supervisor never does (SECURITY.md).
create function public.can_view_wages(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    where m.org_id = p_org_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'accountant')
  );
$$;

revoke all on function public.can_record_on_site(uuid) from public, anon;
revoke all on function public.can_review_site(uuid)    from public, anon;
revoke all on function public.can_view_wages(uuid)     from public, anon;
grant execute on function public.can_record_on_site(uuid) to authenticated;
grant execute on function public.can_review_site(uuid)    to authenticated;
grant execute on function public.can_view_wages(uuid)     to authenticated;
