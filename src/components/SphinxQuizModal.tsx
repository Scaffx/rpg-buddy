import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';

export type QuizResult = { correct: number; total: number; passed: boolean; perfect: boolean };

type QuizQuestion = { id: string; question: string; options: string[]; correct_index: number };

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Quiz da Esfinge/Djinn (roadmap #6). Modal de "enigmas": o jogador precisa
 * resolver as perguntas para enfrentar o boss. Acertos garantem vantagem;
 * errar deixa a Esfinge mais perigosa (golpe especial +50%).
 */
export default function SphinxQuizModal({
  open,
  bossName,
  difficulty,
  count,
  passThreshold,
  onComplete,
  onCancel,
}: {
  open: boolean;
  bossName: string;
  difficulty: 'easy' | 'hard';
  count: number;
  /** Fração mínima de acertos (0..1) para passar e poder enfrentar o boss. */
  passThreshold: number;
  onComplete: (result: QuizResult) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();

  const { data: pool = [], isLoading } = useQuery({
    queryKey: ['quiz_questions', difficulty],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quiz_questions')
        .select('id, question, options, correct_index')
        .eq('difficulty', difficulty);
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  // Sorteio das perguntas desta tentativa (refeito a cada abertura).
  const [seed, setSeed] = useState(0);
  const questions: QuizQuestion[] = useMemo(() => {
    const list = shuffle(pool as any[]).slice(0, count).map((q) => ({
      id: String(q.id),
      question: String(q.question),
      options: Array.isArray(q.options) ? (q.options as string[]) : [],
      correct_index: Number(q.correct_index),
    }));
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool, count, seed]);

  const [step, setStep] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);

  // Reinicia o estado a cada (re)abertura.
  useEffect(() => {
    if (open) {
      setStep(0);
      setCorrect(0);
      setPicked(null);
      setSeed((s) => s + 1);
    }
  }, [open]);

  const current = questions[step];
  const total = questions.length;

  const handlePick = (idx: number) => {
    if (picked !== null || !current) return;
    setPicked(idx);
    const isRight = idx === current.correct_index;
    const newCorrect = correct + (isRight ? 1 : 0);
    if (isRight) setCorrect(newCorrect);
    window.setTimeout(() => {
      if (step + 1 >= total) {
        const passed = total > 0 && newCorrect / total >= passThreshold;
        const perfect = total > 0 && newCorrect === total;
        onComplete({ correct: newCorrect, total, passed, perfect });
      } else {
        setStep(step + 1);
        setPicked(null);
      }
    }, 900);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center gap-2">
            🦁 {t('app.quiz.title', { boss: bossName })}
          </DialogTitle>
          <DialogDescription>
            {t('app.quiz.subtitle')}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : total === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            {t('app.quiz.no_questions')}
            <div className="mt-4">
              <Button variant="outline" className="w-full" onClick={onCancel}>{t('app.quiz.back')}</Button>
            </div>
          </div>
        ) : current ? (
          <div className="space-y-4">
            {/* Progresso */}
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{t('app.quiz.progress', { n: step + 1, total })}</span>
              <span className="font-mono">✅ {correct}</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-amber-400 transition-all" style={{ width: `${(step / total) * 100}%` }} />
            </div>

            {/* Pergunta */}
            <p className="text-base font-semibold text-foreground leading-snug">{current.question}</p>

            {/* Opções */}
            <div className="grid gap-2">
              {current.options.map((opt, idx) => {
                const isAnswered = picked !== null;
                const isCorrect = idx === current.correct_index;
                const isPicked = picked === idx;
                const cls = !isAnswered
                  ? 'border-border bg-secondary hover:border-amber-400/60 hover:bg-amber-400/5'
                  : isCorrect
                    ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-200'
                    : isPicked
                      ? 'border-rose-500/60 bg-rose-500/15 text-rose-200'
                      : 'border-border bg-secondary opacity-60';
                return (
                  <button
                    key={idx}
                    onClick={() => handlePick(idx)}
                    disabled={isAnswered}
                    className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition ${cls}`}
                  >
                    <span>{opt}</span>
                    {isAnswered && isCorrect && <CheckCircle2 className="w-4 h-4 shrink-0" />}
                    {isAnswered && isPicked && !isCorrect && <XCircle className="w-4 h-4 shrink-0" />}
                  </button>
                );
              })}
            </div>

            {picked !== null && picked !== current.correct_index && (
              <p className="text-xs text-rose-300">{t('app.quiz.wrong_warning')}</p>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
