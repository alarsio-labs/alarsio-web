import type { SupabaseClient } from '@supabase/supabase-js';

import { SESSION_CHANGED, type SyncBatch, SyncTransportError } from '../sender';
import { supabaseTransport } from '../supabase-transport';

const USER_A = '11111111-0000-4000-8000-00000000000a';
const USER_B = '22222222-0000-4000-8000-00000000000b';
const batch: SyncBatch = { version: 1, device_id: 'dev', records: [] };

type FakeSession = { user: { id: string }; access_token: string } | null;

/** Just enough of a Supabase client: a stored session and an rpc builder. */
function fakeClient(session: FakeSession) {
  const headers: Record<string, string> = {};
  const rpc = jest.fn(() => {
    const builder = {
      setHeader: (name: string, value: string) => {
        headers[name] = value;
        return builder;
      },
      then: (resolve: (v: unknown) => unknown) => resolve({ data: { results: [] }, error: null }),
    };
    return builder;
  });
  const client = { auth: { getSession: async () => ({ data: { session } }) }, rpc };
  return { client: client as unknown as SupabaseClient, rpc, headers };
}

describe('supabaseTransport', () => {
  it("reports the stored session's user, or null when signed out", async () => {
    const signedIn = fakeClient({ user: { id: USER_A }, access_token: 't' });
    expect(await supabaseTransport(signedIn.client).currentUserId()).toBe(USER_A);
    expect(await supabaseTransport(fakeClient(null).client).currentUserId()).toBeNull();
  });

  it("sends with the author's own token, read in the same step as the check", async () => {
    const { client, rpc, headers } = fakeClient({ user: { id: USER_A }, access_token: 'token-a' });

    expect(await supabaseTransport(client).push(batch, USER_A)).toEqual({ results: [] });

    expect(rpc).toHaveBeenCalledWith('sync_push', { p_batch: batch });
    expect(headers.Authorization).toBe('Bearer token-a');
  });

  it('refuses to send when someone else, or no one, is signed in', async () => {
    const sessions: FakeSession[] = [{ user: { id: USER_B }, access_token: 'token-b' }, null];
    for (const session of sessions) {
      const { client, rpc } = fakeClient(session);
      const push = supabaseTransport(client).push(batch, USER_A);
      await expect(push).rejects.toBeInstanceOf(SyncTransportError);
      await expect(push).rejects.toMatchObject({ reason: SESSION_CHANGED });
      expect(rpc).not.toHaveBeenCalled();
    }
  });
});
