-- Audit, Retention & Guards: who may read audit_log. Owner: Anuradha. Issue #19.
--
-- The owner of an organisation reads that organisation's rows, through a policy
-- that calls Identity's is_org_owner(). Every other role gets zero rows. Rows
-- with a null org_id (profiles) match no organisation, so they stay closed to
-- every client. Nothing else changes: no client gains INSERT, UPDATE, DELETE or
-- TRUNCATE, and the append-only guard is untouched.

grant select on public.audit_log to authenticated;

create policy audit_log_select on public.audit_log
  for select to authenticated
  using (org_id is not null and public.is_org_owner(org_id));
