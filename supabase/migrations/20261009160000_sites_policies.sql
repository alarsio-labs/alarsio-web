-- Sites: policies and grants on public.sites.
-- Owner: Manish. Issue #8.
--
-- Requires Identity's has_site_access(uuid) and can_manage_sites(uuid). This file
-- must sort after the migration that creates them; rename it before merge if not.
--
-- There is no DELETE policy and no DELETE grant, on purpose. Attendance, reports
-- and materials all point at a site, and a site's history must outlive it. A site
-- ends by archive_site(), never by delete. With neither a policy nor a grant, a
-- DELETE is refused twice over.

-- ---------------------------------------------------------------- grants

-- Columns a client may set on insert. id, created_by and the timestamps come
-- from defaults; archived_at and archived_by only from archive_site().
grant select on public.sites to authenticated;
grant insert (org_id, name, address, latitude, longitude, geofence_radius_m, status)
  on public.sites to authenticated;
-- org_id is not updatable, so a site cannot move between organisations.
grant update (name, address, latitude, longitude, geofence_radius_m, status)
  on public.sites to authenticated;

-- -------------------------------------------------------------- policies

create policy sites_select on public.sites
  for select to authenticated
  using (public.has_site_access(id));

-- A new site cannot start archived.
create policy sites_insert on public.sites
  for insert to authenticated
  with check (public.can_manage_sites(org_id) and status <> 'archived');

-- USING hides archived sites from UPDATE, so they are read-only (0 rows).
-- WITH CHECK stops a live site being archived here instead of by archive_site().
create policy sites_update on public.sites
  for update to authenticated
  using      (public.can_manage_sites(org_id) and status <> 'archived')
  with check (public.can_manage_sites(org_id) and status <> 'archived');
