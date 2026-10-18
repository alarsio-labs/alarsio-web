-- Sites: the view Attendance reads the geofence through. Owner: Manish.
-- Issue #28, decision D9 in ADR-021. Published in docs/ARCHITECTURE.md (Sites).
--
-- Attendance checks a check-in against the site's pin and radius, and
-- ARCHITECTURE.md lets one module read another only through a published view.
-- This view exposes exactly what the check needs and nothing else: no name, no
-- address, no status.
--
-- security_invoker, so it runs under the caller's RLS on sites (has_site_access):
-- a caller who cannot see a site gets no row for it, the same as for an id that
-- does not exist.

create view public.site_geofence
with (security_invoker = true) as
select s.id,
       s.org_id,
       s.latitude,
       s.longitude,
       s.geofence_radius_m
from public.sites s;

revoke all on public.site_geofence from public, anon, authenticated;
grant select on public.site_geofence to authenticated;
