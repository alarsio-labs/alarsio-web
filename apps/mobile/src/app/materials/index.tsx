// The sites a supervisor can record materials at. Owner: Materials (Nikhil). Issue #82.

import { router } from 'expo-router';

import { useSessionUser } from '../../auth/session-user';
import { openAppDb } from '../../lib/app-db';
import { MaterialsSitesScreen } from '../../screens/MaterialsSitesScreen';

export default function MaterialsRoute() {
  const user = useSessionUser();
  if (!user) return null;
  return (
    <MaterialsSitesScreen
      openDb={openAppDb}
      userId={user.id}
      onOpenSite={(siteId) => router.push({ pathname: '/materials/[siteId]', params: { siteId } })}
    />
  );
}
