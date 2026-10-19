import { AuthRetryableFetchError, type SupabaseClient } from '@supabase/supabase-js';

import { readStoredUser, signInErrorMessage, supabaseAuthClient, type SessionStore, type SignedInUser } from '../auth-client';
import { signOutWarning } from '../sign-out-warning';

const KEY = 'alarsio-auth';
const A = { id: '0a000000-0000-4000-8000-00000000000a', email: 'a@x.in' };

function memoryStore(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const store: SessionStore & { data: Map<string, string> } = {
    data,
    getItem: async (k) => data.get(k) ?? null,
    removeItem: async (k) => {
      data.delete(k);
    },
  };
  return store;
}

const storedSession = (user = A) => JSON.stringify({ access_token: 'x', refresh_token: 'y', expires_at: 1, user });

type StateListener = (event: string, session: { user: unknown } | null) => void;

function fakeSupabase(auth: Partial<Record<string, jest.Mock>> = {}) {
  const stateListeners: StateListener[] = [];
  const client = {
    auth: {
      getSession: jest.fn(async () => ({ data: { session: null }, error: null })),
      signInWithPassword: jest.fn(),
      signOut: jest.fn(async () => ({ error: null })),
      startAutoRefresh: jest.fn(),
      stopAutoRefresh: jest.fn(),
      onAuthStateChange: jest.fn((cb: StateListener) => {
        stateListeners.push(cb);
        return { data: { subscription: { unsubscribe: jest.fn() } } };
      }),
      ...auth,
    },
  };
  return { supabase: client as unknown as SupabaseClient, fire: (e: string, s: { user: unknown } | null) => stateListeners.forEach((l) => l(e, s)) };
}

const offline = () => new AuthRetryableFetchError('Failed to fetch', 0);

describe('currentUser', () => {
  it('returns the session user when there is one', async () => {
    const { supabase } = fakeSupabase({ getSession: jest.fn(async () => ({ data: { session: { user: A } }, error: null })) });
    await expect(supabaseAuthClient(supabase, memoryStore(), KEY).currentUser()).resolves.toEqual(A);
  });

  it('stays signed in offline with an expired token, from the stored session', async () => {
    const { supabase } = fakeSupabase({ getSession: jest.fn(async () => ({ data: { session: null }, error: offline() })) });
    const client = supabaseAuthClient(supabase, memoryStore({ [KEY]: storedSession() }), KEY);
    await expect(client.currentUser()).resolves.toEqual(A);
  });

  it('is signed out when nothing is stored, even offline', async () => {
    const { supabase } = fakeSupabase({ getSession: jest.fn(async () => ({ data: { session: null }, error: offline() })) });
    await expect(supabaseAuthClient(supabase, memoryStore(), KEY).currentUser()).resolves.toBeNull();
  });

  it('is signed out when the server refuses the refresh (not retryable)', async () => {
    const refused = Object.assign(new Error('Invalid Refresh Token'), { status: 400 });
    const { supabase } = fakeSupabase({ getSession: jest.fn(async () => ({ data: { session: null }, error: refused })) });
    const client = supabaseAuthClient(supabase, memoryStore({ [KEY]: storedSession() }), KEY);
    await expect(client.currentUser()).resolves.toBeNull();
  });
});

describe('onChange', () => {
  it('keeps the stored user when a null session event comes from having no signal', async () => {
    const { supabase, fire } = fakeSupabase({ getSession: jest.fn(async () => ({ data: { session: null }, error: offline() })) });
    const client = supabaseAuthClient(supabase, memoryStore({ [KEY]: storedSession() }), KEY);
    const seen: (SignedInUser | null)[] = [];
    client.onChange((u) => seen.push(u));
    fire('INITIAL_SESSION', null);
    await new Promise((r) => setTimeout(r, 0));
    expect(seen).toEqual([A]);
  });

  it('reports a real sign-out', () => {
    const { supabase, fire } = fakeSupabase();
    const client = supabaseAuthClient(supabase, memoryStore(), KEY);
    const seen: (SignedInUser | null)[] = [];
    client.onChange((u) => seen.push(u));
    fire('SIGNED_OUT', null);
    expect(seen).toEqual([null]);
  });
});

describe('signIn', () => {
  it('signs in with a trimmed, lowercased email', async () => {
    const signInWithPassword = jest.fn(async () => ({ data: { user: A }, error: null }));
    const { supabase } = fakeSupabase({ signInWithPassword });
    await expect(supabaseAuthClient(supabase, memoryStore(), KEY).signIn('  A@X.in ', 'pw')).resolves.toEqual({ ok: true, user: A });
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'a@x.in', password: 'pw' });
  });

  it('gives the fixed message for a wrong password', async () => {
    const { supabase } = fakeSupabase({
      signInWithPassword: jest.fn(async () => ({ data: { user: null }, error: { code: 'invalid_credentials', status: 400 } })),
    });
    await expect(supabaseAuthClient(supabase, memoryStore(), KEY).signIn('a@x.in', 'bad')).resolves.toEqual({
      ok: false,
      message: 'Email or password is wrong.',
    });
  });

  it('turns a thrown fetch into the no-connection message', async () => {
    const { supabase } = fakeSupabase({ signInWithPassword: jest.fn(async () => { throw new TypeError('Network request failed'); }) });
    const result = await supabaseAuthClient(supabase, memoryStore(), KEY).signIn('a@x.in', 'pw');
    expect(result).toEqual({ ok: false, message: expect.stringMatching(/No connection/) });
  });

  it('asks for both fields before calling the server', async () => {
    const signInWithPassword = jest.fn();
    const { supabase } = fakeSupabase({ signInWithPassword });
    await supabaseAuthClient(supabase, memoryStore(), KEY).signIn('', '');
    expect(signInWithPassword).not.toHaveBeenCalled();
  });
});

describe('signOut', () => {
  it('removes the stored session itself when supabase-js returns an error offline', async () => {
    const store = memoryStore({ [KEY]: storedSession() });
    const { supabase } = fakeSupabase({ signOut: jest.fn(async () => ({ error: offline() })) });
    const client = supabaseAuthClient(supabase, store, KEY);
    const seen: (SignedInUser | null)[] = [];
    client.onChange((u) => seen.push(u));
    await client.signOut();
    expect(store.data.has(KEY)).toBe(false);
    expect(seen).toEqual([null]);
  });

  it('removes it when signOut throws, and still reports signed out', async () => {
    const store = memoryStore({ [KEY]: storedSession() });
    const { supabase } = fakeSupabase({ signOut: jest.fn(async () => { throw new Error('boom'); }) });
    const client = supabaseAuthClient(supabase, store, KEY);
    await client.signOut();
    expect(store.data.has(KEY)).toBe(false);
  });

  it('online, leaves removal to supabase-js and reports signed out', async () => {
    const store = memoryStore();
    const signOut = jest.fn(async () => ({ error: null }));
    const { supabase } = fakeSupabase({ signOut });
    const client = supabaseAuthClient(supabase, store, KEY);
    const seen: (SignedInUser | null)[] = [];
    client.onChange((u) => seen.push(u));
    await client.signOut();
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(seen).toEqual([null]);
  });
});

describe('readStoredUser', () => {
  it('ignores junk and a user without a uuid', async () => {
    await expect(readStoredUser(memoryStore({ [KEY]: 'not json' }), KEY)).resolves.toBeNull();
    await expect(readStoredUser(memoryStore({ [KEY]: JSON.stringify({ user: { id: 'x' } }) }), KEY)).resolves.toBeNull();
  });
});

describe('signInErrorMessage', () => {
  it('never shows server text for anything unknown', () => {
    expect(signInErrorMessage({ code: 'something_new' })).toBe('Could not sign in. Try again.');
    expect(signInErrorMessage(null)).toBe('Could not sign in. Try again.');
    expect(signInErrorMessage({ status: 429 })).toMatch(/Too many attempts/);
    expect(signInErrorMessage({ code: 'email_not_confirmed' })).toMatch(/Confirm your email/);
  });
});

describe('signOutWarning', () => {
  it('says nothing when everything is sent', () => {
    expect(signOutWarning({ waiting: 0, needFix: 0 })).toBeNull();
  });

  it('separates rows that will send from rows that need a fix', () => {
    const text = signOutWarning({ waiting: 3, needFix: 1 }) ?? '';
    expect(text).toMatch(/^3 records waiting to send\. .*send the next time you sign in here\./);
    expect(text).toMatch(/1 record need a fix before they can be saved/);
    expect(signOutWarning({ waiting: 0, needFix: 2 })).not.toMatch(/send the next time/);
  });

  it('says so when the count could not be read', () => {
    expect(signOutWarning(null)).toMatch(/Could not check/);
  });
});
