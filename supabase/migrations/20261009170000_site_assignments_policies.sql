-- Sites: policies and grants on public.site_assignments.
-- Owner: Manish. Issue #8.
--
-- Requires Identity's has_site_access(uuid) and can_manage_sites(uuid); must sort
-- after the migration that creates them.
--
-- No DELETE policy or grant: unassigning closes the row, it never removes it.

-- ---------------------------------------------------------------- grants

-- Assign: the client names the org, site and user; the rest is defaults.
grant select on public.site_assignments to authenticated;
grant insert (org_id, site_id, user_id) on public.site_assignments to authenticated;
-- Unassign: set unassigned_at to anything non-null; the trigger stamps the real
-- time and caller.
grant update (unassigned_at) on public.site_assignments to authenticated;

-- -------------------------------------------------------------- policies

create policy site_assignments_select on public.site_assignments
  for select to authenticated
  using (public.has_site_access(site_id));

create policy site_assignments_insert on public.site_assignments
  for insert to authenticated
  with check (public.can_manage_sites(org_id) and unassigned_at is null);

-- Only an open assignment can be closed, and a closed one cannot be reopened:
-- once unassigned_at is set the row no longer matches USING (0 rows).
create policy site_assignments_update on public.site_assignments
  for update to authenticated
  using      (public.can_manage_sites(org_id) and unassigned_at is null)
  with check (public.can_manage_sites(org_id) and unassigned_at is not null);
