-- Daily Reporting: a manager sends a report back with a reason; its author fixes
-- and resubmits it. Owner: Anuradha. Issue #114, decisions D1-D5 in ADR-042.
--
-- PRD P0 (CUJ-5): "Manager can approve or reject a daily report ... with a comment."
-- ADR-013 R5 allowed only review_daily_report. This adds the other answer:
--
--   submitted --send_back_daily_report()--> rejected   ("Sent back" on screens)
--   rejected  --author's update, reason--->  submitted  (always one revision)
--   submitted --review_daily_report()----->  reviewed   (final, unchanged)
--
-- The row keeps the latest decision in reviewed_at / reviewed_by / review_note,
-- as a review does; the revision written on resubmit keeps every send-back.
-- Error codes as in 20261016190000_daily_reports_guards.sql:
--   42501  not permitted   22023  bad reason   55000  invalid transition

-- ------------------------------------------------------------------- table

-- D1. A new status. The inline check of the first migration is replaced.
alter table public.daily_reports drop constraint daily_reports_status_check;
alter table public.daily_reports add constraint daily_reports_status_check
  check (status in ('draft', 'submitted', 'reviewed', 'rejected'));

-- A decision (review or send-back) always says who and when, and a send-back
-- always says why.
alter table public.daily_reports drop constraint daily_reports_reviewed_consistent;
alter table public.daily_reports add constraint daily_reports_reviewed_consistent check (
  (status in ('reviewed', 'rejected')) = (reviewed_at is not null)
  and (reviewed_at is null) = (reviewed_by is null)
  and (review_note is null or reviewed_at is not null)
  and (status <> 'rejected' or btrim(coalesce(review_note, '')) <> '')
);

-- D4. The revision written on resubmit names the send-back it answers. Set by
-- the guard trigger only: revisions have no client write grant (ADR-013 R7).
-- No foreign key on sent_back_by, as with edited_by: removing a user never
-- touches history.
-- One column per statement: apps/web/src/lib/export/tables.test.ts reads them so.
alter table public.daily_report_revisions
  add column sent_back_reason text check (char_length(sent_back_reason) between 1 and 1000);
alter table public.daily_report_revisions add column sent_back_by uuid;
alter table public.daily_report_revisions add column sent_back_at timestamptz;
alter table public.daily_report_revisions
  add constraint daily_report_revisions_sent_back_all_or_none check (
    (sent_back_reason is null) = (sent_back_by is null)
    and (sent_back_by is null) = (sent_back_at is null)
  );

-- ------------------------------------------------------------ update guard
-- The guard of 20261016190000, with the two new transitions. Everything else
-- is unchanged: keys never change, reviewed is final, no un-submit, an edit
-- after submit needs a signed-in editor and a reason and leaves a revision.

create or replace function public.daily_reports_guard_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_content_changed boolean;
  v_resubmit        boolean;
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

  -- D5 of ADR-013: a reviewed report is final, so a stale phone cannot overwrite it.
  if old.status = 'reviewed' then
    raise exception 'report % is reviewed and cannot be changed', old.id
      using errcode = '55000';
  end if;

  if old.status in ('submitted', 'rejected') and new.status = 'draft' then
    raise exception 'a submitted report cannot go back to draft'
      using errcode = '55000';
  end if;

  if old.status <> 'submitted' and new.status in ('reviewed', 'rejected') then
    raise exception 'only a submitted report can be reviewed or sent back'
      using errcode = '55000';
  end if;

  v_content_changed :=
    (new.headcount, new.work_done, new.blockers, new.serious_blocker,
     new.safety_incident, new.next_day_plan)
    is distinct from
    (old.headcount, old.work_done, old.blockers, old.serious_blocker,
     old.safety_incident, old.next_day_plan);

  if old.status = 'draft' then
    -- A draft is the author's own working copy: no history (ADR-013 D8).
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

  elsif new.status in ('reviewed', 'rejected') then
    -- Only review_daily_report() and send_back_daily_report() get here: clients
    -- cannot set either status. A decision never changes what was reported.
    if v_content_changed then
      raise exception 'a review or a send-back cannot change the report''s content'
        using errcode = '55000';
    end if;
    new.submitted_at := old.submitted_at;
    new.submitted_by := old.submitted_by;

  else
    -- submitted -> submitted (an edit), or rejected -> submitted (D4, a resubmit).
    -- The first submit stamp stays; the review fields are cleared.
    v_resubmit := old.status = 'rejected';
    new.submitted_at := old.submitted_at;
    new.submitted_by := old.submitted_by;
    new.reviewed_at  := null;
    new.reviewed_by  := null;
    new.review_note  := null;

    -- A resubmit is always an answer, so it always needs an editor and a reason
    -- and always leaves a revision, even when nothing else changed.
    if v_content_changed or v_resubmit then
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
         reason, edited_by, sent_back_reason, sent_back_by, sent_back_at)
      values
        (old.org_id, old.site_id, old.id, v_next_no,
         old.headcount, old.work_done, old.blockers, old.serious_blocker,
         old.safety_incident, old.next_day_plan,
         new.edit_reason, auth.uid(),
         case when v_resubmit then old.review_note end,
         case when v_resubmit then old.reviewed_by end,
         case when v_resubmit then old.reviewed_at end);
    end if;
  end if;

  -- Write-only: used above, never stored.
  new.edit_reason := null;
  new.updated_at  := now();
  return new;
end;
$$;

-- ------------------------------------------------------------------ review
-- D3. As in 20261016210000, except that a sent-back report is refused like a
-- draft: it must be resubmitted before anyone reviews it.

create or replace function public.review_daily_report(p_report_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_site_id uuid;
  v_status  text;
  v_author  uuid;
  v_note    text := nullif(btrim(p_note), '');
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select r.site_id, r.status, r.author_id
    into v_site_id, v_status, v_author
    from public.daily_reports r
   where r.id = p_report_id
     for update;

  if not found
     or not public.can_review_site(v_site_id)
     or v_author = v_uid
     or v_status in ('draft', 'rejected') then
    raise exception 'not permitted to review this report' using errcode = '42501';
  end if;

  if v_status = 'reviewed' then
    return;
  end if;

  if char_length(v_note) > 1000 then
    raise exception 'review note is longer than 1000 characters' using errcode = '22023';
  end if;

  update public.daily_reports
     set status      = 'reviewed',
         reviewed_at = now(),
         reviewed_by = v_uid,
         review_note = v_note
   where id = p_report_id;
end;
$$;

-- --------------------------------------------------------------- send back
-- D2. The same refusals as a review, in one 42501 so a caller cannot probe for
-- ids or drafts. A reviewed report is final (55000). Sending back a report that
-- is already sent back does nothing and keeps the first reason, so a retried
-- call is harmless.

create function public.send_back_daily_report(p_report_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_site_id uuid;
  v_status  text;
  v_author  uuid;
  v_reason  text := nullif(btrim(p_reason), '');
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select r.site_id, r.status, r.author_id
    into v_site_id, v_status, v_author
    from public.daily_reports r
   where r.id = p_report_id
     for update;

  if not found
     or not public.can_review_site(v_site_id)
     or v_author = v_uid
     or v_status = 'draft' then
    raise exception 'not permitted to send this report back' using errcode = '42501';
  end if;

  if v_status = 'reviewed' then
    raise exception 'report % is reviewed and cannot be sent back', p_report_id using errcode = '55000';
  end if;

  if v_reason is null or char_length(v_reason) > 1000 then
    raise exception 'a send-back needs a reason of 1 to 1000 characters' using errcode = '22023';
  end if;

  if v_status = 'rejected' then
    return;
  end if;

  update public.daily_reports
     set status      = 'rejected',
         reviewed_at = now(),
         reviewed_by = v_uid,
         review_note = v_reason
   where id = p_report_id;
end;
$$;

revoke all on function public.send_back_daily_report(uuid, text) from public, anon;
grant execute on function public.send_back_daily_report(uuid, text) to authenticated;

-- -------------------------------------------------------------------- view
-- As in 20261016200000, with sent-back reports in it: a manager follows them,
-- and the author sees the reason.

create or replace view public.daily_report_status
with (security_invoker = true) as
select r.id,
       r.org_id,
       r.site_id,
       r.report_date,
       r.author_id,
       r.status,
       r.headcount,
       r.serious_blocker,
       r.safety_incident,
       (r.serious_blocker or r.safety_incident) as flagged,
       r.blockers,
       r.submitted_at,
       r.reviewed_at,
       r.reviewed_by,
       r.review_note,
       (select count(*) from public.report_photos p where p.report_id = r.id) as photo_count
from public.daily_reports r
where r.status in ('submitted', 'reviewed', 'rejected');
