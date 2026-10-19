-- Test-only stand-in for the parts of Supabase that migrations rely on.
-- Never applied to a real project.
create role anon nologin;
create role authenticated nologin;
grant usage on schema public to anon, authenticated;

create schema auth;
create table auth.users (id uuid primary key, email text);
grant usage on schema auth to anon, authenticated;

create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create function public.test_as(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), true);
  execute 'set local role authenticated';
end $$;

create function public.test_as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
end $$;

create function public.test_assert(ok boolean, msg text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'ASSERT FAILED: %', msg; end if;
end $$;

-- Like a hosted project, everything the migrations create in public starts out
-- granted to the client roles, so a migration that forgets its
-- `revoke all ... from public, anon, authenticated` fails here, in the schema
-- guards (ADR-024), instead of shipping open. Set last, so the helpers above
-- keep their plain defaults.
alter default privileges in schema public grant all on tables    to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
