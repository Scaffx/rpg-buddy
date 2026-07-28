import { describe, expect, it } from 'vitest';
import { isMissionAvailableOnDashboardToday } from '@/lib/dashboardMissions';

const TODAY = '2026-07-28';
const NOW = new Date('2026-07-28T15:00:00.000Z');

describe('dashboard mission availability', () => {
  it('shows a flexible mission every day while it is below the weekly target', () => {
    expect(isMissionAvailableOnDashboardToday({
      frequency_type: 'weekly',
      target_count: 4,
      max_count: 7,
      weekly_current_count: 2,
      weekly_last_completed_date: '2026-07-27',
      days_of_week: [],
    }, TODAY, 'Ter', NOW)).toBe(true);
  });

  it('hides a flexible mission after today completion or after reaching the target', () => {
    const mission = {
      frequency_type: 'weekly' as const,
      target_count: 4,
      max_count: 7,
      days_of_week: [],
    };

    expect(isMissionAvailableOnDashboardToday({
      ...mission,
      weekly_current_count: 3,
      weekly_last_completed_date: TODAY,
    }, TODAY, 'Ter', NOW)).toBe(false);

    expect(isMissionAvailableOnDashboardToday({
      ...mission,
      weekly_current_count: 4,
      weekly_last_completed_date: '2026-07-27',
    }, TODAY, 'Ter', NOW)).toBe(false);
  });

  it('keeps the fixed daily scheduling behavior unchanged', () => {
    expect(isMissionAvailableOnDashboardToday({
      frequency_type: 'daily',
      days_of_week: ['Ter'],
      daily_status: {},
    }, TODAY, 'Ter', NOW)).toBe(true);

    expect(isMissionAvailableOnDashboardToday({
      frequency_type: 'daily',
      days_of_week: ['Ter'],
      daily_status: { [TODAY]: 'completed' },
    }, TODAY, 'Ter', NOW)).toBe(false);
  });
});
