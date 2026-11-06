import { fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { AccessGate } from '../AccessGate';
import { UseWebScreen } from '../UseWebScreen';

const USER = { id: '11111111-0000-4000-8000-00000000000a', email: 'o@example.com' };
const counts = async () => ({ waiting: 0, needFix: 0 });
const memory = () => ({
  getItem: async () => null,
  setItem: async () => undefined,
  getAllKeys: async () => [] as string[],
  multiRemove: async () => undefined,
});

describe('UseWebScreen', () => {
  afterEach(() => jest.restoreAllMocks());

  it('points owners and accountants to alarsio.com and opens it', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await render(<UseWebScreen kind="web" user={USER} unsentCounts={counts} signOut={jest.fn()} />);

    expect(screen.getByText('Approvals, wages and the overview are on the web at alarsio.com.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('link', { name: 'Open alarsio.com' }));
    expect(open).toHaveBeenCalledWith('https://alarsio.com');
    expect(screen.getByRole('button', { name: /Sign out/ })).toBeTruthy();
  });

  it('tells an account with no company to ask for an invite link', async () => {
    await render(<UseWebScreen kind="none" user={USER} unsentCounts={counts} signOut={jest.fn()} />);

    expect(screen.getByText('Your account is not part of a company yet. Ask your manager for an invite link.')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Open alarsio.com' })).toBeNull();
  });
});

describe('AccessGate', () => {
  const gate = (access: 'capture' | 'web' | 'none') =>
    render(
      <AccessGate user={USER} fetchAccess={async () => access} store={memory()} unsentCounts={counts} signOut={jest.fn()}>
        {null}
      </AccessGate>,
    );

  it('shows the web screen for an owner', async () => {
    await gate('web');
    expect(await screen.findByText(/on the web at alarsio.com/)).toBeTruthy();
  });

  it('shows the invite message for no memberships', async () => {
    await gate('none');
    expect(await screen.findByText(/not part of a company yet/)).toBeTruthy();
  });

  it('lets a supervisor through to the app', async () => {
    await gate('capture');
    await screen.findByLabelText('Loading').catch(() => undefined);
    expect(screen.queryByText(/on the web at alarsio.com/)).toBeNull();
    expect(screen.queryByText(/not part of a company/)).toBeNull();
  });
});
