import { Stack } from 'expo-router';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Alert, Linking } from 'react-native';

import { AboutScreen } from '../AboutScreen';

// The header title is set through expo-router, which Jest does not load.
jest.mock('expo-router', () => ({ Stack: { Screen: jest.fn(() => null) } }));

const headerTitles = () => jest.mocked(Stack.Screen).mock.calls.map((c) => (c[0] as { options: { title: string } }).options.title);

const user = { id: '0a000000-0000-4000-8000-00000000000a', email: 'a@x.in' };
const counts = async () => ({ waiting: 0, needFix: 0 });

describe('AboutScreen', () => {
  let open: jest.SpyInstance;
  beforeEach(() => {
    open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('shows the version and who is signed in', async () => {
    await render(<AboutScreen user={user} appVersion="0.1.0" unsentCounts={counts} signOut={jest.fn()} />);
    expect(screen.getByText('Version 0.1.0')).toBeTruthy();
    expect(headerTitles()).toContain('Help');
    expect(screen.getByText('Signed in as a@x.in')).toBeTruthy();
  });

  it('opens email, WhatsApp and the privacy policy', async () => {
    await render(<AboutScreen user={user} appVersion="0.1.0" unsentCounts={counts} signOut={jest.fn()} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Email support' }));
    expect(open).toHaveBeenCalledWith('mailto:alarsio.team@gmail.com');
    await fireEvent.press(screen.getByRole('button', { name: 'WhatsApp support' }));
    expect(open).toHaveBeenCalledWith('https://wa.me/917977239722');
    await fireEvent.press(screen.getByRole('link', { name: 'Privacy policy' }));
    expect(open).toHaveBeenCalledWith('https://alarsio.com/privacy');
  });

  it('signs out through the same flow as the header', async () => {
    const signOut = jest.fn(async () => undefined);
    await render(<AboutScreen user={user} appVersion="0.1.0" unsentCounts={counts} signOut={signOut} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    await new Promise((r) => setTimeout(r, 0));
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
