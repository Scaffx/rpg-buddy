import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Play, Square, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { useShortRestRecovery } from '@/hooks/useProfile';
import { useAuth } from '@/hooks/useAuth';

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
  minMinutes = 1,
  maxMinutes = 60,
  className = '',
  onRestComplete,
}: ShortRestTimerProps) {
  const { user } = useAuth();
  const safeDefault = clamp(defaultMinutes, minMinutes, maxMinutes);
  
  // Carrega estado do localStorage
  const getInitialState = () => {
    if (!user) return { minutes: safeDefault, secondsLeft: safeDefault * 60, isRunning: false, finishedTime: null };
    const saved = localStorage.getItem(`short_rest_${user.id}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return parsed;
      } catch {
        return { minutes: safeDefault, secondsLeft: safeDefault * 60, isRunning: false, finishedTime: null };
      }
    }
    return { minutes: safeDefault, secondsLeft: safeDefault * 60, isRunning: false, finishedTime: null };
  };

  const initialState = getInitialState();
  const [minutes, setMinutes] = useState<number>(initialState.minutes);
  const [secondsLeft, setSecondsLeft] = useState<number>(initialState.secondsLeft);
  const [isRunning, setIsRunning] = useState(false); // Sempre começa como false ao montar
  const [finished, setFinished] = useState(false);
  const completedRef = useRef(false);

  const shortRestRecovery = useShortRestRecovery();

  const formatted = useMemo(() => {
    const mm = Math.floor(secondsLeft / 60)
      .toString()
      .padStart(2, '0');
    const ss = (secondsLeft % 60).toString().padStart(2, '0');
    return `${mm}:${ss}`;
  }, [secondsLeft]);

  const handleRestComplete = async () => {
    if (completedRef.current) return;
    completedRef.current = true;

    try {
      const result = await shortRestRecovery.mutateAsync();
      toast.success(`Descanso curto completo: +${result.hpRecovered} HP e +${result.mpRecovered} MP`);
      onRestComplete?.();
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível aplicar a recuperação do descanso curto.');
    }
  };

  const handleStart = () => {
    if (secondsLeft <= 0) {
      setSecondsLeft(minutes * 60);
    }
    setFinished(false);
    setIsRunning(true);
  };

  const handleCancel = () => {
    setIsRunning(false);
    setFinished(false);
    completedRef.current = false;
    setSecondsLeft(minutes * 60);
    toast.info('Descanso curto cancelado. Nenhuma recuperação foi aplicada.');
  };

  const handleReset = () => {
    setIsRunning(false);
    setFinished(false);
    completedRef.current = false;
    setSecondsLeft(minutes * 60);
  };

  // Salva estado no localStorage sempre que muda
  useEffect(() => {
    if (!user) return;
    const state = {
      minutes,
      secondsLeft,
      isRunning,
      finishedTime: null,
    };
    localStorage.setItem(`short_rest_${user.id}`, JSON.stringify(state));
  }, [minutes, secondsLeft, isRunning, user]);

  // Verifica se há tempo decorrido offline (se estava rodando e o usuário saiu)
  useEffect(() => {
    if (!user) return;
    const saved = localStorage.getItem(`short_rest_last_check_${user.id}`);
    const lastCheck = saved ? parseInt(saved) : Date.now();
    const elapsedMs = Date.now() - lastCheck;
    const elapsedSeconds = Math.floor(elapsedMs / 1000);

    // Se estava rodando e houve tempo decorrido, desconta dos segundos
    if (initialState.isRunning && elapsedSeconds > 0) {
      setSecondsLeft((prev) => {
        const newSeconds = Math.max(0, prev - elapsedSeconds);
        if (newSeconds === 0 && !completedRef.current) {
          // Se zerou, executa a conclusão
          completedRef.current = true;
          setIsRunning(false);
          setFinished(true);
          void handleRestComplete();
        }
        return newSeconds;
      });
    }

    // Registra o momento do check
    localStorage.setItem(`short_rest_last_check_${user.id}`, Date.now().toString());
  }, [user]);

  useEffect(() => {
    if (!isRunning) return;

    const id = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(id);
          setIsRunning(false);
          setFinished(true);
          void handleRestComplete();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(id);
  }, [isRunning]);

  useEffect(() => {
    if (isRunning) return;
    if (finished) return;

    setSecondsLeft(minutes * 60);
  }, [minutes, isRunning, finished]);

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
          disabled={isRunning || shortRestRecovery.isPending}
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

      {finished && (
        <p className="text-xs text-emerald-300">
          Descanso finalizado. Recuperação aplicada em 30% do HP/MP máximos.
        </p>
      )}
    </div>
  );
}
