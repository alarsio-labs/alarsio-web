-- Workforce: an accountant can read the workers of their organisation.
-- Owner: Ishant. ADR-011, W10.
--
-- An accountant turns approved attendance into wages (PRD) and can already read
-- every wage rate through can_view_wages(org). Without this they saw the rates
-- but not whose they were. They see name, code, trade and status, the same as
-- an owner; they still cannot create, edit or assign (can_manage_sites).
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
