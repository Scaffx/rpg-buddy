import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { authDataGate } from '@/lib/authDataGate';
import { useAuth } from './useAuth';

let activeIdentity = '';
function usePetIdentity() {
  const { user, session, continuity } = useAuth();
  const token = session?.access_token ?? null;
  const identity = `${user?.id ?? ''}:${token ?? ''}:${continuity?.epoch ?? 0}`;
  activeIdentity = identity;
  const stillCurrent = () => activeIdentity === identity && (!token || authDataGate.approvedToken() === token);
  return { user, identity, stillCurrent };
}

type RpcResult = { data: unknown; error: { message?: string; code?: string; status?: number } | null; status?: number };
const petRpc = supabase.rpc as unknown as (name: string, args?: Record<string, unknown>) => Promise<RpcResult>;

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}: resposta inválida do servidor`);
  return value as Record<string, unknown>;
}
function string(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`${label}: resposta inválida do servidor`);
  return value;
}
function integer(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new Error(`${label}: resposta inválida do servidor`);
  return value;
}
function optionalDate(value: unknown, label: string): string | null {
  if (value === null) return null;
  return string(value, label);
}
async function call(name: string, args?: Record<string, unknown>): Promise<{ data: unknown; error: RpcResult['error']; status?: number }> {
  return petRpc(name, args);
}

export type PetFood = { pet_type: string; item_id: string; name: string; unit_price: number; quantity: number };
export type PetFoodReceipt = { request_id: string; pet_type: string; quantity: number; unit_price: number; total: number; gold: number; stock: number; replayed: boolean };
export type PetCarePet = { companion_id: string; pet_type: string; name: string; stock: number; last_feed_at: string | null; next_feed_at: string; last_care_at: string | null; next_care_at: string; participation: number };
export type PetCareState = { server_now: string; pets: PetCarePet[] };
export type PetCareResult = { request_id: string; companion_id: string; action: 'care' | 'play'; effective: boolean; replayed: boolean; next_care_at: string | null; participation: number | null };

function parseFood(value: unknown): PetFood {
  const row = object(value, 'get_pet_food_catalog');
  if (row.owned !== true) throw new Error('get_pet_food_catalog: posse não confirmada');
  const unit_price = integer(row.unit_price, 'unit_price');
  const quantity = integer(row.quantity, 'quantity');
  if (unit_price < 0 || quantity < 0) throw new Error('get_pet_food_catalog: valores inválidos');
  return { pet_type: string(row.pet_type, 'pet_type'), item_id: string(row.item_id, 'item_id'), name: string(row.name, 'name'), unit_price, quantity };
}
function parseReceipt(value: unknown): PetFoodReceipt {
  const row = object(value, 'buy_pet_food');
  if (row.ok !== true) throw new Error('buy_pet_food: compra não confirmada');
  return { request_id: string(row.request_id, 'request_id'), pet_type: string(row.pet_type, 'pet_type'), quantity: integer(row.quantity, 'quantity'), unit_price: integer(row.unit_price, 'unit_price'), total: integer(row.total, 'total'), gold: integer(row.gold, 'gold'), stock: integer(row.stock, 'stock'), replayed: row.replayed === true };
}
function parseCareState(value: unknown): PetCareState {
  const row = object(value, 'get_pet_care_state');
  if (!Array.isArray(row.pets)) throw new Error('get_pet_care_state: resposta inválida');
  return { server_now: string(row.server_now, 'server_now'), pets: row.pets.map((raw) => {
    const pet = object(raw, 'pet');
    const participation = Number(pet.participation);
    if (!Number.isFinite(participation) || participation < 0 || participation > 1) throw new Error('get_pet_care_state: participação inválida');
    return { companion_id: string(pet.companion_id, 'companion_id'), pet_type: string(pet.pet_type, 'pet_type'), name: string(pet.name, 'name'), stock: integer(pet.stock, 'stock'), last_feed_at: optionalDate(pet.last_feed_at, 'last_feed_at'), next_feed_at: string(pet.next_feed_at, 'next_feed_at'), last_care_at: optionalDate(pet.last_care_at, 'last_care_at'), next_care_at: string(pet.next_care_at, 'next_care_at'), participation };
  }) };
}
function parseCareResult(value: unknown): PetCareResult {
  const row = object(value, 'interact_pet_care');
  if (row.ok !== true || typeof row.effective !== 'boolean' || (row.action !== 'care' && row.action !== 'play')) throw new Error('interact_pet_care: resposta inválida');
  const participation = row.participation == null ? null : Number(row.participation);
  if (participation !== null && (!Number.isFinite(participation) || participation < 0 || participation > 1)) throw new Error('interact_pet_care: participação inválida');
  return { request_id: string(row.request_id, 'request_id'), companion_id: string(row.companion_id, 'companion_id'), action: row.action, effective: row.effective, replayed: row.replayed === true, next_care_at: row.next_care_at == null ? null : string(row.next_care_at, 'next_care_at'), participation };
}
function confirmedRejection(error: RpcResult['error'], status?: number): boolean {
  const code = error?.code ?? '';
  const http = error?.status ?? status;
  return typeof http === 'number' && http >= 400 && http < 500 && (/^(22|23|28|P0001)/.test(code) || (http === 404 && code === 'PGRST202'));
}
function pendingKey(userId: string): string { return `pet-food-pending:${userId}`; }
type PendingFood = { userId: string; pet_type: string; quantity: number; request_id: string };
function readPending(userId: string | undefined): PendingFood | null {
  if (!userId || typeof sessionStorage === 'undefined') return null;
  try {
    const row = JSON.parse(sessionStorage.getItem(pendingKey(userId)) || 'null') as PendingFood | null;
    return row?.userId === userId && typeof row.pet_type === 'string' && Number.isInteger(row.quantity) && typeof row.request_id === 'string' ? row : null;
  } catch { return null; }
}
function savePending(row: PendingFood | null): void {
  if (typeof sessionStorage === 'undefined' || !row) return;
  sessionStorage.setItem(pendingKey(row.userId), JSON.stringify(row));
}
function clearPending(row: PendingFood): void {
  if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(pendingKey(row.userId));
}

export function usePetFoodCatalog() {
  const { user, identity, stillCurrent } = usePetIdentity();
  return useQuery({ queryKey: ['pet-food-catalog', user?.id, identity], enabled: !!user, queryFn: async () => {
    if (!stillCurrent()) throw new Error('Conta alterada durante a consulta.');
    const result = await call('get_pet_food_catalog');
    if (!stillCurrent()) throw new Error('Conta alterada durante a consulta.');
    if (result.error) throw result.error;
    if (!Array.isArray(result.data)) throw new Error('get_pet_food_catalog: resposta inválida');
    return result.data.map(parseFood);
  }, staleTime: 30_000, retry: false });
}

export function usePetFoodPurchase() {
  const { user, stillCurrent } = usePetIdentity();
  const qc = useQueryClient();
  const [pendingState, setPendingState] = useState<PendingFood | null>(null);
  const lock = useRef(false);
  const pending = pendingState?.userId === user?.id ? pendingState : readPending(user?.id);
  const mutation = useMutation({ mutationFn: async ({ pet_type, quantity, retry }: { pet_type: string; quantity: number; retry?: boolean }) => {
    if (!user) throw new Error('Faça login para comprar alimento.');
    if (!stillCurrent()) throw new Error('Conta alterada durante a compra.');
    if (lock.current) throw new Error('Compra em andamento.');
    lock.current = true;
    try {
      const existing = readPending(user.id);
      if (existing && (existing.pet_type !== pet_type || existing.quantity !== quantity)) throw new Error('Resolva a compra pendente antes de iniciar outra.');
      if (!existing && (!Number.isInteger(quantity) || quantity < 1 || quantity > 30)) throw new Error('Escolha entre 1 e 30 unidades.');
      const request = existing ?? { userId: user.id, pet_type, quantity, request_id: crypto.randomUUID() };
      if (!existing) { savePending(request); setPendingState(request); }
      const resolveReceipt = async (): Promise<PetFoodReceipt | null> => {
        if (!stillCurrent()) throw new Error('Conta alterada durante a compra.');
        const receipt = await call('get_pet_food_purchase_receipt', { p_request_id: request.request_id });
        if (!stillCurrent()) throw new Error('Conta alterada durante a compra.');
        if (receipt.error) return null;
        const row = object(receipt.data, 'get_pet_food_purchase_receipt');
        if (row.found !== true) return null;
        const confirmed = parseReceipt(row);
        if (confirmed.request_id !== request.request_id || confirmed.pet_type !== pet_type || confirmed.quantity !== quantity) throw new Error('Recibo divergente; compra pendente.');
        clearPending(request); setPendingState(null);
        return confirmed;
      };
      if (existing || retry) {
        try {
          const confirmed = await resolveReceipt();
          if (confirmed) return confirmed;
        } catch { if (!stillCurrent()) throw new Error('Conta alterada durante a compra.'); }
      }
      if (!stillCurrent()) throw new Error('Conta alterada durante a compra.');
      let result: Awaited<ReturnType<typeof call>>;
      try { result = await call('buy_pet_food', { p_pet_type: pet_type, p_quantity: quantity, p_request_id: request.request_id }); }
      catch {
        if (!stillCurrent()) throw new Error('Conta alterada durante a compra.');
        try { const confirmed = await resolveReceipt(); if (confirmed) return confirmed; } catch { /* Estado segue incerto. */ }
        throw new Error('Resposta incerta. Consulte o recibo ou tente novamente com o mesmo pedido.');
      }
      if (!stillCurrent()) throw new Error('Conta alterada durante a compra.');
      if (result.error) {
        if (confirmedRejection(result.error, result.status)) { clearPending(request); setPendingState(null); throw new Error(result.error.message || 'Compra recusada pelo servidor.'); }
        try { const confirmed = await resolveReceipt(); if (confirmed) return confirmed; } catch { /* Estado segue incerto. */ }
        throw new Error('Resposta incerta. Consulte o recibo ou tente novamente com o mesmo pedido.');
      }
      const confirmed = parseReceipt(result.data);
      if (confirmed.request_id !== request.request_id || confirmed.pet_type !== pet_type || confirmed.quantity !== quantity) throw new Error('Resposta divergente; compra pendente.');
      clearPending(request); setPendingState(null);
      return confirmed;
    } finally { lock.current = false; }
  }, onSuccess: () => {
    if (!stillCurrent()) return;
    void qc.invalidateQueries({ queryKey: ['pet-food-catalog', user?.id] });
    void qc.invalidateQueries({ queryKey: ['pet-care-state', user?.id] });
    void qc.invalidateQueries({ queryKey: ['gold-balance'] });
    void qc.invalidateQueries({ queryKey: ['inventory'] });
    void qc.invalidateQueries({ queryKey: ['purchase-history', user?.id] });
  } });
  return { ...mutation, pending, buy: (pet_type: string, quantity: number) => mutation.mutateAsync({ pet_type, quantity }), retryPending: () => pending ? mutation.mutateAsync({ pet_type: pending.pet_type, quantity: pending.quantity, retry: true }) : Promise.reject(new Error('Nenhuma compra pendente.')) };
}

export function usePetCareState() {
  const { user, identity, stillCurrent } = usePetIdentity();
  return useQuery({ queryKey: ['pet-care-state', user?.id, identity], enabled: !!user, queryFn: async () => {
    if (!stillCurrent()) throw new Error('Conta alterada durante a consulta.');
    const result = await call('get_pet_care_state');
    if (!stillCurrent()) throw new Error('Conta alterada durante a consulta.');
    if (result.error) throw result.error;
    return parseCareState(result.data);
  }, staleTime: 30_000, retry: false });
}

export function usePetCareInteraction() {
  const { user, stillCurrent } = usePetIdentity();
  const qc = useQueryClient();
  return useMutation({ mutationFn: async ({ companionId, action }: { companionId: string; action: 'care' | 'play' }) => {
    if (!user) throw new Error('Faça login para cuidar do pet.');
    if (!stillCurrent()) throw new Error('Conta alterada durante o cuidado.');
    const requestId = crypto.randomUUID();
    const result = await call('interact_pet_care', { p_companion_id: companionId, p_action: action, p_request_id: requestId });
    if (!stillCurrent()) throw new Error('Conta alterada durante o cuidado.');
    if (result.error) throw result.error;
    const confirmed = parseCareResult(result.data);
    if (confirmed.request_id !== requestId || confirmed.companion_id !== companionId || confirmed.action !== action) throw new Error('Cuidado não confirmado pelo servidor.');
    return confirmed;
  }, onSuccess: () => { if (stillCurrent()) void qc.invalidateQueries({ queryKey: ['pet-care-state', user?.id] }); } });
}
