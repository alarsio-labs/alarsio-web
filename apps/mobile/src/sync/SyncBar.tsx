// A thin sync status bar at the bottom of every signed-in screen, so a
// supervisor sees "3 waiting to send" or "Offline" wherever they are.
// Owner: Offline Sync (Nikhil). It only reads: counts from this user's outbox
// on the phone and the connection state. The words come from status-text.ts.

import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { DeviceDb } from '../db/device-db';
import { colors, minTarget, tone, type } from '../theme';
import { Icon } from '../ui/Icon';
import type { SyncStatus } from './engine';
import { countByStatus } from './outbox';
import { syncLine } from './status-text';

export interface NetState {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
}

export interface SyncBarProps {
  openDb: () => Promise<DeviceDb>;
  userId: string;
  /** Opens the screen with the sync details and Sync now (Home). */
  onOpen: () => void;
  pollMs?: number;
  /** The connection source; tests pass their own. */
  netInfo?: { addEventListener(listener: (state: NetState) => void): () => void };
}

const EMPTY = { pending: 0, syncing: 0, synced: 0, failed: 0, conflict: 0, rejected: 0 };
const isOnline = (s: NetState) => s.isConnected === true && s.isInternetReachable !== false;

export function SyncBar({ openDb, userId, onOpen, pollMs = 5000, netInfo = NetInfo }: SyncBarProps) {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // Polling must not re-render when nothing changed.
    const put = (next: SyncStatus) =>
      setStatus((prev) =>
        prev && prev.readFailed === next.readFailed && JSON.stringify(prev.counts) === JSON.stringify(next.counts) ? prev : next,
      );
    const read = async () => {
      let counts = EMPTY;
      let readFailed = false;
      try {
        counts = await countByStatus(await openDb(), userId);
      } catch {
        readFailed = true;
      }
      if (!cancelled) {
        put({ counts, attention: [], loaded: true, readFailed, userId, lastPull: null, mirror: null, last: null, running: false });
      }
    };
    void read();
    const timer = setInterval(() => void read(), pollMs);
    const unsubscribe = netInfo.addEventListener((state) => {
      if (cancelled) return;
      setOnline(isOnline(state));
      void read();
    });
    return () => {
      cancelled = true;
      clearInterval(timer);
      unsubscribe();
    };
  }, [openDb, userId, pollMs, netInfo]);

  if (!status) return null;
  const text = `${online ? '' : 'Offline · '}${syncLine(status)}`;
  const needs = status.counts.conflict + status.counts.rejected > 0;

  return (
    <SafeAreaView edges={['bottom']} style={styles.safe}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Sync status: ${text}. Opens sync details`}
        accessibilityLiveRegion="polite"
        onPress={onOpen}
        style={styles.bar}
      >
        <View style={styles.inner}>
          <Icon
            name={needs ? 'attention' : !online ? 'offline' : status.counts.pending + status.counts.syncing + status.counts.failed > 0 ? 'sending' : 'synced'}
            color={needs ? colors.redDeep : tone.wait}
            size={18}
          />
          <Text style={[styles.text, needs && styles.attention]} numberOfLines={2}>
            {text}
          </Text>
        </View>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: colors.cream },
  bar: { minHeight: minTarget, paddingHorizontal: 16, justifyContent: 'center', alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.hair },
  inner: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  text: { fontSize: type.small, color: colors.ink, textAlign: 'center', flexShrink: 1 },
  attention: { color: colors.redDeep, fontWeight: '600' },
});
