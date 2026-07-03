// "Âncoras do Dia" (refs PR #22/#33): hábitos vitais marcados como missão-âncora.
// Desenho de INCENTIVO — âncora incompleta só NÃO destrava bônus; nunca drena nada.
// Espelho client-side do helper SQL _anchor_status_today (fonte autoritativa é o servidor).

export type AnchorMissionLike = {
  title?: string | null;
  is_anchor?: boolean | null;
  is_failed?: boolean | null;
  completed?: boolean | null;
  due_date?: string | null;
  days_of_week?: string[] | null;
  daily_status?: Record<string, string> | null;
};

export type AnchorStatusToday = {
  /** Existe pelo menos uma âncora agendada pra hoje? */
  hasAnchors: boolean;
  /** Todas as âncoras de hoje estão completas? (false se não há âncoras) */
  allComplete: boolean;
  /** Títulos das âncoras de hoje ainda pendentes (pra copy da UI). */
  pendingTitles: string[];
};

/** 'Sáb' e 'Sab' são equivalentes (mesma classe do bug de acento do matchup). */
function dayMatches(days: string[] | null | undefined, todayDayName: string): boolean {
  if (!days || days.length === 0) return false;
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const target = norm(todayDayName);
  return days.some((d) => norm(String(d)) === target);
}

export function computeAnchorStatusToday(
  missions: AnchorMissionLike[] | null | undefined,
  todayStr: string,
  todayDayName: string,
): AnchorStatusToday {
  const anchorsToday = (missions || []).filter((m) => {
    if (!m?.is_anchor || m?.is_failed) return false;
    const days = (m.days_of_week as string[]) || [];
    if (days.length > 0) return dayMatches(days, todayDayName);
    return m.due_date === todayStr; // âncora one-shot com prazo hoje
  });

  if (anchorsToday.length === 0) {
    return { hasAnchors: false, allComplete: false, pendingTitles: [] };
  }

  const isDone = (m: AnchorMissionLike) => {
    const days = (m.days_of_week as string[]) || [];
    if (days.length > 0) {
      return ((m.daily_status || {}) as Record<string, string>)[todayStr] === 'completed';
    }
    return Boolean(m.completed);
  };

  const pending = anchorsToday.filter((m) => !isDone(m));
  return {
    hasAnchors: true,
    allComplete: pending.length === 0,
    pendingTitles: pending.map((m) => String(m.title || 'Âncora')),
  };
}
