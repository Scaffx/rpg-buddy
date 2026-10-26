import { act, useEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Session, User } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { useIsAdmin } from '@/hooks/useIsAdmin';

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUser: vi.fn(),
  signOut: vi.fn(),
  listeners: [] as Array<(event: string, session: Session | null) => void>,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: auth.getSession,
      getUser: auth.getUser,
      signOut: auth.signOut,
      onAuthStateChange: (listener: (event: string, session: Session | null) => void) => {
        auth.listeners.push(listener);
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    },
  },
}));
vi.mock('@/lib/nativeAuth', () => ({ initDeepLinkAuth: vi.fn() }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const member = (id: string, role = 'user') => ({ id, app_metadata: { role } }) as unknown as User;
const tokenFor = (id: string, exp = Math.floor(Date.now() / 1000) + 3600) =>
  `header.${btoa(JSON.stringify({ sub: id, exp })).replace(/=/g, '')}.signature`;
const session = (user: User, token = 'same-token', expiresAt = Math.floor(Date.now() / 1000) + 3600) => ({
  user,
  access_token: token,
  expires_at: expiresAt,
}) as Session;
const verified = (user: User) => ({ data: { user }, error: null });

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let mounts = 0;
let unmounts = 0;

function Scene() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    mounts++;
    return () => { unmounts++; };
  }, []);
  return <div data-testid="scene" style={{ height: 200 }}>
    <input aria-label="Rascunho" defaultValue="" />
    <button onClick={() => setCount(n => n + 1)}>Contar</button>
    <output data-testid="count">{count}</output>
  </div>;
}

function RouteLikeGate() {
  const { user, session: activeSession, loading, authError, retryAuth } = useAuth();
  const { isAdmin } = useIsAdmin();
  return <>
    <output data-testid="auth">{authError ? 'retry' : loading ? 'loading' : user?.id ?? 'guest'}</output>
    <output data-testid="admin">{isAdmin ? 'admin' : 'denied'}</output>
    <output data-testid="expiry">{activeSession?.expires_at ?? 'none'}</output>
    <button data-testid="retry" onClick={retryAuth}>Retry</button>
    {loading || authError || !user ? null : <Scene />}
  </>;
}

async function mount() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(<AuthProvider><RouteLikeGate /></AuthProvider>));
}

async function settle() {
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
}

async function event(name: string, next: Session | null) {
  await act(async () => auth.listeners[0](name, next));
}

function read(testId: string) {
  return host!.querySelector(`[data-testid="${testId}"]`)!.textContent;
}

beforeEach(() => {
  auth.getSession.mockReset();
  auth.getUser.mockReset();
  auth.signOut.mockReset();
  auth.listeners.length = 0;
  mounts = 0;
  unmounts = 0;
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.useRealTimers();
});

describe('auth focus stability', () => {
  it('does not mount a stored admin claim before the initial token is confirmed', async () => {
    const confirmation = deferred<ReturnType<typeof verified>>();
    const token = tokenFor('hero');
    auth.getSession.mockResolvedValue({ data: { session: session(member('hero', 'admin'), token) }, error: null });
    auth.getUser.mockReturnValue(confirmation.promise);
    await mount();
    expect(read('auth')).toBe('loading');
    expect(read('admin')).toBe('denied');
    expect(host!.querySelector('[data-testid="scene"]')).toBeNull();
    expect(auth.getUser).toHaveBeenCalledWith(token);
    confirmation.resolve(verified(member('hero')));
    await settle();
    expect(read('auth')).toBe('hero');
    expect(read('admin')).toBe('denied');
  });

  it('keeps mounted scene, local form and scroll through a repeated confirmed SIGNED_IN', async () => {
    const current = member('hero');
    const token = tokenFor('hero');
    const focus = deferred<ReturnType<typeof verified>>();
    auth.getSession.mockResolvedValue({ data: { session: session(current, token) }, error: null });
    auth.getUser.mockResolvedValueOnce(verified(current)).mockReturnValueOnce(focus.promise);
    await mount();
    await settle();
    const scene = host!.querySelector('[data-testid="scene"]')! as HTMLDivElement;
    const confirmedExpiry = read('expiry');
    await act(async () => {
      scene.querySelector('button')!.click();
      scene.querySelector('input')!.value = 'rascunho local';
      scene.scrollTop = 31;
    });

    await event('SIGNED_IN', session(member('hero', 'admin'), token, 1));
    expect(auth.getUser).toHaveBeenLastCalledWith(token);
    expect(read('auth')).toBe('hero');
    expect(read('admin')).toBe('denied');
    expect(read('expiry')).toBe(confirmedExpiry);
    expect(host!.querySelector('[data-testid="scene"]')).toBe(scene);
    expect(read('count')).toBe('1');
    expect(scene.querySelector('input')!.value).toBe('rascunho local');
    expect(scene.scrollTop).toBe(31);
    expect(mounts).toBe(1);
    expect(unmounts).toBe(0);

    focus.resolve(verified(member('hero')));
    await settle();
    expect(host!.querySelector('[data-testid="scene"]')).toBe(scene);
    expect(read('expiry')).toBe(confirmedExpiry);
    expect(unmounts).toBe(0);
  });

  it('coalesces repeated focus events while verification is pending without discarding its result', async () => {
    const current = member('hero');
    const token = tokenFor('hero');
    const focus = deferred<ReturnType<typeof verified>>();
    auth.getSession.mockResolvedValue({ data: { session: session(current, token) }, error: null });
    auth.getUser.mockResolvedValueOnce(verified(current)).mockReturnValueOnce(focus.promise);
    await mount();
    await settle();
    const scene = host!.querySelector('[data-testid="scene"]');
    await event('SIGNED_IN', session(member('hero', 'admin'), token));
    await event('SIGNED_IN', session(member('hero', 'admin'), token));
    expect(auth.getUser).toHaveBeenCalledTimes(2);
    expect(host!.querySelector('[data-testid="scene"]')).toBe(scene);
    focus.resolve(verified(current));
    await settle();
    expect(read('auth')).toBe('hero');
    expect(host!.querySelector('[data-testid="scene"]')).toBe(scene);
    expect(unmounts).toBe(0);
  });

  it('does not let duplicate focus events restart the 15-second deadline', async () => {
    vi.useFakeTimers();
    const current = member('hero');
    const token = tokenFor('hero');
    auth.getSession.mockResolvedValue({ data: { session: session(current, token) }, error: null });
    auth.getUser.mockResolvedValueOnce(verified(current)).mockReturnValue(new Promise(() => {}));
    await mount();
    expect(read('auth')).toBe('hero');
    await event('SIGNED_IN', session(current, token));
    await act(async () => vi.advanceTimersByTime(10_000));
    await event('SIGNED_IN', session(current, token));
    expect(auth.getUser).toHaveBeenCalledTimes(2);
    await act(async () => vi.advanceTimersByTime(5_000));
    expect(read('auth')).toBe('retry');
    expect(read('admin')).toBe('denied');
    expect(host!.querySelector('[data-testid="scene"]')).toBeNull();
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it('cuts off a pending focus check when the previously confirmed JWT expires', async () => {
    vi.useFakeTimers();
    const current = member('hero');
    const token = tokenFor('hero', Math.floor(Date.now() / 1000) + 2);
    auth.getSession.mockResolvedValue({ data: { session: session(current, token) }, error: null });
    auth.getUser.mockResolvedValueOnce(verified(current)).mockReturnValue(new Promise(() => {}));
    await mount();
    await event('SIGNED_IN', session(current, token, Math.floor(Date.now() / 1000) + 3600));
    expect(read('auth')).toBe('hero');
    await act(async () => vi.advanceTimersByTime(2_000));
    expect(read('auth')).toBe('retry');
    expect(host!.querySelector('[data-testid="scene"]')).toBeNull();
  });

  it('uses expiry in the confirmed token and blocks an expired token despite event metadata', async () => {
    vi.useFakeTimers();
    const current = member('hero');
    const token = tokenFor('hero', Math.floor(Date.now() / 1000) + 2);
    const focus = deferred<ReturnType<typeof verified>>();
    auth.getSession.mockResolvedValue({ data: { session: session(current, token) }, error: null });
    auth.getUser.mockResolvedValueOnce(verified(current)).mockReturnValueOnce(focus.promise);
    await mount();
    expect(read('auth')).toBe('hero');
    await act(async () => vi.advanceTimersByTime(3_000));
    await event('SIGNED_IN', session(current, token, Math.floor(Date.now() / 1000) + 3600));
    expect(read('auth')).toBe('loading');
    expect(host!.querySelector('[data-testid="scene"]')).toBeNull();
    focus.resolve(verified(current));
    await act(async () => { await Promise.resolve(); });
    expect(read('auth')).toBe('retry');
  });

  it('blocks continuity when the confirmed token has no readable expiry', async () => {
    const current = member('hero');
    const focus = deferred<ReturnType<typeof verified>>();
    auth.getSession.mockResolvedValue({ data: { session: session(current, 'opaque-token') }, error: null });
    auth.getUser.mockResolvedValueOnce(verified(current)).mockReturnValueOnce(focus.promise);
    await mount();
    await settle();
    expect(read('auth')).toBe('hero');
    await event('SIGNED_IN', session(current, 'opaque-token'));
    expect(read('auth')).toBe('loading');
    expect(host!.querySelector('[data-testid="scene"]')).toBeNull();
    focus.resolve(verified(current));
    await settle();
    expect(read('auth')).toBe('hero');
  });

  it('blocks a changed refresh token and replaces forged admin metadata after confirmation', async () => {
    const current = member('hero');
    const firstToken = tokenFor('hero');
    const nextToken = tokenFor('hero', Math.floor(Date.now() / 1000) + 7200);
    const refresh = deferred<ReturnType<typeof verified>>();
    auth.getSession.mockResolvedValue({ data: { session: session(current, firstToken) }, error: null });
    auth.getUser.mockResolvedValueOnce(verified(current)).mockReturnValueOnce(refresh.promise);
    await mount();
    await settle();
    await event('TOKEN_REFRESHED', session(member('hero', 'admin'), nextToken));
    expect(read('auth')).toBe('loading');
    expect(read('admin')).toBe('denied');
    expect(host!.querySelector('[data-testid="scene"]')).toBeNull();
    expect(auth.getUser).toHaveBeenLastCalledWith(nextToken);
    refresh.resolve(verified(current));
    await settle();
    expect(read('auth')).toBe('hero');
    expect(read('admin')).toBe('denied');
  });

  it('does not let an old focus response replace a newer token', async () => {
    const current = member('hero');
    const firstToken = tokenFor('hero');
    const nextToken = tokenFor('hero', Math.floor(Date.now() / 1000) + 7200);
    const focus = deferred<ReturnType<typeof verified>>();
    const refresh = deferred<ReturnType<typeof verified>>();
    auth.getSession.mockResolvedValue({ data: { session: session(current, firstToken) }, error: null });
    auth.getUser.mockResolvedValueOnce(verified(current)).mockReturnValueOnce(focus.promise).mockReturnValueOnce(refresh.promise);
    await mount();
    await settle();
    await event('SIGNED_IN', session(current, firstToken));
    await event('TOKEN_REFRESHED', session(current, nextToken));
    focus.resolve(verified(current));
    await settle();
    expect(read('auth')).toBe('loading');
    refresh.resolve(verified(current));
    await settle();
    expect(read('auth')).toBe('hero');
    expect(auth.getUser).toHaveBeenLastCalledWith(nextToken);
  });

  it('fails closed after a focused revalidation error and does not sign out', async () => {
    const current = member('hero');
    const token = tokenFor('hero');
    const focus = deferred<ReturnType<typeof verified>>();
    auth.getSession.mockResolvedValue({ data: { session: session(current, token) }, error: null });
    auth.getUser.mockResolvedValueOnce(verified(current)).mockReturnValueOnce(focus.promise);
    await mount();
    await settle();
    await event('SIGNED_IN', session(current, token));
    expect(read('auth')).toBe('hero');
    focus.reject(new Error('Auth unavailable'));
    await settle();
    expect(read('auth')).toBe('retry');
    expect(host!.querySelector('[data-testid="scene"]')).toBeNull();
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it('gives sign-out precedence over a pending same-token confirmation', async () => {
    const current = member('hero');
    const token = tokenFor('hero');
    const focus = deferred<ReturnType<typeof verified>>();
    auth.getSession.mockResolvedValue({ data: { session: session(current, token) }, error: null });
    auth.getUser.mockResolvedValueOnce(verified(current)).mockReturnValueOnce(focus.promise);
    await mount();
    await settle();
    await event('SIGNED_IN', session(current, token));
    await event('SIGNED_OUT', null);
    focus.resolve(verified(current));
    await settle();
    expect(read('auth')).toBe('guest');
    expect(host!.querySelector('[data-testid="scene"]')).toBeNull();
  });

  it('blocks a changed claimed identity even if the token bytes match', async () => {
    const current = member('hero');
    const token = tokenFor('hero');
    const changed = deferred<ReturnType<typeof verified>>();
    auth.getSession.mockResolvedValue({ data: { session: session(current, token) }, error: null });
    auth.getUser.mockResolvedValueOnce(verified(current)).mockReturnValueOnce(changed.promise);
    await mount();
    await settle();
    await event('SIGNED_IN', session(member('other', 'admin'), token));
    expect(read('auth')).toBe('loading');
    changed.resolve(verified(current));
    await settle();
    expect(read('auth')).toBe('retry');
    expect(read('admin')).toBe('denied');
  });

  it('clears a confirmed identity during explicit retry', async () => {
    const current = member('hero');
    const token = tokenFor('hero');
    auth.getSession.mockResolvedValueOnce({ data: { session: session(current, token) }, error: null })
      .mockReturnValueOnce(new Promise(() => {}));
    auth.getUser.mockResolvedValue(verified(current));
    await mount();
    await settle();
    await act(async () => host!.querySelector('[data-testid="retry"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(read('auth')).toBe('loading');
    expect(host!.querySelector('[data-testid="scene"]')).toBeNull();
  });

  it('does not restore a pending focus response after retry starts a fresh read', async () => {
    const current = member('hero');
    const token = tokenFor('hero');
    const focus = deferred<ReturnType<typeof verified>>();
    auth.getSession.mockResolvedValueOnce({ data: { session: session(current, token) }, error: null })
      .mockResolvedValueOnce({ data: { session: null }, error: null });
    auth.getUser.mockResolvedValueOnce(verified(current)).mockReturnValueOnce(focus.promise);
    await mount();
    await settle();
    await event('SIGNED_IN', session(current, token));
    await act(async () => host!.querySelector('[data-testid="retry"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    focus.resolve(verified(current));
    await settle();
    expect(read('auth')).toBe('guest');
    expect(host!.querySelector('[data-testid="scene"]')).toBeNull();
  });
});
