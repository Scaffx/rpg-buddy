import { afterEach, expect, it, vi } from 'vitest';
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider, QueryObserver } from '@tanstack/react-query';
import { useAutoAdventure } from '@/hooks/useAutoAdventure';

const state = vi.hoisted(() => ({
  user: { id: 'account-a' } as { id: string } | null,
  epoch: 0,
  token: 'confirmed-1',
  rpc: vi.fn(),
}));
const boundToken = (sessionId: string, suffix: string) =>
  `header.${btoa(JSON.stringify({ sub: 'account-a', iss: 'https://auth.example.test/auth/v1',
    session_id: sessionId, suffix })).replace(/=/g, '')}.signature`;
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({
  user: state.user, session: { access_token: state.token }, continuity: { epoch: state.epoch },
}) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: state.rpc } }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const base = {
  stage: 1, mode: 'progressing', advance_pending: false,
  next_at: '2026-10-28T12:00:20Z', server_now: '2026-10-28T12:00:00Z',
  last_result: null, encounters: [], boss: { stage: 10, id: 'boss', name: 'Chefe', icon: null },
  boss_wins_credited: 0, gold_today: 0, loot_today: 0, reward_day: '2026-10-28',
  battle: null, last_battle: null,
  catchup: { battles: 0, from_stage: null, to_stage: null, wins: 0, defeats: 0,
    draws: 0, retreats: 0, gold: 0, items: [], defeated: false, pending: false },
  limits: { interval_minutes: 0.25, reward_interval_minutes: 30, offline_hours: 24,
    gold_per_day: 0, items_per_day: 2 },
};
const snap = (stage: number, minute: number, catchup = base.catchup) => ({
  ...base, stage, server_now: `2026-10-28T12:${String(minute).padStart(2, '0')}:00Z`, catchup,
});

function deferred() {
  let resolve!: (value: { data: ReturnType<typeof snap>; error: null }) => void;
  const promise = new Promise<{ data: ReturnType<typeof snap>; error: null }>(done => { resolve = done; });
  const abortSignal = vi.fn((_signal: AbortSignal) => promise);
  return { request: Object.assign(promise, { abortSignal }), resolve, abortSignal };
}
const flush = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let mounts = 0;
function Probe() {
  const query = useAutoAdventure();
  useEffect(() => { mounts += 1; }, []);
  return <div data-testid="adventure">{query.data?.stage ?? 'waiting'}:{query.isError ? 'error' : 'ok'}</div>;
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
  mounts = 0;
  state.user = { id: 'account-a' };
  state.epoch = 0;
  state.token = 'confirmed-1';
  state.rpc.mockReset();
});

it('QueryObserver preserves newer A and B when an old A sync resolves after A→B→A', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const oldA = deferred();
  const freshA = deferred();
  state.rpc.mockReturnValueOnce(oldA.request)
    .mockResolvedValueOnce({ data: snap(4, 4), error: null })
    .mockReturnValueOnce(freshA.request);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const seen: number[] = [];
  const observer = new QueryObserver(client, {
    queryKey: ['auto-adventure', 'account-a'], enabled: false,
    queryFn: async () => { throw new Error('observer must not fetch'); },
  });
  const unsubscribe = observer.subscribe(result => {
    const stage = (result.data as { stage?: number } | undefined)?.stage;
    if (stage !== undefined) seen.push(stage);
  });
  try {
    await act(async () => root!.render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>));
    expect(oldA.abortSignal).toHaveBeenCalledTimes(1);
    expect(oldA.abortSignal.mock.calls[0][0]).toBeInstanceOf(AbortSignal);

    state.user = { id: 'account-b' }; state.epoch = 1;
    await act(async () => root!.render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>));
    const b = client.getQueryData(['auto-adventure', 'account-b']);
    expect(b).toMatchObject({ stage: 4 });

    await act(async () => { await client.cancelQueries({ queryKey: ['auto-adventure', 'account-a'], exact: true }); });
    state.user = { id: 'account-a' }; state.epoch = 2;
    await act(async () => root!.render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>));
    await act(async () => freshA.resolve({ data: snap(9, 9), error: null }));
    await flush();
    const newer = client.getQueryData(['auto-adventure', 'account-a']);
    expect(newer).toMatchObject({ stage: 9 });
    expect(container.textContent).toBe('9:ok');

    await act(async () => oldA.resolve({ data: snap(1, 1, { ...base.catchup,
      battles: 2, wins: 2, gold: 8, pending: true }), error: null }));
    expect(client.getQueryData(['auto-adventure', 'account-a'])).toBe(newer);
    expect(client.getQueryData(['auto-adventure', 'account-b'])).toBe(b);
    expect(client.getQueryData(['auto-adventure-summary', 'account-a'])).toBeNull();
    expect(seen.at(-1)).toBe(9);
    expect(seen).not.toContain(1);
    expect(container.textContent).toBe('9:ok');
    expect(state.rpc).toHaveBeenCalledTimes(3);
    expect(mounts).toBe(1);
  } finally { unsubscribe(); }
});

it('a remounted hook under a synthetic new generation refetches without a visible cancellation error; refresh keeps the screen', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  state.token = boundToken('session-one', 'initial');
  const old = deferred();
  const fresh = deferred();
  state.rpc.mockResolvedValueOnce({ data: snap(8, 8), error: null })
    .mockReturnValueOnce(old.request).mockReturnValueOnce(fresh.request);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root!.render(<QueryClientProvider client={client}><Probe key={state.epoch} /></QueryClientProvider>));
  await flush();
  expect(container.textContent).toBe('8:ok');
  const initial = client.getQueryData(['auto-adventure', 'account-a']);
  await act(async () => { void client.refetchQueries({ queryKey: ['auto-adventure', 'account-a'] }); });
  expect(old.abortSignal).toHaveBeenCalledTimes(1);

  // The keyed probe models the remount; the integrated test covers the real Auth boundary.
  state.epoch = 1;
  state.token = boundToken('session-two', 'login');
  await act(async () => root!.render(<QueryClientProvider client={client}><Probe key={state.epoch} /></QueryClientProvider>));
  expect(container.textContent).toBe('8:ok');
  expect(client.getQueryData(['auto-adventure', 'account-a'])).toBe(initial);
  expect(old.abortSignal.mock.calls[0][0].aborted).toBe(true);
  await act(async () => fresh.resolve({ data: snap(9, 9), error: null }));
  await flush();
  const newer = client.getQueryData(['auto-adventure', 'account-a']);
  await act(async () => old.resolve({ data: snap(1, 1), error: null }));
  expect(client.getQueryData(['auto-adventure', 'account-a'])).toBe(newer);
  expect(container.textContent).toBe('9:ok');

  // A confirmed token refresh of the same auth session leaves epoch unchanged.
  state.token = boundToken('session-two', 'refresh');
  await act(async () => root!.render(<QueryClientProvider client={client}><Probe key={state.epoch} /></QueryClientProvider>));
  expect(container.textContent).toBe('9:ok');
  expect(state.rpc).toHaveBeenCalledTimes(3);
  expect(mounts).toBe(2);
});

it('a response with older server_now preserves the accepted cache and does not record its catchup', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  state.rpc.mockResolvedValueOnce({ data: snap(9, 9), error: null })
    .mockResolvedValueOnce({ data: snap(1, 1, { ...base.catchup,
      battles: 2, wins: 2, gold: 8, pending: true }), error: null });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root!.render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>));
  await flush();
  const newer = client.getQueryData(['auto-adventure', 'account-a']);
  await act(async () => { await client.refetchQueries({ queryKey: ['auto-adventure', 'account-a'] }); });
  await flush();
  expect(client.getQueryData(['auto-adventure', 'account-a'])).toBe(newer);
  expect(client.getQueryData(['auto-adventure-summary', 'account-a'])).toBeNull();
  expect(container.textContent).toBe('9:ok');
  expect(state.rpc).toHaveBeenCalledTimes(2);
});
