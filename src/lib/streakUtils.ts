// Utilities to compute the "60% daily mission" streak shown in the header.
// A day counts toward the streak when at least 60% of that day's required
// missions were completed (or protected). Days with no required missions
// are skipped, days in the future are ignored.

const DAYS_MAP = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const STREAK_THRESHOLD = 0.6;

export function getLocalDateString(date: Date = new Date()): string {
  return date.toLocaleDateString('en-CA');
}

function getDateDaysAgo(daysAgo: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d;
}

type StreakMission = {
  days_of_week?: string[] | null;
  daily_status?: Record<string, string> | null;
  created_at?: string | null;
  is_failed?: boolean | null;
  failed_date?: string | null;
  completed?: boolean | null;
  completed_at?: string | null;
};

function getMissionStateForDate(mission: StreakMission, dateStr: string): string | null {
  const dailyStatus = (mission.daily_status as Record<string, string>) || {};
  const state = dailyStatus[dateStr];
  if (state) return state;
  if (mission.is_failed && mission.failed_date === dateStr) return 'failed';
  if (mission.completed && String(mission.completed_at || '').startsWith(dateStr)) return 'completed';
  return null;
}

export function computeSixtyPercentStreak(missions: StreakMission[] | null | undefined): number {
  if (!missions || missions.length === 0) return 0;

  let streak = 0;
  for (let daysBack = 0; daysBack < 365; daysBack++) {
    const date = getDateDaysAgo(daysBack);
    const dateStr = getLocalDateString(date);
    const dayName = DAYS_MAP[date.getDay()];

    const requiredMissions = missions.filter((mission) => {
      const daysOfWeek: string[] = mission.days_of_week || [];
      if (!(daysOfWeek.length > 0 && daysOfWeek.includes(dayName))) return false;
      const createdAt = String(mission.created_at || '').slice(0, 10);
      if (createdAt && createdAt > dateStr) return false;
      return true;
    });

    if (requiredMissions.length === 0) continue;

    const completedCount = requiredMissions.filter((mission) => {
      const state = getMissionStateForDate(mission, dateStr);
      return state === 'completed' || state === 'protected';
    }).length;

    const ratio = completedCount / requiredMissions.length;

    if (daysBack === 0) {
      if (ratio >= STREAK_THRESHOLD) {
        streak += 1;
      }
      continue;
    }

    if (ratio >= STREAK_THRESHOLD) {
      streak += 1;
    } else {
      break;
    }
  }

  return streak;
}

export type TodayStreakStatus = {
  required: number;
  completed: number;
  failed: number;
  pending: number;
  thresholdCount: number;     // mínimo necessário para 60%
  missingForThreshold: number; // quantas faltam para 60% hoje
  ratio: number;               // 0..1
  atRisk: boolean;             // true quando ainda não atingiu 60% e os pendentes são exatamente o suficiente ou menos
  alreadyHit: boolean;         // já atingiu 60%
};

/**
 * Avalia o status do dia de hoje em relação à meta de 60% para a streak.
 */
export function evaluateTodayStreakRisk(missions: StreakMission[] | null | undefined): TodayStreakStatus {
  const today = new Date();
  const dateStr = getLocalDateString(today);
  const dayName = DAYS_MAP[today.getDay()];

  const requiredMissions = (missions || []).filter((mission) => {
    const daysOfWeek: string[] = mission.days_of_week || [];
    if (!(daysOfWeek.length > 0 && daysOfWeek.includes(dayName))) return false;
    const createdAt = String(mission.created_at || '').slice(0, 10);
    if (createdAt && createdAt > dateStr) return false;
    return true;
  });

  const required = requiredMissions.length;
  let completed = 0;
  let failed = 0;
  for (const m of requiredMissions) {
    const state = getMissionStateForDate(m, dateStr);
    if (state === 'completed' || state === 'protected') completed += 1;
    else if (state === 'failed' || state === 'failed_accepted') failed += 1;
  }
  const pending = Math.max(0, required - completed - failed);
  const thresholdCount = required > 0 ? Math.ceil(required * STREAK_THRESHOLD) : 0;
  const missingForThreshold = Math.max(0, thresholdCount - completed);
  const ratio = required > 0 ? completed / required : 0;
  const alreadyHit = required > 0 && ratio >= STREAK_THRESHOLD;
  // Em risco: ainda não bateu 60% e a quantidade pendente é apertada (≤ missing + 1)
  const atRisk = required > 0 && !alreadyHit && pending <= missingForThreshold + 1;

  return {
    required,
    completed,
    failed,
    pending,
    thresholdCount,
    missingForThreshold,
    ratio,
    atRisk,
    alreadyHit,
  };
}
