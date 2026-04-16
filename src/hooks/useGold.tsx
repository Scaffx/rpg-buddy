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

  const getWeekToken = (date: Date = new Date()): string => {
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const day = d.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setUTCDate(d.getUTCDate() + diff);
    return d.toISOString().slice(0, 10);
  };

  return useMutation({
    mutationFn: async (item: any) => {
      if (!user) throw new Error('Não autenticado');

      const { data: talents } = await (supabase as any)
        .from('talentos_jogador')
        .select('talentos_disponiveis(efeito)')
        .eq('personagem_id', user.id);

      const hasMerchantTalent = (talents || []).some(
        (row: any) => String(row?.talentos_disponiveis?.efeito || '') === 'mestre_mercador',
      );

      const finalCost = hasMerchantTalent
        ? Math.max(1, Math.floor(Number(item.cost_percent || 0) * 0.9))
        : Number(item.cost_percent || 0);
      
      const { data: bal } = await supabase
        .from('user_balance')
        .select('gold')
        .eq('user_id', user.id)
        .single();
      
      const currentGold = (bal as any)?.gold ?? 0;
      if (currentGold < finalCost) {
        throw new Error('Saldo insuficiente! Ganhe ouro completando missões.');
      }

      const newGold = currentGold - finalCost;
      await supabase
        .from('user_balance')
        .update({ gold: newGold, updated_at: new Date().toISOString() } as any)
        .eq('user_id', user.id);

      if (String(item.effect || '') === 'streak_protector') {
        const { data: profileRow } = await supabase
          .from('profiles')
          .select('streak_protector_charges, streak_protector_max, streak_protector_week')
          .eq('user_id', user.id)
          .maybeSingle();

        const weekToken = getWeekToken();
        const currentWeek = String((profileRow as any)?.streak_protector_week || '');
        const defaultCharges = currentWeek === weekToken ? Number((profileRow as any)?.streak_protector_charges ?? 2) : 2;
        const maxSlots = Math.min(3, Math.max(1, Number((profileRow as any)?.streak_protector_max ?? 3)));
        const nextCharges = Math.min(maxSlots, defaultCharges + 1);

        await supabase
          .from('profiles')
          .update({
            streak_protector_charges: nextCharges,
            streak_protector_max: maxSlots,
            streak_protector_week: weekToken,
          } as any)
          .eq('user_id', user.id);

        await supabase.from('activity_log').insert({
          user_id: user.id,
          action: 'streak_protector_bought',
          description: `Protetor de Streak comprado. Cargas: ${nextCharges}/${maxSlots}`,
          xp_gained: 0,
        });

        await supabase.from('gold_history' as any).insert({
          user_id: user.id,
          type: 'compra_loja',
          amount: -finalCost,
          reason: `Comprou ${item.name}`,
        } as any);

        return;
      }

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
        amount: -finalCost,
        reason: hasMerchantTalent
          ? `Comprou ${item.name} com desconto de talento`
          : `Comprou ${item.name}`,
      } as any);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gold-balance'] });
      queryClient.invalidateQueries({ queryKey: ['user-buffs'] });
      queryClient.invalidateQueries({ queryKey: ['gold-history'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}
