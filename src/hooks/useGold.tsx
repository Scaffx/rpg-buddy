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
      
      // Get current balance
      const { data: bal } = await supabase
        .from('user_balance')
        .select('gold')
        .eq('user_id', user.id)
        .single();
      
      const currentGold = (bal as any)?.gold ?? 100;
      const newGold = currentGold + amount;
      
      await supabase
        .from('user_balance')
        .update({ gold: newGold, updated_at: new Date().toISOString() } as any)
        .eq('user_id', user.id);

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
      
      const { data: bal } = await supabase
        .from('user_balance')
        .select('gold')
        .eq('user_id', user.id)
        .single();
      
      const currentGold = (bal as any)?.gold ?? 0;
      if (currentGold < item.cost_percent) {
        throw new Error('Saldo insuficiente! Ganhe ouro completando missões.');
      }

      const newGold = currentGold - item.cost_percent;
      await supabase
        .from('user_balance')
        .update({ gold: newGold, updated_at: new Date().toISOString() } as any)
        .eq('user_id', user.id);

      // Calculate expiration
      let expiresAt: string | null = null;
      const durMap: Record<string, number> = {
        '50m': 50 * 60 * 1000,
        '1h': 60 * 60 * 1000,
        '1h30m': 90 * 60 * 1000,
        '2h': 2 * 60 * 60 * 1000,
        '3h': 3 * 60 * 60 * 1000,
        '12h': 12 * 60 * 60 * 1000,
        '24h': 24 * 60 * 60 * 1000,
      };
      if (item.duration && durMap[item.duration]) {
        expiresAt = new Date(Date.now() + durMap[item.duration]).toISOString();
      }

      await supabase.from('user_buffs').insert({
        user_id: user.id,
        item_id: item.id,
        expires_at: expiresAt,
      });

      await supabase.from('gold_history' as any).insert({
        user_id: user.id,
        type: 'compra_loja',
        amount: -item.cost_percent,
        reason: `Comprou ${item.name}`,
      } as any);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gold-balance'] });
      queryClient.invalidateQueries({ queryKey: ['user-buffs'] });
      queryClient.invalidateQueries({ queryKey: ['gold-history'] });
    },
  });
}
