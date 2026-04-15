import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

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
        .select('id, talento_id, talentos_disponiveis(id, nome, descricao, efeito)')
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

      const { error: insertError } = await (supabase as any)
        .from('talentos_jogador')
        .insert({
          personagem_id: user.id,
          talento_id: talento.id,
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
