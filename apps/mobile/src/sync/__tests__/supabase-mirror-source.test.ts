import type { SupabaseClient } from '@supabase/supabase-js';

import { SESSION_CHANGED, SyncTransportError } from '../sender';
import { ROSTER_LOOKBACK_DAYS, supabaseMirrorSource } from '../supabase-mirror-source';

const USER_A = '11111111-0000-4000-8000-00000000000a';
const USER_B = '22222222-0000-4000-8000-00000000000b';

type FakeSession = { user: { id: string }; access_token: string } | null;

/** Records every builder call; resolves to `result` when awaited. */
function fakeClient(session: FakeSession, result: { data: unknown; error: unknown } = { data: [], error: null }) {
  const calls: [string, unknown[]][] = [];
  const from = jest.fn((table: string) => {
    calls.push(['from', [table]]);
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'order', 'limit', 'gt', 'neq', 'eq', 'or', 'setHeader']) {
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

const call = (calls: [string, unknown[]][], method: string) => calls.find((c) => c[0] === method)?.[1];
const all = (calls: [string, unknown[]][], method: string) => calls.filter((c) => c[0] === method).map((c) => c[1]);

describe('supabaseMirrorSource (#49)', () => {
  const signedInA = { user: { id: USER_A }, access_token: 'token-a' };
  const NOW = new Date('2026-10-20T08:00:00.000Z'); // 13:30 IST on the 20th

  it('reads sites through the published site_details view, without archived ones', async () => {
    const { client, calls } = fakeClient(signedInA, { data: [{ id: 'x' }], error: null });

    expect(await supabaseMirrorSource(client).fetchPage('sites', USER_A, null, 1000)).toEqual([{ id: 'x' }]);

    // Never the `sites` table: ARCHITECTURE rule 4 (Sites publishes this view, ADR-028).
    expect(call(calls, 'from')).toEqual(['site_details']);
    expect(call(calls, 'select')).toEqual(['id, name, address, status, latitude, longitude, geofence_radius_m']);
    expect(call(calls, 'neq')).toEqual(['status', 'archived']);
    expect(call(calls, 'order')).toEqual(['id']);
    expect(call(calls, 'limit')).toEqual([1000]);
    expect(call(calls, 'gt')).toBeUndefined(); // the first page has no cursor
    expect(call(calls, 'setHeader')).toEqual(['Authorization', 'Bearer token-a']);
  });

  it('continues after the last key it was given, rather than from an offset', async () => {
    const { client, calls } = fakeClient(signedInA);
    await supabaseMirrorSource(client).fetchPage('sites', USER_A, 'abc-key', 1000);

    expect(call(calls, 'gt')).toEqual(['id', 'abc-key']);
    expect(call(calls, 'order')).toEqual(['id']);
    expect(call(calls, 'range')).toBeUndefined();
  });

  it('reads balances from material_balances, never the ledger', async () => {
    const { client, calls } = fakeClient(signedInA);
    await supabaseMirrorSource(client).fetchPage('materials', USER_A, 'm-key', 500);

    expect(call(calls, 'from')).toEqual(['material_balances']);
    expect(call(calls, 'select')).toEqual(['material_id, site_id, name, unit, low_stock_threshold, balance']);
    expect(call(calls, 'gt')).toEqual(['material_id', 'm-key']);
    expect(call(calls, 'order')).toEqual(['material_id']);
    expect(call(calls, 'limit')).toEqual([500]);
  });

  it('reads the roster as ADR-021 D10 needs it: active workers, open or recently closed, no phone or rate', async () => {
    const { client, calls } = fakeClient(signedInA);
    await supabaseMirrorSource(client, { now: () => NOW }).fetchPage('roster', USER_A, null, 1000);

    expect(call(calls, 'from')).toEqual(['worker_roster']);
    const columns = String(call(calls, 'select')?.[0]);
    expect(columns).toBe('assignment_id, worker_id, site_id, worker_code, name, trade, assigned_at, unassigned_at');
    expect(columns).not.toMatch(/phone|rate/);
    expect(call(calls, 'eq')).toEqual(['status', 'active']);
    expect(call(calls, 'order')).toEqual(['assignment_id']);

    // Open, or closed on or after the first IST day of the window: 7 days before the
    // 20th is the 13th, which starts at 18:30 UTC on the 12th.
    expect(ROSTER_LOOKBACK_DAYS).toBe(7);
    expect(all(calls, 'or')).toEqual([['unassigned_at.is.null,unassigned_at.gte.2026-10-12T18:30:00.000Z']]);
  });

  it('refuses, without querying, when someone else or no one is signed in', async () => {
    for (const session of [{ user: { id: USER_B }, access_token: 'token-b' }, null]) {
      const { client, from } = fakeClient(session);
      const page = supabaseMirrorSource(client).fetchPage('sites', USER_A, null, 1000);
      await expect(page).rejects.toBeInstanceOf(SyncTransportError);
      await expect(page).rejects.toMatchObject({ reason: SESSION_CHANGED });
      expect(from).not.toHaveBeenCalled();
    }
  });

  it('turns a query error into a reason code', async () => {
    const { client } = fakeClient(signedInA, { data: null, error: { code: '42501' } });
    await expect(supabaseMirrorSource(client).fetchPage('sites', USER_A, null, 1000)).rejects.toMatchObject({
      reason: 'server:42501',
    });
  });

  it("reports the stored session's user", async () => {
    expect(await supabaseMirrorSource(fakeClient(signedInA).client).currentUserId()).toBe(USER_A);
    expect(await supabaseMirrorSource(fakeClient(null).client).currentUserId()).toBeNull();
  });
});
