import { fireEvent, render, screen } from '@testing-library/react-native';

import type { SyncStatus } from '../../sync/engine';
import { SyncPanel } from '../SyncPanel';

const zero = { pending: 0, syncing: 0, synced: 0, failed: 0, conflict: 0, rejected: 0 };
const status = (over: Partial<SyncStatus> = {}): SyncStatus => ({
  counts: zero,
  attention: [],
  loaded: true,
  readFailed: false,
  lastPull: null,
  mirror: null,
  last: null,
  running: false,
  userId: '11111111-0000-4000-8000-00000000000a',
  ...over,
});
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('SyncPanel (#68)', () => {
  it('shows the sync line and lists records that need attention, in plain words', async () => {
    await render(
      <SyncPanel
        status={status({
          counts: { ...zero, conflict: 1, rejected: 1 },
          attention: [
            { entity: 'daily_reports', recordId: ID(1), status: 'conflict', reason: 'reviewed', updatedAt: 'x' },
            { entity: 'material_transactions', recordId: ID(2), status: 'rejected', reason: 'brand_new', updatedAt: 'x' },
          ],
        })}
        onSyncNow={jest.fn()}
      />,
    );

    expect(screen.getByText('2 need attention')).toBeTruthy();
    expect(screen.getByText('Daily report · Conflict')).toBeTruthy();
    expect(screen.getByText('A manager already reviewed it.')).toBeTruthy();
    expect(screen.getByText('Material entry · Refused')).toBeTruthy();
    expect(screen.getByText('Refused (brand_new)')).toBeTruthy();
  });

  it('says what the phone holds after a pull', async () => {
    const mirror = { refreshedAt: new Date().toISOString(), sites: 2, materials: 3, roster: 4, approvedDays: 0 };
    await render(<SyncPanel status={status({ mirror })} onSyncNow={jest.fn()} />);
    expect(screen.getByText('On this phone: 2 sites, 3 materials, 4 workers · updated just now')).toBeTruthy();
  });

  it('shows no list when nothing needs attention', async () => {
    await render(<SyncPanel status={status()} onSyncNow={jest.fn()} />);

    expect(screen.getByText('All your records are on the server')).toBeTruthy();
    expect(screen.queryByText('Needs attention')).toBeNull();
  });

  it('runs Sync now once per tap, and not while a run is in progress', async () => {
    const onSyncNow = jest.fn();
    const { rerender } = await render(<SyncPanel status={status()} onSyncNow={onSyncNow} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Sync now' }));
    expect(onSyncNow).toHaveBeenCalledTimes(1);

    await rerender(<SyncPanel status={status({ running: true })} onSyncNow={onSyncNow} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Sending…' }));
    expect(onSyncNow).toHaveBeenCalledTimes(1);
    // The accessible name follows the visible text, so a screen reader hears "Sending…".
    expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Sync now' })).toBeNull();
  });

  it('keeps Sync now on screen and says how many more need attention when the list is cut', async () => {
    const attention = Array.from({ length: 50 }, (_, i) => ({
      entity: 'material_transactions' as const,
      recordId: ID(i + 1),
      status: 'rejected' as const,
      reason: 'invalid_input',
      updatedAt: 'x',
    }));
    await render(
      <SyncPanel status={status({ counts: { ...zero, rejected: 60 }, attention })} onSyncNow={jest.fn()} />,
    );

    expect(screen.getByText('and 10 more')).toBeTruthy();
    expect(screen.getAllByText('Material entry · Refused')).toHaveLength(50);
    expect(screen.getByRole('button', { name: 'Sync now' })).toBeTruthy();
    // The list scrolls inside a bounded box, so it cannot push the button off the screen.
    expect(screen.getByTestId('attention-list').props.style).toMatchObject({ maxHeight: expect.any(Number) });
  });

  it('shows no "more" line when the whole list is shown', async () => {
    const attention = [
      { entity: 'daily_reports' as const, recordId: ID(1), status: 'conflict' as const, reason: 'reviewed', updatedAt: 'x' },
    ];
    await render(<SyncPanel status={status({ counts: { ...zero, conflict: 1 }, attention })} onSyncNow={jest.fn()} />);
    expect(screen.queryByText(/and \d+ more/)).toBeNull();
  });

  it('announces changes to the sync line to a screen reader', async () => {
    await render(<SyncPanel status={status()} onSyncNow={jest.fn()} />);
    expect(screen.getByText('All your records are on the server').props.accessibilityLiveRegion).toBe('polite');
  });
});
