// Where a "needs attention" record is opened and fixed. Owner: Offline Sync
// (Nikhil). A refused record is fixed by saving it again from its own capture
// screen (ADR-016), so each row leads to that screen. Pure: the panel does the
// navigating.

import type { AttentionRow } from './outbox';

/** The app route for a row, or null when there is no screen to open (no site, or a photo). */
export function attentionRoute(row: Pick<AttentionRow, 'entity' | 'siteId' | 'day'>): string | null {
  const { entity, siteId, day } = row;
  if (!siteId) return null;
  switch (entity) {
    case 'site_visits':
      return `/attendance/${siteId}`;
    case 'attendance_days':
    case 'attendance_entries':
    case 'attendance_corrections':
      // The register screen opens on today; it takes no day.
      return `/attendance/register/${siteId}`;
    case 'daily_reports':
      return day ? `/reports/${siteId}?date=${day}` : `/reports/${siteId}`;
    case 'material_transactions':
      return `/materials/${siteId}`;
    case 'report_photos':
      return null;
  }
}
