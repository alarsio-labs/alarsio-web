import { act, configure, fireEvent, render, screen } from '@testing-library/react-native';

import type { DeviceDb } from '../../db/device-db';
import { deviceMigrations } from '../../db/migrations';
import { prepareDeviceDb } from '../../db/prepare-device-db';
import { openTestDeviceDb } from '../../db/test-support/sqljs-device-db';
import { enqueue } from '../outbox';
import { SyncBar, type NetState } from '../SyncBar';

// A cold runner needs more than the default waits for sql.js to start; these are limits on waiting.
jest.setTimeout(30_000);
configure({ asyncUtilTimeout: 8_000 });

const USER = '11111111-0000-4000-8000-00000000000a';
const OTHER = '22222222-0000-4000-8000-00000000000b';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function fakeNet() {
  let listener: (s: NetState) => void = () => undefined;
  return {
    netInfo: {
      addEventListener: (l: (s: NetState) => void) => {
        listener = l;
        l({ isConnected: true, isInternetReachable: true });
        return () => undefined;
      },
    },
    emit: (s: NetState) => act(() => listener(s)),
  };
}

describe('SyncBar', () => {
  let db: DeviceDb;
  beforeEach(async () => {
    db = await openTestDeviceDb();
    await prepareDeviceDb(db, deviceMigrations);
  });

  const show = async (net = fakeNet(), onOpen = jest.fn(), userId = USER) => {
    const view = await render(<SyncBar openDb={() => Promise.resolve(db)} userId={userId} onOpen={onOpen} pollMs={20} netInfo={net.netInfo} />);
    return { view, net, onOpen };
  };
  const queue = (n: number, author = USER) =>
    enqueue(db, { entity: 'daily_reports', recordId: id(n), authorId: author, payload: { site_id: id(900) } });

  it('says everything is on the server when nothing is waiting', async () => {
    await show();
    expect(await screen.findByText('All your records are on the server')).toBeTruthy();
  });

  it('counts only this user\'s waiting records', async () => {
    await queue(1);
    await queue(2);
    await queue(3, OTHER);
    await show();
    expect(await screen.findByText('2 waiting to send')).toBeTruthy();
  });

  it('prefixes Offline when the phone has no connection', async () => {
    await queue(1);
    const { net } = await show();
    expect(await screen.findByText('1 waiting to send')).toBeTruthy();

    await net.emit({ isConnected: false, isInternetReachable: false });
    expect(await screen.findByText('Offline · 1 waiting to send')).toBeTruthy();

    await net.emit({ isConnected: true, isInternetReachable: true });
    expect(await screen.findByText('1 waiting to send')).toBeTruthy();
  });

  it('counts records that need attention and does not call them sent', async () => {
    await queue(1);
    await queue(2);
    await db.run(`update outbox set status = 'conflict', reason = 'reviewed' where record_id = ?`, [id(1)]);
    await db.run(`update outbox set status = 'synced' where record_id = ?`, [id(2)]);
    await show();
    expect(await screen.findByText('1 need attention')).toBeTruthy();
  });

  it('follows the outbox as records are accepted', async () => {
    await queue(1);
    await show();
    expect(await screen.findByText('1 waiting to send')).toBeTruthy();
    await db.run(`update outbox set status = 'synced' where record_id = ?`, [id(1)]);
    expect(await screen.findByText('All your records are on the server')).toBeTruthy();
  });

  it('is one labelled button that opens the sync details', async () => {
    await queue(1);
    const { onOpen } = await show();
    const bar = await screen.findByRole('button', { name: 'Sync status: 1 waiting to send. Opens sync details' });
    await fireEvent.press(bar);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
