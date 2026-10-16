// Every migration of the on-device database, in order.
// Owner: Offline Sync (Nikhil).
//
// Append only. Never edit or renumber a migration that has shipped: a phone that
// already ran it will not run it again. The outbox table arrives as migration 1.

import type { DeviceMigration } from './run-migrations';

export const deviceMigrations: readonly DeviceMigration[] = [];
