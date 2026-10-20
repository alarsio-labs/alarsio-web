// Airplane mode, end to end (#79 AC 5): the real outbox and the real sender, with a
// fake transport standing in for the network. Nothing here is mocked except the
// transport and the uuid generator.

import type { DeviceDb } from '../../db/device-db';
import { deviceMigrations } from '../../db/migrations';
import { prepareDeviceDb } from '../../db/prepare-device-db';
import { openTestDeviceDb } from '../../db/test-support/sqljs-device-db';
import type { SyncResultRow } from '../../sync/entities';
import { countByStatus } from '../../sync/outbox';
import { runSync, SyncTransportError, type PushResponse, type SyncBatch, type SyncTransport } from '../../sync/sender';
import { checkInVisit, checkOutVisit, parsePayload, visitStatusText, type Placement } from '../visit';
import { findOpenVisit, listVisits, saveCheckIn, saveCheckOut } from '../visit-store';

jest.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: () => `eeeeeeee-0000-4000-8000-${String((n += 1)).padStart(12, '0')}` };
});

const USER_A = '11111111-0000-4000-8000-00000000000a';
const ORG = '0a0a0a0a-0000-4000-8000-0000000000a1';
const SITE = '51000000-0000-4000-8000-000000000001';
const HERE: Placement = { kind: 'located', lat: 18.5204, lng: 73.8567, reason: null };
const T_IN = new Date('2026-10-20T03:40:00.000Z');
const T_OUT = new Date('2026-10-20T12:00:00.000Z');
const at = (seconds: number) => new Date(T_OUT.getTime() + seconds * 1000);

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

describe('attendance in airplane mode, end to end (#79)', () => {
  let db: DeviceDb;
  beforeEach(async () => {
    db = await openTestDeviceDb();
    await prepareDeviceDb(db, deviceMigrations);
  });

  const checkInAndOut = async () => {
    const recordId = await saveCheckIn(db, USER_A, checkInVisit({ id: SITE, orgId: ORG }, HERE, T_IN), T_IN);
    const open = (await findOpenVisit(db, USER_A, SITE))!;
    await saveCheckOut(db, USER_A, recordId, checkOutVisit(open.visit, HERE, T_OUT), T_OUT);
    return recordId;
  };

  it('checks in and out with no network, fails to send, then sends once and is done', async () => {
    const net = fakeNetwork();
    const recordId = await checkInAndOut();

    // Offline: the send fails with a network error and the record is kept, both legs in it.
    const offline = await runSync(db, net.transport, { now: () => at(1) });
    expect(offline).toMatchObject({ kind: 'failed', reason: 'network' });
    expect(net.received).toHaveLength(0);
    const kept = (await listVisits(db, USER_A, SITE))[0]!;
    expect(kept.status).toBe('failed');
    expect(visitStatusText(kept.status, kept.reason).text).toBe('Could not send yet. Will retry.');
    expect(kept.visit.checkIn.at).toBe(T_IN.toISOString());
    expect(kept.visit.checkOut?.at).toBe(T_OUT.toISOString());

    // Back online, after the backoff: one batch, one record, accepted.
    net.state.online = true;
    const online = await runSync(db, net.transport, { now: () => at(10 * 60) });
    expect(online).toEqual({ kind: 'done', batches: 1, records: 1 });

    expect(net.received).toHaveLength(1);
    const sent = net.received[0]!.records[0]!;
    expect(sent).toMatchObject({ entity: 'site_visits', record_id: recordId });
    expect(sent.payload).toEqual({
      org_id: ORG,
      site_id: SITE,
      check_in_at: T_IN.toISOString(),
      check_in_lat: 18.5204,
      check_in_lng: 73.8567,
      check_in_reason: null,
      check_out_at: T_OUT.toISOString(),
      check_out_lat: 18.5204,
      check_out_lng: 73.8567,
      check_out_reason: null,
    });
    expect(parsePayload(sent.payload)).not.toBeNull();

    const done = (await listVisits(db, USER_A, SITE))[0]!;
    expect(done.status).toBe('synced');
    expect(visitStatusText(done.status, done.reason).text).toBe('On the server');

    // A second run has nothing to send, so nothing is duplicated.
    expect(await runSync(db, net.transport, { now: () => at(11 * 60) })).toEqual({ kind: 'done', batches: 0, records: 0 });
    expect(net.received).toHaveLength(1);
  });

  it('survives a killed app: the open visit is found again and the offline retry sends it', async () => {
    const net = fakeNetwork();
    await saveCheckIn(db, USER_A, checkInVisit({ id: SITE, orgId: ORG }, HERE, T_IN), T_IN);
    await runSync(db, net.transport, { now: () => at(1) }); // fails, offline

    // "Reopen": only what is on disk remains.
    const open = await findOpenVisit(db, USER_A, SITE);
    expect(open).toMatchObject({ status: 'failed' });

    net.state.online = true;
    await runSync(db, net.transport, { now: () => at(10 * 60) });
    expect((await findOpenVisit(db, USER_A, SITE))?.status).toBe('synced');
  });

  it('a conflict ends as needs attention and is never retried by itself', async () => {
    const net = fakeNetwork();
    net.state.online = true;
    net.state.answer = (r) => ({ entity: r.entity, record_id: r.record_id, verdict: 'conflict', reason: 'checked_out' });
    await checkInAndOut();

    await runSync(db, net.transport, { now: () => at(1) });
    const first = (await listVisits(db, USER_A, SITE))[0]!;
    expect(first.status).toBe('conflict');
    expect(visitStatusText(first.status, first.reason).text).toMatch(/^Needs attention/);

    await runSync(db, net.transport, { now: () => at(60 * 60) });
    expect(net.received).toHaveLength(1);
    expect((await countByStatus(db, USER_A)).conflict).toBe(1);
  });

  it('a refusal ends as needs attention and is never retried by itself', async () => {
    const net = fakeNetwork();
    net.state.online = true;
    net.state.answer = (r) => ({ entity: r.entity, record_id: r.record_id, verdict: 'rejected', reason: 'permission_denied' });
    await checkInAndOut();

    await runSync(db, net.transport, { now: () => at(1) });
    const row = (await listVisits(db, USER_A, SITE))[0]!;
    expect(row.status).toBe('rejected');
    expect(visitStatusText(row.status, row.reason).text).toMatch(/^Needs attention/);

    await runSync(db, net.transport, { now: () => at(60 * 60) });
    expect(net.received).toHaveLength(1);
  });

  it('a retryable error keeps the visit waiting and sends it again later', async () => {
    const net = fakeNetwork();
    net.state.online = true;
    net.state.answer = (r) => ({ entity: r.entity, record_id: r.record_id, verdict: 'retryable_error', reason: 'busy' });
    await checkInAndOut();
    await runSync(db, net.transport, { now: () => at(1) });
    expect((await listVisits(db, USER_A, SITE))[0]!.status).toBe('failed');

    net.state.answer = (r) => ({ entity: r.entity, record_id: r.record_id, verdict: 'accepted', reason: null });
    await runSync(db, net.transport, { now: () => at(10 * 60) });
    expect((await listVisits(db, USER_A, SITE))[0]!.status).toBe('synced');
    expect(net.received).toHaveLength(2);
  });
});
