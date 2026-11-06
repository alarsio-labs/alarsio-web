// Sync status for the signed-in user: one line, the records that need attention,
// and Sync now. Owner: Offline Sync (Nikhil). Issues #68, #69 review.
//
// No edit button of its own: a refused record is fixed by saving it again from
// its own capture screen, which re-queues it (ADR-016). A row that has a screen
// is tappable and opens it; a row with none (a photo) stays plain. The list scrolls inside a
// bounded box, so a long one cannot push Sync now off the screen.

import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { SyncStatus } from '../sync/engine';
import { attentionRoute } from '../sync/attention-route';
import { entityLabel, pullLine, reasonText, syncLine } from '../sync/status-text';
import { colors } from '../theme';

export interface SyncPanelProps {
  status: SyncStatus;
  onSyncNow: () => void;
  /** Opens the screen for a record that needs attention. Without it, rows stay plain. */
  openRoute?: (route: string) => void;
}

export function SyncPanel({ status, onSyncNow, openRoute }: SyncPanelProps) {
  const needAttention = status.counts.conflict + status.counts.rejected;
  const notListed = Math.max(0, needAttention - status.attention.length);
  const label = status.running ? 'Sending…' : 'Sync now';
  const offline = pullLine(status.mirror, status.lastPull, new Date());

  return (
    <View style={styles.panel}>
      <Text style={styles.line} accessibilityLiveRegion="polite">
        {syncLine(status)}
      </Text>
      {offline && <Text style={styles.subline}>{offline}</Text>}

      {status.attention.length > 0 && (
        <View style={styles.listBox}>
          <Text style={styles.heading}>Needs attention</Text>
          <ScrollView testID="attention-list" style={styles.list}>
            {status.attention.map((row) => {
              const title = `${entityLabel(row.entity)} · ${row.status === 'conflict' ? 'Conflict' : 'Refused'}`;
              const body = (
                <>
                  <Text style={styles.itemTitle}>{title}</Text>
                  <Text style={styles.itemReason}>{reasonText(row.reason)}</Text>
                </>
              );
              const route = openRoute ? attentionRoute(row) : null;
              return route && openRoute ? (
                <Pressable
                  key={`${row.entity}:${row.recordId}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${title}. ${reasonText(row.reason)} Opens the record`}
                  onPress={() => openRoute(route)}
                  style={[styles.item, styles.itemTappable]}
                >
                  {body}
                </Pressable>
              ) : (
                <View key={`${row.entity}:${row.recordId}`} style={styles.item}>
                  {body}
                </View>
              );
            })}
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
  subline: { fontSize: 14, color: colors.muted, textAlign: 'center' },
  listBox: { alignSelf: 'stretch', gap: 8 },
  list: { maxHeight: 240 },
  heading: { fontSize: 14, fontWeight: '600', color: colors.redDeep },
  item: { borderLeftWidth: 3, borderLeftColor: colors.redDeep, paddingLeft: 8, marginBottom: 8 },
  itemTitle: { fontSize: 14, fontWeight: '500' },
  itemTappable: { minHeight: 44, justifyContent: 'center' },
  itemReason: { fontSize: 14, color: colors.muted },
  more: { fontSize: 14, color: colors.muted },
  button: {
    minHeight: 44,
    minWidth: 120,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // White on #767676 is 4.54:1, the WCAG AA minimum for normal text.
  buttonDisabled: { backgroundColor: colors.disabled },
  buttonText: { color: colors.white, fontSize: 16 },
});
