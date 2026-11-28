-- Identity & Access: close four gaps on the Team page. Owner: Ishant. ADR-058.
--
--   1. A last-owner guard on memberships (ADR-006 left it out of week 1).
--   2. change_member_role(): an owner changes a member's role.
--   3. resend_invite(): a fresh link for an open or expired invite.
--   4. create_invite(): "already a member" and "an invite is open" now differ.
--   5. accept_invite(): an existing member's role is updated, not silently kept (BUG-03).
--
-- Removing a member is a separate change: site_assignments holds a restrict foreign key
-- to memberships, so it needs its own decision (ADR-044).

-- ---------------------------------------------------------- last-owner guard
-- Runs for every writer: the Team page, a direct update, accept_invite() and, later,
-- a removal. The advisory lock makes two owners demoting each other at once take turns.
create function public.memberships_keep_an_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role = 'owner' and (tg_op = 'DELETE' or new.role <> 'owner') then
    perform pg_advisory_xact_lock(hashtextextended('owners/' || old.org_id::text, 0));
    if not exists (
      select 1 from public.memberships m
      where m.org_id = old.org_id and m.role = 'owner' and m.user_id <> old.user_id
    ) then
      raise exception 'an organization needs at least one owner' using errcode = 'PT422';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger memberships_keep_an_owner
  before update or delete on public.memberships
  for each row execute function public.memberships_keep_an_owner();

-- ------------------------------------------------------- change_member_role
create function public.change_member_role(
  p_org_id  uuid,
  p_user_id uuid,
  p_role    public.app_role
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_org_id is null or not public.is_org_owner(p_org_id) then
    raise exception 'not permitted to change roles in this organization' using errcode = '42501';
  end if;
  if p_user_id is null or p_role is null then
    raise exception 'invalid member or role' using errcode = '22023';
  end if;

  update public.memberships
     set role = p_role
   where org_id = p_org_id and user_id = p_user_id;
  if not found then
    raise exception 'not a member of this organization' using errcode = '22023';
  end if;
end;
$$;

-- ----------------------------------------------------------- create_invite
-- Same as before, except that an existing member now raises PT409, so the owner can tell
-- it from an open invite (23505).
create or replace function public.create_invite(
  p_org_id uuid,
  p_email  text,
  p_role   public.app_role
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text := lower(btrim(p_email));
  v_token text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_org_id is null or not public.is_org_owner(p_org_id) then
    raise exception 'not permitted to invite to this organization' using errcode = '42501';
  end if;
  if p_role is null then
    raise exception 'invalid role' using errcode = '22023';
  end if;
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254 then
    raise exception 'invalid email' using errcode = '22023';
  end if;

  perform public.enforce_rate_limit('create_invite', 30, interval '1 hour');

  -- Serialise invites for one email in one org, so two concurrent calls cannot
  -- both pass the open-invite check.
  perform pg_advisory_xact_lock(hashtextextended(p_org_id::text || '/' || v_email, 0));

  if exists (
    select 1 from public.memberships m
    join auth.users u on u.id = m.user_id
    where m.org_id = p_org_id and lower(u.email) = v_email
  ) then
    raise exception 'already a member' using errcode = 'PT409';
  end if;

  if exists (
    select 1 from public.invites i
    where i.org_id = p_org_id and i.email = v_email
      and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
  ) then
    raise exception 'an open invite already exists for this email' using errcode = '23505';
  end if;

  -- 244 random bits from two v4 uuids, hex encoded.
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

  insert into public.invites (org_id, email, role, token_hash, expires_at, created_by)
  values (p_org_id, v_email, p_role, sha256(convert_to(v_token, 'UTF8')),
          now() + interval '72 hours', v_uid);

  return v_token;
end;
$$;

-- ------------------------------------------------------------ resend_invite
-- Only a hash of the token is stored, so a resend cannot show the old link again: it
-- revokes the invite and makes a new one with the same email and role. If the new one
-- is refused (already a member, rate limit), the revoke rolls back with it.
create function public.resend_invite(p_invite_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.invites%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_invite from public.invites i where i.id = p_invite_id for update;
  if not found or not public.is_org_owner(v_invite.org_id) then
    raise exception 'not permitted to resend this invite' using errcode = '42501';
  end if;
  if v_invite.accepted_at is not null then
    raise exception 'invite already accepted' using errcode = '22023';
  end if;

  if v_invite.revoked_at is null then
    update public.invites
       set revoked_at = now(), revoked_by = auth.uid()
     where id = v_invite.id;
  end if;

  return public.create_invite(v_invite.org_id, v_invite.email, v_invite.role);
end;
$$;

-- ------------------------------------------------------------ accept_invite
-- Same as before, except that an existing member takes the invited role (BUG-03,
-- ADR-058 amends ADR-019 I6). The last-owner guard still refuses to demote the only
-- owner; that raises PT422 and rolls back, so the invite stays unused.
create or replace function public.accept_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_invite public.invites%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  perform public.enforce_rate_limit('accept_invite', 10, interval '1 hour');

  if p_token is null or char_length(p_token) <> 64 then
    return null;
  end if;

  select * into v_invite
    from public.invites i
   where i.token_hash = sha256(convert_to(p_token, 'UTF8'))
     for update;

  if not found
     or v_invite.accepted_at is not null
     or v_invite.revoked_at is not null
     or v_invite.expires_at <= now() then
    return null;
  end if;

  insert into public.memberships (org_id, user_id, role)
  values (v_invite.org_id, v_uid, v_invite.role)
  on conflict (org_id, user_id) do update set role = excluded.role
    where public.memberships.role <> excluded.role;

  update public.invites
     set accepted_at = now(), accepted_by = v_uid
   where id = v_invite.id;

  return v_invite.org_id;
end;
$$;

revoke all on function public.memberships_keep_an_owner()                     from public, anon, authenticated;
revoke all on function public.change_member_role(uuid, uuid, public.app_role) from public, anon;
revoke all on function public.resend_invite(uuid)                             from public, anon;
grant execute on function public.change_member_role(uuid, uuid, public.app_role) to authenticated;
grant execute on function public.resend_invite(uuid)                             to authenticated;
