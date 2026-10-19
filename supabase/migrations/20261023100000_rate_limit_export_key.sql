-- Audit, Retention & Guards: a rate-limit key for the owner data export.
-- Owner: Anuradha. Issue #76, ADR-026.
--
-- The export (apps/web, /export) reads every table of the organisation, about
-- twenty paged queries, as the signed-in owner. One user may start at most 5 an
-- hour. The only change from 20261016160000 is the new allowlist row
-- ('export_org_data', 5, 1 hour); the existing keys keep their ceilings and
-- windows (ADR-012). Same signature, so callers and grants are unchanged.
create or replace function public.enforce_rate_limit(
  p_key    text,
  p_limit  int,
  p_window interval
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_max_limit int;
  v_min_win   interval;
  v_hits      int;
  v_ends      timestamptz;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select k.max_limit, k.min_window into v_max_limit, v_min_win
    from (values
      ('sync_push',        120, interval '1 minute'),
      ('create_invite',     30, interval '1 hour'),
      ('accept_invite',     10, interval '1 hour'),
      ('export_org_data',    5, interval '1 hour')
    ) as k (key, max_limit, min_window)
   where k.key = p_key;

  if not found then
    raise exception 'unknown rate limit key' using errcode = '22023';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > v_max_limit then
    raise exception 'limit must be between 1 and %', v_max_limit using errcode = '22023';
  end if;
  if p_window is null or p_window < v_min_win or p_window > interval '1 day' then
    raise exception 'window must be between % and 1 day', v_min_win using errcode = '22023';
  end if;

  insert into public.rate_limit_counters as c (user_id, key, hits, window_ends_at)
  values (v_uid, p_key, 1, now() + p_window)
  on conflict (user_id, key) do update
    set hits = case when c.window_ends_at <= now() then 1 else c.hits + 1 end,
        window_ends_at = case when c.window_ends_at <= now()
                              then now() + p_window else c.window_ends_at end
  returning c.hits, c.window_ends_at into v_hits, v_ends;

  if v_hits > p_limit then
    raise exception 'rate limit exceeded for %', p_key
      using errcode = 'PT429',
            hint = 'retry after ' || greatest(1, ceil(extract(epoch from v_ends - now()))::int) || ' seconds';
  end if;
end;
$$;

-- create or replace keeps the existing privileges; restated so this file reads
-- on its own.
revoke all on function public.enforce_rate_limit(text, int, interval) from public, anon;
grant execute on function public.enforce_rate_limit(text, int, interval) to authenticated;
