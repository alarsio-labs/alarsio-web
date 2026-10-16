-- Workforce: anonymize_worker() and import_workers(). Owner: Ishant. Issue #23.

-- Remove a worker's personal fields but keep the row and everything that
-- points at it. Terminal: an anonymized worker cannot be edited again.
create function public.anonymize_worker(p_worker_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select w.org_id into v_org_id
    from public.workers w
   where w.id = p_worker_id
     for update;

  -- Same error for "no such worker" and "not yours", so a caller cannot probe
  -- for worker ids in other organisations.
  if not found or not public.can_manage_sites(v_org_id) then
    raise exception 'not permitted to anonymize this worker' using errcode = '42501';
  end if;

  update public.workers
     set full_name     = 'Anonymized worker',
         phone         = null,
         status        = 'inactive',
         anonymized_at = coalesce(anonymized_at, now())
   where id = p_worker_id;

  -- A retired worker holds no open site assignment.
  update public.worker_site_assignments
     set unassigned_at = now(),
         unassigned_by = auth.uid()
   where worker_id = p_worker_id
     and unassigned_at is null;
end;
$$;

revoke all on function public.anonymize_worker(uuid) from public, anon;
grant execute on function public.anonymize_worker(uuid) to authenticated;

-- Create or update workers in bulk, keyed on worker code. p_rows is a JSON
-- array of {code, full_name, trade, pay_type, phone?}. Returns one result per
-- row, in order: {row, code, result, reason}. result is created, updated,
-- skipped (an anonymized worker) or rejected. One bad row never blocks the
-- rest, and importing the same file twice creates no duplicate.
--
-- SECURITY INVOKER on purpose: every insert and update runs under the caller's
-- RLS and column grants, so the import can do nothing a manual edit cannot.
create function public.import_workers(p_org_id uuid, p_rows jsonb)
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
            phone     = excluded.phone,
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
      when insufficient_privilege then
        v_out := v_out || jsonb_build_object('row', v_i, 'code', v_code, 'result', 'rejected', 'reason', 'not_permitted');
      when others then
        v_out := v_out || jsonb_build_object('row', v_i, 'code', v_code, 'result', 'rejected', 'reason', 'error_' || sqlstate);
    end;
  end loop;

  return v_out;
end;
$$;

revoke all on function public.import_workers(uuid, jsonb) from public, anon;
grant execute on function public.import_workers(uuid, jsonb) to authenticated;
