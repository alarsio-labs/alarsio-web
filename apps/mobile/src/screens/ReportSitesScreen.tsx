// The sites a supervisor can file today's report for, and their unfinished reports
// from earlier days. Owner: Daily Reporting (Anuradha). Issue #81, ADR-036. Reads
// only this user's copy of the sites and this user's reports.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import type { DeviceDb } from '../db/device-db';
import { dayLabel, reportCardStatus } from '../reports/report';
import { findReport, listUnfinished, type StoredReport } from '../reports/report-store';
import { istDate, readSites, type MirrorSite } from '../sync/pull';
import { colors, space } from '../theme';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { Icon } from '../ui/Icon';
import { Screen } from '../ui/Screen';
import { StatusBadge } from '../ui/StatusBadge';
import { Text } from '../ui/Text';
import { LoadFailed } from './LoadFailed';
import { ScreenTitle } from './ScreenTitle';

export interface ReportSitesScreenProps {
  openDb: () => Promise<DeviceDb>;
  /** The signed-in user. Another user's copy of the sites reads as nothing (ADR-023). */
  userId: string;
  onOpenReport: (siteId: string, date: string) => void;
  /** The phone's clock. Tests pass their own. */
  now?: () => Date;
  /** How often the list re-reads the phone, so a report saved or answered shows. 0 turns it off. */
  pollMs?: number;
}

interface SiteRow {
  site: MirrorSite;
  today: StoredReport | null;
}

type Load =
  | { kind: 'loading' }
  | { kind: 'failed' }
  | { kind: 'ready'; rows: SiteRow[]; unfinished: StoredReport[] };

export function ReportSitesScreen({ openDb, userId, onOpenReport, now = () => new Date(), pollMs = 3000 }: ReportSitesScreenProps) {
  const { t } = useTranslation();
  const [db, setDb] = useState<DeviceDb | null>(null);
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const alive = useRef(true);
  const snapshot = useRef('');
  const today = istDate(now().toISOString());

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Bumped by Try again: opens the database again if that is what failed.
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    openDb().then(
      (opened) => {
        if (alive.current) setDb(opened);
      },
      // A fixed sentence: the error can name files (ADR-029).
      () => {
        if (alive.current) setLoad({ kind: 'failed' });
      },
    );
  }, [openDb, attempt]);

  const refresh = useCallback(async () => {
    if (!db) return;
    try {
      const sites = await readSites(db, userId);
      const rows: SiteRow[] = [];
      for (const site of sites) rows.push({ site, today: await findReport(db, userId, site.id, today) });
      // An unfinished report for a site no longer on the phone cannot be opened: leave it out.
      const held = new Set(sites.map((s) => s.id));
      const unfinished = (await listUnfinished(db, userId, today)).filter((r) => held.has(r.report.siteId));
      if (!alive.current) return;
      const read = JSON.stringify([rows, unfinished]);
      if (read === snapshot.current) return;
      snapshot.current = read;
      setLoad({ kind: 'ready', rows, unfinished });
    } catch {
      snapshot.current = '';
      if (alive.current) setLoad({ kind: 'failed' });
    }
  }, [db, userId, today]);

  // Try again: open the database again if it failed to open, and read the records again.
  const retry = () => {
    snapshot.current = '';
    setAttempt((n) => n + 1);
    void refresh();
  };

  useEffect(() => {
    const first = setTimeout(() => void refresh(), 0);
    const tick = db && pollMs > 0 ? setInterval(() => void refresh(), pollMs) : undefined;
    return () => {
      clearTimeout(first);
      if (tick) clearInterval(tick);
    };
  }, [db, refresh, pollMs]);

  const siteName = (siteId: string) =>
    load.kind === 'ready' ? (load.rows.find((r) => r.site.id === siteId)?.site.name ?? '') : '';

  return (
    <Screen>
      <ScreenTitle screen="report_sites" />
      {load.kind === 'loading' && <Text>{t('common.loading')}</Text>}
      {load.kind === 'failed' && <LoadFailed message={t('reportSites.loadFailed')} onRetry={retry} />}
      {load.kind === 'ready' && load.rows.length === 0 && (
        <EmptyState title={t('reportSites.empty')} hint={t('reportSites.emptyHint')} />
      )}
      {load.kind === 'ready' && load.rows.length > 0 && (
        <>
          <Text variant="small" bold color={colors.muted} accessibilityRole="header">
            {t('reportSites.today', { day: dayLabel(today) })}
          </Text>
          {load.rows.map(({ site, today: stored }) => (
            <ReportRow
              key={site.id}
              title={site.name}
              status={reportCardStatus(stored)}
              onPress={() => onOpenReport(site.id, today)}
            />
          ))}

          {load.unfinished.length > 0 && (
            <Text variant="small" bold color={colors.muted} accessibilityRole="header">
              {t('reportSites.unfinished')}
            </Text>
          )}
          {load.unfinished.map((stored) => (
            <ReportRow
              key={stored.recordId}
              title={`${siteName(stored.report.siteId)}, ${dayLabel(stored.report.reportDate)}`}
              status={reportCardStatus(stored)}
              onPress={() => onOpenReport(stored.report.siteId, stored.report.reportDate)}
            />
          ))}
        </>
      )}
    </Screen>
  );
}

// A site (or a site and day) with where its report stands. The chip sits under the name, so a long
// status wraps instead of squeezing the name at 360 dp.
function ReportRow({ title, status, onPress }: { title: string; status: ReturnType<typeof reportCardStatus>; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${status.text}`}
      onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <Card style={styles.row}>
        <View style={styles.text}>
          <Text bold>{title}</Text>
          <StatusBadge tone={status.tone ?? 'neutral'} label={status.text} icon={status.tone ? undefined : 'report'} />
        </View>
        <Icon name="chevron" size={24} color={colors.muted} />
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: space.md },
  text: { flex: 1, gap: space.xs },
  pressed: { opacity: 0.85 },
});
