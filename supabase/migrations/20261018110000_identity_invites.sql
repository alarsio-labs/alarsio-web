-- Identity & Access, week 2: invites, create_invite(), accept_invite(),
-- revoke_invite(). Owner: Ishant. Issue #25. Decisions in ADR-019.
--
-- I1. The link alone grants access: whoever signs in and opens it joins with the
--     invited role. The invited email is where the link is sent, not a check.
-- I2. An invite lives 10 minutes, set here, never by the client.
-- I3. Any of the four roles may be invited, owner included. Only an owner invites.
-- I4. Only a sha256 of the token is stored. The raw token is returned once.

create table public.invites (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete restrict,
  email       text not null
              check (email = lower(btrim(email))
                     and char_length(email) between 3 and 254
                     and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role        public.app_role not null,
  token_hash  bytea not null unique check (octet_length(token_hash) = 32),
  expires_at  timestamptz not null,
  created_by  uuid not null references auth.users (id),
  created_at  timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id),
  revoked_at  timestamptz,
  revoked_by  uuid references auth.users (id),

  constraint invites_expiry_after_create check (expires_at > created_at),
  constraint invites_accepted_consistent check ((accepted_at is null) = (accepted_by is null)),
  constraint invites_revoked_consistent  check ((revoked_at  is null) = (revoked_by  is null)),
  constraint invites_not_both            check (accepted_at is null or revoked_at is null)
);

create index invites_org_email_idx on public.invites (org_id, email);

-- ------------------------------------------------------------ create_invite
-- Returns the raw token once. The web app builds the link from it and emails
-- it (ADR-019); the database never sees the token again.
create function public.create_invite(
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
    raise exception 'already a member' using errcode = '23505';
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
          now() + interval '10 minutes', v_uid);

  return v_token;
end;
$$;

-- ------------------------------------------------------------ accept_invite
-- Returns the organization id, or null for every refusal: unknown, expired,
-- revoked or already used. One answer for all of them, so a caller learns
-- nothing about which tokens exist.
--
-- It returns null rather than raising on purpose: enforce_rate_limit's counter
-- rolls back with the caller's transaction, so a raising refusal would let
-- someone guess tokens without ever being counted.
create function public.accept_invite(p_token text)
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

  -- Already a member: keep the existing role, still use up the invite.
  insert into public.memberships (org_id, user_id, role)
  values (v_invite.org_id, v_uid, v_invite.role)
  on conflict (org_id, user_id) do nothing;

  update public.invites
     set accepted_at = now(), accepted_by = v_uid
   where id = v_invite.id;

  return v_invite.org_id;
end;
$$;

-- ------------------------------------------------------------ revoke_invite
-- Same error for an unknown invite and one in another organisation.
-- Revoking an accepted, expired or already revoked invite does nothing.
create function public.revoke_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_org_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select i.org_id into v_org_id from public.invites i where i.id = p_invite_id for update;
  if not found or not public.is_org_owner(v_org_id) then
    raise exception 'not permitted to revoke this invite' using errcode = '42501';
  end if;

  update public.invites
     set revoked_at = now(), revoked_by = v_uid
   where id = p_invite_id and accepted_at is null and revoked_at is null;
end;
$$;

revoke all on function public.create_invite(uuid, text, public.app_role) from public, anon;
revoke all on function public.accept_invite(text)                        from public, anon;
revoke all on function public.revoke_invite(uuid)                        from public, anon;
grant execute on function public.create_invite(uuid, text, public.app_role) to authenticated;
grant execute on function public.accept_invite(text)                        to authenticated;
grant execute on function public.revoke_invite(uuid)                        to authenticated;

-- ------------------------------------------------------------------- RLS

alter table public.invites enable row level security;
revoke all on public.invites from public, anon, authenticated;

-- Owners read their org's invites, without the token hash. Every write goes
-- through the functions above, so there is no insert, update or delete grant.
grant select (id, org_id, email, role, expires_at, created_by, created_at,
              accepted_at, accepted_by, revoked_at, revoked_by)
  on public.invites to authenticated;

create policy invites_select on public.invites
  for select to authenticated
  using (public.is_org_owner(org_id));

create trigger invites_audit
  after insert or update or delete on public.invites
  for each row execute function public.write_audit();
