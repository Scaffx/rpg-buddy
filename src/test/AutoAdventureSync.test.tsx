import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAutoAdventure } from '@/hooks/useAutoAdventure';

const state = vi.hoisted(() => ({ user: null as { id: string } | null, rpc: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: state.rpc } }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const snapshot = {
  stage: 2, next_at: '2026-10-19T19:00:00Z', server_now: '2026-10-19T18:30:00Z',
  last_result: null, encounters: [],
  boss: { stage: 10, id: '00000000-0000-0000-0000-000000000001', name: 'Goblin', icon: '👺' },
  boss_wins_credited: 0, gold_today: 4, loot_today: 0,
  limits: { interval_minutes: 30, offline_hours: 24, gold_per_day: 120, items_per_day: 2 },
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
  const { data } = useAutoAdventure();
  return <span>{data?.stage ?? 'waiting'}</span>;
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
    expect(container.textContent).toBe('2');
    expect(state.rpc).toHaveBeenCalledTimes(1);
  });
});
