import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Session, User } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { useIsAdmin } from '@/hooks/useIsAdmin';

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUser: vi.fn(),
  listeners: [] as Array<(event: string, session: Session | null) => void>,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: auth.getSession,
      getUser: auth.getUser,
      onAuthStateChange: (listener: (event: string, session: Session | null) => void) => {
        auth.listeners.push(listener);
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    },
  },
}));
vi.mock('@/lib/nativeAuth', () => ({ initDeepLinkAuth: vi.fn() }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const member = (id: string, role = 'user') => ({
  id,
  app_metadata: { role },
  user_metadata: {},
}) as unknown as User;
const stored = (user: User) => ({ user, access_token: 'local-test-token' }) as Session;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function Probe() {
  const { user, loading, authError, retryAuth } = useAuth();
  const { isAdmin } = useIsAdmin();
  return <>
    <output data-testid="state">
      {`${loading ? 'loading' : authError ? 'retry' : user?.id ?? 'guest'}:${isAdmin ? 'admin' : 'denied'}`}
    </output>
    <button onClick={retryAuth}>Retry</button>
  </>;
}

async function mount() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(<AuthProvider><Probe /></AuthProvider>));
}

function state() {
  return host!.querySelector('[data-testid="state"]')!.textContent;
}

beforeEach(() => {
  auth.getSession.mockReset();
  auth.getUser.mockReset();
  auth.listeners.length = 0;
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.useRealTimers();
});

describe('independent auth recovery review', () => {
  it('does not trust a user-id mismatch from getUser', async () => {
    auth.getSession.mockResolvedValue({ data: { session: stored(member('cached', 'admin')) }, error: null });
    auth.getUser.mockResolvedValue({ data: { user: member('different', 'admin') }, error: null });
    await mount();
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(state()).toBe('retry:denied');
    expect(auth.getUser).toHaveBeenCalledWith('local-test-token');
  });

  it('waits for Auth and replaces cached admin metadata with the confirmed user', async () => {
    // Auth-js can emit SIGNED_IN from a valid non-expiring session in storage.
    auth.getSession.mockReturnValue(new Promise(() => {}));
    let confirm!: (value: { data: { user: User }; error: null }) => void;
    const pendingConfirmation = new Promise<{ data: { user: User }; error: null }>(resolve => {
      confirm = resolve;
    });
    auth.getUser.mockReturnValue(pendingConfirmation);
    await mount();
    expect(state()).toBe('loading:denied');
    await act(async () => {
      auth.listeners[0]('SIGNED_IN', stored(member('cached', 'admin')));
      expect(auth.getUser).not.toHaveBeenCalled(); // listener itself stays synchronous
    });
    expect(state()).toBe('loading:denied');
    expect(auth.getUser).toHaveBeenCalledWith('local-test-token');
    confirm({ data: { user: member('cached', 'user') }, error: null });
    await act(async () => { await pendingConfirmation; });
    expect(state()).toBe('cached:denied');
  });

  it('does not restore an old bootstrap after timeout and retry', async () => {
    vi.useFakeTimers();
    let resolveOld!: (value: { data: { session: Session }; error: null }) => void;
    const oldBootstrap = new Promise<{ data: { session: Session }; error: null }>(resolve => {
      resolveOld = resolve;
    });
    auth.getSession.mockReturnValueOnce(oldBootstrap)
      .mockResolvedValueOnce({ data: { session: null }, error: null });
    await mount();
    expect(state()).toBe('loading:denied');
    await act(async () => vi.advanceTimersByTime(15_000));
    expect(state()).toBe('retry:denied');
    await act(async () => host!.querySelector('button')!.click());
    expect(state()).toBe('guest:denied');
    resolveOld({ data: { session: stored(member('old', 'admin')) }, error: null });
    await act(async () => { await oldBootstrap; });
    expect(state()).toBe('guest:denied');
    expect(auth.getUser).not.toHaveBeenCalled();
  });
});
