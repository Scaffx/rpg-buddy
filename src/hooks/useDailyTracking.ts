import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export function useDailyTracking() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['dailyTracking', user?.id],
    queryFn: async () => {
      if (!user) return { water_ml: 0, meals_count: 0 };

      // Pega a data de hoje no fuso hor�rio local (formato YYYY-MM-DD)
      const today = new Date().toLocaleDateString('en-CA');

      const { data, error } = await supabase
        .from('daily_tracking')
        .select('*')
        .eq('user_id', user.id)
        .eq('date', today)
        .maybeSingle(); // maybeSingle evita erro se n�o achar nada

      if (error) throw error;

      // Se n�o achou registro hoje (virou o dia), retorna 0
      if (!data) {
        return { water_ml: 0, meals_count: 0 };
      }

      return data;
    },
    enabled: !!user,
  });
}

export function useUpdateTracking() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ type, amount }: { type: 'water' | 'meal', amount: number }) => {
      if (!user) throw new Error("Usuário não autenticado");

      const today = new Date().toLocaleDateString('en-CA');
      
      // 1. Primeiro tentamos buscar o registro de hoje
      const { data: currentRecord } = await supabase
        .from('daily_tracking')
        .select('*')
        .eq('user_id', user.id)
        .eq('date', today)
        .maybeSingle();

      const waterToAdd = type === 'water' ? amount : 0;
      const mealsToAdd = type === 'meal' ? amount : 0;

      // 2. Fazemos o Upsert (Cria ou Atualiza)
      const { data, error } = await supabase
        .from('daily_tracking')
        .upsert({
          id: currentRecord?.id, // Se existir, passa o ID para atualizar
          user_id: user.id,
          date: today,
          water_ml: (currentRecord?.water_ml || 0) + waterToAdd,
          meals_count: (currentRecord?.meals_count || 0) + mealsToAdd,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      // Atualiza a tela instantaneamente
      queryClient.invalidateQueries({ queryKey: ['dailyTracking'] });
    },
  });
}

