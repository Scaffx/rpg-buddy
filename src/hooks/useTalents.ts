import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export const MAX_EQUIPPED_TALENTS = 5;

export type Talent = {
  id: string;
  nome: string;
  descricao: string;
  efeito: string;
};

export function useAvailableTalents() {
  return useQuery({
    queryKey: ['talentos-disponiveis'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('talentos_disponiveis')
        .select('id, nome, descricao, efeito')
        .order('nome');
      if (error) throw error;
      return (data || []) as Talent[];
    },
  });
}

export function usePlayerTalents() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['talentos-jogador', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('talentos_jogador')
        .select('id, talento_id, equipped, talentos_disponiveis(id, nome, descricao, efeito)')
        .eq('personagem_id', user!.id);
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!user,
  });
}

export function useTalentEffects() {
  const { data } = usePlayerTalents();
  const effects = new Set<string>();

  for (const row of data || []) {
    if (!row.equipped) continue;
    const efeito = String((row as any).talentos_disponiveis?.efeito || '');
    if (efeito) effects.add(efeito);
  }

  return effects;
}

export function useBuyTalent() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (talento: Talent) => {
      if (!user) throw new Error('Nao autenticado');

      const { error } = await supabase.rpc('buy_talent', { p_talent_id: talento.id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['talentos-jogador'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['activity'] });
    },
  });
}

export function useToggleEquipTalent() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ rowId, currentlyEquipped }: { rowId: string; currentlyEquipped: boolean; equippedCount: number }) => {
      if (!user) throw new Error('Nao autenticado');
      const { error } = await supabase.rpc('set_talent_equipped', {
        p_talent_row_id: rowId,
        p_equipped: !currentlyEquipped,
      });
      if (error) throw error;
    },
    onMutate: async ({ rowId, currentlyEquipped }) => {
      // Optimistic update: toggle equipado imediatamente na cache
      await queryClient.cancelQueries({ queryKey: ['talentos-jogador', user?.id] });
      const previous = queryClient.getQueryData(['talentos-jogador', user?.id]);
      queryClient.setQueryData(['talentos-jogador', user?.id], (old: any) => {
        if (!Array.isArray(old)) return old;
        return old.map((r: any) =>
          r.id === rowId ? { ...r, equipped: !currentlyEquipped } : r
        );
      });
      return { previous };
    },
    onError: (_err, _vars, context: any) => {
      if (context?.previous) {
        queryClient.setQueryData(['talentos-jogador', user?.id], context.previous);
      }
    },
    onSettled: () => {
      // Usa a mesma queryKey com user.id que usePlayerTalents usa
      queryClient.invalidateQueries({ queryKey: ['talentos-jogador', user?.id] });
    },
  });
}
