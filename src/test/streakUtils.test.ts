import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  computeSixtyPercentStreak,
  evaluateTodayStreakRisk,
} from '@/lib/streakUtils';

describe('daily streak ignores flexible weekly missions', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not count a legacy weekly mission as required or failed today', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-28T15:00:00.000Z'));

    const legacyWeekly = {
      frequency_type: 'weekly' as const,
      days_of_week: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'],
      created_at: '2026-01-01T00:00:00.000Z',
      daily_status: {},
    };

    expect(evaluateTodayStreakRisk([legacyWeekly])).toMatchObject({
      required: 0,
      completed: 0,
      failed: 0,
      pending: 0,
      atRisk: false,
    });
    expect(computeSixtyPercentStreak([legacyWeekly])).toBe(0);
  });
});
