-- Sites: archive_site(), the only way a site becomes archived.
-- Owner: Manish. Issue #8. Published in docs/ARCHITECTURE.md (Sites).
--
-- Requires Identity's can_manage_sites(uuid); must sort after it.
--
-- D5: archiving is terminal; there is no unarchive in the MVP.
-- D6: archiving an archived site does nothing and succeeds.
-- D7: archiving closes every open assignment on the site.

create function public.archive_site(p_site_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_org_id uuid;
  v_status text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Lock the row so a concurrent assignment or edit waits for us.
  select s.org_id, s.status
    into v_org_id, v_status
    from public.sites s
   where s.id = p_site_id
     for update;

  -- Same error for "no such site" and "not yours", so a caller cannot probe
  -- for site ids in other organisations.
  if not found or not public.can_manage_sites(v_org_id) then
    raise exception 'not permitted to archive this site' using errcode = '42501';
  end if;

  if v_status = 'archived' then
    return;
  end if;

  update public.sites
     set status      = 'archived',
         archived_at = now(),
         archived_by = v_uid
   where id = p_site_id;

  update public.site_assignments
     set unassigned_at = now(),
         unassigned_by = v_uid
   where site_id = p_site_id
     and unassigned_at is null;
end;
$$;

revoke all on function public.archive_site(uuid) from public, anon;
grant execute on function public.archive_site(uuid) to authenticated;
