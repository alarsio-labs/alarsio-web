import { render, screen } from '@testing-library/react-native';

import type { PublicConfigResult } from '../../config/public-config';
import { HomeScreen } from '../HomeScreen';

const goodConfig: PublicConfigResult = {
  ok: true,
  config: { supabaseUrl: 'https://example.supabase.co', supabasePublishableKey: 'sb_publishable_abc' },
};

describe('HomeScreen', () => {
  it('shows the database as ready once it opens', async () => {
    await render(<HomeScreen openDb={() => Promise.resolve()} config={goodConfig} appVersion="0.1.0" />);

    expect(await screen.findByText('Device database ready')).toBeTruthy();
    expect(screen.getByText('Version 0.1.0')).toBeTruthy();
    expect(screen.queryByText(/Configuration missing/)).toBeNull();
  });

  it('shows why the database failed instead of crashing', async () => {
    await render(
      <HomeScreen
        openDb={() => Promise.reject(new Error('disk full'))}
        config={goodConfig}
        appVersion="0.1.0"
      />,
    );

    expect(await screen.findByText('Device database failed: disk full')).toBeTruthy();
  });

  it('names the missing settings', async () => {
    await render(
      <HomeScreen
        openDb={() => Promise.resolve()}
        config={{ ok: false, missing: ['EXPO_PUBLIC_SUPABASE_URL'] }}
        appVersion="0.1.0"
      />,
    );

    expect(
      await screen.findByText('Configuration missing: EXPO_PUBLIC_SUPABASE_URL'),
    ).toBeTruthy();
    expect(await screen.findByText('Device database ready')).toBeTruthy();
  });
});
