import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

const recipeSchema = z.object({
  id: z.string().uuid(), stage: z.number().int().positive(), realm: z.string(),
  hero_class: z.string(), level_required: z.number().int().positive(),
  gold_cost: z.number().int().nonnegative(), scrap_cost: z.number().int().nonnegative(),
  essence_cost: z.number().int().nonnegative(), item_id: z.string().uuid(),
  item_name: z.string(), item_icon: z.string(), item_stats: z.string().nullable(),
  rarity: z.string(), unlocked: z.boolean(), unlocked_at: z.string().nullable(),
});
const duplicateSchema = z.object({
  inventory_id: z.string().uuid(), item_id: z.string().uuid(), name: z.string(),
  icon: z.string(), quantity: z.number().int().positive(), equipped: z.boolean(),
  scrap_return: z.number().int().positive(),
});
const receiptSchema = z.object({
  battle_id: z.string().uuid(), stage: z.number().int().positive(),
  historical: z.boolean(), recorded_at: z.string(),
});
const craftingStateSchema = z.object({
  level: z.number().int().positive(), hero_class: z.string().nullable(),
  craft_class: z.string().nullable(),
  server_now: z.string(), gold: z.number().int().nonnegative(),
  next_boss_stage: z.number().int().positive(),
  recipe_count: z.number().int().nonnegative(),
  materials: z.record(z.number().int().nonnegative()),
  recipes: z.array(recipeSchema), duplicates: z.array(duplicateSchema),
  recent_receipts: z.array(receiptSchema),
});
const actionSchema = z.object({
  ok: z.literal(true), replayed: z.boolean(),
});

export type CraftingState = z.infer<typeof craftingStateSchema>;
export type CraftingRecipe = z.infer<typeof recipeSchema>;

export function craftingErrorMessage(error: unknown): string {
  const fields = error && typeof error === 'object'
    ? error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown }
    : {};
  const raw = (typeof error === 'string' && error.trim())
    || [fields.message, fields.details, fields.hint, fields.code]
      .find((value): value is string => typeof value === 'string' && !!value.trim())
    || 'Não foi possível concluir a operação.';
  const messages: Record<string, string> = {
    NOT_AUTHENTICATED: 'Entre na sua conta para usar a oficina.',
    PROFILE_NOT_FOUND: 'Perfil não encontrado. Recarregue a página.',
    RECIPE_LOCKED: 'Vença o chefe da etapa para liberar esta receita.',
    RECIPE_CLASS_REQUIRED: 'Esta receita pertence a outra classe.',
    RECIPE_LEVEL_REQUIRED: 'Complete rotinas até atingir o nível exigido.',
    INSUFFICIENT_GOLD: 'Ouro insuficiente para fabricar este item.',
    INSUFFICIENT_MATERIALS: 'Faltam materiais para fabricar este item.',
    SALVAGE_DUPLICATE_REQUIRED: 'Mantenha uma cópia não equipada do item.',
    ITEM_NOT_SALVAGEABLE: 'Este item não pode ser desmontado.',
    CRAFT_REQUEST_CONFLICT: 'A solicitação de fabricação foi reutilizada para outra receita.',
    SALVAGE_REQUEST_CONFLICT: 'A solicitação de desmontagem foi reutilizada para outro item.',
  };
  const found = Object.keys(messages).find((key) => raw.includes(key));
  return found ? messages[found] : raw || 'Não foi possível concluir a operação.';
}

export function useCraftingState() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['crafting-state', user?.id], enabled: !!user,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_crafting_state' as never);
      if (error) throw error;
      return craftingStateSchema.parse(data);
    },
  });
}

export function useCraftBossRecipe() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const requestIds = useRef(new Map<string, string>());
  return useMutation({
    mutationFn: async (recipeId: string) => {
      if (!user) throw new Error('NOT_AUTHENTICATED');
      const requestId = requestIds.current.get(recipeId) ?? crypto.randomUUID();
      requestIds.current.set(recipeId, requestId);
      const { data, error } = await supabase.rpc('craft_boss_recipe' as never, {
        p_recipe_id: recipeId, p_request_id: requestId,
      } as never);
      if (error) throw error;
      const result = actionSchema.extend({ item_id: z.string().uuid() }).parse(data);
      requestIds.current.delete(recipeId);
      return result;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crafting-state', user?.id] });
      qc.invalidateQueries({ queryKey: ['inventory', user?.id] });
      qc.invalidateQueries({ queryKey: ['gold-balance'] });
    },
  });
}

export function useSalvageDuplicate() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const requestIds = useRef(new Map<string, string>());
  return useMutation({
    mutationFn: async ({ inventoryId, quantity }: { inventoryId: string; quantity: number }) => {
      if (!user) throw new Error('NOT_AUTHENTICATED');
      const key = `${inventoryId}:${quantity}`;
      const requestId = requestIds.current.get(key) ?? crypto.randomUUID();
      requestIds.current.set(key, requestId);
      const { data, error } = await supabase.rpc('salvage_inventory_duplicate' as never, {
        p_inventory_id: inventoryId, p_quantity: quantity, p_request_id: requestId,
      } as never);
      if (error) throw error;
      const result = actionSchema.extend({ scrap_return: z.number().int().positive() }).parse(data);
      requestIds.current.delete(key);
      return result;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crafting-state', user?.id] });
      qc.invalidateQueries({ queryKey: ['inventory', user?.id] });
    },
  });
}
