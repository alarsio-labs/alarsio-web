// The shell's only screen: proves the app starts, its device database is ready,
// and how many records are waiting to sync.
// Owner: Offline Sync (Nikhil). Issues #14, #47. Domain screens arrive in later issues.

import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { PublicConfigResult } from '../config/public-config';
import type { DeviceDb } from '../db/device-db';
import type { SyncHandle, SyncStatus } from '../sync/engine';

type DbStatus =
  | { kind: 'opening' }
  | { kind: 'ready' }
  | { kind: 'failed'; message: string };

export interface HomeScreenProps {
  /** Opens the device database. Injected so tests need no native SQLite. */
  openDb: () => Promise<DeviceDb>;
  /** Starts syncing once the database is open. Absent when the app has no config. */
  startSync?: (db: DeviceDb) => SyncHandle;
  config: PublicConfigResult;
  appVersion: string;
}

export function HomeScreen({ openDb, startSync, config, appVersion }: HomeScreenProps) {
  const [db, setDb] = useState<DbStatus>({ kind: 'opening' });
  const [sync, setSync] = useState<SyncStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    let handle: SyncHandle | null = null;
    openDb().then(
      (opened) => {
        if (cancelled) return;
        setDb({ kind: 'ready' });
        if (startSync) {
          handle = startSync(opened);
          setSync(handle.getStatus());
          handle.subscribe(setSync);
        }
      },
      (error: unknown) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : String(error);
        setDb({ kind: 'failed', message });
      },
    );
    return () => {
      cancelled = true;
      handle?.stop();
    };
  }, [openDb, startSync]);

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Alarsio</Text>

      {!config.ok && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{`Configuration missing: ${config.missing.join(', ')}`}</Text>
          <Text style={styles.errorHint}>Add it to apps/mobile/.env.local and restart Expo.</Text>
        </View>
      )}

      <Text style={db.kind === 'failed' ? styles.errorText : styles.line}>{dbLine(db)}</Text>

      {sync && <Text style={styles.line}>{syncLine(sync)}</Text>}

      <Text style={styles.version}>{`Version ${appVersion}`}</Text>
    </SafeAreaView>
  );
}

function dbLine(db: DbStatus): string {
  switch (db.kind) {
    case 'opening':
      return 'Device database: opening…';
    case 'ready':
      return 'Device database ready';
    case 'failed':
      return `Device database failed: ${db.message}`;
  }
}

/** One line about the outbox. "Submitted" is never claimed here (ADR-009). */
export function syncLine(status: SyncStatus): string {
  const { counts, last, running } = status;
  const waiting = counts.pending + counts.syncing + counts.failed;
  const attention = counts.conflict + counts.rejected;
  const parts = [running ? `Sync: sending… ${waiting} waiting` : `Sync: ${waiting} waiting`];
  if (attention > 0) parts.push(`${attention} need attention`);
  if (last?.kind === 'signed_out') parts.push('sign in to sync');
  if (last?.kind === 'failed') parts.push(`last try failed (${last.reason})`);
  return parts.join(' · ');
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  title: { fontSize: 28, fontWeight: '600' },
  line: { fontSize: 16, textAlign: 'center' },
  errorBox: { gap: 4, alignItems: 'center' },
  errorText: { fontSize: 16, color: '#b00020', textAlign: 'center' },
  errorHint: { fontSize: 14, color: '#555', textAlign: 'center' },
  version: { fontSize: 12, color: '#777' },
});
