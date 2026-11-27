// Sync status for the signed-in user: one line, the records that need attention,
// and Sync now. Owner: Offline Sync (Nikhil). Issues #68, #69 review.
//
// No edit button of its own: a refused record is fixed by saving it again from
// its own capture screen, which re-queues it (ADR-016). A row that has a screen
// is tappable and opens it; a row with none (a photo) stays plain. The list scrolls inside a
// bounded box, so a long one cannot push Sync now off the screen.

import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';

import type { SyncStatus } from '../sync/engine';
import { attentionRoute } from '../sync/attention-route';
import { entityLabel, pullLine, reasonText, syncLine } from '../sync/status-text';
import { colors, space, tone } from '../theme';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { ListRow } from '../ui/ListRow';
import { Text } from '../ui/Text';

export interface SyncPanelProps {
  status: SyncStatus;
  onSyncNow: () => void;
  /** Opens the screen for a record that needs attention. Without it, rows stay plain. */
  openRoute?: (route: string) => void;
}

export function SyncPanel({ status, onSyncNow, openRoute }: SyncPanelProps) {
  const { t } = useTranslation();
  const needAttention = status.counts.conflict + status.counts.rejected;
  const notListed = Math.max(0, needAttention - status.attention.length);
  const label = status.running ? t('syncPanel.sending') : t('syncPanel.syncNow');
  const offline = pullLine(status.mirror, status.lastPull, new Date());

  return (
    <Card>
      <Text accessibilityLiveRegion="polite">{syncLine(status)}</Text>
      {offline && (
        <Text variant="small" color={colors.muted}>
          {offline}
        </Text>
      )}

      {status.attention.length > 0 && (
        <View style={styles.listBox}>
          <Text variant="small" bold color={tone.attention.text}>
            {t('syncPanel.needsAttention')}
          </Text>
          <ScrollView testID="attention-list" style={styles.list} nestedScrollEnabled>
            <View style={styles.items}>
              {status.attention.map((row) => {
                const title = `${entityLabel(row.entity)} · ${row.status === 'conflict' ? t('syncPanel.conflict') : t('syncPanel.refused')}`;
                const reason = reasonText(row.reason);
                const route = openRoute ? attentionRoute(row) : null;
                return (
                  <ListRow
                    key={`${row.entity}:${row.recordId}`}
                    title={title}
                    hint={reason}
                    accessibilityLabel={route ? t('syncPanel.opensRecord', { title, reason }) : `${title}. ${reason}`}
                    onPress={route && openRoute ? () => openRoute(route) : undefined}
                  />
                );
              })}
            </View>
          </ScrollView>
          {notListed > 0 && (
            <Text variant="small" color={colors.muted}>
              {t('syncPanel.more', { count: notListed })}
            </Text>
          )}
        </View>
      )}

      <Button kind="secondary" label={label} disabled={status.running} onPress={onSyncNow} />
    </Card>
  );
}

const styles = StyleSheet.create({
  listBox: { gap: space.sm },
  list: { maxHeight: 240 },
  items: { gap: space.sm },
});
