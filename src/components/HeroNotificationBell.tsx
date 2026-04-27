import { useEffect, useState } from 'react';
import { Bell, Droplet, UtensilsCrossed, Moon, Trophy, Flame, Zap, Sparkles, BellOff } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useHeroNotifications, type HeroNotification } from '@/hooks/useHeroNotifications';
import { cn } from '@/lib/utils';

const iconMap: Record<HeroNotification['icon'], React.ComponentType<{ className?: string }>> = {
  water: Droplet,
  food: UtensilsCrossed,
  sleep: Moon,
  streak: Trophy,
  fatigue: Flame,
  mp: Zap,
  success: Sparkles,
};

const severityClasses: Record<HeroNotification['severity'], string> = {
  info: 'border-accent/40 bg-accent/10 text-accent',
  warn: 'border-amber-400/40 bg-amber-400/10 text-amber-300',
  danger: 'border-destructive/50 bg-destructive/15 text-destructive',
  success: 'border-success/40 bg-success/10 text-success',
};

export default function HeroNotificationBell() {
  const { data: notifications = [] } = useHeroNotifications();
  const count = notifications.length;
  const hasDanger = notifications.some((n) => n.severity === 'danger');
  const [open, setOpen] = useState(false);

  // Lê IDs já dispensados nesta sessão (cliente)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('hero_notifications_dismissed');
      if (raw) setDismissed(new Set(JSON.parse(raw)));
    } catch {
      // ignore
    }
  }, []);

  const visible = notifications.filter((n) => !dismissed.has(n.id));
  const visibleCount = visible.length;

  const dismiss = (id: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      try {
        sessionStorage.setItem('hero_notifications_dismissed', JSON.stringify(Array.from(next)));
      } catch {
        // ignore
      }
      return next;
    });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                'relative inline-flex items-center justify-center h-8 w-8 rounded-md border text-xs transition-all hover:scale-105',
                visibleCount === 0
                  ? 'border-border bg-muted/30 text-muted-foreground'
                  : hasDanger
                  ? 'border-destructive/50 bg-destructive/15 text-destructive animate-pulse'
                  : 'border-amber-400/40 bg-amber-400/10 text-amber-300',
              )}
              aria-label={`Notificações (${visibleCount})`}
            >
              <Bell className="w-4 h-4" />
              {visibleCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center">
                  {visibleCount > 9 ? '9+' : visibleCount}
                </span>
              )}
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p className="text-xs">Notificações do herói</p>
          <p className="text-[10px] text-muted-foreground">Avisos contextuais sobre seu personagem.</p>
        </TooltipContent>
      </Tooltip>

      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={8}
        className="w-80 p-0 max-h-[70vh] overflow-hidden flex flex-col"
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-card/80">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Bell className="w-4 h-4 text-primary" />
            <span>Avisos do Herói</span>
          </div>
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {visibleCount} ativo{visibleCount === 1 ? '' : 's'}
          </span>
        </div>

        <div className="flex-1 overflow-auto">
          {visible.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground flex flex-col items-center gap-2">
              <BellOff className="w-8 h-8 opacity-40" />
              <p>Tudo em ordem por enquanto.</p>
              <p className="text-[10px]">Continue cumprindo seus hábitos!</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {visible.map((n) => {
                const Icon = iconMap[n.icon];
                return (
                  <li key={n.id} className="p-3 flex gap-3 items-start hover:bg-muted/30 transition-colors">
                    <div
                      className={cn(
                        'shrink-0 w-9 h-9 rounded-md border flex items-center justify-center',
                        severityClasses[n.severity],
                      )}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold leading-tight">{n.title}</p>
                      <p className="text-xs text-muted-foreground mt-1 leading-snug">{n.message}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => dismiss(n.id)}
                      className="text-muted-foreground hover:text-foreground text-xs px-1"
                      aria-label="Dispensar"
                    >
                      ✕
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {visible.length > 0 && (
          <button
            type="button"
            onClick={() => {
              const all = new Set(notifications.map((n) => n.id));
              setDismissed(all);
              try {
                sessionStorage.setItem(
                  'hero_notifications_dismissed',
                  JSON.stringify(Array.from(all)),
                );
              } catch {
                // ignore
              }
            }}
            className="w-full text-center text-[11px] text-muted-foreground hover:text-foreground py-2 border-t border-border"
          >
            Dispensar todos
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
