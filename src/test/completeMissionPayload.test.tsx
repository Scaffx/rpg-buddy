import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Captura o payload exato que chega no PostgREST. É ele que decide qual
// overload de complete_mission será resolvida.
const rpcSpy = vi.fn().mockResolvedValue({
  data: { xp_gained: 25, gold_gained: 2, frequency_type: 'daily' },
  error: null,
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...args: unknown[]) => rpcSpy(...args) },
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

import { useCompleteMission } from '@/hooks/useMissionsHooks';

type CompleteVars = {
  missionId: string;
  attributeId: string;
  xpReward: number;
  targetDate?: string;
};

function mountHook() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ref: { current: UseMutationResult<unknown, Error, CompleteVars> | null } = { current: null };
  function Harness() {
    ref.current = useCompleteMission() as unknown as UseMutationResult<unknown, Error, CompleteVars>;
    return null;
  }
  const container = document.createElement('div');
  const root: Root = createRoot(container);
  act(() => {
    root.render(
      <QueryClientProvider client={client}>
        <Harness />
      </QueryClientProvider>,
    );
  });
  return ref;
}

describe('payload de complete_mission', () => {
  beforeEach(() => rpcSpy.mockClear());

  it('não manda p_date no caminho comum', async () => {
    // PostgREST resolve a overload pelo conjunto de nomes de argumento. Mandar
    // p_date: null faz a chamada procurar complete_mission(uuid, date) — que não
    // existe enquanto a migration da janela D-1 não for aplicada à mão em
    // produção. O resultado seria PGRST202 e nenhuma missão concluída no app
    // inteiro durante a janela entre o deploy do front e a migration.
    const hook = mountHook();
    await act(async () => {
      await hook.current!.mutateAsync({ missionId: 'm1', attributeId: 'a1', xpReward: 25 });
    });

    expect(rpcSpy).toHaveBeenCalledTimes(1);
    const [fn, args] = rpcSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(fn).toBe('complete_mission');
    expect(args).toEqual({ p_mission_id: 'm1' });
    expect('p_date' in args).toBe(false);
  });

  it('manda p_date só quando há dia proposto', async () => {
    const hook = mountHook();
    await act(async () => {
      await hook.current!.mutateAsync({
        missionId: 'm1',
        attributeId: 'a1',
        xpReward: 25,
        targetDate: '2026-08-20',
      });
    });

    const [, args] = rpcSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(args).toEqual({ p_mission_id: 'm1', p_date: '2026-08-20' });
  });
});
