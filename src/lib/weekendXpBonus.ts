export const WEEKEND_XP_BONUS = 0.25;

type WeekendMissionLike = {
  frequency_type?: string | null;
  days_of_week?: unknown;
};

export function hasWeekendXpSchedule(mission: WeekendMissionLike): boolean {
  if (mission.frequency_type === 'weekly') return false;
  if (!Array.isArray(mission.days_of_week)) return false;

  return mission.days_of_week.some(
    (day) => day === 'Sáb' || day === 'Sab' || day === 'Dom',
  );
}

export function isWeekendDate(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}
