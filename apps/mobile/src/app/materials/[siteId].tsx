// Record material movements at one site. Owner: Materials (Nikhil). Issue #82.

import { useLocalSearchParams } from 'expo-router';

import { useSessionUser } from '../../auth/session-user';
import { openAppDb } from '../../lib/app-db';
import { SiteMaterialsScreen } from '../../screens/SiteMaterialsScreen';

export default function SiteMaterialsRoute() {
  const user = useSessionUser();
  const { siteId } = useLocalSearchParams<{ siteId: string }>();
  if (!user || typeof siteId !== 'string') return null;
  return <SiteMaterialsScreen openDb={openAppDb} userId={user.id} siteId={siteId} />;
}
