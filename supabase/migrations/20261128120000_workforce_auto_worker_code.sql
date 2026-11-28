-- Workforce: a new worker gets the next code automatically. Owner: Ishant.
-- Amends ADR-011 W4 (the contractor no longer invents the code); ADR-055.
--
-- A BEFORE INSERT trigger fills `code` only when it is null. A typed code is kept, and a
-- blank one still fails the table's check, so import_workers() keeps rejecting a blank
-- code cell. (An import row with no `code` key at all now creates a worker with the next
-- code, the same as the Add worker form; the web import always sends the key.)
-- The code is W + at least 3 digits
-- (W001, W002, ... W1000): one more than the highest W<number> already in the
-- organisation. Other codes (MASON1, an imported W-001) are ignored.
--
-- Security invoker: it reads workers as the caller. Only owner and project_manager can
-- insert (workers_insert), and workers_select shows them the whole organisation. An
-- advisory lock per organisation makes two simultaneous inserts take different numbers.
-- The unique index on (org_id, lower(code)) stays the last guard.

create function public.workers_set_code()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_next bigint;
begin
  if new.org_id is null or new.code is not null then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('workers_code/' || new.org_id::text, 0));

  -- {1,9} keeps the number inside bigint; a longer digit string is not one of ours.
  select coalesce(max(substring(w.code from '^[Ww]([0-9]{1,9})$')::bigint), 0) + 1
    into v_next
    from public.workers w
   where w.org_id = new.org_id;

  -- Not lpad(): it would cut W1000 down to W100.
  new.code := 'W' || repeat('0', greatest(3 - length(v_next::text), 0)) || v_next::text;
  return new;
end;
$$;

revoke all on function public.workers_set_code() from public, anon, authenticated;

create trigger workers_set_code
  before insert on public.workers
  for each row execute function public.workers_set_code();
