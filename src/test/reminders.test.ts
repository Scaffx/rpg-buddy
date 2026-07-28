import { describe, expect, it } from 'vitest';
import { findNextWeeklyReminderOccurrence } from '@/lib/reminders';

describe('recurring reminders', () => {
  it('finds the next selected weekday at the configured time', () => {
    const next = findNextWeeklyReminderOccurrence({
      daysOfWeek: [1, 3, 5],
      startDate: '2026-07-27',
      endDate: '2026-08-31',
      time: '07:30',
    }, new Date(2026, 6, 28, 8, 0));

    expect(next).toEqual(new Date(2026, 6, 29, 7, 30));
  });

  it('skips today when its configured time has already passed', () => {
    const next = findNextWeeklyReminderOccurrence({
      daysOfWeek: [2],
      startDate: '2026-07-28',
      endDate: '2026-08-31',
      time: '07:30',
    }, new Date(2026, 6, 28, 8, 0));

    expect(next).toEqual(new Date(2026, 7, 4, 7, 30));
  });

  it('uses today when its configured time is still ahead', () => {
    const next = findNextWeeklyReminderOccurrence({
      daysOfWeek: [2],
      startDate: '2026-07-28',
      endDate: '2026-07-28',
      time: '18:00',
    }, new Date(2026, 6, 28, 8, 0));

    expect(next).toEqual(new Date(2026, 6, 28, 18, 0));
  });

  it('returns null when no selected occurrence exists before the end date', () => {
    expect(findNextWeeklyReminderOccurrence({
      daysOfWeek: [1],
      startDate: '2026-07-28',
      endDate: '2026-07-30',
      time: '07:30',
    }, new Date(2026, 6, 28, 8, 0))).toBeNull();
  });

  it('rejects invalid schedules', () => {
    expect(findNextWeeklyReminderOccurrence({
      daysOfWeek: [],
      startDate: '2026-07-28',
      endDate: '2026-07-20',
      time: '25:00',
    })).toBeNull();
  });
});
