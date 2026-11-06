import type { AppRole } from '@alarsio/types';

import {
  captureAccessFor,
  clearAccessCache,
  fetchRoles,
  readCachedAccess,
  refreshCaptureAccess,
  type AccessStore,
  type CaptureAccess,
} from '../role';

const USER = '11111111-0000-4000-8000-00000000000a';

function memoryStore(initial: Record<string, string> = {}): AccessStore & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: async (k) => data[k] ?? null,
    setItem: async (k, v) => {
      data[k] = v;
    },
    getAllKeys: async () => Object.keys(data),
    multiRemove: async (keys) => {
      for (const k of keys) delete data[k];
    },
  };
}

describe('captureAccessFor', () => {
  it.each<[string, AppRole[], CaptureAccess]>([
    ['supervisor', ['supervisor'], 'capture'],
    ['project manager', ['project_manager'], 'capture'],
    ['owner only', ['owner'], 'web'],
    ['accountant only', ['accountant'], 'web'],
    ['owner and accountant', ['owner', 'accountant'], 'web'],
    ['owner in one company and supervisor in another', ['owner', 'supervisor'], 'capture'],
    ['no memberships', [], 'none'],
  ])('%s gives %s', (_name, roles, expected) => {
    expect(captureAccessFor(roles)).toBe(expected);
  });
});

describe('fetchRoles', () => {
  const clientReturning = (result: { data: unknown; error: { message: string } | null }) => {
    const eq = jest.fn(async () => result);
    const select = jest.fn(() => ({ eq }));
    const from = jest.fn(() => ({ select }));
    return { client: { from } as never, from, select, eq };
  };

  it("reads only this user's roles from memberships", async () => {
    const { client, from, select, eq } = clientReturning({ data: [{ role: 'supervisor' }, { role: 'owner' }], error: null });
    await expect(fetchRoles(client, USER)).resolves.toEqual(['supervisor', 'owner']);
    expect(from).toHaveBeenCalledWith('memberships');
    expect(select).toHaveBeenCalledWith('role');
    expect(eq).toHaveBeenCalledWith('user_id', USER);
  });

  it('ignores a role value that is not one of the four', async () => {
    const { client } = clientReturning({ data: [{ role: 'admin' }, { role: 'accountant' }], error: null });
    await expect(fetchRoles(client, USER)).resolves.toEqual(['accountant']);
  });

  it('throws when the read fails', async () => {
    const { client } = clientReturning({ data: null, error: { message: 'offline' } });
    await expect(fetchRoles(client, USER)).rejects.toThrow('offline');
  });
});

describe('refreshCaptureAccess', () => {
  it('caches a fresh answer', async () => {
    const store = memoryStore();
    const result = await refreshCaptureAccess(async () => 'web', store, USER);
    expect(result).toEqual({ access: 'web', fresh: true });
    expect(await readCachedAccess(store, USER)).toBe('web');
  });

  it('with a fetch error and no cache, gives capture', async () => {
    const result = await refreshCaptureAccess(() => Promise.reject(new Error('offline')), memoryStore(), USER);
    expect(result).toEqual({ access: 'capture', fresh: false });
  });

  it('with a fetch error and a cache, gives the cached value', async () => {
    const store = memoryStore({ [`alarsio-access:${USER}`]: 'web' });
    const result = await refreshCaptureAccess(() => Promise.reject(new Error('offline')), store, USER);
    expect(result).toEqual({ access: 'web', fresh: false });
  });

  it('ignores a damaged cache value', async () => {
    const store = memoryStore({ [`alarsio-access:${USER}`]: 'admin' });
    expect(await readCachedAccess(store, USER)).toBeNull();
  });
});

describe('clearAccessCache', () => {
  it("removes every user's cached answer and nothing else", async () => {
    const store = memoryStore({ 'alarsio-access:a': 'web', 'alarsio-access:b': 'capture', other: 'keep' });
    await clearAccessCache(store);
    expect(store.data).toEqual({ other: 'keep' });
  });

  it('never throws', async () => {
    const broken: AccessStore = { ...memoryStore(), getAllKeys: () => Promise.reject(new Error('x')) };
    await expect(clearAccessCache(broken)).resolves.toBeUndefined();
  });
});
