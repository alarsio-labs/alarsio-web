// The real SyncTransport: sync_push over Supabase RPC, as the signed-in user.
// Owner: Offline Sync (Nikhil). Issue #47.

import type { SupabaseClient } from '@supabase/supabase-js';

import type { SyncResultRow } from './entities';
import {
  SESSION_CHANGED,
  SyncTransportError,
  type PushResponse,
  type SyncBatch,
  type SyncTransport,
} from './sender';

export function supabaseTransport(supabase: SupabaseClient): SyncTransport {
  return {
    async currentUserId() {
      const { data } = await supabase.auth.getSession();
      return data.session?.user.id ?? null;
    },

    async push(batch: SyncBatch, userId: string): Promise<PushResponse> {
      // One session read decides both who is signed in and which token goes out,
      // so a user switch cannot slip between the check and the call (ADR-020).
      // supabase-js keeps an Authorization header that is already set.
      const { data: auth } = await supabase.auth.getSession();
      const session = auth.session;
      if (!session || session.user.id.toLowerCase() !== userId.toLowerCase()) {
        throw new SyncTransportError(SESSION_CHANGED);
      }
      const { data, error } = await supabase
        .rpc('sync_push', { p_batch: batch })
        .setHeader('Authorization', `Bearer ${session.access_token}`);
      if (error) {
        // A PostgREST error carries a SQLSTATE in `code` (28000: not signed in,
        // PT429: rate limit). A fetch that never reached the server has none.
        throw new SyncTransportError(error.code ? `server:${error.code}` : 'network');
      }
      return parseResponse(data);
    },
  };
}

function parseResponse(data: unknown): PushResponse {
  if (typeof data === 'object' && data !== null) {
    if ('results' in data && Array.isArray(data.results)) {
      // Each row's shape is the server's contract (#33); applyVerdicts ignores unknown keys.
      return { results: data.results as SyncResultRow[] };
    }
    if ('error' in data && data.error === 'invalid_envelope') {
      const reason = 'reason' in data && typeof data.reason === 'string' ? data.reason : 'unknown';
      return { error: 'invalid_envelope', reason };
    }
  }
  throw new SyncTransportError('bad_response');
}
