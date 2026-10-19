-- Daily Reporting: the triggers that make "a submitted report cannot be
-- changed quietly" true for every writer — web, phone and sync handler alike.
-- Owner: Anuradha. Issue #29. Decisions D4-D8 in ADR-013.
--
--   daily_reports            before insert  date guard, server-stamped submit
--   daily_reports            before update  lifecycle, immutable keys, revisions
--   report_photos            before insert  at most 10 photos per report (D3)
--   can_attach_report_photo  who may attach a photo; the photo policy (next
--                            migration) and the limit guard both call it
--   daily_report_revisions   before update / delete / truncate  append-only
--
-- Error codes, chosen so Offline Sync (#13) can map them to a verdict:
--   22023  bad input (future date, missing edit reason)   -> rejected
--   23514  over the photo limit                            -> rejected
--   42501  not permitted (key change, revision mutation)   -> rejected
--   55000  invalid transition (reviewed is final, no un-submit) -> rejected (invalid_state, in sync_push)
--   28000  no signed-in user for an edit that needs one
--
-- Content columns are what a supervisor reports: headcount, work_done,
-- blockers, serious_blocker, safety_incident, next_day_plan. An edit after
-- submit is any change to one of them, and its revision keeps the old values.

-- --------------------------------------------------------------- insert

create function public.daily_reports_guard_insert()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- No report for the future. This reads nothing from another module, so the
  -- limit is on the UTC date: the furthest-ahead time zone is UTC+14, so the
  -- local "today" is at most UTC today + 1, and the local tomorrow (one day of
  -- slack for a phone clock a little ahead) at most UTC today + 2.
  if new.report_date > (now() at time zone 'utc')::date + 2 then
    raise exception 'report date % is in the future', new.report_date
      using errcode = '22023';
  end if;

  -- A report may arrive already submitted (one push for a report filed
  -- offline). The stamp is the server's, never the client's.
  if new.status = 'submitted' then
    new.submitted_at := now();
    new.submitted_by := coalesce(auth.uid(), new.author_id);
  else
    new.submitted_at := null;
    new.submitted_by := null;
  end if;

  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;

-- --------------------------------------------------------------- update
-- SECURITY DEFINER because it writes daily_report_revisions, which no client
-- may write. It trusts nothing from the caller except auth.uid() and the row.

create function public.daily_reports_guard_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_content_changed boolean;
  v_next_no         integer;
begin
  if new.id          is distinct from old.id
  or new.org_id      is distinct from old.org_id
  or new.site_id     is distinct from old.site_id
  or new.report_date is distinct from old.report_date
  or new.author_id   is distinct from old.author_id
  or new.created_at  is distinct from old.created_at then
    raise exception 'a report''s id, organisation, site, date and author cannot change'
      using errcode = '42501';
  end if;

  -- D5: a reviewed report is final, so a stale phone cannot overwrite it.
  if old.status = 'reviewed' then
    raise exception 'report % is reviewed and cannot be changed', old.id
      using errcode = '55000';
  end if;

  if old.status = 'submitted' and new.status = 'draft' then
    raise exception 'a submitted report cannot go back to draft'
      using errcode = '55000';
  end if;

  if old.status = 'draft' and new.status = 'reviewed' then
    raise exception 'a draft must be submitted before it is reviewed'
      using errcode = '55000';
  end if;

  v_content_changed :=
    (new.headcount, new.work_done, new.blockers, new.serious_blocker,
     new.safety_incident, new.next_day_plan)
    is distinct from
    (old.headcount, old.work_done, old.blockers, old.serious_blocker,
     old.safety_incident, old.next_day_plan);

  if old.status = 'draft' then
    -- A draft is the author's own working copy: no history (D8).
    if new.status = 'submitted' then
      new.submitted_at := now();
      new.submitted_by := coalesce(auth.uid(), old.author_id);
    else
      new.submitted_at := null;
      new.submitted_by := null;
    end if;
    new.reviewed_at := null;
    new.reviewed_by := null;
    new.review_note := null;

  elsif new.status = 'reviewed' then
    -- Only review_daily_report() gets here: clients cannot set this status.
    -- A review marks a report; it never changes what was reported (D4).
    if v_content_changed then
      raise exception 'a review cannot change the report''s content'
        using errcode = '55000';
    end if;
    new.submitted_at := old.submitted_at;
    new.submitted_by := old.submitted_by;

  else
    -- submitted -> submitted. The submit stamp and the review fields stay.
    new.submitted_at := old.submitted_at;
    new.submitted_by := old.submitted_by;
    new.reviewed_at  := null;
    new.reviewed_by  := null;
    new.review_note  := null;

    if v_content_changed then
      if auth.uid() is null then
        raise exception 'an edit to a submitted report needs a signed-in editor'
          using errcode = '28000';
      end if;
      if btrim(coalesce(new.edit_reason, '')) = '' then
        raise exception 'an edit to a submitted report needs a reason'
          using errcode = '22023';
      end if;

      -- The UPDATE holds this report's row lock, so two edits of one
      -- report cannot pick the same number.
      select coalesce(max(r.revision_no), 0) + 1 into v_next_no
        from public.daily_report_revisions r
       where r.report_id = old.id;

      insert into public.daily_report_revisions
        (org_id, site_id, report_id, revision_no,
         headcount, work_done, blockers, serious_blocker, safety_incident, next_day_plan,
         reason, edited_by)
      values
        (old.org_id, old.site_id, old.id, v_next_no,
         old.headcount, old.work_done, old.blockers, old.serious_blocker,
         old.safety_incident, old.next_day_plan,
         new.edit_reason, auth.uid());
    end if;
  end if;

  -- Write-only: used above, never stored.
  new.edit_reason := null;
  new.updated_at  := now();
  return new;
end;
$$;

-- --------------------------------------------------------- photo predicate
-- Who may attach a photo: the report's author, while they can still record on
-- its site. Private to Daily Reporting. SECURITY DEFINER so the check does not
-- depend on the caller's read access; false (never an error) for an unknown id.
-- Photos may be added after submit and after review (D6): a slow upload must
-- not be lost, and adding a photo does not change what was reported.
create function public.can_attach_report_photo(p_report_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.daily_reports r
    where r.id = p_report_id
      and r.author_id = auth.uid()
      and public.can_record_on_site(r.site_id)
  );
$$;

revoke all on function public.can_attach_report_photo(uuid) from public, anon;
grant execute on function public.can_attach_report_photo(uuid) to authenticated;

-- ---------------------------------------------------------- photo limit

create function public.report_photos_guard_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max constant int := 10;
  v_n   int;
begin
  -- BEFORE triggers run ahead of the RLS check. Step aside for a signed-in
  -- caller the insert policy will refuse anyway: otherwise they would learn
  -- from the error that a report id exists, and the lock below would let them
  -- stall its author. A caller with no auth.uid() (a migration, an operator)
  -- is still held to the limit.
  if auth.uid() is not null and not public.can_attach_report_photo(new.report_id) then
    return new;
  end if;

  -- Serialise photo inserts per report so two uploads cannot both be the
  -- tenth. NO KEY UPDATE does not block other writers' foreign-key checks.
  perform 1 from public.daily_reports r
   where r.id = new.report_id
     for no key update;

  select count(*) into v_n
    from public.report_photos p
   where p.report_id = new.report_id;

  if v_n >= v_max then
    raise exception 'a report has at most % photos', v_max
      using errcode = '23514';
  end if;

  new.created_at := now();
  return new;
end;
$$;

-- --------------------------------------------------- revisions: append-only
-- Like audit_log: refused even for the table owner. A retention purge would
-- need its own decision rather than quietly disabling this.

create function public.block_daily_report_revision_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'daily_report_revisions is append-only: % is not allowed', tg_op
    using errcode = '42501';
end;
$$;

revoke all on function public.daily_reports_guard_insert()           from public, anon, authenticated;
revoke all on function public.daily_reports_guard_update()           from public, anon, authenticated;
revoke all on function public.report_photos_guard_insert()           from public, anon, authenticated;
revoke all on function public.block_daily_report_revision_mutation() from public, anon, authenticated;

create trigger daily_reports_guard_insert
  before insert on public.daily_reports
  for each row execute function public.daily_reports_guard_insert();

create trigger daily_reports_guard_update
  before update on public.daily_reports
  for each row execute function public.daily_reports_guard_update();

create trigger report_photos_guard_insert
  before insert on public.report_photos
  for each row execute function public.report_photos_guard_insert();

create trigger daily_report_revisions_block_mutation
  before update or delete on public.daily_report_revisions
  for each row execute function public.block_daily_report_revision_mutation();

create trigger daily_report_revisions_block_truncate
  before truncate on public.daily_report_revisions
  for each statement execute function public.block_daily_report_revision_mutation();
