// Sign-in for the field app. Owner: Identity (Ishant). Issue #14.
//
// Screens talk to an AuthClient, not to Supabase, so they are tested without a
// network. The real client is supabaseAuthClient below. Supervisors are
// invited from the web dashboard and create their account there, so the phone
// only signs in and out.

import type { SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

export interface SignedInUser {
  id: string;
  email: string;
}

export type SignInResult = { ok: true; user: SignedInUser } | { ok: false; message: string };

export interface AuthClient {
  currentUser(): Promise<SignedInUser | null>;
  signIn(email: string, password: string): Promise<SignInResult>;
  signOut(): Promise<void>;
  /** Called with the new user, or null, whenever the session changes. */
  onChange(listener: (user: SignedInUser | null) => void): () => void;
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

function toUser(user: { id: string; email?: string | null } | null | undefined): SignedInUser | null {
  return user ? { id: user.id, email: user.email ?? '' } : null;
}

export function supabaseAuthClient(supabase: SupabaseClient): AuthClient {
  // Supabase's Expo guide: refresh the token only while the app is in front, so
  // a backgrounded phone does not keep waking the radio.
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });

  return {
    async currentUser() {
      // getSession reads the stored session, so this works offline.
      const { data } = await supabase.auth.getSession();
      return toUser(data.session?.user);
    },

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
      // 'local' clears this phone's session even with no connection.
      await supabase.auth.signOut({ scope: 'local' });
    },

    onChange(listener) {
      const { data } = supabase.auth.onAuthStateChange((_event, session) => listener(toUser(session?.user)));
      return () => data.subscription.unsubscribe();
    },
  };
}
