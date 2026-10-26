import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Session, User } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '@/hooks/useAuth';

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUser: vi.fn(),
  listener: null as ((event: string, session: Session | null) => void) | null,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: auth.getSession,
      getUser: auth.getUser,
      onAuthStateChange: (listener: (event: string, session: Session | null) => void) => {
        auth.listener = listener;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    },
  },
}));
vi.mock('@/lib/nativeAuth', () => ({ initDeepLinkAuth: vi.fn() }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const user = { id: 'hero' } as User;

function Scene() {
  const [clicks, setClicks] = useState(0);
  return <section data-testid="scene">
    <input aria-label="Draft" />
    <button onClick={() => setClicks(value => value + 1)}>Count</button>
    <output data-testid="clicks">{clicks}</output>
  </section>;
}

function Gate() {
  const { user: currentUser, loading, authError } = useAuth();
  return loading || authError || !currentUser ? <output data-testid="blocked">blocked</output> : <Scene />;
}

let root: Root | null;
let host: HTMLDivElement | null;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-26T18:00:00.000Z'));
  auth.getSession.mockReset();
  auth.getUser.mockReset();
  auth.listener = null;
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.useRealTimers();
});

describe('independent focus review', () => {
  it('removes access when the confirmed JWT expires after a completed focus check', async () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 2;
    const token = `header.${btoa(JSON.stringify({ sub: user.id, exp: expiresAt }))}.signature`;
    const stored = { access_token: token, user, expires_at: expiresAt } as Session;
    auth.getSession.mockResolvedValue({ data: { session: stored }, error: null });
    auth.getUser.mockResolvedValue({ data: { user }, error: null });

    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => root!.render(<AuthProvider><Gate /></AuthProvider>));
    const scene = host.querySelector('[data-testid="scene"]')!;
    await act(async () => scene.querySelector('button')!.click());
    scene.querySelector('input')!.value = 'unsaved draft';

    await act(async () => {
      auth.listener!('SIGNED_IN', { ...stored, user: { id: user.id } as User });
    });
    expect(auth.getUser).toHaveBeenCalledTimes(2);
    expect(host.querySelector('[data-testid="scene"]')).toBe(scene);
    expect(scene.querySelector('[data-testid="clicks"]')!.textContent).toBe('1');
    expect(scene.querySelector('input')!.value).toBe('unsaved draft');

    await act(async () => vi.advanceTimersByTime(2_001));
    expect(host.querySelector('[data-testid="scene"]')).toBeNull();
    expect(host.querySelector('[data-testid="blocked"]')).not.toBeNull();
  });
});
