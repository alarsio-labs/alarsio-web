// The signed-in user for the app, from the stored session. Owner: Identity.

import { useEffect, useState } from 'react';

import type { AuthClient, SignedInUser } from './auth-client';

export type SessionState = { kind: 'loading' } | { kind: 'signed_out' } | { kind: 'signed_in'; user: SignedInUser };

export function useSession(auth: AuthClient | undefined): SessionState {
  const [state, setState] = useState<SessionState>({ kind: 'loading' });

  useEffect(() => {
    if (!auth) return;
    let cancelled = false;
    const apply = (user: SignedInUser | null) => {
      if (!cancelled) setState(user ? { kind: 'signed_in', user } : { kind: 'signed_out' });
    };
    auth.currentUser().then(apply, () => apply(null));
    const unsubscribe = auth.onChange(apply);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [auth]);

  return state;
}
