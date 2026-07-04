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

// ── Âncoras de SAÚDE (refeição/água) ──────────────────────────────────────────
// Refeição e água NÃO são missões: são condições do "dia perfeito" cumpridas ao
// registrar no Perfil/Saúde (meal_log/water_log). Opt-in por usuário
// (profiles.health_anchors_enabled). Critério: "qualquer registro" no dia.

export type HealthAnchors = { meal: boolean; water: boolean };

/** "Qualquer registro" hoje: ≥1 refeição logada e água > 0 ml. */
export function computeHealthAnchors(mealCountToday: number, waterMlToday: number): HealthAnchors {
  return { meal: (mealCountToday || 0) >= 1, water: (waterMlToday || 0) > 0 };
}

/**
 * "Dia perfeito" = âncoras-missão + âncoras de saúde (se habilitadas). Devolve o
 * mesmo shape de AnchorStatusToday, então os consumidores (Dashboard, forrageio)
 * não mudam. Saúde habilitada acrescenta 'Refeição'/'Água' às pendências e ao gate.
 */
export function combinePerfectDay(
  mission: AnchorStatusToday,
  healthEnabled: boolean,
  health: HealthAnchors,
): AnchorStatusToday {
  const pendingTitles = [...mission.pendingTitles];
  if (healthEnabled && !health.meal)  pendingTitles.push('Refeição');
  if (healthEnabled && !health.water) pendingTitles.push('Água');

  const hasAnchors = mission.hasAnchors || healthEnabled;
  const missionsOk = !mission.hasAnchors || mission.allComplete;
  const healthOk   = !healthEnabled || (health.meal && health.water);

  return { hasAnchors, allComplete: hasAnchors && missionsOk && healthOk, pendingTitles };
}
