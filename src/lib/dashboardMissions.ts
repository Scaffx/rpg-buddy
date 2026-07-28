import {
  getWeeklyListBucket,
  isWeeklyMission,
  type WeeklyMissionLike,
} from '@/lib/weeklyMissions';

export type DashboardMissionLike = WeeklyMissionLike & {
  completed?: boolean | null;
  is_failed?: boolean | null;
  days_of_week?: string[] | null;
  daily_status?: Record<string, string> | null;
};

export function isMissionAvailableOnDashboardToday(
  mission: DashboardMissionLike,
  today: string,
  todayDay: string,
  now: Date = new Date(),
): boolean {
  if (mission.completed || mission.is_failed) return false;

  if (isWeeklyMission(mission)) {
    return getWeeklyListBucket(mission, now) === 'today';
  }

  const days = mission.days_of_week || [];
  if (!days.includes(todayDay)) return false;

  return mission.daily_status?.[today] !== 'completed';
}
