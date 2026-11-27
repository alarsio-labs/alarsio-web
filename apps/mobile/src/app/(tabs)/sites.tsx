// The Sites tab. The sign-in gate in _layout.tsx has already let the user through.

import { router } from 'expo-router';

import { useSessionUser } from '../../auth/session-user';
import { openAppDb } from '../../lib/app-db';
import { SitesScreen } from '../../screens/SitesScreen';

export default function SitesRoute() {
  const user = useSessionUser();
  // No user, no screen: never one that falls back to every user's sites (ADR-020).
  if (!user) return null;
  return (
    <SitesScreen
      openDb={openAppDb}
      userId={user.id}
      onOpenCheckIn={(siteId) => router.push({ pathname: '/attendance/[siteId]', params: { siteId } })}
      onOpenRegister={(siteId) => router.push({ pathname: '/attendance/register/[siteId]', params: { siteId } })}
      onOpenReport={(siteId) => router.push({ pathname: '/reports/[siteId]', params: { siteId } })}
      onOpenMaterials={(siteId) => router.push({ pathname: '/materials/[siteId]', params: { siteId } })}
    />
  );
}
