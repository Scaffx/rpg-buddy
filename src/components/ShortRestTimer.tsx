import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Play, Square, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { sfx, resumeAudioContext } from '@/lib/sfx';
import { useShortRestAvailability, useShortRestRecovery, useShortRestStart } from '@/hooks/useProfile';
import { useAuth } from '@/hooks/useAuth';
import { formatSeconds, getRemainingSeconds, readShortRestState, writeShortRestState, type ShortRestPersistentState } from '@/lib/shortRestState';

type ShortRestTimerProps = {
  defaultMinutes?: number;
  minMinutes?: number;
  maxMinutes?: number;
  className?: string;
  onRestComplete?: () => void;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export default function ShortRestTimer({
  defaultMinutes = 15,
  minMinutes = 15,
  maxMinutes = 60,
  className = '',
  onRestComplete,
}: ShortRestTimerProps) {
  const { user } = useAuth();
  const safeDefault = clamp(defaultMinutes, minMinutes, maxMinutes);
  const initialSaved = readShortRestState(user?.id) || {
    minutes: safeDefault,
    secondsLeft: safeDefault * 60,
    isRunning: false,
    endAtMs: null,
    needsApply: false,
    updatedAtMs: Date.now(),
  };

  const [minutes, setMinutes] = useState<number>(clamp(initialSaved.minutes, minMinutes, maxMinutes));
  const [secondsLeft, setSecondsLeft] = useState<number>(Math.max(0, getRemainingSeconds(initialSaved)));
  const [isRunning, setIsRunning] = useState<boolean>(Boolean(initialSaved.isRunning && initialSaved.endAtMs && getRemainingSeconds(initialSaved) > 0));
  const [endAtMs, setEndAtMs] = useState<number | null>(initialSaved.endAtMs);
  const [needsApply, setNeedsApply] = useState<boolean>(Boolean(initialSaved.needsApply));
  const [finished, setFinished] = useState(false);
  const [lastRecoverySummary, setLastRecoverySummary] = useState<string | null>(null);
  const completedRef = useRef(false);
  const initializedRef = useRef(false);
  const campfireIntervalRef = useRef<number | null>(null);

  const shortRestAvailability = useShortRestAvailability();
  const shortRestRecovery = useShortRestRecovery();
  const shortRestStart = useShortRestStart();

  const formatted = useMemo(() => formatSeconds(secondsLeft), [secondsLeft]);

  const handleRestComplete = useCallback(async () => {
    if (completedRef.current) return;
    completedRef.current = true;

    try {
      // Stop campfire sound when rest completes
      sfx.stopCampfire();
      if (campfireIntervalRef.current !== null) {
        window.clearInterval(campfireIntervalRef.current);
        campfireIntervalRef.current = null;
      }
      
      const result = await shortRestRecovery.mutateAsync();
      setLastRecoverySummary(`+${result.hpRecovered} HP e +${result.mpRecovered} MP`);
      toast.success(`Descanso curto completo: +${result.hpRecovered} HP e +${result.mpRecovered} MP`);
      onRestComplete?.();
      setNeedsApply(false);
    } catch (error: any) {
      completedRef.current = false;
      setLastRecoverySummary(null);
      toast.error(error?.message || 'Não foi possível aplicar a recuperação do descanso curto.');
    }
  }, [shortRestRecovery, onRestComplete]);

  const handleStart = async () => {
    if (shortRestAvailability.isLoading) {
      toast.info('Verificando disponibilidade do descanso breve...');
      return;
    }

    if (shortRestAvailability.data && !shortRestAvailability.data.canRest) {
      toast.warning(shortRestAvailability.data.message);
      return;
    }

    const accepted = window.confirm(
      'Ao iniciar este descanso, você ficará comprometido com este layout até o fim do timer.\n\nAtenção: este descanso só pode ser iniciado 1 vez por dia.\n\nDeseja continuar?',
    );

    if (!accepted) {
      return;
    }

    try {
      await shortRestStart.mutateAsync();
    } catch (error: any) {
      toast.warning(error?.message || 'Não foi possível iniciar o descanso agora.');
      return;
    }

    // Stop any existing campfire sound before starting
    sfx.stopCampfire();
    if (campfireIntervalRef.current !== null) {
      window.clearInterval(campfireIntervalRef.current);
      campfireIntervalRef.current = null;
    }

    const baseSeconds = secondsLeft > 0 ? secondsLeft : minutes * 60;
    setSecondsLeft(baseSeconds);
    setEndAtMs(Date.now() + baseSeconds * 1000);
    setFinished(false);
    setIsRunning(true);
    setNeedsApply(true);
    setLastRecoverySummary(null);
    completedRef.current = false;

    // Start campfire sound when rest begins
    console.log(`[ShortRestTimer] handleStart - starting campfire for ${baseSeconds}s (${Math.ceil(baseSeconds / 60)} minutes)`);
    const durationSecs = baseSeconds;
    
    // Ensure audio context is active (may be suspended on first user interaction)
    resumeAudioContext();
    
    campfireIntervalRef.current = sfx.campfire(durationSecs) as unknown as number;
  };

  const handleCancel = () => {
    // Stop campfire sound if it's playing
    sfx.stopCampfire();
    if (campfireIntervalRef.current !== null) {
      window.clearInterval(campfireIntervalRef.current);
      campfireIntervalRef.current = null;
    }

    setIsRunning(false);
    setFinished(false);
    completedRef.current = false;
    setNeedsApply(false);
    setEndAtMs(null);
    setSecondsLeft(minutes * 60);
    setLastRecoverySummary(null);
    toast.info('Descanso curto cancelado. Nenhuma recuperação foi aplicada.');
  };

  const handleReset = () => {
    // Stop campfire sound if it's playing
    sfx.stopCampfire();
    if (campfireIntervalRef.current !== null) {
      window.clearInterval(campfireIntervalRef.current);
      campfireIntervalRef.current = null;
    }

    setIsRunning(false);
    setFinished(false);
    completedRef.current = false;
    setNeedsApply(false);
    setEndAtMs(null);
    setSecondsLeft(minutes * 60);
    setLastRecoverySummary(null);
  };

  useEffect(() => {
    if (!user) return;

    const state: ShortRestPersistentState = {
      minutes,
      secondsLeft,
      isRunning,
      endAtMs,
      needsApply,
      updatedAtMs: Date.now(),
    };
    writeShortRestState(user.id, state);
  }, [minutes, secondsLeft, isRunning, endAtMs, needsApply, user]);

  useEffect(() => {
    if (!user || initializedRef.current) return;
    initializedRef.current = true;

    const saved = readShortRestState(user.id);
    if (!saved) return;

    const resumedSeconds = getRemainingSeconds(saved);
    const shouldRun = Boolean(saved.isRunning && saved.endAtMs && resumedSeconds > 0);

    setMinutes(clamp(saved.minutes, minMinutes, maxMinutes));
    setSecondsLeft(resumedSeconds);
    setIsRunning(shouldRun);
    setEndAtMs(saved.endAtMs);
    setNeedsApply(Boolean(saved.needsApply));

    // If rest was running when app closed, resume campfire sound
    if (shouldRun && saved.needsApply) {
      console.log(`[ShortRestTimer] ✅ RESUMING rest: ${resumedSeconds}s remaining (${Math.ceil(resumedSeconds / 60)} min)`);
      campfireIntervalRef.current = sfx.campfire(resumedSeconds) as unknown as number;
    } else if (saved.isRunning) {
      console.log(`[ShortRestTimer] ℹ️  Rest was running but time expired or no time remaining`);
    }

    if (saved.isRunning && resumedSeconds <= 0 && saved.needsApply) {
      setIsRunning(false);
      setFinished(true);
      setNeedsApply(false);
      void handleRestComplete();
    }
  }, [user, handleRestComplete]);

  useEffect(() => {
    if (!isRunning || !endAtMs) return;

    const id = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((endAtMs - Date.now()) / 1000));
      setSecondsLeft(remaining);

      if (remaining <= 0) {
        window.clearInterval(id);
        setIsRunning(false);
        setFinished(true);
        setEndAtMs(null);
      }
    }, 1000);

    return () => window.clearInterval(id);
  }, [isRunning, endAtMs]);

  useEffect(() => {
    if (isRunning || !finished || !needsApply) return;
    if (completedRef.current) return;
    
    completedRef.current = true;
    void handleRestComplete();
  }, [isRunning, finished, needsApply]);

  useEffect(() => {
    if (isRunning) return;
    if (finished) return;

    setSecondsLeft(minutes * 60);
  }, [minutes, isRunning, finished]);

  // Cleanup campfire sound on unmount
  useEffect(() => {
    return () => {
      sfx.stopCampfire();
      if (campfireIntervalRef.current !== null) {
        window.clearInterval(campfireIntervalRef.current);
      }
    };
  }, []);

  const canStartRest =
    !isRunning &&
    !shortRestStart.isPending &&
    !shortRestRecovery.isPending &&
    !shortRestAvailability.isLoading &&
    Boolean(shortRestAvailability.data?.canRest ?? true);

  return (
    <div className={`rpg-card space-y-4 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold">Short Rest</h3>
          <p className="text-xs text-muted-foreground">Conclua o timer para recuperar 30% de HP/MP.</p>
        </div>

        <label className="text-xs text-muted-foreground flex items-center gap-2">
          Minutos
          <input
            type="number"
            min={minMinutes}
            max={maxMinutes}
            value={minutes}
            disabled={isRunning}
            onChange={(e) => {
              const value = clamp(Number(e.target.value || safeDefault), minMinutes, maxMinutes);
              setMinutes(value);
              completedRef.current = false;
              if (!isRunning) {
                setSecondsLeft(value * 60);
              }
            }}
            className="w-20 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
          />
        </label>
      </div>

      <div className="relative mx-auto h-64 w-full max-w-md overflow-hidden rounded-xl border border-primary/30">
        <video
          className="absolute inset-0 h-full w-full object-cover"
          src="/videos/short-rest-knight.mp4"
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/35 to-black/40" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_78%,rgba(245,158,11,0.16),transparent_52%)]" />

        <div className="relative flex h-full flex-col items-center justify-end pb-6 text-center">
          <p className="text-5xl font-black leading-none tracking-wide text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)]">{formatted}</p>
          <p className="mt-2 text-sm font-medium text-white/80 drop-shadow-[0_1px_8px_rgba(0,0,0,0.7)]">
            Respire, desacelere e recupere o foco.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={handleStart}
          disabled={!canStartRest}
          className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-2 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-500/25 disabled:opacity-50"
        >
          <Play className="h-4 w-4" />
          Iniciar
        </button>

        <button
          onClick={handleCancel}
          disabled={!isRunning || shortRestRecovery.isPending}
          className="inline-flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/15 px-3 py-2 text-sm font-semibold text-rose-300 transition hover:bg-rose-500/25 disabled:opacity-50"
        >
          <Square className="h-4 w-4" />
          Cancelar
        </button>

        <button
          onClick={handleReset}
          disabled={isRunning || shortRestRecovery.isPending}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm font-semibold text-foreground transition hover:bg-muted/60 disabled:opacity-50"
        >
          <RotateCcw className="h-4 w-4" />
          Reset
        </button>
      </div>

      {shortRestAvailability.isLoading && (
        <p className="text-xs text-muted-foreground">Verificando se o descanso breve está disponível...</p>
      )}

      {shortRestStart.isPending && (
        <p className="text-xs text-muted-foreground">Registrando início do descanso...</p>
      )}

      {!shortRestAvailability.isLoading && shortRestAvailability.data?.canRest && (
        <p className="text-xs text-emerald-300">{shortRestAvailability.data.message}</p>
      )}

      {!shortRestAvailability.isLoading && shortRestAvailability.data && !shortRestAvailability.data.canRest && (
        <p className="text-xs text-amber-300">{shortRestAvailability.data.message}</p>
      )}

      {finished && lastRecoverySummary && (
        <p className="text-xs text-emerald-300">
          Descanso finalizado. Recuperação aplicada: {lastRecoverySummary}.
        </p>
      )}
    </div>
  );
}
