import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from './useAuth';

/**
 * Polls every 30s to detect day change (midnight).
 * When the day changes, invalidates all daily-scoped queries
 * so the UI refreshes: daily bonus, short rest, meals, water, missions, etc.
 */
export function useMidnightReset() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const lastDateRef = useRef(new Date().toLocaleDateString('en-CA'));

  useEffect(() => {
    if (!user) return;

    const check = () => {
      const now = new Date().toLocaleDateString('en-CA');
      if (now !== lastDateRef.current) {
        lastDateRef.current = now;

        // Invalidate all daily-scoped queries
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

        // Clear short rest from localStorage
        const key = `short_rest_${user.id}`;
        localStorage.removeItem(key);

        console.log('[MidnightReset] Day changed, all daily queries invalidated.');
      }
    };

    // Check every 30 seconds
    const interval = setInterval(check, 30_000);
    return () => clearInterval(interval);
  }, [user, queryClient]);
}
