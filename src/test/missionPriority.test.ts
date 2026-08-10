import { describe, expect, it } from 'vitest';
import {
  countHighPriorityByDay,
  findHighPriorityOverflow,
  groupByPriority,
  missionScheduledDays,
  normalizePriority,
} from '@/lib/missionPriority';
import { getMissionBaseXp, MAX_HIGH_PRIORITY_PER_DAY } from '@/lib/constants';

const alta = (id: string, days: string[]) => ({ id, priority: 'alta', days_of_week: days });

describe('getMissionBaseXp', () => {
  it('escala o XP base pela prioridade', () => {
    expect(getMissionBaseXp(25, 'baixa')).toBe(18);
    expect(getMissionBaseXp(25, 'media')).toBe(25);
    expect(getMissionBaseXp(25, 'alta')).toBe(38);
  });

  it('trata prioridade ausente ou desconhecida como média', () => {
    expect(getMissionBaseXp(25, null)).toBe(25);
    expect(getMissionBaseXp(25, 'urgentissima')).toBe(25);
  });

  it('não inventa XP em missão sem recompensa', () => {
    expect(getMissionBaseXp(0, 'alta')).toBe(0);
    expect(getMissionBaseXp(null, 'alta')).toBe(0);
  });
});

describe('normalizePriority', () => {
  it('aceita variação de caixa e cai em média no resto', () => {
    expect(normalizePriority('ALTA')).toBe('alta');
    expect(normalizePriority('Baixa')).toBe('baixa');
    expect(normalizePriority(undefined)).toBe('media');
  });
});

describe('missionScheduledDays', () => {
  it('usa os dias agendados da recorrente diária', () => {
    expect(missionScheduledDays({ days_of_week: ['Seg', 'Qua'] })).toEqual(['Seg', 'Qua']);
  });

  it('ocupa todos os dias quando é semanal flexível', () => {
    // A semanal fica disponível no Painel todo dia até bater a meta, então
    // consome vaga de prioridade em todos eles.
    expect(missionScheduledDays({ frequency_type: 'weekly', days_of_week: [] })).toHaveLength(7);
  });

  it('mapeia missão única para o dia da semana do vencimento', () => {
    // 2026-08-10 é uma segunda-feira.
    expect(missionScheduledDays({ days_of_week: [], due_date: '2026-08-10' })).toEqual(['Seg']);
  });

  it('não agenda nada quando não há dia nem data', () => {
    expect(missionScheduledDays({ days_of_week: [] })).toEqual([]);
  });
});

describe('countHighPriorityByDay', () => {
  it('conta só as altas ativas', () => {
    const counts = countHighPriorityByDay([
      alta('a', ['Seg', 'Qua']),
      alta('b', ['Seg']),
      { id: 'c', priority: 'media', days_of_week: ['Seg'] },
      { id: 'd', priority: 'alta', days_of_week: ['Seg'], completed: true },
      { id: 'e', priority: 'alta', days_of_week: ['Seg'], is_archived: true },
    ]);

    expect(counts.seg).toBe(2);
    expect(counts.qua).toBe(1);
  });

  it('trata Sab e Sáb como o mesmo dia', () => {
    const counts = countHighPriorityByDay([alta('a', ['Sáb']), alta('b', ['Sab'])]);
    expect(counts.sab).toBe(2);
  });

  it('ignora a própria missão durante edição', () => {
    const counts = countHighPriorityByDay([alta('a', ['Seg']), alta('b', ['Seg'])], 'a');
    expect(counts.seg).toBe(1);
  });
});

describe('findHighPriorityOverflow', () => {
  const cheio = ['a', 'b', 'c', 'd'].map((id) => alta(id, ['Seg']));

  it('libera enquanto o dia está dentro do teto', () => {
    const tresAltas = cheio.slice(0, 3);
    expect(
      findHighPriorityOverflow(tresAltas, { priority: 'alta', days: ['Seg'] }),
    ).toBeNull();
  });

  it('barra a missão que estouraria o teto do dia', () => {
    const overflow = findHighPriorityOverflow(cheio, { priority: 'alta', days: ['Seg'] });
    expect(overflow).toEqual({ day: 'Seg', count: MAX_HIGH_PRIORITY_PER_DAY });
  });

  it('deixa passar prioridade média mesmo com o dia lotado de altas', () => {
    expect(findHighPriorityOverflow(cheio, { priority: 'media', days: ['Seg'] })).toBeNull();
  });

  it('permite espalhar mais de 4 altas pela semana em dias diferentes', () => {
    const espalhadas = [
      alta('a', ['Seg']), alta('b', ['Ter']), alta('c', ['Qua']),
      alta('d', ['Qui']), alta('e', ['Sex']),
    ];
    expect(findHighPriorityOverflow(espalhadas, { priority: 'alta', days: ['Sáb'] })).toBeNull();
  });

  it('barra pelo dia que estourou, não pelo primeiro da lista', () => {
    const overflow = findHighPriorityOverflow(cheio, { priority: 'alta', days: ['Ter', 'Seg'] });
    expect(overflow?.day).toBe('Seg');
  });

  it('não conta a própria missão ao reeditar uma alta já existente', () => {
    // Editar o horário da 4ª alta da segunda não pode ser bloqueado por ela mesma.
    expect(
      findHighPriorityOverflow(cheio, { id: 'd', priority: 'alta', days: ['Seg'] }),
    ).toBeNull();
  });

  it('preserva missões legadas acima do teto, só impede criar mais', () => {
    const legado = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => alta(id, ['Seg']));
    expect(findHighPriorityOverflow(legado, { priority: 'alta', days: ['Seg'] })).not.toBeNull();
    // A missão legada em si continua editável.
    expect(
      findHighPriorityOverflow(legado, { id: 'f', priority: 'alta', days: ['Seg'] }),
    ).not.toBeNull();
    expect(findHighPriorityOverflow(legado, { id: 'f', priority: 'media', days: ['Seg'] })).toBeNull();
  });
});

describe('groupByPriority', () => {
  it('separa em alta, média e baixa nessa ordem', () => {
    const groups = groupByPriority([
      { id: '1', priority: 'baixa' },
      { id: '2', priority: 'alta' },
      { id: '3', priority: 'media' },
      { id: '4', priority: 'alta' },
    ]);

    expect(groups.map((g) => g.priority)).toEqual(['alta', 'media', 'baixa']);
    expect(groups[0].missions.map((m) => m.id)).toEqual(['2', '4']);
  });

  it('omite grupos vazios em vez de renderizar cabeçalho solto', () => {
    const groups = groupByPriority([{ id: '1', priority: 'alta' }]);
    expect(groups).toHaveLength(1);
    expect(groups[0].priority).toBe('alta');
  });

  it('joga missão sem prioridade no grupo média', () => {
    const groups = groupByPriority([{ id: '1' }]);
    expect(groups[0].priority).toBe('media');
  });
});
