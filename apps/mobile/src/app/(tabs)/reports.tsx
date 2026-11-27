// The sites a supervisor can file a daily report for. Owner: Daily Reporting (Anuradha). Issue #81.
// Reached from the home screen, so the sign-in gate in _layout.tsx has already let the user through.

import { router } from 'expo-router';

import { useSessionUser } from '../../auth/session-user';
import { openAppDb } from '../../lib/app-db';
import { ReportSitesScreen } from '../../screens/ReportSitesScreen';

const openReport = (siteId: string, date: string) =>
  router.push({ pathname: '/reports/[siteId]', params: { siteId, date } });

export default function ReportsRoute() {
  const user = useSessionUser();
  // No user, no screen: never one that falls back to every user's reports (ADR-020).
  if (!user) return null;
  return <ReportSitesScreen openDb={openAppDb} userId={user.id} onOpenReport={openReport} />;
}
