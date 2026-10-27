import { act, useEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Session, User } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { AuthContinuityBoundary } from '@/components/auth/AuthContinuityBoundary';

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUser: vi.fn(),
  signOut: vi.fn(),
  listener: null as ((event: string, session: Session | null) => void) | null,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: {
    getSession: auth.getSession,
    getUser: auth.getUser,
    signOut: auth.signOut,
    onAuthStateChange: (listener: (event: string, session: Session | null) => void) => {
      auth.listener = listener;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    },
  } },
}));
vi.mock('@/lib/nativeAuth', () => ({ initDeepLinkAuth: vi.fn() }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const now = new Date('2026-10-26T18:00:00.000Z');
const seconds = Math.floor(now.getTime() / 1000);
const person = (id: string, role = 'user') => ({
  id,
  app_metadata: { role },
  user_metadata: { role: 'admin' },
}) as unknown as User;
type BindingClaims = { sub?: string; iss?: string; session_id?: string };
const token = (id: string, expires = seconds + 3600, claims: BindingClaims = {}) =>
  `header.${btoa(JSON.stringify({
    sub: id,
    iss: 'https://auth.example.test/auth/v1',
    session_id: `${id}-session`,
    exp: expires,
    ...claims,
  })).replace(/=/g, '')}.signature`;
const session = (id: string, accessToken: string, role = 'user', expiresAt = seconds + 3600) => ({
  access_token: accessToken,
  expires_at: expiresAt,
  user: person(id, role),
}) as Session;
const verified = (id: string, role = 'user') => ({ data: { user: person(id, role) }, error: null });

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

type Snapshot = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  authError: boolean;
  isAdmin: boolean;
};
let snapshot: Snapshot;
let mounts = 0;
let unmounts = 0;
let host: HTMLDivElement | null = null;
let root: Root | null = null;

function Draft() {
  const [clicks, setClicks] = useState(0);
  useEffect(() => {
    mounts += 1;
    return () => { unmounts += 1; };
  }, []);
  return <section data-testid="draft">
    <input aria-label="Rascunho" />
    <button onClick={() => setClicks(value => value + 1)}>Contar</button>
    <output data-testid="clicks">{clicks}</output>
  </section>;
}

function Gate() {
  const { user, session: activeSession, loading, authError } = useAuth();
  const { isAdmin } = useIsAdmin();
  snapshot = { user, session: activeSession, loading, authError, isAdmin };
  return loading || authError || !user ? null : <Draft />;
}

async function mount(initial: Session) {
  auth.getSession.mockResolvedValue({ data: { session: initial }, error: null });
  auth.getUser.mockResolvedValueOnce(verified(initial.user.id));
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root!.render(<AuthProvider><Gate /></AuthProvider>); });
  await flush();
  expect(snapshot.user?.id).toBe(initial.user.id);
}

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

async function event(name: string, next: Session | null) {
  await act(async () => { auth.listener!(name, next); });
}

async function advance(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

function draft() {
  return host!.querySelector('[data-testid="draft"]') as HTMLElement | null;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  auth.getSession.mockReset();
  auth.getUser.mockReset();
  auth.signOut.mockReset();
  auth.listener = null;
  mounts = 0;
  unmounts = 0;
});

afterEach(() => {
  if (root) act(() => { root!.unmount(); });
  host?.remove();
  root = null;
  host = null;
  vi.useRealTimers();
});

describe('independent Auth refresh contract', () => {
  it('keeps the confirmed view and draft through a same-UID token rotation, without trusting candidate admin', async () => {
    const first = token('hero');
    const next = token('hero', seconds + 7200);
    const confirmation = deferred<ReturnType<typeof verified>>();
    await mount(session('hero', first));
    const scene = draft()!;
    const input = scene.querySelector('input')!;
    await act(async () => { scene.querySelector('button')!.click(); });
    input.value = 'rascunho local';
    input.focus();
    scene.scrollTop = 37;
    auth.getUser.mockReturnValueOnce(confirmation.promise);

    await event('TOKEN_REFRESHED', session('hero', next, 'admin'));
    expect(auth.getUser).toHaveBeenLastCalledWith(next);
    expect(snapshot).toMatchObject({ loading: false, authError: false, isAdmin: false });
    expect(snapshot.user?.id).toBe('hero');
    expect(snapshot.session?.access_token).toBe(first);
    expect(draft()).toBe(scene);
    expect(input).toBe(document.activeElement);
    expect(input.value).toBe('rascunho local');
    expect(scene.scrollTop).toBe(37);
    expect(scene.querySelector('[data-testid="clicks"]')?.textContent).toBe('1');
    expect([mounts, unmounts]).toEqual([1, 0]);

    confirmation.resolve(verified('hero'));
    await flush();
    expect(snapshot.session?.access_token).toBe(next);
    expect(snapshot.isAdmin).toBe(false);
    expect(draft()).toBe(scene);
    expect(input).toBe(document.activeElement);
    expect(input.value).toBe('rascunho local');
    expect(scene.scrollTop).toBe(37);
    expect([mounts, unmounts]).toEqual([1, 0]);
  });

  it('does not replace a confirmed user or token with a same-UID unverified candidate', async () => {
    const first = token('hero');
    const next = token('hero', seconds + 7200);
    const confirmation = deferred<ReturnType<typeof verified>>();
    await mount(session('hero', first));
    const confirmedUser = snapshot.user;
    auth.getUser.mockReturnValueOnce(confirmation.promise);
    await event('TOKEN_REFRESHED', session('hero', next, 'admin'));
    expect(snapshot.user).toBe(confirmedUser);
    expect(snapshot.session?.access_token).toBe(first);
    expect(snapshot.isAdmin).toBe(false);
    confirmation.resolve(verified('hero', 'user'));
    await flush();
    expect(snapshot.user?.app_metadata.role).toBe('user');
    expect(snapshot.session?.user).toBe(snapshot.user);
  });

  it('blocks a claimed identity change before accepting any result', async () => {
    const first = token('hero');
    const other = token('other');
    const confirmation = deferred<ReturnType<typeof verified>>();
    await mount(session('hero', first));
    auth.getUser.mockReturnValueOnce(confirmation.promise);
    await event('TOKEN_REFRESHED', session('other', other, 'admin'));
    expect(snapshot.loading).toBe(true);
    expect(snapshot.user).toBeNull();
    expect(snapshot.session).toBeNull();
    expect(snapshot.isAdmin).toBe(false);
    expect(draft()).toBeNull();
    confirmation.resolve(verified('other'));
    await flush();
    expect(snapshot.user).toBeNull();
    expect(snapshot.session).toBeNull();
    expect(snapshot.authError).toBe(true);
    expect(snapshot.isAdmin).toBe(false);
  });

  it.each([
    ['missing sub', { sub: undefined }],
    ['missing issuer', { iss: undefined }],
    ['missing session', { session_id: undefined }],
    ['different issuer', { iss: 'https://other.example.test/auth/v1' }],
    ['different session', { session_id: 'other-session' }],
    ['different JWT sub despite unchanged event user', { sub: 'other' }],
  ] as const)('blocks a refresh with %s even when Auth confirms the old UID', async (_name, claims) => {
    const first = token('hero');
    const next = token('hero', seconds + 7200, claims);
    const confirmation = deferred<ReturnType<typeof verified>>();
    await mount(session('hero', first));
    auth.getUser.mockReturnValueOnce(confirmation.promise);

    await event('TOKEN_REFRESHED', session('hero', next, 'admin'));
    expect(auth.getUser).toHaveBeenLastCalledWith(next);
    expect(snapshot).toMatchObject({ user: null, session: null, loading: true, authError: false, isAdmin: false });
    expect(draft()).toBeNull();
    confirmation.resolve(verified('hero'));
    await flush();
    expect(snapshot).toMatchObject({ user: null, session: null, loading: false, authError: true, isAdmin: false });
    expect(draft()).toBeNull();
  });

  it('blocks a same-UID refresh when Auth returns a different UID', async () => {
    const first = token('hero');
    const next = token('hero', seconds + 7200);
    const confirmation = deferred<ReturnType<typeof verified>>();
    await mount(session('hero', first));
    auth.getUser.mockReturnValueOnce(confirmation.promise);
    await event('TOKEN_REFRESHED', session('hero', next, 'admin'));
    confirmation.resolve(verified('other', 'admin'));
    await flush();
    expect(snapshot).toMatchObject({ user: null, session: null, loading: false, authError: true, isAdmin: false });
    expect(draft()).toBeNull();
  });

  it('accepts a new SIGNED_IN identity only after a blocked refresh and its own remote confirmation', async () => {
    const first = token('hero');
    const differentSession = token('hero', seconds + 7200, { session_id: 'other-session' });
    const newLogin = token('other');
    const loginConfirmation = deferred<ReturnType<typeof verified>>();
    await mount(session('hero', first));
    auth.getUser.mockResolvedValueOnce(verified('hero'));

    await event('TOKEN_REFRESHED', session('hero', differentSession, 'admin'));
    await flush();
    expect(snapshot).toMatchObject({ user: null, session: null, loading: false, authError: true, isAdmin: false });
    auth.getUser.mockReturnValueOnce(loginConfirmation.promise);

    await event('SIGNED_IN', session('other', newLogin, 'admin'));
    expect(auth.getUser).toHaveBeenLastCalledWith(newLogin);
    expect(snapshot).toMatchObject({ user: null, session: null, loading: true, authError: false, isAdmin: false });
    expect(draft()).toBeNull();
    loginConfirmation.resolve(verified('other'));
    await flush();
    expect(snapshot).toMatchObject({ loading: false, authError: false, isAdmin: false });
    expect(snapshot.user?.id).toBe('other');
    expect(snapshot.session?.access_token).toBe(newLogin);
    expect(snapshot.session?.user).toBe(snapshot.user);
    expect(draft()).not.toBeNull();
  });

  it('blocks after Auth rejects a same-UID refresh and does not sign out implicitly', async () => {
    const first = token('hero');
    const next = token('hero', seconds + 7200);
    const confirmation = deferred<ReturnType<typeof verified>>();
    await mount(session('hero', first));
    auth.getUser.mockReturnValueOnce(confirmation.promise);
    await event('TOKEN_REFRESHED', session('hero', next));
    confirmation.reject(new Error('Auth unavailable'));
    await flush();
    expect(snapshot).toMatchObject({ user: null, session: null, loading: false, authError: true });
    expect(draft()).toBeNull();
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it('blocks on the original refresh deadline despite duplicate events', async () => {
    const first = token('hero');
    const next = token('hero', seconds + 7200);
    await mount(session('hero', first));
    auth.getUser.mockReturnValue(new Promise(() => {}));
    await event('TOKEN_REFRESHED', session('hero', next));
    await advance(10_000);
    await event('TOKEN_REFRESHED', session('hero', next));
    await advance(5_000);
    expect(snapshot).toMatchObject({ user: null, session: null, loading: false, authError: true });
    expect(draft()).toBeNull();
  });

  it('never restores a pending refresh after logout', async () => {
    const first = token('hero');
    const next = token('hero', seconds + 7200);
    const confirmation = deferred<ReturnType<typeof verified>>();
    await mount(session('hero', first));
    auth.getUser.mockReturnValueOnce(confirmation.promise);
    await event('TOKEN_REFRESHED', session('hero', next));
    await event('SIGNED_OUT', null);
    confirmation.resolve(verified('hero'));
    await flush();
    expect(snapshot).toMatchObject({ user: null, session: null, loading: false, authError: false });
    expect(draft()).toBeNull();
  });

  it('ignores an older response and an older expiry timer after the latest token is confirmed', async () => {
    const first = token('hero', seconds + 2);
    const middle = token('hero', seconds + 4);
    const latest = token('hero', seconds + 3600);
    const oldConfirmation = deferred<ReturnType<typeof verified>>();
    const latestConfirmation = deferred<ReturnType<typeof verified>>();
    await mount(session('hero', first));
    auth.getUser.mockReturnValueOnce(oldConfirmation.promise).mockReturnValueOnce(latestConfirmation.promise);
    await event('TOKEN_REFRESHED', session('hero', middle));
    await event('TOKEN_REFRESHED', session('hero', latest));
    latestConfirmation.resolve(verified('hero'));
    await flush();
    expect(snapshot.session?.access_token).toBe(latest);
    oldConfirmation.resolve(verified('hero', 'admin'));
    await flush();
    await advance(4_000);
    expect(snapshot).toMatchObject({ loading: false, authError: false, isAdmin: false });
    expect(snapshot.user?.id).toBe('hero');
    expect(snapshot.session?.access_token).toBe(latest);
    expect(draft()).not.toBeNull();
  });

  it('quarantines at confirmed-token expiry, accepts an in-window answer, and ignores one after timeout', async () => {
    const first = token('hero', seconds + 2);
    const next = token('hero', seconds + 3600);
    const confirmation = deferred<ReturnType<typeof verified>>();
    function Probe() {
      const { user, session: activeSession, loading, authError } = useAuth();
      const { isAdmin } = useIsAdmin();
      snapshot = { user, session: activeSession, loading, authError, isAdmin };
      return null;
    }
    function Scene() {
      const { user, loading, authError } = useAuth();
      return loading || authError || !user ? null : <Draft />;
    }
    auth.getSession.mockResolvedValue({ data: { session: session('hero', first) }, error: null });
    auth.getUser.mockResolvedValueOnce(verified('hero'));
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(<AuthProvider><Probe /><AuthContinuityBoundary><Scene /></AuthContinuityBoundary></AuthProvider>);
    });
    await flush();
    expect(snapshot.user?.id).toBe('hero');
    const scene = draft()!;
    const input = scene.querySelector('input')!;
    input.value = 'rascunho preservado';
    auth.getUser.mockReturnValueOnce(confirmation.promise);
    await event('TOKEN_REFRESHED', session('hero', next));
    await advance(2_000);
    expect(snapshot).toMatchObject({ user: null, session: null, loading: true, authError: false, isAdmin: false });
    expect(host.querySelector('[role="status"]')).not.toBeNull();
    expect(host.querySelector('[data-auth-retained]')?.hasAttribute('inert')).toBe(true);
    expect(draft()).toBe(scene);
    await advance(5_000);
    expect(snapshot).toMatchObject({ user: null, session: null, loading: true, authError: false });
    confirmation.resolve(verified('hero'));
    await flush();
    expect(snapshot).toMatchObject({ loading: false, authError: false, isAdmin: false });
    expect(snapshot.user?.id).toBe('hero');
    expect(snapshot.session?.access_token).toBe(next);
    expect(draft()).toBe(scene);
    expect(input.value).toBe('rascunho preservado');
    expect([mounts, unmounts]).toEqual([1, 0]);

    const later = token('hero', seconds + 7200);
    const tooLate = deferred<ReturnType<typeof verified>>();
    auth.getUser.mockReturnValueOnce(tooLate.promise);
    await event('TOKEN_REFRESHED', session('hero', later));
    await advance(15_000);
    expect(snapshot).toMatchObject({ user: null, session: null, loading: false, authError: true });
    expect(draft()).toBeNull();
    tooLate.resolve(verified('hero'));
    await flush();
    expect(snapshot).toMatchObject({ user: null, session: null, loading: false, authError: true });
    expect(draft()).toBeNull();
  });
});
