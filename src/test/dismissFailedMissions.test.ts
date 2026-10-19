import { describe, it, expect, vi, beforeEach } from 'vitest';

// Estado observável do mock, por teste.
const rpcSpy = vi.fn();
let updatedIds: string[] = [];
let insertedActivity: any[] = [];
/** ids cujo UPDATE deve devolver erro, para simular falha parcial. */
let failUpdateFor: string[] = [];

function makeBuilder(table: string) {
  // A cadeia real é `.update(payload).eq('id', x)` — o filtro chega DEPOIS do
  // update, então o id só é conhecido quando a promise é resolvida.
  let currentId = '';
  let pendingUpdate = false;

  const resolver = () => {
    if (pendingUpdate && table === 'missions') {
      if (failUpdateFor.includes(currentId)) {
        return { data: null, error: { message: 'RLS' } };
      }
      updatedIds.push(currentId);
    }
    return { data: null, error: null };
  };

  const builder: any = {
    select: () => builder,
    eq: (_col: string, val: string) => {
      currentId = val;
      return builder;
    },
    single: () => Promise.resolve({ data: { daily_status: {} }, error: null }),
    update: () => {
      pendingUpdate = true;
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

import { dismissFailedMissions } from '@/hooks/useFailedMissions';

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
    failUpdateFor = [];
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
