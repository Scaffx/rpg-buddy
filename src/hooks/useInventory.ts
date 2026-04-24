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
  requer_sintonizacao?: boolean;
  stat_label: string | null;
  atk_bonus: number;
  matk_bonus: number;
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
  sintonizado?: boolean;
  obtained_at: string;
  game_items: GameItem;
};

export type EquipmentBonuses = {
  atk: number;
  matk: number;
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
  const equipped = inventory.filter((inv) => {
    if (!inv.equipped || !inv.game_items) return false;
    const requiresAttunement = Boolean(
      inv.game_items.requer_sintonizacao ||
      ['epico', 'lendario'].includes(String(inv.game_items.rarity || '').toLowerCase()),
    );

    // Itens mágicos (épicos/lendários) só concedem bônus quando sintonizados.
    if (requiresAttunement && !inv.sintonizado) return false;
    return true;
  });
  return {
    atk: equipped.reduce((s, inv) => s + (inv.game_items.atk_bonus || 0), 0),
    matk: equipped.reduce((s, inv) => s + (inv.game_items.matk_bonus || 0), 0),
    def: equipped.reduce((s, inv) => s + (inv.game_items.def_bonus || 0), 0),
    hp: equipped.reduce((s, inv) => s + (inv.game_items.hp_bonus || 0), 0),
    mp: equipped.reduce((s, inv) => s + (inv.game_items.mp_bonus || 0), 0),
    agi: equipped.reduce((s, inv) => s + (inv.game_items.agi_bonus || 0), 0),
    crit: equipped.reduce((s, inv) => s + (inv.game_items.crit_bonus || 0), 0),
  };
}

/** Compare two items: returns positive if itemA is better overall */
export function compareItems(a: GameItem, b: GameItem): number {
  const scoreA = (a.atk_bonus || 0) + (a.matk_bonus || 0) + (a.def_bonus || 0) + (a.hp_bonus || 0) * 0.5 + (a.mp_bonus || 0) * 0.5 + (a.agi_bonus || 0) + (a.crit_bonus || 0) * 2;
  const scoreB = (b.atk_bonus || 0) + (b.matk_bonus || 0) + (b.def_bonus || 0) + (b.hp_bonus || 0) * 0.5 + (b.mp_bonus || 0) * 0.5 + (b.agi_bonus || 0) + (b.crit_bonus || 0) * 2;
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

      if (!equipped) {
        await db.from('user_inventory').update({ equipped: false }).eq('id', inventoryId).eq('user_id', user.id);
        return;
      }

      const { data: itemRow, error: itemError } = await db
        .from('user_inventory')
        .select('id, user_id, equipped, sintonizado, game_items(rarity, category)')
        .eq('id', inventoryId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (itemError) throw itemError;
      if (!itemRow) throw new Error('Item não encontrado no inventário.');

      // --- Limites por categoria ---
      const category = String(itemRow?.game_items?.category || '').toLowerCase();
      const SLOT_LIMITS: Record<string, number> = { armor: 1, weapon: 2, accessory: 3 };
      const limit = SLOT_LIMITS[category];
      if (limit !== undefined) {
        const { data: equippedRows, error: countError } = await db
          .from('user_inventory')
          .select('id, game_items!inner(category)')
          .eq('user_id', user.id)
          .eq('equipped', true)
          .neq('id', inventoryId);

        if (countError) throw countError;
        const equippedCount = (equippedRows || []).filter(
          (row: any) => String(row?.game_items?.category || '').toLowerCase() === category,
        ).length;
        if ((equippedCount || 0) >= limit) {
          const labels: Record<string, string> = { armor: 'armadura', weapon: 'arma', accessory: 'acessório' };
          throw new Error(
            `Limite de ${labels[category] ?? category} atingido (${limit}/${limit}). Desequipe um item antes de equipar outro.`,
          );
        }
      }

      const rarity = String(itemRow?.game_items?.rarity || '').toLowerCase();
      const requiresAttunement = ['epico', 'lendario'].includes(rarity);

      if (requiresAttunement && !itemRow.sintonizado) {
        const { count: attunedCount, error: countError } = await db
          .from('user_inventory')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('sintonizado', true);

        if (countError) throw countError;
        if ((attunedCount || 0) >= 3) {
          throw new Error('Limite de sintonização atingido (3/3). Desequipe ou dessintonize um item mágico para continuar.');
        }

        await db
          .from('user_inventory')
          .update({ sintonizado: true, equipped: true })
          .eq('id', inventoryId)
          .eq('user_id', user.id);
        return;
      }

      await db.from('user_inventory').update({ equipped: true }).eq('id', inventoryId).eq('user_id', user.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}

export function useToggleAttunement() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ inventoryId, sintonizado }: { inventoryId: string; sintonizado: boolean }) => {
      if (!user) throw new Error('Não autenticado');

      if (sintonizado) {
        await db.from('user_inventory').update({ sintonizado: false }).eq('id', inventoryId).eq('user_id', user.id);
        return;
      }

      const { data: itemRow, error: itemError } = await db
        .from('user_inventory')
        .select('id, sintonizado, game_items(rarity)')
        .eq('id', inventoryId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (itemError) throw itemError;
      if (!itemRow) throw new Error('Item não encontrado no inventário.');

      const rarity = String(itemRow?.game_items?.rarity || '').toLowerCase();
      const requiresAttunement = ['epico', 'lendario'].includes(rarity);

      if (!requiresAttunement) {
        throw new Error('Este item não exige sintonização.');
      }

      const { count: attunedCount, error: countError } = await db
        .from('user_inventory')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('sintonizado', true);

      if (countError) throw countError;
      if ((attunedCount || 0) >= 3) {
        throw new Error('Limite de sintonização atingido (3/3). Desequipe ou dessintonize um item mágico para continuar.');
      }

      await db.from('user_inventory').update({ sintonizado: true }).eq('id', inventoryId).eq('user_id', user.id);
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
        .select('id, item_id, quantity, game_items(name, effect, is_consumable)')
        .eq('id', inventoryId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (inventoryError) throw inventoryError;

      const itemEffect = String(inventoryRow?.game_items?.effect || '');
      const itemName = String(inventoryRow?.game_items?.name || '');
      // Consider consumable if is_consumable flag is set OR if effect is defined (for older items)
      const isConsumable = Boolean(inventoryRow?.game_items?.is_consumable) || !!itemEffect;

      const { data: talents } = await (supabase as any)
        .from('talentos_jogador')
        .select('talentos_disponiveis(efeito)')
        .eq('personagem_id', user.id);

      const hasAlquimistaAmador = (talents || []).some(
        (row: any) => String(row?.talentos_disponiveis?.efeito || '') === 'alquimista_amador',
      );

      const isPotionLike = isConsumable && (
        itemEffect.startsWith('heal_') ||
        itemEffect.startsWith('mana_') ||
        itemEffect === 'full_rest' ||
        itemName.toLowerCase().includes('pocao')
      );

      const preserveCharge = hasAlquimistaAmador && isPotionLike && Math.random() < 0.1;

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

      if (!preserveCharge) {
        if (quantity <= 1) {
          await db.from('user_inventory').delete().eq('id', inventoryId).eq('user_id', user.id);
        } else {
          await db.from('user_inventory').update({ quantity: quantity - 1 }).eq('id', inventoryId).eq('user_id', user.id);
        }
      }

      if (preserveCharge) {
        await (supabase as any).from('activity_log').insert({
          user_id: user.id,
          action: 'alquimista_amador_proc',
          description: `Alquimista Amador preservou a carga de ${itemName}.`,
          xp_gained: 0,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['health_stats', user?.id] });
      queryClient.refetchQueries({ queryKey: ['health_stats', user?.id], type: 'active' });
    },
  });
}

export function useClaimStarterKit() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (_starterClass?: string) => {
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

      // Always give the novato kit (4 basic items)
      const { data: noviceItems, error: itemsErr } = await db
        .from('game_items')
        .select('*')
        .eq('is_starter', true)
        .eq('starter_class', 'novato');

      if (itemsErr) throw itemsErr;

      for (const item of (noviceItems || [])) {
        await db.from('user_inventory').upsert({
          user_id: user.id,
          item_id: item.id,
          quantity: 1,
          equipped: true,
        }, { onConflict: 'user_id,item_id' });
      }

      // Also give starter consumables (potions)
      const { data: potions } = await db
        .from('game_items')
        .select('*')
        .eq('is_starter', true)
        .eq('is_consumable', true);

      for (const potion of (potions || [])) {
        await db.from('user_inventory').upsert({
          user_id: user.id,
          item_id: potion.id,
          quantity: 2,
          equipped: false,
        }, { onConflict: 'user_id,item_id' });
      }

      // Mark novato kit as claimed
      await supabase.from('profiles').update({ starter_kit_claimed: true } as any).eq('user_id', user.id);

      return noviceItems;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}

/** Concede o kit de equipamentos da classe escolhida (chamado ao selecionar classe no lv5) */
export function useClaimClassKit() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (starterClass: string) => {
      if (!user) throw new Error('Não autenticado');

      // Check if already claimed
      const { data: profile } = await supabase
        .from('profiles')
        .select('class_kit_claimed')
        .eq('user_id', user.id)
        .single();

      if ((profile as any)?.class_kit_claimed) {
        return []; // silently skip
      }

      // Get class-specific gear (weapon + armor only — no novato, no consumables)
      const { data: classItems, error: itemsErr } = await db
        .from('game_items')
        .select('*')
        .eq('is_starter', true)
        .eq('starter_class', starterClass)
        .eq('is_consumable', false);

      if (itemsErr) throw itemsErr;

      for (const item of (classItems || [])) {
        await db.from('user_inventory').upsert({
          user_id: user.id,
          item_id: item.id,
          quantity: 1,
          equipped: false, // player equips manually
        }, { onConflict: 'user_id,item_id' });
      }

      // Mark class kit as claimed
      await supabase.from('profiles').update({ class_kit_claimed: true } as any).eq('user_id', user.id);

      return classItems;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory', user?.id] });
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
