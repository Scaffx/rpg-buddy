import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { getAttributeLevels, getPlayerCombatStats } from '@/lib/combat';

const db = supabase as any;

function toFiniteNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeRelatedGameItem(raw: unknown): GameItem | null {
  if (Array.isArray(raw)) return (raw[0] as GameItem) || null;
  return (raw as GameItem) || null;
}

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
      return ((data || []) as InventoryItem[]).sort((a, b) => {
        const ra = RARITY_ORDER[a.game_items?.rarity?.toLowerCase() ?? 'comum'] ?? 0;
        const rb = RARITY_ORDER[b.game_items?.rarity?.toLowerCase() ?? 'comum'] ?? 0;
        return ra - rb;
      });
    },
    enabled: !!user,
  });
}

/** Usa um Pergaminho (server-authoritative): aprende a Cinza de Guerra e consome o item. */
export function useUseScroll() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (scrollItemId: string) => {
      if (!user) throw new Error('Não autenticado');
      const { data, error } = await db.rpc('use_scroll', { p_scroll_item_id: scrollItemId });
      if (error) throw error;
      return data as { ok: boolean; learned_node: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['player_skill_nodes', user?.id] });
    },
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

const RARITY_ORDER: Record<string, number> = {
  comum: 0,
  incomum: 1,
  raro: 2,
  epico: 3,
  lendario: 4,
};

export function useShopItems() {
  return useQuery({
    queryKey: ['shop-game-items'],
    queryFn: async () => {
      const { data, error } = await db
        .from('game_items')
        .select('*')
        .gt('shop_price', 0)
        .eq('is_starter', false)
        .is('boss_drop_level', null)
        .in('category', ['weapon', 'armor', 'accessory', 'consumable'])
        .order('category')
        .order('shop_price');
      if (error) throw error;
      return (data as GameItem[]).sort((a, b) => {
        if (a.category !== b.category) return a.category.localeCompare(b.category);
        const ra = RARITY_ORDER[a.rarity?.toLowerCase() ?? 'comum'] ?? 0;
        const rb = RARITY_ORDER[b.rarity?.toLowerCase() ?? 'comum'] ?? 0;
        if (ra !== rb) return ra - rb;
        return (a.shop_price ?? 0) - (b.shop_price ?? 0);
      });
    },
  });
}

export function useBuyEquipment() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const pendingRequests = useRef(new Map<string, string>());

  return useMutation({
    mutationFn: async (item: GameItem) => {
      if (!user) throw new Error('Não autenticado');

      const requestId = pendingRequests.current.get(item.id) ?? crypto.randomUUID();
      pendingRequests.current.set(item.id, requestId);
      const { error } = await db.rpc('purchase_game_item', {
        p_item_id: item.id,
        p_request_id: requestId,
      });
      if (error) throw error;
      return item.id;
    },
    onSuccess: (itemId) => {
      pendingRequests.current.delete(itemId);
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

      const { error } = await db.rpc('set_inventory_equipped', {
        p_inventory_id: inventoryId,
        p_equipped: equipped,
        p_replace_weapon: false,
      });
      if (error) throw error;
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

      const { error } = await db.rpc('set_inventory_attunement', {
        p_inventory_id: inventoryId,
        p_attuned: !sintonizado,
      });
      if (error) throw error;
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
    mutationFn: async ({ inventoryId }: { inventoryId: string; quantity: number }) => {
      if (!user) throw new Error('Não autenticado');

      const { data: inventoryRow, error: inventoryError } = await db
        .from('user_inventory')
        .select('id, item_id, quantity, game_items(name, effect, is_consumable)')
        .eq('id', inventoryId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (inventoryError) throw inventoryError;

      const relatedItem = normalizeRelatedGameItem(inventoryRow?.game_items);
      const itemEffect = String(relatedItem?.effect || '').trim().toLowerCase();
      const itemName = String(relatedItem?.name || '');
      // Consider consumable if is_consumable flag is set OR if effect is defined (for older items)
      const isConsumable = Boolean(relatedItem?.is_consumable) || !!itemEffect;

      // Claim the charge before applying its effect; the server validates ownership,
      // quantity and the Alquimista Amador chance under a row lock.
      const { data: consumption, error: consumeError } = await db.rpc('consume_inventory_item', {
        p_inventory_id: inventoryId,
      });
      if (consumeError) throw consumeError;
      const preserveCharge = Boolean(consumption?.preserved);

      if (isConsumable && itemEffect) {
        const [{ data: profile }, { data: attrs }] = await Promise.all([
          db.from('profiles').select('level').eq('user_id', user.id).maybeSingle(),
          db.from('attributes').select('name, level').eq('user_id', user.id),
        ]);

        const { data: healthStats, error: healthError } = await db
          .from('user_health_stats')
          .select('max_hp, current_hp, max_mp, current_mp, fatigue')
          .eq('user_id', user.id)
          .maybeSingle();

        if (healthError) throw healthError;

        const computed = getPlayerCombatStats(
          Number(profile?.level ?? 1),
          getAttributeLevels((attrs || []) as any[]),
        );

        const effectiveMaxHp = Math.max(
          toFiniteNumber(healthStats?.max_hp, 100),
          toFiniteNumber(computed.hp, 100),
        );
        const effectiveMaxMp = Math.max(
          toFiniteNumber(healthStats?.max_mp, 10),
          toFiniteNumber((computed as any).mp, 10),
        );

        const baseStats = {
          max_hp: effectiveMaxHp,
          current_hp: toFiniteNumber(healthStats?.current_hp, effectiveMaxHp),
          max_mp: effectiveMaxMp,
          current_mp: toFiniteNumber(healthStats?.current_mp, 0),
          fatigue: toFiniteNumber(healthStats?.fatigue, 0),
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
            const payload = {
              ...updates,
              max_hp: baseStats.max_hp,
              max_mp: baseStats.max_mp,
            };
            const { error: updateHealthError } = await db
              .from('user_health_stats')
              .update(payload)
              .eq('user_id', user.id);
            if (updateHealthError) throw updateHealthError;
          } else {
            const { error: insertHealthError } = await db.from('user_health_stats').insert({
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

      if (preserveCharge) {
        await supabase.from('activity_log').insert({
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
      queryClient.invalidateQueries({ queryKey: ['health_stats'] });
      queryClient.refetchQueries({ queryKey: ['health_stats', user?.id], type: 'active' });
    },
  });
}

/** Claims a bounded catalog kit once; the server selects the class and item IDs. */
function useClaimKit(kind: 'starter' | 'class') {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (_starterClass?: string) => {
      if (!user) throw new Error('Não autenticado');
      const { data, error } = await db.rpc('claim_inventory_kit', { p_kind: kind });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}

export function useClaimStarterKit() { return useClaimKit('starter'); }
export function useClaimClassKit() { return useClaimKit('class'); }
export function useGrantOnboardingKit() { return useClaimKit('starter'); }
