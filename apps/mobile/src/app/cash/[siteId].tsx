// The site cash book. Owner: Offline Sync (Nikhil). Issue #258.

import { useLocalSearchParams } from 'expo-router';

import { useSessionUser } from '../../auth/session-user';
import { openAppDb } from '../../lib/app-db';
import { SiteCashScreen } from '../../screens/SiteCashScreen';

export default function SiteCashRoute() {
  const user = useSessionUser();
  const { siteId } = useLocalSearchParams<{ siteId: string }>();
  // No user, no screen: never one that falls back to every user's records (ADR-020).
  if (!user || typeof siteId !== 'string') return null;
  return <SiteCashScreen openDb={openAppDb} userId={user.id} siteId={siteId} />;
}
