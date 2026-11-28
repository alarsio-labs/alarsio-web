// "Today": the signed-in supervisor's day at a glance, one card per site with
// check-in, register and report, and the sync status underneath. It also starts
// the sync engine for the user. Owner: Offline Sync (Nikhil). Issues #14, #47,
// #68; the Today layout is the mobile pilot polish (A8).
//
// Every figure is read from the device database, so it works with no signal.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, StyleSheet, View } from 'react-native';

import type { PublicConfigResult } from '../config/public-config';
import type { DeviceDb } from '../db/device-db';
import { dayLabel, reportCardStatus } from '../reports/report';
import type { SyncHandle, SyncStatus } from '../sync/engine';
import { setActiveSync } from '../sync/request-sync';
import { istDate } from '../sync/pull';
import { syncChip } from '../sync/status-text';
import { readToday, type TodayData, type TodaySite } from '../today/read-today';
import { StartupError } from './StartupError';
import { SyncPanel } from './SyncPanel';
import { colors, space } from '../theme';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { Icon, type IconName } from '../ui/Icon';
import { Screen } from '../ui/Screen';
import { StatusBadge } from '../ui/StatusBadge';
import { Text } from '../ui/Text';
import { ListRow } from '../ui/ListRow';

type DbStatus =
  | { kind: 'opening' }
  | { kind: 'ready' }
  | { kind: 'failed'; message: string };

export interface HomeScreenProps {
  /** Opens the device database. Injected so tests need no native SQLite. */
  openDb: () => Promise<DeviceDb>;
  /** Starts syncing once the database is open. Absent when the app has no config. */
  startSync?: (db: DeviceDb, userId: string) => SyncHandle;
  /**
   * The user signed in on the phone. Sync starts only for a user: with none,
   * there is no engine and no sync panel, never one that covers every user
   * (ADR-020, ADR-029).
   */
  userId?: string;
  config: PublicConfigResult;
  /** Opens check-in for a site (#79). */
  onOpenCheckIn?: (siteId: string) => void;
  /** Opens the day register for a site (#79). */
  onOpenRegister?: (siteId: string) => void;
  /** Opens today's report for a site (#81). */
  onOpenReport?: (siteId: string) => void;
  /** Opens the list of daily reports, with the unfinished ones (#81). */
  onOpenReports?: () => void;
  /** Opens the Materials screens (#82). */
  onOpenMaterials?: () => void;
  /** Opens the screen for a record that needs attention (A14). */
  onOpenRoute?: (route: string) => void;
  /** The phone's clock. Tests pass their own. */
  now?: () => Date;
  /** How often Today re-reads the phone, so a check-in or a verdict shows. 0 turns it off. */
  pollMs?: number;
}

export function HomeScreen({
  openDb,
  startSync,
  userId,
  config,
  onOpenCheckIn,
  onOpenRegister,
  onOpenReport,
  onOpenReports,
  onOpenMaterials,
  onOpenRoute,
  now = () => new Date(),
  pollMs = 3000,
}: HomeScreenProps) {
  const { t } = useTranslation();
  const [db, setDb] = useState<DbStatus>({ kind: 'opening' });
  const [opened, setOpened] = useState<DeviceDb | null>(null);
  const [sync, setSync] = useState<SyncStatus | null>(null);
  const [today, setToday] = useState<TodayData | null>(null);
  const handleRef = useRef<SyncHandle | null>(null);
  const snapshot = useRef('');
  const day = istDate(now().toISOString());

  useEffect(() => {
    let cancelled = false;
    let handle: SyncHandle | null = null;
    openDb().then(
      (database) => {
        if (cancelled) return;
        setDb({ kind: 'ready' });
        setOpened(database);
        if (startSync && userId) {
          handle = startSync(database, userId);
          handleRef.current = handle;
          setActiveSync(handle);
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
      setActiveSync(null);
      // The previous user's panel and cards must not stay on screen while the
      // next user's engine starts.
      setSync(null);
      setToday(null);
      snapshot.current = '';
    };
  }, [openDb, startSync, userId]);

  const refresh = useCallback(async () => {
    if (!opened || !userId) return;
    try {
      const read = await readToday(opened, userId, day);
      const text = JSON.stringify(read);
      if (text === snapshot.current) return;
      snapshot.current = text;
      setToday(read);
    } catch {
      // Cards that cannot be read stay as they were; the sync panel still shows.
    }
  }, [opened, userId, day]);

  useEffect(() => {
    const first = setTimeout(() => void refresh(), 0);
    const tick = opened && pollMs > 0 ? setInterval(() => void refresh(), pollMs) : undefined;
    return () => {
      clearTimeout(first);
      if (tick) clearInterval(tick);
    };
  }, [opened, refresh, pollMs]);

  const syncNow = () => void handleRef.current?.retryNow().catch(() => undefined);

  return (
    <Screen refreshControl={<RefreshControl refreshing={false} onRefresh={syncNow} />}>
      {userId && (
        <Text variant="small" color={colors.muted}>
          {dayLabel(day)}
        </Text>
      )}
      {sync && <SyncChip status={sync} />}

      {!config.ok && <StartupError detail={`Missing: ${config.missing.join(', ')}`} />}
      {db.kind === 'failed' && <StartupError detail={db.message} />}

      {userId && today && today.sites.length === 0 && <EmptyState title={t('home.noSites')} hint={t('home.noSitesHint')} />}

      {userId &&
        today?.sites.map((row) => (
          <SiteCard
            key={row.site.id}
            row={row}
            onCheckIn={() => onOpenCheckIn?.(row.site.id)}
            onRegister={() => onOpenRegister?.(row.site.id)}
            onReport={() => onOpenReport?.(row.site.id)}
          />
        ))}

      {userId && today && today.unfinished.length > 0 && onOpenReports && (
        <Button
          kind="secondary"
          icon="report"
          accessibilityRole="link"
          label={t('home.unfinished', { count: today.unfinished.length })}
          accessibilityLabel={t('home.unfinishedLabel', { count: today.unfinished.length })}
          onPress={onOpenReports}
        />
      )}

      {userId && onOpenMaterials && <Button kind="secondary" icon="materials" label={t('home.materials')} onPress={onOpenMaterials} />}

      {sync && <SyncPanel status={sync} onSyncNow={syncNow} openRoute={onOpenRoute} />}
    </Screen>
  );
}

/** Always on Today, under the date: whether this phone's records are on the server. */
function SyncChip({ status }: { status: SyncStatus }) {
  const { t } = useTranslation();
  const chip = syncChip(status);
  return (
    <View accessibilityLabel={t('home.syncLabel', { text: chip.text })} accessibilityLiveRegion="polite" accessible>
      <StatusBadge tone={chip.tone} label={chip.text} icon={chip.tone === 'ok' ? 'synced' : chip.tone === 'wait' ? 'sending' : 'attention'} />
    </View>
  );
}

function SiteCard({
  row,
  onCheckIn,
  onRegister,
  onReport,
}: {
  row: TodaySite;
  onCheckIn: () => void;
  onRegister: () => void;
  onReport: () => void;
}) {
  const { t } = useTranslation();
  const report = reportCardStatus(row.report);
  const checkIn = row.checkedIn ? t('home.checkedIn') : t('home.notCheckedIn');
  const register = t('home.register', { marked: row.register.marked, total: row.register.total });

  return (
    <Card>
      <Text variant="heading" bold accessibilityRole="header">
        {row.site.name}
      </Text>
      <CardRow icon="checkIn" label={t('home.checkIn')} value={checkIn} tone={row.checkedIn ? 'ok' : undefined} site={row.site.name} onPress={onCheckIn} />
      <CardRow icon="register" label={t('home.registerLabel')} value={register} site={row.site.name} onPress={onRegister} />
      <CardRow icon="report" label={t('home.report')} value={report.text} tone={report.tone ?? undefined} site={row.site.name} onPress={onReport} />
    </Card>
  );
}

function CardRow({
  icon,
  label,
  value,
  site,
  tone,
  onPress,
}: {
  icon: IconName;
  label: string;
  value: string;
  site: string;
  tone?: 'ok' | 'wait' | 'attention';
  onPress: () => void;
}) {
  return (
    <ListRow
      title={label}
      accessibilityLabel={`${site}. ${label}: ${value}`}
      onPress={onPress}
      trailing={
        <View style={styles.value}>
          <Icon name={icon} color={colors.muted} />
          {tone ? <StatusBadge tone={tone} label={value} /> : <Text variant="small" color={colors.muted}>{value}</Text>}
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  value: { flexShrink: 1, alignItems: 'flex-end', gap: space.xs },
});
