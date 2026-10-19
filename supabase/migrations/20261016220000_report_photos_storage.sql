-- Daily Reporting: the private report-photos Storage bucket and its policies.
-- Owner: Anuradha. Issue #29. Decisions D3 and D6 in ADR-013.
--
-- The file lives in Storage; report_photos holds its metadata. The metadata row
-- is the key to the file: an object can be uploaded or read only when a
-- report_photos row names it, so the same site rule that guards the row guards
-- the file. The bucket is never public.
--
-- There is no UPDATE or DELETE policy, so a stored photo cannot be replaced or
-- removed by any client, and no upsert can overwrite one.
--
-- Storage itself enforces the size and type limits on upload. The same limits
-- are CHECK constraints on report_photos, so a row cannot promise a file the
-- bucket would refuse.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-photos', 'report-photos', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public             = false,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Upload: only the user who made the metadata row, and only while they can
-- still attach photos to that report (its author, on a site that is open).
-- The subquery runs under the caller's RLS on report_photos.
create policy report_photos_objects_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'report-photos'
    and exists (
      select 1
      from public.report_photos p
      where p.storage_path = storage.objects.name
        and p.uploaded_by = auth.uid()
        and public.can_attach_report_photo(p.report_id)
    )
  );

-- Read: whoever can read the metadata row. That means site access, and for a
-- draft's photo the author only, because report_photos_select checks both.
create policy report_photos_objects_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'report-photos'
    and exists (
      select 1
      from public.report_photos p
      where p.storage_path = storage.objects.name
    )
  );
