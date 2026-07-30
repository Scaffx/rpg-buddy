import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

/**
 * Combate em andamento do usuário, de qualquer sistema (boss solo ou masmorra).
 *
 * O estado sempre viveu no servidor (combates_ativos / dungeon_sessions); o que
 * faltava era poder perguntar "tem luta rolando?" de qualquer tela. É isso que
 * sustenta o combate em janela flutuante e o retomar depois de um refresh.
 */

export type ActiveCombat = {
  kind: 'boss' | 'dungeon';
  combatId: string;
  referenceId: string;
  label: string;
  hpPlayer: number;
  hpPlayerMax: number | null;
  hpEnemy: number | null;
  hpEnemyMax: number | null;
  turn: string | null;
  updatedAt: string;
};

export const ACTIVE_COMBAT_KEY = 'active-combat';

export function useActiveCombat() {
  const { user } = useAuth();

  return useQuery<ActiveCombat | null>({
    queryKey: [ACTIVE_COMBAT_KEY, user?.id],
    enabled: !!user,
    // O combate avança por ação do jogador; um refetch frequente só gastaria
    // requisição. Quem age invalida a chave.
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_active_combat' as any);
      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return null;

      return {
        kind: row.kind === 'dungeon' ? 'dungeon' : 'boss',
        combatId: String(row.combat_id),
        referenceId: String(row.reference_id ?? ''),
        label: String(row.label ?? ''),
        hpPlayer: Number(row.hp_player ?? 0),
        hpPlayerMax: row.hp_player_max != null ? Number(row.hp_player_max) : null,
        hpEnemy: row.hp_enemy != null ? Number(row.hp_enemy) : null,
        hpEnemyMax: row.hp_enemy_max != null ? Number(row.hp_enemy_max) : null,
        turn: row.turn != null ? String(row.turn) : null,
        updatedAt: String(row.updated_at ?? new Date().toISOString()),
      };
    },
  });
}

/** Encerra a luta de boss em andamento, liberando o jogador para começar outra. */
export function useAbandonActiveCombat() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('abandon_active_combat' as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [ACTIVE_COMBAT_KEY, user?.id] });
      qc.invalidateQueries({ queryKey: ['combates_ativos'] });
    },
  });
}

/** Rota para onde o "retomar" deve levar, conforme a origem do combate. */
export function activeCombatRoute(combat: ActiveCombat): string {
  return combat.kind === 'dungeon' ? '/portal' : '/boss';
}
