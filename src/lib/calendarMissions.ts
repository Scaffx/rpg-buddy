import { dayNamePt, toDateString } from '@/lib/dateUtils';
import { getSaoPauloDateString } from '@/lib/weeklyMissions';

export type CalendarMissionLike = {
  id: string;
  created_at?: string | null;
  daily_status?: unknown;
  days_of_week?: unknown;
  due_date?: string | null;
  frequency_type?: string | null;
};

export type CalendarCompletionLike = {
  mission_id: string;
  completion_date: string;
};

export type CalendarMissionDayState =
  | 'completed'
  | 'recovered'
  | 'new'
  | 'scheduled'
  | 'pending'
  | 'attention';

export type CalendarPerformanceTier = 'perfect' | 'on_track' | 'attention';

export type CalendarDayPerformance = {
  completed: number;
  percentage: number;
  scheduled: number;
  tier: CalendarPerformanceTier;
};

function missionCreatedDate(mission: CalendarMissionLike): string | null {
  if (!mission.created_at) return null;
  const createdAt = new Date(mission.created_at);
  return Number.isNaN(createdAt.getTime()) ? null : getSaoPauloDateString(createdAt);
}

function missionDays(mission: CalendarMissionLike): string[] {
  if (!Array.isArray(mission.days_of_week)) return [];
  return mission.days_of_week.filter((day): day is string => typeof day === 'string');
}

function dailyStatus(mission: CalendarMissionLike): Record<string, string> {
  if (!mission.daily_status || typeof mission.daily_status !== 'object' || Array.isArray(mission.daily_status)) {
    return {};
  }
  return mission.daily_status as Record<string, string>;
}

/**
 * A recurring mission only belongs to a calendar day when it had already been
 * created on that date and that weekday is part of its fixed schedule.
 */
export function isMissionScheduledForDate(mission: CalendarMissionLike, date: Date): boolean {
  if (mission.frequency_type === 'weekly' || mission.due_date) return false;

  const days = missionDays(mission).map((day) => day === 'Sab' ? 'Sáb' : day);
  if (days.length === 0 || !days.includes(dayNamePt(date))) return false;

  const createdDate = missionCreatedDate(mission);
  return Boolean(createdDate && toDateString(date) >= createdDate);
}

export function isMissionCompletedOnDate(
  mission: CalendarMissionLike,
  dateStr: string,
  completions: CalendarCompletionLike[],
): boolean {
  if (dailyStatus(mission)[dateStr] === 'completed') return true;
  return completions.some(
    (completion) => completion.mission_id === mission.id && completion.completion_date === dateStr,
  );
}

export function getCalendarMissionDayState(
  mission: CalendarMissionLike,
  date: Date,
  completions: CalendarCompletionLike[],
  todayStr: string,
): CalendarMissionDayState {
  const dateStr = toDateString(date);
  const status = dailyStatus(mission)[dateStr];

  if (isMissionCompletedOnDate(mission, dateStr, completions)) return 'completed';
  if (status === 'failed_accepted') return 'recovered';
  if (dateStr > todayStr) return 'scheduled';
  if (dateStr === todayStr && missionCreatedDate(mission) === todayStr) return 'new';
  if (dateStr === todayStr) return 'pending';
  return 'attention';
}

export function getCalendarDayPerformance(
  missions: CalendarMissionLike[],
  date: Date,
  completions: CalendarCompletionLike[],
  todayStr: string,
): CalendarDayPerformance | null {
  const dateStr = toDateString(date);
  if (dateStr > todayStr) return null;

  const scheduled = missions.filter((mission) => isMissionScheduledForDate(mission, date));
  if (scheduled.length === 0) return null;

  const completed = scheduled.filter((mission) =>
    isMissionCompletedOnDate(mission, dateStr, completions),
  ).length;
  const percentage = Math.round((completed / scheduled.length) * 100);

  return {
    completed,
    percentage,
    scheduled: scheduled.length,
    tier: percentage === 100 ? 'perfect' : percentage >= 60 ? 'on_track' : 'attention',
  };
}
