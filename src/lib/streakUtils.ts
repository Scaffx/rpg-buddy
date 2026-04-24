// Utilities to compute the "60% daily mission" streak shown in the header.
// A day counts toward the streak when at least 60% of that day's required
// missions were completed (or protected). Days with no required missions
// are skipped, days in the future are ignored.

const DAYS_MAP = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

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

    // Today is "in progress": only break the streak if the day is over and ratio < 60%.
    // For simplicity we count today only if it already meets 60%.
    if (daysBack === 0) {
      if (ratio >= 0.6) {
        streak += 1;
      }
      continue;
    }

    if (ratio >= 0.6) {
      streak += 1;
    } else {
      break;
    }
  }

  return streak;
}
