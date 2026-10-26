import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { useAuth } from './useAuth';
import { setActivePetType, type PetBonus, type SustainEffect } from '@/lib/pets';

export type AdventurePet = {
  id: string;
  companion_type: string;
  name: string;
  bonus: PetBonus;
  sustain: SustainEffect | null;
};

export type AdventurePetState = {
  enabled: boolean;
  active_companion_id: string | null;
  pets: AdventurePet[];
};

const invalid = () => new Error('Estado dos pets não confirmado pelo servidor. Tente atualizar.');
const record = (value: Json): Record<string, Json> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  return value;
};
const percentage = (value: Json): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) throw invalid();
  return value;
};

export function parseAdventurePetState(value: Json): AdventurePetState {
  const state = record(value);
  if (typeof state.enabled !== 'boolean' || !Array.isArray(state.pets)) throw invalid();
  if (state.active_companion_id !== null && typeof state.active_companion_id !== 'string') throw invalid();
  const activeId = state.active_companion_id as string | null;
  const pets = state.pets.map(raw => {
    const pet = record(raw);
    const bonus = record(pet.bonus);
    if (typeof pet.id !== 'string' || typeof pet.companion_type !== 'string' || typeof pet.name !== 'string') throw invalid();
    if (!['atk', 'def', 'hp', 'mp'].includes(String(bonus.stat))) throw invalid();
    let sustain: SustainEffect | null = null;
    if (pet.sustain !== null) {
      const effect = record(pet.sustain);
      if (!['regen_hp', 'regen_mp', 'mp_cost'].includes(String(effect.kind))) throw invalid();
      sustain = { kind: effect.kind as SustainEffect['kind'], pct: percentage(effect.pct) };
    }
    return {
      id: pet.id,
      companion_type: pet.companion_type,
      name: pet.name,
      bonus: { stat: bonus.stat as PetBonus['stat'], pct: percentage(bonus.pct) },
      sustain,
    };
  });
  if (new Set(pets.map(pet => pet.id)).size !== pets.length) throw invalid();
  if (activeId !== null && !pets.some(pet => pet.id === activeId)) throw invalid();
  return { enabled: state.enabled, active_companion_id: activeId, pets };
}

export function petErrorMessage(error: unknown): string {
  if (typeof error === 'string' && error.trim()) return error;
  if (error instanceof Error && error.message.trim()) return error.message;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' && error.message.trim()) return error.message;
  return 'Não foi possível confirmar o pet com o servidor. Tente novamente.';
}

/** O RPC é a única fonte da seleção da aventura automática. A chave inclui a identidade. */
export function useActivePet() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ['adventure-pet-state', user?.id] as const;
  const query = useQuery({
    queryKey,
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_adventure_pet_state');
      if (error) throw error;
      return parseAdventurePetState(data);
    },
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: 15_000,
    retry: false,
  });
  const mutation = useMutation({
    onMutate: async () => { await queryClient.cancelQueries({ queryKey }); },
    mutationFn: async (companionId: string | null) => {
      if (!user?.id || !query.data?.enabled) throw new Error('Seleção de pet indisponível para esta conta.');
      if (companionId !== null && !query.data.pets.some(pet => pet.id === companionId)) {
        throw new Error('Este pet não foi confirmado como seu. Atualize a página.');
      }
      if (companionId === query.data.active_companion_id) return query.data;
      const { data, error } = await supabase.rpc('set_active_adventure_pet', { p_companion_id: companionId });
      if (error) throw error;
      return parseAdventurePetState(data);
    },
    onSuccess: state => {
      queryClient.setQueryData(queryKey, state);
      // Mantém o comportamento legado de boss/forrageio somente após confirmação remota.
      if (user?.id) setActivePetType(user.id, state.pets.find(pet => pet.id === state.active_companion_id)?.companion_type ?? null);
      void queryClient.invalidateQueries({ queryKey: ['auto-adventure', user?.id] });
    },
  });

  return {
    ...query,
    state: query.data,
    activeId: query.data?.active_companion_id ?? null,
    setActive: mutation.mutateAsync,
    isSetting: mutation.isPending,
    setError: mutation.error,
    resetSetError: mutation.reset,
  };
}
