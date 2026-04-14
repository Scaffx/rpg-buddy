import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

const db = supabase as any;

export function useInventory() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['inventory', user?.id],
    queryFn: async () => {
      const { data, error } = await db
        .from('user_inventory')
        .select('*, game_items(*)')
        .eq('user_id', user!.id);
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
      let q = db.from('game_items').select('*');
      if (category) q = q.eq('category', category);
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
      const { data, error } = await db
        .from('game_items')
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
        const { data: existing } = await db
          .from('user_inventory')
          .select('id, quantity')
          .eq('user_id', user.id)
          .eq('item_id', item.id)
          .maybeSingle();

        if (existing) {
          await db
            .from('user_inventory')
            .update({ quantity: existing.quantity + 1 })
            .eq('id', existing.id);
        } else {
          await db.from('user_inventory').insert({
            user_id: user.id,
            item_id: item.id,
            quantity: 1,
            equipped: false,
          });
        }
      } else {
        const { data: existing } = await db
          .from('user_inventory')
          .select('id')
          .eq('user_id', user.id)
          .eq('item_id', item.id)
          .maybeSingle();

        if (existing) throw new Error('Você já possui esse item!');

        await db.from('user_inventory').insert({
          user_id: user.id,
          item_id: item.id,
          quantity: 1,
          equipped: false,
        });
      }

      // Registra no histórico
      await supabase.from('gold_history').insert({
        user_id: user.id,
        type: 'compra_equipamento',
        amount: -item.shop_price,
        reason: `Comprou ${item.name}`,
      });
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
      await db
        .from('user_inventory')
        .update({ equipped })
        .eq('id', inventoryId)
        .eq('user_id', user.id);
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

      const { data: inventoryRow, error: inventoryError } = await db
        .from('user_inventory')
        .select('id, item_id, quantity, game_items(effect, is_consumable)')
        .eq('id', inventoryId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (inventoryError) throw inventoryError;

      const itemEffect = String((inventoryRow as any)?.game_items?.effect || '');
      const isConsumable = Boolean((inventoryRow as any)?.game_items?.is_consumable);

      if (isConsumable && itemEffect) {
        const { data: healthStats, error: healthError } = await db
          .from('user_health_stats')
          .select('max_hp, current_hp, max_mp, current_mp, fatigue')
          .eq('user_id', user.id)
          .maybeSingle();

        if (healthError) throw healthError;

        const baseStats = {
          max_hp: Number((healthStats as any)?.max_hp ?? 100),
          current_hp: Number((healthStats as any)?.current_hp ?? 100),
          max_mp: Number((healthStats as any)?.max_mp ?? 10),
          current_mp: Number((healthStats as any)?.current_mp ?? 10),
          fatigue: Number((healthStats as any)?.fatigue ?? 0),
        };

        const updates: Record<string, number | string> = {};

        if (itemEffect.startsWith('heal_')) {
          const healAmount = Number(itemEffect.replace('heal_', '')) || 0;
          updates.current_hp = Math.min(baseStats.max_hp, baseStats.current_hp + healAmount);
        }

        if (itemEffect.startsWith('mana_')) {
          const manaAmount = Number(itemEffect.replace('mana_', '')) || 0;
          updates.current_mp = Math.min(baseStats.max_mp, baseStats.current_mp + manaAmount);
        }

        if (itemEffect === 'full_rest') {
          updates.current_hp = baseStats.max_hp;
          updates.current_mp = baseStats.max_mp;
          updates.fatigue = 0;
          updates.last_reset_date = new Date().toISOString().split('T')[0];
        }

        if (Object.keys(updates).length > 0) {
          if (healthStats) {
            const { error: updateHealthError } = await db
              .from('user_health_stats')
              .update(updates)
              .eq('user_id', user.id);

            if (updateHealthError) throw updateHealthError;
          } else {
            const { error: insertHealthError } = await db
              .from('user_health_stats')
              .insert({
                user_id: user.id,
                max_hp: baseStats.max_hp,
                current_hp: Number(updates.current_hp ?? baseStats.current_hp),
                max_mp: baseStats.max_mp,
                current_mp: Number(updates.current_mp ?? baseStats.current_mp),
                fatigue: Number(updates.fatigue ?? baseStats.fatigue),
                last_reset_date: (updates.last_reset_date as string) ?? new Date().toISOString().split('T')[0],
              });

            if (insertHealthError) throw insertHealthError;
          }
        }
      }

      if (quantity <= 1) {
        await db.from('user_inventory').delete().eq('id', inventoryId).eq('user_id', user.id);
      } else {
        await db
          .from('user_inventory')
          .update({ quantity: quantity - 1 })
          .eq('id', inventoryId)
          .eq('user_id', user.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['health_stats'] });
    },
  });
}
