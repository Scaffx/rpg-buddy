import { describe, expect, it } from 'vitest';
import {
  getCalendarDayPerformance,
  getCalendarMissionDayState,
  isMissionScheduledForDate,
  type CalendarMissionLike,
} from '@/lib/calendarMissions';

const monday = new Date(2026, 6, 27, 12);
const sunday = new Date(2026, 6, 26, 12);

function mission(overrides: Partial<CalendarMissionLike> = {}): CalendarMissionLike {
  return {
    id: 'mission-1',
    created_at: '2026-07-27T12:00:00-03:00',
    daily_status: {},
    days_of_week: ['Seg'],
    frequency_type: 'daily',
    ...overrides,
  };
}

describe('calendar mission history', () => {
  it('does not project a newly created mission into earlier dates', () => {
    expect(isMissionScheduledForDate(mission({ days_of_week: ['Dom'] }), sunday)).toBe(false);
    expect(isMissionScheduledForDate(mission(), monday)).toBe(true);
  });

  it('excludes flexible weekly and one-shot missions from fixed daily history', () => {
    expect(isMissionScheduledForDate(mission({ frequency_type: 'weekly', days_of_week: [] }), monday)).toBe(false);
    expect(isMissionScheduledForDate(mission({ days_of_week: [] }), monday)).toBe(false);
    expect(isMissionScheduledForDate(mission({ due_date: '2026-07-27' }), monday)).toBe(false);
  });

  it('uses the São Paulo creation date and accepts both Saturday spellings', () => {
    const saturday = new Date(2026, 6, 25, 12);
    const createdLateUtc = mission({
      created_at: '2026-07-28T01:30:00Z',
      days_of_week: ['Seg'],
    });

    expect(isMissionScheduledForDate(createdLateUtc, monday)).toBe(true);
    expect(isMissionScheduledForDate(mission({
      created_at: '2026-07-27T02:30:00Z',
      days_of_week: ['Dom'],
    }), sunday)).toBe(true);
    expect(isMissionScheduledForDate(mission({
      created_at: '2026-07-25T12:00:00-03:00',
      days_of_week: ['Sab'],
    }), saturday)).toBe(true);
    expect(isMissionScheduledForDate(mission({ created_at: 'invalid' }), monday)).toBe(false);
  });

  it('marks a mission created today as new until it is completed', () => {
    expect(getCalendarMissionDayState(mission(), monday, [], '2026-07-27')).toBe('new');
    expect(getCalendarMissionDayState(
      mission(),
      monday,
      [{ mission_id: 'mission-1', completion_date: '2026-07-27' }],
      '2026-07-27',
    )).toBe('completed');
  });

  it('uses green for 100%, amber from 60%, and red below 60%', () => {
    const missions = Array.from({ length: 5 }, (_, index) => mission({ id: `mission-${index}` }));
    const completions = missions.slice(0, 3).map((item) => ({
      mission_id: item.id,
      completion_date: '2026-07-27',
    }));

    expect(getCalendarDayPerformance(missions, monday, completions, '2026-07-27')?.tier).toBe('on_track');
    expect(getCalendarDayPerformance(missions, monday, completions.slice(0, 2), '2026-07-27')?.tier).toBe('attention');
    expect(getCalendarDayPerformance(missions, monday, missions.map((item) => ({
      mission_id: item.id,
      completion_date: '2026-07-27',
    })), '2026-07-27')?.tier).toBe('perfect');
  });
});
