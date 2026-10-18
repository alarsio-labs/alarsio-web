-- Attendance & Site Presence: site_visits, the geofence check, RLS and audit.
-- Owner: Manish. Issue #28. Decisions D1, D7, D8, D12 in ADR-021.
--
-- One row per visit. Check-in creates it, with an id made on the phone so a
-- replayed push lands on the same row. Check-out fills the check-out columns of
-- the same row, once (D1). Location is stored only in the four coordinate
-- columns, captured on the supervisor's tap, never in the background.
--
-- The geofence is checked here, not on the phone, by a trigger, so it binds every
-- writer. The distance is a pure-SQL haversine: the test runner is plain
-- postgres with no PostGIS. The phone cannot choose the distance or the flag; they
-- have no column grant. Outside the fence a reason is mandatory, and the visit is
-- flagged (D8: the same rule on check-out).
--
-- What this cannot prove: the distance is that of the coordinates the phone
-- reports. A spoofed GPS passes.

-- ---------------------------------------------------------------- distance

-- Great-circle distance in metres between two points, mean Earth radius
-- 6371008.8 m. The asin argument is clamped, so a rounding error at the antipode
-- cannot raise; an out-of-range coordinate is refused by the table's CHECK, not
-- here. Pure and immutable, so it is safe to execute for every signed-in user:
-- the triggers below run as the caller and must be able to call it.
create function public.attendance_distance_m(
  p_lat1 numeric, p_lng1 numeric, p_lat2 numeric, p_lng2 numeric
)
returns double precision
language sql
immutable
set search_path = public
as $$
  select 2 * 6371008.8::double precision * asin(least(1.0::double precision, sqrt(greatest(0.0::double precision,
           power(sin(radians((p_lat2 - p_lat1)::double precision) / 2), 2)
           + cos(radians(p_lat1::double precision)) * cos(radians(p_lat2::double precision))
             * power(sin(radians((p_lng2 - p_lng1)::double precision) / 2), 2)))));
$$;

revoke all on function public.attendance_distance_m(numeric, numeric, numeric, numeric) from public, anon;
grant execute on function public.attendance_distance_m(numeric, numeric, numeric, numeric) to authenticated;

-- ---------------------------------------------------------------- table

create table public.site_visits (
  -- Made on the phone (ADR-009), so a replayed push lands on the same row.
  id                        uuid primary key default gen_random_uuid(),
  org_id                    uuid not null,
  site_id                   uuid not null,
  user_id                   uuid not null default auth.uid() references auth.users (id),

  -- D7: the phone's clock, as the supervisor saw it. An offline record is hours
  -- old by design; created_at / updated_at below are the server's.
  check_in_at               timestamptz not null,
  check_in_lat              numeric(9,6) not null check (check_in_lat  between  -90 and  90),
  check_in_lng              numeric(9,6) not null check (check_in_lng between -180 and 180),
  -- Stamped by site_visits_stamp(), never by the client.
  check_in_distance_m       numeric(9,1) not null,
  check_in_outside_geofence boolean not null,
  check_in_reason           text
                            check (check_in_reason is null
                                   or (check_in_reason = btrim(check_in_reason)
                                       and char_length(check_in_reason) between 1 and 500)),

  -- The check-out leg is empty until the supervisor checks out.
  check_out_at              timestamptz,
  check_out_lat             numeric(9,6) check (check_out_lat between  -90 and  90),
  check_out_lng             numeric(9,6) check (check_out_lng between -180 and 180),
  check_out_distance_m      numeric(9,1),
  check_out_outside_geofence boolean,
  check_out_reason          text
                            check (check_out_reason is null
                                   or (check_out_reason = btrim(check_out_reason)
                                       and char_length(check_out_reason) between 1 and 500)),

  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  -- The site is in this organisation.
  constraint site_visits_site_fk foreign key (site_id, org_id)
    references public.sites (id, org_id) on delete restrict,

  -- Outside the fence, a reason is mandatory (never silently accepted).
  constraint site_visits_check_in_reason_when_outside
    check (not check_in_outside_geofence or check_in_reason is not null),
  constraint site_visits_check_out_reason_when_outside
    check (check_out_outside_geofence is not true or check_out_reason is not null),

  -- The check-out leg is all there or all absent: a time with no location, or a
  -- latitude with no longitude, is refused.
  constraint site_visits_check_out_leg check (
    (check_out_at is null and check_out_lat is null and check_out_lng is null
       and check_out_distance_m is null and check_out_outside_geofence is null)
    or
    (check_out_at is not null and check_out_lat is not null and check_out_lng is not null
       and check_out_distance_m is not null and check_out_outside_geofence is not null)
  ),
  constraint site_visits_check_out_after_check_in
    check (check_out_at is null or check_out_at >= check_in_at)
);

-- D12: no "one open visit per user" rule. A forgotten check-out would turn the
-- next day's check-in into a permanent sync conflict. Managers see open visits.

create index site_visits_site_idx on public.site_visits (site_id, check_in_at);
create index site_visits_user_idx on public.site_visits (user_id, check_in_at);

-- ------------------------------------------------------------ stamp trigger
-- Runs as the caller, so site_geofence answers under the caller's RLS: a site
-- the caller cannot see (another organisation's, an unassigned one, one that does
-- not exist) is refused here with the same 42501, before any policy is asked.
--
-- On INSERT it stamps the check-in distance and flag. On UPDATE it leaves the
-- check-in leg alone and, the first time a check-out is set, stamps that leg too.
-- A flag is a record of the day: it is not recomputed if the radius changes later.

create function public.site_visits_stamp()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_site record;
  v_dist double precision;
begin
  -- D7: the phone's clock is accepted up to one day ahead of the server's
  -- (a phone that is a little fast), and not beyond.
  if new.check_in_at > now() + interval '1 day'
     or (new.check_out_at is not null and new.check_out_at > now() + interval '1 day') then
    raise exception 'the phone clock is more than a day ahead of the server' using errcode = '23514';
  end if;

  select g.latitude, g.longitude, g.geofence_radius_m
    into v_site
    from public.site_geofence g
   where g.id = new.site_id;
  if not found then
    raise exception 'not permitted to record on this site' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    v_dist := public.attendance_distance_m(v_site.latitude, v_site.longitude, new.check_in_lat, new.check_in_lng);
    new.check_in_distance_m := round(v_dist::numeric, 1);
    new.check_in_outside_geofence := v_dist > v_site.geofence_radius_m;
    return new;
  end if;

  -- UPDATE
  new.check_in_distance_m := old.check_in_distance_m;
  new.check_in_outside_geofence := old.check_in_outside_geofence;
  new.updated_at := now();

  if old.check_out_at is not null then
    new.check_out_distance_m := old.check_out_distance_m;
    new.check_out_outside_geofence := old.check_out_outside_geofence;
  elsif new.check_out_lat is not null and new.check_out_lng is not null then
    v_dist := public.attendance_distance_m(v_site.latitude, v_site.longitude, new.check_out_lat, new.check_out_lng);
    new.check_out_distance_m := round(v_dist::numeric, 1);
    new.check_out_outside_geofence := v_dist > v_site.geofence_radius_m;
  else
    -- No location: leave the leg incomplete, so site_visits_check_out_leg refuses it.
    new.check_out_distance_m := null;
    new.check_out_outside_geofence := null;
  end if;
  return new;
end;
$$;

revoke all on function public.site_visits_stamp() from public, anon, authenticated;

create trigger site_visits_stamp
  before insert or update on public.site_visits
  for each row execute function public.site_visits_stamp();

-- ------------------------------------------------------------------- RLS

alter table public.site_visits enable row level security;

-- Supabase grants everything to anon and authenticated by default, including
-- TRUNCATE, which RLS does not stop. Nobody deletes a visit.
revoke all on public.site_visits from public, anon, authenticated;

grant select on public.site_visits to authenticated;
-- What the phone captures at check-in. user_id comes from the session, the
-- distance and the flag from the trigger, the check-out leg from a later update.
grant insert (id, org_id, site_id, check_in_at, check_in_lat, check_in_lng, check_in_reason)
  on public.site_visits to authenticated;
-- Check-out: the four columns the phone captures at that tap.
grant update (check_out_at, check_out_lat, check_out_lng, check_out_reason)
  on public.site_visits to authenticated;

create policy site_visits_select on public.site_visits
  for select to authenticated
  using (public.has_site_access(site_id));

-- Only the assigned supervisor records (can_record_on_site is false on an
-- archived site), and only in their own name.
create policy site_visits_insert on public.site_visits
  for insert to authenticated
  with check (public.can_record_on_site(site_id) and user_id = auth.uid());

-- Check-out sets the check-out leg once, on the caller's own open visit. Once
-- check_out_at is set the row no longer matches USING (0 rows), so a second
-- check-out, or a colleague's, changes nothing.
create policy site_visits_update on public.site_visits
  for update to authenticated
  using      (public.can_record_on_site(site_id) and user_id = auth.uid() and check_out_at is null)
  with check (public.can_record_on_site(site_id) and user_id = auth.uid() and check_out_at is not null);

-- ----------------------------------------------------------------- audit
-- audit_log stores the whole row, so check-in coordinates are in it too: owner
-- readable only, kept at least 3 years (ADR-012). Named in the PR's security table.

create trigger site_visits_audit
  after insert or update or delete on public.site_visits
  for each row execute function public.write_audit();
