import { fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { StartupError } from '../StartupError';

describe('StartupError', () => {
  beforeEach(() => {
    jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('says what to do in plain words and names both contacts', async () => {
    await render(<StartupError detail="disk full" />);

    expect(
      screen.getByText(
        'The app could not start. Close it and open it again. If this keeps happening, contact support: alarsio.team@gmail.com or WhatsApp +91 79772 39722.',
      ),
    ).toBeTruthy();
  });

  it('hides the raw error until Show details is pressed', async () => {
    await render(<StartupError detail="disk full" />);
    expect(screen.queryByText('disk full')).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Show details' }));
    expect(screen.getByText('disk full')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Hide details' }));
    expect(screen.queryByText('disk full')).toBeNull();
  });

  it('opens the mail app and WhatsApp', async () => {
    await render(<StartupError detail="x" />);

    await fireEvent.press(screen.getByRole('button', { name: 'Email support' }));
    expect(Linking.openURL).toHaveBeenCalledWith('mailto:alarsio.team@gmail.com');

    await fireEvent.press(screen.getByRole('button', { name: 'WhatsApp support' }));
    expect(Linking.openURL).toHaveBeenCalledWith('https://wa.me/917977239722');
  });

  // Phone review, 12 Nov 2026: a crash inside a screen offers the retry Expo Router passes.
  it('offers Try again when it can retry, and says so in its sentence', async () => {
    const retry = jest.fn(() => Promise.resolve());
    await render(<StartupError detail="x" onRetry={retry} />);

    expect(screen.getByText(/^Something went wrong on this screen\. Tap Try again/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('shows no Try again when the app could not start at all', async () => {
    await render(<StartupError detail="x" />);
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });
});
