import { fireEvent, render, screen } from '@testing-library/react-native';

import type { DeviceDb } from '../../db/device-db';
import { readSites, type MirrorSite } from '../../sync/pull';
import { SitesScreen } from '../SitesScreen';

jest.mock('../../sync/pull', () => ({ readSites: jest.fn() }));

const site = (over: Partial<MirrorSite> = {}): MirrorSite =>
  ({ id: 's1', name: 'Baner Tower A', address: 'Baner, Pune', status: 'active', orgId: 'o1', ...over }) as MirrorSite;

const db = {} as DeviceDb;
const handlers = () => ({
  onOpenCheckIn: jest.fn(),
  onOpenRegister: jest.fn(),
  onOpenReport: jest.fn(),
  onOpenMaterials: jest.fn(),
});
const show = (h = handlers()) => render(<SitesScreen openDb={async () => db} userId="u1" {...h} />);

describe('SitesScreen', () => {
  beforeEach(() => jest.mocked(readSites).mockReset());

  it("lists the user's sites and opens each shortcut with the site id", async () => {
    jest.mocked(readSites).mockResolvedValue([site()]);
    const h = handlers();
    await show(h);

    expect(await screen.findByText('Baner Tower A')).toBeTruthy();
    expect(readSites).toHaveBeenCalledWith(db, 'u1');
    await fireEvent.press(screen.getByLabelText('Baner Tower A: Check in'));
    await fireEvent.press(screen.getByLabelText('Baner Tower A: Day register'));
    await fireEvent.press(screen.getByLabelText('Baner Tower A: Daily report'));
    await fireEvent.press(screen.getByLabelText('Baner Tower A: Materials'));
    for (const fn of Object.values(h)) expect(fn).toHaveBeenCalledWith('s1');
  });

  it('says so when a site needs a refresh', async () => {
    jest.mocked(readSites).mockResolvedValue([site({ orgId: null })]);
    await show();
    expect(await screen.findByText('Needs a refresh')).toBeTruthy();
  });

  it('tells the user to connect once when there are no sites', async () => {
    jest.mocked(readSites).mockResolvedValue([]);
    await show();
    expect(await screen.findByText('No sites on this phone yet.')).toBeTruthy();
    expect(screen.getByText('Connect once to download your sites.')).toBeTruthy();
  });

  it('shows a fixed sentence, never the error text, and retries', async () => {
    jest.mocked(readSites).mockRejectedValueOnce(new Error('/data/secret/path')).mockResolvedValueOnce([site()]);
    await show();
    expect(await screen.findByText('Could not read the sites on this phone.')).toBeTruthy();
    expect(screen.queryByText(/secret/)).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Baner Tower A')).toBeTruthy();
  });
});
