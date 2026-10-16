// The shell's only screen: proves the app starts and its device database is ready.
// Owner: Offline Sync (Nikhil). Issue #14. Domain screens arrive in later issues.

import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { PublicConfigResult } from '../config/public-config';

type DbStatus =
  | { kind: 'opening' }
  | { kind: 'ready' }
  | { kind: 'failed'; message: string };

export interface HomeScreenProps {
  /** Opens the device database. Injected so tests need no native SQLite. */
  openDb: () => Promise<unknown>;
  config: PublicConfigResult;
  appVersion: string;
}

export function HomeScreen({ openDb, config, appVersion }: HomeScreenProps) {
  const [db, setDb] = useState<DbStatus>({ kind: 'opening' });

  useEffect(() => {
    let cancelled = false;
    openDb().then(
      () => {
        if (!cancelled) setDb({ kind: 'ready' });
      },
      (error: unknown) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : String(error);
        setDb({ kind: 'failed', message });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [openDb]);

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
  line: { fontSize: 16 },
  errorBox: { gap: 4, alignItems: 'center' },
  errorText: { fontSize: 16, color: '#b00020', textAlign: 'center' },
  errorHint: { fontSize: 14, color: '#555', textAlign: 'center' },
  version: { fontSize: 12, color: '#777' },
});
