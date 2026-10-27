import { render } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import MaterialsRoute from '../app/materials/index';
import SiteMaterialsRoute from '../app/materials/[siteId]';
import { SessionUserContext } from '../auth/session-user';
import { MaterialsSitesScreen } from '../screens/MaterialsSitesScreen';
import { SiteMaterialsScreen } from '../screens/SiteMaterialsScreen';

// Not under src/app, so expo-router does not take this for a route. It checks the
// wiring that decides whose sites and movements a screen shows: the user the sign-in
// gate let through is the one the screens get, and with no user there is no screen
// (ADR-020, ADR-029).

// Jest hoists jest.mock above the imports.
const mockDb = {};
jest.mock('../lib/app-db', () => ({ openAppDb: () => Promise.resolve(mockDb) }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useLocalSearchParams: jest.fn(),
}));
jest.mock('../screens/MaterialsSitesScreen', () => ({ MaterialsSitesScreen: jest.fn(() => null) }));
jest.mock('../screens/SiteMaterialsScreen', () => ({ SiteMaterialsScreen: jest.fn(() => null) }));

const USER = { id: '11111111-0000-4000-8000-00000000000a', email: 'a@example.com' };
const SITE = '51000000-0000-4000-8000-000000000001';

const props = (mock: unknown) => jest.mocked(mock as (p: Record<string, unknown>) => null).mock.calls[0]?.[0];

describe('materials routes (#82)', () => {
  beforeEach(() => {
    jest.mocked(MaterialsSitesScreen).mockClear();
    jest.mocked(SiteMaterialsScreen).mockClear();
    jest.mocked(useLocalSearchParams).mockReset().mockReturnValue({ siteId: SITE });
  });

  it("gives the sites screen the signed-in user's id, and opens a site by its id", async () => {
    await render(
      <SessionUserContext.Provider value={USER}>
        <MaterialsRoute />
      </SessionUserContext.Provider>,
    );

    const p = props(MaterialsSitesScreen);
    expect(p).toMatchObject({ userId: USER.id });
    (p?.onOpenSite as (id: string) => void)(SITE);
    expect(router.push).toHaveBeenCalledWith({ pathname: '/materials/[siteId]', params: { siteId: SITE } });
  });

  it('gives the site screen the user and the site from the route', async () => {
    await render(
      <SessionUserContext.Provider value={USER}>
        <SiteMaterialsRoute />
      </SessionUserContext.Provider>,
    );

    expect(props(SiteMaterialsScreen)).toMatchObject({ userId: USER.id, siteId: SITE });
  });

  it('shows no screen when no user is signed in', async () => {
    await render(<MaterialsRoute />);
    await render(<SiteMaterialsRoute />);

    expect(MaterialsSitesScreen).not.toHaveBeenCalled();
    expect(SiteMaterialsScreen).not.toHaveBeenCalled();
  });

  it('shows no site screen for a route with no usable site id', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ siteId: ['a', 'b'] });
    await render(
      <SessionUserContext.Provider value={USER}>
        <SiteMaterialsRoute />
      </SessionUserContext.Provider>,
    );

    expect(SiteMaterialsScreen).not.toHaveBeenCalled();
  });
});
