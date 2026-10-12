-- Sites: attach the generic audit trigger to the tables Sites owns.
-- Owner: Manish. Issue #8. Shape and guards: ADR-008.
--
-- Attached exactly as the audit_log migration (20261009190000) prescribes:
-- AFTER ... FOR EACH ROW, so write_audit() records one row per changed row and
-- nothing for a statement that changed none. Both tables have a uuid `id` and an
-- `org_id`, which write_audit() requires and records.
--
-- DELETE is covered for completeness. No client role can delete from either
-- table, so in practice only INSERT and UPDATE (including archive_site(), which
-- updates both tables) produce rows.
--
-- Does not call Identity's predicates, but it sorts after the Sites policies,
-- which do, so it cannot apply until they exist.

create trigger sites_audit
  after insert or update or delete on public.sites
  for each row execute function public.write_audit();

create trigger site_assignments_audit
  after insert or update or delete on public.site_assignments
  for each row execute function public.write_audit();
