import type { SupabaseClient } from '@supabase/supabase-js';

import { SESSION_CHANGED, SyncTransportError } from '../sender';
import { supabaseMirrorSource } from '../supabase-mirror-source';

const USER_A = '11111111-0000-4000-8000-00000000000a';
const USER_B = '22222222-0000-4000-8000-00000000000b';

type FakeSession = { user: { id: string }; access_token: string } | null;

/** Records every builder call; resolves to `result` when awaited. */
function fakeClient(session: FakeSession, result: { data: unknown; error: unknown } = { data: [], error: null }) {
  const calls: (string | unknown[])[][] = [];
  const from = jest.fn((table: string) => {
    calls.push(['from', [table]]);
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'order', 'range', 'is', 'eq', 'setHeader']) {
      builder[method] = (...args: unknown[]) => {
        calls.push([method, args]);
        return builder;
      };
    }
    builder.then = (resolve: (v: unknown) => unknown) => resolve(result);
    return builder;
  });
  const client = { auth: { getSession: async () => ({ data: { session } }) }, from };
  return { client: client as unknown as SupabaseClient, from, calls };
}

const call = (calls: (string | unknown[])[][], method: string) => calls.find((c) => c[0] === method)?.[1];

describe('supabaseMirrorSource (#49)', () => {
  const signedInA = { user: { id: USER_A }, access_token: 'token-a' };

  it('reads sites with a stable order and the requested range, under the checked session', async () => {
    const { client, calls } = fakeClient(signedInA, { data: [{ id: 'x' }], error: null });

    expect(await supabaseMirrorSource(client).fetchPage('sites', USER_A, 0, 999)).toEqual([{ id: 'x' }]);

    expect(call(calls, 'from')).toEqual(['sites']);
    expect(call(calls, 'select')).toEqual(['id, name, address, latitude, longitude, geofence_radius_m, status']);
    expect(call(calls, 'order')).toEqual(['id']);
    expect(call(calls, 'range')).toEqual([0, 999]);
    expect(call(calls, 'setHeader')).toEqual(['Authorization', 'Bearer token-a']);
  });

  it('reads balances from material_balances, never the ledger', async () => {
    const { client, calls } = fakeClient(signedInA);
    await supabaseMirrorSource(client).fetchPage('materials', USER_A, 1000, 1999);

    expect(call(calls, 'from')).toEqual(['material_balances']);
    expect(call(calls, 'select')).toEqual(['material_id, site_id, name, unit, low_stock_threshold, balance']);
    expect(call(calls, 'order')).toEqual(['material_id']);
    expect(call(calls, 'range')).toEqual([1000, 1999]);
  });

  it("reads today's roster only: open assignments of active workers, with no phone or rate", async () => {
    const { client, calls } = fakeClient(signedInA);
    await supabaseMirrorSource(client).fetchPage('roster', USER_A, 0, 999);

    expect(call(calls, 'from')).toEqual(['worker_roster']);
    const columns = String(call(calls, 'select')?.[0]);
    expect(columns).toBe('assignment_id, worker_id, site_id, worker_code, name, trade');
    expect(columns).not.toMatch(/phone|rate/);
    expect(call(calls, 'is')).toEqual(['unassigned_at', null]);
    expect(call(calls, 'eq')).toEqual(['status', 'active']);
    expect(call(calls, 'order')).toEqual(['assignment_id']);
  });

  it('refuses, without querying, when someone else or no one is signed in', async () => {
    for (const session of [{ user: { id: USER_B }, access_token: 'token-b' }, null]) {
      const { client, from } = fakeClient(session);
      const page = supabaseMirrorSource(client).fetchPage('sites', USER_A, 0, 999);
      await expect(page).rejects.toBeInstanceOf(SyncTransportError);
      await expect(page).rejects.toMatchObject({ reason: SESSION_CHANGED });
      expect(from).not.toHaveBeenCalled();
    }
  });

  it('turns a query error into a reason code', async () => {
    const { client } = fakeClient(signedInA, { data: null, error: { code: '42501' } });
    await expect(supabaseMirrorSource(client).fetchPage('sites', USER_A, 0, 999)).rejects.toMatchObject({
      reason: 'server:42501',
    });
  });

  it("reports the stored session's user", async () => {
    expect(await supabaseMirrorSource(fakeClient(signedInA).client).currentUserId()).toBe(USER_A);
    expect(await supabaseMirrorSource(fakeClient(null).client).currentUserId()).toBeNull();
  });
});
