import { render } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import ReportsRoute from '../app/reports/index';
import DailyReportRoute from '../app/reports/[siteId]';
import { SessionUserContext } from '../auth/session-user';
import { DailyReportScreen } from '../screens/DailyReportScreen';
import { ReportSitesScreen } from '../screens/ReportSitesScreen';

// Not under src/app, so expo-router does not take this for a route. It checks the
// wiring that decides whose sites and reports a screen shows: the user the sign-in
// gate let through is the one the screens get, and with no user there is no screen
// (ADR-020, ADR-029).

// Jest hoists jest.mock above the imports.
const mockDb = {};
jest.mock('../lib/app-db', () => ({ openAppDb: () => Promise.resolve(mockDb) }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useLocalSearchParams: jest.fn(),
}));
jest.mock('../screens/ReportSitesScreen', () => ({ ReportSitesScreen: jest.fn(() => null) }));
jest.mock('../screens/DailyReportScreen', () => ({ DailyReportScreen: jest.fn(() => null) }));

const USER = { id: '11111111-0000-4000-8000-00000000000a', email: 'a@example.com' };
const SITE = '51000000-0000-4000-8000-000000000001';

const props = (mock: unknown) => jest.mocked(mock as (p: Record<string, unknown>) => null).mock.calls[0]?.[0];

describe('report routes (#81)', () => {
  beforeEach(() => {
    jest.mocked(ReportSitesScreen).mockClear();
    jest.mocked(DailyReportScreen).mockClear();
    jest.mocked(router.push).mockClear();
    jest.mocked(useLocalSearchParams).mockReset().mockReturnValue({ siteId: SITE, date: '2026-10-18' });
  });

  it("gives the sites screen the signed-in user's id, and opens a report by site and day", async () => {
    await render(
      <SessionUserContext.Provider value={USER}>
        <ReportsRoute />
      </SessionUserContext.Provider>,
    );

    const p = props(ReportSitesScreen);
    expect(p).toMatchObject({ userId: USER.id });
    (p?.onOpenReport as (id: string, date: string) => void)(SITE, '2026-10-18');
    expect(router.push).toHaveBeenCalledWith({ pathname: '/reports/[siteId]', params: { siteId: SITE, date: '2026-10-18' } });
  });

  it('gives the report screen the user, and the site and day from the route', async () => {
    await render(
      <SessionUserContext.Provider value={USER}>
        <DailyReportRoute />
      </SessionUserContext.Provider>,
    );

    expect(props(DailyReportScreen)).toMatchObject({ userId: USER.id, siteId: SITE, date: '2026-10-18' });
  });

  it('passes no day when the route has none, so the screen opens today', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ siteId: SITE });
    await render(
      <SessionUserContext.Provider value={USER}>
        <DailyReportRoute />
      </SessionUserContext.Provider>,
    );

    expect(props(DailyReportScreen)).toMatchObject({ siteId: SITE, date: undefined });
  });

  it('renders no screen without a signed-in user', async () => {
    await render(<ReportsRoute />);
    await render(<DailyReportRoute />);

    expect(ReportSitesScreen).not.toHaveBeenCalled();
    expect(DailyReportScreen).not.toHaveBeenCalled();
  });
});
