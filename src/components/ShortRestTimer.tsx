import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Play, Square, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { sfx } from '@/lib/sfx';
import { useShortRestAvailability, useShortRestRecovery } from '@/hooks/useProfile';
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

  const formatted = useMemo(() => formatSeconds(secondsLeft), [secondsLeft]);

  const handleRestComplete = async () => {
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
  };

  const handleStart = () => {
    if (shortRestAvailability.isLoading) {
      toast.info('Verificando disponibilidade do descanso breve...');
      return;
    }

    if (shortRestAvailability.data && !shortRestAvailability.data.canRest) {
      toast.warning(shortRestAvailability.data.message);
      return;
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

    if (saved.isRunning && resumedSeconds <= 0 && saved.needsApply) {
      setIsRunning(false);
      setFinished(true);
      setNeedsApply(false);
      void handleRestComplete();
    }
  }, [user]);

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
    if (!isRunning || !finished || !needsApply) return;
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

      <div className="relative overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-b from-amber-500/10 via-orange-500/10 to-rose-500/5 p-5">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_80%,rgba(251,146,60,0.25),transparent_60%)]" />

        <div className="relative mx-auto h-40 w-40">
          <motion.div
            className="absolute left-1/2 top-8 h-24 w-16 -translate-x-1/2 rounded-full bg-orange-400/25 blur-2xl"
            animate={{ opacity: [0.45, 0.7, 0.45], scale: [0.95, 1.05, 0.95] }}
            transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
          />

          <motion.div
            className="absolute left-1/2 bottom-8 h-14 w-10 -translate-x-1/2 rounded-full bg-orange-500"
            animate={{ scaleY: [1, 1.25, 1], scaleX: [1, 0.9, 1], opacity: [0.8, 1, 0.8] }}
            transition={{ repeat: Infinity, duration: 1.4, ease: 'easeInOut' }}
          />

          <motion.div
            className="absolute left-1/2 bottom-10 h-11 w-8 -translate-x-1/2 rounded-full bg-yellow-300"
            animate={{ scaleY: [1, 1.2, 1], opacity: [0.8, 1, 0.75] }}
            transition={{ repeat: Infinity, duration: 1.1, ease: 'easeInOut' }}
          />

          <motion.div
            className="absolute left-[43%] bottom-5 h-2 w-10 rounded-full bg-stone-500/70"
            animate={{ rotate: [-3, 3, -3] }}
            transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }}
          />
          <motion.div
            className="absolute left-[47%] bottom-4 h-2 w-10 rounded-full bg-stone-600/75"
            animate={{ rotate: [3, -3, 3] }}
            transition={{ repeat: Infinity, duration: 3.8, ease: 'easeInOut' }}
          />
        </div>

        <div className="relative text-center">
          <p className="text-4xl font-extrabold tracking-wide text-foreground">{formatted}</p>
          <p className="mt-1 text-xs text-muted-foreground">Respire, desacelere e recupere o foco.</p>
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
