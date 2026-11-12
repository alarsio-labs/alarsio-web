// The real MirrorSource: reads the three sources over PostgREST, as the
// signed-in user, under RLS. Owner: Offline Sync (Nikhil). Issue #49.
//
// Pages go by key (`gt` + `order` + `limit`), not by offset, so a row added or
// removed between pages cannot make the next page skip a row or repeat one.
//
// Each page reads the session once, refuses if it belongs to anyone else, and
// sends that session's own token, so a user switch cannot slip between the
// check and the query (ADR-020). supabase-js keeps an Authorization header
// that is already set.

import type { SupabaseClient } from '@supabase/supabase-js';

import { istDate, type MirrorKind, type MirrorSource } from './pull';
import { SESSION_CHANGED, SyncTransportError } from './sender';

/**
 * How far back the roster mirror reaches for assignments that have ended. It is
 * what lets a supervisor back-fill a recent day offline and mark a worker who left
 * today (ADR-021 D10), without an ex-worker's name staying on the phone for good.
 * The approved days reach as far, since the register opens the same days (ADR-049).
 * A product choice, not one from the docs: it is asked about on #49.
 */
export const ROSTER_LOOKBACK_DAYS = 7;

/**
 * How far back the phone keeps its author's report statuses (#136, ADR-051): two weeks, so a
 * report sent back a few days after it was filed is still seen; older reports are read on the web.
 */
export const REPORT_LOOKBACK_DAYS = 14;

// Columns are named, never '*': a column added to a source later is not copied
// onto phones until someone decides it should be.
const SOURCES: Record<MirrorKind, { table: string; columns: string; key: string }> = {
  // Sites' published view (ADR-028), never the `sites` table: ARCHITECTURE rule 4.
  sites: {
    table: 'site_details',
    // org_id: every Attendance payload names the organisation (#79).
    columns: 'id, org_id, name, address, status, latitude, longitude, geofence_radius_m',
    key: 'id',
  },
  materials: {
    table: 'material_balances',
    columns: 'material_id, site_id, name, unit, low_stock_threshold, balance',
    key: 'material_id',
  },
  // Workforce's published view: no phone number, no rate (ADR-011).
  roster: {
    table: 'worker_roster',
    columns: 'assignment_id, worker_id, site_id, worker_code, name, trade, assigned_at, unassigned_at',
    key: 'assignment_id',
  },
  // Attendance's published view (ADR-032), never attendance_entries or attendance_days:
  // ARCHITECTURE rule 4. entry_id is its key (ADR-049); approved_by and org_id stay behind.
  approved_days: {
    table: 'approved_attendance_days',
    columns: 'entry_id, site_id, worker_id, work_date, status, overtime_hours, approved_at',
    key: 'entry_id',
  },
  // Daily Reporting's published view (ADR-025, ADR-042), never daily_reports: ARCHITECTURE rule 4.
  // Only the columns the phone shows; the author's own rows only (filtered below, RLS beneath).
  report_status: {
    table: 'daily_report_status',
    columns: 'id, site_id, report_date, status, review_note, reviewed_at',
    key: 'id',
  },
};

export interface MirrorSourceOptions {
  /** The clock, for the roster window. Tests pass their own. */
  now?: () => Date;
}

/** The first Asia/Kolkata day of a window: `days` before today (ROSTER_LOOKBACK_DAYS by default). */
function windowFirstDay(now: Date, days = ROSTER_LOOKBACK_DAYS): string {
  const today = istDate(now.toISOString());
  return new Date(Date.parse(`${today}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);
}

/** The instant the roster window opens: the start of that day. */
function rosterWindowStart(now: Date): string {
  return new Date(`${windowFirstDay(now)}T00:00:00+05:30`).toISOString();
}

export function supabaseMirrorSource(
  supabase: SupabaseClient,
  { now = () => new Date() }: MirrorSourceOptions = {},
): MirrorSource {
  return {
    async currentUserId() {
      const { data } = await supabase.auth.getSession();
      return data.session?.user.id ?? null;
    },

    async fetchPage(kind, userId, after, limit) {
      const { data: auth } = await supabase.auth.getSession();
      const session = auth.session;
      if (!session || session.user.id.toLowerCase() !== userId.toLowerCase()) {
        throw new SyncTransportError(SESSION_CHANGED);
      }

      const { table, columns, key } = SOURCES[kind];
      let query = supabase.from(table).select(columns);
      // An archived site takes no records (can_record_on_site refuses it).
      if (kind === 'sites') query = query.neq('status', 'archived');
      // Active workers, on an open assignment or one closed within the window (ADR-021 D10).
      if (kind === 'roster') {
        query = query
          .eq('status', 'active')
          .or(`unassigned_at.is.null,unassigned_at.gte.${rosterWindowStart(now())}`);
      }
      // Approved days of the same window, so the phone holds the days its register can open (ADR-049).
      if (kind === 'approved_days') query = query.gte('work_date', windowFirstDay(now()));
      // The signed-in author's own reports of the last two weeks (ADR-051); RLS also lets a
      // manager see others', which the phone has no use for.
      if (kind === 'report_status') {
        query = query.eq('author_id', session.user.id).gte('report_date', windowFirstDay(now(), REPORT_LOOKBACK_DAYS));
      }
      if (after !== null) query = query.gt(key, after);
      const { data, error } = await query
        .order(key)
        .limit(limit)
        .setHeader('Authorization', `Bearer ${session.access_token}`);

      if (error) {
        const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
        throw new SyncTransportError(code ? `server:${String(code)}` : 'network');
      }
      return Array.isArray(data) ? data : [];
    },
  };
}
