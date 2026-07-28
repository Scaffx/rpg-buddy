import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import type { FragmentTier } from './usePortalEvent';
import { type RevealLevel, type RevealTier, revealPrice } from '@/lib/portalReveal';

/** Masmorra pendente e quanto dela o jogador já pagou para enxergar. */
export function useDungeonReveal() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['dungeon-reveal', user?.id],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_dungeon_reveal' as never);
      if (error) throw error;
      const row = (Array.isArray(data) ? data[0] : data) as
        | { pending_dungeon?: string | null; reveal_level?: number; dungeon_expires_at?: string | null }
        | undefined;
      return {
        pendingDungeon: (row?.pending_dungeon ?? null) as FragmentTier | null,
        revealLevel: (Number(row?.reveal_level ?? 0) as RevealLevel),
        expiresAt: row?.dungeon_expires_at ?? null,
      };
    },
  });
}

export function useBuyDungeonReveal() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (tier: RevealTier) => {
      const { data, error } = await supabase.rpc('buy_dungeon_reveal' as never, {
        p_level: tier.level,
        p_price: revealPrice(tier),
      } as never);
      if (error) throw error;
      return data as { reveal_level: number; gold_spent: number };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dungeon-reveal', user?.id] });
      qc.invalidateQueries({ queryKey: ['gold-balance'] });
      qc.invalidateQueries({ queryKey: ['my-fragments'] });
    },
  });
}
