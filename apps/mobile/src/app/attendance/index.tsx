// The sites a supervisor can check in to. Owner: Attendance (Manish). Issue #79.
// Reached from the home screen, so the sign-in gate in _layout.tsx has already let the user through.

import { router } from 'expo-router';

import { useSessionUser } from '../../auth/session-user';
import { openAppDb } from '../../lib/app-db';
import { AttendanceSitesScreen } from '../../screens/AttendanceSitesScreen';

const openSite = (siteId: string) => router.push({ pathname: '/attendance/[siteId]', params: { siteId } });

export default function AttendanceRoute() {
  const user = useSessionUser();
  // No user, no screen: never one that falls back to every user's sites (ADR-020).
  if (!user) return null;
  return <AttendanceSitesScreen openDb={openAppDb} userId={user.id} onOpenSite={openSite} />;
}
