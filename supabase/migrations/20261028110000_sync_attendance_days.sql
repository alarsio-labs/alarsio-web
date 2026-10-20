-- Attendance & Site Presence: sync_attendance_days, the handler sync_push calls for
-- a day. Issue #28 PR 3b. Contract: #13, ADR-014. Decisions: ADR-021 D5, ADR-033.
--
-- SECURITY INVOKER (#13): every write runs under the caller's RLS, and the existing
-- trigger keeps the date rule, so web and phone follow one rule. This function reads
-- the payload, answers a replay, and opens the day or accepts the one already there.
-- A day push never changes a day. sync_push turns what it raises into a verdict:
--   22023 / 22P02  bad payload, a site outside its organisation  -> rejected / invalid_input
--   23514          a date beyond UTC today + 1                    -> rejected / invalid_input
--   42501          not permitted (RLS, cannot record on the site) -> rejected / permission_denied
--   23505          id taken by a day the caller cannot see        -> conflict / duplicate
-- and it returns one conflict itself: 'different_day' (this id holds another site or
-- date).
--
-- The payload is the whole day as the phone holds it (ADR-033 D2):
--   org_id, site_id, attendance_date                              required
-- org_id is needed for the composite key to sites.

-- ------------------------------------------------------------- replay matcher
-- Does the caller already hold exactly this day? SECURITY DEFINER so a phone that
-- missed the answer still hears "accepted" after losing the site (ADR-033 D5). It
-- compares only a day the caller recorded and returns a boolean.

create function public.attendance_day_matches(
  p_id              uuid,
  p_site_id         uuid,
  p_attendance_date date
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.attendance_days d
    where d.id = p_id
      and d.recorded_by = auth.uid()
      and d.site_id = p_site_id
      and d.attendance_date = p_attendance_date
  );
$$;

revoke all on function public.attendance_day_matches(uuid, uuid, date)
  from public, anon;
grant execute on function public.attendance_day_matches(uuid, uuid, date)
  to authenticated;

-- ------------------------------------------------------------------- handler

create function public.sync_attendance_days(p_record_id uuid, p_payload jsonb)
returns public.sync_result
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org_id    uuid;
  v_site_id   uuid;
  v_date      date;
  v_bad_field text;
  v_day       record;
begin
  -- 1. The payload. Each field has one JSON type; a value that does not cast raises 22P02.
  if jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'the payload must be an object' using errcode = '22023';
  end if;

  select f.key into v_bad_field
    from (values ('org_id',          array['string']),
                 ('site_id',         array['string']),
                 ('attendance_date', array['string'])) as f (key, types)
   where coalesce(jsonb_typeof(p_payload -> f.key), 'null') <> all (f.types)
   limit 1;
  if v_bad_field is not null then
    raise exception 'payload field % is missing or has the wrong type', v_bad_field
      using errcode = '22023';
  end if;

  -- The date is YYYY-MM-DD and nothing else: the cast alone would take 'yesterday',
  -- 'today' or 'epoch' and read them on the server's clock, not the phone's.
  if (p_payload ->> 'attendance_date') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'attendance_date must be YYYY-MM-DD' using errcode = '22P02';
  end if;

  v_org_id  := (p_payload ->> 'org_id')::uuid;
  v_site_id := (p_payload ->> 'site_id')::uuid;
  v_date    := (p_payload ->> 'attendance_date')::date;

  -- 2. A replay of the caller's own day, answered before any permission check.
  if public.attendance_day_matches(p_record_id, v_site_id, v_date) then
    return ('accepted', null)::public.sync_result;
  end if;

  -- 3. The day already under this id, under the caller's RLS.
  select d.site_id, d.attendance_date
    into v_day
    from public.attendance_days d
   where d.id = p_record_id;

  if found then
    if v_day.site_id <> v_site_id or v_day.attendance_date <> v_date then
      return ('conflict', 'different_day')::public.sync_result;
    end if;
    return ('accepted', null)::public.sync_result;
  end if;

  -- 4. A second phone opened the same site and date under its own id (ADR-021 D5).
  --    The day is there, approved or not, and this push changes nothing.
  if exists (select 1
               from public.attendance_days d
              where d.org_id = v_org_id
                and d.site_id = v_site_id
                and d.attendance_date = v_date)
     and public.can_record_on_site(v_site_id) then
    return ('accepted', null)::public.sync_result;
  end if;

  -- 5. Open the day. The policy checks the caller can record on the site, and the
  --    trigger keeps the date rule.
  begin
    insert into public.attendance_days (id, org_id, site_id, attendance_date)
    values (p_record_id, v_org_id, v_site_id, v_date);
  exception when foreign_key_violation then
    -- Sites never sync from a phone, so this is not a parent on its way: the
    -- site is not in that organisation. Retrying cannot help (ADR-033 D4).
    raise exception 'site % is not in organisation %', v_site_id, v_org_id
      using errcode = '22023';
  end;

  return ('accepted', null)::public.sync_result;
end;
$$;

revoke all on function public.sync_attendance_days(uuid, jsonb) from public, anon;
grant execute on function public.sync_attendance_days(uuid, jsonb) to authenticated;
