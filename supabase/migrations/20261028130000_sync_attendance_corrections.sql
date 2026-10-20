-- Attendance & Site Presence: sync_attendance_corrections, the handler sync_push calls
-- for a proposed correction. Issue #28 PR 3b. Contract: #13, ADR-014. Decisions:
-- ADR-030 D1/D3/D6, ADR-033 D1/D4/D5.
--
-- SECURITY INVOKER (#13): every write runs under the caller's RLS, and the existing
-- stamp trigger keeps the rules, so web and phone follow one rule. This function reads
-- the payload, answers a replay, and inserts the correction. A correction is never
-- updated from a phone: the review stays on the web. sync_push turns what it raises
-- into a verdict:
--   22023 / 22P02  bad payload, a site outside its organisation  -> rejected / invalid_input
--   23514          blank reason, a correction that changes nothing -> rejected / invalid_input
--   42501          not permitted (RLS, cannot record on the site) -> rejected / permission_denied
--   55000          the day is not approved                        -> rejected / invalid_state
--   23505          a pending correction for the entry, or the id
--                  taken by a correction the caller cannot see    -> conflict / duplicate
--   23503          the entry has not synced yet                   -> retryable_error / missing_parent
-- and it returns two conflicts itself: 'locked' (PS409, ADR-033 D1) and
-- 'different_correction' (this id holds another correction).
--
-- The payload is the whole correction as the phone holds it:
--   org_id, site_id, attendance_date, worker_id, new_status,
--   new_overtime_hours, reason                                   required
--   new_note                                                     optional
-- org_id is needed for the composite key to sites. The old values are stamped by the
-- server from the entry, never sent.

-- ------------------------------------------------------------- replay matcher
-- Does the caller already hold exactly this correction? SECURITY DEFINER so a phone
-- that missed the answer still hears "accepted" after losing the site (ADR-033 D5). It
-- compares only the caller's own correction and returns a boolean. A correction that
-- was reviewed since still matches: the server holds exactly what the phone sent, a
-- reviewer has only decided on it (AC 32).

create function public.attendance_correction_matches(
  p_id                 uuid,
  p_site_id            uuid,
  p_attendance_date    date,
  p_worker_id          uuid,
  p_new_status         text,
  p_new_overtime_hours numeric,
  p_new_note           text,
  p_reason             text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.attendance_corrections c
    where c.id = p_id
      and c.proposed_by = auth.uid()
      and (c.site_id, c.attendance_date, c.worker_id,
           c.new_status, c.new_overtime_hours, c.new_note, c.reason)
          is not distinct from
          (p_site_id, p_attendance_date, p_worker_id,
           p_new_status, p_new_overtime_hours, p_new_note, p_reason)
  );
$$;

revoke all on function public.attendance_correction_matches(uuid, uuid, date, uuid, text, numeric, text, text)
  from public, anon;
grant execute on function public.attendance_correction_matches(uuid, uuid, date, uuid, text, numeric, text, text)
  to authenticated;

-- ------------------------------------------------------------------- handler

create function public.sync_attendance_corrections(p_record_id uuid, p_payload jsonb)
returns public.sync_result
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org_id     uuid;
  v_site_id    uuid;
  v_date       date;
  v_worker_id  uuid;
  v_status     text;
  v_overtime   numeric;
  v_note       text;
  v_reason     text;
  v_bad_field  text;
  v_constraint text;
begin
  -- 1. The payload. Each field has one JSON type; a value that does not cast raises 22P02.
  if jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'the payload must be an object' using errcode = '22023';
  end if;

  select f.key into v_bad_field
    from (values ('org_id',             array['string']),
                 ('site_id',            array['string']),
                 ('attendance_date',    array['string']),
                 ('worker_id',          array['string']),
                 ('new_status',         array['string']),
                 ('new_overtime_hours', array['number']),
                 ('new_note',           array['string', 'null']),
                 ('reason',             array['string'])) as f (key, types)
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

  v_org_id    := (p_payload ->> 'org_id')::uuid;
  v_site_id   := (p_payload ->> 'site_id')::uuid;
  v_date      := (p_payload ->> 'attendance_date')::date;
  v_worker_id := (p_payload ->> 'worker_id')::uuid;
  v_status    := p_payload ->> 'new_status';
  v_overtime  := (p_payload ->> 'new_overtime_hours')::numeric(4,2);
  v_note      := p_payload ->> 'new_note';
  v_reason    := p_payload ->> 'reason';

  -- 2. A replay of the caller's own correction, answered before any permission check,
  --    whatever its review status.
  if public.attendance_correction_matches(p_record_id, v_site_id, v_date, v_worker_id,
                                          v_status, v_overtime, v_note, v_reason) then
    return ('accepted', null)::public.sync_result;
  end if;

  -- 3. This id already holds another correction the caller can see. A correction is
  --    never changed from a phone, so this is a conflict, not an update.
  if exists (select 1 from public.attendance_corrections c where c.id = p_record_id) then
    return ('conflict', 'different_correction')::public.sync_result;
  end if;

  -- 4. Insert under the caller's RLS. The stamp trigger refuses a caller who may not
  --    record on the site (42501), an entry not there yet (23503) and a day that is
  --    not approved (55000), and stamps the old values.
  begin
    insert into public.attendance_corrections
      (id, org_id, site_id, attendance_date, worker_id,
       new_status, new_overtime_hours, new_note, reason)
    values
      (p_record_id, v_org_id, v_site_id, v_date, v_worker_id,
       v_status, v_overtime, v_note, v_reason);
  exception
    when sqlstate 'PS409' then
      -- ADR-033 D1: sync_push does not map PS409 yet. Nothing raises it on this table
      -- today; the catch is defensive and goes once the router clause lands.
      return ('conflict', 'locked')::public.sync_result;
    when foreign_key_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'attendance_corrections_site_fk' then
        -- Sites never sync from a phone, so this is not a parent on its way: the
        -- site is not in that organisation. Retrying cannot help (ADR-033 D4).
        raise exception 'site % is not in organisation %', v_site_id, v_org_id
          using errcode = '22023';
      end if;
      -- The entry has not synced yet. It can arrive later in the same outbox, so
      -- sync_push answers missing_parent and the phone retries.
      raise;
  end;

  return ('accepted', null)::public.sync_result;
end;
$$;

revoke all on function public.sync_attendance_corrections(uuid, jsonb) from public, anon;
grant execute on function public.sync_attendance_corrections(uuid, jsonb) to authenticated;
