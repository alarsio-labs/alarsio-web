-- Sites: the view the phone's offline mirror reads sites through. Owner: Manish.
-- Issue #49, decision in ADR-028. Published in docs/ARCHITECTURE.md (Sites).
--
-- Offline Sync copies each supervisor's sites onto the phone so they can pick a
-- site with no signal, and ARCHITECTURE.md lets one module read another only
-- through a published view. The two views Sites already publishes are too narrow
-- on purpose: site_geofence carries the pin and radius and nothing else (ADR-021
-- D9), and site_directory carries the name and status and nothing else (ADR-025
-- W1). This one carries the whole record a field screen needs: name, address,
-- status, pin and geofence radius.
--
-- security_invoker, so it runs under the caller's RLS on sites (has_site_access):
-- a supervisor or accountant gets only the sites they hold an open assignment on,
-- an owner or project manager every site of their organisation, and nobody a site
-- of another organisation. No row is filtered here, so archived sites stay listed
-- for the managers; a supervisor's archived sites disappear because archive_site
-- closes their assignments. The caller can already read every one of these columns
-- from sites, so the view exposes nothing new. It is read-only: no write grant.

create view public.site_details
with (security_invoker = true) as
select s.id,
       s.org_id,
       s.name,
       s.address,
       s.status,
       s.latitude,
       s.longitude,
       s.geofence_radius_m
from public.sites s;

revoke all on public.site_details from public, anon, authenticated;
grant select on public.site_details to authenticated;
