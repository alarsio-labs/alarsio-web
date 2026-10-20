-- Attendance & Site Presence: nobody reviews a day they recorded, or a correction they
-- proposed. Owner: Manish. Issue #80 AC 3, decision in ADR-040.
--
-- review_attendance_day() and review_attendance_correction() (20261025120000) checked
-- only can_review_site. That held because recorders (supervisor) and reviewers (owner,
-- project_manager) are different roles, but an owner can change a member's role, so a
-- supervisor made a project manager could review days they recorded.
--
-- Both functions are replaced with the same bodies plus one check, made right after
-- the permission check, so it answers before any state rule (an approved day, a blank
-- reason) and is the same 42501 as "not yours":
--   day         the caller opened the day (recorded_by) or recorded any of its entries
--   correction  the caller proposed it (proposed_by)
-- A correction is not refused for a day the caller recorded: it is a different act on a
-- different row, and the day was approved by someone else. Grants are unchanged.

create or replace function public.review_attendance_day(
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
  v_uid      uuid := auth.uid();
  v_site     uuid;
  v_date     date;
  v_status   text;
  v_recorder uuid;
  v_note     text := nullif(btrim(p_reason), '');
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Lock the day so a concurrent review waits for us.
  select d.site_id, d.attendance_date, d.status, d.recorded_by
    into v_site, v_date, v_status, v_recorder
    from public.attendance_days d
   where d.id = p_day_id
     for update;

  if not found or not public.can_review_site(v_site) then
    raise exception 'not permitted to review this day' using errcode = '42501';
  end if;

  -- Nobody reviews a day they recorded: opened it, or recorded any of its entries.
  if v_recorder = v_uid
     or exists (
       select 1
         from public.attendance_entries e
        where e.site_id = v_site
          and e.attendance_date = v_date
          and e.recorded_by = v_uid
     ) then
    raise exception 'a day you recorded must be reviewed by someone else' using errcode = '42501';
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

create or replace function public.review_attendance_correction(
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

  -- Nobody reviews a correction they proposed, even one that is already decided.
  if v_c.proposed_by = v_uid then
    raise exception 'a correction you proposed must be reviewed by someone else' using errcode = '42501';
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

-- create or replace keeps the existing grants; restated so this file reads on its own.
revoke all on function public.review_attendance_day(uuid, boolean, text) from public, anon;
revoke all on function public.review_attendance_correction(uuid, boolean, text) from public, anon;
grant execute on function public.review_attendance_day(uuid, boolean, text) to authenticated;
grant execute on function public.review_attendance_correction(uuid, boolean, text) to authenticated;
