-- Workforce: attach Audit's write_audit() to the tables Workforce owns.
-- Owner: Ishant. Issue #23.

create trigger workers_audit
  after insert or update or delete on public.workers
  for each row execute function public.write_audit();

create trigger worker_site_assignments_audit
  after insert or update or delete on public.worker_site_assignments
  for each row execute function public.write_audit();

create trigger worker_wage_rates_audit
  after insert or update or delete on public.worker_wage_rates
  for each row execute function public.write_audit();
