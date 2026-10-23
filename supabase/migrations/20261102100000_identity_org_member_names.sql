-- Identity & Access: org_member_names(), the published way to read who is in an
-- organisation. Owner: Ishant. Issue #78 (Sites web needs names to assign
-- supervisors). ADR-044.
--
-- profiles is readable only by its own user (ADR-006), so a manager cannot read a
-- member's name through it, and a plain security_invoker view would return only
-- the caller's own row. This is a narrow SECURITY DEFINER function instead: it
-- checks the caller itself and returns names and roles, nothing else.
--
-- Callable by owner and project_manager (can_manage_sites), who assign people to
-- sites. Not callable by a supervisor or accountant: nothing they do needs it.
-- Returns no email, phone or auth data. A member who has not yet created a
-- profile row comes back with a null full_name. Every other caller, an unknown
-- organisation and another organisation's owner get the same error, so a caller
-- cannot probe for organisation ids.
--
-- Memberships cannot be deleted today (no delete grant), so every person with
-- assignment history is still a member and still listed. Removing a member is
-- week 6 and must decide how their name stays on old rows (ADR-044).

create function public.org_member_names(p_org_id uuid)
returns table (user_id uuid, full_name text, role public.app_role)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_org_id is null or not public.can_manage_sites(p_org_id) then
    raise exception 'not permitted to list this organization''s members' using errcode = '42501';
  end if;

  return query
    select m.user_id, p.full_name, m.role
      from public.memberships m
      left join public.profiles p on p.id = m.user_id
     where m.org_id = p_org_id
     order by p.full_name nulls last, m.created_at, m.user_id;
end;
$$;

revoke all on function public.org_member_names(uuid) from public, anon;
grant execute on function public.org_member_names(uuid) to authenticated;
