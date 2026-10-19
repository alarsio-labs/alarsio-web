// The signed-in user, handed down from the sign-in gate in _layout.tsx.
// Owner: Identity (Ishant), added by Offline Sync for #69 (ADR-029).
//
// Screens that show or send a user's records read it from here, so none of
// them can end up covering every user's records on a shared phone. It is null
// outside the gate, for example when the app has no configuration.

import { createContext, useContext } from 'react';

import type { SignedInUser } from './auth-client';

export const SessionUserContext = createContext<SignedInUser | null>(null);

export function useSessionUser(): SignedInUser | null {
  return useContext(SessionUserContext);
}
