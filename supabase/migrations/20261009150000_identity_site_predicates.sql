-- Identity & Access: the two site predicates Sites' policies call.
-- Owner: Ishant. Issues #5 and #12. See ADR-007 for the ordering.
--
-- Timestamped between site_assignments (140000) and the Sites policies
-- (160000) on purpose: Postgres checks that a function exists when a policy
-- is created, so these must exist first. Sites' tables must exist before this
-- file, because has_site_access reads site_assignments (the one permitted
-- upward read, ADR-007).
--
-- Both are SECURITY DEFINER so a policy can call them without recursing into
-- the RLS of the tables they read. Both check the caller themselves through
-- auth.uid() and take no user id argument, so a caller cannot ask about
-- someone else.

-- Create and edit sites, assign supervisors, archive.
create function public.can_manage_sites(p_org_id uuid)
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
      and m.role in ('owner', 'project_manager')
  );
$$;

-- Read a site and its assignments.
--   owner, project_manager  every site in their organisation
--   supervisor, accountant  only a site they hold an open assignment on
-- An unknown site id returns false, the same as a site in another
-- organisation, so the answer does not reveal which ids exist.
-- The accountant rule is the proposal in #5 and is still to be confirmed.
create function public.has_site_access(p_site_id uuid)
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
      and (
        m.role in ('owner', 'project_manager')
        or exists (
          select 1 from public.site_assignments a
          where a.site_id = s.id
            and a.user_id = m.user_id
            and a.unassigned_at is null
        )
      )
  );
$$;

revoke all on function public.can_manage_sites(uuid) from public, anon;
revoke all on function public.has_site_access(uuid)  from public, anon;
grant execute on function public.can_manage_sites(uuid) to authenticated;
grant execute on function public.has_site_access(uuid)  to authenticated;
