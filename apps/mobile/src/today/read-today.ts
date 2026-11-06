// What "Today" shows for each site: whether this user checked in, how much of
// the register is marked, and where today's report stands. Owner: Offline Sync
// (Nikhil), for the home screen. Read-only and offline: every figure comes from
// the device database, through the owning modules' own readers, under the
// signed-in user (ADR-020). Nothing is sent from here.

import { listVisits } from '../attendance/visit-store';
import { readRegister } from '../attendance/register-store';
import type { DeviceDb } from '../db/device-db';
import { findReport, listUnfinished, type StoredReport } from '../reports/report-store';
import { istDate, readSites, type MirrorSite } from '../sync/pull';

export interface TodaySite {
  site: MirrorSite;
  /** This user has a check-in at this site today (IST). */
  checkedIn: boolean;
  /** Workers with a mark today (on this phone, or approved by the server) out of the roster. */
  register: { marked: number; total: number };
  /** Today's report for this site, or null if none is started. */
  report: StoredReport | null;
}

export interface TodayData {
  sites: TodaySite[];
  /** Earlier days' reports still to finish, only for sites on this phone. */
  unfinished: StoredReport[];
}

export async function readToday(db: DeviceDb, userId: string, today: string): Promise<TodayData> {
  const sites = await readSites(db, userId);
  const rows: TodaySite[] = [];
  for (const site of sites) {
    const visits = await listVisits(db, userId, site.id);
    const register = await readRegister(db, userId, site.id, today);
    rows.push({
      site,
      checkedIn: visits.some((v) => istDate(v.visit.checkIn.at) === today),
      register: {
        marked: register.rows.filter((r) => r.entry !== null || r.approved !== null).length,
        total: register.rows.length,
      },
      report: await findReport(db, userId, site.id, today),
    });
  }
  const held = new Set(sites.map((s) => s.id));
  const unfinished = (await listUnfinished(db, userId, today)).filter((r) => held.has(r.report.siteId));
  return { sites: rows, unfinished };
}
