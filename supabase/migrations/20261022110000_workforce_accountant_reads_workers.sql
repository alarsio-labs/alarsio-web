-- Workforce: an accountant can read the workers of their organisation.
-- Owner: Ishant. ADR-011, W10. Issue: accountants could read rates but not
-- whose they were.
--
-- An accountant turns approved attendance into wages (PRD) and already reads
-- every wage rate through can_view_wages(org). They now read the full workers
-- row of every worker in their organisation, including phone (personal data
-- under DPDP, docs/SECURITY.md), pay_type, created_by and anonymized_at. They
-- need the name and code to pay a person and the phone to reach them about
-- pay. They still cannot create, edit, assign or import (can_manage_sites).
--
-- This widens workers only. worker_site_assignments and worker_roster still go
-- through has_site_access, so an accountant without a site assignment reads no
-- roster rows. Worker visibility now also follows can_view_wages: a later
-- change to that predicate changes who can read workers.
-- Supervisors and project managers are unchanged.

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
        or public.can_view_wages(w.org_id)
        or exists (
          select 1 from public.worker_site_assignments a
          where a.worker_id = w.id
            and public.has_site_access(a.site_id)
        )
      )
  );
$$;
