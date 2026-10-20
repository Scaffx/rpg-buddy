import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let mountedRoots: Root[] = [];
afterEach(() => {
  for (const root of mountedRoots) act(() => root.unmount());
  mountedRoots = [];
});

// Estado observável do mock, por teste.
const rpcSpy = vi.fn();
let updatedIds: string[] = [];
let insertedActivity: any[] = [];
let updatePayloads: Array<{ id: string; payload: any }> = [];
let statusById: Record<string, string | null> = {};
/** ids cujo UPDATE deve devolver erro, para simular falha parcial. */
let failUpdateFor: string[] = [];
let noRowFor: string[] = [];

function makeBuilder(table: string) {
  // A cadeia real é `.update(payload).eq('id', x)` — o filtro chega DEPOIS do
  // update, então o id só é conhecido quando a promise é resolvida.
  let currentId = '';
  let pendingUpdate: any = null;

  const resolver = () => {
    if (pendingUpdate && table === 'missions') {
      if (failUpdateFor.includes(currentId)) {
        return { data: null, error: { message: 'RLS' } };
      }
      if (noRowFor.includes(currentId)) return { data: null, error: null };
      updatedIds.push(currentId);
      updatePayloads.push({ id: currentId, payload: pendingUpdate });
      return { data: { id: currentId }, error: null };
    }
    return { data: table === 'activity_log' ? [] : null, error: null };
  };

  const builder: any = {
    select: () => builder,
    eq: (col: string, val: string) => {
      if (col === 'id') currentId = val;
      return builder;
    },
    is: () => builder,
    gte: () => builder,
    single: () => Promise.resolve({
      data: { status: statusById[currentId] ?? null, daily_status: {} },
      error: null,
    }),
    maybeSingle: () => Promise.resolve(resolver()),
    update: (payload: any) => {
      pendingUpdate = payload;
      return builder;
    },
    insert: (payload: any) => {
      if (table === 'activity_log') insertedActivity.push(payload);
      return builder;
    },
    then: (resolve: any) => resolve(resolver()),
  };
  return builder;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => makeBuilder(table),
    rpc: (...args: any[]) => rpcSpy(...args),
  },
}));
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { warning: vi.fn(), error: vi.fn(), success: vi.fn() }),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));

import { dismissFailedMissions, useMarkFailedAsDone } from '@/hooks/useFailedMissions';

const diaria = (id: string) => ({
  id,
  title: `Missão ${id}`,
  failed_date: '2026-08-20',
  frequency_type: 'daily',
});

describe('dispensar missões fracassadas', () => {
  beforeEach(() => {
    rpcSpy.mockReset();
    rpcSpy.mockResolvedValue({ data: null, error: null });
    updatedIds = [];
    insertedActivity = [];
    updatePayloads = [];
    statusById = {};
    failUpdateFor = [];
    noRowFor = [];
  });

  it('dispensa todas as missões da lista, não só a primeira', async () => {
    const r = await dismissFailedMissions('user-1', [diaria('a'), diaria('b'), diaria('c')]);

    expect(r.dispensadas).toBe(3);
    expect(updatedIds).toEqual(['a', 'b', 'c']);
    expect(insertedActivity).toHaveLength(3);
  });

  it('aceita uma missão solta, sem array', async () => {
    const r = await dismissFailedMissions('user-1', diaria('unica'));

    expect(r.dispensadas).toBe(1);
    expect(updatedIds).toEqual(['unica']);
    expect(updatePayloads[0].payload).toMatchObject({
      status: 'pendente', is_failed: false,
      daily_status: { '2026-08-20': 'failed_accepted' },
    });
    expect(insertedActivity[0].xp_gained).toBe(0);
  });

  it('preserva status arquivado ou pausado ao dispensar', async () => {
    statusById = { a: 'arquivada', b: 'pausada' };
    await dismissFailedMissions('user-1', [diaria('a'), diaria('b')]);
    expect(updatedIds).toEqual(['a', 'b']);
    expect(updatePayloads.every(({ payload }) => !('status' in payload))).toBe(true);
    expect(insertedActivity.every((entry) => entry.xp_gained === 0)).toBe(true);
  });

  it('não para no meio quando uma missão falha', async () => {
    // "Dispensar todas" com uma missão problemática no meio: as outras duas
    // precisam ser dispensadas mesmo assim. Antes, o throw abortava o laço e a
    // terceira nunca era tentada.
    failUpdateFor = ['b'];

    await expect(
      dismissFailedMissions('user-1', [diaria('a'), diaria('b'), diaria('c')]),
    ).rejects.toThrow(/Missão b/);

    expect(updatedIds).toEqual(['a', 'c']);
  });

  it('diz quantas passaram quando a dispensa é parcial', async () => {
    failUpdateFor = ['b'];

    await expect(
      dismissFailedMissions('user-1', [diaria('a'), diaria('b')]),
    ).rejects.toThrow(/Dispensei 1/);
  });

  it('não anuncia dispensa quando o UPDATE retorna zero linhas', async () => {
    noRowFor = ['a'];
    await expect(dismissFailedMissions('user-1', diaria('a')))
      .rejects.toThrow(/Não consegui dispensar/);
    expect(insertedActivity).toEqual([]);
  });

  it('manda a semanal pela RPC e a diária pela tabela', async () => {
    const semanal = { id: 'w1', title: 'Treinar', frequency_type: 'weekly', failed_date: null };

    const r = await dismissFailedMissions('user-1', [semanal, diaria('d1')]);

    expect(r.dispensadas).toBe(2);
    expect(rpcSpy).toHaveBeenCalledWith('resolve_weekly_mission_failure', {
      p_mission_id: 'w1',
      p_resolution: 'dismissed',
    });
    // A semanal não passa pelo UPDATE direto na tabela.
    expect(updatedIds).toEqual(['d1']);
  });

  it('propaga a falha de uma semanal sem impedir as demais', async () => {
    rpcSpy.mockResolvedValueOnce({ data: null, error: { message: 'WEEK_LOCKED' } });
    const semanal = { id: 'w1', title: 'Treinar', frequency_type: 'weekly', failed_date: null };

    await expect(
      dismissFailedMissions('user-1', [semanal, diaria('d1')]),
    ).rejects.toThrow(/Treinar/);

    expect(updatedIds).toEqual(['d1']);
  });
});

describe('recuperar missão fracassada', () => {
  beforeEach(() => {
    rpcSpy.mockReset();
    rpcSpy.mockResolvedValue({ data: null, error: null });
    updatedIds = [];
    insertedActivity = [];
    updatePayloads = [];
    statusById = {};
    failUpdateFor = [];
    noRowFor = [];
  });

  function mountRecovery() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const ref: { current: ReturnType<typeof useMarkFailedAsDone> | null } = { current: null };
    function Harness() {
      ref.current = useMarkFailedAsDone();
      return null;
    }
    const root = createRoot(document.createElement('div'));
    mountedRoots.push(root);
    act(() => {
      root.render(createElement(QueryClientProvider, { client }, createElement(Harness)));
    });
    return ref;
  }

  it('declara pendente apenas no legado NULL e não paga XP', async () => {
    const hook = mountRecovery();
    await act(async () => { await hook.current!.mutateAsync(diaria('a')); });
    expect(updatePayloads[0].payload).toMatchObject({
      status: 'pendente', is_failed: false,
      daily_status: { '2026-08-20': 'completed' },
    });
    expect(updatePayloads[0].payload).not.toHaveProperty('xp_reward');
    expect(insertedActivity).toMatchObject([{ action: 'mission_failed_recovered', xp_gained: 0 }]);
  });

  it('não reabre status arquivado ou pausado', async () => {
    statusById = { a: 'arquivada', b: 'pausada' };
    const hook = mountRecovery();
    await act(async () => { await hook.current!.mutateAsync(diaria('a')); });
    await act(async () => { await hook.current!.mutateAsync(diaria('b')); });
    expect(updatePayloads.every(({ payload }) => !('status' in payload))).toBe(true);
    expect(insertedActivity.every((entry) => entry.xp_gained === 0)).toBe(true);
  });

  it('propaga erro ou zero linha do UPDATE sem registrar sucesso', async () => {
    failUpdateFor = ['a'];
    noRowFor = ['b'];
    const hook = mountRecovery();
    await act(async () => {
      await expect(hook.current!.mutateAsync(diaria('a'))).rejects.toMatchObject({ message: 'RLS' });
    });
    await act(async () => {
      await expect(hook.current!.mutateAsync(diaria('b'))).rejects.toThrow('MISSION_RESOLUTION_NOT_APPLIED');
    });
    expect(insertedActivity).toEqual([]);
  });
});
