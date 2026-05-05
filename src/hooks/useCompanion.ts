import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface CompanionRow {
  id: string;
  user_id: string;
  companion_type: string;
  origin: string;
  name: string;
  level: number;
  xp: number;
  mood: number;
  equipped_item_id: string | null;
  last_fed_at: string | null;
  last_played_at: string | null;
  created_at: string;
  updated_at: string;
}

// ── Animal companions (lv 3 unlock, one-time choice) ─────────────────────────

export const COMPANION_TYPES = [
  {
    id: 'dog',
    name: 'Cachorro',
    emoji: '🐕',
    description: 'Leal e energético, sempre pronto para explorar cada nova aventura com você.',
  },
  {
    id: 'cat',
    name: 'Gato',
    emoji: '🐈',
    description: 'Independente e misterioso, com uma intuição afiada que revela segredos ocultos.',
  },
  {
    id: 'calopsita',
    name: 'Calopsita',
    emoji: '🐦',
    description: 'Esperta e barulhenta, aprende habilidades raras e repete feitiços que ouve nas batalhas.',
  },
] as const;

export type AnimalCompanionId = (typeof COMPANION_TYPES)[number]['id'];

// ── Skeleton companion (boss story reward) ────────────────────────────────────

export const SKELETON_PUP = {
  id: 'skeleton_pup',
  name: 'Filhote de Esqueleto',
  emoji: '💀',
  description: 'Filho do Esqueletão Campeão. Pequeno, mas de osso duro. Cresce com cada batalha do herói.',
} as const;

// ── Mood system ───────────────────────────────────────────────────────────────

export const MOOD_TIERS = [
  { label: 'Deprimido',  min: 0,  max: 19, color: 'text-red-500',     bg: 'bg-red-500' },
  { label: 'Triste',     min: 20, max: 39, color: 'text-orange-500',  bg: 'bg-orange-500' },
  { label: 'Neutro',     min: 40, max: 69, color: 'text-yellow-400',  bg: 'bg-yellow-400' },
  { label: 'Feliz',      min: 70, max: 89, color: 'text-emerald-400', bg: 'bg-emerald-400' },
  { label: 'Eufórico',   min: 90, max: 100, color: 'text-cyan-400',   bg: 'bg-cyan-400' },
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

// ── Queries ──────────────────────────────────────────────────────────────────

async function fetchAllCompanions(userId: string): Promise<CompanionRow[]> {
  const { data, error } = await supabase
    .from('companions' as never)
    .select('*')
    .eq('user_id' as never, userId as never)
    .order('created_at' as never, { ascending: true } as never);
  if (error) throw error;
  return (data ?? []) as CompanionRow[];
}

/** Fetches ALL companions for the user in a single round-trip. */
export function useAllCompanions() {
  const { user } = useAuth();
  return useQuery<CompanionRow[], Error, CompanionRow[]>({
    queryKey: ['companions_all', user?.id],
    queryFn: () => fetchAllCompanions(user!.id),
    enabled: !!user,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  });
}

/** Returns the lv-3 animal companion (origin = 'lvl3_choice'), or null */
export function useCompanion() {
  const { user } = useAuth();
  return useQuery<CompanionRow[], Error, CompanionRow | null>({
    queryKey: ['companions_all', user?.id],
    queryFn: () => fetchAllCompanions(user!.id),
    select: (rows) => rows.find((c) => c.origin === 'lvl3_choice') ?? null,
    enabled: !!user,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  });
}

/** Returns the skeleton pup companion (origin = 'boss_story'), or null */
export function useSkeletonCompanion() {
  const { user } = useAuth();
  return useQuery<CompanionRow[], Error, CompanionRow | null>({
    queryKey: ['companions_all', user?.id],
    queryFn: () => fetchAllCompanions(user!.id),
    select: (rows) => rows.find((c) => c.origin === 'boss_story') ?? null,
    enabled: !!user,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  });
}

/**
 * True quando o jogador venceu pelo menos um boss de esqueleto.
 * Usado para destravar a adoção do Ossinho na página de companheiros.
 */
export function useSkeletonBossDefeated() {
  const { user } = useAuth();
  return useQuery<boolean>({
    queryKey: ['skeleton_boss_defeated', user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: skeletonBosses, error: bossErr } = await (supabase as any)
        .from('bosses')
        .select('id')
        .ilike('name', '%esquelet%');
      if (bossErr) throw bossErr;
      const ids = (skeletonBosses ?? []).map((b: any) => b.id);
      if (ids.length === 0) return false;
      const { count, error } = await (supabase as any)
        .from('boss_battles')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user!.id)
        .eq('won', true)
        .in('boss_id', ids);
      if (error) throw error;
      return (count ?? 0) > 0;
    },
  });
}
// ── Mutations ─────────────────────────────────────────────────────────────────

export function useCreateCompanion() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ type, name }: { type: string; name: string }) => {
      if (!user) throw new Error('Não autenticado');
      const { data, error } = await supabase
        .from('companions' as never)
        .insert({ user_id: user.id, companion_type: type, origin: 'lvl3_choice', name } as never)
        .select('*')
        .single();
      if (error) throw error;
      return data as CompanionRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['companions_all', user?.id] }),
  });
}

export function useAdoptSkeletonPup() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      if (!user) throw new Error('Não autenticado');
      const { error } = await supabase
        .from('companions' as never)
        .insert({
          user_id: user.id,
          companion_type: 'skeleton_pup',
          origin: 'boss_story',
          name,
        } as never);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['companions_all', user?.id] }),
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
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ['companions_all', user?.id] });
    },
  });
}

/** Called when user completes a mission — silently gives companion XP & mood */
export function useMissionRewardCompanion() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!user) return;
      // Update all companions of this user
      const { data: allCompanions } = await supabase
        .from('companions' as never)
        .select('id, xp, level, mood, updated_at, last_fed_at, last_played_at')
        .eq('user_id' as never, user.id as never);

      for (const c of (allCompanions ?? []) as CompanionRow[]) {
        const liveMood = computeLiveMood(c);
        const newMood  = Math.min(100, liveMood + 5);
        const newXp    = Number(c.xp ?? 0) + 15;
        const xpNeeded = xpForNextLevel(Number(c.level ?? 1));
        const didLevel = newXp >= xpNeeded;
        const newLevel = didLevel ? Number(c.level ?? 1) + 1 : Number(c.level ?? 1);
        const finalXp  = didLevel ? newXp - xpNeeded : newXp;
        await supabase
          .from('companions' as never)
          .update({ xp: finalXp, level: newLevel, mood: newMood, updated_at: new Date().toISOString() } as never)
          .eq('id' as never, c.id as never);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['companions_all', user?.id] });
    },
  });
}



