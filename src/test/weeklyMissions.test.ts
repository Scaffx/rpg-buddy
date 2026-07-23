import { describe, expect, it } from 'vitest';
import {
  getSaoPauloDateString,
  getSaoPauloWeekStart,
  getWeeklyMissionErrorCode,
  getWeeklyMissionState,
} from '@/lib/weeklyMissions';

describe('weekly missions', () => {
  it('uses the São Paulo calendar date and Monday week boundary', () => {
    const sundayLateUtc = new Date('2026-07-20T01:30:00.000Z');
    expect(getSaoPauloDateString(sundayLateUtc)).toBe('2026-07-19');
    expect(getSaoPauloWeekStart(sundayLateUtc)).toBe('2026-07-13');

    const mondayAfterMidnight = new Date('2026-07-20T03:10:00.000Z');
    expect(getSaoPauloDateString(mondayAfterMidnight)).toBe('2026-07-20');
    expect(getSaoPauloWeekStart(mondayAfterMidnight)).toBe('2026-07-20');
  });

  it('shows regular progress before the target', () => {
    const state = getWeeklyMissionState(
      {
        frequency_type: 'weekly',
        target_count: 4,
        max_count: 7,
        weekly_current_count: 2,
        weekly_last_completed_date: '2026-07-22',
      },
      new Date('2026-07-23T15:00:00.000Z'),
    );

    expect(state).toMatchObject({
      current: 2,
      target: 4,
      targetReached: false,
      capReached: false,
      overflowAvailable: false,
    });
    expect(state?.progressPercent).toBe(50);
  });

  it('offers overflow only after the target and never twice on the same day', () => {
    const now = new Date('2026-07-23T15:00:00.000Z');
    const base = {
      frequency_type: 'weekly' as const,
      target_count: 4,
      max_count: 7,
      weekly_current_count: 4,
    };

    expect(getWeeklyMissionState(base, now)?.overflowAvailable).toBe(true);
    expect(
      getWeeklyMissionState(
        { ...base, weekly_last_completed_date: '2026-07-23' },
        now,
      )?.overflowAvailable,
    ).toBe(false);
  });

  it('marks the hard cap as reached', () => {
    expect(
      getWeeklyMissionState({
        frequency_type: 'weekly',
        target_count: 4,
        max_count: 7,
        weekly_current_count: 7,
      })?.capReached,
    ).toBe(true);
  });

  it('extracts stable server error codes from Supabase errors', () => {
    expect(
      getWeeklyMissionErrorCode({ message: 'ALREADY_COMPLETED_TODAY' }),
    ).toBe('ALREADY_COMPLETED_TODAY');
    expect(
      getWeeklyMissionErrorCode({ details: 'WEEKLY_CAP_REACHED' }),
    ).toBe('WEEKLY_CAP_REACHED');
  });
});
