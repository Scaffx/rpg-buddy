import { describe, it, expect, vi, beforeEach } from 'vitest';

// Spies/captadores compartilhados entre o mock e os asserts.
const rpcSpy = vi.fn().mockResolvedValue({ data: null, error: null });
const insertedTables: string[] = [];
const profileUpdates: any[] = [];

// Missão recorrente (todos os dias) com falhas acumuladas → força o caminho de
// falha real (graça + protetor esgotados) ao longo de 30 dias.
const failingMission = {
  id: 'm1',
  title: 'Treinar',
  days_of_week: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'],
  created_at: '2020-01-01T00:00:00.000Z',
  daily_status: {},
  xp_reward: 10,
  is_failed: false,
  priority: 'media',
};
type MissionRow = typeof failingMission & {
  frequency_type?: 'daily' | 'weekly';
};
let missionRows: MissionRow[] = [failingMission];

function resolveData(table: string) {
  switch (table) {
    case 'missions':
      return { data: missionRows, error: null };
    case 'profiles':
      // protetor: 0 cargas (na maioria dos dias cai no caminho de falha)
      return { data: { streak_protector_charges: 0, streak_protector_max: 3, streak_protector_week: 'x' }, error: null };
    case 'mission_daily_completions':
      return { data: [], error: null }; // nunca concluída → falha
    default:
      return { data: [], error: null };
  }
}

function makeBuilder(table: string) {
  const result = resolveData(table);
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    gte: () => builder,
    lt: () => builder,
    order: () => builder,
    limit: () => builder,
    maybeSingle: () => Promise.resolve(result),
    single: () => Promise.resolve(result),
    then: (resolve: any) => resolve(result), // torna o builder "awaitável"
    update: (payload: any) => { if (table === 'profiles') profileUpdates.push(payload); return builder; },
    insert: () => { insertedTables.push(table); return builder; },
    upsert: () => builder,
  };
  return builder;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => makeBuilder(table),
    rpc: (...args: any[]) => rpcSpy(...args),
  },
}));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { warning: vi.fn(), error: vi.fn(), success: vi.fn() }) }));

import { runFailedMissionCheck } from '@/hooks/useFailedMissions';

describe('falha de missão NÃO drena XP/HP/MP (§4/§5 + torneira única #22)', () => {
  beforeEach(() => {
    rpcSpy.mockClear();
    insertedTables.length = 0;
    profileUpdates.length = 0;
    missionRows = [failingMission];
  });

  it('roda o check de falhas sem mover nenhum recurso', async () => {
    const queryClient: any = { invalidateQueries: vi.fn() };
    await runFailedMissionCheck('user-1', queryClient);

    // 1) Nenhuma RPC que mexe em XP/ouro é chamada no fluxo de falha.
    const rpcNames = rpcSpy.mock.calls.map((c) => c[0]);
    expect(rpcNames).toContain('check_weekly_mission_failures');
    expect(rpcNames).not.toContain('apply_xp_penalty');
    expect(rpcNames).not.toContain('add_xp_to_user');
    expect(rpcNames).not.toContain('pay_mission_penalty');

    // 2) Não grava transação de XP negativa.
    expect(insertedTables).not.toContain('xp_transactions');

    // 3) A sequência É reiniciada (consequência mantida)...
    const resetStreak = profileUpdates.some((u) => u && u.streak_current_days === 0);
    expect(resetStreak).toBe(true);

    // 4) ...mas nenhum update de profile toca XP/HP/MP.
    const touchedResource = profileUpdates.some(
      (u) => u && ('total_xp' in u || 'current_hp' in u || 'current_mp' in u || 'xp_penalized' in u),
    );
    expect(touchedResource).toBe(false);
  });

  it('nunca transforma missão flexível em falha diária, mesmo com dias legados', async () => {
    missionRows = [{
      ...failingMission,
      id: 'weekly-legacy',
      frequency_type: 'weekly',
    }];

    const queryClient: any = { invalidateQueries: vi.fn() };
    await runFailedMissionCheck('user-1', queryClient);

    expect(
      profileUpdates.some((update) => update?.streak_current_days === 0),
    ).toBe(false);
  });
});
