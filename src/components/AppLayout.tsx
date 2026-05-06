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
import { SubscriptionExpiryNotice } from '@/components/SubscriptionExpiryNotice';
import FloatingAiChat from '@/components/FloatingAiChat';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useTranslation } from 'react-i18next';
import { Flame, Shield, ShieldAlert, Trophy } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { formatSeconds, getRemainingSeconds, readShortRestState, writeShortRestState } from '@/lib/shortRestState';
import { useMidnightReset } from '@/hooks/useMidnightReset';
import { useSleepWakeAlerts } from '@/hooks/useSleepWakeAlerts';
import { useAutoCheckAchievements } from '@/hooks/useAchievements';
import { usePresenceHeartbeat } from '@/hooks/usePresence';
import { useReminderNotifications } from '@/hooks/useReminders';
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
  const { t } = useTranslation();
  useMidnightReset();
  useSleepWakeAlerts();
  useAutoCheckAchievements();
  usePresenceHeartbeat();
  useReminderNotifications();
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
          {/* ── Topbar ────────────────────────────────────────────────── */}
          <header className="h-14 flex items-center justify-between border-b border-border bg-card/90 backdrop-blur-md sticky top-0 z-50 px-3 gap-2">
            {/* Esquerda: toggle da sidebar */}
            <SidebarTrigger className="shrink-0" />

            {/* Centro: sprite do personagem (decorativo) */}
            <div className="hidden md:flex items-center justify-center flex-1 h-full pointer-events-none">
              <CharacterSprite />
            </div>

            {/* Direita: ações rápidas agrupadas */}
            <TooltipProvider delayDuration={150}>
              <div className="flex items-center gap-1 shrink-0">

                {/* Utilitários */}
                <div className="flex items-center gap-0.5 px-1 py-1 rounded-lg bg-muted/30 border border-border/50">
                  <LanguageSwitcher />
                  <SoundToggleButton />
                  <HeroNotificationBell />
                </div>

                {/* Divisor visual */}
                <div className="h-6 w-px bg-border/60 mx-1 hidden sm:block" />

                {/* Stats rápidos: Streak + Protetor */}
                <div className="hidden sm:flex items-center gap-1 px-1 py-1 rounded-lg bg-muted/30 border border-border/50">
                  {/* Streak */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className={`inline-flex items-center gap-1 h-7 px-2 rounded-md border text-[11px] font-bold transition-all hover:scale-105 ${
                          streakDays > 0
                            ? 'border-amber-400/40 bg-amber-400/10 text-amber-300'
                            : 'border-border/50 bg-transparent text-muted-foreground'
                        }`}
                        aria-label={`Streak: ${streakDays}`}
                      >
                        <Trophy className="w-3.5 h-3.5" />
                        <span className="tabular-nums">{streakDays}</span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      <p className="text-xs">
                        {t('app.header.streak_title')}: <strong>{streakDays} dia{streakDays !== 1 ? 's' : ''}</strong>
                      </p>
                      <p className="text-[10px] text-muted-foreground">{t('app.header.streak_desc')}</p>
                    </TooltipContent>
                  </Tooltip>

                  {/* Protetor de streak */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className={`inline-flex items-center gap-1 h-7 px-2 rounded-md border text-[11px] font-bold transition-all hover:scale-105 ${
                          isProtectorRisk
                            ? 'border-destructive/50 bg-destructive/10 text-destructive animate-pulse'
                            : 'border-orange-400/30 bg-orange-400/8 text-orange-300'
                        }`}
                        aria-label={`Protetor: ${protectorCharges} de ${protectorMax}`}
                      >
                        {isProtectorRisk ? <ShieldAlert className="w-3.5 h-3.5" /> : <Shield className="w-3.5 h-3.5" />}
                        <span className="tabular-nums">{protectorCharges}/{protectorMax}</span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      <p className="text-xs">
                        {t('app.header.protector_title')}: <strong>{protectorCharges}/{protectorMax}</strong>
                      </p>
                      <p className="text-[10px] text-muted-foreground">{t('app.header.protector_desc')}</p>
                    </TooltipContent>
                  </Tooltip>
                </div>

                {/* Divisor visual */}
                <div className="h-6 w-px bg-border/60 mx-1 hidden sm:block" />

                {/* Short Rest */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setShowRestTimer(!showRestTimer)}
                      className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border font-semibold transition-all hover:scale-105 relative ${
                        headerLabel
                          ? 'border-primary/50 bg-primary/15 text-primary'
                          : 'border-primary/25 bg-primary/8 text-primary/70 hover:text-primary hover:border-primary/40'
                      }`}
                      aria-label={t('app.header.rest_label')}
                    >
                      <Flame className="w-4 h-4 shrink-0" />
                      {headerLabel ? (
                        <span className="font-mono text-[11px] tabular-nums leading-none">{headerLabel}</span>
                      ) : (
                        <span className="text-[11px] hidden sm:inline">Descanso</span>
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p className="text-xs"><strong>{t('app.header.rest_label_short')}</strong></p>
                    <p className="text-[10px] text-muted-foreground">{t('app.header.rest_desc')}</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
          </header>

          <SubscriptionExpiryNotice />
          {showDailyResetNotice && (
            <div className="mx-3 mt-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300 flex items-center gap-2">
              <span className="text-emerald-400">✓</span>
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
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
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
        <FloatingAiChat />
      </div>
    </SidebarProvider>
  );
}
