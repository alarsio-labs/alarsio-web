// Sync status for the signed-in user: one line, the records that need attention,
// and Sync now. Owner: Offline Sync (Nikhil). Issues #68, #69 review.
//
// No edit button: a refused record is fixed by saving it again from its own
// capture screen, which re-queues it (ADR-016). The list scrolls inside a
// bounded box, so a long one cannot push Sync now off the screen.

import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { SyncStatus } from '../sync/engine';
import { entityLabel, pullLine, reasonText, syncLine } from '../sync/status-text';

export interface SyncPanelProps {
  status: SyncStatus;
  onSyncNow: () => void;
}

export function SyncPanel({ status, onSyncNow }: SyncPanelProps) {
  const needAttention = status.counts.conflict + status.counts.rejected;
  const notListed = Math.max(0, needAttention - status.attention.length);
  const label = status.running ? 'Sending…' : 'Sync now';

  return (
    <View style={styles.panel}>
      <Text style={styles.line} accessibilityLiveRegion="polite">
        {syncLine(status)}
      </Text>

      {status.attention.length > 0 && (
        <View style={styles.listBox}>
          <Text style={styles.heading}>Needs attention</Text>
          <ScrollView testID="attention-list" style={styles.list}>
            {status.attention.map((row) => (
              <View key={`${row.entity}:${row.recordId}`} style={styles.item}>
                <Text style={styles.itemTitle}>
                  {`${entityLabel(row.entity)} · ${row.status === 'conflict' ? 'Conflict' : 'Refused'}`}
                </Text>
                <Text style={styles.itemReason}>{reasonText(row.reason)}</Text>
              </View>
            ))}
          </ScrollView>
          {notListed > 0 && <Text style={styles.more}>{`and ${notListed} more`}</Text>}
        </View>
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: status.running }}
        disabled={status.running}
        onPress={onSyncNow}
        style={[styles.button, status.running && styles.buttonDisabled]}
      >
        <Text style={styles.buttonText}>{label}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { alignSelf: 'stretch', alignItems: 'center', gap: 12 },
  line: { fontSize: 16, textAlign: 'center' },
  listBox: { alignSelf: 'stretch', gap: 8 },
  list: { maxHeight: 240 },
  heading: { fontSize: 14, fontWeight: '600', color: '#b00020' },
  item: { borderLeftWidth: 3, borderLeftColor: '#b00020', paddingLeft: 8, marginBottom: 8 },
  itemTitle: { fontSize: 14, fontWeight: '500' },
  itemReason: { fontSize: 14, color: '#555' },
  more: { fontSize: 14, color: '#555' },
  button: {
    minHeight: 44,
    minWidth: 120,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // White on #767676 is 4.54:1, the WCAG AA minimum for normal text.
  buttonDisabled: { backgroundColor: '#767676' },
  buttonText: { color: '#fff', fontSize: 16 },
});
