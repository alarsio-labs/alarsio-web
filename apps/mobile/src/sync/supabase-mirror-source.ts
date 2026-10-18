// The real MirrorSource: reads the three sources over PostgREST, as the
// signed-in user, under RLS. Owner: Offline Sync (Nikhil). Issue #49.
//
// Each page reads the session once, refuses if it belongs to anyone else, and
// sends that session's own token, so a user switch cannot slip between the
// check and the query (ADR-020). supabase-js keeps an Authorization header
// that is already set.

import type { SupabaseClient } from '@supabase/supabase-js';

import type { MirrorKind, MirrorSource } from './pull';
import { SESSION_CHANGED, SyncTransportError } from './sender';

// Columns are named, never '*': a column added to a source later is not copied
// onto phones until someone decides it should be.
const SOURCES: Record<MirrorKind, { table: string; columns: string; key: string }> = {
  // BLOCKED: this reads the `sites` table, which ARCHITECTURE rule 4 does not
  // allow from another module. Sites publishes no view with name and status yet
  // (site_geofence has neither). Switch to the view asked for on #49 before this
  // merges; the PR stays a draft until then.
  sites: {
    table: 'sites',
    columns: 'id, name, address, latitude, longitude, geofence_radius_m, status',
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
    columns: 'assignment_id, worker_id, site_id, worker_code, name, trade',
    key: 'assignment_id',
  },
};

export function supabaseMirrorSource(supabase: SupabaseClient): MirrorSource {
  return {
    async currentUserId() {
      const { data } = await supabase.auth.getSession();
      return data.session?.user.id ?? null;
    },

    async fetchPage(kind, userId, from, to) {
      const { data: auth } = await supabase.auth.getSession();
      const session = auth.session;
      if (!session || session.user.id.toLowerCase() !== userId.toLowerCase()) {
        throw new SyncTransportError(SESSION_CHANGED);
      }

      const { table, columns, key } = SOURCES[kind];
      let query = supabase.from(table).select(columns);
      // Today's roster only: open assignments of active workers (#49, Ishant).
      if (kind === 'roster') query = query.is('unassigned_at', null).eq('status', 'active');
      const { data, error } = await query
        .order(key)
        .range(from, to)
        .setHeader('Authorization', `Bearer ${session.access_token}`);

      if (error) {
        const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
        throw new SyncTransportError(code ? `server:${String(code)}` : 'network');
      }
      return Array.isArray(data) ? data : [];
    },
  };
}
