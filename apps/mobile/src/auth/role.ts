// Which app a signed-in user gets. Owner: Identity (Ishant), added for the pilot polish.
//
// The phone is the capture app: supervisors and project managers record the
// site day. Owners and accountants work on the web. The role comes from the
// user's own memberships rows, which RLS already lets them read (the web reads
// the same rows). Nothing here is authority: RLS and sync_push still refuse any
// record the user may not make.
//
// Offline first: with no signal and no cached answer the user gets the capture
// app. Capture is never blocked on the network.

import { isAppRole, type AppRole } from '@alarsio/types';
import type { SupabaseClient } from '@supabase/supabase-js';

export type CaptureAccess = 'capture' | 'web' | 'none';

export const ACCESS_KEY_PREFIX = 'alarsio-access:';
const accessKey = (userId: string) => `${ACCESS_KEY_PREFIX}${userId}`;

/** The part of AsyncStorage this needs; injected so tests need no native module. */
export interface AccessStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  getAllKeys(): Promise<readonly string[]>;
  multiRemove(keys: readonly string[]): Promise<void>;
}

/** capture if any role is a capturing role; web if every role is owner or accountant; none with no roles. */
export function captureAccessFor(roles: readonly AppRole[]): CaptureAccess {
  if (roles.length === 0) return 'none';
  if (roles.some((r) => r === 'supervisor' || r === 'project_manager')) return 'capture';
  return 'web';
}

/** The user's roles across every company they belong to. Throws when the read fails. */
export async function fetchRoles(supabase: SupabaseClient, userId: string): Promise<AppRole[]> {
  const { data, error } = await supabase.from('memberships').select('role').eq('user_id', userId);
  if (error) throw new Error(error.message);
  const roles: AppRole[] = [];
  for (const row of data ?? []) {
    const role: unknown = (row as { role?: unknown }).role;
    if (isAppRole(role)) roles.push(role);
  }
  return roles;
}

export async function fetchCaptureAccess(supabase: SupabaseClient, userId: string): Promise<CaptureAccess> {
  return captureAccessFor(await fetchRoles(supabase, userId));
}

function isAccess(value: unknown): value is CaptureAccess {
  return value === 'capture' || value === 'web' || value === 'none';
}

export async function readCachedAccess(store: AccessStore, userId: string): Promise<CaptureAccess | null> {
  try {
    const raw = await store.getItem(accessKey(userId));
    return isAccess(raw) ? raw : null;
  } catch {
    return null;
  }
}

/**
 * Asks the server and caches the answer. On any failure (offline, slow, refused)
 * it answers the cached value, or 'capture' when there is none. `fresh` says
 * whether the answer came from the server.
 */
export async function refreshCaptureAccess(
  fetchAccess: () => Promise<CaptureAccess>,
  store: AccessStore,
  userId: string,
): Promise<{ access: CaptureAccess; fresh: boolean }> {
  try {
    const access = await fetchAccess();
    try {
      await store.setItem(accessKey(userId), access);
    } catch {
      // A cache that cannot be written only costs a lookup next time.
    }
    return { access, fresh: true };
  } catch {
    return { access: (await readCachedAccess(store, userId)) ?? 'capture', fresh: false };
  }
}

/** Sign-out forgets every user's cached answer on this phone. */
export async function clearAccessCache(store: AccessStore): Promise<void> {
  try {
    const keys = (await store.getAllKeys()).filter((k) => k.startsWith(ACCESS_KEY_PREFIX));
    if (keys.length > 0) await store.multiRemove(keys);
  } catch {
    // Never fails a sign-out (ADR-020).
  }
}
