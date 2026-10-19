import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: mocks }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));

import { useRestoreHealthAfterGoals, useToggleChecklistItem } from '@/hooks/useProfile';
import { useCompleteMission } from '@/hooks/useMissionsHooks';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const mounted: { root: Root; client: QueryClient }[] = [];

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  client.setQueryData(['profile', 'user-1'], {
    total_xp: 100, xp_today: 10, missions_completed: 1, boss_keys: 0,
  });
  client.setQueryData(['xp_today', 'user-1'], 10);
  client.setQueryData(['xp_history', 'user-1', 7], []);
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const result = { current: null as unknown as {
    toggle: ReturnType<typeof useToggleChecklistItem>;
    complete: ReturnType<typeof useCompleteMission>;
    restoreHealth: ReturnType<typeof useRestoreHealthAfterGoals>;
  } };
  function Harness() {
    result.current = {
      toggle: useToggleChecklistItem(),
      complete: useCompleteMission(),
      restoreHealth: useRestoreHealthAfterGoals(),
    };
    return null;
  }
  const root = createRoot(document.createElement('div'));
  const Wrapper = wrapper;
  act(() => root.render(<Wrapper><Harness /></Wrapper>));
  mounted.push({ root, client });
  return { client, invalidate, result };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.eq.mockResolvedValue({ error: null });
  mocks.update.mockReturnValue({ eq: mocks.eq });
  mocks.insert.mockResolvedValue({ error: null });
  mocks.from.mockReturnValue({ update: mocks.update, insert: mocks.insert });
  mocks.rpc.mockResolvedValue({ data: { xp_gained: 27 }, error: null });
});

afterEach(() => {
  for (const { root, client } of mounted.splice(0)) {
    act(() => root.unmount());
    client.clear();
  }
});

describe('checklist: estado sem progressão independente', () => {
  it.each([undefined, 2, 7, 0])('marcar não concede XP (xpBonus=%s)', async (xpBonus) => {
    const { client, invalidate, result } = setup();
    await act(async () => {
      await result.current.toggle.mutateAsync({ itemId: 'item-1', completed: true, xpBonus });
    });

    expect(mocks.from.mock.calls).toEqual([['checklist_items']]);
    expect(mocks.update).toHaveBeenCalledWith({ completed: true });
    expect(mocks.eq).toHaveBeenCalledWith('id', 'item-1');
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(client.getQueryData(['profile', 'user-1'])).toMatchObject({ total_xp: 100, xp_today: 10 });
    expect(client.getQueryData(['xp_history', 'user-1', 7])).toEqual([]);
    expect(invalidate.mock.calls).toEqual([[{ queryKey: ['checklist'] }]]);
  });

  it('marcar/desmarcar repetidamente não deixa XP residual', async () => {
    const { client, result } = setup();
    for (const completed of [true, false, true, false]) {
      await act(async () => {
        await result.current.toggle.mutateAsync({ itemId: 'item-1', completed, xpBonus: 2 });
      });
    }

    expect(mocks.update.mock.calls).toEqual([
      [{ completed: true }], [{ completed: false }],
      [{ completed: true }], [{ completed: false }],
    ]);
    expect(mocks.from.mock.calls).toEqual(Array.from({ length: 4 }, () => ['checklist_items']));
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(client.getQueryData(['profile', 'user-1'])).toMatchObject({ total_xp: 100, xp_today: 10 });
    expect(client.getQueryData(['xp_today', 'user-1'])).toBe(10);
    expect(client.getQueryData(['xp_history', 'user-1', 7])).toEqual([]);
  });

  it('erro ao salvar o estado não concede XP nem invalida o checklist', async () => {
    const error = new Error('Checklist update failed');
    mocks.eq.mockResolvedValue({ error });
    const { invalidate, result } = setup();
    await act(async () => {
      await expect(result.current.toggle.mutateAsync({ itemId: 'item-1', completed: true }))
        .rejects.toBe(error);
    });
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it.each([
    { name: 'diária', frequency_type: 'daily', days_of_week: ['Sex'] },
    { name: 'semanal', frequency_type: 'weekly', days_of_week: [] },
    { name: 'única', frequency_type: 'daily', days_of_week: [] },
  ])('$name: só complete_mission reconcilia a recompensa do servidor, uma vez', async (mission) => {
    const { client, result } = setup();
    client.setQueryData(['missions', 'user-1'], [{
      id: 'mission-1', ...mission, completed: false, daily_status: {},
    }]);
    mocks.rpc.mockResolvedValue({
      data: { xp_gained: 27, frequency_type: mission.frequency_type }, error: null,
    });
    await act(async () => {
      await result.current.toggle.mutateAsync({ itemId: 'item-1', completed: true, xpBonus: 7 });
      const completed = await result.current.complete.mutateAsync({
        missionId: 'mission-1', attributeId: 'attribute-1', xpReward: 20,
      });
      expect(completed.xpGained).toBe(27);
    });

    // O teste SQL executa o cálculo real de 20 + 7; aqui verificamos que o
    // cliente aplica a resposta do servidor sem conceder o bônus outra vez.
    expect(mocks.rpc.mock.calls).toEqual([['complete_mission', { p_mission_id: 'mission-1' }]]);
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(client.getQueryData(['profile', 'user-1'])).toMatchObject({ total_xp: 127, xp_today: 37 });
    expect(client.getQueryData(['xp_today', 'user-1'])).toBe(37);
  });

  it('meta de saúde retorna cura sem conceder XP no cliente', async () => {
    mocks.rpc.mockResolvedValue({ data: { success: true, xp: 0 }, error: null });
    const { client, invalidate, result } = setup();
    await act(async () => {
      await expect(result.current.restoreHealth.mutateAsync()).resolves.toEqual({ success: true });
    });
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('claim_health_challenge');
    expect(client.getQueryData(['profile', 'user-1'])).toMatchObject({ total_xp: 100 });
    expect(invalidate.mock.calls).not.toContainEqual([{ queryKey: ['profile'] }]);
    expect(invalidate.mock.calls).toContainEqual([{ queryKey: ['health_stats'] }]);
  });
});
