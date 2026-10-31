import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import type { JourneyChoice } from '@/lib/adventureJourney';

const choice = z.enum(['restore', 'explore']);
const journey = z.object({
  stage: z.number().int().min(1).max(100000),
  cycle: z.number().int().min(1).max(2000),
  chapter: z.number().int().min(1).max(5),
  view_cycle: z.number().int().min(1).max(2000),
  choices: z.array(z.object({
    chapter: z.number().int().min(1).max(5),
    choice,
    chosen_at: z.string().datetime({ offset: true }),
  })).max(5),
});
const receipt = z.object({
  cycle: z.number().int().min(1).max(2000),
  chapter: z.number().int().min(1).max(5),
  choice,
  replayed: z.boolean(),
});

export type AdventureJourneyState = z.infer<typeof journey>;
export function parseAdventureJourney(value: unknown): AdventureJourneyState {
  const state = journey.parse(value);
  const expectedCycle = Math.floor((state.stage - 1) / 50) + 1;
  const expectedChapter = Math.floor(((state.stage - 1) % 50) / 10) + 1;
  if (state.cycle !== expectedCycle || state.chapter !== expectedChapter || state.view_cycle > state.cycle ||
      new Set(state.choices.map(row => row.chapter)).size !== state.choices.length) {
    throw new Error('JOURNEY_INVALID_RESPONSE');
  }
  return state;
}

const errors: Record<string, string> = {
  JOURNEY_CHAPTER_LOCKED: 'Este marco ainda não está disponível no progresso confirmado pelo servidor.',
  JOURNEY_CHOICE_CONFLICT: 'Você já escolheu outro caminho neste capítulo. Atualize a jornada.',
  JOURNEY_INVALID_CHOICE: 'Esta escolha não está disponível.',
  JOURNEY_STATE_UNAVAILABLE: 'A etapa da aventura ainda não foi confirmada. Tente novamente.',
  NOT_AUTHENTICATED: 'Entre na sua conta para registrar o caminho.',
  JOURNEY_INVALID_RESPONSE: 'A resposta da jornada veio incompleta. Tente atualizar.',
};
export function adventureJourneyError(error: unknown) {
  if (error instanceof z.ZodError) return errors.JOURNEY_INVALID_RESPONSE;
  const message = error && typeof error === 'object' && 'message' in error
    ? String(error.message ?? '') : typeof error === 'string' ? error : '';
  return errors[message] ?? 'Não foi possível atualizar a jornada. Tente novamente.';
}

export function useAdventureJourney(presentationStage: number, viewCycle: number | null = null) {
  const { user, continuity } = useAuth();
  const scope = `${user?.id ?? 'signed-out'}:${continuity.epoch}`;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const qc = useQueryClient();
  const key = ['adventure-journey', user?.id, continuity.epoch, viewCycle] as const;
  const requestedStage = useRef<{ scope: string; stage: number } | null>(null);
  const query = useQuery({
    queryKey: key,
    enabled: !!user,
    retry: false,
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_adventure_journey' as never, { p_cycle: viewCycle } as never);
      if (error) throw error;
      return parseAdventureJourney(data);
    },
  });
  const confirmedQueryStage = query.data?.stage;
  const refetch = query.refetch;
  useEffect(() => {
    if (!user || confirmedQueryStage == null || presentationStage === confirmedQueryStage ||
        (requestedStage.current?.scope === `${scope}:${viewCycle}` && requestedStage.current.stage === presentationStage)) return;
    requestedStage.current = { scope: `${scope}:${viewCycle}`, stage: presentationStage };
    void refetch();
  }, [user, scope, viewCycle, presentationStage, confirmedQueryStage, refetch]);
  const save = useMutation({
    mutationFn: async (request: { cycle: number; chapter: number; choice: JourneyChoice; scope: string }) => {
      if (!user || request.scope !== scopeRef.current) throw new Error('NOT_AUTHENTICATED');
      const { data, error } = await supabase.rpc('save_adventure_journey_choice' as never, {
        p_cycle: request.cycle, p_chapter: request.chapter, p_choice: request.choice,
      } as never);
      if (error) throw error;
      const saved = receipt.parse(data);
      if (saved.cycle !== request.cycle || saved.chapter !== request.chapter || saved.choice !== request.choice)
        throw new Error('JOURNEY_INVALID_RESPONSE');
      return saved;
    },
    onSuccess: async (_saved, request) => {
      if (scopeRef.current === request.scope) await qc.invalidateQueries({ queryKey: key });
    },
  });
  return {
    ...query,
    scope,
    save,
    saveChoice: (cycle: number, chapter: number, selected: JourneyChoice) =>
      save.mutateAsync({ cycle, chapter, choice: selected, scope }),
  };
}
