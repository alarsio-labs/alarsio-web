import { act, renderHook } from '@testing-library/react-native';

import type { AuthClient, SignedInUser } from '../auth-client';
import { useSession } from '../use-session';

const A: SignedInUser = { id: '0a000000-0000-4000-8000-00000000000a', email: 'a@x.in' };

function fakeAuth(current: () => Promise<SignedInUser | null>) {
  let emit: (u: SignedInUser | null) => void = () => undefined;
  const unsubscribe = jest.fn();
  const auth: AuthClient = {
    currentUser: current,
    signIn: jest.fn(),
    signOut: jest.fn(),
    onChange: (l) => {
      emit = l;
      return unsubscribe;
    },
  };
  return { auth, emit: (u: SignedInUser | null) => emit(u), unsubscribe };
}

describe('useSession', () => {
  it('goes from loading to signed in, then follows changes', async () => {
    const f = fakeAuth(async () => A);
    const { result } = await renderHook(() => useSession(f.auth));
    expect(result.current).toEqual({ kind: 'signed_in', user: A });
    await act(async () => f.emit(null));
    expect(result.current).toEqual({ kind: 'signed_out' });
  });

  it('is signed out when there is no user', async () => {
    const { auth } = fakeAuth(async () => null);
    const { result } = await renderHook(() => useSession(auth));
    expect(result.current).toEqual({ kind: 'signed_out' });
  });

  it('is signed out when reading the session fails', async () => {
    const { auth } = fakeAuth(() => Promise.reject(new Error('x')));
    const { result } = await renderHook(() => useSession(auth));
    expect(result.current).toEqual({ kind: 'signed_out' });
  });

  it('stops listening on unmount', async () => {
    const f = fakeAuth(async () => A);
    const { unmount } = await renderHook(() => useSession(f.auth));
    await act(async () => unmount());
    expect(f.unsubscribe).toHaveBeenCalled();
  });
});
