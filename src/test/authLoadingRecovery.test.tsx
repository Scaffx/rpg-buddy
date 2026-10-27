import { StrictMode } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Session, User } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { authJwt } from '@/test/authSessionFixtures';

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUser: vi.fn(),
  signOut: vi.fn(),
  unsubscribe: vi.fn(),
  listeners: [] as Array<(event: string, session: Session | null) => void>,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: auth.getSession,
      getUser: auth.getUser,
      signOut: auth.signOut,
      onAuthStateChange: (callback: (event: string, session: Session | null) => void) => {
        auth.listeners.push(callback);
        return { data: { subscription: { unsubscribe: auth.unsubscribe } } };
      },
    },
  },
}));
vi.mock('@/lib/nativeAuth', () => ({ initDeepLinkAuth: vi.fn() }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const user = (id: string, appRole = 'user', metadataRole?: string) => ({
  id,
  app_metadata: { role: appRole },
  user_metadata: metadataRole ? { role: metadataRole } : {},
}) as unknown as User;
const session = (member: User, token = authJwt(member.id)) => ({ user: member, access_token: token }) as Session;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function Probe() {
  const { user: member, loading, authError, retryAuth } = useAuth();
  const { isAdmin } = useIsAdmin();
  return (
    <div>
      <output data-testid="auth">{loading ? 'loading' : authError ? 'retry' : member?.id ?? 'guest'}</output>
      <output data-testid="admin">{isAdmin ? 'admin' : 'denied'}</output>
      <button onClick={retryAuth}>Tentar novamente</button>
    </div>
  );
}

function read(testId: string) {
  return container!.querySelector(`[data-testid="${testId}"]`)!.textContent;
}

async function settle() {
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
}

async function mount(strict = false) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root!.render(strict
    ? <StrictMode><AuthProvider><Probe /></AuthProvider></StrictMode>
    : <AuthProvider><Probe /></AuthProvider>));
}

beforeEach(() => {
  auth.getSession.mockReset();
  auth.getUser.mockReset();
  auth.signOut.mockReset();
  auth.unsubscribe.mockReset();
  auth.listeners.length = 0;
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.useRealTimers();
});

describe('auth loading recovery', () => {
  it('ends loading on getSession rejection and retries without signing out', async () => {
    const confirmed = user('confirmed', 'admin');
    auth.getSession.mockRejectedValueOnce(new Error('Lock broken by steal'));
    auth.getSession.mockResolvedValueOnce({ data: { session: session(confirmed) }, error: null });
    auth.getUser.mockResolvedValue({ data: { user: confirmed }, error: null });
    await mount();
    await settle();
    expect(read('auth')).toBe('retry');
    expect(read('admin')).toBe('denied');
    expect(auth.signOut).not.toHaveBeenCalled();

    await act(async () => container!.querySelector('button')!.click());
    await settle();
    expect(read('auth')).toBe('confirmed');
    expect(read('admin')).toBe('admin');
    expect(auth.getUser).toHaveBeenCalledOnce();
    expect(auth.getUser).toHaveBeenCalledWith(authJwt('confirmed'));
  });

  it('fails closed when getUser rejects, then confirms the stored session on retry', async () => {
    const confirmed = user('confirmed', 'user', 'admin');
    auth.getSession.mockResolvedValue({ data: { session: session(confirmed) }, error: null });
    auth.getUser.mockRejectedValueOnce(new Error('AbortError'));
    auth.getUser.mockResolvedValueOnce({ data: { user: confirmed }, error: null });
    await mount();
    await settle();
    expect(read('auth')).toBe('retry');
    expect(read('admin')).toBe('denied');

    await act(async () => container!.querySelector('button')!.click());
    await settle();
    expect(read('auth')).toBe('confirmed');
    expect(read('admin')).toBe('denied');
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it('verifies storage-recovery SIGNED_IN before showing admin and ignores stale initial data', async () => {
    const initial = deferred<{ data: { session: Session }; error: null }>();
    const verification = deferred<{ data: { user: User }; error: null }>();
    auth.getSession.mockReturnValue(initial.promise);
    auth.getUser.mockReturnValue(verification.promise);
    const oldSession = session(user('old', 'admin'));
    const newToken = authJwt('new');
    const newSession = session(user('new', 'admin'), newToken);
    await mount();
    await act(async () => {
      auth.listeners[0]('SIGNED_IN', newSession);
      auth.listeners[0]('INITIAL_SESSION', oldSession);
    });
    expect(read('auth')).toBe('loading');
    expect(read('admin')).toBe('denied');
    expect(auth.getUser).toHaveBeenCalledWith(newToken);
    initial.resolve({ data: { session: oldSession }, error: null });
    verification.resolve({ data: { user: user('new') }, error: null });
    await settle();
    expect(read('auth')).toBe('new');
    expect(read('admin')).toBe('denied');
    expect(auth.getUser).toHaveBeenCalledOnce();
  });

  it('lets a confirmed login finish while the initial session read is still pending', async () => {
    auth.getSession.mockReturnValue(new Promise(() => {}));
    auth.getUser.mockResolvedValue({ data: { user: user('logged-in', 'admin') }, error: null });
    await mount();
    const loginToken = authJwt('logged-in');
    await act(async () => auth.listeners[0]('SIGNED_IN', session(user('logged-in', 'admin'), loginToken)));
    await settle();
    expect(read('auth')).toBe('logged-in');
    expect(read('admin')).toBe('admin');
    expect(auth.getUser).toHaveBeenCalledWith(loginToken);
  });

  it('also verifies a non-null INITIAL_SESSION instead of trusting storage metadata', async () => {
    const verification = deferred<{ data: { user: User }; error: null }>();
    auth.getSession.mockReturnValue(new Promise(() => {}));
    auth.getUser.mockReturnValue(verification.promise);
    await mount();
    await act(async () => auth.listeners[0]('INITIAL_SESSION', session(user('stored', 'admin'))));
    expect(read('auth')).toBe('loading');
    expect(read('admin')).toBe('denied');
    verification.resolve({ data: { user: user('stored') }, error: null });
    await settle();
    expect(read('auth')).toBe('stored');
    expect(read('admin')).toBe('denied');
  });

  it('confirms TOKEN_REFRESHED metadata with Auth before changing admin', async () => {
    const verification = deferred<{ data: { user: User }; error: null }>();
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    auth.getUser.mockReturnValue(verification.promise);
    await mount();
    await settle();
    expect(read('auth')).toBe('guest');

    const refreshedToken = authJwt('member');
    await act(async () => auth.listeners[0]('TOKEN_REFRESHED', session(user('member', 'admin'), refreshedToken)));
    expect(read('auth')).toBe('loading');
    expect(read('admin')).toBe('denied');
    expect(auth.getUser).toHaveBeenCalledWith(refreshedToken);
    verification.resolve({ data: { user: user('member') }, error: null });
    await settle();
    expect(read('auth')).toBe('member');
    expect(read('admin')).toBe('denied');
  });

  it('lets the latest repeated focus event win older verification', async () => {
    const first = deferred<{ data: { user: User }; error: null }>();
    const second = deferred<{ data: { user: User }; error: null }>();
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    const firstToken = authJwt('one');
    const secondToken = authJwt('two');
    auth.getUser.mockImplementation((token: string) => token === firstToken ? first.promise : second.promise);
    await mount();
    await settle();
    await act(async () => auth.listeners[0]('SIGNED_IN', session(user('one', 'admin'), firstToken)));
    await act(async () => auth.listeners[0]('SIGNED_IN', session(user('two', 'admin'), secondToken)));
    first.resolve({ data: { user: user('one', 'admin') }, error: null });
    await settle();
    expect(read('auth')).toBe('loading');
    expect(read('admin')).toBe('denied');
    second.resolve({ data: { user: user('two') }, error: null });
    await settle();
    expect(read('auth')).toBe('two');
    expect(read('admin')).toBe('denied');
  });

  it('keeps a fresh logout over a late successful verification', async () => {
    const pendingUser = deferred<{ data: { user: User }; error: null }>();
    auth.getSession.mockResolvedValue({ data: { session: session(user('old', 'admin')) }, error: null });
    auth.getUser.mockReturnValue(pendingUser.promise);
    await mount();
    await settle();
    expect(read('auth')).toBe('loading');
    await act(async () => auth.listeners[0]('SIGNED_OUT', null));
    pendingUser.resolve({ data: { user: user('old', 'admin') }, error: null });
    await settle();
    expect(read('auth')).toBe('guest');
    expect(read('admin')).toBe('denied');
  });

  it('fails closed on rejected event verification and recovers with explicit retry', async () => {
    const confirmed = user('member');
    auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: null });
    auth.getSession.mockResolvedValueOnce({ data: { session: session(confirmed) }, error: null });
    auth.getUser.mockRejectedValueOnce(new Error('AbortError'));
    auth.getUser.mockResolvedValueOnce({ data: { user: confirmed }, error: null });
    await mount();
    await settle();
    await act(async () => auth.listeners[0]('SIGNED_IN', session(user('member', 'admin'))));
    await settle();
    expect(read('auth')).toBe('retry');
    expect(read('admin')).toBe('denied');
    await act(async () => container!.querySelector('button')!.click());
    await settle();
    expect(read('auth')).toBe('member');
    expect(read('admin')).toBe('denied');
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it('fails closed when event token resolves to a different user', async () => {
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    auth.getUser.mockResolvedValue({ data: { user: user('other', 'admin') }, error: null });
    await mount();
    await settle();
    await act(async () => auth.listeners[0]('SIGNED_IN', session(user('cached', 'admin'))));
    await settle();
    expect(read('auth')).toBe('retry');
    expect(read('admin')).toBe('denied');
  });

  it('times out a hanging event verification without restoring cached admin', async () => {
    vi.useFakeTimers();
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    auth.getUser.mockReturnValue(new Promise(() => {}));
    await mount();
    await act(async () => { await Promise.resolve(); });
    await act(async () => {
      auth.listeners[0]('TOKEN_REFRESHED', session(user('cached', 'admin')));
      await Promise.resolve();
    });
    expect(read('auth')).toBe('loading');
    expect(read('admin')).toBe('denied');
    await act(async () => vi.advanceTimersByTime(15_000));
    expect(read('auth')).toBe('retry');
    expect(read('admin')).toBe('denied');
  });

  it('offers retry if the initial auth request never settles', async () => {
    vi.useFakeTimers();
    auth.getSession.mockReturnValue(new Promise(() => {}));
    await mount();
    expect(read('auth')).toBe('loading');
    await act(async () => vi.advanceTimersByTime(15_000));
    expect(read('auth')).toBe('retry');
    expect(read('admin')).toBe('denied');
  });

  it('ignores late StrictMode initial responses after unmount', async () => {
    const requests = [deferred<never>(), deferred<never>()];
    auth.getSession.mockReturnValueOnce(requests[0].promise).mockReturnValueOnce(requests[1].promise);
    await mount(true);
    expect(auth.getSession).toHaveBeenCalledTimes(2);
    act(() => root!.unmount());
    root = null;
    requests[0].reject(new Error('AbortError'));
    requests[1].reject(new Error('AbortError'));
    await settle();
    expect(auth.unsubscribe).toHaveBeenCalledTimes(2);
    expect(auth.getUser).not.toHaveBeenCalled();
  });
});
