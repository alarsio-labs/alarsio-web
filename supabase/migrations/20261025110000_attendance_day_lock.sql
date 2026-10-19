-- Attendance & Site Presence: the approved-day lock. Owner: Manish. Issue #28, PR 2.
-- Decisions D4, D8, D9 in ADR-029; PS409 agreed on #13.
--
-- Once a manager approves a day, nothing a phone sends may change it. Three layers,
-- because the rule has to hold for every writer:
--   1. The entries' UPDATE policy no longer matches a row of an approved day, so a
--      plain UPDATE changes 0 rows (like a second check-out, ADR-021 D1).
--   2. A late INSERT, and any UPDATE that still reaches the table (a writer that
--      bypasses RLS), raises SQLSTATE PS409, which the sync router will answer
--      conflict / locked.
--   3. The day row itself is frozen once approved.
--
-- D4: rejected means "sent back". Only an approved day is locked, so the supervisor can
-- fix a rejected day and a reviewer decides again.
--
-- D8: exactly one write gets into an approved day's entry: the one
-- review_attendance_correction() makes. The trigger lets an UPDATE through only if an
-- APPROVED correction exists for that entry whose old values equal the row's current
-- values and whose new values equal the values being written. There is no flag a
-- client could set, and no check of the role name, so a plain UPDATE, even the table
-- owner's, raises unless it repeats a write that an approved correction already made.
-- Putting an applied correction back is a new correction. Known limit: after a
-- revert cycle (A to B approved, then B to A approved) the first correction matches
-- again, so a writer that bypasses RLS could repeat A to B. It writes only values a
-- reviewer already approved, and no client reaches the trigger.
--
-- The two entry triggers are SECURITY DEFINER so that RLS cannot hide the day or the
-- correction from them and let a write through. The insert trigger is AFTER, so an
-- unassigned caller is stopped by the policy first and never learns that a day is
-- approved.

-- ------------------------------------------------------------ entries: policy
-- The open-day condition (D4): not approved. The same condition on the new row, so a
-- write can never move an entry into an approved day either.

drop policy attendance_entries_update on public.attendance_entries;

create policy attendance_entries_update on public.attendance_entries
  for update to authenticated
  using (
    public.can_record_on_site(site_id)
    and exists (
      select 1 from public.attendance_days d
       where d.site_id = attendance_entries.site_id
         and d.attendance_date = attendance_entries.attendance_date
         and d.status <> 'approved'
    )
  )
  with check (
    public.can_record_on_site(site_id)
    and exists (
      select 1 from public.attendance_days d
       where d.site_id = attendance_entries.site_id
         and d.attendance_date = attendance_entries.attendance_date
         and d.status <> 'approved'
    )
  );

-- ------------------------------------------------------- entries: lock triggers

create function public.attendance_entries_lock_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.attendance_days d
     where d.site_id = new.site_id
       and d.attendance_date = new.attendance_date
       and d.status = 'approved'
  ) then
    raise exception 'attendance day % at site % is approved', new.attendance_date, new.site_id
      using errcode = 'PS409';
  end if;
  return null;
end;
$$;

revoke all on function public.attendance_entries_lock_insert() from public, anon, authenticated;

create trigger attendance_entries_lock_insert
  after insert on public.attendance_entries
  for each row execute function public.attendance_entries_lock_insert();

create function public.attendance_entries_lock_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.attendance_days d
     where d.status = 'approved'
       and ((d.site_id = old.site_id and d.attendance_date = old.attendance_date)
         or (d.site_id = new.site_id and d.attendance_date = new.attendance_date))
  ) then
    -- The one way in (D8): the exact write of an approved correction, on the same entry.
    if (new.site_id, new.attendance_date, new.worker_id, new.org_id)
         is not distinct from (old.site_id, old.attendance_date, old.worker_id, old.org_id)
       and exists (
         select 1 from public.attendance_corrections c
          where c.site_id = old.site_id
            and c.attendance_date = old.attendance_date
            and c.worker_id = old.worker_id
            and c.review_status = 'approved'
            and (c.old_status, c.old_overtime_hours, c.old_note)
                  is not distinct from (old.status, old.overtime_hours, old.note)
            and (c.new_status, c.new_overtime_hours, c.new_note)
                  is not distinct from (new.status, new.overtime_hours, new.note)
       ) then
      return new;
    end if;
    raise exception 'attendance day % at site % is approved', old.attendance_date, old.site_id
      using errcode = 'PS409';
  end if;
  return new;
end;
$$;

revoke all on function public.attendance_entries_lock_update() from public, anon, authenticated;

create trigger attendance_entries_lock_update
  before update on public.attendance_entries
  for each row execute function public.attendance_entries_lock_update();

-- ------------------------------------------------------------- days: guard
-- A day's review stamp is written only by review_attendance_day(); clients hold no
-- UPDATE grant. This trigger is the second line: an approved day is frozen (PS409),
-- a day never goes back to open, and its identity never changes.

create function public.attendance_days_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'approved' then
    raise exception 'attendance day % at site % is approved', old.attendance_date, old.site_id
      using errcode = 'PS409';
  end if;

  if (new.id, new.org_id, new.site_id, new.attendance_date, new.recorded_by, new.created_at)
     is distinct from
     (old.id, old.org_id, old.site_id, old.attendance_date, old.recorded_by, old.created_at) then
    raise exception 'an attendance day cannot be moved or renamed' using errcode = '55000';
  end if;

  if new.status = 'open' and old.status <> 'open' then
    raise exception 'a % day cannot go back to open', old.status using errcode = '55000';
  end if;

  return new;
end;
$$;

revoke all on function public.attendance_days_guard() from public, anon, authenticated;

create trigger attendance_days_guard
  before update on public.attendance_days
  for each row execute function public.attendance_days_guard();
