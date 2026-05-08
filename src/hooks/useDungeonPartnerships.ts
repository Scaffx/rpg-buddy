import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

// ── Types ────────────────────────────────────────────────────────────────────

export type BondTier = 0 | 1 | 2 | 3 | 4;

export type Partnership = {
  partner_id: string;
  partner_name: string;
  partner_level: number;
  partner_class: string;
  runs_together: number;
  victories_together: number;
  last_dungeon_at: string;
  bond_tier: BondTier;
  xp_bonus_pct: number;
  gold_bonus_pct: number;
  drop_bonus_pct: number;
};

export const BOND_TIERS: Record<BondTier, { label: string; color: string; icon: string }> = {
  0: { label: 'Conhecidos',           color: 'text-muted-foreground', icon: '🤝' },
  1: { label: 'Companheiros',         color: 'text-sky-400',          icon: '⚔️'  },
  2: { label: 'Parceiros de Batalha', color: 'text-emerald-400',      icon: '🛡️'  },
  3: { label: 'Veteranos',            color: 'text-amber-400',        icon: '🏆'  },
  4: { label: 'Lendas',               color: 'text-purple-400',       icon: '👑'  },
};

export const BOND_THRESHOLDS = [
  { runs: 21, tier: 4 as BondTier },
  { runs: 11, tier: 3 as BondTier },
  { runs: 6,  tier: 2 as BondTier },
  { runs: 3,  tier: 1 as BondTier },
  { runs: 0,  tier: 0 as BondTier },
];

/** Retorna quantas runs faltam para o próximo tier (null se já no máximo). */
export function runsToNextTier(runs: number): { next: BondTier; runsNeeded: number } | null {
  const thresholds = [3, 6, 11, 21];
  for (const t of thresholds) {
    if (runs < t) return { next: getBondTier(t) as BondTier, runsNeeded: t - runs };
  }
  return null; // já Lenda
}

export function getBondTier(runs: number): BondTier {
  if (runs >= 21) return 4;
  if (runs >= 11) return 3;
  if (runs >= 6)  return 2;
  if (runs >= 3)  return 1;
  return 0;
}

// ── Hook: listar parcerias do usuário atual ───────────────────────────────────

export function useDungeonPartnerships() {
  const { user } = useAuth();
  return useQuery<Partnership[]>({
    queryKey: ['dungeon-partnerships', user?.id],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_my_partnerships');
      if (error) throw error;
      return (data ?? []) as Partnership[];
    },
  });
}

/** Retorna o bond com um parceiro específico (por ID), ou null. */
export function usePartnershipWith(partnerId?: string) {
  const { data: partnerships = [] } = useDungeonPartnerships();
  if (!partnerId) return null;
  return partnerships.find((p) => p.partner_id === partnerId) ?? null;
}

// ── Mutation: registrar parceria após dungeon co-op ───────────────────────────

export function useRecordPartnership() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ playerIds, victory }: { playerIds: string[]; victory: boolean }) => {
      const { error } = await (supabase as any).rpc('record_dungeon_partnership', {
        p_player_ids: playerIds,
        p_victory: victory,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dungeon-partnerships', user?.id] });
    },
  });
}

// ── Helper: calcula bônus ativos baseado nas parcerias do grupo ───────────────

/** Dado um array de IDs dos participantes co-op, retorna o bônus combinado
 *  para o usuário atual (XP, Gold, Drop) baseado nos bonds com cada parceiro. */
export function computeGroupBonuses(
  partnerships: Partnership[],
  partnerIds: string[],
): { xpBonus: number; goldBonus: number; dropBonus: number } {
  const matched = partnerships.filter((p) => partnerIds.includes(p.partner_id));
  return matched.reduce(
    (acc, p) => ({
      xpBonus:   Math.max(acc.xpBonus,   p.xp_bonus_pct),
      goldBonus: Math.max(acc.goldBonus, p.gold_bonus_pct),
      dropBonus: Math.max(acc.dropBonus, p.drop_bonus_pct),
    }),
    { xpBonus: 0, goldBonus: 0, dropBonus: 0 },
  );
}
