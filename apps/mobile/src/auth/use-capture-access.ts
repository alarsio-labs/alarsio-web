// The access answer for the signed-in user: cache first, then refresh online.

import { useEffect, useState } from 'react';

import { readCachedAccess, refreshCaptureAccess, type AccessStore, type CaptureAccess } from './role';

/** Without a cached answer, wait this long for the server before opening the capture app. */
export const ACCESS_WAIT_MS = 3000;

/** null while the first answer is on its way. */
export function useCaptureAccess(
  userId: string,
  fetchAccess: (userId: string) => Promise<CaptureAccess>,
  store: AccessStore,
): CaptureAccess | null {
  const [access, setAccess] = useState<CaptureAccess | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void (async () => {
      const cached = await readCachedAccess(store, userId);
      if (cancelled) return;
      if (cached) setAccess(cached);
      else timer = setTimeout(() => !cancelled && setAccess((a) => a ?? 'capture'), ACCESS_WAIT_MS);
      const result = await refreshCaptureAccess(() => fetchAccess(userId), store, userId);
      if (timer) clearTimeout(timer);
      if (!cancelled) setAccess(result.access);
    })();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [userId, fetchAccess, store]);

  return access;
}
