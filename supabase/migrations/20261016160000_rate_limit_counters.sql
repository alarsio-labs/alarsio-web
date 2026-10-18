-- Audit, Retention & Guards: rate_limit_counters and enforce_rate_limit().
-- Owner: Anuradha. Issue #19. Callers: sync_push (Offline Sync, #13) and,
-- once #25 lands, create_invite and accept_invite (Identity).
--
-- Counts are per signed-in user and per key, never shared. The counter table is
-- closed to every client; the only way to touch it is enforce_rate_limit().

create table public.rate_limit_counters (
  user_id        uuid        not null,
  key            text        not null check (char_length(key) between 1 and 63),
  hits           int         not null check (hits >= 1),
  -- Fixed window: set when the window opens, never moved by a later caller.
  window_ends_at timestamptz not null,
  primary key (user_id, key)
);
-- No foreign key to auth.users: a counter is disposable, and removing a user
-- must never be blocked by one.

alter table public.rate_limit_counters enable row level security;
revoke all on public.rate_limit_counters from public, anon, authenticated;
-- No policies and no grants: closed to every client.

-- enforce_rate_limit(key, limit, window)
--
-- Call once per request. Returns normally while the caller is within the limit.
-- Past it, raises SQLSTATE PT429 (PostgREST answers HTTP 429) with a HINT
-- giving the seconds until the window closes. Nothing else raises PT429, so a
-- caller can catch exactly this code.
--
-- The function is executable by `authenticated`, so a client can call it
-- directly. To stop that from being a way to loosen its own limit, each key has
-- a ceiling and a minimum window set here: a caller may be stricter, never
-- looser. Raising a ceiling is a migration, on purpose (tune after the week 7
-- soak test). The increment rolls back with the caller's transaction.
create function public.enforce_rate_limit(
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
      ('sync_push',     120, interval '1 minute'),
      ('create_invite',  30, interval '1 hour'),
      ('accept_invite',  10, interval '1 hour')
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

revoke all on function public.enforce_rate_limit(text, int, interval) from public, anon;
grant execute on function public.enforce_rate_limit(text, int, interval) to authenticated;
