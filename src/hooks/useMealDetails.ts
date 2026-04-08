import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface MealRecord {
  id: string;
  user_id: string;
  meal_date: string;
  meal_number: number;
  food_description: string;
  calories: number | null;
  quantity: string;
  beverages: string | null;
  retention_days: number;
  expires_at: string;
  created_at: string;
}

export function useMealHistory() {
  const { user } = useAuth();
  const today = new Date().toLocaleDateString('en-CA');

  return useQuery({
    queryKey: ['mealHistory', user?.id, today],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from('meal_log')
        .select('*')
        .eq('user_id', user.id)
        .eq('meal_date', today)
        .order('logged_at', { ascending: false });

      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!user,
  });
}

export function useAddMealDetail() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      mealNumber,
      foodDescription,
      calories,
      quantity,
      beverages,
      retentionDays,
    }: {
      mealNumber: number;
      foodDescription: string;
      calories: number | null;
      quantity: string;
      beverages: string | null;
      retentionDays: 3 | 7 | 30;
    }) => {
      if (!user) throw new Error('Usuário não autenticado');

      const today = new Date().toLocaleDateString('en-CA');

      const { error } = await supabase.from('meal_log').insert({
        user_id: user.id,
        meal_date: today,
        meal_number: mealNumber,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mealHistory'] });
      queryClient.invalidateQueries({ queryKey: ['meal_log'] });
    },
  });
}

export function useDeleteMealRecord() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (recordId: string) => {
      if (!user) throw new Error('Usuário não autenticado');

      const { error } = await supabase
        .from('meal_log')
        .delete()
        .eq('id', recordId)
        .eq('user_id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mealHistory'] });
    },
  });
}

export function useUpdateMealRecord() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      recordId,
      foodDescription,
      calories,
      quantity,
      beverages,
      retentionDays,
    }: {
      recordId: string;
      foodDescription: string;
      calories: number | null;
      quantity: string;
      beverages: string | null;
      retentionDays: 3 | 7 | 30;
    }) => {
      if (!user) throw new Error('Usuário não autenticado');

      const { error } = await supabase
        .from('meal_log')
        .update({
          meal_number: 1,
        } as any)
        .eq('id', recordId)
        .eq('user_id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mealHistory'] });
    },
  });
}
