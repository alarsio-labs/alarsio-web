// Record worker advances at one site. Owner: Offline Sync (Nikhil). Issue #239.

import { useLocalSearchParams } from 'expo-router';

import { useSessionUser } from '../../auth/session-user';
import { openAppDb } from '../../lib/app-db';
import { SiteAdvancesScreen } from '../../screens/SiteAdvancesScreen';

export default function SiteAdvancesRoute() {
  const user = useSessionUser();
  const { siteId } = useLocalSearchParams<{ siteId: string }>();
  // No user, no screen: never one that falls back to every user's records (ADR-020).
  if (!user || typeof siteId !== 'string') return null;
  return <SiteAdvancesScreen openDb={openAppDb} userId={user.id} siteId={siteId} />;
}
