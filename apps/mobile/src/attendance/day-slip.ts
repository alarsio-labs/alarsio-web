// The day slip: one site's day as plain text for the phone's share sheet (#183). Owner:
// Attendance (Manish). Everything is read from this phone under the signed-in user, so it
// works with no signal. It says "Submitted" only where the report text does (ADR-009).

import type { DeviceDb } from '../db/device-db';
import i18n from '../i18n';
import { reportCardStatus } from '../reports/report';
import { findReport } from '../reports/report-store';
import { readHeadcount } from './headcount';
import { dayLabel } from './labels';
import { istDay, istTime } from './visit';
import { listVisits } from './visit-store';

const t = i18n.t.bind(i18n);

/** The slip for one site and one IST day, newest check-in last. */
export async function buildDaySlip(
  db: DeviceDb,
  userId: string,
  site: { id: string; name: string },
  date: string,
): Promise<string> {
  const [visits, headcount, report] = await Promise.all([
    listVisits(db, userId, site.id),
    readHeadcount(db, userId, site.id, date),
    findReport(db, userId, site.id, date),
  ]);

  const visitLines = visits
    .filter((v) => istDay(v.visit) === date)
    .reverse()
    .map(({ visit }) =>
      [
        t('attendance.checkedIn', { time: istTime(visit.checkIn.at) }),
        visit.checkOut ? t('attendance.checkedOut', { time: istTime(visit.checkOut.at) }) : null,
      ]
        .filter((part) => part !== null)
        .join(' · '),
    );

  const people = headcount
    ? [t('attendance.slipOnSite', { count: headcount.onSite }), headcount.halfDay > 0 ? t('attendance.slipHalfDay', { count: headcount.halfDay }) : null]
        .filter((part) => part !== null)
        .join(' · ')
    : t('attendance.slipNoAttendance');

  return [
    `${site.name} · ${dayLabel(date)}`,
    ...(visitLines.length > 0 ? visitLines : [t('attendance.slipNoCheckIn')]),
    people,
    t('attendance.slipReport', { status: reportCardStatus(report).text }),
  ].join('\n');
}
