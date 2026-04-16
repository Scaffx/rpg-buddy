import { ReactNode, useEffect, useMemo, useState } from 'react';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import ShortRestTimer from '@/components/ShortRestTimer';
import { Clock } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { formatSeconds, getRemainingSeconds, readShortRestState } from '@/lib/shortRestState';
import { useMidnightReset } from '@/hooks/useMidnightReset';

const DAILY_RESET_EVENT = 'daily-reset-processed';

function getDailyResetStorageKey(userId: string): string {
  return `daily_reset_last_processed_${userId}`;
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  useMidnightReset();
  const [showRestTimer, setShowRestTimer] = useState(false);
  const [headerSeconds, setHeaderSeconds] = useState<number | null>(null);
  const [showDailyResetNotice, setShowDailyResetNotice] = useState(false);
  const [dailyResetMessage, setDailyResetMessage] = useState('');

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

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-12 flex items-center justify-between border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50 px-2">
            <SidebarTrigger />
            <button
              onClick={() => setShowRestTimer(!showRestTimer)}
              className="inline-flex items-center gap-2 px-3 py-1 rounded-lg border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition text-sm font-medium"
              title="Descanso Breve"
            >
              {headerLabel ? (
                <span className="font-mono text-xs leading-none">{headerLabel}</span>
              ) : (
                <Clock className="w-4 h-4" />
              )}
            </button>
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
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="relative max-w-md w-full">
              <button
                onClick={() => setShowRestTimer(false)}
                className="absolute -top-8 right-0 text-muted-foreground hover:text-foreground text-xl"
              >
                ✕
              </button>
              <ShortRestTimer
                defaultMinutes={15}
                minMinutes={15}
                maxMinutes={60}
                onRestComplete={() => {
                  // Mantém aberto depois de completo para mostrar mensagem
                  setTimeout(() => setShowRestTimer(false), 2000);
                }}
              />
            </div>
          </div>
        )}
      </div>
    </SidebarProvider>
  );
}
