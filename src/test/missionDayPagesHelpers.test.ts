import { describe, expect, it } from 'vitest';
import {
  getMissionDayDates,
  missionCompletedOnDate,
  missionExistedOnDate,
  missionScheduledOnDate,
} from '@/lib/missionDayPages';

describe('mission day pages', () => {
  it('uses the São Paulo calendar across UTC midnight and month boundaries', () => {
    expect(getMissionDayDates(new Date('2026-11-01T02:59:00Z'))).toEqual({
      today: '2026-10-31', yesterday: '2026-10-30',
    });
    expect(getMissionDayDates(new Date('2026-11-01T03:00:00Z'))).toEqual({
      today: '2026-11-01', yesterday: '2026-10-31',
    });
  });

  it('requires the mission to have existed in São Paulo on the selected day', () => {
    expect(missionExistedOnDate({ created_at: '2026-10-29T02:00:00Z' }, '2026-10-28')).toBe(true);
    expect(missionExistedOnDate({ created_at: '2026-10-29T03:00:00Z' }, '2026-10-28')).toBe(false);
    expect(missionExistedOnDate({}, '2026-10-28')).toBe(false);
  });

  it('does not offer a weekly execution before the mission became weekly', () => {
    const mission = {
      created_at: '2026-10-20T12:00:00Z',
      weekly_started_at: '2026-10-26T03:00:00Z',
      frequency_type: 'weekly',
    };
    expect(missionExistedOnDate(mission, '2026-10-25')).toBe(true);
    expect(missionScheduledOnDate(mission, '2026-10-25')).toBe(false);
    expect(missionScheduledOnDate(mission, '2026-10-26')).toBe(true);
  });

  it('uses the selected date for recurring and unique schedules', () => {
    expect(missionScheduledOnDate({ days_of_week: ['Dom'] }, '2026-10-25')).toBe(true);
    expect(missionScheduledOnDate({ days_of_week: ['Dom'] }, '2026-10-26')).toBe(false);
    expect(missionScheduledOnDate({ due_date: '2026-10-25' }, '2026-10-26')).toBe(false);
    expect(missionScheduledOnDate({ frequency_type: 'weekly', created_at: '2026-10-20T12:00:00Z' }, '2026-10-25')).toBe(true);
  });

  it('does not leak a unique or recurring completion into the other page', () => {
    const unique = { due_date: '2026-10-28', completed: true };
    const recurring = { days_of_week: ['Qua'], daily_status: { '2026-10-28': 'completed' } };
    expect(missionCompletedOnDate(unique, '2026-10-28')).toBe(true);
    expect(missionCompletedOnDate(unique, '2026-10-29')).toBe(false);
    expect(missionCompletedOnDate(recurring, '2026-10-28')).toBe(true);
    expect(missionCompletedOnDate(recurring, '2026-10-29')).toBe(false);
    expect(missionCompletedOnDate({ ...unique, status: 'arquivada' }, '2026-10-28')).toBe(false);
  });
});
