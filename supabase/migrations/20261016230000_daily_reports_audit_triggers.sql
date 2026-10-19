-- Daily Reporting: attach Audit's write_audit() to the tables Reporting owns.
-- Owner: Anuradha. Issue #29.
--
-- One audit_log row per changed row, with the actor, the organisation and the
-- old and new values. The guard triggers fire first (BEFORE), so the audit row
-- records the row as it was finally stored: the server's submit and review
-- stamps are in it, and edit_reason, which is cleared, is not. The reason of an
-- edit is in the audited daily_report_revisions row.

create trigger daily_reports_audit
  after insert or update or delete on public.daily_reports
  for each row execute function public.write_audit();

create trigger daily_report_revisions_audit
  after insert or update or delete on public.daily_report_revisions
  for each row execute function public.write_audit();

create trigger report_photos_audit
  after insert or update or delete on public.report_photos
  for each row execute function public.write_audit();
