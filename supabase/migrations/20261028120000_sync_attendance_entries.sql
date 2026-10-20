-- Attendance & Site Presence: sync_attendance_entries, the handler sync_push calls for
-- one worker's mark on one day. Issue #28 PR 3b. Contract: #13, ADR-014. Decisions:
-- ADR-021 D5, ADR-030 D6, ADR-033 D1/D3/D4/D5/D6.
--
-- SECURITY INVOKER (#13): every write runs under the caller's RLS, and the existing
-- triggers keep the roster rule and the approved-day lock, so web and phone follow one
-- rule. This function reads the payload, answers a replay, and inserts the entry or
-- updates its status, overtime and note. sync_push turns what it raises into a verdict:
--   22023 / 22P02  bad payload, a worker outside its organisation  -> rejected / invalid_input
--   23514          unknown status, overtime out of range or on an
--                  absent day, a worker not rostered at the site   -> rejected / invalid_input
--   42501          not permitted (RLS)                             -> rejected / permission_denied
--   23503          the day has not arrived yet                     -> retryable_error / missing_parent
--   23505          id or worker-day taken by an entry the caller
--                  cannot record on                                -> conflict / duplicate
-- and it returns three conflicts itself: 'different_entry' (this id holds another site,
-- date or worker), 'duplicate' (a second phone marked this worker and day differently;
-- the first writer wins, ADR-033 D3) and 'locked' (the day is approved: an edit the
-- policy hides, ADR-033 D6, or a late insert the lock trigger refuses with PS409,
-- caught here until sync_push maps it, ADR-033 D1).
--
-- The payload is the whole entry as the phone holds it:
--   org_id, site_id, attendance_date, worker_id, status, overtime_hours   required
--   note                                                                  optional
-- org_id is needed for the composite keys to the day and to workers.

-- ------------------------------------------------------------- replay matcher
-- Does the caller already hold exactly this entry? SECURITY DEFINER so a phone that
-- missed the answer still hears "accepted" after losing the site (ADR-033 D5). It
-- compares only an entry the caller recorded and returns a boolean. An approved day
-- still matches: the server holds exactly what the phone sent.
--
-- Unlike a visit, an entry can be changed by someone else after the caller wrote it
-- (another supervisor on the site, or an approved correction), and recorded_by does
-- not move. So the matcher only answers for an entry nobody has touched since it was
-- written (updated_at = created_at): otherwise a caller who lost the site could call
-- it through /rpc with guessed values and learn what others wrote. The cost: the
-- replay of the caller's own unanswered edit, after losing the site, is
-- rejected / permission_denied instead of accepted (ADR-033 D5).

create function public.attendance_entry_matches(
  p_id              uuid,
  p_site_id         uuid,
  p_attendance_date date,
  p_worker_id       uuid,
  p_status          text,
  p_overtime_hours  numeric,
  p_note            text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.attendance_entries e
    where e.id = p_id
      and e.recorded_by = auth.uid()
      and e.updated_at = e.created_at
      and e.site_id = p_site_id
      and e.attendance_date = p_attendance_date
      and e.worker_id = p_worker_id
      and (e.status, e.overtime_hours, e.note)
          is not distinct from (p_status, p_overtime_hours, p_note)
  );
$$;

revoke all on function public.attendance_entry_matches(uuid, uuid, date, uuid, text, numeric, text)
  from public, anon;
grant execute on function public.attendance_entry_matches(uuid, uuid, date, uuid, text, numeric, text)
  to authenticated;

-- ------------------------------------------------------------------- handler

create function public.sync_attendance_entries(p_record_id uuid, p_payload jsonb)
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
  v_bad_field  text;
  v_entry      record;
  v_rows       integer;
  v_constraint text;
begin
  -- 1. The payload. Each field has one JSON type; a value that does not cast raises 22P02.
  if jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'the payload must be an object' using errcode = '22023';
  end if;

  select f.key into v_bad_field
    from (values ('org_id',          array['string']),
                 ('site_id',         array['string']),
                 ('attendance_date', array['string']),
                 ('worker_id',       array['string']),
                 ('status',          array['string']),
                 ('overtime_hours',  array['number']),
                 ('note',            array['string', 'null'])) as f (key, types)
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
  v_status    := p_payload ->> 'status';
  v_overtime  := (p_payload ->> 'overtime_hours')::numeric(4,2);
  v_note      := p_payload ->> 'note';

  -- 2. A replay of the caller's own entry, answered before any permission check.
  if public.attendance_entry_matches(p_record_id, v_site_id, v_date, v_worker_id,
                                     v_status, v_overtime, v_note) then
    return ('accepted', null)::public.sync_result;
  end if;

  -- 3. The same id, under the caller's RLS: compare, then edit.
  select e.site_id, e.attendance_date, e.worker_id, e.status, e.overtime_hours, e.note
    into v_entry
    from public.attendance_entries e
   where e.id = p_record_id;

  if found then
    if v_entry.site_id <> v_site_id
       or v_entry.attendance_date <> v_date
       or v_entry.worker_id <> v_worker_id then
      return ('conflict', 'different_entry')::public.sync_result;
    end if;
    if (v_entry.status, v_entry.overtime_hours, v_entry.note)
       is not distinct from (v_status, v_overtime, v_note) then
      return ('accepted', null)::public.sync_result;
    end if;

    -- The policy matches only an entry on a site the caller can record on, on a day
    -- that is not approved.
    begin
      update public.attendance_entries
         set status         = v_status,
             overtime_hours = v_overtime,
             note           = v_note
       where id = p_record_id;
      get diagnostics v_rows = row_count;
    exception when sqlstate 'PS409' then
      return ('conflict', 'locked')::public.sync_result;
    end;

    if v_rows = 1 then
      return ('accepted', null)::public.sync_result;
    end if;
    -- 0 rows is never "accepted" (ADR-022 H4). An approved day is a lock, not a
    -- refusal: a stale phone cannot overwrite it (ADR-033 D6).
    if exists (select 1
                 from public.attendance_days d
                where d.site_id = v_site_id
                  and d.attendance_date = v_date
                  and d.status = 'approved') then
      return ('conflict', 'locked')::public.sync_result;
    end if;
    raise exception 'not permitted to change entry %', p_record_id using errcode = '42501';
  end if;

  -- 4. Another id for the same worker and day: a second phone (ADR-033 D3). Same
  --    values is nobody disagreeing; different values, the first writer wins.
  select e.status, e.overtime_hours, e.note
    into v_entry
    from public.attendance_entries e
   where e.site_id = v_site_id
     and e.attendance_date = v_date
     and e.worker_id = v_worker_id;

  if found and public.can_record_on_site(v_site_id) then
    if (v_entry.status, v_entry.overtime_hours, v_entry.note)
       is not distinct from (v_status, v_overtime, v_note) then
      return ('accepted', null)::public.sync_result;
    end if;
    return ('conflict', 'duplicate')::public.sync_result;
  end if;

  -- 5. A new entry. The roster trigger refuses a worker not on the site (23514) and the
  --    lock trigger a late entry on an approved day (PS409). Catching PS409 here rolls
  --    the insert back (ADR-033 D1).
  begin
    insert into public.attendance_entries
      (id, org_id, site_id, attendance_date, worker_id, status, overtime_hours, note)
    values
      (p_record_id, v_org_id, v_site_id, v_date, v_worker_id, v_status, v_overtime, v_note);
  exception
    when sqlstate 'PS409' then
      return ('conflict', 'locked')::public.sync_result;
    when foreign_key_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'attendance_entries_worker_fk' then
        -- Workers never sync from a phone, so this is not a parent on its way: the
        -- worker is not in that organisation. Retrying cannot help (ADR-033 D4).
        raise exception 'worker % is not in organisation %', v_worker_id, v_org_id
          using errcode = '22023';
      end if;
      -- The day can still arrive later in the same outbox: retryable.
      raise;
  end;

  return ('accepted', null)::public.sync_result;
end;
$$;

revoke all on function public.sync_attendance_entries(uuid, jsonb) from public, anon;
grant execute on function public.sync_attendance_entries(uuid, jsonb) to authenticated;
