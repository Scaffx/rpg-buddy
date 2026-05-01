import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface CompanionRow {
  id: string;
  user_id: string;
  companion_type: string;
  name: string;
  level: number;
  xp: number;
  mood: number;
  last_fed_at: string | null;
  last_played_at: string | null;
  created_at: string;
  updated_at: string;
}

export const COMPANION_TYPES = [
  { id: 'fox',        name: 'Raposa',       emoji: '🦊', description: 'Esperta e ágil, perfeita para aventureiros inquietos.' },
  { id: 'owl',        name: 'Coruja',       emoji: '🦉', description: 'Sábia e vigilante, guia nos caminhos do conhecimento.' },
  { id: 'wolf',       name: 'Lobo',         emoji: '🐺', description: 'Fiel e corajoso, companheiro inabalável em batalhas.' },
  { id: 'dragon_pup', name: 'Dragãozinho',  emoji: '🐲', description: 'Raro e poderoso, cresce com cada vitória do herói.' },
  { id: 'golem',      name: 'Golem',        emoji: '🪨', description: 'Inabalável e disciplinado, ganha força com a rotina.' },
] as const;

export type CompanionTypeId = (typeof COMPANION_TYPES)[number]['id'];

export const MOOD_TIERS = [
  { label: 'Deprimido',  min: 0,  max: 19, color: 'text-red-500',    bg: 'bg-red-500' },
  { label: 'Triste',     min: 20, max: 39, color: 'text-orange-500', bg: 'bg-orange-500' },
  { label: 'Neutro',     min: 40, max: 69, color: 'text-yellow-400', bg: 'bg-yellow-400' },
  { label: 'Feliz',      min: 70, max: 89, color: 'text-emerald-400', bg: 'bg-emerald-400' },
  { label: 'Eufórico',   min: 90, max: 100, color: 'text-cyan-400',  bg: 'bg-cyan-400' },
] as const;

export function getMoodTier(mood: number) {
  return MOOD_TIERS.find((t) => mood >= t.min && mood <= t.max) ?? MOOD_TIERS[0];
}

/** XP required to reach the NEXT level from current level */
export function xpForNextLevel(level: number) {
  return level * 50;
}

/** Compute current mood accounting for time-based decay (1 per hour since last action) */
export function computeLiveMood(companion: CompanionRow): number {
  const lastAction = [companion.last_fed_at, companion.last_played_at, companion.updated_at]
    .filter(Boolean)
    .map((d) => new Date(d!).getTime())
    .sort((a, b) => b - a)[0] ?? Date.now();

  const hoursElapsed = Math.floor((Date.now() - lastAction) / (1000 * 60 * 60));
  return Math.max(0, Math.min(100, companion.mood - hoursElapsed));
}

/** Check if a cooldown (in minutes) has passed since the given timestamp */
export function isCooldownDone(timestamp: string | null, cooldownMinutes: number): boolean {
  if (!timestamp) return true;
  const elapsed = (Date.now() - new Date(timestamp).getTime()) / 60000;
  return elapsed >= cooldownMinutes;
}

export function useCompanion() {
  const { user } = useAuth();
  return useQuery<CompanionRow | null>({
    queryKey: ['companion', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companions' as never)
        .select('*')
        .eq('user_id' as never, user!.id as never)
        .maybeSingle();
      if (error) throw error;
      return (data as CompanionRow | null) ?? null;
    },
    enabled: !!user,
    staleTime: 30 * 1000,
  });
}

export function useCreateCompanion() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ type, name }: { type: string; name: string }) => {
      if (!user) throw new Error('Não autenticado');
      const { error } = await supabase
        .from('companions' as never)
        .insert({ user_id: user.id, companion_type: type, name } as never);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['companion', user?.id] }),
  });
}

export function useInteractCompanion() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      companionId,
      action,
      currentCompanion,
    }: {
      companionId: string;
      action: 'feed' | 'play';
      currentCompanion: CompanionRow;
    }) => {
      if (!user) throw new Error('Não autenticado');

      const moodGain  = action === 'play' ? 20 : 12;
      const xpGain    = action === 'play' ? 20 : 10;
      const liveMood  = computeLiveMood(currentCompanion);
      const newMood   = Math.min(100, liveMood + moodGain);
      const newXp     = Number(currentCompanion.xp ?? 0) + xpGain;
      const xpNeeded  = xpForNextLevel(Number(currentCompanion.level ?? 1));
      const didLevel  = newXp >= xpNeeded;
      const newLevel  = didLevel ? Number(currentCompanion.level ?? 1) + 1 : Number(currentCompanion.level ?? 1);
      const finalXp   = didLevel ? newXp - xpNeeded : newXp;

      const updates: Record<string, unknown> = {
        mood:       newMood,
        xp:         finalXp,
        level:      newLevel,
        updated_at: new Date().toISOString(),
      };
      if (action === 'feed') updates.last_fed_at   = new Date().toISOString();
      if (action === 'play') updates.last_played_at = new Date().toISOString();

      const { error } = await supabase
        .from('companions' as never)
        .update(updates as never)
        .eq('id' as never, companionId as never);

      if (error) throw error;
      return { didLevel, newLevel };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['companion', user?.id] }),
  });
}

/** Called when user completes a mission — silently gives companion XP & mood */
export function useMissionRewardCompanion() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!user) return;
      const { data } = await supabase
        .from('companions' as never)
        .select('id, xp, level, mood, updated_at, last_fed_at, last_played_at')
        .eq('user_id' as never, user.id as never)
        .maybeSingle();
      if (!data) return;
      const companion = data as CompanionRow;
      const liveMood = computeLiveMood(companion);
      const newMood  = Math.min(100, liveMood + 5);
      const newXp    = Number(companion.xp ?? 0) + 15;
      const xpNeeded = xpForNextLevel(Number(companion.level ?? 1));
      const didLevel = newXp >= xpNeeded;
      const newLevel = didLevel ? Number(companion.level ?? 1) + 1 : Number(companion.level ?? 1);
      const finalXp  = didLevel ? newXp - xpNeeded : newXp;
      await supabase
        .from('companions' as never)
        .update({ xp: finalXp, level: newLevel, mood: newMood, updated_at: new Date().toISOString() } as never)
        .eq('id' as never, companion.id as never);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['companion', user?.id] }),
  });
}
