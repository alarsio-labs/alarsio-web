-- Workforce: the roster view Attendance reads. Owner: Ishant. Issue #23.
-- Decision in ADR-011 (W9).
--
-- One row per worker_site_assignments row, open and closed, so Attendance can
-- ask "was this worker assigned to this site on that date". No rates.
--
-- security_invoker, so it runs under the caller's RLS on both tables. A closed
-- assignment's worker must stay readable for this to work, so has_worker_access
-- now also counts a closed assignment at a site the caller can access: a site's
-- supervisor can see everyone who has ever been rostered there, but no one else.

create or replace function public.has_worker_access(p_worker_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workers w
    where w.id = p_worker_id
      and (
        public.can_manage_sites(w.org_id)
        or exists (
          select 1 from public.worker_site_assignments a
          where a.worker_id = w.id
            and public.has_site_access(a.site_id)
        )
      )
  );
$$;

create view public.worker_roster
with (security_invoker = true) as
select a.id          as assignment_id,
       a.org_id,
       a.site_id,
       a.worker_id,
       w.code        as worker_code,
       w.full_name   as name,
       w.trade,
       w.status,
       a.assigned_at,
       a.unassigned_at
from public.worker_site_assignments a
join public.workers w
  on w.id = a.worker_id and w.org_id = a.org_id;

revoke all on public.worker_roster from public, anon, authenticated;
grant select on public.worker_roster to authenticated;
