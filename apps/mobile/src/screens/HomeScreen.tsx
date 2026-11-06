// "Today": the signed-in supervisor's day at a glance, one card per site with
// check-in, register and report, and the sync status underneath. It also starts
// the sync engine for the user. Owner: Offline Sync (Nikhil). Issues #14, #47,
// #68; the Today layout is the mobile pilot polish (A8).
//
// Every figure is read from the device database, so it works with no signal.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { PublicConfigResult } from '../config/public-config';
import type { DeviceDb } from '../db/device-db';
import { dayLabel, reportCardStatus, type ReportTone } from '../reports/report';
import type { SyncHandle, SyncStatus } from '../sync/engine';
import { istDate } from '../sync/pull';
import { syncChip, type SyncChipTone } from '../sync/status-text';
import { readToday, type TodayData, type TodaySite } from '../today/read-today';
import { StartupError } from './StartupError';
import { SyncPanel } from './SyncPanel';
import { colors, fonts, primaryTarget, radius, space, surface, tone, type } from '../theme';
import { Icon, type IconName } from '../ui/Icon';
import { Pill } from '../ui/Pill';

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

const toneStyle: Record<ReportTone, { color: string }> = {
  wait: { color: tone.wait },
  ok: { color: tone.ok },
  attention: { color: tone.attention },
};

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
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={false} onRefresh={syncNow} />}
      >
        <Text style={styles.title} accessibilityRole="header">
          Today
        </Text>
        {userId && <Text style={styles.sub}>{dayLabel(day)}</Text>}
        {sync && <SyncChip status={sync} />}

        {!config.ok && <StartupError detail={`Missing: ${config.missing.join(', ')}`} />}
        {db.kind === 'failed' && <StartupError detail={db.message} />}

        {userId && today && today.sites.length === 0 && (
          <Text style={styles.line}>No sites yet. Pull to refresh, or ask your manager to add you to a site.</Text>
        )}

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
          <Pill
            kind="line"
            icon="report"
            accessibilityRole="link"
            label={`Not finished reports (${today.unfinished.length})`}
            accessibilityLabel={`Not finished reports: ${today.unfinished.length}`}
            onPress={onOpenReports}
          />
        )}

        {userId && onOpenMaterials && <Pill kind="ink" icon="materials" label="Materials" onPress={onOpenMaterials} />}

        {sync && <SyncPanel status={sync} onSyncNow={syncNow} openRoute={onOpenRoute} />}
      </ScrollView>
    </SafeAreaView>
  );
}

const CHIP: Record<SyncChipTone, { color: string; bg: string; icon: IconName }> = {
  ok: { color: tone.ok, bg: '#e6f2e7', icon: 'synced' },
  wait: { color: tone.wait, bg: '#fbefd6', icon: 'sending' },
  attention: { color: tone.attention, bg: colors.redTint, icon: 'attention' },
};

/** Always on Today, under the date: whether this phone's records are on the server. */
function SyncChip({ status }: { status: SyncStatus }) {
  const chip = syncChip(status);
  const look = CHIP[chip.tone];
  return (
    <View
      accessible
      accessibilityLabel={`Sync: ${chip.text}`}
      accessibilityLiveRegion="polite"
      style={[styles.chip, { backgroundColor: look.bg }]}
    >
      <Icon name={look.icon} color={look.color} size={18} />
      <Text style={[styles.chipText, { color: look.color }]}>{chip.text}</Text>
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
  const report = reportCardStatus(row.report);
  const checkIn = row.checkedIn ? 'Checked in ✓' : 'Not checked in';
  const register = `Register ${row.register.marked} / ${row.register.total}`;

  return (
    <View style={styles.card}>
      <Text style={styles.siteName} accessibilityRole="header">
        {row.site.name}
      </Text>
      <CardRow icon="checkIn" label="Check in" value={checkIn} done={row.checkedIn} site={row.site.name} onPress={onCheckIn} />
      <CardRow icon="register" label="Register" value={register} site={row.site.name} onPress={onRegister} />
      <CardRow icon="report" label="Report" value={report.text} tone={report.tone} site={row.site.name} onPress={onReport} />
    </View>
  );
}

function CardRow({
  icon,
  label,
  value,
  site,
  done,
  tone: rowTone,
  onPress,
}: {
  icon: IconName;
  label: string;
  value: string;
  site: string;
  done?: boolean;
  tone?: ReportTone | null;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${site}. ${label}: ${value}`}
      onPress={onPress}
      style={styles.row}
    >
      <View style={styles.rowHead}>
        <Icon name={icon} color={colors.muted} />
        <Text style={styles.rowLabel}>{label}</Text>
      </View>
      <Text style={[styles.rowValue, done && { color: tone.ok }, rowTone ? toneStyle[rowTone] : null]}>{value}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: surface.ground },
  content: { padding: space.lg, gap: space.md },
  title: { fontFamily: fonts.display, fontSize: 40, lineHeight: 44, color: colors.ink, textTransform: 'uppercase' },
  sub: { fontSize: type.small, color: colors.muted },
  line: { fontSize: type.body, color: colors.ink },
  chip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 2,
    paddingHorizontal: space.md,
    paddingVertical: space.xs + 2,
    borderRadius: radius.pill,
  },
  chipText: { fontSize: type.small, fontWeight: '600' },
  card: {
    backgroundColor: surface.card,
    borderWidth: 1,
    borderColor: colors.hair,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    gap: space.xs,
  },
  siteName: { fontSize: 17, fontWeight: '700', color: colors.ink, marginBottom: space.xs },
  row: {
    minHeight: primaryTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(23, 23, 23, 0.08)',
  },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  rowLabel: { fontSize: type.body, color: colors.ink },
  rowValue: { flexShrink: 1, fontSize: type.small, color: colors.muted, textAlign: 'right' },
});
