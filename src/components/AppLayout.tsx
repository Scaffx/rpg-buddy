import { ReactNode, useEffect, useMemo, useState } from 'react';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import ShortRestTimer from '@/components/ShortRestTimer';
import SoundToggleButton from '@/components/SoundToggleButton';
import HeroNotificationBell from '@/components/HeroNotificationBell';
import LevelUpCinematic from '@/components/LevelUpCinematic';
import { CharacterSprite } from '@/components/CharacterSprite';
import { AppUpdateModal } from '@/components/AppUpdateModal';
import { PaymentTestModeBanner } from '@/components/PaymentTestModeBanner';
import { Flame, Shield, ShieldAlert, Trophy } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { formatSeconds, getRemainingSeconds, readShortRestState, writeShortRestState } from '@/lib/shortRestState';
import { useMidnightReset } from '@/hooks/useMidnightReset';
import { useSleepWakeAlerts } from '@/hooks/useSleepWakeAlerts';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { computeSixtyPercentStreak } from '@/lib/streakUtils';

const DAILY_RESET_EVENT = 'daily-reset-processed';

function getDailyResetStorageKey(userId: string): string {
  return `daily_reset_last_processed_${userId}`;
}

function getWeekToken(date: Date = new Date()): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

type StreakProtectorStatus = {
  charges: number;
  max: number;
};

type StreakProtectorProfileRow = {
  streak_protector_charges?: number | null;
  streak_protector_max?: number | null;
  streak_protector_week?: string | null;
};

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  useMidnightReset();
  useSleepWakeAlerts();
  const [showRestTimer, setShowRestTimer] = useState(false);
  const [headerSeconds, setHeaderSeconds] = useState<number | null>(null);
  const [showDailyResetNotice, setShowDailyResetNotice] = useState(false);
  const [dailyResetMessage, setDailyResetMessage] = useState('');

  const { data: streakProtector } = useQuery<StreakProtectorStatus>({
    queryKey: ['streak-protector-header', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('streak_protector_charges, streak_protector_max, streak_protector_week')
        .eq('user_id', user!.id)
        .maybeSingle();

      const row = data as StreakProtectorProfileRow | null;

      const weekToken = getWeekToken();
      const profileWeek = String(row?.streak_protector_week || '');
      const max = Math.min(3, Math.max(1, Number(row?.streak_protector_max ?? 3)));
      const charges = profileWeek === weekToken
        ? Number(row?.streak_protector_charges ?? 2)
        : 2;

      return {
        charges: Math.max(0, Math.min(max, charges)),
        max,
      };
    },
    refetchInterval: 60_000,
  });

  const protectorCharges = streakProtector?.charges ?? 0;
  const protectorMax = streakProtector?.max ?? 3;
  const isProtectorRisk = protectorCharges <= 0;

  const { data: streakDays = 0 } = useQuery<number>({
    queryKey: ['mission-streak-header', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from('missions')
        .select('days_of_week, daily_status, created_at, is_failed, failed_date, completed, completed_at')
        .eq('user_id', user!.id);
      return computeSixtyPercentStreak((data as any[]) || []);
    },
    refetchInterval: 60_000,
  });

  const closeRestTimer = () => {
    if (user?.id) {
      const saved = readShortRestState(user.id);
      if (saved?.isRunning) {
        const remaining = getRemainingSeconds(saved);
        writeShortRestState(user.id, {
          ...saved,
          secondsLeft: remaining,
          isRunning: false,
          endAtMs: null,
          needsApply: false,
          updatedAtMs: Date.now(),
        });
      }
    }

    setShowRestTimer(false);
  };

  useEffect(() => {
    if (!user?.id) {
      setHeaderSeconds(null);
      return;
    }

    const tick = () => {
      const saved = readShortRestState(user.id);
      if (!saved || !saved.isRunning) {
        setHeaderSeconds(null);
        return;
      }

      const remaining = getRemainingSeconds(saved);
      if (remaining <= 0) {
        setHeaderSeconds(null);
        return;
      }
      setHeaderSeconds(remaining);
    };

    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [user?.id]);

  const headerLabel = useMemo(() => {
    if (headerSeconds == null) return null;
    return formatSeconds(headerSeconds);
  }, [headerSeconds]);

  useEffect(() => {
    if (!user?.id) {
      setShowDailyResetNotice(false);
      return;
    }

    const today = new Date().toLocaleDateString('en-CA');
    const raw = localStorage.getItem(getDailyResetStorageKey(user.id));
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { date?: string; processedAtMs?: number };
        if (parsed.date === today && typeof parsed.processedAtMs === 'number') {
          const elapsedMs = Date.now() - parsed.processedAtMs;
          if (elapsedMs >= 0 && elapsedMs <= 5 * 60 * 1000) {
            setDailyResetMessage('Virada diária processada: missões, refeições, água e timers foram atualizados.');
            setShowDailyResetNotice(true);
          }
        }
      } catch {
        // ignore malformed storage
      }
    }

    const onDailyReset = (event: Event) => {
      const customEvent = event as CustomEvent<{ date?: string }>;
      const dateLabel = customEvent.detail?.date || today;
      setDailyResetMessage(`Virada diária processada (${dateLabel}). Missões, refeições, água e timers atualizados.`);
      setShowDailyResetNotice(true);
    };

    window.addEventListener(DAILY_RESET_EVENT, onDailyReset as EventListener);

    return () => {
      window.removeEventListener(DAILY_RESET_EVENT, onDailyReset as EventListener);
    };
  }, [user?.id]);

  useEffect(() => {
    if (!showDailyResetNotice) return;
    const hideTimer = window.setTimeout(() => setShowDailyResetNotice(false), 12000);
    return () => window.clearTimeout(hideTimer);
  }, [showDailyResetNotice]);

  useEffect(() => {
    if (!showRestTimer) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeRestTimer();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [showRestTimer]);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full flex-col">
        <PaymentTestModeBanner />
        <div className="flex flex-1 w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-16 flex items-center justify-between border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50 px-2">
            <SidebarTrigger />

            <div className="hidden md:flex items-center justify-center flex-1 h-full pointer-events-none px-4">
              <CharacterSprite />
            </div>

            <TooltipProvider delayDuration={150}>
              <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                <SoundToggleButton />
                <HeroNotificationBell />

                {/* Streak de dias com ≥60% das missões cumpridas */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className={`inline-flex items-center justify-center h-8 w-8 rounded-md border text-xs font-semibold transition-all hover:scale-105 ${
                        streakDays > 0
                          ? 'border-amber-400/50 bg-amber-400/10 text-amber-300'
                          : 'border-border bg-muted/30 text-muted-foreground'
                      }`}
                      aria-label={`Streak: ${streakDays} dias`}
                    >
                      <Trophy className="w-4 h-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p className="text-xs">
                      Streak de consistência: <strong>{streakDays} dia{streakDays === 1 ? '' : 's'}</strong>
                    </p>
                    <p className="text-[10px] text-muted-foreground">Dias seguidos com ≥60% das missões diárias cumpridas.</p>
                  </TooltipContent>
                </Tooltip>

                {/* Protetor de streak */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className={`inline-flex items-center justify-center h-8 w-8 rounded-md border text-xs font-semibold transition-all hover:scale-105 ${
                        isProtectorRisk
                          ? 'border-destructive/50 bg-destructive/15 text-destructive animate-pulse'
                          : 'border-orange-400/40 bg-orange-400/10 text-orange-300'
                      }`}
                      aria-label={`Protetor: ${protectorCharges} de ${protectorMax}`}
                    >
                      {isProtectorRisk ? <ShieldAlert className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p className="text-xs">
                      Protetor de Streak: <strong>{protectorCharges}/{protectorMax}</strong>
                    </p>
                    <p className="text-[10px] text-muted-foreground">Cargas que evitam quebrar a streak ao falhar uma missão.</p>
                  </TooltipContent>
                </Tooltip>

                {/* Short Rest com ícone de fogueira */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setShowRestTimer(!showRestTimer)}
                      className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 hover:scale-105 transition-all relative"
                      aria-label="Descanso Breve"
                    >
                      <Flame className="w-4 h-4" />
                      {headerLabel && (
                        <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 font-mono text-[9px] leading-none tabular-nums bg-background border border-primary/30 rounded px-1 py-0.5 text-primary whitespace-nowrap">{headerLabel}</span>
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p className="text-xs"><strong>Short Rest</strong> — Fogueira de descanso</p>
                    <p className="text-[10px] text-muted-foreground">Recupera HP, MP e reduz fadiga após 15-60 min.</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
          </header>
          {showDailyResetNotice && (
            <div className="mx-2 mt-2 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-2 text-xs text-emerald-300">
              {dailyResetMessage}
            </div>
          )}
          <main className="flex-1 p-4 md:p-6 overflow-auto">
            {children}
          </main>
        </div>

        {/* Short Rest Modal */}
        {showRestTimer && (
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={closeRestTimer}
          >
            <div
              className="relative max-w-md w-full"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                onClick={closeRestTimer}
                className="absolute -top-8 right-0 text-muted-foreground hover:text-foreground text-xl"
                aria-label="Fechar short rest"
              >
                ✕
              </button>
              <ShortRestTimer
                defaultMinutes={15}
                minMinutes={15}
                maxMinutes={60}
                onRestComplete={() => {
                  // Mantém aberto depois de completo para mostrar mensagem
                  setTimeout(closeRestTimer, 2000);
                }}
              />
            </div>
          </div>
        )}

        <LevelUpCinematic />
        </div>
        <AppUpdateModal />
      </div>
    </SidebarProvider>
  );
}
