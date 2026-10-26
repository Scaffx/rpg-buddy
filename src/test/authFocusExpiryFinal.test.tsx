import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Session, User } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '@/hooks/useAuth';

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUser: vi.fn(),
  unsubscribe: vi.fn(),
  listener: null as ((event: string, session: Session | null) => void) | null,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: auth.getSession,
      getUser: auth.getUser,
      onAuthStateChange: (listener: (event: string, session: Session | null) => void) => {
        auth.listener = listener;
        return { data: { subscription: { unsubscribe: auth.unsubscribe } } };
      },
    },
  },
}));
vi.mock('@/lib/nativeAuth', () => ({ initDeepLinkAuth: vi.fn() }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const person = (id: string, role = 'user') => ({ id, app_metadata: { role } }) as unknown as User;
const jwt = (id: string, seconds: number) =>
  `header.${btoa(JSON.stringify({ sub: id, exp: Math.floor(Date.now() / 1000) + seconds })).replace(/=/g, '')}.sig`;
const candidate = (token: string, id: string, role = 'user', claimedExpiry?: number) => ({
  access_token: token,
  user: person(id, role),
  expires_at: claimedExpiry ?? Math.floor(Date.now() / 1000) + 3600,
}) as Session;
const verified = (id: string) => ({ data: { user: person(id) }, error: null });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}

function Scene() {
  const [visits, setVisits] = useState(0);
  return <section data-testid="scene">
    <input aria-label="Draft" />
    <button onClick={() => setVisits(count => count + 1)}>Change</button>
    <output data-testid="visits">{visits}</output>
  </section>;
}

function Gate() {
  const { user, loading, authError, retryAuth, session } = useAuth();
  return <>
    <output data-testid="state">{authError ? 'retry' : loading ? 'loading' : user?.id ?? 'guest'}</output>
    <output data-testid="token">{session?.access_token ?? 'none'}</output>
    <button data-testid="retry" onClick={retryAuth}>Retry</button>
    {!loading && !authError && user ? <Scene /> : null}
  </>;
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function mount(initial: Session) {
  auth.getSession.mockResolvedValue({ data: { session: initial }, error: null });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(<AuthProvider><Gate /></AuthProvider>));
}

async function event(name: string, next: Session | null) {
  await act(async () => auth.listener!(name, next));
}

async function advance(milliseconds: number) {
  await act(async () => vi.advanceTimersByTime(milliseconds));
}

function state() {
  return host!.querySelector('[data-testid="state"]')!.textContent;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-26T18:00:00.000Z'));
  auth.getSession.mockReset();
  auth.getUser.mockReset();
  auth.unsubscribe.mockReset();
  auth.listener = null;
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.useRealTimers();
});

describe('final auth focus expiry review', () => {
  it('preserves the scene during exact-token focus and expires after the completed reconfirmation without another event', async () => {
    const token = jwt('hero', 5);
    const focus = deferred<ReturnType<typeof verified>>();
    auth.getUser.mockResolvedValueOnce(verified('hero')).mockReturnValueOnce(focus.promise);
    await mount(candidate(token, 'hero'));
    const scene = host!.querySelector('[data-testid="scene"]')!;
    await act(async () => scene.querySelector('button')!.click());
    scene.querySelector('input')!.value = 'draft survives';

    await event('SIGNED_IN', candidate(token, 'hero', 'admin', Math.floor(Date.now() / 1000) + 900));
    await advance(2_000);
    await event('SIGNED_IN', candidate(token, 'hero', 'admin'));
    expect(auth.getUser).toHaveBeenCalledTimes(2);
    expect(host!.querySelector('[data-testid="scene"]')).toBe(scene);
    expect(scene.querySelector('input')!.value).toBe('draft survives');
    expect(scene.querySelector('[data-testid="visits"]')!.textContent).toBe('1');

    focus.resolve(verified('hero'));
    await act(async () => { await Promise.resolve(); });
    expect(state()).toBe('hero');
    expect(host!.querySelector('[data-testid="scene"]')).toBe(scene);
    await advance(2_999);
    expect(state()).toBe('hero');
    await advance(1);
    expect(state()).toBe('retry');
    expect(host!.querySelector('[data-testid="scene"]')).toBeNull();
  });

  it('replaces the old expiry with a new confirmed token and ignores the old focus reply', async () => {
    const oldToken = jwt('hero', 2);
    const newToken = jwt('hero', 6);
    const oldFocus = deferred<ReturnType<typeof verified>>();
    const newVerification = deferred<ReturnType<typeof verified>>();
    auth.getUser.mockResolvedValueOnce(verified('hero'))
      .mockReturnValueOnce(oldFocus.promise)
      .mockReturnValueOnce(newVerification.promise);
    await mount(candidate(oldToken, 'hero'));
    await event('SIGNED_IN', candidate(oldToken, 'hero'));
    await event('TOKEN_REFRESHED', candidate(newToken, 'hero', 'admin'));
    expect(state()).toBe('loading');
    oldFocus.resolve(verified('hero'));
    await act(async () => { await Promise.resolve(); });
    expect(state()).toBe('loading');
    newVerification.resolve(verified('hero'));
    await act(async () => { await Promise.resolve(); });
    expect(state()).toBe('hero');
    expect(host!.querySelector('[data-testid="token"]')!.textContent).toBe(newToken);

    await advance(2_000);
    expect(state()).toBe('hero');
    await advance(3_999);
    expect(state()).toBe('hero');
    await advance(1);
    expect(state()).toBe('retry');
  });

  it('lets logout and retry revoke access and cancels the old expiry timer on unmount', async () => {
    const token = jwt('hero', 2);
    auth.getUser.mockResolvedValue(verified('hero'));
    await mount(candidate(token, 'hero'));
    await event('SIGNED_OUT', null);
    await advance(2_000);
    expect(state()).toBe('guest');

    await event('SIGNED_IN', candidate(jwt('hero', 4), 'hero'));
    expect(state()).toBe('hero');
    auth.getSession.mockReturnValueOnce(new Promise(() => {}));
    await act(async () => host!.querySelector<HTMLButtonElement>('[data-testid="retry"]')!.click());
    expect(state()).toBe('loading');
    expect(host!.querySelector('[data-testid="scene"]')).toBeNull();
    act(() => root!.unmount());
    root = null;
    expect(auth.unsubscribe).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
    await advance(20_000);
  });
});
