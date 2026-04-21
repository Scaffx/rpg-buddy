import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { sfx } from '@/lib/sfx';

const STORAGE_PREFIX = 'lifeonrpg-last-level-';

type LevelUpData = {
  from: number;
  to: number;
};

export default function LevelUpCinematic() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const [event, setEvent] = useState<LevelUpData | null>(null);

  useEffect(() => {
    if (!user?.id || !profile) return;

    const level = Number((profile as any).level ?? 1);
    // Dado inválido ou corrompido – ignora
    if (!Number.isFinite(level) || level < 1) return;

    const storageKey = `${STORAGE_PREFIX}${user.id}`;
    const stored = window.localStorage.getItem(storageKey);
    const parsedStored = stored !== null ? Number(stored) : NaN;

    if (!Number.isFinite(parsedStored)) {
      // Primeira vez neste dispositivo/usuário – apenas inicializa sem animar
      window.localStorage.setItem(storageKey, String(level));
      return;
    }

    if (level > parsedStored) {
      // Nível realmente subiu: anima e persiste o novo valor
      setEvent({ from: parsedStored, to: level });
      sfx.levelUp();
      window.localStorage.setItem(storageKey, String(level));
    }
    // Não sincronizamos para baixo intencionalmente:
    // dados em cache stale podem reportar um nível anterior ao real,
    // o que sobrescreveria o valor correto e dispararia a animação
    // falsamente na próxima atualização fresh.
  }, [user?.id, profile]);

  useEffect(() => {
    if (!event) return;
    const timer = window.setTimeout(() => setEvent(null), 4200);
    return () => window.clearTimeout(timer);
  }, [event]);

  if (!event) return null;

  const sparkles = Array.from({ length: 24 });

  return (
    <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
      {/* Vertical light beam (Ragnarok-style) */}
      <div
        className="absolute left-1/2 top-0 h-full w-40 md:w-64 -translate-x-1/2 animate-levelup-beam"
        style={{
          background:
            'linear-gradient(to bottom, transparent 0%, hsl(210 100% 80% / 0.85) 30%, hsl(43 96% 70% / 0.9) 50%, hsl(210 100% 80% / 0.85) 70%, transparent 100%)',
          filter: 'blur(6px)',
          mixBlendMode: 'screen',
        }}
      />
      <div
        className="absolute left-1/2 top-0 h-full w-2 md:w-4 -translate-x-1/2 animate-levelup-beam"
        style={{
          background: 'linear-gradient(to bottom, transparent, white 50%, transparent)',
          mixBlendMode: 'screen',
          boxShadow: '0 0 60px hsl(210 100% 80% / 0.9)',
        }}
      />

      {/* Sparkles rising */}
      {sparkles.map((_, i) => {
        const left = 30 + Math.random() * 40;
        const delay = Math.random() * 1.2;
        const dur = 1.6 + Math.random() * 1.4;
        const size = 4 + Math.random() * 6;
        return (
          <span
            key={`spark-${i}`}
            className="absolute bottom-0 rounded-full animate-levelup-spark"
            style={{
              left: `${left}%`,
              width: `${size}px`,
              height: `${size}px`,
              background: 'radial-gradient(circle, hsl(43 96% 70%) 0%, hsl(43 96% 60% / 0.6) 50%, transparent 100%)',
              boxShadow: '0 0 10px hsl(43 96% 65% / 0.9)',
              animationDelay: `${delay}s`,
              animationDuration: `${dur}s`,
            }}
          />
        );
      })}

      {/* Title */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
        <p className="font-cinzel text-5xl md:text-8xl font-black text-primary drop-shadow-[0_0_40px_hsl(43_96%_60%/0.95)] animate-levelup-title">
          LEVEL UP!
        </p>
        <p className="text-lg md:text-3xl font-bold text-amber-100/95 tracking-widest animate-levelup-subtitle">
          Lv {event.from} <span className="mx-3 text-amber-300">→</span> Lv {event.to}
        </p>
      </div>
    </div>
  );
}
