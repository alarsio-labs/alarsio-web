-- Test-only stand-in for the parts of Supabase Storage that migrations rely on.
-- Never applied to a real project. Applied after auth_shim.sql.
--
-- Mirrors the hosted shape closely enough for policies to be written and
-- tested: storage.buckets, storage.objects with RLS on, the default grants
-- Supabase gives anon and authenticated (RLS is what gates them), and
-- storage.foldername(). Upload size and MIME limits are enforced by the
-- Storage API, not by Postgres, so they are stored here but not applied.

create schema storage;
grant usage on schema storage to anon, authenticated;

create table storage.buckets (
  id                 text primary key,
  name               text not null unique,
  owner              uuid,
  public             boolean not null default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table storage.objects (
  id          uuid primary key default gen_random_uuid(),
  bucket_id   text not null references storage.buckets (id),
  name        text not null,
  -- The Storage API sets this from the caller's JWT.
  owner       uuid default auth.uid(),
  metadata    jsonb,
  path_tokens text[] generated always as (string_to_array(name, '/')) stored,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (bucket_id, name)
);

alter table storage.buckets enable row level security;
alter table storage.objects enable row level security;

grant select, insert, update, delete on storage.buckets, storage.objects
  to anon, authenticated;

-- 'a/b/c.jpg' -> {a,b}: every path segment except the file name.
create function storage.foldername(name text) returns text[]
language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;

grant execute on function storage.foldername(text) to anon, authenticated;
