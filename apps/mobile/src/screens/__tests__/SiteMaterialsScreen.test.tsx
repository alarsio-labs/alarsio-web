import { configure, fireEvent, render, screen } from '@testing-library/react-native';

import type { DeviceDb } from '../../db/device-db';
import { deviceMigrations } from '../../db/migrations';
import { prepareDeviceDb } from '../../db/prepare-device-db';
import { openTestDeviceDb } from '../../db/test-support/sqljs-device-db';
import { applyVerdicts, claimBatch } from '../../sync/outbox';
import { runPull, type MirrorSource } from '../../sync/pull';
import { SiteMaterialsScreen } from '../SiteMaterialsScreen';

// jest-expo stubs expo-crypto, so a counter stands in for randomUUID.
jest.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: () => `dddddddd-0000-4000-8000-${String((n += 1)).padStart(12, '0')}` };
});

// See SiteAttendanceScreen.test.tsx: a cold CI runner is slower than the defaults.
jest.setTimeout(30_000);
configure({ asyncUtilTimeout: 8_000 });

const USER_A = '11111111-0000-4000-8000-00000000000a';
const USER_B = '22222222-0000-4000-8000-00000000000b';
const ORG = '0a0a0a0a-0000-4000-8000-0000000000a1';
const SITE = '51000000-0000-4000-8000-000000000001';
const CEMENT = 'a1000000-0000-4000-8000-000000000001';
const SAND = 'a1000000-0000-4000-8000-000000000002';
const PULLED = new Date('2026-10-20T03:00:00.000Z');
const NOW = new Date('2026-10-20T03:40:00.000Z'); // 09:10 IST, 40 minutes after the pull

const source = (): MirrorSource => ({
  currentUserId: async () => USER_A,
  fetchPage: async (kind, _u, after) => {
    if (after !== null) return [];
    if (kind === 'sites') {
      return [{ id: SITE, org_id: ORG, name: 'Kothrud', address: 'Pune', status: 'active', latitude: 18.5, longitude: 73.8, geofence_radius_m: 200 }];
    }
    if (kind === 'materials') {
      return [
        { material_id: CEMENT, site_id: SITE, name: 'Cement', unit: 'bag', low_stock_threshold: 10, balance: 40 },
        { material_id: SAND, site_id: SITE, name: 'Sand', unit: 'tonne', low_stock_threshold: null, balance: 3 },
      ];
    }
    return [];
  },
});

const outboxRows = (db: DeviceDb) =>
  db.all<{ record_id: string; status: string; payload: string }>(
    `select record_id, status, payload from outbox where entity = 'material_transactions'`,
  );

describe('SiteMaterialsScreen (#82)', () => {
  let db: DeviceDb;
  beforeEach(async () => {
    db = await openTestDeviceDb();
    await prepareDeviceDb(db, deviceMigrations);
    await runPull(db, source(), { now: () => PULLED });
  });

  const show = async (userId = USER_A, pollMs = 50, openDb: () => Promise<DeviceDb> = () => Promise.resolve(db)) =>
    render(<SiteMaterialsScreen openDb={openDb} userId={userId} siteId={SITE} now={() => NOW} pollMs={pollMs} />);
  const press = async (name: string | RegExp) => fireEvent.press(await screen.findByRole('button', { name }));
  const record = async (material: string, kind: string, quantity: string, extra: { reason?: string } = {}) => {
    await press(`Record for ${material}`);
    await press(kind);
    fireEvent.changeText(await screen.findByLabelText('Quantity'), quantity);
    if (extra.reason !== undefined) fireEvent.changeText(screen.getByLabelText('Reason'), extra.reason);
  };

  it('lists the site\'s materials, each as an estimate beside the server balance, and says how old that is', async () => {
    await show();

    expect(await screen.findByText('Kothrud')).toBeTruthy();
    expect(screen.getByText('Cement')).toBeTruthy();
    expect(screen.getByText('Estimate: 40 bag')).toBeTruthy();
    expect(screen.getByText('Server balance: 40 bag')).toBeTruthy();
    expect(screen.getByText('Sand')).toBeTruthy();
    expect(screen.getByText('Estimate: 3 tonne')).toBeTruthy();
    expect(screen.getByText(/Server balances updated 40 min ago/)).toBeTruthy();
  });

  it('records usage with no signal: saved to the outbox, the estimate moves, and it says it is waiting to send', async () => {
    await show();
    await record('Cement', 'Used', '12.5');
    await press('Save');

    expect(await screen.findByText('Estimate: 27.5 bag')).toBeTruthy();
    expect(screen.getByText('Server balance: 40 bag')).toBeTruthy(); // the server's figure is not touched
    expect(screen.getByText('1 not sent yet')).toBeTruthy();
    expect(screen.getByText('Saved on this phone, waiting to send')).toBeTruthy();
    expect(screen.queryByText(/On the server/)).toBeNull();

    const rows = await outboxRows(db);
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0]!.payload)).toEqual({ material_id: CEMENT, kind: 'usage', quantity: 12.5, occurred_on: '2026-10-20' });
  });

  it('closes the form after saving, and the supervisor chooses the kind every time', async () => {
    await show();
    await press('Record for Cement');
    fireEvent.changeText(await screen.findByLabelText('Quantity'), '5');
    await press('Save');

    expect(await screen.findByText('Choose what kind of entry this is.')).toBeTruthy();
    expect(await outboxRows(db)).toHaveLength(0);
  });

  it('refuses an adjustment with no reason, and writes nothing', async () => {
    await show();
    await record('Cement', 'Adjustment', '-2');
    await press('Save');

    expect(await screen.findByText('An adjustment needs a reason.')).toBeTruthy();
    expect(await outboxRows(db)).toHaveLength(0);

    fireEvent.changeText(screen.getByLabelText('Reason'), 'two bags torn');
    await press('Save');
    expect(await screen.findByText('Estimate: 38 bag')).toBeTruthy();
    expect(JSON.parse((await outboxRows(db))[0]!.payload)).toMatchObject({ kind: 'adjustment', quantity: -2, reason: 'two bags torn' });
  });

  it('says what is wrong with a quantity, and writes nothing', async () => {
    await show();
    await record('Cement', 'Used', '1,5');
    await press('Save');
    expect(await screen.findByText('Enter the quantity as a number, with up to three decimals.')).toBeTruthy();

    fireEvent.changeText(screen.getByLabelText('Quantity'), '');
    await press('Save');
    expect(await screen.findByText('Enter how much.')).toBeTruthy();

    fireEvent.changeText(screen.getByLabelText('Quantity'), '0');
    await press('Save');
    expect(await screen.findByText('The quantity cannot be zero.')).toBeTruthy();
    expect(await outboxRows(db)).toHaveLength(0);
  });

  it('warns before the estimate goes below zero, and still lets the supervisor save (ADR-015)', async () => {
    await show();
    await record('Cement', 'Used', '45');

    expect(await screen.findByText('This would take the estimate below zero. You can still save it.')).toBeTruthy();
    await press('Save');
    expect(await screen.findByText('Estimate: -5 bag')).toBeTruthy();
    expect(screen.getByText('Below zero')).toBeTruthy();
    expect(await outboxRows(db)).toHaveLength(1);
  });

  it('shows no warning for an amount that stays above zero', async () => {
    await show();
    await record('Cement', 'Used', '5');
    await screen.findByLabelText('Quantity');
    expect(screen.queryByText(/below zero/)).toBeNull();
  });

  it('marks low stock at or under the material\'s level', async () => {
    await show();
    await record('Cement', 'Used', '30');
    await press('Save');
    expect(await screen.findByText('Estimate: 10 bag')).toBeTruthy();
    expect(screen.getByText('Low stock')).toBeTruthy();
  });

  it('writes one record when Save is tapped twice in a row', async () => {
    // The first save is held at the database, so the second tap arrives while it is still running.
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const held = new Proxy(db, {
      get(target, prop) {
        if (prop === 'transaction') return async (work: () => Promise<void>) => (await gate, target.transaction(work));
        const value = Reflect.get(target, prop, target) as unknown;
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    await show(USER_A, 50, () => Promise.resolve(held));
    await record('Cement', 'Received', '4');
    const save = await screen.findByRole('button', { name: 'Save' });
    await fireEvent.press(save);
    await fireEvent.press(save);
    release();
    await screen.findByText('Estimate: 44 bag');

    expect(await outboxRows(db)).toHaveLength(1);
  });

  it('keeps what was typed when the save is refused, and drops it on Cancel', async () => {
    await show();
    await record('Cement', 'Adjustment', '-2');
    await press('Save');
    await screen.findByText('An adjustment needs a reason.');
    expect(screen.getByLabelText('Quantity').props.value).toBe('-2');

    await press('Cancel');
    await press('Record for Cement');
    expect((await screen.findByLabelText('Quantity')).props.value).toBe('');
    expect(await outboxRows(db)).toHaveLength(0);
  });

  it('shows a verdict that arrives after the screen opened, in plain words', async () => {
    await show();
    await record('Cement', 'Used', '10');
    await press('Save');
    await screen.findByText('Saved on this phone, waiting to send');

    const [row] = await outboxRows(db);
    await claimBatch(db, USER_A, NOW);
    await applyVerdicts(db, [{ entity: 'material_transactions', record_id: row!.record_id, verdict: 'rejected', reason: 'permission_denied' }], NOW);

    expect(await screen.findByText("Needs attention · You can't record on this site any more.")).toBeTruthy();
    expect(screen.getByText('Estimate: 40 bag')).toBeTruthy(); // a refused entry is not counted
  });

  it('says "On the server" only for an entry the server accepted', async () => {
    await show();
    await record('Cement', 'Used', '10');
    await press('Save');
    await screen.findByText('Saved on this phone, waiting to send');

    const [row] = await outboxRows(db);
    await claimBatch(db, USER_A, NOW);
    await applyVerdicts(db, [{ entity: 'material_transactions', record_id: row!.record_id, verdict: 'accepted', reason: null }], NOW);

    expect(await screen.findByText('On the server')).toBeTruthy();
    expect(screen.queryByText(/submitted/i)).toBeNull();
  });

  it("shows nothing of another user's copy of the site", async () => {
    await show(USER_B);
    expect(await screen.findByText('This site is not on this phone.')).toBeTruthy();
    expect(screen.queryByText('Cement')).toBeNull();
  });

  it('says so, with no raw error text, when the device database fails (ADR-029)', async () => {
    await show(USER_A, 0, () => Promise.reject(new Error('disk full')));
    expect(await screen.findByText('Could not read the materials on this phone.')).toBeTruthy();
    expect(screen.queryByText(/disk full/)).toBeNull();
  });

  it('says what to do when the site has no materials', async () => {
    await db.run('delete from mirror_materials');
    await show();
    expect(await screen.findByText('No materials on this site yet. Ask a manager to add them, then connect once.')).toBeTruthy();
  });
});
