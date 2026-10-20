// Check in and check out at one site. Owner: Attendance (Manish). Issue #79.

import { useLocalSearchParams } from 'expo-router';

import { expoLocationProvider } from '../../attendance/location';
import { useSessionUser } from '../../auth/session-user';
import { openAppDb } from '../../lib/app-db';
import { SiteAttendanceScreen } from '../../screens/SiteAttendanceScreen';

// Module-level, so the reference is stable across renders.
const location = expoLocationProvider();

export default function SiteAttendanceRoute() {
  const user = useSessionUser();
  const { siteId } = useLocalSearchParams<{ siteId: string }>();
  if (!user || typeof siteId !== 'string') return null;
  return <SiteAttendanceScreen openDb={openAppDb} userId={user.id} siteId={siteId} location={location} />;
}
