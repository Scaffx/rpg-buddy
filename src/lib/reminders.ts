export type ReminderRecurrenceType = 'once' | 'weekly';

export type WeeklyReminderSchedule = {
  daysOfWeek: number[];
  startDate: string;
  endDate: string;
  time: string;
};

function parseDateParts(date: string): [number, number, number] | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function parseTimeParts(time: string): [number, number] | null {
  const match = /^(\d{2}):(\d{2})/.exec(time);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return [hour, minute];
}

function localDate(date: string, time = '00:00'): Date | null {
  const dateParts = parseDateParts(date);
  const timeParts = parseTimeParts(time);
  if (!dateParts || !timeParts) return null;

  const [year, month, day] = dateParts;
  const [hour, minute] = timeParts;
  const result = new Date(year, month - 1, day, hour, minute, 0, 0);

  if (
    result.getFullYear() !== year
    || result.getMonth() !== month - 1
    || result.getDate() !== day
  ) {
    return null;
  }

  return result;
}

function localDateString(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

export function findNextWeeklyReminderOccurrence(
  schedule: WeeklyReminderSchedule,
  after: Date = new Date(),
): Date | null {
  const start = localDate(schedule.startDate);
  const end = localDate(schedule.endDate, '23:59');
  const timeParts = parseTimeParts(schedule.time);
  const selectedDays = new Set(
    schedule.daysOfWeek.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
  );

  if (!start || !end || !timeParts || selectedDays.size === 0 || end < start) {
    return null;
  }

  const afterDay = localDate(localDateString(after));
  if (!afterDay) return null;
  const cursor = new Date(Math.max(start.getTime(), afterDay.getTime()));
  const [hour, minute] = timeParts;

  // The database allows a long end date, but a ten-year search guard prevents
  // malformed data from creating an unbounded client loop.
  for (let offset = 0; offset <= 3660 && cursor <= end; offset += 1) {
    if (selectedDays.has(cursor.getDay())) {
      const occurrence = new Date(
        cursor.getFullYear(),
        cursor.getMonth(),
        cursor.getDate(),
        hour,
        minute,
        0,
        0,
      );
      if (occurrence > after && occurrence <= end) return occurrence;
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return null;
}

export function getLocalTodayString(date: Date = new Date()): string {
  return localDateString(date);
}
