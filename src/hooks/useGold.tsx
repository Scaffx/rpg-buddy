import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export function useGoldBalance() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['gold-balance', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_balance')
        .select('*')
        .eq('user_id', user!.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        const { data: newBal, error: insertErr } = await supabase
          .from('user_balance')
          .insert({ user_id: user!.id, balance_percent: 100, gold: 100 } as any)
          .select()
          .single();
        if (insertErr) throw insertErr;
        return newBal;
      }
      return data;
    },
    enabled: !!user,
  });
}

export function useAddGold() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ amount, reason, type }: { amount: number; reason: string; type: string }) => {
      if (!user) throw new Error('Not authenticated');

      // 🔒 Server-side: crédito de ouro via add_gold_to_user (auth.uid() + clamp).
      const { error } = await supabase.rpc('add_gold_to_user', { p_user_id: user.id, p_gold: amount });
      if (error) throw error;

      await supabase.from('gold_history' as any).insert({
        user_id: user.id,
        type,
        amount,
        reason,
      } as any);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gold-balance'] });
      queryClient.invalidateQueries({ queryKey: ['gold-history'] });
    },
  });
}

export function useBuyItem() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (item: any) => {
      if (!user) throw new Error('Não autenticado');

      // 🔒 Server-side: custo lido do banco, desconto de talento, protetor de
      // streak e buffs são tratados no RPC buy_shop_item (transacional). O
      // client não decide mais o custo nem mexe no saldo diretamente.
      const today = new Date().toLocaleDateString('en-CA');
      const { error } = await supabase.rpc('buy_shop_item', {
        p_item_id: item.id,
        p_today: today,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gold-balance'] });
      queryClient.invalidateQueries({ queryKey: ['user-buffs'] });
      queryClient.invalidateQueries({ queryKey: ['gold-history'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}
