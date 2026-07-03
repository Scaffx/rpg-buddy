import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';

// Habilita act(...) fora do @testing-library para flush determinístico de effects.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Plano existente no banco (equivale ao "Pegar 85kg até final de 2026").
const PLAN = {
  id: 'c9e2cde8-f78c-4d99-81c0-ca6612937b44',
  title: 'Pegar 85kg até final de 2026',
  description: null,
  target_value: 10,
  current_value: 0,
  user_id: 'u1',
  plan_missions: [],
};

// Mock do supabase: from('plans').select(...).eq('user_id', ...).order(...) -> Promise.
const orderMock = vi.fn(() => Promise.resolve({ data: [PLAN], error: null }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ order: orderMock }),
      }),
    }),
  },
}));

// Usuário autenticado (dono do plano).
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

import { usePlans, type PlanView } from '@/hooks/usePlans';

// QueryClient espelhando a config de produção (App.tsx): staleTime de 1 min.
// É esse staleTime que, junto de initialData:[], escondia o fetch no remount.
function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { staleTime: 60_000, gcTime: 5 * 60_000, retry: false } },
  });
}

// Harness manual: monta o hook e expõe o último resultado, sem @testing-library.
function mountHook(client: QueryClient) {
  const ref: { current: UseQueryResult<PlanView[]> | null } = { current: null };
  function Harness() {
    ref.current = usePlans();
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
  return { ref, root };
}

// Aguarda até `cond` virar verdade, dando ticks pro React Query resolver o fetch.
async function waitFor(cond: () => boolean, tries = 50) {
  for (let i = 0; i < tries; i++) {
    if (cond()) return;
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
  throw new Error('waitFor: condição não satisfeita a tempo');
}

describe('usePlans — leitura sobrevive a navegar/voltar (regressão Tela Prioridade)', () => {
  beforeEach(() => {
    orderMock.mockClear();
  });

  it('busca o plano num mount fresco mesmo com staleTime de prod', async () => {
    // Cache vazio = voltar após gcTime OU reload do app. Com initialData:[] o
    // React Query trataria [] como fresco e NÃO buscaria -> tela vazia.
    const { ref } = mountHook(makeClient());
    await waitFor(() => (ref.current?.data?.length ?? 0) === 1);

    expect(ref.current?.data?.[0].title).toBe('Pegar 85kg até final de 2026');
    expect(orderMock).toHaveBeenCalled();
  });

  it('após criar (1º mount) e remontar (voltar), o plano continua visível', async () => {
    // 1º mount: plano carrega.
    const first = mountHook(makeClient());
    await waitFor(() => (first.ref.current?.data?.length ?? 0) === 1);
    act(() => first.root.unmount());

    // Remontagem "voltar" após o cache ter sido coletado (gcTime) — cliente novo,
    // cache vazio. O plano precisa reaparecer via novo fetch.
    orderMock.mockClear();
    const second = mountHook(makeClient());
    await waitFor(() => (second.ref.current?.data?.length ?? 0) === 1);

    expect(second.ref.current?.data?.[0].id).toBe(PLAN.id);
    expect(orderMock).toHaveBeenCalled();
  });
});
