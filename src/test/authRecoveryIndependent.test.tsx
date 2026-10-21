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
  const { user, loading, authError } = useAuth();
  const { isAdmin } = useIsAdmin();
  return <output data-testid="state">
    {`${loading ? 'loading' : authError ? 'retry' : user?.id ?? 'guest'}:${isAdmin ? 'admin' : 'denied'}`}
  </output>;
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

  it('does not grant admin from a storage recovery SIGNED_IN before user confirmation', async () => {
    // Auth-js can emit SIGNED_IN from a valid non-expiring session in storage.
    auth.getSession.mockReturnValue(new Promise(() => {}));
    // A safe implementation may start explicit-token confirmation outside the
    // callback; keep that request pending so only premature UI exposure fails.
    auth.getUser.mockReturnValue(new Promise(() => {}));
    await mount();
    expect(state()).toBe('loading:denied');
    await act(async () => auth.listeners[0]('SIGNED_IN', stored(member('cached', 'admin'))));
    expect(state()).toBe('loading:denied');
  });
});
