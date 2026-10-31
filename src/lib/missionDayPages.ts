import { getSaoPauloDateString } from '@/lib/weeklyMissions';

export type MissionDayDates = { today: string; yesterday: string };

export type MissionDayLike = {
  created_at?: string | null;
  weekly_started_at?: string | null;
  daily_status?: Record<string, string> | null;
  days_of_week?: string[] | null;
  due_date?: string | null;
  frequency_type?: string | null;
  completed?: boolean | null;
  status?: string | null;
  is_failed?: boolean | null;
};

const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function getMissionDayDates(now: Date = new Date()): MissionDayDates {
  const today = getSaoPauloDateString(now);
  const previous = new Date(`${today}T12:00:00Z`);
  previous.setUTCDate(previous.getUTCDate() - 1);
  return { today, yesterday: previous.toISOString().slice(0, 10) };
}

export function missionExistedOnDate(mission: MissionDayLike, date: string): boolean {
  if (!mission.created_at) return false;
  const created = new Date(mission.created_at);
  return !Number.isNaN(created.getTime()) && getSaoPauloDateString(created) <= date;
}

export function missionScheduledOnDate(mission: MissionDayLike, date: string): boolean {
  // Uma missão convertida para semanal só pode receber registro semanal a
  // partir da conversão. Conclusões antigas continuam visíveis no histórico.
  if (mission.frequency_type === 'weekly') {
    const start = mission.weekly_started_at || mission.created_at;
    if (!start) return false;
    const started = new Date(start);
    return !Number.isNaN(started.getTime()) && getSaoPauloDateString(started) <= date;
  }
  if (mission.due_date && !mission.days_of_week?.length) return mission.due_date === date;
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  return Boolean(mission.days_of_week?.some((day) => day === DAYS[weekday] || (weekday === 6 && day === 'Sab')));
}

export function missionCompletedOnDate(mission: MissionDayLike, date: string): boolean {
  if (mission.status === 'arquivada' || mission.is_failed) return false;
  if (mission.daily_status?.[date] === 'completed') return true;
  const isUnique = mission.frequency_type !== 'weekly'
    && !mission.days_of_week?.length
    && Boolean(mission.due_date);
  return isUnique && mission.completed === true && mission.due_date === date;
}
