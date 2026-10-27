// The day register at one site. Owner: Attendance (Manish). Issue #79.

import { useLocalSearchParams } from 'expo-router';

import { useSessionUser } from '../../../auth/session-user';
import { openAppDb } from '../../../lib/app-db';
import { DayRegisterScreen } from '../../../screens/DayRegisterScreen';

export default function DayRegisterRoute() {
  const user = useSessionUser();
  const { siteId } = useLocalSearchParams<{ siteId: string }>();
  // No user, no screen: never one that falls back to every user's records (ADR-020).
  if (!user || typeof siteId !== 'string') return null;
  return <DayRegisterScreen openDb={openAppDb} userId={user.id} siteId={siteId} />;
}
