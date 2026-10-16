-- Daily Reporting: review_daily_report(), the only way a report becomes reviewed.
-- Owner: Anuradha. Issue #29. Published in docs/ARCHITECTURE.md (Daily Reporting).
--
-- Requires Identity's can_review_site(uuid).
--
-- D4: a manager marks a report reviewed; they never edit it.
-- D5: reviewed is final. The guard trigger refuses every later update.
-- Reviewing a reviewed report does nothing and succeeds, so a retried call is
-- harmless and the first reviewer and note are kept.

create function public.review_daily_report(p_report_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_site_id uuid;
  v_status  text;
  v_note    text := nullif(btrim(p_note), '');
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Lock the report so a concurrent edit or review waits for us.
  select r.site_id, r.status
    into v_site_id, v_status
    from public.daily_reports r
   where r.id = p_report_id
     for update;

  -- One error for "no such report", "not yours to review" and "still a draft",
  -- so a caller cannot probe for report ids in other organisations or learn
  -- that a supervisor has a draft.
  if not found
     or not public.can_review_site(v_site_id)
     or v_status = 'draft' then
    raise exception 'not permitted to review this report' using errcode = '42501';
  end if;

  if v_status = 'reviewed' then
    return;
  end if;

  if char_length(v_note) > 1000 then
    raise exception 'review note is longer than 1000 characters' using errcode = '22023';
  end if;

  -- reviewed_at and reviewed_by are set here and nowhere else: a client has
  -- no column grant for them and cannot set the reviewed status.
  update public.daily_reports
     set status      = 'reviewed',
         reviewed_at = now(),
         reviewed_by = v_uid,
         review_note = v_note
   where id = p_report_id;
end;
$$;

revoke all on function public.review_daily_report(uuid, text) from public, anon;
grant execute on function public.review_daily_report(uuid, text) to authenticated;
