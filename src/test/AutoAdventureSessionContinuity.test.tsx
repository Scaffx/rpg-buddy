import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Session, User } from '@supabase/supabase-js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { AuthContinuityBoundary } from '@/components/auth/AuthContinuityBoundary';
import { useAutoAdventure } from '@/hooks/useAutoAdventure';

const sdk = vi.hoisted(() => ({
  getSession: vi.fn(), getUser: vi.fn(), rpc: vi.fn(),
  disconnect: vi.fn(() => Promise.resolve()), removeAllChannels: vi.fn(() => Promise.resolve()),
  setAuth: vi.fn(() => Promise.resolve()), connect: vi.fn(),
  listener: null as ((event: string, session: Session | null) => void) | null,
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  auth: {
    getSession: sdk.getSession, getUser: sdk.getUser,
    onAuthStateChange: (listener: typeof sdk.listener) => {
      sdk.listener = listener;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    },
  },
  rpc: sdk.rpc,
  realtime: { disconnect: sdk.disconnect, removeAllChannels: sdk.removeAllChannels,
    setAuth: sdk.setAuth, connect: sdk.connect },
  getChannels: () => [],
} }));
vi.mock('@/lib/nativeAuth', () => ({ initDeepLinkAuth: vi.fn() }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const now = new Date('2026-10-28T12:00:00Z');
const user = { id: 'account-a', app_metadata: {}, user_metadata: {} } as User;
const token = (sessionId: string, suffix: string) =>
  `header.${btoa(JSON.stringify({ sub: user.id, iss: 'https://auth.example.test/auth/v1',
    session_id: sessionId, exp: Math.floor(now.getTime() / 1000) + 3600, suffix })).replace(/=/g, '')}.signature`;
const session = (accessToken: string) => ({ access_token: accessToken, user,
  expires_at: Math.floor(now.getTime() / 1000) + 3600 }) as Session;
const verified = () => ({ data: { user }, error: null });
const catchup = { battles: 0, from_stage: null, to_stage: null, wins: 0, defeats: 0,
  draws: 0, retreats: 0, gold: 0, items: [], defeated: false, pending: false };
const snapshot = (stage: number, minute: number, recap = catchup) => ({
  stage, mode: 'progressing', advance_pending: false,
  next_at: '2026-10-28T12:20:00Z', server_now: `2026-10-28T12:${String(minute).padStart(2, '0')}:00Z`,
  last_result: null, encounters: [], boss: { stage: 10, id: 'boss', name: 'Chefe', icon: null },
  boss_wins_credited: 0, gold_today: 0, loot_today: 0, reward_day: '2026-10-28',
  battle: null, last_battle: null, catchup: recap,
  limits: { interval_minutes: 0.25, reward_interval_minutes: 30, offline_hours: 24,
    gold_per_day: 0, items_per_day: 2 },
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function pendingRpc() {
  const pending = deferred<{ data: ReturnType<typeof snapshot>; error: null }>();
  const abortSignal = vi.fn((_signal: AbortSignal) => pending.promise);
  return { ...pending, request: Object.assign(pending.promise, { abortSignal }), abortSignal };
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let client: QueryClient;
let mounts = 0;
let unmounts = 0;
function Adventure() {
  const query = useAutoAdventure({ background: true });
  useEffect(() => { mounts += 1; return () => { unmounts += 1; }; }, []);
  return <output data-testid="adventure">{query.data?.stage ?? 'waiting'}:{query.summary?.wins ?? 0}:
    {query.isFetching ? 'fetching' : 'idle'}:{query.isError ? 'error' : 'ok'}</output>;
}
function Gate({ showAdventure }: { showAdventure: boolean }) {
  const { user: confirmed, loading, authError } = useAuth();
  return loading || authError || !confirmed || !showAdventure ? null : <Adventure />;
}
async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); await vi.advanceTimersByTimeAsync(0); });
}
async function emit(event: string, next: Session) {
  await act(async () => { sdk.listener!(event, next); });
  await flush();
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  sdk.getSession.mockReset(); sdk.getUser.mockReset(); sdk.rpc.mockReset(); sdk.listener = null;
  sdk.disconnect.mockClear(); sdk.removeAllChannels.mockClear(); sdk.setAuth.mockClear(); sdk.connect.mockClear();
  mounts = 0; unmounts = 0;
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove(); root = null; host = null;
  client.clear();
  vi.useRealTimers();
});
async function mount(initial: Session) {
  sdk.getSession.mockResolvedValue({ data: { session: initial }, error: null });
  sdk.getUser.mockResolvedValueOnce(verified());
  host = document.createElement('div'); document.body.appendChild(host);
  root = createRoot(host);
  await renderAdventure(true);
}
async function renderAdventure(showAdventure: boolean) {
  await act(async () => root!.render(<QueryClientProvider client={client}><AuthProvider>
    <AuthContinuityBoundary><Gate showAdventure={showAdventure} /></AuthContinuityBoundary>
  </AuthProvider></QueryClientProvider>));
  await flush();
}
const shown = () => host!.querySelector('[data-testid="adventure"]') as HTMLOutputElement | null;

it('a new confirmed session for the same account revalidates fresh cache once and ignores the old RPC', async () => {
  const first = token('session-a', 'initial');
  const second = token('session-b', 'new-login');
  const oldRpc = pendingRpc();
  const newRpc = pendingRpc();
  sdk.rpc.mockResolvedValueOnce({ data: snapshot(8, 0, { ...catchup,
    battles: 2, wins: 2, gold: 8, pending: true }), error: null })
    .mockReturnValueOnce(oldRpc.request).mockReturnValueOnce(newRpc.request);
  await mount(session(first));
  expect(sdk.getUser).toHaveBeenCalledWith(first);
  expect(shown()?.textContent?.replace(/\s+/g, '')).toBe('8:2:idle:ok');
  expect(mounts).toBe(1);
  const oldSnapshot = client.getQueryData(['auto-adventure', user.id]);
  await act(async () => { void client.refetchQueries({ queryKey: ['auto-adventure', user.id], exact: true }); });
  expect(oldRpc.abortSignal).toHaveBeenCalledTimes(1);

  const confirmation = deferred<ReturnType<typeof verified>>();
  sdk.getUser.mockReturnValueOnce(confirmation.promise);
  await emit('SIGNED_IN', session(second));
  expect(sdk.getUser).toHaveBeenLastCalledWith(second);
  expect(shown()).toBeNull();
  await act(async () => confirmation.resolve(verified()));
  await flush();
  expect(mounts).toBe(2);
  expect(unmounts).toBe(1);
  expect(sdk.rpc).toHaveBeenCalledTimes(3);
  expect(sdk.rpc).toHaveBeenNthCalledWith(3, 'sync_auto_adventure');
  expect(newRpc.abortSignal).toHaveBeenCalledTimes(1);
  expect(shown()?.textContent?.replace(/\s+/g, '')).toBe('8:0:fetching:ok');
  expect(client.getQueryData(['auto-adventure', user.id])).toBe(oldSnapshot);
  expect(client.getQueryState(['auto-adventure', user.id])?.isInvalidated).toBe(true);
  expect(client.getQueryData(['auto-adventure-summary', user.id])).toBeNull();

  await act(async () => newRpc.resolve({ data: snapshot(9, 1), error: null }));
  await flush();
  const accepted = client.getQueryData(['auto-adventure', user.id]);
  expect(shown()?.textContent?.replace(/\s+/g, '')).toBe('9:0:idle:ok');
  await act(async () => oldRpc.resolve({ data: snapshot(1, 0, { ...catchup,
    battles: 3, wins: 3, gold: 12, pending: true }), error: null }));
  await flush();
  expect(oldRpc.abortSignal.mock.calls[0][0].aborted).toBe(true);
  expect(client.getQueryData(['auto-adventure', user.id])).toBe(accepted);
  expect(client.getQueryData(['auto-adventure-summary', user.id])).toBeNull();
  expect(shown()?.textContent?.replace(/\s+/g, '')).toBe('9:0:idle:ok');
  expect(sdk.rpc).toHaveBeenCalledTimes(3);
  const serializedKeys = JSON.stringify(client.getQueryCache().getAll().map(query => query.queryKey));
  expect(serializedKeys).not.toContain(first);
  expect(serializedKeys).not.toContain(second);

  // Navigation remounts Adventure without changing the confirmed auth generation.
  await renderAdventure(false);
  expect(unmounts).toBe(2);
  await act(async () => { await client.invalidateQueries({
    queryKey: ['auto-adventure', user.id], exact: true, refetchType: 'none',
  }); });
  expect(client.getQueryState(['auto-adventure', user.id])?.isInvalidated).toBe(true);
  expect(sdk.rpc).toHaveBeenCalledTimes(3);
  sdk.rpc.mockResolvedValueOnce({ data: snapshot(10, 2), error: null });
  await renderAdventure(true);
  expect(mounts).toBe(3);
  expect(sdk.rpc).toHaveBeenCalledTimes(4);
  expect(shown()?.textContent?.replace(/\s+/g, '')).toBe('10:0:idle:ok');
  expect(sdk.getUser).toHaveBeenCalledTimes(2);
});

it('TOKEN_REFRESHED with the same session keeps the boundary mount and paused view', async () => {
  const first = token('session-a', 'initial');
  const refreshed = token('session-a', 'refresh');
  sdk.rpc.mockResolvedValue({ data: snapshot(8, 0), error: null });
  await mount(session(first));
  const node = shown();
  expect(node?.textContent?.replace(/\s+/g, '')).toBe('8:0:idle:ok');
  const confirmation = deferred<ReturnType<typeof verified>>();
  sdk.getUser.mockReturnValueOnce(confirmation.promise);
  const pauses = sdk.disconnect.mock.calls.length;
  await emit('TOKEN_REFRESHED', session(refreshed));
  expect(sdk.getUser).toHaveBeenLastCalledWith(refreshed);
  expect(shown()).toBe(node);
  expect(sdk.disconnect).toHaveBeenCalledTimes(pauses + 1);
  expect(sdk.setAuth).not.toHaveBeenCalledWith(refreshed);
  expect(mounts).toBe(1);
  await act(async () => confirmation.resolve(verified()));
  await flush();
  expect(shown()).toBe(node);
  expect(mounts).toBe(1);
  expect(unmounts).toBe(0);
  expect(sdk.rpc).toHaveBeenCalledTimes(1);
  expect(sdk.setAuth).toHaveBeenCalledWith(refreshed);
  expect(host!.querySelector('[data-auth-retained]')?.hasAttribute('inert')).toBe(false);
});
