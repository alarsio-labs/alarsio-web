// File the daily report for one site and day. Owner: Daily Reporting (Anuradha). Issue #81.

import { useLocalSearchParams } from 'expo-router';

import { useSessionUser } from '../../auth/session-user';
import { openAppDb } from '../../lib/app-db';
import { DailyReportScreen } from '../../screens/DailyReportScreen';

export default function DailyReportRoute() {
  const user = useSessionUser();
  const { siteId, date } = useLocalSearchParams<{ siteId: string; date?: string }>();
  if (!user || typeof siteId !== 'string') return null;
  // The screen checks the day itself and falls back to today (D2).
  return (
    <DailyReportScreen openDb={openAppDb} userId={user.id} siteId={siteId} date={typeof date === 'string' ? date : undefined} />
  );
}
