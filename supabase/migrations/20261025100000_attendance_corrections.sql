-- Attendance & Site Presence: attendance_corrections, with RLS and audit.
-- Owner: Manish. Issue #28, PR 2. Decisions D1, D2, D3, D6 in ADR-030.
--
-- A correction is how an approved day changes (D3): the day's entries are locked
-- (next migration), so a supervisor proposes a change and a reviewer approves or
-- rejects it. One row is one change to one entry, all three fields together (D2),
-- because status and overtime are tied by a constraint and cannot move one at a time.
--
-- The row keeps the old value, the new value and a mandatory reason. The old value is
-- stamped by the database from the entry; the phone cannot choose it, so it cannot be
-- backdated. The entry is found by the natural key (site, date, worker), as the
-- entries find their day (ADR-021 D5): a second phone's entry id cannot strand a
-- correction.
--
-- The ledger is append-only (D1): clients hold no UPDATE or DELETE grant. The review
-- is a nullable stamp on the same row, written once by review_attendance_correction()
-- (the migration after next), and the guard trigger below refuses every other change,
-- even from the table owner. audit_log keeps both versions of the row.

create table public.attendance_corrections (
  -- Made on the phone (ADR-009), so a replayed push lands on the same row.
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null,
  site_id            uuid not null,
  attendance_date    date not null,
  worker_id          uuid not null,

  -- Stamped by attendance_corrections_stamp() from the entry, never by the client.
  old_status         text not null,
  old_overtime_hours numeric(4,2) not null,
  old_note           text,

  -- What the supervisor proposes. The same rules as an entry (ADR-021 D2, D3).
  new_status         text not null
                     check (new_status in ('present', 'absent', 'half_day', 'leave')),
  new_overtime_hours numeric(4,2) not null default 0
                     check (new_overtime_hours between 0 and 8),
  new_note           text
                     check (new_note is null or (new_note = btrim(new_note) and char_length(new_note) between 1 and 500)),

  reason             text not null
                     check (reason = btrim(reason) and char_length(reason) between 1 and 500),

  proposed_by        uuid not null default auth.uid() references auth.users (id),
  created_at         timestamptz not null default now(),

  -- D1. Written once, by review_attendance_correction(); no client grant.
  review_status      text not null default 'pending'
                     check (review_status in ('pending', 'approved', 'rejected')),
  reviewed_by        uuid references auth.users (id),
  reviewed_at        timestamptz,
  review_reason      text
                     check (review_reason is null
                            or (review_reason = btrim(review_reason) and char_length(review_reason) between 1 and 500)),

  -- The site is in this organisation.
  constraint attendance_corrections_site_fk foreign key (site_id, org_id)
    references public.sites (id, org_id) on delete restrict,
  -- The entry, by natural key. It also keeps the correction on the entry's site.
  constraint attendance_corrections_entry_fk foreign key (site_id, attendance_date, worker_id)
    references public.attendance_entries (site_id, attendance_date, worker_id) on delete restrict,

  -- Overtime belongs to a day worked.
  constraint attendance_corrections_overtime_needs_work
    check (new_status in ('present', 'half_day') or new_overtime_hours = 0),
  -- A correction must change something.
  constraint attendance_corrections_changes_something
    check ((new_status, new_overtime_hours, new_note) is distinct from (old_status, old_overtime_hours, old_note)),
  -- A pending correction carries no review, a decided one says who and when, and a
  -- rejection says why.
  constraint attendance_corrections_review_consistent check (
    (review_status = 'pending' and reviewed_by is null and reviewed_at is null and review_reason is null)
    or (review_status = 'approved' and reviewed_by is not null and reviewed_at is not null)
    or (review_status = 'rejected' and reviewed_by is not null and reviewed_at is not null
        and review_reason is not null)
  )
);

-- D6: one pending correction per entry. A second proposal waits until the first is
-- decided. 23505, which the sync router answers conflict / duplicate.
create unique index attendance_corrections_one_pending
  on public.attendance_corrections (site_id, attendance_date, worker_id)
  where review_status = 'pending';

create index attendance_corrections_site_idx
  on public.attendance_corrections (site_id, attendance_date);

-- ------------------------------------------------------------ stamp trigger
-- BEFORE INSERT, as the caller, so the entry and the day answer under the caller's
-- RLS. A caller who may not record on the site is refused here with 42501, before
-- anything is read (the same answer for a site that does not exist). A caller who may
-- record, naming an entry that is not there yet, gets 23503: the phone retries it
-- once the entry has synced. A day that is not approved gets 55000 (D3): on an open
-- or rejected day the supervisor edits the entry itself.

create function public.attendance_corrections_stamp()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_entry  record;
  v_status text;
begin
  if not public.can_record_on_site(new.site_id) then
    raise exception 'not permitted to record on this site' using errcode = '42501';
  end if;

  select e.status, e.overtime_hours, e.note
    into v_entry
    from public.attendance_entries e
   where e.site_id = new.site_id
     and e.attendance_date = new.attendance_date
     and e.worker_id = new.worker_id;
  if not found then
    raise exception 'no attendance entry for this worker on this day' using errcode = '23503';
  end if;

  select d.status into v_status
    from public.attendance_days d
   where d.site_id = new.site_id and d.attendance_date = new.attendance_date;
  if v_status is distinct from 'approved' then
    raise exception 'a correction is for an approved day; edit the entry of a day that is %', v_status
      using errcode = '55000';
  end if;

  new.old_status         := v_entry.status;
  new.old_overtime_hours := v_entry.overtime_hours;
  new.old_note           := v_entry.note;
  return new;
end;
$$;

revoke all on function public.attendance_corrections_stamp() from public, anon, authenticated;

create trigger attendance_corrections_stamp
  before insert on public.attendance_corrections
  for each row execute function public.attendance_corrections_stamp();

-- ------------------------------------------------------------ guard trigger
-- Append-only (D1). A correction is never deleted. Its only update is the one review
-- move, pending to approved or rejected; every other column is frozen. This binds the
-- table owner too, so a plain write cannot rewrite what a supervisor proposed.

create function public.attendance_corrections_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'attendance corrections are never deleted' using errcode = '55000';
  end if;

  if (new.id, new.org_id, new.site_id, new.attendance_date, new.worker_id,
      new.old_status, new.old_overtime_hours, new.old_note,
      new.new_status, new.new_overtime_hours, new.new_note,
      new.reason, new.proposed_by, new.created_at)
     is distinct from
     (old.id, old.org_id, old.site_id, old.attendance_date, old.worker_id,
      old.old_status, old.old_overtime_hours, old.old_note,
      old.new_status, old.new_overtime_hours, old.new_note,
      old.reason, old.proposed_by, old.created_at) then
    raise exception 'an attendance correction cannot be changed, only reviewed' using errcode = '55000';
  end if;

  if old.review_status <> 'pending' or new.review_status not in ('approved', 'rejected') then
    raise exception 'correction % is already %', old.id, old.review_status using errcode = '55000';
  end if;

  return new;
end;
$$;

revoke all on function public.attendance_corrections_guard() from public, anon, authenticated;

create trigger attendance_corrections_guard
  before update or delete on public.attendance_corrections
  for each row execute function public.attendance_corrections_guard();

-- ------------------------------------------------------------------- RLS

alter table public.attendance_corrections enable row level security;

-- Supabase grants everything to anon and authenticated by default, including
-- TRUNCATE, which RLS does not stop. Nobody updates or deletes a correction.
revoke all on public.attendance_corrections from public, anon, authenticated;

grant select on public.attendance_corrections to authenticated;
-- What the phone proposes. The old value, the proposer and the review come from the
-- trigger, the session and the review function.
grant insert (id, org_id, site_id, attendance_date, worker_id,
              new_status, new_overtime_hours, new_note, reason)
  on public.attendance_corrections to authenticated;

create policy attendance_corrections_select on public.attendance_corrections
  for select to authenticated
  using (public.has_site_access(site_id));

-- Only the assigned supervisor proposes (can_record_on_site is false on an archived
-- site), and only in their own name.
create policy attendance_corrections_insert on public.attendance_corrections
  for insert to authenticated
  with check (public.can_record_on_site(site_id) and proposed_by = auth.uid());

-- ----------------------------------------------------------------- audit
-- audit_log keeps the whole row: the proposal at insert, and the review as an update.

create trigger attendance_corrections_audit
  after insert or update or delete on public.attendance_corrections
  for each row execute function public.write_audit();
