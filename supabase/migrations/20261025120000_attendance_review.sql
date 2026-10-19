-- Attendance & Site Presence: review_attendance_day() and
-- review_attendance_correction(). Owner: Manish. Issue #28, PR 2. Published in
-- docs/ARCHITECTURE.md (Attendance). Decisions D1, D4, D5, D7 in ADR-030.
--
-- Requires Identity's can_review_site(uuid): owner and project_manager of the site's
-- organisation. Archived sites stay reviewable.
--
-- SECURITY DEFINER because a day's review stamp and a correction's review have no
-- client grant, so this is the only way they are written. Each function checks the
-- caller itself, on a row it has locked, and answers one error (42501) for "no such
-- id" and "not yours", so a caller cannot probe for ids in other organisations.
-- Both return void: nothing leaks through a result.
--
-- These are the connected path (the web review screen). They are never called from
-- sync_push.

-- ---------------------------------------------------------------- the day
-- open or rejected -> approved or rejected. An approved day is final (D5): approving
-- it again is a no-op that keeps the first reviewer, and rejecting it is refused
-- (55000). A rejection needs a reason (22023); an approval may carry a note.

create function public.review_attendance_day(
  p_day_id  uuid,
  p_approve boolean,
  p_reason  text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_site   uuid;
  v_status text;
  v_note   text := nullif(btrim(p_reason), '');
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Lock the day so a concurrent review waits for us.
  select d.site_id, d.status
    into v_site, v_status
    from public.attendance_days d
   where d.id = p_day_id
     for update;

  if not found or not public.can_review_site(v_site) then
    raise exception 'not permitted to review this day' using errcode = '42501';
  end if;

  if p_approve is null then
    raise exception 'approve or reject must be chosen' using errcode = '22023';
  end if;

  if v_status = 'approved' then
    if p_approve then
      return;
    end if;
    raise exception 'an approved day cannot be rejected; use a correction' using errcode = '55000';
  end if;

  if not p_approve and v_note is null then
    raise exception 'a reason is required to reject a day' using errcode = '22023';
  end if;
  if char_length(v_note) > 500 then
    raise exception 'the reason is longer than 500 characters' using errcode = '22023';
  end if;

  -- The stamp is set here and nowhere else: a client has no column grant for it.
  update public.attendance_days
     set status        = case when p_approve then 'approved' else 'rejected' end,
         reviewed_by   = v_uid,
         reviewed_at   = now(),
         review_reason = v_note
   where id = p_day_id;
end;
$$;

revoke all on function public.review_attendance_day(uuid, boolean, text) from public, anon;
grant execute on function public.review_attendance_day(uuid, boolean, text) to authenticated;

-- ------------------------------------------------------------ the correction
-- pending -> approved or rejected, once. A decided correction asked the same way again
-- is a no-op (the first reviewer is kept); the opposite way is refused (55000).
-- Approving applies the correction to the entry in the same transaction, which is the
-- one write the day lock admits (D8). A correction is not applied over a change it
-- did not see (D7): if the entry no longer equals the old values, 55000, and the
-- reviewer rejects it so the supervisor can propose again.

create function public.review_attendance_correction(
  p_correction_id uuid,
  p_approve       boolean,
  p_reason        text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_c         public.attendance_corrections;
  v_entry     public.attendance_entries;
  v_day       text;
  v_note      text := nullif(btrim(p_reason), '');
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select c.* into v_c
    from public.attendance_corrections c
   where c.id = p_correction_id
     for update;

  if not found or not public.can_review_site(v_c.site_id) then
    raise exception 'not permitted to review this correction' using errcode = '42501';
  end if;

  if p_approve is null then
    raise exception 'approve or reject must be chosen' using errcode = '22023';
  end if;

  if v_c.review_status <> 'pending' then
    if (v_c.review_status = 'approved') = p_approve then
      return;
    end if;
    raise exception 'correction % is already %', v_c.id, v_c.review_status using errcode = '55000';
  end if;

  if not p_approve and v_note is null then
    raise exception 'a reason is required to reject a correction' using errcode = '22023';
  end if;
  if char_length(v_note) > 500 then
    raise exception 'the reason is longer than 500 characters' using errcode = '22023';
  end if;

  if not p_approve then
    update public.attendance_corrections
       set review_status = 'rejected',
           reviewed_by   = v_uid,
           reviewed_at   = now(),
           review_reason = v_note
     where id = v_c.id;
    return;
  end if;

  -- Approve. The day must still be approved, and the entry must still be what the
  -- supervisor saw.
  select d.status into v_day
    from public.attendance_days d
   where d.site_id = v_c.site_id and d.attendance_date = v_c.attendance_date;
  if v_day is distinct from 'approved' then
    raise exception 'correction % is for a day that is not approved', v_c.id using errcode = '55000';
  end if;

  select e.* into v_entry
    from public.attendance_entries e
   where e.site_id = v_c.site_id
     and e.attendance_date = v_c.attendance_date
     and e.worker_id = v_c.worker_id
     for update;
  if not found
     or (v_entry.status, v_entry.overtime_hours, v_entry.note)
          is distinct from (v_c.old_status, v_c.old_overtime_hours, v_c.old_note) then
    raise exception 'the entry changed after correction % was proposed', v_c.id using errcode = '55000';
  end if;

  -- The correction is marked approved first: the day lock lets the entry write through
  -- only because an approved correction with exactly these values exists.
  update public.attendance_corrections
     set review_status = 'approved',
         reviewed_by   = v_uid,
         reviewed_at   = now(),
         review_reason = v_note
   where id = v_c.id;

  update public.attendance_entries
     set status         = v_c.new_status,
         overtime_hours = v_c.new_overtime_hours,
         note           = v_c.new_note
   where id = v_entry.id;
end;
$$;

revoke all on function public.review_attendance_correction(uuid, boolean, text) from public, anon;
grant execute on function public.review_attendance_correction(uuid, boolean, text) to authenticated;
