-- Identity & Access: attach Audit's write_audit() to the tables Identity owns.
-- Owner: Ishant. Issue #4 (write_audit is published; this is the attach step).
--
-- invites joins this list when that table exists (week 2).

create trigger organizations_audit
  after insert or update or delete on public.organizations
  for each row execute function public.write_audit();

create trigger profiles_audit
  after insert or update or delete on public.profiles
  for each row execute function public.write_audit();

create trigger memberships_audit
  after insert or update or delete on public.memberships
  for each row execute function public.write_audit();
