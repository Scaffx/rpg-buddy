import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAdvanceAutoAdventure, useAutoAdventure } from '@/hooks/useAutoAdventure';

const state = vi.hoisted(() => ({ user: null as { id: string } | null, rpc: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: state.rpc } }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const snapshot = {
  stage: 2, mode: 'progressing', advance_pending: false,
  next_at: '2026-10-19T19:00:00Z', server_now: '2026-10-19T18:30:00Z',
  last_result: null, encounters: [],
  boss: { stage: 10, id: '00000000-0000-0000-0000-000000000001', name: 'Goblin', icon: '👺' },
  boss_wins_credited: 0, gold_today: 4, loot_today: 0,
  reward_day: '2026-10-19', battle: null, last_battle: null,
  catchup: { battles: 0, from_stage: null, to_stage: null, wins: 0, defeats: 0, retreats: 0, gold: 0, items: [], defeated: false, pending: false },
  limits: { interval_minutes: 0.25, reward_interval_minutes: 30, offline_hours: 24, gold_per_day: 120, items_per_day: 2 },
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
  state.user = null;
  state.rpc.mockReset();
});

function ShellSync() {
  useAutoAdventure({ background: true });
  return null;
}

function ArenaObserver() {
  const { data, summary, acknowledgeSummary } = useAutoAdventure();
  return <span onClick={acknowledgeSummary}>{data?.stage ?? 'waiting'}:{summary?.wins ?? 0}:{summary?.defeats ?? 0}</span>;
}

function AdvanceButton() {
  const advance = useAdvanceAutoAdventure();
  return <button onClick={() => { void advance.mutateAsync({ battleId: 'battle-current' }); }}>advance</button>;
}

describe('authenticated shell adventure synchronization', () => {
  it('syncs from the panel without Arena and shares one query when Arena opens', async () => {
    state.rpc.mockResolvedValue({ data: snapshot, error: null });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => root!.render(<QueryClientProvider client={queryClient}><ShellSync /></QueryClientProvider>));
    expect(state.rpc).not.toHaveBeenCalled();

    state.user = { id: '22222222-2222-2222-2222-222222222222' };
    await act(async () => root!.render(<QueryClientProvider client={queryClient}><ShellSync /></QueryClientProvider>));
    expect(state.rpc).toHaveBeenCalledExactlyOnceWith('sync_auto_adventure');
    expect(queryClient.getQueryData(['auto-adventure', state.user.id])).toMatchObject({ stage: 2, gold_today: 4 });

    await act(async () => root!.render(<QueryClientProvider client={queryClient}><ShellSync /><ArenaObserver /></QueryClientProvider>));
    expect(container.textContent).toBe('2:0:0');
    expect(state.rpc).toHaveBeenCalledTimes(1);
  });

  it('keeps offline rewards and retreats available after the final batch is no longer pending', async () => {
    state.user = { id: '22222222-2222-2222-2222-222222222222' };
    state.rpc
      .mockResolvedValueOnce({ data: { ...snapshot, catchup: { ...snapshot.catchup,
        battles: 2, wins: 1, defeats: 1, retreats: 1, gold: 4, pending: true } }, error: null })
      .mockResolvedValueOnce({ data: { ...snapshot, catchup: { ...snapshot.catchup,
        battles: 1, wins: 1, gold: 4, pending: false } }, error: null });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root!.render(<QueryClientProvider client={queryClient}><ShellSync /></QueryClientProvider>));
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ['auto-adventure', state.user!.id] }); });
    await act(async () => root!.render(<QueryClientProvider client={queryClient}><ShellSync /><ArenaObserver /></QueryClientProvider>));
    expect(container.textContent).toBe('2:2:1');
    await act(async () => container!.querySelector('span')!.click());
    expect(queryClient.getQueryData(['auto-adventure-summary', state.user.id])).toBeNull();
    await act(async () => root!.render(<QueryClientProvider client={queryClient}><ShellSync /><ArenaObserver /></QueryClientProvider>));
    expect(container.textContent).toBe('2:0:0');
  });

  it('keeps advance rewards after the next zero-delta sync and invalidates balances without a shell observer', async () => {
    state.user = { id: '22222222-2222-2222-2222-222222222222' };
    const advanceSnapshot = { ...snapshot, stage: 3, catchup: { ...snapshot.catchup,
      battles: 1, wins: 1, gold: 4, items: ['item-1'] } };
    state.rpc.mockResolvedValueOnce({ data: snapshot, error: null })
      .mockResolvedValueOnce({ data: advanceSnapshot, error: null })
      .mockResolvedValueOnce({ data: { ...snapshot, stage: 3 }, error: null });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidations = vi.spyOn(queryClient, 'invalidateQueries');
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root!.render(<QueryClientProvider client={queryClient}>
      <ArenaObserver /><AdvanceButton />
    </QueryClientProvider>));
    await act(async () => container!.querySelector('button')!.click());
    expect(state.rpc).toHaveBeenNthCalledWith(2, 'advance_auto_adventure', { p_battle_id: 'battle-current' });
    expect(container.textContent).toContain('3:1:0');
    expect(invalidations).toHaveBeenCalledWith({ queryKey: ['gold-balance', state.user.id] });
    expect(invalidations).toHaveBeenCalledWith({ queryKey: ['inventory', state.user.id] });
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ['auto-adventure', state.user!.id] }); });
    expect(container.textContent).toContain('3:1:0');
  });
});
