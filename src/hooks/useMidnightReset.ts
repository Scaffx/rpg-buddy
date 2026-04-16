import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from './useAuth';

/**
 * Detects day change via:
 * 1. Polling every 60s (app open at midnight)
 * 2. visibilitychange event (user returns to app/tab after it was hidden)
 * 3. window focus event (user switches back to the browser window)
 *
 * When the day changes, invalidates all daily-scoped queries so the UI
 * resets: meals, water, short rest, daily bonus, missions, etc.
 */
export function useMidnightReset() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const lastDateRef = useRef(new Date().toLocaleDateString('en-CA'));

  useEffect(() => {
    if (!user) return;

    const invalidateDaily = () => {
      queryClient.invalidateQueries({ queryKey: ['daily-bonus-claimed'] });
      queryClient.invalidateQueries({ queryKey: ['short_rest_status'] });
      queryClient.invalidateQueries({ queryKey: ['meal_log'] });
      queryClient.invalidateQueries({ queryKey: ['water_log'] });
      queryClient.invalidateQueries({ queryKey: ['dailyTracking'] });
      queryClient.invalidateQueries({ queryKey: ['mealHistory'] });
      queryClient.invalidateQueries({ queryKey: ['missions'] });
      queryClient.invalidateQueries({ queryKey: ['health_stats'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['today-xp'] });
      queryClient.invalidateQueries({ queryKey: ['today-missions-count'] });
      localStorage.removeItem(`short_rest_${user.id}`);
      console.log('[MidnightReset] Day changed, all daily queries invalidated.');
    };

    const check = () => {
      const now = new Date().toLocaleDateString('en-CA');
      if (now !== lastDateRef.current) {
        lastDateRef.current = now;
        invalidateDaily();
      }
    };

    // 1. Poll every 60s while app is active
    const interval = setInterval(check, 60_000);

    // 2. Check when user returns to the app/tab (mobile background, tab switch)
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') check();
    };

    // 3. Check when the window regains focus
    const onFocus = () => check();

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onFocus);
    };
  }, [user, queryClient]);
}
