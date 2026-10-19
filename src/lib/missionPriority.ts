import { MAX_HIGH_PRIORITY_PER_DAY, MAX_MEDIUM_PRIORITY_PER_DAY } from '@/lib/constants';
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
  daily_status?: Record<string, string> | null;
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

function isUnique(mission: MissionLike): boolean {
  return mission.frequency_type !== 'weekly'
    && !(mission.days_of_week || []).length
    && Boolean(mission.due_date);
}

function paidOn(mission: MissionLike, date: string): boolean {
  return mission.daily_status?.[date] === 'completed'
    || (isUnique(mission) && mission.completed && mission.due_date === date);
}

function dayForDate(date: string): string | null {
  const parsed = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : normalizeDay(DAYS_MAP[parsed.getDay()]);
}

/** Contagem para a data exata; únicas em outras semanas não ocupam esta vaga. */
export function countPriorityOnDate(missions: MissionLike[], priority: PriorityKey, date: string, ignoreMissionId?: string): number {
  const weekday = dayForDate(date);
  if (!weekday) return 0;
  return (missions || []).filter((mission) => {
    if (mission.id === ignoreMissionId || normalizePriority(mission.priority) !== priority) return false;
    if (paidOn(mission, date)) return true;
    if (!isActive(mission)) return false;
    if (isUnique(mission)) return mission.due_date === date;
    return missionScheduledDays(mission).some((day) => normalizeDay(day) === weekday);
  }).length;
}

export type PriorityOverflow = { day: string; date?: string; count: number; priority: 'alta' | 'media'; max: number };

/** Pré-validação; o gatilho SQL é a autoridade para concorrência/API direta. */
export function findPriorityOverflow(
  missions: MissionLike[],
  candidate: { id?: string; priority: string; days_of_week?: string[]; frequency_type?: string; due_date?: string | null },
  today?: string,
): PriorityOverflow | null {
  const priority = normalizePriority(candidate.priority);
  if (priority === 'baixa') return null;
  const max = priority === 'alta' ? MAX_HIGH_PRIORITY_PER_DAY : MAX_MEDIUM_PRIORITY_PER_DAY;
  const candidateMission: MissionLike = candidate;
  const dates = new Set<string>();
  if (isUnique(candidateMission)) dates.add(candidate.due_date!);
  else {
    for (const mission of missions || []) {
      if (mission.due_date && isUnique(mission) && (!today || mission.due_date >= today)) dates.add(mission.due_date);
      for (const date of Object.keys(mission.daily_status || {})) {
        if ((!today || date >= today) && paidOn(mission, date)) dates.add(date);
      }
    }
    if (today) dates.add(today);
  }
  for (const date of [...dates].sort()) {
    const weekday = dayForDate(date);
    if (!weekday || !missionScheduledDays(candidateMission).some((day) => normalizeDay(day) === weekday)) continue;
    const count = countPriorityOnDate(missions, priority, date, candidate.id);
    if (count >= max) return { day: DAYS_MAP.find((day) => normalizeDay(day) === weekday) || weekday, date, count, priority, max };
  }
  if (isUnique(candidateMission)) return null;
  for (const day of missionScheduledDays(candidateMission)) {
    const key = normalizeDay(day);
    const count = (missions || []).filter((mission) =>
      mission.id !== candidate.id && isActive(mission) && !isUnique(mission)
      && normalizePriority(mission.priority) === priority
      && missionScheduledDays(mission).some((scheduled) => normalizeDay(scheduled) === key),
    ).length;
    if (count >= max) return { day, count, priority, max };
  }
  return null;
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
