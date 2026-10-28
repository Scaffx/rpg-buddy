import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAdvanceAutoAdventure, useAutoAdventure } from '@/hooks/useAutoAdventure';
import { hasAdventureClockAnchor } from '@/lib/adventureClock';
import type { AdventureSnapshot } from '@/lib/autoAdventurePayload';

const state = vi.hoisted(() => ({ user: { id: '22222222-2222-2222-2222-222222222222' }, rpc: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: state.rpc } }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const battleId = '33333333-3333-3333-3333-333333333333';
const battle = {
  id: battleId, stage: 9, attempt: 3, kind: 'normal', status: 'fighting', replay: true,
  hero_class: 'mago', biome: 'forest', started_at: '2026-10-20T04:00:00Z', ends_at: '2026-10-20T05:00:00Z',
  hero_power: 70, enemy_power: 60, hero_max_hp: 100, enemy_max_hp: 100, hero_hp: 100, enemy_hp: 100,
  enemy_name: 'Lobo', enemy_icon: null, boss_id: null, events: [],
};
const emptyCatchup = { battles: 0, from_stage: null, to_stage: null, wins: 0, defeats: 0, retreats: 0, gold: 0, items: [], defeated: false, pending: false };
const initial = {
  stage: 9, mode: 'holding', advance_pending: false,
  next_at: '2026-10-20T05:00:00Z', server_now: '2026-10-20T04:00:00Z',
  last_result: null, encounters: [],
  boss: { stage: 10, id: '44444444-4444-4444-4444-444444444444', name: 'Chefe', icon: null },
  boss_wins_credited: 0, gold_today: 0, loot_today: 0, reward_day: '2026-10-20',
  battle, last_battle: null, catchup: emptyCatchup,
  limits: { interval_minutes: 0.25, reward_interval_minutes: 30, offline_hours: 24, gold_per_day: 120, items_per_day: 2 },
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let advance: ReturnType<typeof useAdvanceAutoAdventure>['mutateAsync'] | null = null;

function Observer() {
  const adventure = useAutoAdventure({ background: true });
  advance = useAdvanceAutoAdventure().mutateAsync;
  return <div>{adventure.data?.stage ?? 'aguardando'}:{adventure.summary?.wins ?? 0}:{adventure.summary?.gold ?? 0}</div>;
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
  advance = null;
  state.rpc.mockReset();
});

describe('avanço e resumo no cache da aventura', () => {
  it('invalida o ouro de advance sem iniciar um resumo offline para uma luta ao vivo', async () => {
    const rewarded = { ...initial, advance_pending: true, gold_today: 4,
      catchup: { ...emptyCatchup, battles: 1, wins: 1, gold: 4, from_stage: 9, to_stage: 9 } };
    state.rpc.mockImplementation(async (name: string) => {
      if (name === 'advance_auto_adventure') return { data: rewarded, error: null };
      return { data: initial, error: null };
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => root!.render(<QueryClientProvider client={queryClient}><Observer /></QueryClientProvider>));
    await act(async () => { await queryClient.refetchQueries({ queryKey: ['auto-adventure', state.user.id] }); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    expect(container.textContent).toBe('9:0:0');
    await act(async () => { await advance!({ battleId }); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    expect(state.rpc).toHaveBeenCalledWith('advance_auto_adventure', { p_battle_id: battleId });
    expect(queryClient.getQueryData(['auto-adventure', state.user.id])).toMatchObject({ gold_today: 4, catchup: { wins: 1, gold: 4 } });
    expect(hasAdventureClockAnchor(queryClient.getQueryData<AdventureSnapshot>(['auto-adventure', state.user.id]))).toBe(true);
    expect(queryClient.getQueryData(['auto-adventure-summary', state.user.id])).toBeNull();
    expect(container.textContent).toBe('9:0:0');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['gold-balance', state.user.id] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['inventory', state.user.id] });

    await act(async () => { await queryClient.refetchQueries({ queryKey: ['auto-adventure', state.user.id] }); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    expect(container.textContent).toBe('9:0:0');
    expect(queryClient.getQueryData(['auto-adventure-summary', state.user.id])).toBeNull();
  });
});
