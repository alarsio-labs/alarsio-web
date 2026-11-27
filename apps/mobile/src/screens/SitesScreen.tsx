// The Sites tab: this user's sites from the offline copy, with a shortcut to each
// site's check-in, register, report and materials. Reads only the user's mirror
// (ADR-023); it writes nothing.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { DeviceDb } from '../db/device-db';
import { readSites, type MirrorSite } from '../sync/pull';
import { colors } from '../theme';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { ListRow } from '../ui/ListRow';
import { Screen } from '../ui/Screen';
import { Text } from '../ui/Text';
import { LoadFailed } from './LoadFailed';

export interface SitesScreenProps {
  openDb: () => Promise<DeviceDb>;
  /** The signed-in user. Another user's copy of the sites reads as nothing (ADR-023). */
  userId: string;
  onOpenCheckIn: (siteId: string) => void;
  onOpenRegister: (siteId: string) => void;
  onOpenReport: (siteId: string) => void;
  onOpenMaterials: (siteId: string) => void;
}

type Load = { kind: 'loading' } | { kind: 'failed' } | { kind: 'ready'; sites: MirrorSite[] };

export function SitesScreen({ openDb, userId, onOpenCheckIn, onOpenRegister, onOpenReport, onOpenMaterials }: SitesScreenProps) {
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

  const actions = (site: MirrorSite) =>
    [
      { key: 'checkIn', onPress: () => onOpenCheckIn(site.id) },
      { key: 'register', onPress: () => onOpenRegister(site.id) },
      { key: 'report', onPress: () => onOpenReport(site.id) },
      { key: 'materials', onPress: () => onOpenMaterials(site.id) },
    ] as const;

  return (
    <Screen>
      {load.kind === 'loading' && <Text color={colors.muted}>{t('common.loading')}</Text>}
      {load.kind === 'failed' && <LoadFailed message={t('sites.failed')} onRetry={retry} />}
      {load.kind === 'ready' && load.sites.length === 0 && <EmptyState title={t('sites.empty')} hint={t('sites.emptyHint')} />}
      {load.kind === 'ready' &&
        load.sites.map((site) => (
          <Card key={site.id}>
            <Text variant="heading" bold accessibilityRole="header">
              {site.name}
            </Text>
            {site.address ? (
              <Text variant="small" color={colors.muted}>
                {site.address}
              </Text>
            ) : null}
            {site.orgId === null && (
              <Text variant="small" color={colors.actionText}>
                {t('sites.needsRefresh')}
              </Text>
            )}
            {actions(site).map(({ key, onPress }) => (
              <ListRow
                key={key}
                title={t(`sites.${key}`)}
                accessibilityLabel={t('sites.rowLabel', { site: site.name, action: t(`sites.${key}`) })}
                onPress={onPress}
              />
            ))}
          </Card>
        ))}
    </Screen>
  );
}
