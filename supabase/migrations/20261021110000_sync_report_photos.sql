-- Daily Reporting: sync_report_photos, the handler sync_push calls for a
-- photo's metadata row. Owner: Anuradha. Issue #63. Contract: #13, ADR-014.
-- Decisions: ADR-013 (D3, D6), ADR-021.
--
-- Metadata only. The file goes to the report-photos bucket after this row is
-- accepted, and Storage takes it only because this row exists (#35). A photo
-- never blocks its report.
--
-- SECURITY INVOKER: the insert runs under the caller's RLS, and the #35 checks
-- and guard decide the rest. sync_push turns what it raises into a verdict:
--   22023 / 22P02  bad payload                                  -> rejected / invalid_input
--   23514          bad path, type or size, an 11th photo        -> rejected / invalid_input
--   42501          not the report's author, or lost the site    -> rejected / permission_denied
--   23503          the report has not arrived yet               -> retryable_error / missing_parent
--   23505          this id already holds another photo          -> conflict / duplicate
--
-- Payload, the "same content" agreed on #13:
--   report_id, storage_path, size_bytes, content_type   required
--   caption                                             optional
-- The site and organisation come from the report, never from the phone.

-- ------------------------------------------------------------ private helpers

-- Is this exactly the photo the caller already holds on the server? Replay
-- before permission, like daily_report_matches. Caller's own rows only.
create function public.report_photo_matches(
  p_id           uuid,
  p_report_id    uuid,
  p_storage_path text,
  p_caption      text,
  p_size_bytes   integer,
  p_content_type text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.report_photos p
    where p.id = p_id
      and p.uploaded_by = auth.uid()
      and p.report_id = p_report_id
      and p.storage_path = p_storage_path
      and p.caption is not distinct from p_caption
      and p.size_bytes = p_size_bytes
      and p.content_type = p_content_type
  );
$$;

-- Did the caller write this report? Lets the handler tell "your report, but you
-- can no longer reach its site" (rejected) from "not here yet" (retry) when the
-- caller cannot read it. About anyone else's report it says only false, the
-- same as for an id that does not exist.
create function public.is_own_daily_report(p_report_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.daily_reports r
    where r.id = p_report_id and r.author_id = auth.uid()
  );
$$;

revoke all on function public.report_photo_matches(uuid, uuid, text, text, integer, text) from public, anon;
revoke all on function public.is_own_daily_report(uuid)                                 from public, anon;
-- The handler runs as the caller, so the caller needs to execute these.
grant execute on function public.report_photo_matches(uuid, uuid, text, text, integer, text) to authenticated;
grant execute on function public.is_own_daily_report(uuid)                                 to authenticated;

-- ------------------------------------------------------------------- handler

create function public.sync_report_photos(p_record_id uuid, p_payload jsonb)
returns public.sync_result
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_report_id    uuid;
  v_storage_path text;
  v_caption      text;
  v_size_bytes   integer;
  v_content_type text;
  v_bad_field    text;
  v_report       record;
  v_rows         integer;
begin
  -- 1. The payload, one JSON type per field.
  if jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'the payload must be an object' using errcode = '22023';
  end if;

  select f.key into v_bad_field
    from (values ('report_id',    array['string']),
                 ('storage_path', array['string']),
                 ('size_bytes',   array['number']),
                 ('content_type', array['string']),
                 ('caption',      array['string', 'null'])) as f (key, types)
   where coalesce(jsonb_typeof(p_payload -> f.key), 'null') <> all (f.types)
   limit 1;
  if v_bad_field is not null then
    raise exception 'payload field % is missing or has the wrong type', v_bad_field
      using errcode = '22023';
  end if;

  v_report_id    := (p_payload ->> 'report_id')::uuid;
  v_storage_path := p_payload ->> 'storage_path';
  v_caption      := p_payload ->> 'caption';
  v_size_bytes   := (p_payload ->> 'size_bytes')::integer;
  v_content_type := p_payload ->> 'content_type';

  -- 2. A replay of the caller's own photo, answered before any permission check.
  if public.report_photo_matches(p_record_id, v_report_id, v_storage_path,
                                 v_caption, v_size_bytes, v_content_type) then
    return ('accepted', null)::public.sync_result;
  end if;

  -- 3. The report, under the caller's RLS: its site and organisation are the photo's.
  select r.site_id, r.org_id
    into v_report
    from public.daily_reports r
   where r.id = v_report_id;

  if not found then
    if public.is_own_daily_report(v_report_id) then
      raise exception 'not permitted to add a photo to report %', v_report_id
        using errcode = '42501';
    end if;
    -- The phone sends a report before its photos, so it is on its way.
    raise exception 'report % has not arrived yet', v_report_id
      using errcode = '23503';
  end if;

  -- 4. The row. The insert policy allows only the report's author on a site
  --    they can still record on; the guard counts the photos.
  insert into public.report_photos
    (id, org_id, site_id, report_id, storage_path, caption, size_bytes, content_type)
  values
    (p_record_id, v_report.org_id, v_report.site_id, v_report_id, v_storage_path,
     v_caption, v_size_bytes, v_content_type)
  on conflict (id) do nothing;
  get diagnostics v_rows = row_count;

  if v_rows = 1 then
    return ('accepted', null)::public.sync_result;
  end if;
  -- A photo is never changed (D6), so the same id with other content stays as it is.
  raise exception 'photo % already exists', p_record_id using errcode = '23505';
end;
$$;

revoke all on function public.sync_report_photos(uuid, jsonb) from public, anon;
grant execute on function public.sync_report_photos(uuid, jsonb) to authenticated;
