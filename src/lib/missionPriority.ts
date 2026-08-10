import { MAX_HIGH_PRIORITY_PER_DAY } from '@/lib/constants';
import { DAYS_MAP } from '@/lib/streakUtils';

export type PriorityKey = 'alta' | 'media' | 'baixa';

export const PRIORITY_ORDER: PriorityKey[] = ['alta', 'media', 'baixa'];

/** Peso pra ordenação: alta primeiro. */
export const PRIORITY_RANK: Record<string, number> = {
  alta: 0,
  media: 1,
  baixa: 2,
};

/** Missão sem prioridade (legado, NPC, seed antigo) é tratada como média. */
export function normalizePriority(value: unknown): PriorityKey {
  const key = String(value ?? '').toLowerCase();
  return key === 'alta' || key === 'baixa' ? key : 'media';
}

/** 'Sab' e 'Sáb' convivem no banco desde os primeiros presets. */
function normalizeDay(day: unknown): string {
  const key = String(day ?? '').toLowerCase();
  return key === 'sáb' ? 'sab' : key;
}

type MissionLike = {
  id?: string;
  priority?: string | null;
  days_of_week?: string[] | null;
  frequency_type?: string | null;
  due_date?: string | null;
  completed?: boolean | null;
  is_archived?: boolean | null;
  status?: string | null;
};

/**
 * Dias da semana em que a missão pode aparecer no Painel.
 *
 * - Recorrente diária: os dias agendados.
 * - Semanal flexível: qualquer dia, porque ela fica disponível até bater a meta.
 * - Única: o dia da semana da data marcada.
 */
export function missionScheduledDays(mission: MissionLike): string[] {
  if (mission.frequency_type === 'weekly') {
    return [...DAYS_MAP];
  }

  const days = (mission.days_of_week || []).filter(Boolean);
  if (days.length > 0) {
    return days as string[];
  }

  if (mission.due_date) {
    const date = new Date(`${mission.due_date}T00:00:00`);
    if (!Number.isNaN(date.getTime())) {
      return [DAYS_MAP[date.getDay()]];
    }
  }

  return [];
}

/** Uma missão só ocupa vaga se ainda está viva na rotina. */
function isActive(mission: MissionLike): boolean {
  return !mission.completed && !mission.is_archived && mission.status !== 'arquivada';
}

/**
 * Quantas missões ALTA já estão agendadas em cada dia da semana.
 * `ignoreMissionId` tira a própria missão da conta durante uma edição.
 */
export function countHighPriorityByDay(
  missions: MissionLike[],
  ignoreMissionId?: string,
): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const mission of missions || []) {
    if (ignoreMissionId && mission.id === ignoreMissionId) continue;
    if (!isActive(mission)) continue;
    if (normalizePriority(mission.priority) !== 'alta') continue;

    for (const day of missionScheduledDays(mission)) {
      const key = normalizeDay(day);
      counts[key] = (counts[key] || 0) + 1;
    }
  }

  return counts;
}

/**
 * Valida o teto de altas por dia antes de salvar.
 *
 * O teto é o que dá sentido à prioridade: se cabe alta ilimitada, em duas
 * semanas tudo é alta e a divisão do Painel vira uma lista corrida vermelha.
 * Só barra a missão sendo salva — missões legadas acima do teto continuam
 * valendo, elas só não deixam criar mais.
 */
export function findHighPriorityOverflow(
  missions: MissionLike[],
  candidate: { id?: string; priority: string; days: string[] },
): { day: string; count: number } | null {
  if (normalizePriority(candidate.priority) !== 'alta') return null;

  const counts = countHighPriorityByDay(missions, candidate.id);

  for (const day of candidate.days) {
    const current = counts[normalizeDay(day)] || 0;
    if (current + 1 > MAX_HIGH_PRIORITY_PER_DAY) {
      return { day, count: current };
    }
  }

  return null;
}

/** Quebra a lista em alta/média/baixa preservando a ordem recebida. */
export function groupByPriority<T extends MissionLike>(
  missions: T[],
): Array<{ priority: PriorityKey; missions: T[] }> {
  return PRIORITY_ORDER.map((priority) => ({
    priority,
    missions: (missions || []).filter(
      (mission) => normalizePriority(mission.priority) === priority,
    ),
  })).filter((group) => group.missions.length > 0);
}
