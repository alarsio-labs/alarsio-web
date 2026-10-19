import { fireEvent, render, screen } from '@testing-library/react-native';

import type { SignInResult } from '../../auth/auth-client';
import { SignInScreen } from '../SignInScreen';

describe('SignInScreen', () => {
  it('passes the typed email and password to signIn', async () => {
    const signIn = jest.fn((): Promise<SignInResult> => Promise.resolve({ ok: true, user: { id: 'u', email: 'a@x.in' } }));
    await render(<SignInScreen signIn={signIn} />);

    await fireEvent.changeText(screen.getByLabelText('Email'), 'a@x.in');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'secret123');
    await fireEvent.press(screen.getByRole('button'));

    expect(signIn).toHaveBeenCalledWith('a@x.in', 'secret123');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the failure message and lets the user try again', async () => {
    const signIn = jest.fn((): Promise<SignInResult> => Promise.resolve({ ok: false, message: 'Email or password is wrong.' }));
    await render(<SignInScreen signIn={signIn} />);

    await fireEvent.changeText(screen.getByLabelText('Email'), 'a@x.in');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'bad');
    await fireEvent.press(screen.getByRole('button'));

    expect(await screen.findByText('Email or password is wrong.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button'));
    expect(signIn).toHaveBeenCalledTimes(2);
  });

  it('points new people to their invite link', async () => {
    await render(<SignInScreen signIn={jest.fn()} />);
    expect(screen.getByText(/invite link/)).toBeTruthy();
  });

  it('sends once even when tapped twice quickly', async () => {
    let resolve: (r: SignInResult) => void = () => undefined;
    const signIn = jest.fn(() => new Promise<SignInResult>((r) => { resolve = r; }));
    await render(<SignInScreen signIn={signIn} />);
    await fireEvent.changeText(screen.getByLabelText('Email'), 'a@x.in');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'pw');
    const button = screen.getByRole('button');
    await fireEvent.press(button);
    await fireEvent.press(button);
    expect(signIn).toHaveBeenCalledTimes(1);
    resolve({ ok: false, message: 'Email or password is wrong.' });
    expect(await screen.findByText('Email or password is wrong.')).toBeTruthy();
  });
});
