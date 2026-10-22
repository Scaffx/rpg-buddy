import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { requireRpcObject } from '@/lib/rpcPayload';

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
        const { error: ensureError } = await supabase.rpc('ensure_user_balance');
        if (ensureError) throw ensureError;
        const { data: newBalance, error: readError } = await supabase
          .from('user_balance').select('*').eq('user_id', user!.id).single();
        if (readError) throw readError;
        return newBalance;
      }
      return data;
    },
    enabled: !!user,
  });
}

export type AdventureIncome7d = {
  gold: number;
  wins: number;
  days: number;
  dailyGold: number;
};

export function useAdventureIncome7d() {
  const { user } = useAuth();
  return useQuery<AdventureIncome7d>({
    queryKey: ['adventure-income-7d', user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_adventure_income_7d');
      if (error) throw error;
      const value = requireRpcObject(data, 'get_adventure_income_7d');
      const gold = Number(value.gold);
      const wins = Number(value.wins);
      const days = Number(value.days);
      const dailyGold = Number(value.daily_gold);
      if (![gold, wins, days, dailyGold].every(Number.isFinite) || days !== 7
        || gold < 0 || wins < 0 || dailyGold < 0) {
        throw new Error('Renda da aventura inválida no servidor.');
      }
      return { gold, wins, days, dailyGold };
    },
  });
}

export function useClaimClassGoldReward() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase.rpc('claim_class_gold_reward');
      if (error) throw error;
      const result = requireRpcObject(data, 'claim_class_gold_reward');
      if (result.ok !== true || typeof result.already_claimed !== 'boolean') throw new Error('Ouro não confirmado pelo servidor.');
      return { ok: true, already_claimed: result.already_claimed };
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
