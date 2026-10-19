// Sync status for the signed-in user: one line, the records that need attention,
// and Sync now. Owner: Offline Sync (Nikhil). Issue #68.
//
// No edit button: a refused record is fixed by saving it again from its own
// capture screen, which re-queues it (ADR-016).

import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { SyncStatus } from '../sync/engine';
import { entityLabel, pullLine, reasonText, syncLine } from '../sync/status-text';

export interface SyncPanelProps {
  status: SyncStatus;
  onSyncNow: () => void;
}

export function SyncPanel({ status, onSyncNow }: SyncPanelProps) {
  const offline = pullLine(status.mirror, status.lastPull, new Date());
  return (
    <View style={styles.panel}>
      <Text style={styles.line}>{syncLine(status)}</Text>
      {offline && <Text style={styles.subline}>{offline}</Text>}

      {status.attention.length > 0 && (
        <View style={styles.list}>
          <Text style={styles.heading}>Needs attention</Text>
          {status.attention.map((row) => (
            <View key={`${row.entity}:${row.recordId}`} style={styles.item}>
              <Text style={styles.itemTitle}>
                {`${entityLabel(row.entity)} · ${row.status === 'conflict' ? 'Conflict' : 'Refused'}`}
              </Text>
              <Text style={styles.itemReason}>{reasonText(row.reason)}</Text>
            </View>
          ))}
        </View>
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Sync now"
        accessibilityState={{ disabled: status.running }}
        disabled={status.running}
        onPress={onSyncNow}
        style={[styles.button, status.running && styles.buttonDisabled]}
      >
        <Text style={styles.buttonText}>{status.running ? 'Sending…' : 'Sync now'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { alignSelf: 'stretch', alignItems: 'center', gap: 12 },
  line: { fontSize: 16, textAlign: 'center' },
  subline: { fontSize: 14, color: '#555', textAlign: 'center' },
  list: { alignSelf: 'stretch', gap: 8 },
  heading: { fontSize: 14, fontWeight: '600', color: '#b00020' },
  item: { borderLeftWidth: 3, borderLeftColor: '#b00020', paddingLeft: 8 },
  itemTitle: { fontSize: 14, fontWeight: '500' },
  itemReason: { fontSize: 14, color: '#555' },
  button: {
    minHeight: 44,
    minWidth: 120,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: { backgroundColor: '#999' },
  buttonText: { color: '#fff', fontSize: 16 },
});
