-- Workforce: two fixes from the #57 review. Owner: Ishant. ADR-011 W11, W12.
--
-- W11. A worker's pay type cannot change once they have a wage rate. A rate row
--      does not record its basis, so switching daily <-> hourly would make every
--      past ₹650/day read as ₹650/hour, and a past wage could no longer be
--      reproduced (W3). Enforced by a trigger, so the edit form, the import and
--      any other writer all get it. To change the basis, add a new worker code.
-- W12. Re-importing a file with no Phone column, or a blank phone cell, keeps the
--      stored phone instead of clearing it. Clearing a phone is done on the
--      worker's page.

-- ------------------------------------------------------------------- W11
-- SECURITY DEFINER so the check sees rates whatever the caller's RLS: a project
-- manager cannot read rates, but must still be stopped.
create function public.workers_lock_pay_type()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.pay_type is distinct from old.pay_type
     and exists (select 1 from public.worker_wage_rates r where r.worker_id = old.id) then
    raise exception 'pay type of worker % cannot change once it has a wage rate', old.code
      using errcode = '55000';
  end if;
  return new;
end;
$$;

revoke all on function public.workers_lock_pay_type() from public, anon, authenticated;

create trigger workers_lock_pay_type
  before update of pay_type on public.workers
  for each row execute function public.workers_lock_pay_type();

-- ------------------------------------------------------------------- W12
create or replace function public.import_workers(p_org_id uuid, p_rows jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_max constant int := 1000;
  v_row jsonb;
  v_i   int := 0;
  v_out jsonb := '[]'::jsonb;
  v_created boolean;
  v_n       int;
  v_code text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not public.can_manage_sites(p_org_id) then
    raise exception 'not permitted to import workers' using errcode = '42501';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'rows must be a json array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > v_max then
    raise exception 'at most % rows per import', v_max using errcode = '22023';
  end if;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_i := v_i + 1;
    v_code := btrim(v_row ->> 'code');
    v_created := null;
    begin
      if jsonb_typeof(v_row) <> 'object' then
        raise exception 'row is not an object' using errcode = '22023';
      end if;

      insert into public.workers (org_id, code, full_name, phone, trade, pay_type)
      values (
        p_org_id,
        v_code,
        btrim(v_row ->> 'full_name'),
        nullif(btrim(v_row ->> 'phone'), ''),
        btrim(v_row ->> 'trade'),
        lower(btrim(v_row ->> 'pay_type'))
      )
      on conflict (org_id, (lower(code))) do update
        set full_name = excluded.full_name,
            -- W12: a blank phone in the file keeps the stored one.
            phone     = coalesce(excluded.phone, workers.phone),
            trade     = excluded.trade,
            pay_type  = excluded.pay_type
        where workers.anonymized_at is null
      returning (xmax = 0) into v_created;

      get diagnostics v_n = row_count;
      if v_n = 0 then
        v_out := v_out || jsonb_build_object('row', v_i, 'code', v_code, 'result', 'skipped', 'reason', 'anonymized');
      else
        v_out := v_out || jsonb_build_object('row', v_i, 'code', v_code,
          'result', case when v_created then 'created' else 'updated' end);
      end if;
    exception
      when check_violation or not_null_violation then
        v_out := v_out || jsonb_build_object('row', v_i, 'code', v_code, 'result', 'rejected', 'reason', 'invalid_value');
      when object_not_in_prerequisite_state then
        -- W11: pay type cannot change once the worker has a rate.
        v_out := v_out || jsonb_build_object('row', v_i, 'code', v_code, 'result', 'rejected', 'reason', 'pay_type_locked');
      when insufficient_privilege then
        v_out := v_out || jsonb_build_object('row', v_i, 'code', v_code, 'result', 'rejected', 'reason', 'not_permitted');
      when others then
        v_out := v_out || jsonb_build_object('row', v_i, 'code', v_code, 'result', 'rejected', 'reason', 'error_' || sqlstate);
    end;
  end loop;

  return v_out;
end;
$$;
