import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@/i18n';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), toast: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: mocks.rpc },
}));
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

import { useUndoMission } from '@/hooks/useUndoMission';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const mounted: { root: Root; client: QueryClient }[] = [];

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidations = vi.spyOn(client, 'invalidateQueries');
  const result = { current: null as unknown as ReturnType<typeof useUndoMission> };
  function Harness() {
    result.current = useUndoMission();
    return null;
  }
  const root = createRoot(document.createElement('div'));
  act(() => root.render(
    <QueryClientProvider client={client}><Harness /></QueryClientProvider>,
  ));
  mounted.push({ root, client });
  return { result, invalidations };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({
    data: { success: true, xpEarned: 27, goldEarned: 3, frequency_type: 'daily' },
    error: null,
  });
});

afterEach(() => {
  for (const { root, client } of mounted.splice(0)) {
    act(() => root.unmount());
    client.clear();
  }
});

describe('undo_mission: contrato e reconciliação do cliente', () => {
  it.each([
    { kind: 'daily', xp: 27, gold: 3 },
    { kind: 'weekly', xp: 41, gold: 5 },
    { kind: 'unique', xp: 27, gold: 2 },
  ])('$kind: usa totais confirmados no toast e invalida saldos', async ({ kind, xp, gold }) => {
    mocks.rpc.mockResolvedValue({
      data: { success: true, xpEarned: xp, goldEarned: gold, frequency_type: kind },
      error: null,
    });
    const { result, invalidations } = setup();
    let response: Awaited<ReturnType<typeof result.current.mutateAsync>> | undefined;
    await act(async () => {
      response = await result.current.mutateAsync({ missionId: 'mission-1', date: '2026-10-18' });
    });

    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('undo_mission', {
      p_mission_id: 'mission-1', p_today: '2026-10-18',
    });
    expect(response).toMatchObject({ xpEarned: xp, goldEarned: gold, frequencyType: kind });
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      description: `-${xp} XP -${gold} 🪙`,
    }));
    const keys = invalidations.mock.calls
      .map(([arg]) => 'queryKey' in arg ? arg.queryKey?.[0] : null);
    expect(keys).toEqual(expect.arrayContaining([
      'missions', 'profile', 'attributes', 'xp_today', 'xp_history',
      'gold-balance', 'gold-history', 'missions_today_count',
    ]));
  });

  it('erro da RPC é repassado sem toast de sucesso nem invalidação', async () => {
    const failure = new Error('DATE_OUT_OF_WINDOW');
    mocks.rpc.mockResolvedValue({ data: null, error: failure });
    const { result, invalidations } = setup();
    await act(async () => {
      await expect(result.current.mutateAsync({ missionId: 'm', date: '2026-10-17' }))
        .rejects.toBe(failure);
    });
    expect(invalidations).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      variant: 'destructive', description: 'DATE_OUT_OF_WINDOW',
    }));
  });

  it('não converte resposta inválida em reversão de zero', async () => {
    mocks.rpc.mockResolvedValue({ data: { success: false }, error: null });
    const { result, invalidations } = setup();
    await act(async () => {
      await expect(result.current.mutateAsync({ missionId: 'm' }))
        .rejects.toThrow('Resposta inválida');
    });
    expect(invalidations).not.toHaveBeenCalled();
  });

  it('retry após erro só anuncia os valores do sucesso', async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: null, error: new Error('network') })
      .mockResolvedValueOnce({ data: { success: true, xpEarned: 31, goldEarned: 4 }, error: null });
    const { result } = setup();
    await act(async () => {
      await expect(result.current.mutateAsync({ missionId: 'm' })).rejects.toThrow('network');
      await expect(result.current.mutateAsync({ missionId: 'm' })).resolves.toMatchObject({
        xpEarned: 31, goldEarned: 4,
      });
    });
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      description: '-31 XP -4 🪙',
    }));
  });
});
