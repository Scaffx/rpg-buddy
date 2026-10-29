import { useRef } from 'react';
import { CancelledError, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { useAuth } from '@/hooks/useAuth';

export type AutoPotionStock = { type: 'hp' | 'mp'; item_id: string; name: string; quantity: number; amount: number };
export type AutoPotionReservation = { type: 'hp' | 'mp'; item_id: string; name: string; amount: number; recovered: number; at: string; status: 'reserved' | 'used' };
export type AdventureAutoPotionsState = {
  enabled: boolean;
  server_now: string;
  battle_id: string | null;
  stock: AutoPotionStock[];
  reservations: AutoPotionReservation[];
};

const invalid = () => new Error('O servidor retornou um estado inválido das poções. Atualize para tentar novamente.');
function object(value: Json): Record<string, Json> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  return value;
}
function nonnegative(value: Json): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw invalid();
  return value;
}
function positive(value: Json): number {
  const result = nonnegative(value);
  if (result === 0) throw invalid();
  return result;
}
function date(value: Json): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw invalid();
  return value;
}
function identity(value: Json): string {
  if (typeof value !== 'string' || !/^[0-9a-f-]{36}$/i.test(value)) throw invalid();
  return value;
}

export function parseAdventureAutoPotionsState(value: Json): AdventureAutoPotionsState {
  const state = object(value);
  if (typeof state.enabled !== 'boolean' || !Array.isArray(state.stock) || !Array.isArray(state.reservations)) throw invalid();
  if (state.battle_id !== null && typeof state.battle_id !== 'string') throw invalid();
  const stock = state.stock.map<AutoPotionStock>(raw => {
    const row = object(raw);
    const type = row.type;
    if ((type !== 'hp' && type !== 'mp') || typeof row.name !== 'string' || !row.name.trim()) throw invalid();
    return { type, item_id: identity(row.item_id), name: row.name,
      quantity: positive(row.quantity), amount: positive(row.amount) };
  });
  const reservations = state.reservations.map<AutoPotionReservation>(raw => {
    const row = object(raw);
    const type = row.type;
    const status = row.status;
    if ((type !== 'hp' && type !== 'mp') || typeof row.name !== 'string' || !row.name.trim() ||
      (status !== 'reserved' && status !== 'used')) throw invalid();
    return { type, item_id: identity(row.item_id), name: row.name,
      amount: positive(row.amount), recovered: positive(row.recovered), at: date(row.at), status };
  });
  if (new Set(reservations.map(row => row.type)).size !== reservations.length ||
    new Set(stock.map(row => row.item_id)).size !== stock.length) throw invalid();
  return { enabled: state.enabled, server_now: date(state.server_now),
    battle_id: state.battle_id === null ? null : identity(state.battle_id), stock, reservations };
}

export function autoPotionsUnavailable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = 'code' in error ? error.code : undefined;
  return code === 'PGRST202' || code === '42883';
}
export function autoPotionsErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' && error.message.trim()) return error.message;
  return 'Não foi possível confirmar as poções com o servidor. Tente atualizar.';
}

export function useAdventureAutoPotions() {
  const { user, continuity } = useAuth();
  const client = useQueryClient();
  const key = ['adventure-auto-potions', user?.id, continuity?.epoch] as const;
  const currentIdentity = useRef({ userId: user?.id, epoch: continuity?.epoch });
  const settingIdentity = useRef<{ userId?: string; epoch?: number } | null>(null);
  currentIdentity.current = { userId: user?.id, epoch: continuity?.epoch };
  const settingCurrent = () => !!settingIdentity.current && settingIdentity.current.userId === user?.id &&
    settingIdentity.current?.epoch === continuity?.epoch;
  const query = useQuery({
    queryKey: key,
    enabled: !!user?.id,
    queryFn: async ({ signal }) => {
      const request = supabase.rpc('get_adventure_auto_potions_state');
      request.abortSignal?.(signal);
      const { data, error } = await request;
      if (signal.aborted) throw new CancelledError({ revert: true });
      if (error) throw error;
      return parseAdventureAutoPotionsState(data);
    },
    staleTime: 10_000,
    refetchInterval: current => settingCurrent() || autoPotionsUnavailable(current.state.error) ? false : 15_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: current => !settingCurrent() && !autoPotionsUnavailable(current.state.error),
    refetchOnReconnect: current => !settingCurrent() && !autoPotionsUnavailable(current.state.error),
    retry: false,
  });
  const mutation = useMutation({
    onMutate: async (request: { enabled: boolean; userId?: string; epoch?: number }) => {
      settingIdentity.current = { userId: request.userId, epoch: request.epoch };
      await client.cancelQueries({ queryKey: ['adventure-auto-potions', request.userId, request.epoch], exact: true });
    },
    mutationFn: async (request: { enabled: boolean; userId?: string; epoch?: number }) => {
      if (!request.userId || !query.data || currentIdentity.current.userId !== request.userId ||
        currentIdentity.current.epoch !== request.epoch) {
        throw new Error('Configuração de poções indisponível para esta conta.');
      }
      if (request.enabled === query.data.enabled) return query.data;
      const { data, error } = await supabase.rpc('set_adventure_auto_potions_enabled', { p_enabled: request.enabled });
      if (error) throw error;
      return parseAdventureAutoPotionsState(data);
    },
    onSuccess: (state, request) => {
      if (currentIdentity.current.userId !== request.userId || currentIdentity.current.epoch !== request.epoch) return;
      client.setQueryData(['adventure-auto-potions', request.userId, request.epoch], state);
      void client.invalidateQueries({ queryKey: ['auto-adventure', request.userId], exact: true });
    },
    onSettled: (_state, _error, request) => {
      if (settingIdentity.current?.userId === request.userId && settingIdentity.current?.epoch === request.epoch) {
        settingIdentity.current = null;
      }
    },
  });
  const ownMutation = mutation.variables?.userId === user?.id && mutation.variables?.epoch === continuity?.epoch;
  return { ...query, state: query.data,
    setEnabled: (enabled: boolean) => mutation.mutateAsync({ enabled, userId: user?.id, epoch: continuity?.epoch }),
    isSetting: ownMutation && mutation.isPending, setError: ownMutation ? mutation.error : null,
    resetSetError: mutation.reset };
}
