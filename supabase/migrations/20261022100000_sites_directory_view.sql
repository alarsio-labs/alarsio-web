-- Sites: the view other modules read site names through. Owner: Manish.
-- Issue #74, decision D1 in ADR-025. Published in docs/ARCHITECTURE.md (Sites).
--
-- Daily Reporting's web pages show which site a report is for, and
-- ARCHITECTURE.md lets one module read another only through a published view.
-- This view exposes the name and status and nothing else: no address, no pin,
-- no geofence.
--
-- security_invoker, so it runs under the caller's RLS on sites (has_site_access):
-- a caller who cannot see a site gets no row for it, the same as for an id that
-- does not exist. Archived sites stay listed, so an old report keeps its name.

create view public.site_directory
with (security_invoker = true) as
select s.id,
       s.org_id,
       s.name,
       s.status
from public.sites s;

revoke all on public.site_directory from public, anon, authenticated;
grant select on public.site_directory to authenticated;
