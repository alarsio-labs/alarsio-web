import { render } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import AttendanceRoute from '../app/attendance/index';
import SiteAttendanceRoute from '../app/attendance/[siteId]';
import { SessionUserContext } from '../auth/session-user';
import { AttendanceSitesScreen } from '../screens/AttendanceSitesScreen';
import { SiteAttendanceScreen } from '../screens/SiteAttendanceScreen';

// Not under src/app, so expo-router does not take this for a route. It checks the
// wiring that decides whose sites and visits a screen shows: the user the sign-in
// gate let through is the one the screens get, and with no user there is no screen
// (ADR-020, ADR-029).

// Jest hoists jest.mock above the imports.
const mockDb = {};
jest.mock('../lib/app-db', () => ({ openAppDb: () => Promise.resolve(mockDb) }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useLocalSearchParams: jest.fn(),
}));
jest.mock('../attendance/location', () => ({ expoLocationProvider: () => 'location-provider' }));
jest.mock('../screens/AttendanceSitesScreen', () => ({ AttendanceSitesScreen: jest.fn(() => null) }));
jest.mock('../screens/SiteAttendanceScreen', () => ({ SiteAttendanceScreen: jest.fn(() => null) }));

const USER = { id: '11111111-0000-4000-8000-00000000000a', email: 'a@example.com' };
const SITE = '51000000-0000-4000-8000-000000000001';

const props = (mock: unknown) => jest.mocked(mock as (p: Record<string, unknown>) => null).mock.calls[0]?.[0];

describe('attendance routes (#79)', () => {
  beforeEach(() => {
    jest.mocked(AttendanceSitesScreen).mockClear();
    jest.mocked(SiteAttendanceScreen).mockClear();
    jest.mocked(useLocalSearchParams).mockReset().mockReturnValue({ siteId: SITE });
  });

  it("gives the sites screen the signed-in user's id, and opens a site by its id", async () => {
    await render(
      <SessionUserContext.Provider value={USER}>
        <AttendanceRoute />
      </SessionUserContext.Provider>,
    );

    const p = props(AttendanceSitesScreen);
    expect(p).toMatchObject({ userId: USER.id });
    (p?.onOpenSite as (id: string) => void)(SITE);
    expect(router.push).toHaveBeenCalledWith({ pathname: '/attendance/[siteId]', params: { siteId: SITE } });
  });

  it('gives the site screen the user, the site from the route and the location provider', async () => {
    await render(
      <SessionUserContext.Provider value={USER}>
        <SiteAttendanceRoute />
      </SessionUserContext.Provider>,
    );

    expect(props(SiteAttendanceScreen)).toMatchObject({ userId: USER.id, siteId: SITE, location: 'location-provider' });
  });

  it('shows no screen when no user is signed in', async () => {
    await render(<AttendanceRoute />);
    await render(<SiteAttendanceRoute />);

    expect(AttendanceSitesScreen).not.toHaveBeenCalled();
    expect(SiteAttendanceScreen).not.toHaveBeenCalled();
  });

  it('shows no site screen for a route with no usable site id', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ siteId: ['a', 'b'] });
    await render(
      <SessionUserContext.Provider value={USER}>
        <SiteAttendanceRoute />
      </SessionUserContext.Provider>,
    );

    expect(SiteAttendanceScreen).not.toHaveBeenCalled();
  });
});
