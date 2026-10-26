import { act, useEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Session, User } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { AuthContinuityBoundary } from '@/components/auth/AuthContinuityBoundary';
import { authDataGate } from '@/lib/authDataGate';
import i18n from '@/i18n';

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUser: vi.fn(),
  listener: null as ((event: string, session: Session | null) => void) | null,
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: {
    getSession: auth.getSession,
    getUser: auth.getUser,
    onAuthStateChange: (listener: (event: string, session: Session | null) => void) => {
      auth.listener = listener;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    },
  } },
}));
vi.mock('@/lib/nativeAuth', () => ({ initDeepLinkAuth: vi.fn() }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const member = (id: string) => ({ id, app_metadata: { role: 'user' } }) as unknown as User;
const token = (id: string, seconds: number, sessionId = 'session-a') =>
  'header.' + btoa(JSON.stringify({
    sub: id, iss: 'https://project.example.test/auth/v1', session_id: sessionId,
    exp: Math.floor(Date.now() / 1000) + seconds,
  })) + '.signature';
const session = (id: string, jwt: string) => ({
  user: member(id), access_token: jwt, expires_at: Math.floor(Date.now() / 1000) + 3600,
}) as Session;
const verified = (id: string) => ({ data: { user: member(id) }, error: null });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

let host: HTMLDivElement;
let root: Root;
let unmounts: number;
let nativeFetch: typeof fetch;
let publicState: { user: string | null; token: string | null; loading: boolean; error: boolean };
function Scene() {
  const [count, setCount] = useState(0);
  useEffect(() => () => { unmounts++; }, []);
  return <section data-testid="scene">
    <input aria-label="Rascunho" />
    <button onClick={() => setCount(n => n + 1)}>Contar</button>
    <output data-testid="count">{count}</output>
  </section>;
}
function Guard() {
  const { user, loading, authError } = useAuth();
  if (authError) return <p data-testid="recovery">Recuperar</p>;
  if (loading) return <p data-testid="loading">Carregando</p>;
  return user ? <Scene /> : <p data-testid="guest">Visitante</p>;
}
function StateProbe() {
  const { user, session: current, loading, authError } = useAuth();
  publicState = { user: user?.id ?? null, token: current?.access_token ?? null, loading, error: authError };
  return null;
}
async function mount(initial: Session) {
  auth.getSession.mockResolvedValue({ data: { session: initial }, error: null });
  auth.getUser.mockResolvedValueOnce(verified(initial.user.id));
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<AuthProvider><StateProbe /><AuthContinuityBoundary><Guard /></AuthContinuityBoundary></AuthProvider>));
}
async function event(name: string, next: Session | null) {
  await act(async () => auth.listener!(name, next));
}
async function advance(ms: number) {
  await act(async () => vi.advanceTimersByTime(ms));
}
async function flush() {
  await act(async () => { await Promise.resolve(); });
}
beforeEach(() => {
  nativeFetch = globalThis.fetch;
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-26T18:00:00.000Z'));
  auth.getSession.mockReset();
  auth.getUser.mockReset();
  auth.listener = null;
  unmounts = 0;
  publicState = { user: null, token: null, loading: true, error: false };
  authDataGate.clear();
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  host?.remove();
  globalThis.fetch = nativeFetch;
  vi.useRealTimers();
});

describe('AuthProvider + stable route boundary', () => {
  it('keeps visible state during a normal refresh and retains hidden state across old exp', async () => {
    const old = token('hero', 2);
    const next = token('hero', 90);
    const pending = deferred<ReturnType<typeof verified>>();
    await mount(session('hero', old));
    auth.getUser.mockReturnValueOnce(pending.promise);
    const scene = host.querySelector<HTMLElement>('[data-testid="scene"]')!;
    const input = scene.querySelector('input')!;
    input.value = 'rascunho';
    input.focus();
    scene.scrollTop = 37;
    await act(async () => scene.querySelector('button')!.click());
    await event('TOKEN_REFRESHED', session('hero', next));
    expect(publicState).toMatchObject({ user: 'hero', token: old, error: false });
    expect(host.querySelector('[data-testid="scene"]')).toBe(scene);
    const network = vi.fn().mockResolvedValue(new Response('{}'));
    globalThis.fetch = network;
    const blocked = authDataGate.fetch('https://project.example.test/rest/v1/profile', {
      headers: { authorization: 'Bearer ' + next },
    });
    await Promise.resolve();
    expect(network).not.toHaveBeenCalled();
    await advance(2000);
    expect(publicState).toMatchObject({ user: null, token: null, loading: true, error: false });
    expect(host.querySelector('[role="status"]')?.textContent).toBe(i18n.t('app.confirming_session'));
    expect(host.querySelector('[data-auth-retained]')?.hasAttribute('inert')).toBe(true);
    expect(authDataGate.approvedToken()).toBeNull();
    expect(network).not.toHaveBeenCalled();
    expect(unmounts).toBe(0);
    pending.resolve(verified('hero'));
    await flush();
    await blocked;
    expect(network).toHaveBeenCalledTimes(1);
    expect(publicState).toMatchObject({ user: 'hero', token: next, loading: false });
    expect(host.querySelector('[data-testid="scene"]')).toBe(scene);
    expect(input.value).toBe('rascunho');
    expect(scene.scrollTop).toBe(37);
    expect(host.querySelector('[data-testid="count"]')?.textContent).toBe('1');
    expect(document.activeElement).toBe(input);
    expect(unmounts).toBe(0);
  });

  it('waits for a same-session event after an expired tab wakes, then restores the scene', async () => {
    const old = token('hero', 2);
    await mount(session('hero', old));
    const scene = host.querySelector('[data-testid="scene"]');
    await advance(2000);
    expect(publicState.user).toBeNull();
    const next = token('hero', 90);
    auth.getUser.mockResolvedValueOnce(verified('hero'));
    await event('TOKEN_REFRESHED', session('hero', next));
    await flush();
    expect(publicState.token).toBe(next);
    expect(host.querySelector('[data-testid="scene"]')).toBe(scene);
  });

  it('ignores a stale SIGNED_IN for the expired token while waiting for refresh', async () => {
    const old = token('hero', 2);
    await mount(session('hero', old));
    const scene = host.querySelector('[data-testid="scene"]');
    await advance(2000);
    await event('SIGNED_IN', session('hero', old));
    expect(auth.getUser).toHaveBeenCalledTimes(1);
    expect(publicState).toMatchObject({ user: null, token: null, loading: true, error: false });
    const next = token('hero', 90);
    auth.getUser.mockResolvedValueOnce(verified('hero'));
    await event('TOKEN_REFRESHED', session('hero', next));
    await flush();
    expect(publicState.token).toBe(next);
    expect(host.querySelector('[data-testid="scene"]')).toBe(scene);
  });

  it('retains the scene for a renewed SIGNED_IN token with the same verified binding', async () => {
    await mount(session('hero', token('hero', 2)));
    const scene = host.querySelector('[data-testid="scene"]');
    await advance(2000);
    const next = token('hero', 90);
    auth.getUser.mockResolvedValueOnce(verified('hero'));
    await event('SIGNED_IN', session('hero', next));
    await flush();
    expect(publicState.token).toBe(next);
    expect(host.querySelector('[data-testid="scene"]')).toBe(scene);
    expect(unmounts).toBe(0);
  });

  it('discards hidden content after timeout without a new event', async () => {
    await mount(session('hero', token('hero', 2)));
    await advance(2000);
    expect(unmounts).toBe(0);
    await advance(15_000);
    expect(publicState).toMatchObject({ user: null, token: null, loading: false, error: true });
    expect(host.querySelector('[data-testid="scene"]')).toBeNull();
    expect(unmounts).toBe(1);
  });

  it('does not restart the hidden deadline for duplicate expired-session events', async () => {
    const old = token('hero', 2);
    await mount(session('hero', old));
    await advance(2000);
    await advance(10_000);
    await event('SIGNED_IN', session('hero', old));
    expect(publicState.error).toBe(false);
    await advance(5000);
    expect(publicState).toMatchObject({ user: null, error: true, loading: false });
  });

  it('discards after a remote confirmation failure', async () => {
    await mount(session('hero', token('hero', 2)));
    const pending = deferred<ReturnType<typeof verified>>();
    auth.getUser.mockReturnValueOnce(pending.promise);
    await event('TOKEN_REFRESHED', session('hero', token('hero', 90)));
    await advance(2000);
    pending.reject(new Error('Auth unavailable'));
    await flush();
    expect(publicState).toMatchObject({ user: null, error: true, loading: false });
    expect(host.querySelector('[data-testid="scene"]')).toBeNull();
    expect(unmounts).toBe(1);
  });

  it('discards on logout and ignores its late response', async () => {
    await mount(session('hero', token('hero', 2)));
    const pending = deferred<ReturnType<typeof verified>>();
    auth.getUser.mockReturnValueOnce(pending.promise);
    await event('TOKEN_REFRESHED', session('hero', token('hero', 90)));
    await advance(2000);
    await event('SIGNED_OUT', null);
    pending.resolve(verified('hero'));
    await flush();
    expect(publicState.user).toBeNull();
    expect(host.querySelector('[data-testid="scene"]')).toBeNull();
    expect(unmounts).toBe(1);
  });

  it('never transfers a retained scene to a new UID', async () => {
    await mount(session('hero', token('hero', 2)));
    const scene = host.querySelector('[data-testid="scene"]');
    await advance(2000);
    auth.getUser.mockResolvedValueOnce(verified('other'));
    await event('SIGNED_IN', session('other', token('other', 90, 'session-b')));
    await flush();
    expect(publicState.user).toBe('other');
    expect(host.querySelector('[data-testid="scene"]')).not.toBe(scene);
    expect(unmounts).toBe(1);
  });
});
