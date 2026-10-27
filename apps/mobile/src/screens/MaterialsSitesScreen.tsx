// The sites a supervisor can record materials at, from the offline copy on the phone.
// Owner: Materials (Nikhil). Issue #82. Reads only this user's mirror.

import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { DeviceDb } from '../db/device-db';
import { readSites, type MirrorSite } from '../sync/pull';

export interface MaterialsSitesScreenProps {
  openDb: () => Promise<DeviceDb>;
  /** The signed-in user. Another user's copy of the sites reads as nothing (ADR-023). */
  userId: string;
  onOpenSite: (siteId: string) => void;
}

type Load = { kind: 'loading' } | { kind: 'failed' } | { kind: 'ready'; sites: MirrorSite[] };

export function MaterialsSitesScreen({ openDb, userId, onOpenSite }: MaterialsSitesScreenProps) {
  const [load, setLoad] = useState<Load>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    openDb()
      .then((db) => readSites(db, userId))
      .then(
        (sites) => {
          if (!cancelled) setLoad({ kind: 'ready', sites });
        },
        // A fixed sentence: the error can name files (ADR-029).
        () => {
          if (!cancelled) setLoad({ kind: 'failed' });
        },
      );
    return () => {
      cancelled = true;
    };
  }, [openDb, userId]);

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title} accessibilityRole="header">
        Materials
      </Text>
      {load.kind === 'loading' && <Text style={styles.line}>Loading…</Text>}
      {load.kind === 'failed' && <Text style={styles.error}>Could not read the sites on this phone.</Text>}
      {load.kind === 'ready' && load.sites.length === 0 && (
        <Text style={styles.line}>No sites on this phone yet. Connect once to download your sites.</Text>
      )}
      {load.kind === 'ready' && load.sites.length > 0 && (
        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          {load.sites.map((site) => (
            <Pressable key={site.id} accessibilityRole="button" onPress={() => onOpenSite(site.id)} style={styles.card}>
              <Text style={styles.siteName}>{site.name}</Text>
              <Text style={styles.siteAddress}>{site.address}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 16, gap: 12 },
  title: { fontSize: 24, fontWeight: '600' },
  line: { fontSize: 16, color: '#333' },
  error: { fontSize: 16, color: '#b00020' },
  list: { flex: 1 },
  listContent: { gap: 12, paddingBottom: 24 },
  card: { minHeight: 44, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, gap: 2 },
  siteName: { fontSize: 18, fontWeight: '600' },
  siteAddress: { fontSize: 14, color: '#555' },
});
