import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

type HealthStatsRow = {
  sleep_time?: string | null;
  wake_time?: string | null;
  rest_mode_enabled?: boolean | null;
};

const WARN_KEY = 'bedtime_prewarn_last_shown';
const WARN_BEFORE_MIN = 15;

function timeToMinutes(value?: string | null): number | null {
  if (!value) return null;
  const [hh, mm] = String(value).split(':').map((n) => parseInt(n, 10));
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return hh * 60 + mm;
}

/** Está dentro da janela de sono [sleep, wake) (com wrap pós-meia-noite)? */
function inSleepWindow(sleepMin: number, wakeMin: number, nowMin: number): boolean {
  if (sleepMin === wakeMin) return false;
  if (sleepMin < wakeMin) return nowMin >= sleepMin && nowMin < wakeMin;
  // janela cruza a meia-noite (ex.: dormir 23:00, acordar 07:00)
  return nowMin >= sleepMin || nowMin < wakeMin;
}

/**
 * Modo descanso (§7) — OPT-IN, default OFF. Quando o usuário ativou e está no
 * horário de dormir, retorna `restMode = true`. Isso NÃO bloqueia nenhuma página
 * (o BedtimeGate só mostra um banner calmo). 15 min antes, um aviso gentil — só
 * se o modo estiver ativado.
 */
export function useBedtimeLock(): { restMode: boolean } {
  const { user } = useAuth();
  const [restMode, setRestMode] = useState(false);

  const { data: healthStats } = useQuery<HealthStatsRow | null>({
    queryKey: ['bedtime-lock', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from('user_health_stats')
        .select('sleep_time, wake_time, rest_mode_enabled')
        .eq('user_id', user!.id)
        .maybeSingle();
      return (data as HealthStatsRow | null) ?? null;
    },
    refetchInterval: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!user?.id || !healthStats?.rest_mode_enabled) {
      setRestMode(false);
      return;
    }
    const sleepMin = timeToMinutes(healthStats?.sleep_time);
    const wakeMin = timeToMinutes(healthStats?.wake_time);
    if (sleepMin == null || wakeMin == null) {
      setRestMode(false);
      return;
    }

    const check = () => {
      const now = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes();
      const today = now.toLocaleDateString('en-CA');

      // Aviso 15 min antes (uma vez por dia) — gentil, sem ameaça de bloqueio.
      const minutesToBed = ((sleepMin - nowMin) % 1440 + 1440) % 1440;
      if (minutesToBed > 0 && minutesToBed <= WARN_BEFORE_MIN) {
        let stored: Record<string, string> = {};
        try {
          stored = JSON.parse(localStorage.getItem(WARN_KEY) || '{}');
        } catch {
          stored = {};
        }
        if (stored[user.id] !== today) {
          toast('Quase hora de dormir', {
            description: `Em ${minutesToBed} min entra o modo descanso. O app continua liberado — é só pra desacelerar.`,
            duration: 10000,
            icon: '🌙',
          });
          try {
            localStorage.setItem(WARN_KEY, JSON.stringify({ ...stored, [user.id]: today }));
          } catch {
            // ignore
          }
        }
      }

      setRestMode(inSleepWindow(sleepMin, wakeMin, nowMin));
    };

    check();
    const interval = window.setInterval(check, 30_000);
    return () => window.clearInterval(interval);
  }, [user?.id, healthStats?.rest_mode_enabled, healthStats?.sleep_time, healthStats?.wake_time]);

  return { restMode };
}
