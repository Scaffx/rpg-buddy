import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

const db = supabase as any;

export type GameItem = {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  category: string;
  rarity: string;
  stat_label: string | null;
  atk_bonus: number;
  def_bonus: number;
  hp_bonus: number;
  mp_bonus: number;
  agi_bonus: number;
  crit_bonus: number;
  shop_price: number | null;
  stackable: boolean;
  is_consumable: boolean;
  effect: string | null;
  level_required: number;
  is_starter: boolean;
  starter_class: string | null;
  boss_drop_level: number | null;
};

export type InventoryItem = {
  id: string;
  user_id: string;
  item_id: string;
  quantity: number;
  equipped: boolean;
  obtained_at: string;
  game_items: GameItem;
};

export type EquipmentBonuses = {
  atk: number;
  def: number;
  hp: number;
  mp: number;
  agi: number;
  crit: number;
};

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
      return (data || []) as InventoryItem[];
    },
    enabled: !!user,
  });
}

/** Calculate total bonuses from equipped items */
export function getEquipmentBonuses(inventory: InventoryItem[]): EquipmentBonuses {
  const equipped = inventory.filter(inv => inv.equipped && inv.game_items);
  return {
    atk: equipped.reduce((s, inv) => s + (inv.game_items.atk_bonus || 0), 0),
    def: equipped.reduce((s, inv) => s + (inv.game_items.def_bonus || 0), 0),
    hp: equipped.reduce((s, inv) => s + (inv.game_items.hp_bonus || 0), 0),
    mp: equipped.reduce((s, inv) => s + (inv.game_items.mp_bonus || 0), 0),
    agi: equipped.reduce((s, inv) => s + (inv.game_items.agi_bonus || 0), 0),
    crit: equipped.reduce((s, inv) => s + (inv.game_items.crit_bonus || 0), 0),
  };
}

/** Compare two items: returns positive if itemA is better overall */
export function compareItems(a: GameItem, b: GameItem): number {
  const scoreA = (a.atk_bonus || 0) + (a.def_bonus || 0) + (a.hp_bonus || 0) * 0.5 + (a.mp_bonus || 0) * 0.5 + (a.agi_bonus || 0) + (a.crit_bonus || 0) * 2;
  const scoreB = (b.atk_bonus || 0) + (b.def_bonus || 0) + (b.hp_bonus || 0) * 0.5 + (b.mp_bonus || 0) * 0.5 + (b.agi_bonus || 0) + (b.crit_bonus || 0) * 2;
  return scoreA - scoreB;
}

export function useGameItems(category?: string) {
  return useQuery({
    queryKey: ['game-items', category],
    queryFn: async () => {
      let q = db.from('game_items').select('*');
      if (category) q = q.eq('category', category);
      const { data, error } = await q;
      if (error) throw error;
      return data as GameItem[];
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
      return data as GameItem[];
    },
  });
}

export function useBuyEquipment() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (item: GameItem) => {
      if (!user) throw new Error('Não autenticado');

      const { data: bal } = await supabase
        .from('user_balance')
        .select('gold')
        .eq('user_id', user.id)
        .single();

      const currentGold = (bal as any)?.gold ?? 0;
      if (currentGold < (item.shop_price || 0)) {
        throw new Error('Ouro insuficiente!');
      }

      const newGold = currentGold - (item.shop_price || 0);
      await supabase
        .from('user_balance')
        .update({ gold: newGold, updated_at: new Date().toISOString() } as any)
        .eq('user_id', user.id);

      if (item.stackable) {
        const { data: existing } = await db
          .from('user_inventory')
          .select('id, quantity')
          .eq('user_id', user.id)
          .eq('item_id', item.id)
          .maybeSingle();

        if (existing) {
          await db.from('user_inventory').update({ quantity: existing.quantity + 1 }).eq('id', existing.id);
        } else {
          await db.from('user_inventory').insert({ user_id: user.id, item_id: item.id, quantity: 1, equipped: false });
        }
      } else {
        const { data: existing } = await db
          .from('user_inventory')
          .select('id')
          .eq('user_id', user.id)
          .eq('item_id', item.id)
          .maybeSingle();

        if (existing) throw new Error('Você já possui esse item!');
        await db.from('user_inventory').insert({ user_id: user.id, item_id: item.id, quantity: 1, equipped: false });
      }

      await supabase.from('gold_history').insert({
        user_id: user.id,
        type: 'compra_equipamento',
        amount: -(item.shop_price || 0),
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
      await db.from('user_inventory').update({ equipped }).eq('id', inventoryId).eq('user_id', user.id);
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

      const itemEffect = String(inventoryRow?.game_items?.effect || '');
      const isConsumable = Boolean(inventoryRow?.game_items?.is_consumable);

      if (isConsumable && itemEffect) {
        const { data: healthStats, error: healthError } = await db
          .from('user_health_stats')
          .select('max_hp, current_hp, max_mp, current_mp, fatigue')
          .eq('user_id', user.id)
          .maybeSingle();

        if (healthError) throw healthError;

        const baseStats = {
          max_hp: Number(healthStats?.max_hp ?? 100),
          current_hp: Number(healthStats?.current_hp ?? 100),
          max_mp: Number(healthStats?.max_mp ?? 10),
          current_mp: Number(healthStats?.current_mp ?? 10),
          fatigue: Number(healthStats?.fatigue ?? 0),
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
            await db.from('user_health_stats').update(updates).eq('user_id', user.id);
          } else {
            await db.from('user_health_stats').insert({
              user_id: user.id,
              max_hp: baseStats.max_hp,
              current_hp: Number(updates.current_hp ?? baseStats.current_hp),
              max_mp: baseStats.max_mp,
              current_mp: Number(updates.current_mp ?? baseStats.current_mp),
              fatigue: Number(updates.fatigue ?? baseStats.fatigue),
              last_reset_date: (updates.last_reset_date as string) ?? new Date().toISOString().split('T')[0],
            });
          }
        }
      }

      if (quantity <= 1) {
        await db.from('user_inventory').delete().eq('id', inventoryId).eq('user_id', user.id);
      } else {
        await db.from('user_inventory').update({ quantity: quantity - 1 }).eq('id', inventoryId).eq('user_id', user.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['health_stats'] });
    },
  });
}

export function useClaimStarterKit() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (starterClass: string) => {
      if (!user) throw new Error('Não autenticado');

      // Check if already claimed
      const { data: profile } = await supabase
        .from('profiles')
        .select('starter_kit_claimed')
        .eq('user_id', user.id)
        .single();

      if ((profile as any)?.starter_kit_claimed) {
        throw new Error('Kit inicial já foi resgatado!');
      }

      // Get starter items for class + consumables
      const { data: starterItems, error: itemsErr } = await db
        .from('game_items')
        .select('*')
        .eq('is_starter', true)
        .or(`starter_class.eq.${starterClass},starter_class.is.null`);

      if (itemsErr) throw itemsErr;

      // Filter: class-specific items + consumable starters
      const classItems = (starterItems || []).filter((i: any) =>
        i.starter_class === starterClass || (i.is_consumable && i.is_starter)
      );

      for (const item of classItems) {
        const isConsumable = item.category === 'consumable';
        await db.from('user_inventory').upsert({
          user_id: user.id,
          item_id: item.id,
          quantity: isConsumable ? 3 : 1,
          equipped: !isConsumable,
        }, { onConflict: 'user_id,item_id' });
      }

      // Mark as claimed
      await supabase.from('profiles').update({ starter_kit_claimed: true } as any).eq('user_id', user.id);

      return classItems;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}

export function useGrantBossLoot() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (bossLevel: number) => {
      if (!user) throw new Error('Não autenticado');

      // Find drop item for this boss level
      const { data: dropItem, error } = await db
        .from('game_items')
        .select('*')
        .eq('boss_drop_level', bossLevel)
        .maybeSingle();

      if (error) throw error;
      if (!dropItem) return null;

      // Check if already has it
      const { data: existing } = await db
        .from('user_inventory')
        .select('id, quantity')
        .eq('user_id', user.id)
        .eq('item_id', dropItem.id)
        .maybeSingle();

      if (existing) return dropItem; // Already has it

      await db.from('user_inventory').insert({
        user_id: user.id,
        item_id: dropItem.id,
        quantity: 1,
        equipped: false,
      });

      return dropItem as GameItem;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}
