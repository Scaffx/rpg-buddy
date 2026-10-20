import { describe, it, expect, vi, beforeEach } from 'vitest';

// Spies/captadores compartilhados entre o mock e os asserts.
const rpcSpy = vi.fn().mockResolvedValue({ data: null, error: null });
const insertedTables: string[] = [];
const profileUpdates: any[] = [];
const missionUpdates: any[] = [];
const activityInserts: any[] = [];

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
  due_date?: string | null;
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
    update: (payload: any) => {
      if (table === 'profiles') profileUpdates.push(payload);
      if (table === 'missions') missionUpdates.push(payload);
      return builder;
    },
    insert: (payload: any) => {
      insertedTables.push(table);
      if (table === 'activity_log') activityInserts.push(payload);
      return builder;
    },
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
    missionUpdates.length = 0;
    activityInserts.length = 0;
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

// Data local no mesmo formato que o hook usa (en-CA = YYYY-MM-DD).
function dataLocal(diasAtras: number): string {
  const d = new Date();
  d.setDate(d.getDate() - diasAtras);
  return d.toLocaleDateString('en-CA');
}

describe('janela D-1: ontem ainda é registrável, então não é julgado (§1.3)', () => {
  beforeEach(() => {
    rpcSpy.mockClear();
    insertedTables.length = 0;
    profileUpdates.length = 0;
    missionUpdates.length = 0;
    activityInserts.length = 0;
    missionRows = [failingMission];
  });

  it('a varredura recorrente para em anteontem e nunca escreve a data de ontem', async () => {
    const ontem = dataLocal(1);
    const anteontem = dataLocal(2);
    const queryClient: any = { invalidateQueries: vi.fn() };

    await runFailedMissionCheck('user-1', queryClient);

    const diasEscritos = missionUpdates.flatMap((u) => Object.keys(u?.daily_status || {}));
    // Anteontem já saiu da janela: é julgado (prova que a varredura rodou até a fronteira).
    expect(diasEscritos).toContain(anteontem);
    // Ontem, não. Nem no daily_status, nem em failed_date, nem no log.
    expect(diasEscritos).not.toContain(ontem);
    expect(missionUpdates.some((u) => u?.failed_date === ontem)).toBe(false);
    expect(activityInserts.some((a) => String(a?.description || '').includes(ontem))).toBe(false);
  });

  it('missão avulsa vencida ontem não é julgada — segue registrável em "Ontem"', async () => {
    missionRows = [{
      ...failingMission,
      id: 'avulsa-ontem',
      title: 'Pagar boleto',
      days_of_week: [],
      due_date: dataLocal(1),
    }];

    const queryClient: any = { invalidateQueries: vi.fn() };
    await runFailedMissionCheck('user-1', queryClient);

    // Julgar ontem custaria protetor OU streak — nenhum dos dois pode acontecer.
    expect(missionUpdates).toEqual([]);
    expect(activityInserts.some((a) => a?.action === 'streak_protected')).toBe(false);
    expect(profileUpdates.some((u) => u?.streak_current_days === 0)).toBe(false);
  });
});

describe('avulsa dispensada/recuperada não volta a falhar na próxima varredura', () => {
  beforeEach(() => {
    rpcSpy.mockClear();
    insertedTables.length = 0;
    profileUpdates.length = 0;
    missionUpdates.length = 0;
    activityInserts.length = 0;
    missionRows = [failingMission];
  });

  const avulsaVencida = (status: string) => {
    const vencimento = dataLocal(5);
    return [{
      ...failingMission,
      id: 'avulsa',
      title: 'Pagar boleto',
      days_of_week: [],
      due_date: vencimento,
      daily_status: { [vencimento]: status },
    }];
  };

  it('dispensada (failed_accepted) não é re-julgada', async () => {
    missionRows = avulsaVencida('failed_accepted');

    const queryClient: any = { invalidateQueries: vi.fn() };
    await runFailedMissionCheck('user-1', queryClient);

    // Nenhum write na missão = o "Dispensar" grudou: o card não volta, o
    // protetor não queima de novo e a sequência não zera de novo.
    expect(missionUpdates).toEqual([]);
    expect(activityInserts.some((a) => a?.action === 'streak_protected')).toBe(false);
    expect(profileUpdates.some((u) => u?.streak_current_days === 0)).toBe(false);
  });

  it('recuperada ("Fiz" grava completed) não é re-julgada', async () => {
    missionRows = avulsaVencida('completed');

    const queryClient: any = { invalidateQueries: vi.fn() };
    await runFailedMissionCheck('user-1', queryClient);

    expect(missionUpdates).toEqual([]);
    expect(activityInserts.some((a) => a?.action === 'streak_protected')).toBe(false);
    expect(profileUpdates.some((u) => u?.streak_current_days === 0)).toBe(false);
  });

  it('protegida não queima uma segunda carga de protetor', async () => {
    missionRows = avulsaVencida('protected');

    const queryClient: any = { invalidateQueries: vi.fn() };
    await runFailedMissionCheck('user-1', queryClient);

    expect(missionUpdates).toEqual([]);
    expect(activityInserts.some((a) => a?.action === 'streak_protected')).toBe(false);
  });
});
