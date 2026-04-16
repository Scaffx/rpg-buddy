import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from './useAuth';
import { runFailedMissionCheck } from './useFailedMissions';

const DAILY_RESET_EVENT = 'daily-reset-processed';

function getDailyResetStorageKey(userId: string): string {
  return `daily_reset_last_processed_${userId}`;
}

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

  const getMsUntilNextMidnight = () => {
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
    return Math.max(0, nextMidnight.getTime() - now.getTime());
  };

  useEffect(() => {
    if (!user) return;

    const invalidateDaily = async () => {
      const resetDate = new Date().toLocaleDateString('en-CA');
      const processedAtMs = Date.now();

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
      localStorage.setItem(
        getDailyResetStorageKey(user.id),
        JSON.stringify({ date: resetDate, processedAtMs }),
      );

      // Garante que missões do dia anterior sejam marcadas como fracassadas na virada.
      await runFailedMissionCheck(user.id, queryClient);

      window.dispatchEvent(
        new CustomEvent(DAILY_RESET_EVENT, {
          detail: { date: resetDate, processedAtMs },
        }),
      );

      console.log('[MidnightReset] Day changed, all daily queries invalidated.');
    };

    const check = async () => {
      const now = new Date().toLocaleDateString('en-CA');
      if (now !== lastDateRef.current) {
        lastDateRef.current = now;
        await invalidateDaily();
      }
    };

    // 1. Disparo exato na próxima meia-noite local e repetição diária.
    let dailyInterval: number | undefined;
    const midnightTimeout = window.setTimeout(() => {
      void check();
      dailyInterval = window.setInterval(() => {
        void check();
      }, 24 * 60 * 60 * 1000);
    }, getMsUntilNextMidnight());

    // 2. Poll every 60s as fallback while app is active.
    const pollingInterval = setInterval(() => {
      void check();
    }, 60_000);

    // 3. Check when user returns to the app/tab (mobile background, tab switch)
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void check();
      }
    };

    // 4. Check when the window regains focus
    const onFocus = () => {
      void check();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onFocus);

    return () => {
      clearTimeout(midnightTimeout);
      if (dailyInterval) clearInterval(dailyInterval);
      clearInterval(pollingInterval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onFocus);
    };
  }, [user, queryClient]);
}
