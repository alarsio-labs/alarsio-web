-- Attendance & Site Presence: mark_all_present(), the one-call "mark everyone
-- present". Owner: Manish. Issue #28. Published in docs/ARCHITECTURE.md (Attendance).
--
-- Opens the day if it is not open yet, then adds one 'present' entry, no overtime,
-- for every ACTIVE worker rostered at the site on that date. Workers who already
-- have an entry are left alone, so it is safe to call twice and never overwrites
-- an exception the supervisor has already set.
--
-- SECURITY INVOKER on purpose: every insert runs under the caller's RLS, column
-- grants and triggers, so it can do nothing a hand-made entry cannot. The roster
-- rule, the date window and the supervisor-only policy all apply unchanged.
--
-- This is the connected path. Offline, the phone writes one entry record per
-- rostered worker itself; mark_all_present is not called from sync_push.

create function public.mark_all_present(p_site_id uuid, p_attendance_date date)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org_id  uuid;
  v_created integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_site_id is null or p_attendance_date is null then
    raise exception 'a site and a date are required' using errcode = '22023';
  end if;

  -- Same error for a missing site, another organisation's, an unassigned one, an
  -- archived one and the wrong role, so a caller cannot probe for site ids.
  if not public.can_record_on_site(p_site_id) then
    raise exception 'not permitted to record on this site' using errcode = '42501';
  end if;
  select g.org_id into v_org_id from public.site_geofence g where g.id = p_site_id;
  if not found then
    raise exception 'not permitted to record on this site' using errcode = '42501';
  end if;

  insert into public.attendance_days (org_id, site_id, attendance_date)
  values (v_org_id, p_site_id, p_attendance_date)
  on conflict (site_id, attendance_date) do nothing;

  -- Distinct, because a worker can hold several assignment rows at one site and
  -- still be one person on one day.
  insert into public.attendance_entries
    (id, org_id, site_id, attendance_date, worker_id, status, overtime_hours)
  select gen_random_uuid(), v_org_id, p_site_id, p_attendance_date, r.worker_id, 'present', 0
    from (
      select distinct ro.worker_id
        from public.worker_roster ro
       where ro.site_id = p_site_id
         and ro.status = 'active'
         and public.attendance_local_date(ro.assigned_at) <= p_attendance_date
         and (ro.unassigned_at is null
              or public.attendance_local_date(ro.unassigned_at) >= p_attendance_date)
    ) r
  on conflict (site_id, attendance_date, worker_id) do nothing;

  get diagnostics v_created = row_count;
  return v_created;
end;
$$;

revoke all on function public.mark_all_present(uuid, date) from public, anon;
grant execute on function public.mark_all_present(uuid, date) to authenticated;
