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
];
