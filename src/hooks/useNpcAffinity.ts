import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface AffinityRow {
  npc_id: string;
  affinity_xp: number;
  affinity_level: number;
}

export const AFFINITY_TIERS = [
  { level: 0, label: 'Desconhecido', minXp: 0,   color: 'text-muted-foreground', bg: 'bg-muted/20',    icon: '❓' },
  { level: 1, label: 'Conhecido',    minXp: 25,  color: 'text-blue-400',         bg: 'bg-blue-500/20',   icon: '🤝' },
  { level: 2, label: 'Amigo',        minXp: 75,  color: 'text-emerald-400',      bg: 'bg-emerald-500/20', icon: '😊' },
  { level: 3, label: 'Aliado',       minXp: 175, color: 'text-violet-400',       bg: 'bg-violet-500/20', icon: '⚔️' },
  { level: 4, label: 'Companheiro',  minXp: 375, color: 'text-orange-400',       bg: 'bg-orange-500/20', icon: '🛡️' },
  { level: 5, label: 'Lendário',     minXp: 625, color: 'text-yellow-400',       bg: 'bg-yellow-500/20', icon: '✨' },
] as const;

export function getAffinityTier(xp: number) {
  let tier = AFFINITY_TIERS[0];
  for (const t of AFFINITY_TIERS) {
    if (xp >= t.minXp) tier = t;
  }
  return tier;
}

export function getAffinityProgress(xp: number) {
  const tierIdx = AFFINITY_TIERS.findIndex((t) => t.minXp > xp) - 1;
  const clampedIdx = Math.min(Math.max(tierIdx, 0), AFFINITY_TIERS.length - 2);
  const current = AFFINITY_TIERS[clampedIdx];
  const next = AFFINITY_TIERS[clampedIdx + 1];
  if (!next) return { pct: 100, xpInTier: 0, xpNeeded: 0 };
  const xpInTier = xp - current.minXp;
  const xpNeeded = next.minXp - current.minXp;
  return { pct: Math.round((xpInTier / xpNeeded) * 100), xpInTier, xpNeeded };
}

export function useNpcAffinity() {
  const { user } = useAuth();
  return useQuery<AffinityRow[]>({
    queryKey: ['npc_affinity', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('npc_affinity')
        .select('npc_id, affinity_xp, affinity_level')
        .eq('user_id', user!.id);
      if (error) throw error;
      return (data ?? []) as AffinityRow[];
    },
    enabled: !!user,
    staleTime: 30 * 1000,
  });
}

export function useIncrementNpcAffinity() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ npcId, xpAmount = 25 }: { npcId: string; xpAmount?: number }) => {
      if (!user) throw new Error('Não autenticado');

      const { data: existing } = await supabase
        .from('npc_affinity')
        .select('id, affinity_xp')
        .eq('user_id', user.id)
        .eq('npc_id', npcId)
        .maybeSingle();

      const existingRow = existing as { id: string; affinity_xp: number } | null;
      const newXp = Number(existingRow?.affinity_xp ?? 0) + xpAmount;
      const newLevel = AFFINITY_TIERS.filter((t) => newXp >= t.minXp).length - 1;

      if (existingRow) {
        await supabase
          .from('npc_affinity')
          .update({
            affinity_xp: newXp,
            affinity_level: newLevel,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingRow.id);
      } else {
        await supabase
          .from('npc_affinity')
          .insert({
            user_id: user.id,
            npc_id: npcId,
            affinity_xp: newXp,
            affinity_level: newLevel,
          });
      }

      return { newXp, newLevel };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['npc_affinity', user?.id] });
    },
  });
}
