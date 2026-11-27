// The sites a supervisor can check in to, from the offline copy on the phone.
// Owner: Attendance (Manish). Issue #79, ADR-034. Reads only this user's mirror.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import type { DeviceDb } from '../db/device-db';
import i18n from '../i18n';
import { readSites, type MirrorSite } from '../sync/pull';
import { colors, space, type Tone } from '../theme';
import { EmptyState } from '../ui/EmptyState';
import { ListRow } from '../ui/ListRow';
import { Screen } from '../ui/Screen';
import { StatusBadge } from '../ui/StatusBadge';
import { Text } from '../ui/Text';
import { LoadFailed } from './LoadFailed';
import { ScreenTitle } from './ScreenTitle';

export interface AttendanceSitesScreenProps {
  openDb: () => Promise<DeviceDb>;
  /** The signed-in user. Another user's copy of the sites reads as nothing (ADR-023). */
  userId: string;
  onOpenSite: (siteId: string) => void;
}

type Load = { kind: 'loading' } | { kind: 'failed' } | { kind: 'ready'; sites: MirrorSite[] };

const SITE_STATUS = {
  planned: 'attendance.siteStatus.planned',
  active: 'attendance.siteStatus.active',
  paused: 'attendance.siteStatus.paused',
  completed: 'attendance.siteStatus.completed',
  archived: 'attendance.siteStatus.archived',
} as const;

const SITE_TONE: Record<string, Tone> = { active: 'ok', paused: 'wait' };

function statusLabel(status: string): string {
  return Object.hasOwn(SITE_STATUS, status)
    ? i18n.t(SITE_STATUS[status as keyof typeof SITE_STATUS])
    : status.charAt(0).toUpperCase() + status.slice(1);
}

export function AttendanceSitesScreen({ openDb, userId, onOpenSite }: AttendanceSitesScreenProps) {
  const { t } = useTranslation();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  // Bumped by Try again, which reads the sites again.
  const [attempt, setAttempt] = useState(0);

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
  }, [openDb, userId, attempt]);

  const retry = () => {
    setLoad({ kind: 'loading' });
    setAttempt((n) => n + 1);
  };

  return (
    <Screen>
      <ScreenTitle screen="attendance_sites" />
      {load.kind === 'loading' && <Text color={colors.muted}>{t('common.loading')}</Text>}
      {load.kind === 'failed' && <LoadFailed message={t('attendance.sitesReadFailed')} onRetry={retry} />}
      {load.kind === 'ready' && load.sites.length === 0 && <EmptyState title={t('attendance.noSites')} />}
      {load.kind === 'ready' &&
        load.sites.map((site) => {
          const status = statusLabel(site.status);
          const labelKey = site.orgId === null ? 'attendance.siteLabelRefresh' : 'attendance.siteLabel';
          return (
            <ListRow
              key={site.id}
              title={site.name}
              hint={site.address}
              accessibilityLabel={t(labelKey, { name: site.name, status: status.toLowerCase() })}
              onPress={() => onOpenSite(site.id)}
              trailing={
                <View style={styles.badges}>
                  <StatusBadge tone={SITE_TONE[site.status] ?? 'neutral'} label={status} />
                  {site.orgId === null && <StatusBadge tone="attention" label={t('attendance.needsRefresh')} />}
                </View>
              }
            />
          );
        })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  badges: { gap: space.xs },
});
