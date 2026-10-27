import type { DeviceDb } from '../../db/device-db';
import { deviceMigrations } from '../../db/migrations';
import { prepareDeviceDb } from '../../db/prepare-device-db';
import { openTestDeviceDb } from '../../db/test-support/sqljs-device-db';
import type { SyncResultRow } from '../../sync/entities';
import { countByStatus } from '../../sync/outbox';
import { runPull, type MirrorSource } from '../../sync/pull';
import { runSync, SyncTransportError, type PushResponse, type SyncBatch, type SyncTransport } from '../../sync/sender';
import { cleanMark, RegisterError } from '../register';
import { markAllPresent, proposeCorrection, readRegister, saveMark } from '../register-store';

jest.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: () => `dddddddd-0000-4000-8000-${String((n += 1)).padStart(12, '0')}` };
});

const USER_A = '11111111-0000-4000-8000-00000000000a';
const USER_B = '22222222-0000-4000-8000-00000000000b';
const ORG = '0a0a0a0a-0000-4000-8000-0000000000a1';
const SITE = { id: '51000000-0000-4000-8000-000000000001', orgId: ORG };
const W1 = '77777777-0000-4000-8000-000000000001';
const W2 = '77777777-0000-4000-8000-000000000002';
const W3 = '77777777-0000-4000-8000-000000000003';
const DATE = '2026-10-20';
const NOW = new Date('2026-10-20T03:40:00.000Z');
const at = (s: number) => new Date(NOW.getTime() + s * 1000);

async function seedRoster(db: DeviceDb, user: string, workers: string[]) {
  await db.run(`insert into mirror_state (id, user_id, refreshed_at) values (1, ?, ?)`, [user, NOW.toISOString()]);
  let n = 0;
  for (const w of workers) {
    n += 1;
    await db.run(
      `insert into mirror_roster (assignment_id, worker_id, site_id, code, name, trade, assigned_on, unassigned_on)
       values (?, ?, ?, ?, ?, 'mason', '2026-10-01', null)`,
      [`aaaaaaaa-0000-4000-8000-${String(n).padStart(12, '0')}`, w, SITE.id, `W${n}`, `Worker ${n}`],
    );
  }
}

// What a pull leaves in the mirror for an approved day: one row per worker.
async function seedApproved(
  db: DeviceDb,
  rows: { worker: string; status?: string; overtimeHundredths?: number; date?: string; site?: string }[],
) {
  let n = 0;
  for (const r of rows) {
    n += 1;
    await db.run(
      `insert into mirror_approved_days (entry_id, site_id, worker_id, work_date, status, overtime_hundredths, approved_at)
       values (?, ?, ?, ?, ?, ?, '2026-10-20T11:00:00+00:00')`,
      [
        `eeeeeeee-0000-4000-8000-${String(n).padStart(12, '0')}`,
        r.site ?? SITE.id,
        r.worker,
        r.date ?? DATE,
        r.status ?? 'present',
        r.overtimeHundredths ?? 0,
      ],
    );
  }
}

const outbox = (db: DeviceDb) =>
  db.all<{ seq: number; entity: string; record_id: string; author_id: string; status: string; payload: string }>(
    'select seq, entity, record_id, author_id, status, payload from outbox order by seq',
  );

const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e instanceof RegisterError ? e.code : 'other';
  }
  return null;
};

const mark = (status: string, overtime = '', note = '') => cleanMark({ status, overtime, note });

describe('day register store (#79)', () => {
  let db: DeviceDb;
  beforeEach(async () => {
    db = await openTestDeviceDb();
    await prepareDeviceDb(db, deviceMigrations);
    await seedRoster(db, USER_A, [W1, W2]);
  });

  it('marks everyone present: one day, then one entry per rostered worker, all pending under the author', async () => {
    expect(await markAllPresent(db, USER_A, SITE, DATE, NOW)).toBe(2);

    const rows = await outbox(db);
    expect(rows.map((r) => r.entity)).toEqual(['attendance_days', 'attendance_entries', 'attendance_entries']);
    expect(rows.every((r) => r.author_id === USER_A && r.status === 'pending')).toBe(true);
    expect(JSON.parse(rows[0]!.payload)).toEqual({ org_id: ORG, site_id: SITE.id, attendance_date: DATE });
    expect(JSON.parse(rows[1]!.payload)).toMatchObject({ worker_id: W1, status: 'present', overtime_hours: 0, note: null });
  });

  it('is safe to tap again, and never overwrites an exception', async () => {
    await markAllPresent(db, USER_A, SITE, DATE, NOW);
    await saveMark(db, USER_A, SITE, DATE, W1, mark('half_day', '1', 'rain'), at(1));
    expect(await markAllPresent(db, USER_A, SITE, DATE, at(2))).toBe(0);

    const rows = await outbox(db);
    expect(rows).toHaveLength(3);
    expect(JSON.parse(rows[1]!.payload)).toMatchObject({ worker_id: W1, status: 'half_day', overtime_hours: 1, note: 'rain' });
  });

  it('marks only the workers who have no entry yet', async () => {
    await saveMark(db, USER_A, SITE, DATE, W1, mark('leave'), NOW);
    expect(await markAllPresent(db, USER_A, SITE, DATE, at(1))).toBe(1);
    const entries = (await outbox(db)).filter((r) => r.entity === 'attendance_entries');
    expect(entries).toHaveLength(2);
  });

  it('keeps the record id when a mark is changed, so the edit re-queues the same row', async () => {
    await saveMark(db, USER_A, SITE, DATE, W1, mark('present'), NOW);
    const first = (await outbox(db)).find((r) => r.entity === 'attendance_entries')!.record_id;
    await saveMark(db, USER_A, SITE, DATE, W1, mark('absent'), at(1));
    const entries = (await outbox(db)).filter((r) => r.entity === 'attendance_entries');
    expect(entries).toHaveLength(1);
    expect(entries[0]!.record_id).toBe(first);
    expect(JSON.parse(entries[0]!.payload).status).toBe('absent');
  });

  it('writes nothing for a site with no org, a worker not on the roster, or a bad date', async () => {
    expect(await code(markAllPresent(db, USER_A, { id: SITE.id, orgId: null }, DATE))).toBe('no_org');
    expect(await code(saveMark(db, USER_A, SITE, DATE, W3, mark('present')))).toBe('not_on_roster');
    expect(await code(markAllPresent(db, USER_A, SITE, 'today'))).toBe('bad_date');
    expect(await outbox(db)).toHaveLength(0);
  });

  it("never shows or touches another user's entries", async () => {
    await markAllPresent(db, USER_A, SITE, DATE, NOW);
    // The phone's mirror belongs to A: B reads no roster and no entries.
    const b = await readRegister(db, USER_B, SITE.id, DATE);
    expect(b.rows).toEqual([]);
    expect(b.day).toBeNull();
    const a = await readRegister(db, USER_A, SITE.id, DATE);
    expect(a.rows.map((r) => r.entry?.status)).toEqual(['pending', 'pending']);
  });

  describe('an approved day', () => {
    async function lockDay() {
      await markAllPresent(db, USER_A, SITE, DATE, NOW);
      const entries = (await outbox(db)).filter((r) => r.entity === 'attendance_entries');
      await db.run(`update outbox set status = 'conflict', reason = 'locked' where record_id = ?`, [entries[0]!.record_id]);
    }

    it('is read-only once the server said locked: no edit, no mark-all', async () => {
      await lockDay();
      expect((await readRegister(db, USER_A, SITE.id, DATE)).locked).toBe(true);
      expect(await code(saveMark(db, USER_A, SITE, DATE, W1, mark('absent')))).toBe('locked');
      expect(await code(markAllPresent(db, USER_A, SITE, DATE))).toBe('locked');
    });

    it('takes a correction with a reason, as its own record, and never the old values', async () => {
      await lockDay();
      await proposeCorrection(db, USER_A, SITE, DATE, W1, mark('absent'), ' wrong worker ', at(5));
      const c = (await outbox(db)).find((r) => r.entity === 'attendance_corrections')!;
      expect(c.status).toBe('pending');
      expect(JSON.parse(c.payload)).toEqual({
        org_id: ORG,
        site_id: SITE.id,
        attendance_date: DATE,
        worker_id: W1,
        new_status: 'absent',
        new_overtime_hours: 0,
        new_note: null,
        reason: 'wrong worker',
      });

      // Proposed again before it is on the server: the same record, the new values.
      await proposeCorrection(db, USER_A, SITE, DATE, W1, mark('leave'), 'it was leave', at(6));
      const all = (await outbox(db)).filter((r) => r.entity === 'attendance_corrections');
      expect(all).toHaveLength(1);
      expect(JSON.parse(all[0]!.payload).new_status).toBe('leave');
    });

    it('refuses a correction with no reason, on an open day, or with no entry, and writes nothing', async () => {
      await lockDay();
      expect(await code(proposeCorrection(db, USER_A, SITE, DATE, W1, mark('absent'), '  '))).toBe('reason_required');
      expect(await code(proposeCorrection(db, USER_A, SITE, DATE, W3, mark('absent'), 'x'))).toBe('not_on_roster');
      expect((await outbox(db)).some((r) => r.entity === 'attendance_corrections')).toBe(false);

      const fresh = await openTestDeviceDb();
      await prepareDeviceDb(fresh, deviceMigrations);
      await seedRoster(fresh, USER_A, [W1]);
      await saveMark(fresh, USER_A, SITE, DATE, W1, mark('present'), NOW);
      expect(await code(proposeCorrection(fresh, USER_A, SITE, DATE, W1, mark('absent'), 'x'))).toBe('not_locked');
    });

    it('refuses a correction that changes nothing once the entry is on the server', async () => {
      await lockDay();
      const w2 = (await outbox(db)).filter((r) => r.entity === 'attendance_entries')[1]!;
      await db.run(`update outbox set status = 'synced' where record_id = ?`, [w2.record_id]);
      expect(await code(proposeCorrection(db, USER_A, SITE, DATE, W2, mark('present'), 'same'))).toBe('no_change');
    });
  });

  describe('an approved day the phone learned from its mirror (ADR-049)', () => {
    it('is not locked while the mirror holds nothing for the day, another day or another site', async () => {
      await seedApproved(db, [
        { worker: W1, date: '2026-10-19' },
        { worker: W1, site: '51000000-0000-4000-8000-0000000000ff' },
      ]);

      const register = await readRegister(db, USER_A, SITE.id, DATE);
      expect(register.locked).toBe(false);
      expect(register.rows.map((r) => r.approved)).toEqual([null, null]);
      expect(await markAllPresent(db, USER_A, SITE, DATE, NOW)).toBe(2);
    });

    it("does not lock for another user, whose copy of the mirror it is not", async () => {
      await seedApproved(db, [{ worker: W1 }]);

      const b = await readRegister(db, USER_B, SITE.id, DATE);
      expect(b.locked).toBe(false);
      expect(b.rows).toEqual([]);
    });

    it('is read-only before any edit: the outbox is empty and mark-all and an edit are refused', async () => {
      await seedApproved(db, [{ worker: W1 }, { worker: W2 }]);

      expect((await readRegister(db, USER_A, SITE.id, DATE)).locked).toBe(true);
      expect(await code(markAllPresent(db, USER_A, SITE, DATE, NOW))).toBe('locked');
      expect(await code(saveMark(db, USER_A, SITE, DATE, W1, mark('absent')))).toBe('locked');
      expect(await outbox(db)).toHaveLength(0);
    });

    it("shows the server's status for a worker with no entry on this phone, and not for one who has an entry", async () => {
      await saveMark(db, USER_A, SITE, DATE, W2, mark('absent'), NOW); // before the phone knew the day was approved
      await seedApproved(db, [
        { worker: W1, status: 'half_day', overtimeHundredths: 150 },
        { worker: W2, status: 'absent' },
      ]);

      const rows = (await readRegister(db, USER_A, SITE.id, DATE)).rows;
      expect(rows.map((r) => r.worker.workerId)).toEqual([W1, W2]);
      expect(rows[0]!.entry).toBeNull();
      expect(rows[0]!.approved).toEqual({ status: 'half_day', overtimeHours: 1.5 });
      expect(rows[1]!.entry).not.toBeNull();
      expect(rows[1]!.approved).toBeNull();
    });

    it('takes a correction for a worker the phone has no entry for, since the server holds one', async () => {
      await seedApproved(db, [{ worker: W1, status: 'present' }]);

      await proposeCorrection(db, USER_A, SITE, DATE, W1, mark('absent'), 'was on leave', at(5));

      const c = (await outbox(db)).filter((r) => r.entity === 'attendance_corrections');
      expect(c).toHaveLength(1);
      expect(c[0]!.status).toBe('pending');
      expect(JSON.parse(c[0]!.payload)).toMatchObject({ worker_id: W1, new_status: 'absent', reason: 'was on leave' });
    });

    it('refuses a correction for a worker neither the mirror nor the outbox has an entry for', async () => {
      await seedApproved(db, [{ worker: W1 }]);

      expect(await code(proposeCorrection(db, USER_A, SITE, DATE, W2, mark('absent'), 'x'))).toBe('no_entry');
      expect((await outbox(db)).some((r) => r.entity === 'attendance_corrections')).toBe(false);
    });

    it('still locks from a `locked` answer when the mirror holds nothing, as a phone that never pulled does', async () => {
      await markAllPresent(db, USER_A, SITE, DATE, NOW);
      const first = (await outbox(db)).filter((r) => r.entity === 'attendance_entries')[0]!;
      await db.run(`update outbox set status = 'conflict', reason = 'locked' where record_id = ?`, [first.record_id]);

      expect((await readRegister(db, USER_A, SITE.id, DATE)).locked).toBe(true);
    });

    it('never lifts a lock the outbox inferred, even when a later pull no longer shows the day (D6)', async () => {
      await markAllPresent(db, USER_A, SITE, DATE, NOW);
      const first = (await outbox(db)).filter((r) => r.entity === 'attendance_entries')[0]!;
      await db.run(`update outbox set status = 'conflict', reason = 'locked' where record_id = ?`, [first.record_id]);
      await seedApproved(db, [{ worker: W1 }]);
      await db.run('delete from mirror_approved_days');

      expect((await readRegister(db, USER_A, SITE.id, DATE)).locked).toBe(true);
    });
  });
});

describe('an approved day learned by a pull, then a correction in airplane mode (#127)', () => {
  const server = {
    sites: [
      {
        id: SITE.id,
        org_id: ORG,
        name: 'Kothrud',
        address: 'Pune',
        status: 'active',
        latitude: 18.52,
        longitude: 73.85,
        geofence_radius_m: 200,
      },
    ],
    worker_roster: [W1, W2].map((w, i) => ({
      assignment_id: `aaaaaaaa-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
      worker_id: w,
      site_id: SITE.id,
      worker_code: `W${i + 1}`,
      name: `Worker ${i + 1}`,
      trade: 'mason',
      assigned_at: '2026-10-01T04:00:00+00:00',
      unassigned_at: null,
    })),
    approved: [
      { entry_id: 'eeeeeeee-0000-4000-8000-000000000001', worker_id: W1, status: 'present', overtime_hours: 0 },
      { entry_id: 'eeeeeeee-0000-4000-8000-000000000002', worker_id: W2, status: 'half_day', overtime_hours: '1.50' },
    ].map((r) => ({ ...r, site_id: SITE.id, work_date: DATE, approved_at: '2026-10-20T11:00:00+00:00' })),
  };

  const mirrorSource: MirrorSource = {
    currentUserId: async () => USER_A,
    fetchPage: async (kind, _user, after) => {
      if (after !== null) return [];
      if (kind === 'sites') return server.sites;
      if (kind === 'roster') return server.worker_roster;
      return kind === 'approved_days' ? server.approved : [];
    },
  };

  it('opens read-only with no edit made, sends only the correction, and never says it is accepted early', async () => {
    const db = await openTestDeviceDb();
    await prepareDeviceDb(db, deviceMigrations);
    expect(await runPull(db, mirrorSource, { now: () => NOW })).toMatchObject({ kind: 'done', approvedDays: 2 });

    // Offline from here on: only the phone's own copy is read.
    const register = await readRegister(db, USER_A, SITE.id, DATE);
    expect(register.locked).toBe(true);
    expect(register.rows.map((r) => r.approved?.status)).toEqual(['present', 'half_day']);
    expect(await code(markAllPresent(db, USER_A, SITE, DATE, NOW))).toBe('locked');

    await proposeCorrection(db, USER_A, SITE, DATE, W2, mark('present', '', 'came for the full day'), 'worked the full day', at(5));

    let online = false;
    const received: SyncBatch[] = [];
    const transport: SyncTransport = {
      currentUserId: async () => USER_A,
      push: async (batch): Promise<PushResponse> => {
        if (!online) throw new SyncTransportError('network');
        received.push(batch);
        return {
          results: batch.records.map(
            (r): SyncResultRow => ({ entity: r.entity, record_id: r.record_id, verdict: 'accepted', reason: null }),
          ),
        };
      },
    };

    await runSync(db, transport, { now: () => at(10) });
    expect(await countByStatus(db, USER_A)).toMatchObject({ failed: 1, synced: 0 });

    online = true;
    await runSync(db, transport, { now: () => at(10 * 60) });
    expect(received).toHaveLength(1);
    expect(received[0]!.records.map((r) => r.entity)).toEqual(['attendance_corrections']);
    expect(await countByStatus(db, USER_A)).toMatchObject({ synced: 1, failed: 0 });

    // Still read-only: the day is approved on the server too, and the phone still knows it.
    expect((await readRegister(db, USER_A, SITE.id, DATE)).locked).toBe(true);
  });
});

describe('the register in airplane mode, end to end (#79)', () => {
  it('sends the day before its entries, retries after a network failure, then sends nothing twice', async () => {
    const db = await openTestDeviceDb();
    await prepareDeviceDb(db, deviceMigrations);
    await seedRoster(db, USER_A, [W1, W2]);

    await markAllPresent(db, USER_A, SITE, DATE, NOW);
    await saveMark(db, USER_A, SITE, DATE, W2, mark('half_day', '', 'rain'), at(1));

    let online = false;
    const received: SyncBatch[] = [];
    const transport: SyncTransport = {
      currentUserId: async () => USER_A,
      push: async (batch): Promise<PushResponse> => {
        if (!online) throw new SyncTransportError('network');
        received.push(batch);
        return {
          results: batch.records.map(
            (r): SyncResultRow => ({ entity: r.entity, record_id: r.record_id, verdict: 'accepted', reason: null }),
          ),
        };
      },
    };

    await runSync(db, transport, { now: () => at(10) });
    expect(await countByStatus(db, USER_A)).toMatchObject({ failed: 3, synced: 0 });

    online = true;
    await runSync(db, transport, { now: () => at(10 * 60) });
    expect(received).toHaveLength(1);
    expect(received[0]!.records.map((r) => r.entity)).toEqual([
      'attendance_days',
      'attendance_entries',
      'attendance_entries',
    ]);
    expect(await countByStatus(db, USER_A)).toMatchObject({ synced: 3, failed: 0 });

    await runSync(db, transport, { now: () => at(20 * 60) });
    expect(received).toHaveLength(1);
  });
});
