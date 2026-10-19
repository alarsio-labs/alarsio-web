// The shell's only screen: proves the app starts, its device database is ready,
// and shows the signed-in user's sync status.
// Owner: Offline Sync (Nikhil). Issues #14, #47, #68. Domain screens arrive in later issues.

import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { PublicConfigResult } from '../config/public-config';
import type { DeviceDb } from '../db/device-db';
import type { SyncHandle, SyncStatus } from '../sync/engine';
import { SyncPanel } from './SyncPanel';

type DbStatus =
  | { kind: 'opening' }
  | { kind: 'ready' }
  | { kind: 'failed'; message: string };

export interface HomeScreenProps {
  /** Opens the device database. Injected so tests need no native SQLite. */
  openDb: () => Promise<DeviceDb>;
  /** Starts syncing once the database is open. Absent when the app has no config. */
  startSync?: (db: DeviceDb, userId?: string) => SyncHandle;
  /** The user signed in on the phone, so counts are theirs only (ADR-020). */
  userId?: string;
  config: PublicConfigResult;
  appVersion: string;
}

export function HomeScreen({ openDb, startSync, userId, config, appVersion }: HomeScreenProps) {
  const [db, setDb] = useState<DbStatus>({ kind: 'opening' });
  const [sync, setSync] = useState<SyncStatus | null>(null);
  const handleRef = useRef<SyncHandle | null>(null);

  useEffect(() => {
    let cancelled = false;
    let handle: SyncHandle | null = null;
    openDb().then(
      (opened) => {
        if (cancelled) return;
        setDb({ kind: 'ready' });
        if (startSync) {
          handle = startSync(opened, userId);
          handleRef.current = handle;
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
      handleRef.current = null;
    };
  }, [openDb, startSync, userId]);

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

      {sync && <SyncPanel status={sync} onSyncNow={() => void handleRef.current?.retryNow()} />}

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
