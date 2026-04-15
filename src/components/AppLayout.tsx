import { ReactNode, useEffect, useMemo, useState } from 'react';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import ShortRestTimer from '@/components/ShortRestTimer';
import { Clock } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { formatSeconds, getRemainingSeconds, readShortRestState } from '@/lib/shortRestState';

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [showRestTimer, setShowRestTimer] = useState(false);
  const [headerSeconds, setHeaderSeconds] = useState<number | null>(null);

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
                minMinutes={1}
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
