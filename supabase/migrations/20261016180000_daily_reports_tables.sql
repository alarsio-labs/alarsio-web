-- Daily Reporting: daily_reports, daily_report_revisions, report_photos.
-- Owner: Anuradha. Issue #29. Decisions D1-D9 in ADR-013.
--
-- All three tables have RLS enabled and no grants here, so they are closed to
-- every client until the policies migration. Nothing is ever deleted: a report
-- is corrected by an edit that leaves a revision, a revision is never touched,
-- and a photo is only ever added.
--
-- Every id can be made on the phone (Offline Sync, #13), so a replayed push
-- lands on the same row instead of creating a second one.

-- ---------------------------------------------------------- daily_reports

create table public.daily_reports (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null,
  site_id         uuid not null,
  report_date     date not null,
  author_id       uuid not null default auth.uid() references auth.users (id),

  status          text not null default 'draft'
                  check (status in ('draft', 'submitted', 'reviewed')),

  -- D8: a draft may be incomplete; daily_reports_complete_when_submitted
  -- decides what a submitted report must have. Headcount is a plain number
  -- until Attendance publishes its approved-days view (#28).
  headcount       integer check (headcount between 0 and 1000),
  -- D2: text limits.
  work_done       text check (char_length(work_done) <= 4000),
  blockers        text check (char_length(blockers) <= 2000),
  -- D1: a serious blocker is a tap, not a severity scale.
  serious_blocker boolean not null default false,
  safety_incident boolean not null default false,
  next_day_plan   text check (char_length(next_day_plan) <= 2000),

  -- Write-only. An edit to a submitted report must carry its reason here; the
  -- guard trigger moves it into daily_report_revisions (where its length is
  -- checked) and clears it, so the next edit needs a fresh one.
  edit_reason     text,

  -- Stamped by the server only.
  submitted_at    timestamptz,
  submitted_by    uuid references auth.users (id),
  reviewed_at     timestamptz,
  reviewed_by     uuid references auth.users (id),
  review_note     text check (char_length(review_note) <= 1000),

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- The site is in this organisation.
  constraint daily_reports_site_fk foreign key (site_id, org_id)
    references public.sites (id, org_id) on delete restrict,

  -- One report per site per day (D9). Leading on site_id, this also serves
  -- "reports for this site".
  constraint daily_reports_one_per_site_day unique (site_id, report_date),

  constraint daily_reports_complete_when_submitted check (
    status = 'draft'
    or (headcount is not null and btrim(coalesce(work_done, '')) <> '')
  ),
  constraint daily_reports_serious_blocker_explained check (
    not serious_blocker or btrim(coalesce(blockers, '')) <> ''
  ),
  constraint daily_reports_edit_reason_transient check (edit_reason is null),

  -- A draft has never been submitted; anything else says when and by whom.
  constraint daily_reports_submitted_consistent check (
    (status = 'draft') = (submitted_at is null)
    and (submitted_at is null) = (submitted_by is null)
  ),
  -- Only a reviewed report carries a review, and it always says who and when.
  constraint daily_reports_reviewed_consistent check (
    (status = 'reviewed') = (reviewed_at is not null)
    and (reviewed_at is null) = (reviewed_by is null)
    and (review_note is null or reviewed_at is not null)
  ),

  -- Target for the composite foreign keys that keep revisions and photos on
  -- the same report, site and organisation.
  constraint daily_reports_id_site_org_unique unique (id, site_id, org_id)
);

-- The owner's "every site, this week" read.
create index daily_reports_org_date_idx on public.daily_reports (org_id, report_date);

-- ------------------------------------------------- daily_report_revisions
-- Append-only. One row per edit after submit, holding the values the edit
-- replaced. Written only by the daily_reports guard trigger.

create table public.daily_report_revisions (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null,
  site_id         uuid not null,
  report_id       uuid not null,
  revision_no     integer not null check (revision_no >= 1),

  -- The previous values.
  headcount       integer,
  work_done       text,
  blockers        text,
  serious_blocker boolean not null,
  safety_incident boolean not null,
  next_day_plan   text,

  reason          text not null
                  check (char_length(reason) <= 500 and btrim(reason) <> ''),
  edited_by       uuid not null default auth.uid() references auth.users (id),
  edited_at       timestamptz not null default now(),

  constraint daily_report_revisions_report_fk foreign key (report_id, site_id, org_id)
    references public.daily_reports (id, site_id, org_id) on delete restrict,
  constraint daily_report_revisions_report_no_unique unique (report_id, revision_no)
);

-- ---------------------------------------------------------- report_photos
-- Metadata only; the file is in the private report-photos Storage bucket at
-- storage_path. Photos are optional and never block a report.

create table public.report_photos (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null,
  site_id      uuid not null,
  report_id    uuid not null,

  storage_path text not null unique,
  caption      text check (char_length(caption) <= 200),
  -- D3: 10 MB, the same limit the bucket enforces on the file.
  size_bytes   integer not null check (size_bytes between 1 and 10485760),
  content_type text not null
               check (content_type in ('image/jpeg', 'image/png', 'image/webp')),

  uploaded_by  uuid not null default auth.uid() references auth.users (id),
  created_at   timestamptz not null default now(),

  -- A photo belongs to a report of this site and organisation; one pointing
  -- at another site's report fails here.
  constraint report_photos_report_fk foreign key (report_id, site_id, org_id)
    references public.daily_reports (id, site_id, org_id) on delete restrict,

  -- The path is fixed by the row, so a file cannot be filed under another
  -- organisation, site or report: <org>/<site>/<report>/<photo>.<ext>
  constraint report_photos_path_shape check (
    storage_path = org_id::text || '/' || site_id::text || '/' || report_id::text
                   || '/' || id::text || '.'
                   || case content_type
                        when 'image/jpeg' then 'jpg'
                        when 'image/png'  then 'png'
                        else 'webp'
                      end
  )
);

create index report_photos_report_id_idx on public.report_photos (report_id);

-- ------------------------------------------------------------------- RLS

alter table public.daily_reports          enable row level security;
alter table public.daily_report_revisions enable row level security;
alter table public.report_photos          enable row level security;

-- Supabase grants everything to anon and authenticated by default, including
-- TRUNCATE, which RLS does not stop.
revoke all on public.daily_reports, public.daily_report_revisions, public.report_photos
  from public, anon, authenticated;
