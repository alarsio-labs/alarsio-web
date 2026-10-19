-- Attendance & Site Presence: sync_site_visits, the handler sync_push calls for a
-- visit. Issue #28 PR 3b. Contract: #13, ADR-014. Decisions: ADR-021 D1/D6, ADR-033.
--
-- SECURITY INVOKER (#13): every write runs under the caller's RLS, and the existing
-- trigger keeps the geofence and the phone-clock rule, so web and phone follow one
-- rule. This function reads the payload, answers a replay, and inserts the check-in
-- or sets the check-out. sync_push turns what it raises into a verdict:
--   22023 / 22P02  bad payload, a site outside its organisation  -> rejected / invalid_input
--   23514          outside with no reason, phone clock too far   -> rejected / invalid_input
--   42501          not permitted (RLS, not the caller's visit)   -> rejected / permission_denied
--   23505          id taken by a visit the caller cannot see     -> conflict / duplicate
-- and it returns two conflicts itself: 'checked_out' (the visit already has another
-- check-out) and 'different_visit' (this id holds another check-in).
--
-- The payload is the whole visit as the phone holds it (ADR-033 D2), because the
-- outbox keeps only the latest save per record:
--   org_id, site_id, check_in_at, check_in_lat, check_in_lng      required
--   check_in_reason                                               optional
--   check_out_at, check_out_lat, check_out_lng                    all three, or none
--   check_out_reason                                              optional
-- org_id is needed for the composite key to sites.

-- ------------------------------------------------------------- replay matcher
-- Does the caller already hold exactly this visit? SECURITY DEFINER so a phone that
-- missed the answer still hears "accepted" after losing the site (ADR-033 D5). It
-- compares only the caller's own visit and returns a boolean. A push without a
-- check-out matches a visit that has one since: replaying the check-in after the
-- check-out is not a conflict (ADR-021 D6).

create function public.site_visit_matches(
  p_id               uuid,
  p_site_id          uuid,
  p_check_in_at      timestamptz,
  p_check_in_lat     numeric,
  p_check_in_lng     numeric,
  p_check_in_reason  text,
  p_has_check_out    boolean,
  p_check_out_at     timestamptz,
  p_check_out_lat    numeric,
  p_check_out_lng    numeric,
  p_check_out_reason text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.site_visits v
    where v.id = p_id
      and v.user_id = auth.uid()
      and v.site_id = p_site_id
      and (v.check_in_at, v.check_in_lat, v.check_in_lng, v.check_in_reason)
          is not distinct from (p_check_in_at, p_check_in_lat, p_check_in_lng, p_check_in_reason)
      and (not p_has_check_out
           or (v.check_out_at, v.check_out_lat, v.check_out_lng, v.check_out_reason)
              is not distinct from (p_check_out_at, p_check_out_lat, p_check_out_lng, p_check_out_reason))
  );
$$;

revoke all on function public.site_visit_matches(uuid, uuid, timestamptz, numeric, numeric, text, boolean, timestamptz, numeric, numeric, text)
  from public, anon;
grant execute on function public.site_visit_matches(uuid, uuid, timestamptz, numeric, numeric, text, boolean, timestamptz, numeric, numeric, text)
  to authenticated;

-- ------------------------------------------------------------------- handler

create function public.sync_site_visits(p_record_id uuid, p_payload jsonb)
returns public.sync_result
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org_id     uuid;
  v_site_id    uuid;
  v_in_at      timestamptz;
  v_in_lat     numeric;
  v_in_lng     numeric;
  v_in_reason  text;
  v_has_out    boolean;
  v_out_at     timestamptz;
  v_out_lat    numeric;
  v_out_lng    numeric;
  v_out_reason text;
  v_bad_field  text;
  v_visit      record;
  v_rows       integer;
begin
  -- 1. The payload. Each field has one JSON type; a value that does not cast raises 22P02.
  if jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'the payload must be an object' using errcode = '22023';
  end if;

  select f.key into v_bad_field
    from (values ('org_id',           array['string']),
                 ('site_id',          array['string']),
                 ('check_in_at',      array['string']),
                 ('check_in_lat',     array['number']),
                 ('check_in_lng',     array['number']),
                 ('check_in_reason',  array['string', 'null']),
                 ('check_out_at',     array['string', 'null']),
                 ('check_out_lat',    array['number', 'null']),
                 ('check_out_lng',    array['number', 'null']),
                 ('check_out_reason', array['string', 'null'])) as f (key, types)
   where coalesce(jsonb_typeof(p_payload -> f.key), 'null') <> all (f.types)
   limit 1;
  if v_bad_field is not null then
    raise exception 'payload field % is missing or has the wrong type', v_bad_field
      using errcode = '22023';
  end if;

  -- Times are ISO 8601 and nothing else: the cast alone would take 'now' or 'today'
  -- and read them on the server's clock, not the phone's (ADR-021 D7).
  if (p_payload ->> 'check_in_at') !~ '^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}'
     or (p_payload ? 'check_out_at' and jsonb_typeof(p_payload -> 'check_out_at') = 'string'
         and (p_payload ->> 'check_out_at') !~ '^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}') then
    raise exception 'check_in_at and check_out_at must be ISO 8601 times' using errcode = '22P02';
  end if;

  v_org_id     := (p_payload ->> 'org_id')::uuid;
  v_site_id    := (p_payload ->> 'site_id')::uuid;
  v_in_at      := (p_payload ->> 'check_in_at')::timestamptz;
  v_in_lat     := (p_payload ->> 'check_in_lat')::numeric(9,6);
  v_in_lng     := (p_payload ->> 'check_in_lng')::numeric(9,6);
  v_in_reason  := p_payload ->> 'check_in_reason';
  v_out_at     := (p_payload ->> 'check_out_at')::timestamptz;
  v_out_lat    := (p_payload ->> 'check_out_lat')::numeric(9,6);
  v_out_lng    := (p_payload ->> 'check_out_lng')::numeric(9,6);
  v_out_reason := p_payload ->> 'check_out_reason';

  -- A check-out leg is the time and the place together, or not there at all.
  v_has_out := v_out_at is not null or v_out_lat is not null or v_out_lng is not null;
  if v_has_out and (v_out_at is null or v_out_lat is null or v_out_lng is null) then
    raise exception 'a check-out needs check_out_at, check_out_lat and check_out_lng' using errcode = '22023';
  end if;
  if not v_has_out and v_out_reason is not null then
    raise exception 'check_out_reason without a check-out' using errcode = '22023';
  end if;

  -- 2. A replay of the caller's own visit, answered before any permission check.
  if public.site_visit_matches(p_record_id, v_site_id, v_in_at, v_in_lat, v_in_lng, v_in_reason,
                               v_has_out, v_out_at, v_out_lat, v_out_lng, v_out_reason) then
    return ('accepted', null)::public.sync_result;
  end if;

  -- 3. Insert the check-in, or compare with the visit already there, under the caller's RLS.
  select v.user_id, v.site_id, v.check_in_at, v.check_in_lat, v.check_in_lng, v.check_in_reason,
         v.check_out_at
    into v_visit
    from public.site_visits v
   where v.id = p_record_id;

  if not found then
    begin
      insert into public.site_visits
        (id, org_id, site_id, check_in_at, check_in_lat, check_in_lng, check_in_reason)
      values
        (p_record_id, v_org_id, v_site_id, v_in_at, v_in_lat, v_in_lng, v_in_reason);
    exception when foreign_key_violation then
      -- Sites never sync from a phone, so this is not a parent on its way: the
      -- site is not in that organisation. Retrying cannot help (ADR-033 D4).
      raise exception 'site % is not in organisation %', v_site_id, v_org_id
        using errcode = '22023';
    end;
  else
    if v_visit.user_id is distinct from auth.uid() then
      raise exception 'not permitted to change visit %', p_record_id using errcode = '42501';
    end if;
    if v_visit.site_id <> v_site_id
       or (v_visit.check_in_at, v_visit.check_in_lat, v_visit.check_in_lng, v_visit.check_in_reason)
          is distinct from (v_in_at, v_in_lat, v_in_lng, v_in_reason) then
      return ('conflict', 'different_visit')::public.sync_result;
    end if;
    if not v_has_out then
      return ('accepted', null)::public.sync_result;
    end if;
    if v_visit.check_out_at is not null then
      -- An equal check-out matched above, so this one differs.
      return ('conflict', 'checked_out')::public.sync_result;
    end if;
  end if;

  if not v_has_out then
    return ('accepted', null)::public.sync_result;
  end if;

  -- 4. The check-out leg, once. The policy matches only the caller's open visit on a
  --    site they can still record on, and the trigger stamps the geofence.
  update public.site_visits
     set check_out_at     = v_out_at,
         check_out_lat    = v_out_lat,
         check_out_lng    = v_out_lng,
         check_out_reason = v_out_reason
   where id = p_record_id;
  get diagnostics v_rows = row_count;

  if v_rows = 1 then
    return ('accepted', null)::public.sync_result;
  end if;
  -- 0 rows is never "accepted": the caller can no longer record on the site.
  raise exception 'not permitted to check out visit %', p_record_id using errcode = '42501';
end;
$$;

revoke all on function public.sync_site_visits(uuid, jsonb) from public, anon;
grant execute on function public.sync_site_visits(uuid, jsonb) to authenticated;
