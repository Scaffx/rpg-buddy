import { afterEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAdvanceAutoAdventure } from '@/hooks/useAutoAdventure';

const state = vi.hoisted(() => ({ user: { id: 'account-a' }, rpc: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: state.rpc } }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const snapshot = {
  stage: 2, mode: 'progressing', advance_pending: false,
  next_at: '2026-10-28T12:00:20Z', server_now: '2026-10-28T12:00:00Z',
  last_result: null, encounters: [], boss: { stage: 10, id: 'boss', name: 'Chefe', icon: null },
  boss_wins_credited: 0, gold_today: 4, loot_today: 0, reward_day: '2026-10-28',
  battle: null, last_battle: null,
  catchup: { battles: 1, from_stage: 1, to_stage: 1, wins: 1, defeats: 0, retreats: 0,
    gold: 4, items: [], defeated: false, pending: false },
  limits: { interval_minutes: 0.25, reward_interval_minutes: 30, offline_hours: 24, gold_per_day: 120, items_per_day: 2 },
};
let root: Root | null = null;
let container: HTMLDivElement | null = null;
let advance: ReturnType<typeof useAdvanceAutoAdventure>['mutateAsync'] | null = null;

function Probe() {
  advance = useAdvanceAutoAdventure().mutateAsync;
  return null;
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
  advance = null;
  state.user = { id: 'account-a' };
  state.rpc.mockReset();
});

it('não grava uma resposta atrasada do avanço na conta nova', async () => {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  let resolveRpc!: (result: { data: typeof snapshot; error: null }) => void;
  state.rpc.mockImplementation(() => new Promise(resolve => { resolveRpc = resolve; }));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root!.render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>));
  let pending!: Promise<unknown>;
  act(() => { pending = advance!({ battleId: 'battle-a' }); });
  state.user = { id: 'account-b' };
  await act(async () => root!.render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>));
  await act(async () => { resolveRpc({ data: snapshot, error: null }); await pending; });
  expect(client.getQueryData(['auto-adventure', 'account-b'])).toBeUndefined();
  expect(client.getQueryData(['auto-adventure-summary', 'account-b'])).toBeUndefined();
  expect(client.getQueryData(['auto-adventure', 'account-a'])).toBeUndefined();
});

it('não aplica resposta antiga após A→B→A nem regride sync mais novo de A', async () => {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  let resolveRpc!: (result: { data: typeof snapshot; error: null }) => void;
  state.rpc.mockImplementation(() => new Promise(resolve => { resolveRpc = resolve; }));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root!.render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>));
  let pending!: Promise<unknown>;
  act(() => { pending = advance!({ battleId: 'old-a-battle' }); });
  state.user = { id: 'account-b' };
  await act(async () => root!.render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>));
  state.user = { id: 'account-a' };
  await act(async () => root!.render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>));
  const newer = { ...snapshot, stage: 9, server_now: '2026-10-28T12:10:00Z' };
  client.setQueryData(['auto-adventure', 'account-a'], newer);
  await act(async () => { resolveRpc({ data: snapshot, error: null }); await pending; });
  expect(client.getQueryData(['auto-adventure', 'account-a'])).toBe(newer);
  expect(client.getQueryData(['auto-adventure-summary', 'account-a'])).toBeUndefined();
});

it('preserva geração A→B→A mesmo com remount do hook e sem snapshot novo', async () => {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  let resolveRpc!: (result: { data: typeof snapshot; error: null }) => void;
  state.rpc.mockImplementation(() => new Promise(resolve => { resolveRpc = resolve; }));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root!.render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>));
  let pending!: Promise<unknown>;
  act(() => { pending = advance!({ battleId: 'old-a-battle' }); });
  act(() => root!.unmount());
  root = createRoot(container);
  state.user = { id: 'account-b' };
  await act(async () => root!.render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>));
  state.user = { id: 'account-a' };
  await act(async () => root!.render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>));
  await act(async () => { resolveRpc({ data: snapshot, error: null }); await pending; });
  expect(client.getQueryData(['auto-adventure', 'account-a'])).toBeUndefined();
  expect(client.getQueryData(['auto-adventure-summary', 'account-a'])).toBeUndefined();
});
