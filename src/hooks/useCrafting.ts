import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export function useRecipes(className: string | null) {
  return useQuery({
    queryKey: ['crafting_recipes', className],
    queryFn: async () => {
      const { data: recipes, error } = await (supabase as any)
        .from('crafting_recipes')
        .select('*')
        .eq('class_required', className);
      if (error) throw error;
      if (!recipes?.length) return [];

      const itemIds = [...new Set((recipes as any[]).map((r: any) => r.item_output_id).filter(Boolean))];
      const { data: items } = await supabase
        .from('game_items' as any)
        .select('*')
        .in('id', itemIds);
      const itemMap = Object.fromEntries(((items ?? []) as any[]).map((i: any) => [i.id, i]));

      return (recipes as any[]).map((r: any) => ({ ...r, item_output: itemMap[r.item_output_id] ?? null }));
    },
    enabled: !!className,
  });
}

export function useCraftingMaterials() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['crafting_materials', user?.id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('user_crafting_materials')
        .select('quantity')
        .eq('user_id', user!.id)
        .maybeSingle();
      return (data as any)?.quantity ?? 0;
    },
    enabled: !!user,
  });
}

export function useCraftItem() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      materialsRequired,
      goldRequired,
      outputItemId,
      recipeName,
    }: {
      materialsRequired: number;
      goldRequired: number;
      outputItemId: string;
      recipeName: string;
    }) => {
      // 1. Verificar materiais
      const { data: mats } = await (supabase as any)
        .from('user_crafting_materials')
        .select('quantity')
        .eq('user_id', user!.id)
        .maybeSingle();
      const currentMats = (mats as any)?.quantity ?? 0;
      if (currentMats < materialsRequired) {
        throw new Error(`Materiais insuficientes (${currentMats}/${materialsRequired} 🧪)`);
      }

      // 2. Verificar e descontar ouro
      if (goldRequired > 0) {
        const { data: bal } = await supabase
          .from('user_balance' as any)
          .select('gold')
          .eq('user_id', user!.id)
          .maybeSingle();
        const currentGold = (bal as any)?.gold ?? 0;
        if (currentGold < goldRequired) {
          throw new Error(`Ouro insuficiente (${currentGold}/${goldRequired} 🪙)`);
        }
        await supabase
          .from('user_balance' as any)
          .update({ gold: currentGold - goldRequired })
          .eq('user_id', user!.id);
      }

      // 3. Descontar materiais
      await (supabase as any)
        .from('user_crafting_materials')
        .update({ quantity: currentMats - materialsRequired })
        .eq('user_id', user!.id);

      // 4. Adicionar item ao inventário
      const { data: existing } = await supabase
        .from('user_inventory' as any)
        .select('id, quantity')
        .eq('user_id', user!.id)
        .eq('item_id', outputItemId)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('user_inventory' as any)
          .update({ quantity: (existing as any).quantity + 1 })
          .eq('id', (existing as any).id);
      } else {
        await supabase
          .from('user_inventory' as any)
          .insert({ user_id: user!.id, item_id: outputItemId, quantity: 1, equipped: false });
      }

      // 5. Registrar no log
      await supabase.from('activity_log' as any).insert({
        user_id: user!.id,
        action: 'item_crafted',
        description: `${recipeName} fabricado`,
        xp_gained: 5,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crafting_materials', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['inventory', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['gold-balance'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}
