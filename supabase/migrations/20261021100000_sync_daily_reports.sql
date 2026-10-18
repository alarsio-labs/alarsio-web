-- Daily Reporting: sync_daily_reports, the handler sync_push calls for a report.
-- Owner: Anuradha. Issue #63. Contract: #13, ADR-014. Decisions: ADR-013, ADR-021.
--
-- SECURITY INVOKER, as agreed on #13: every write runs under the caller's RLS,
-- and the #35 guard triggers decide the lifecycle (submit stamp, edit reason,
-- revision row, no un-submit). This function only reads the payload, answers a
-- replay, and picks insert or update. sync_push turns what it raises into a
-- verdict:
--   22023 / 22P02  bad payload, a site outside its organisation  -> rejected / invalid_input
--   23514          incomplete submit, text over its limit         -> rejected / invalid_input
--   42501          not permitted (RLS, not the author)            -> rejected / permission_denied
--   55000          submitted back to draft                        -> rejected / invalid_state
--   23505          id or site-day already taken by another report -> conflict / duplicate
-- and it returns two conflicts itself: 'reviewed' (the server's version is
-- final) and 'different_report' (this id already holds another site or day).
--
-- The payload is the whole report, as the outbox keeps only the latest save:
--   org_id, site_id, report_date, status    required
--   headcount, work_done, blockers, serious_blocker, safety_incident,
--   next_day_plan, edit_reason              optional (absent is null, or false for the flags)
-- org_id is needed for the composite key to sites, which this module does not
-- read itself. edit_reason is write-only and never compared (#13).

-- ------------------------------------------------------------- replay matcher
-- Is this exactly what the caller already holds on the server? SECURITY DEFINER
-- so a phone that missed the first answer still hears "accepted" after losing
-- access to the site (as Materials does, ADR-017). It compares only the
-- caller's own report and returns a boolean, so it reveals nothing about anyone
-- else's. A reviewed report matches its submitted content: the server holds
-- exactly what the phone sent, a manager has only marked it since.

create function public.daily_report_matches(
  p_id              uuid,
  p_site_id         uuid,
  p_report_date     date,
  p_status          text,
  p_headcount       integer,
  p_work_done       text,
  p_blockers        text,
  p_serious_blocker boolean,
  p_safety_incident boolean,
  p_next_day_plan   text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.daily_reports r
    where r.id = p_id
      and r.author_id = auth.uid()
      and r.site_id = p_site_id
      and r.report_date = p_report_date
      and (r.status = p_status or (r.status = 'reviewed' and p_status = 'submitted'))
      and (r.headcount, r.work_done, r.blockers, r.serious_blocker,
           r.safety_incident, r.next_day_plan)
          is not distinct from
          (p_headcount, p_work_done, p_blockers, p_serious_blocker,
           p_safety_incident, p_next_day_plan)
  );
$$;

revoke all on function public.daily_report_matches(uuid, uuid, date, text, integer, text, text, boolean, boolean, text)
  from public, anon;
-- The handler runs as the caller, so the caller needs to execute this.
grant execute on function public.daily_report_matches(uuid, uuid, date, text, integer, text, text, boolean, boolean, text)
  to authenticated;

-- ------------------------------------------------------------------- handler

create function public.sync_daily_reports(p_record_id uuid, p_payload jsonb)
returns public.sync_result
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org_id          uuid;
  v_site_id         uuid;
  v_report_date     date;
  v_status          text;
  v_headcount       integer;
  v_work_done       text;
  v_blockers        text;
  v_serious_blocker boolean;
  v_safety_incident boolean;
  v_next_day_plan   text;
  v_edit_reason     text;
  v_bad_field       text;
  v_existing        record;
  v_rows            integer;
begin
  -- 1. The payload. Each field has one JSON type, so "12" is not a headcount
  --    and "yes" is not a flag. A value that does not cast raises 22P02.
  if jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'the payload must be an object' using errcode = '22023';
  end if;

  select f.key into v_bad_field
    from (values ('org_id',          array['string']),
                 ('site_id',         array['string']),
                 ('report_date',     array['string']),
                 ('status',          array['string']),
                 ('headcount',       array['number', 'null']),
                 ('work_done',       array['string', 'null']),
                 ('blockers',        array['string', 'null']),
                 ('serious_blocker', array['boolean', 'null']),
                 ('safety_incident', array['boolean', 'null']),
                 ('next_day_plan',   array['string', 'null']),
                 ('edit_reason',     array['string', 'null'])) as f (key, types)
   where coalesce(jsonb_typeof(p_payload -> f.key), 'null') <> all (f.types)
   limit 1;
  if v_bad_field is not null then
    raise exception 'payload field % is missing or has the wrong type', v_bad_field
      using errcode = '22023';
  end if;

  v_org_id          := (p_payload ->> 'org_id')::uuid;
  v_site_id         := (p_payload ->> 'site_id')::uuid;
  v_report_date     := (p_payload ->> 'report_date')::date;
  v_status          := p_payload ->> 'status';
  v_headcount       := (p_payload ->> 'headcount')::integer;
  v_work_done       := p_payload ->> 'work_done';
  v_blockers        := p_payload ->> 'blockers';
  v_serious_blocker := coalesce((p_payload ->> 'serious_blocker')::boolean, false);
  v_safety_incident := coalesce((p_payload ->> 'safety_incident')::boolean, false);
  v_next_day_plan   := p_payload ->> 'next_day_plan';
  v_edit_reason     := p_payload ->> 'edit_reason';

  -- A phone files and submits; only review_daily_report() reviews.
  if v_status not in ('draft', 'submitted') then
    raise exception 'status must be draft or submitted' using errcode = '22023';
  end if;

  -- 2. A replay of the caller's own report, answered before any permission check.
  if public.daily_report_matches(p_record_id, v_site_id, v_report_date, v_status,
                                 v_headcount, v_work_done, v_blockers,
                                 v_serious_blocker, v_safety_incident, v_next_day_plan) then
    return ('accepted', null)::public.sync_result;
  end if;

  -- 3. Insert or update, under the caller's RLS.
  select r.site_id, r.report_date, r.status
    into v_existing
    from public.daily_reports r
   where r.id = p_record_id;

  if not found then
    begin
      insert into public.daily_reports
        (id, org_id, site_id, report_date, status, headcount, work_done,
         blockers, serious_blocker, safety_incident, next_day_plan)
      values
        (p_record_id, v_org_id, v_site_id, v_report_date, v_status, v_headcount, v_work_done,
         v_blockers, v_serious_blocker, v_safety_incident, v_next_day_plan)
      on conflict (id) do nothing;
      get diagnostics v_rows = row_count;
    exception when foreign_key_violation then
      -- Sites never sync from a phone, so this is not a parent still on its
      -- way: the site is not in that organisation. Retrying cannot help.
      raise exception 'site % is not in organisation %', v_site_id, v_org_id
        using errcode = '22023';
    end;

    if v_rows = 1 then
      return ('accepted', null)::public.sync_result;
    end if;
    -- The id is taken by a report the caller cannot see, or by a push that
    -- won a race with different content.
    raise exception 'report % already exists', p_record_id using errcode = '23505';
  end if;

  if v_existing.site_id <> v_site_id or v_existing.report_date <> v_report_date then
    return ('conflict', 'different_report')::public.sync_result;
  end if;

  if v_existing.status = 'reviewed' then
    return ('conflict', 'reviewed')::public.sync_result;
  end if;

  update public.daily_reports
     set status          = v_status,
         headcount       = v_headcount,
         work_done       = v_work_done,
         blockers        = v_blockers,
         serious_blocker = v_serious_blocker,
         safety_incident = v_safety_incident,
         next_day_plan   = v_next_day_plan,
         edit_reason     = v_edit_reason
   where id = p_record_id;
  get diagnostics v_rows = row_count;

  if v_rows = 1 then
    return ('accepted', null)::public.sync_result;
  end if;

  -- 0 rows is never "accepted" (Nikhil's review of #35). RLS hid the row: it
  -- was reviewed after we read it, or the caller is not its author or can no
  -- longer record on its site.
  if exists (select 1 from public.daily_reports r
              where r.id = p_record_id and r.status = 'reviewed') then
    return ('conflict', 'reviewed')::public.sync_result;
  end if;
  raise exception 'not permitted to change report %', p_record_id using errcode = '42501';
end;
$$;

revoke all on function public.sync_daily_reports(uuid, jsonb) from public, anon;
grant execute on function public.sync_daily_reports(uuid, jsonb) to authenticated;
