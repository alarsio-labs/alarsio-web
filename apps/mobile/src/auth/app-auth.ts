// The app's one auth client and the sign-out the header, Help and about, and
// the "use the web" screen all share. Owner: Identity (#56, ADR-031).

import AsyncStorage from '@react-native-async-storage/async-storage';

import { readPublicConfig } from '../config/public-config';
import { openAppDb } from '../lib/app-db';
import { AUTH_STORAGE_KEY, authStorage, getSupabase } from '../lib/supabase';
import { countByStatus } from '../sync/outbox';
import { supabaseAuthClient } from './auth-client';
import { clearAccessCache, fetchCaptureAccess, type CaptureAccess } from './role';
import { signOutAndClearMirrors } from './sign-out';

export const config = readPublicConfig();
const supabase = config.ok ? getSupabase(config.config) : undefined;
export const auth = supabase ? supabaseAuthClient(supabase, authStorage, AUTH_STORAGE_KEY) : undefined;

export async function unsentCounts(userId: string) {
  const c = await countByStatus(await openAppDb(), userId);
  return { waiting: c.pending + c.syncing + c.failed, needFix: c.conflict + c.rejected };
}

// Sign-out also clears the offline copy of sites, materials and roster, and the cached role.
export const signOutKeepingNothingBehind = () =>
  auth ? signOutAndClearMirrors(auth.signOut, openAppDb, () => clearAccessCache(AsyncStorage)) : Promise.resolve();

// The role read goes through the user's own session; RLS decides what comes back.
export const fetchAccessForUser = (userId: string): Promise<CaptureAccess> =>
  supabase ? fetchCaptureAccess(supabase, userId) : Promise.reject(new Error('No configuration'));

export { AsyncStorage as accessStore };
