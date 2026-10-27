// Every migration of the on-device database, in order.
// Owner: Offline Sync (Nikhil).
//
// Append only. Never edit or renumber a migration that has shipped: a phone that
// already ran it will not run it again.

import type { DeviceMigration } from './run-migrations';

export const deviceMigrations: readonly DeviceMigration[] = [
  {
    // Issue #39. One row per (entity, record_id); seq is the send order.
    version: 1,
    name: 'outbox',
    sql: `
      create table outbox (
        seq             integer primary key autoincrement,
        entity          text not null check (entity in (
                          'site_visits', 'attendance_days', 'attendance_entries',
                          'attendance_corrections', 'daily_reports', 'report_photos',
                          'material_transactions')),
        record_id       text not null check (length(record_id) = 36),
        payload         text not null check (json_valid(payload) and json_type(payload) = 'object'),
        status          text not null default 'pending' check (status in (
                          'pending', 'syncing', 'synced', 'failed', 'conflict', 'rejected')),
        reason          text,
        attempts        integer not null default 0 check (attempts >= 0),
        next_attempt_at text,
        dirty           integer not null default 0 check (dirty in (0, 1)),
        created_at      text not null,
        updated_at      text not null,
        unique (entity, record_id)
      );
      create index outbox_status_seq on outbox (status, seq);
    `,
  },
  {
    // Issue #47. Small per-install settings, such as the device id sent with each push.
    version: 2,
    name: 'device settings',
    sql: `
      create table device_settings (
        key   text primary key check (length(key) between 1 and 64),
        value text not null
      );
    `,
  },
  {
    // Issue #54, ADR-020. The user who saved each row; only their session sends it.
    // Null only for rows saved before this migration, which are never sent.
    version: 3,
    name: 'outbox author',
    sql: `
      alter table outbox add column author_id text
        check (author_id is null or length(author_id) = 36);
      create index outbox_author_status_seq on outbox (author_id, status, seq);
    `,
  },
  {
    // Issue #49. Read-only copies of what the signed-in user may see, replaced
    // whole by each pull. mirror_state says whose copy it is (ADR-020): reads
    // for anyone else return nothing. Quantities are integer thousandths,
    // exact for the server's numeric(…, 3). The roster keeps each assignment's
    // assigned and unassigned day (Asia/Kolkata), so the phone can answer
    // "rostered on this date" as the server does (ADR-021 D10).
    version: 4,
    name: 'mirrors',
    sql: `
      create table mirror_sites (
        id                text primary key check (length(id) = 36),
        name              text not null,
        address           text not null,
        latitude          real not null,
        longitude         real not null,
        geofence_radius_m integer not null,
        status            text not null
      );
      create table mirror_materials (
        id               text primary key check (length(id) = 36),
        site_id          text not null check (length(site_id) = 36),
        name             text not null,
        unit             text not null,
        threshold_milli  integer,
        balance_milli    integer not null
      );
      create index mirror_materials_site on mirror_materials (site_id, name);
      create table mirror_roster (
        assignment_id text primary key check (length(assignment_id) = 36),
        worker_id     text not null check (length(worker_id) = 36),
        site_id       text not null check (length(site_id) = 36),
        code          text not null,
        name          text not null,
        trade         text not null,
        assigned_on   text not null check (length(assigned_on) = 10),
        unassigned_on text check (unassigned_on is null or length(unassigned_on) = 10)
      );
      create index mirror_roster_site on mirror_roster (site_id, assigned_on);
      create table mirror_state (
        id           integer primary key check (id = 1),
        user_id      text not null check (length(user_id) = 36),
        refreshed_at text not null
      );
    `,
  },
  {
    // Issue #79, ADR-034. Every Attendance payload names the site's organisation
    // (the composite key to sites), and the phone had no way to know it. Nullable:
    // a phone that already holds a mirror keeps its sites, and the next pull fills
    // the column. Until then the capture screens say "connect once to refresh".
    version: 5,
    name: 'mirror sites org_id',
    sql: `
      alter table mirror_sites add column org_id text
        check (org_id is null or length(org_id) = 36);
    `,
  },
  {
    // Issue #81 PR 2, ADR-037. Daily Reporting's upload queue: the file of a report
    // photo waits here, in the app's own folder, until its metadata is accepted and
    // the file is in the report-photos bucket. Owned by its author, like the outbox
    // (ADR-020). The limits are the bucket's and report_photos' (ADR-013 R4).
    version: 6,
    name: 'report photo files',
    sql: `
      create table report_photo_files (
        record_id       text primary key check (length(record_id) = 36),
        author_id       text not null check (length(author_id) = 36),
        report_id       text not null check (length(report_id) = 36),
        local_uri       text not null check (length(local_uri) > 0),
        storage_path    text not null check (length(storage_path) > 0),
        content_type    text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
        size_bytes      integer not null check (size_bytes between 1 and 10485760),
        state           text not null default 'waiting' check (state in ('waiting', 'uploaded', 'refused')),
        attempts        integer not null default 0 check (attempts >= 0),
        next_attempt_at text,
        created_at      text not null,
        updated_at      text not null
      );
      create index report_photo_files_author on report_photo_files (author_id, state, created_at);
      create index report_photo_files_report on report_photo_files (author_id, report_id, created_at);
    `,
  },
  {
    // Issue #127, ADR-049. The fourth pull mirror: Attendance's approved days for the
    // last week, so the day register knows a day is approved before the first edit. A
    // copy of what the server holds, replaced whole by each pull and owned by one user
    // through mirror_state (ADR-023). Overtime is integer hundredths, exact for the
    // server's numeric(4,2).
    version: 7,
    name: 'mirror approved days',
    sql: `
      create table mirror_approved_days (
        entry_id            text primary key check (length(entry_id) = 36),
        site_id             text not null check (length(site_id) = 36),
        worker_id           text not null check (length(worker_id) = 36),
        work_date           text not null check (length(work_date) = 10),
        status              text not null check (status in ('present', 'absent', 'half_day', 'leave')),
        overtime_hundredths integer not null check (overtime_hundredths between 0 and 800),
        approved_at         text not null
      );
      create index mirror_approved_days_site on mirror_approved_days (site_id, work_date);
    `,
  },
];
