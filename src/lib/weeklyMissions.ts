export type MissionFrequencyType = 'daily' | 'weekly';

export type WeeklyMissionLike = {
  frequency_type?: MissionFrequencyType | null;
  target_count?: number | null;
  max_count?: number | null;
  weekly_current_count?: number | null;
  weekly_last_completed_date?: string | null;
};

export type WeeklyMissionState = {
  current: number;
  target: number;
  max: number;
  completedToday: boolean;
  capReached: boolean;
  targetReached: boolean;
  overflowAvailable: boolean;
  progressPercent: number;
};

export type WeeklyListBucket = 'today' | 'later';

const SAO_PAULO_TIME_ZONE = 'America/Sao_Paulo';

function datePartsInSaoPaulo(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SAO_PAULO_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);

  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
  };
}

function dateString(year: number, month: number, day: number): string {
  return [
    String(year).padStart(4, '0'),
    String(month).padStart(2, '0'),
    String(day).padStart(2, '0'),
  ].join('-');
}

export function getSaoPauloDateString(date: Date = new Date()): string {
  const { year, month, day } = datePartsInSaoPaulo(date);
  return dateString(year, month, day);
}

export function getSaoPauloWeekStart(date: Date = new Date()): string {
  const { year, month, day } = datePartsInSaoPaulo(date);
  const current = new Date(Date.UTC(year, month - 1, day));
  const isoDay = current.getUTCDay() === 0 ? 7 : current.getUTCDay();
  current.setUTCDate(current.getUTCDate() - (isoDay - 1));
  return dateString(
    current.getUTCFullYear(),
    current.getUTCMonth() + 1,
    current.getUTCDate(),
  );
}

export function isWeeklyMission(mission: WeeklyMissionLike): boolean {
  return mission.frequency_type === 'weekly';
}

export function getWeeklyMissionState(
  mission: WeeklyMissionLike,
  now: Date = new Date(),
): WeeklyMissionState | null {
  if (!isWeeklyMission(mission)) return null;

  const current = Math.max(0, Number(mission.weekly_current_count || 0));
  const target = Math.max(1, Number(mission.target_count || 1));
  // A meta escolhida também é o limite semanal. Atividades extras devem virar
  // uma missão única, ou o jogador pode editar a meta (4x -> 5x).
  const max = target;
  const completedToday =
    mission.weekly_last_completed_date === getSaoPauloDateString(now);
  const targetReached = current >= target;
  const capReached = targetReached;

  return {
    current,
    target,
    max,
    completedToday,
    capReached,
    targetReached,
    overflowAvailable: false,
    progressPercent: Math.min(100, (current / target) * 100),
  };
}

export function getWeeklyListBucket(
  mission: WeeklyMissionLike,
  now: Date = new Date(),
): WeeklyListBucket {
  const state = getWeeklyMissionState(mission, now);
  return state?.completedToday || state?.targetReached ? 'later' : 'today';
}

export function isWeeklyFocusCandidate(
  mission: WeeklyMissionLike,
  now: Date = new Date(),
): boolean {
  return isWeeklyMission(mission) && getWeeklyListBucket(mission, now) === 'today';
}

export type WeeklyFocusContext = {
  /** O dia em foco é ontem (marcação retroativa) em vez de hoje. */
  isBackfilling: boolean;
  /** Aquele dia específico já está em `daily_status` como concluído. */
  completedOnFocusDate: boolean;
  /**
   * O dia em foco caiu na semana anterior — só acontece com domingo, visto de
   * segunda. A cota que vale é a daquela semana, e o contador carregado aqui é
   * o da semana corrente; nesse caso quem barra por cota é o servidor.
   */
  focusDateInPreviousWeek: boolean;
};

/**
 * A semanal aceita registro no dia em foco?
 *
 * Perguntar só por hoje mandava a missão já marcada hoje para "Próximos dias"
 * mesmo na visão de ontem, e aí o dia esquecido não tinha como ser registrado —
 * que é exatamente o que a janela D-1 existe para destravar.
 */
export function isWeeklyRegistrableOnFocusDate(
  mission: WeeklyMissionLike,
  context: WeeklyFocusContext,
  now: Date = new Date(),
): boolean {
  if (!context.isBackfilling) return getWeeklyListBucket(mission, now) === 'today';
  if (context.completedOnFocusDate) return false;
  if (context.focusDateInPreviousWeek) return true;
  return !getWeeklyMissionState(mission, now)?.targetReached;
}

export type WeeklyMissionErrorCode =
  | 'ALREADY_COMPLETED_TODAY'
  | 'WEEKLY_CAP_REACHED'
  | 'INVALID_WEEKLY_CONFIGURATION'
  | 'DATE_OUT_OF_WINDOW'
  | null;

export function getWeeklyMissionErrorCode(error: unknown): WeeklyMissionErrorCode {
  const candidate = error as { message?: string; details?: string; hint?: string };
  const text = [
    candidate?.message,
    candidate?.details,
    candidate?.hint,
    String(error || ''),
  ].join(' ');

  if (text.includes('ALREADY_COMPLETED_TODAY')) return 'ALREADY_COMPLETED_TODAY';
  if (text.includes('WEEKLY_CAP_REACHED')) return 'WEEKLY_CAP_REACHED';
  if (text.includes('INVALID_WEEKLY_CONFIGURATION')) {
    return 'INVALID_WEEKLY_CONFIGURATION';
  }
  if (text.includes('DATE_OUT_OF_WINDOW')) return 'DATE_OUT_OF_WINDOW';
  return null;
}

export function getWeeklyMissionErrorMessage(code: WeeklyMissionErrorCode): string | null {
  if (code === 'ALREADY_COMPLETED_TODAY') {
    return 'Você já concluiu esta missão hoje. Volte amanhã para continuar.';
  }
  if (code === 'WEEKLY_CAP_REACHED') {
    return 'Você já atingiu a meta desta missão na semana. Aumente a meta ou crie uma missão única para registrar uma atividade extra.';
  }
  if (code === 'INVALID_WEEKLY_CONFIGURATION') {
    return 'Esta missão semanal está com uma configuração inválida.';
  }
  if (code === 'DATE_OUT_OF_WINDOW') {
    return 'Só dá para registrar hoje ou ontem. Se o dia já passou disso, ele fica como estava.';
  }
  return null;
}
