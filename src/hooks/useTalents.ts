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
      const { data, error } = await (supabase as any)
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
      const { data, error } = await (supabase as any)
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

      const { data: profile, error: profileError } = await (supabase as any)
        .from('profiles')
        .select('pontos_talento')
        .eq('user_id', user.id)
        .single();

      if (profileError) throw profileError;

      const pontos = Number((profile as any)?.pontos_talento ?? 0);
      if (pontos <= 0) {
        throw new Error('Voce nao tem pontos de talento suficientes.');
      }

      const { data: existing } = await (supabase as any)
        .from('talentos_jogador')
        .select('id')
        .eq('personagem_id', user.id)
        .eq('talento_id', talento.id)
        .maybeSingle();

      if (existing) {
        throw new Error('Talento ja adquirido.');
      }

      // Auto-equipar se ainda houver vaga (até MAX_EQUIPPED_TALENTS).
      // Evita o paradoxo do usuário comprar um talento e ele não estar
      // equipado/ativo até ele tomar uma segunda ação manual.
      const { count: currentlyEquipped } = await (supabase as any)
        .from('talentos_jogador')
        .select('id', { count: 'exact', head: true })
        .eq('personagem_id', user.id)
        .eq('equipped', true);

      const shouldAutoEquip = (currentlyEquipped ?? 0) < MAX_EQUIPPED_TALENTS;

      const { error: insertError } = await (supabase as any)
        .from('talentos_jogador')
        .insert({
          personagem_id: user.id,
          talento_id: talento.id,
          equipped: shouldAutoEquip,
        });

      if (insertError) throw insertError;

      const { error: updateError } = await (supabase as any)
        .from('profiles')
        .update({ pontos_talento: pontos - 1 })
        .eq('user_id', user.id);

      if (updateError) throw updateError;

      await supabase.from('activity_log').insert({
        user_id: user.id,
        action: 'talent_bought',
        description: `Talento adquirido: ${talento.nome}`,
        xp_gained: 0,
      });
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
    mutationFn: async ({ rowId, currentlyEquipped, equippedCount }: { rowId: string; currentlyEquipped: boolean; equippedCount: number }) => {
      if (!user) throw new Error('Nao autenticado');

      if (!currentlyEquipped && equippedCount >= MAX_EQUIPPED_TALENTS) {
        throw new Error(`Limite de ${MAX_EQUIPPED_TALENTS} talentos equipados atingido.`);
      }

      const { error } = await (supabase as any)
        .from('talentos_jogador')
        .update({ equipped: !currentlyEquipped })
        .eq('id', rowId)
        .eq('personagem_id', user.id);

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
