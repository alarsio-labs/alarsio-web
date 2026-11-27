// The sites a supervisor can record materials at, from the offline copy on the phone.
// Owner: Materials (Nikhil). Issue #82. Reads only this user's mirror.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { DeviceDb } from '../db/device-db';
import { readSites, type MirrorSite } from '../sync/pull';
import { EmptyState } from '../ui/EmptyState';
import { ListRow } from '../ui/ListRow';
import { Screen } from '../ui/Screen';
import { Text } from '../ui/Text';
import { LoadFailed } from './LoadFailed';
import { ScreenTitle } from './ScreenTitle';

export interface MaterialsSitesScreenProps {
  openDb: () => Promise<DeviceDb>;
  /** The signed-in user. Another user's copy of the sites reads as nothing (ADR-023). */
  userId: string;
  onOpenSite: (siteId: string) => void;
}

type Load = { kind: 'loading' } | { kind: 'failed' } | { kind: 'ready'; sites: MirrorSite[] };

export function MaterialsSitesScreen({ openDb, userId, onOpenSite }: MaterialsSitesScreenProps) {
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
      <ScreenTitle screen="materials_sites" />
      {load.kind === 'loading' && <Text>{t('common.loading')}</Text>}
      {load.kind === 'failed' && <LoadFailed message={t('materialsSites.loadFailed')} onRetry={retry} />}
      {load.kind === 'ready' && load.sites.length === 0 && (
        <EmptyState title={t('materialsSites.empty')} hint={t('materialsSites.emptyHint')} />
      )}
      {load.kind === 'ready' &&
        load.sites.map((site) => (
          <ListRow key={site.id} title={site.name} hint={site.address} onPress={() => onOpenSite(site.id)} />
        ))}
    </Screen>
  );
}
