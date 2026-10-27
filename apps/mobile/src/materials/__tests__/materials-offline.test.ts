// Airplane mode, end to end (#82 AC 4): the real outbox and the real sender, with a
// fake transport standing in for the network. Nothing here is mocked except the
// transport and the uuid generator.

import type { DeviceDb } from '../../db/device-db';
import { deviceMigrations } from '../../db/migrations';
import { prepareDeviceDb } from '../../db/prepare-device-db';
import { openTestDeviceDb } from '../../db/test-support/sqljs-device-db';
import type { SyncResultRow } from '../../sync/entities';
import { countByStatus } from '../../sync/outbox';
import { runPull, type MirrorSource } from '../../sync/pull';
import { runSync, SyncTransportError, type PushResponse, type SyncBatch, type SyncTransport } from '../../sync/sender';
import { movementStatusText } from '../movement';
import { loadSiteMaterials, saveMovement } from '../movement-store';

jest.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: () => `eeeeeeee-0000-4000-8000-${String((n += 1)).padStart(12, '0')}` };
});

const USER_A = '11111111-0000-4000-8000-00000000000a';
const ORG = '0a0a0a0a-0000-4000-8000-0000000000a1';
const SITE = '51000000-0000-4000-8000-000000000001';
const CEMENT = 'a1000000-0000-4000-8000-000000000001';
const T_PULL = new Date('2026-10-20T08:00:00.000Z');
const T_SAVE = new Date('2026-10-20T09:00:00.000Z');
const at = (seconds: number) => new Date(T_SAVE.getTime() + seconds * 1000);

/** The server's idea of the cement balance, which a pull copies. */
function mirrorSource(balance: () => number): MirrorSource {
  return {
    currentUserId: async () => USER_A,
    fetchPage: async (kind, _u, after) => {
      if (after !== null) return [];
      if (kind === 'sites') {
        return [{ id: SITE, org_id: ORG, name: 'Kothrud', address: 'Pune', status: 'active', latitude: 18.5, longitude: 73.8, geofence_radius_m: 200 }];
      }
      if (kind === 'materials') {
        return [{ material_id: CEMENT, site_id: SITE, name: 'Cement', unit: 'bag', low_stock_threshold: 10, balance: balance() }];
      }
      return [];
    },
  };
}

/** A server that answers what it is told to, and records every batch it receives. */
function fakeNetwork() {
  const state = {
    online: false,
    answer: (r: SyncBatch['records'][number]): SyncResultRow => ({
      entity: r.entity,
      record_id: r.record_id,
      verdict: 'accepted',
      reason: null,
    }),
  };
  const received: SyncBatch[] = [];
  const transport: SyncTransport = {
    currentUserId: async () => USER_A,
    push: async (batch): Promise<PushResponse> => {
      if (!state.online) throw new SyncTransportError('network');
      received.push(batch);
      return { results: batch.records.map(state.answer) };
    },
  };
  return { state, received, transport };
}

describe('materials in airplane mode, end to end (#82)', () => {
  let db: DeviceDb;
  let serverBalance = 40;
  beforeEach(async () => {
    serverBalance = 40;
    db = await openTestDeviceDb();
    await prepareDeviceDb(db, deviceMigrations);
    await runPull(db, mirrorSource(() => serverBalance), { now: () => T_PULL });
  });

  const cement = async () => (await loadSiteMaterials(db, USER_A, SITE)).materials.find((m) => m.id === CEMENT)!;
  const recentStatus = async () => {
    const r = (await loadSiteMaterials(db, USER_A, SITE)).recent[0]!;
    return movementStatusText(r.status, r.reason).text;
  };

  it('records usage with no network, shows an estimate, fails to send, then sends once and is done', async () => {
    const net = fakeNetwork();
    const { recordId } = await saveMovement(db, USER_A, { materialId: CEMENT, kind: 'usage', quantity: '12.5', reason: '' }, T_SAVE);

    // With no signal: saved, shown as an estimate, never as sent.
    expect(await cement()).toMatchObject({ serverBalanceMilli: 40000, estimateMilli: 27500, unsent: 1 });
    expect(await recentStatus()).toBe('Saved on this phone, waiting to send');

    // The send fails with a network error and the record is kept.
    expect(await runSync(db, net.transport, { now: () => at(1) })).toMatchObject({ kind: 'failed', reason: 'network' });
    expect(net.received).toHaveLength(0);
    expect(await recentStatus()).toBe('Could not send yet. Will retry.');
    expect(await cement()).toMatchObject({ estimateMilli: 27500, unsent: 1 });

    // The signal returns. The record goes once, with the handler's payload.
    net.state.online = true;
    expect(await runSync(db, net.transport, { now: () => at(120) })).toMatchObject({ kind: 'done', records: 1 });
    expect(net.received).toHaveLength(1);
    expect(net.received[0]!.records).toEqual([
      {
        entity: 'material_transactions',
        record_id: recordId,
        payload: { material_id: CEMENT, kind: 'usage', quantity: 12.5, occurred_on: '2026-10-20' },
      },
    ]);
    expect(await countByStatus(db, USER_A)).toMatchObject({ synced: 1, pending: 0, failed: 0 });
    expect(await recentStatus()).toBe('On the server');
    // Synced after the pull, so the copy of the balance does not hold it yet: still counted, no dip.
    expect(await cement()).toMatchObject({ estimateMilli: 27500, unsent: 0 });
  });

  it('does not count a movement twice once a pull brings the balance that already holds it', async () => {
    const net = fakeNetwork();
    net.state.online = true;
    await saveMovement(db, USER_A, { materialId: CEMENT, kind: 'usage', quantity: '12.5', reason: '' }, T_SAVE);
    await runSync(db, net.transport, { now: () => at(5) });
    expect((await cement()).estimateMilli).toBe(27500);

    serverBalance = 27.5; // the server applied it
    await runPull(db, mirrorSource(() => serverBalance), { now: () => at(60) });

    expect(await cement()).toMatchObject({ serverBalanceMilli: 27500, estimateMilli: 27500 });
  });

  it('a push the phone never heard back from is sent again and creates one record, not two', async () => {
    const net = fakeNetwork();
    net.state.online = true;
    await saveMovement(db, USER_A, { materialId: CEMENT, kind: 'receipt', quantity: '5', reason: '' }, T_SAVE);

    // The server took it, but the answer was lost on the way back.
    const lose: SyncTransport = {
      currentUserId: net.transport.currentUserId,
      push: async (batch) => {
        await net.transport.push(batch, USER_A);
        throw new SyncTransportError('network');
      },
    };
    await runSync(db, lose, { now: () => at(1) });
    await runSync(db, net.transport, { now: () => at(120) });

    expect(net.received).toHaveLength(2);
    expect(net.received[0]!.records[0]!.record_id).toBe(net.received[1]!.records[0]!.record_id);
    expect(await countByStatus(db, USER_A)).toMatchObject({ synced: 1 });
    expect((await cement()).estimateMilli).toBe(45000);
  });

  it('shows a refused movement with its reason, and does not add it to the estimate', async () => {
    const net = fakeNetwork();
    net.state.online = true;
    net.state.answer = (r) => ({ entity: r.entity, record_id: r.record_id, verdict: 'rejected', reason: 'permission_denied' });
    await saveMovement(db, USER_A, { materialId: CEMENT, kind: 'usage', quantity: '10', reason: '' }, T_SAVE);

    await runSync(db, net.transport, { now: () => at(1) });

    expect(await recentStatus()).toBe("Needs attention · You can't record on this site any more.");
    expect(await cement()).toMatchObject({ estimateMilli: 40000, unsent: 0 });
  });

  it('warns about low and negative stock but records anyway', async () => {
    await saveMovement(db, USER_A, { materialId: CEMENT, kind: 'usage', quantity: '45', reason: '' }, T_SAVE);
    expect(await cement()).toMatchObject({ estimateMilli: -5000, state: 'negative', unsent: 1 });
  });
});
