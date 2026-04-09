import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export function useInventory() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['inventory', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_inventory' as any)
        .select('*, game_items(*)')
        .eq('user_id' as any, user!.id);
      if (error) throw error;
      return data as any[];
    },
    enabled: !!user,
  });
}

export function useGameItems(category?: string) {
  return useQuery({
    queryKey: ['game-items', category],
    queryFn: async () => {
      let q = supabase.from('game_items' as any).select('*');
      if (category) q = q.eq('category' as any, category);
      const { data, error } = await q;
      if (error) throw error;
      return data as any[];
    },
  });
}

export function useShopItems() {
  return useQuery({
    queryKey: ['shop-game-items'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('game_items' as any)
        .select('*')
        .not('shop_price', 'is', null)
        .order('category')
        .order('rarity')
        .order('shop_price');
      if (error) throw error;
      return data as any[];
    },
  });
}

export function useBuyEquipment() {
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
      if (currentGold < item.shop_price) {
        throw new Error('Ouro insuficiente!');
      }

      // Desconta ouro
      const newGold = currentGold - item.shop_price;
      await supabase
        .from('user_balance')
        .update({ gold: newGold, updated_at: new Date().toISOString() } as any)
        .eq('user_id', user.id);

      // Adiciona ao inventário (ou incrementa se stackable)
      if (item.stackable) {
        const { data: existing } = await supabase
          .from('user_inventory' as any)
          .select('id, quantity')
          .eq('user_id' as any, user.id)
          .eq('item_id' as any, item.id)
          .maybeSingle();

        if (existing) {
          await supabase
            .from('user_inventory' as any)
            .update({ quantity: (existing as any).quantity + 1 } as any)
            .eq('id', (existing as any).id);
        } else {
          await supabase.from('user_inventory' as any).insert({
            user_id: user.id,
            item_id: item.id,
            quantity: 1,
            equipped: false,
          });
        }
      } else {
        // Não-stackable: verifica se já tem
        const { data: existing } = await supabase
          .from('user_inventory' as any)
          .select('id')
          .eq('user_id' as any, user.id)
          .eq('item_id' as any, item.id)
          .maybeSingle();

        if (existing) throw new Error('Você já possui esse item!');

        await supabase.from('user_inventory' as any).insert({
          user_id: user.id,
          item_id: item.id,
          quantity: 1,
          equipped: false,
        });
      }

      // Registra no histórico
      await supabase.from('gold_history' as any).insert({
        user_id: user.id,
        type: 'compra_equipamento',
        amount: -item.shop_price,
        reason: `Comprou ${item.name}`,
      } as any);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gold-balance'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['gold-history'] });
    },
  });
}

export function useToggleEquip() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ inventoryId, equipped }: { inventoryId: string; equipped: boolean }) => {
      if (!user) throw new Error('Não autenticado');
      await supabase
        .from('user_inventory' as any)
        .update({ equipped } as any)
        .eq('id' as any, inventoryId)
        .eq('user_id' as any, user.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}

export function useConsumeItem() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ inventoryId, quantity }: { inventoryId: string; quantity: number }) => {
      if (!user) throw new Error('Não autenticado');
      if (quantity <= 1) {
        await supabase.from('user_inventory' as any).delete().eq('id' as any, inventoryId).eq('user_id' as any, user.id);
      } else {
        await supabase
          .from('user_inventory' as any)
          .update({ quantity: quantity - 1 } as any)
          .eq('id' as any, inventoryId)
          .eq('user_id' as any, user.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}
