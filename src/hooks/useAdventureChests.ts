import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

const serverDate = z.string().refine(value => Number.isFinite(Date.parse(value)));
const chestMinimum = z.object({
  gold: z.number().int().nonnegative(),
  scrap: z.number().int().nonnegative(),
  essence_material: z.enum(['normal', 'desert', 'water', 'ice', 'fire']),
  essence: z.number().int().nonnegative(),
  potions: z.number().int().nonnegative(),
});
const chest = z.object({
  id: z.string().uuid(),
  rarity: z.enum(['comum', 'raro', 'epico', 'lendario']),
  status: z.enum(['queued', 'opening', 'claimed']),
  acquired_at: serverDate,
  started_at: serverDate.nullable(),
  ready_at: serverDate.nullable(),
  open_hours: z.number().int().positive(),
  minimum: chestMinimum,
});
const receipt = z.object({
  chest_id: z.string().uuid(),
  rarity: chest.shape.rarity,
  claimed_at: serverDate,
  gold: z.number().int().nonnegative(),
  scrap: z.number().int().nonnegative(),
  essence_material: chestMinimum.shape.essence_material,
  essence: z.number().int().nonnegative(),
  potions: z.number().int().nonnegative(),
  potion_item_id: z.string().uuid().nullable(),
  equipment: z.object({
    id: z.string().uuid(),
    name: z.string(),
    icon: z.string(),
    rarity: z.string(),
    level_required: z.number().int().positive(),
  }).nullable(),
  xp: z.literal(0),
});
const state = z.object({
  server_now: serverDate,
  slots_total: z.literal(4),
  occupied: z.number().int().min(0).max(4),
  next_eligible_at: serverDate.nullable(),
  chests: z.array(chest).max(4),
  overflow: z.object({
    count: z.number().int().nonnegative(),
    gold: z.number().int().nonnegative(),
    scrap: z.number().int().nonnegative(),
  }),
  recent_overflow: z.array(z.object({
    battle_id: z.string().uuid(),
    ended_at: serverDate,
    rarity: chest.shape.rarity,
    gold: z.number().int().nonnegative(),
    scrap: z.number().int().nonnegative(),
  })),
  recent_claims: z.array(receipt),
});

export type AdventureChest = z.infer<typeof chest>;
export type AdventureChestReceipt = z.infer<typeof receipt>;
export type AdventureChestsState = z.infer<typeof state>;

const errorLabels: Record<string, string> = {
  CHEST_NOT_FOUND: 'Este baú não pertence a você ou não está mais disponível.',
  CHEST_OPENING_ACTIVE: 'Há um baú em abertura. Resgate-o antes de iniciar outro.',
  CHEST_NOT_READY: 'O baú ainda não está pronto no relógio do servidor.',
  CHEST_NOT_OPENING: 'Inicie a abertura deste baú antes de resgatar.',
  CHEST_ALREADY_CLAIMED: 'Este baú já foi resgatado.',
  NOT_AUTHENTICATED: 'Entre na sua conta para ver os baús.',
  PROFILE_NOT_FOUND: 'Seu perfil não foi encontrado. Recarregue a página.',
};

export function adventureChestError(error: unknown): string {
  if (error instanceof z.ZodError) return 'A resposta de baús do servidor veio incompleta. Recarregue a página.';
  const raw = typeof error === 'string' ? error : error instanceof Error ? error.message
    : error && typeof error === 'object' && 'message' in error
      ? String(error.message ?? '') : '';
  const message = raw.trim();
  if (!message) return 'Não foi possível atualizar os baús. Tente novamente.';
  return errorLabels[message] ?? message;
}

async function callChestRpc(name: 'get_adventure_chests' | 'start_adventure_chest' | 'claim_adventure_chest', chestId?: string) {
  const { data, error } = chestId
    ? await supabase.rpc(name as never, { p_chest_id: chestId } as never)
    : await supabase.rpc(name as never);
  if (error) throw error;
  return data as unknown;
}

export function useAdventureChests() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const key = ['adventure-chests', user?.id] as const;
  const query = useQuery({
    queryKey: key,
    enabled: !!user,
    queryFn: async () => state.parse(await callChestRpc('get_adventure_chests')),
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    staleTime: 10_000,
    retry: false,
  });
  const start = useMutation({
    mutationFn: async (chestId: string) => z.object({
      ok: z.literal(true), replayed: z.boolean(), server_now: serverDate, chest,
    }).parse(await callChestRpc('start_adventure_chest', chestId)),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: key }); },
  });
  const claim = useMutation({
    mutationFn: async (chestId: string) => z.object({
      ok: z.literal(true), replayed: z.boolean(), receipt,
    }).parse(await callChestRpc('claim_adventure_chest', chestId)),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: key }),
        queryClient.invalidateQueries({ queryKey: ['gold-balance', user?.id] }),
        queryClient.invalidateQueries({ queryKey: ['gold-history'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory', user?.id] }),
        queryClient.invalidateQueries({ queryKey: ['crafting-state', user?.id] }),
      ]);
    },
  });
  return { ...query, start, claim };
}
