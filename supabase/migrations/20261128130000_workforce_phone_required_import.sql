-- Workforce: a new worker needs a phone. Owner: Ishant. Amends ADR-011 W5; ADR-056.
--
-- The Add worker and Edit forms now require a phone. This keeps import_workers() in step:
-- a row that would CREATE a worker with no phone is rejected as 'phone_required'.
-- A row for a worker that already exists is unchanged: a blank phone keeps the stored one
-- (W12), an anonymized worker is still skipped. So old workers with no phone can still be
-- updated by import, and get their phone the next time someone edits them.
--
-- No table check: workers.phone stays nullable (anonymize_worker() sets it to null, and
-- old rows have none). Only the same function as before is replaced; grants are kept.

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
  v_phone text;
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

      v_phone := nullif(btrim(v_row ->> 'phone'), '');
      -- A new worker needs a phone. A row with no code key is always new. (A blank code
      -- is left to the table check below.)
      if v_phone is null
         and (v_code is null
              or (v_code <> '' and not exists (select 1 from public.workers w
                                                where w.org_id = p_org_id and lower(w.code) = lower(v_code)))) then
        v_out := v_out || jsonb_build_object('row', v_i, 'code', v_code, 'result', 'rejected', 'reason', 'phone_required');
        continue;
      end if;

      insert into public.workers (org_id, code, full_name, phone, trade, pay_type)
      values (
        p_org_id,
        v_code,
        btrim(v_row ->> 'full_name'),
        v_phone,
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
