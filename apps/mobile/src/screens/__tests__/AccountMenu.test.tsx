import { fireEvent, render, screen } from '@testing-library/react-native';
import { Alert, type AlertButton } from 'react-native';

import { AccountMenu } from '../AccountMenu';

const user = { id: '0a000000-0000-4000-8000-00000000000a', email: 'a@x.in' };
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('AccountMenu', () => {
  let alert: jest.SpyInstance;
  beforeEach(() => {
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });
  afterEach(() => alert.mockRestore());

  it('signs out at once when nothing is unsent', async () => {
    const signOut = jest.fn(async () => undefined);
    await render(<AccountMenu user={user} unsentCounts={async () => ({ waiting: 0, needFix: 0 })} signOut={signOut} />);
    await fireEvent.press(screen.getByLabelText('Sign out a@x.in'));
    await flush();
    expect(alert).not.toHaveBeenCalled();
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('warns when records are unsent, and "Stay signed in" keeps the session', async () => {
    const signOut = jest.fn(async () => undefined);
    await render(<AccountMenu user={user} unsentCounts={async () => ({ waiting: 2, needFix: 0 })} signOut={signOut} />);
    await fireEvent.press(screen.getByLabelText('Sign out a@x.in'));
    await flush();
    expect(alert).toHaveBeenCalledWith('Sign out?', expect.stringMatching(/2 records waiting to send/), expect.any(Array));
    const buttons = alert.mock.calls[0][2] as AlertButton[];
    buttons.find((b) => b.style === 'cancel')?.onPress?.();
    expect(signOut).not.toHaveBeenCalled();
  });

  it('never blocks: "Sign out" in the warning signs out', async () => {
    const signOut = jest.fn(async () => undefined);
    await render(<AccountMenu user={user} unsentCounts={async () => ({ waiting: 1, needFix: 1 })} signOut={signOut} />);
    await fireEvent.press(screen.getByLabelText('Sign out a@x.in'));
    await flush();
    const buttons = alert.mock.calls[0][2] as AlertButton[];
    buttons.find((b) => b.style === 'destructive')?.onPress?.();
    await flush();
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('warns that it could not check when counting fails, instead of signing out silently', async () => {
    const signOut = jest.fn(async () => undefined);
    await render(<AccountMenu user={user} unsentCounts={() => Promise.reject(new Error('db'))} signOut={signOut} />);
    await fireEvent.press(screen.getByLabelText('Sign out a@x.in'));
    await flush();
    expect(alert).toHaveBeenCalledWith('Sign out?', expect.stringMatching(/Could not check/), expect.any(Array));
    expect(signOut).not.toHaveBeenCalled();
  });

  it('shows an error when sign-out itself fails', async () => {
    const signOut = jest.fn(() => Promise.reject(new Error('x')));
    await render(<AccountMenu user={user} unsentCounts={async () => ({ waiting: 0, needFix: 0 })} signOut={signOut} />);
    await fireEvent.press(screen.getByLabelText('Sign out a@x.in'));
    await flush();
    expect(alert).toHaveBeenCalledWith('Sign out failed', expect.any(String));
  });
});
