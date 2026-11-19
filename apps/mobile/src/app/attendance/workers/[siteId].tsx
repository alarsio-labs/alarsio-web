// One worker's month at a site. Owner: Attendance (Manish). Issue #234.

import { useLocalSearchParams } from 'expo-router';

import { useSessionUser } from '../../../auth/session-user';
import { openAppDb } from '../../../lib/app-db';
import { WorkerMonthScreen } from '../../../screens/WorkerMonthScreen';

export default function WorkerMonthRoute() {
  const user = useSessionUser();
  const { siteId } = useLocalSearchParams<{ siteId: string }>();
  // No user, no screen: never one that falls back to every user's records (ADR-020).
  if (!user || typeof siteId !== 'string') return null;
  return <WorkerMonthScreen openDb={openAppDb} userId={user.id} siteId={siteId} />;
}
