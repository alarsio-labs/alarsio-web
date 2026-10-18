-- Workforce: grants, policies, the roster predicate and the effective-rate view.
-- Owner: Ishant. Issue #23.
--
-- No DELETE or TRUNCATE grant anywhere. worker_wage_rates has no UPDATE grant
-- either: a rate is replaced by a newer row, never edited.

-- ------------------------------------------------------------- predicate
-- Who may see a worker (never a rate): owner and project_manager across the
-- org, and anyone with access to a site the worker is currently assigned to.
-- Private to Workforce; other modules read the roster through a view later.
create function public.has_worker_access(p_worker_id uuid)
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
            and a.unassigned_at is null
            and public.has_site_access(a.site_id)
        )
      )
  );
$$;

revoke all on function public.has_worker_access(uuid) from public, anon;
grant execute on function public.has_worker_access(uuid) to authenticated;

-- ---------------------------------------------------------------- grants

grant select on public.workers to authenticated;
grant insert (org_id, code, full_name, phone, trade, pay_type) on public.workers to authenticated;
-- org_id and code never change after creation; status is how a worker is retired.
grant update (full_name, phone, trade, pay_type, status) on public.workers to authenticated;

grant select on public.worker_site_assignments to authenticated;
grant insert (org_id, worker_id, site_id) on public.worker_site_assignments to authenticated;
grant update (unassigned_at) on public.worker_site_assignments to authenticated;

grant select on public.worker_wage_rates to authenticated;
grant insert (org_id, worker_id, rate, effective_from) on public.worker_wage_rates to authenticated;

-- -------------------------------------------------------------- policies

-- can_manage_sites(org_id) comes first and reads only the row's own org_id. A
-- row being inserted is not yet visible to has_worker_access(), which queries
-- the table, so without this an INSERT ... RETURNING or an upsert would fail
-- its own SELECT check.
create policy workers_select on public.workers
  for select to authenticated
  using (public.can_manage_sites(org_id) or public.has_worker_access(id));

create policy workers_insert on public.workers
  for insert to authenticated
  with check (public.can_manage_sites(org_id));

-- An anonymized worker is final: it no longer matches USING.
create policy workers_update on public.workers
  for update to authenticated
  using      (public.can_manage_sites(org_id) and anonymized_at is null)
  with check (public.can_manage_sites(org_id) and anonymized_at is null);

create policy wsa_select on public.worker_site_assignments
  for select to authenticated
  using (public.has_site_access(site_id));

create policy wsa_insert on public.worker_site_assignments
  for insert to authenticated
  with check (public.can_manage_sites(org_id) and unassigned_at is null);

-- Only an open assignment can be closed, and a closed one cannot be reopened.
create policy wsa_update on public.worker_site_assignments
  for update to authenticated
  using      (public.can_manage_sites(org_id) and unassigned_at is null)
  with check (public.can_manage_sites(org_id) and unassigned_at is not null);

create policy wwr_select on public.worker_wage_rates
  for select to authenticated
  using (public.can_view_wages(org_id));

create policy wwr_insert on public.worker_wage_rates
  for insert to authenticated
  with check (public.can_view_wages(org_id));

-- ------------------------------------------------------ effective rates
-- security_invoker, so the view runs under the caller's RLS: a caller who may
-- not read worker_wage_rates gets zero rows from it.

create view public.worker_effective_rates
with (security_invoker = true) as
select distinct on (r.worker_id)
       r.worker_id, r.org_id, r.rate, r.effective_from
from public.worker_wage_rates r
where r.effective_from <= current_date
order by r.worker_id, r.effective_from desc;

revoke all on public.worker_effective_rates from public, anon, authenticated;
grant select on public.worker_effective_rates to authenticated;

-- The rate in force for one worker on one date. SECURITY INVOKER (the default)
-- so it is bound by the same RLS as the table.
create function public.worker_rate_on(p_worker_id uuid, p_on date)
returns numeric
language sql
stable
set search_path = public
as $$
  select r.rate
  from public.worker_wage_rates r
  where r.worker_id = p_worker_id and r.effective_from <= p_on
  order by r.effective_from desc
  limit 1;
$$;

revoke all on function public.worker_rate_on(uuid, date) from public, anon;
grant execute on function public.worker_rate_on(uuid, date) to authenticated;
