import { act, fireEvent, render, screen } from '@testing-library/react-native';

import type { SignInResult } from '../../auth/auth-client';
import { SEEN_KEY, type SeenStore } from '../../onboarding/seen-store';
import { SLIDES, SPLASH_LINE } from '../../onboarding/slides';
import { BrandSplash } from '../BrandSplash';
import { OnboardingScreen } from '../OnboardingScreen';
import { SignedOutFlow } from '../SignedOutFlow';

const signIn = jest.fn((): Promise<SignInResult> => Promise.resolve({ ok: false, message: 'x' }));

function memoryStore(initial?: string): SeenStore & { data: Map<string, string> } {
  const data = new Map<string, string>(initial ? [[SEEN_KEY, initial]] : []);
  return {
    data,
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => {
      data.set(k, v);
    },
  };
}

describe('BrandSplash', () => {
  afterEach(() => jest.useRealTimers());

  it('shows the line and moves on by itself, once', async () => {
    jest.useFakeTimers();
    const onDone = jest.fn();
    await render(<BrandSplash onDone={onDone} durationMs={1000} />);
    expect(screen.getByText(SPLASH_LINE)).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('moves on at once on a tap, and the timer does not fire again', async () => {
    jest.useFakeTimers();
    const onDone = jest.fn();
    await render(<BrandSplash onDone={onDone} durationMs={1000} />);
    await fireEvent.press(screen.getByRole('button', { name: /Tap to continue/ }));
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe('OnboardingScreen', () => {
  it('has four slides, each read as one sentence', async () => {
    await render(<OnboardingScreen onDone={jest.fn()} />);
    expect(SLIDES).toHaveLength(4);
    for (const [i, s] of SLIDES.entries()) {
      expect(screen.getByLabelText(`${i + 1} of 4. ${s.title}. ${s.body}`)).toBeTruthy();
    }
  });

  it('leaves through Sign in or Skip, and Next stops on the last slide', async () => {
    const onDone = jest.fn();
    await render(<OnboardingScreen onDone={onDone} />);
    for (let i = 0; i < 3; i++) await fireEvent.press(screen.getByRole('button', { name: 'Next slide' }));
    expect(screen.queryByRole('button', { name: 'Next slide' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Skip the tutorial' }));
    expect(onDone).toHaveBeenCalledTimes(2);
  });

  it('says Done when opened again from Help', async () => {
    await render(<OnboardingScreen onDone={jest.fn()} doneLabel="Done" />);
    expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy();
  });
});

describe('SignedOutFlow', () => {
  it('shows the tutorial on the first open, then Sign in, and remembers it', async () => {
    const store = memoryStore();
    await render(<SignedOutFlow signIn={signIn} store={store} />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Sign in' }));
    expect(await screen.findByLabelText('Email')).toBeTruthy();
    expect(store.data.get(SEEN_KEY)).toBe('1');
  });

  it('goes straight to Sign in once seen, and How Alarsio works brings the tutorial back', async () => {
    await render(<SignedOutFlow signIn={signIn} store={memoryStore('1')} />);
    expect(await screen.findByLabelText('Email')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'How Alarsio works' }));
    expect(await screen.findByRole('button', { name: 'Skip the tutorial' })).toBeTruthy();
  });
});
