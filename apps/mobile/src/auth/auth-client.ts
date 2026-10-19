// Sign-in for the field app. Owner: Identity (Ishant). Issue #56, ADR-026.
//
// Screens talk to an AuthClient, not to Supabase, so they are tested without a
// network. Supervisors are invited from the web dashboard and create their
// account there, so the phone only signs in and out.
//
// Offline first (CLAUDE.md rule 6): a supervisor who signed in on site stays
// signed in through a restart with no signal, even after the access token has
// expired. Only a refresh the server refuses, or a sign-out, ends the session.

import { isAuthRetryableFetchError, type SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

export interface SignedInUser {
  id: string;
  email: string;
}

export type SignInResult = { ok: true; user: SignedInUser } | { ok: false; message: string };

export interface AuthClient {
  currentUser(): Promise<SignedInUser | null>;
  signIn(email: string, password: string): Promise<SignInResult>;
  /** Always ends this phone's session, online or not. */
  signOut(): Promise<void>;
  /** Called with the new user, or null, whenever the session changes. */
  onChange(listener: (user: SignedInUser | null) => void): () => void;
}

/** The part of the encrypted store sign-in needs. */
export interface SessionStore {
  getItem(key: string): Promise<string | null>;
  removeItem(key: string): Promise<void>;
}

/** A fixed message per failure, so nothing from the server is shown as-is. */
export function signInErrorMessage(error: { code?: string; status?: number; name?: string } | null): string {
  if (!error) return 'Could not sign in. Try again.';
  if (error.code === 'invalid_credentials') return 'Email or password is wrong.';
  if (error.code === 'email_not_confirmed') return 'Confirm your email first, using the link we sent.';
  if (error.code === 'over_request_rate_limit' || error.status === 429) {
    return 'Too many attempts. Wait a few minutes and try again.';
  }
  if (error.name === 'AuthRetryableFetchError' || error.status === 0) {
    return 'No connection. Sign in needs the internet once; after that the app works offline.';
  }
  return 'Could not sign in. Try again.';
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toUser(user: { id?: unknown; email?: unknown } | null | undefined): SignedInUser | null {
  if (!user || typeof user.id !== 'string' || !UUID.test(user.id)) return null;
  return { id: user.id, email: typeof user.email === 'string' ? user.email : '' };
}

/** The user in the stored session, read without the network. */
export async function readStoredUser(store: SessionStore, key: string): Promise<SignedInUser | null> {
  try {
    const raw = await store.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    return toUser((parsed as { user?: { id?: unknown; email?: unknown } }).user);
  } catch {
    return null;
  }
}

export function supabaseAuthClient(supabase: SupabaseClient, store: SessionStore, storageKey: string): AuthClient {
  const listeners = new Set<(user: SignedInUser | null) => void>();
  const emit = (user: SignedInUser | null) => {
    for (const listener of listeners) listener(user);
  };

  // Supabase's Expo guide: refresh the token only while the app is in front.
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });

  const currentUser = async (): Promise<SignedInUser | null> => {
    const { data, error } = await supabase.auth.getSession();
    const user = toUser(data.session?.user);
    if (user) return user;
    // Offline with an expired token, getSession() gives null plus a retryable
    // error, but the session is still stored. Stay signed in as that user; the
    // token refreshes when the signal is back. A refusal from the server is not
    // retryable, and supabase-js has already removed the session then.
    if (error && isAuthRetryableFetchError(error)) return readStoredUser(store, storageKey);
    return null;
  };

  supabase.auth.onAuthStateChange((event, session) => {
    const user = toUser(session?.user);
    if (user) emit(user);
    else if (event === 'SIGNED_OUT') emit(null);
    // A null INITIAL_SESSION or failed refresh may only mean "no signal":
    // ask currentUser, which knows the difference.
    else void currentUser().then(emit, () => emit(null));
  });

  return {
    currentUser,

    async signIn(email, password) {
      const trimmed = email.trim().toLowerCase();
      if (trimmed === '' || password === '') return { ok: false, message: 'Enter your email and password.' };
      try {
        const { data, error } = await supabase.auth.signInWithPassword({ email: trimmed, password });
        const user = toUser(data.user);
        if (error || !user) return { ok: false, message: signInErrorMessage(error) };
        return { ok: true, user };
      } catch {
        return { ok: false, message: signInErrorMessage({ status: 0 }) };
      }
    },

    async signOut() {
      // 'local' ends only this phone's session. Offline with an expired token,
      // supabase-js returns an error before it removes the stored session, so
      // remove it ourselves: on a shared phone the next person's records must
      // never be saved under this user (ADR-020).
      let failed = false;
      try {
        const { error } = await supabase.auth.signOut({ scope: 'local' });
        failed = error !== null;
      } catch {
        failed = true;
      }
      if (failed || (await readStoredUser(store, storageKey)) !== null) {
        await store.removeItem(storageKey);
      }
      emit(null);
    },

    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
