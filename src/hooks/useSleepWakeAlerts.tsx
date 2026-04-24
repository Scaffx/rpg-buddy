import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

type HealthStatsRow = {
  sleep_time?: string | null;
  wake_time?: string | null;
};

const STORAGE_KEY = 'sleep_wake_alerts_last_shown';

function getStored(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function setStored(map: Record<string, string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

function timeToMinutes(value?: string | null): number | null {
  if (!value) return null;
  const [hh, mm] = String(value).split(':').map((n) => parseInt(n, 10));
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return hh * 60 + mm;
}

/**
 * Triggers a toast at the user's configured sleep_time and wake_time, once per day,
 * with a 5-minute window so it still fires if the app was opened slightly late.
 */
export function useSleepWakeAlerts() {
  const { user } = useAuth();
  const intervalRef = useRef<number | null>(null);

  const { data: healthStats } = useQuery<HealthStatsRow | null>({
    queryKey: ['sleep-wake-alerts', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from('user_health_stats')
        .select('sleep_time, wake_time')
        .eq('user_id', user!.id)
        .maybeSingle();
      return (data as HealthStatsRow | null) ?? null;
    },
    refetchInterval: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!user?.id) return;

    const sleepMin = timeToMinutes(healthStats?.sleep_time);
    const wakeMin = timeToMinutes(healthStats?.wake_time);
    if (sleepMin == null && wakeMin == null) return;

    const check = () => {
      const now = new Date();
      const today = now.toLocaleDateString('en-CA');
      const nowMin = now.getHours() * 60 + now.getMinutes();
      const stored = getStored();

      const fireIfNeeded = (
        kind: 'sleep' | 'wake',
        targetMin: number,
        title: string,
        description: string,
      ) => {
        const key = `${user.id}__${kind}`;
        const lastShown = stored[key];
        const diff = nowMin - targetMin;
        // Janela de 5 minutos após o horário, e só uma vez por dia
        if (diff >= 0 && diff < 5 && lastShown !== today) {
          if (kind === 'sleep') {
            toast(title, { description, duration: 8000, icon: '🌙' });
          } else {
            toast.success(title, { description, duration: 8000, icon: '☀️' });
          }
          setStored({ ...stored, [key]: today });
        }
      };

      if (sleepMin != null) {
        fireIfNeeded(
          'sleep',
          sleepMin,
          'Hora de dormir!',
          'Vá descansar — herói recupera HP e MP enquanto dorme.',
        );
      }
      if (wakeMin != null) {
        fireIfNeeded(
          'wake',
          wakeMin,
          'Bom dia, herói!',
          'HP e MP foram totalmente restaurados. Hora da próxima jornada!',
        );
      }
    };

    check();
    intervalRef.current = window.setInterval(check, 60_000);
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, [user?.id, healthStats?.sleep_time, healthStats?.wake_time]);
}
