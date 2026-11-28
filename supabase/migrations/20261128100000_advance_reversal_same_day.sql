-- A reversal must carry the same paid_on as the advance it cancels.
-- Owner: Nikhil. Spec: #239. Review finding on 20261127100000_worker_advances.sql.
--
-- Without this, a reversal sent with another date lands in another month, and
-- worker_advance_totals shows the advance in one month and its cancel in the next.
-- The body is apply_worker_advance from 20261127100000 with one more condition in the
-- reversal check. `create or replace` keeps the grants.

create or replace function public.apply_worker_advance(
  p_id           uuid,
  p_site_id      uuid,
  p_worker_id    uuid,
  p_paid_on      date,
  p_amount_paise bigint,
  p_note         text default null,
  p_reverses_id  uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_note     text := nullif(btrim(p_note), '');
  v_org_id   uuid;
  v_existing public.worker_advances%rowtype;
  v_target   public.worker_advances%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_id is null then
    raise exception 'an advance id is required' using errcode = '22023';
  end if;

  -- A replay of the caller's own record is answered before any permission check, so a
  -- phone that missed the answer still hears "done". Only the author's exact record
  -- matches, so it reveals nothing.
  select * into v_existing from public.worker_advances where id = p_id;
  if found and public.worker_advance_matches(v_existing, v_uid, p_site_id, p_worker_id,
                                             p_paid_on, p_amount_paise, v_note, p_reverses_id) then
    return;
  end if;

  select r.org_id into v_org_id
    from public.worker_roster r
   where r.worker_id = p_worker_id and r.site_id = p_site_id
   limit 1;
  if v_org_id is null
     or not (public.can_view_wages(v_org_id) or public.can_record_on_site(p_site_id)) then
    raise exception 'not permitted to record an advance for this worker' using errcode = '42501';
  end if;

  if v_existing.id is not null then
    raise exception 'advance % already exists with different content', p_id
      using errcode = '23505';
  end if;

  -- India is ahead of UTC, so the local "today" is at most UTC today + 1.
  if p_paid_on is null or p_paid_on > (now() at time zone 'utc')::date + 1 then
    raise exception 'paid_on is missing or in the future' using errcode = '22023';
  end if;

  if p_reverses_id is null then
    -- A new advance needs a worker rostered at the site on that date (ADR-021 D10).
    if not exists (
      select 1
        from public.worker_roster r
       where r.worker_id = p_worker_id
         and r.site_id = p_site_id
         and public.attendance_local_date(r.assigned_at) <= p_paid_on
         and (r.unassigned_at is null
              or public.attendance_local_date(r.unassigned_at) >= p_paid_on)
    ) then
      raise exception 'worker % was not rostered at site % on %', p_worker_id, p_site_id, p_paid_on
        using errcode = '23514';
    end if;
  else
    -- A reversal cancels one advance of this worker and site, for its whole amount and on
    -- its own day. It needs no roster check: a mistake can always be undone.
    select * into v_target from public.worker_advances where id = p_reverses_id;
    if not found
       or v_target.worker_id <> p_worker_id
       or v_target.site_id <> p_site_id
       or v_target.reverses_id is not null
       or v_target.amount_paise <> p_amount_paise
       or v_target.paid_on <> p_paid_on then
      raise exception 'advance % cannot be reversed this way', p_reverses_id
        using errcode = '23514';
    end if;
  end if;

  -- A second reversal of the same advance hits worker_advances_reverses_once (23505).
  insert into public.worker_advances
    (id, org_id, site_id, worker_id, paid_on, amount_paise, note, reverses_id, recorded_by)
  values
    (p_id, v_org_id, p_site_id, p_worker_id, p_paid_on, p_amount_paise, v_note, p_reverses_id, v_uid)
  on conflict (id) do nothing;

  if found then
    return;
  end if;

  -- Lost a race with the same id: a replay if it matches, a conflict if not.
  select * into v_existing from public.worker_advances where id = p_id;
  if not public.worker_advance_matches(v_existing, v_uid, p_site_id, p_worker_id,
                                       p_paid_on, p_amount_paise, v_note, p_reverses_id) then
    raise exception 'advance % already exists with different content', p_id
      using errcode = '23505';
  end if;
end;
$$;
