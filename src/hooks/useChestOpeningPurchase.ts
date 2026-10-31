import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { authDataGate } from '@/lib/authDataGate';

const pendingSchema = z.object({
  userId: z.string().uuid(), target_cap: z.union([z.literal(2), z.literal(3)]), request_id: z.string().uuid(),
});
export const chestOpeningReceiptSchema = z.object({
  ok: z.literal(true), replayed: z.boolean(), request_id: z.string().uuid(),
  target_cap: z.union([z.literal(2), z.literal(3)]),
  openings_cap: z.number().int().min(2).max(4), gold_spent: z.number().int().nonnegative(), gold: z.number().int().nonnegative(),
});
type PendingPurchase = z.infer<typeof pendingSchema>;
type RpcResult = { data: unknown; error: { message?: string; code?: string } | null; status?: number };
const purchaseRpc = supabase.rpc as unknown as (name: string, args: Record<string, unknown>) => Promise<RpcResult>;
const storageKey = (userId: string) => `chest-opening-pending:${userId}`;

export function readPendingChestOpening(userId: string | undefined): PendingPurchase | null {
  if (!userId) return null;
  try {
    const parsed = pendingSchema.safeParse(JSON.parse(sessionStorage.getItem(storageKey(userId)) ?? 'null'));
    return parsed.success && parsed.data.userId === userId ? parsed.data : null;
  } catch { return null; }
}

function confirmedRejection(result: RpcResult) {
  return result.status !== undefined && result.status >= 400 && result.status < 500 &&
    /^(22|23|28|P0001|PGRST202)/.test(result.error?.code ?? '');
}

export function useChestOpeningPurchase() {
  const { user, session, continuity } = useAuth();
  const userId = user?.id;
  const token = session?.access_token ?? null;
  const identity = `${userId ?? ''}:${continuity?.epoch ?? 0}`;
  const current = useRef({ identity, token });
  current.current = { identity, token };
  const queryClient = useQueryClient();
  const lock = useRef(false);
  const [pendingState, setPendingState] = useState<PendingPurchase | null>(null);
  const pending = pendingState?.userId === userId ? pendingState : readPendingChestOpening(userId);
  const mutation = useMutation({
    mutationFn: async (targetCap: 2 | 3) => {
      if (!userId) throw new Error('Entre na sua conta para liberar outra abertura.');
      const assertCurrent = () => {
        if (current.current.identity !== identity ||
          (current.current.token && authDataGate.approvedToken() !== current.current.token)) {
          throw new Error('A sessão mudou. A compra permanece pendente para consulta na conta de origem.');
        }
      };
      assertCurrent();
      if (lock.current) throw new Error('Uma compra está em andamento.');
      lock.current = true;
      try {
        const existing = readPendingChestOpening(userId);
        if (existing && existing.target_cap !== targetCap) throw new Error('Consulte a compra pendente antes de liberar outra abertura.');
        const request = existing ?? { userId, target_cap: targetCap, request_id: crypto.randomUUID() };
        try {
          sessionStorage.setItem(storageKey(userId), JSON.stringify(request));
        } catch {
          throw new Error('Não foi possível guardar o pedido nesta aba. Nenhum pedido foi enviado.');
        }
        setPendingState(request);
        const confirm = (data: unknown) => {
          const parsed = chestOpeningReceiptSchema.safeParse(data);
          if (!parsed.success || parsed.data.request_id !== request.request_id ||
            parsed.data.target_cap !== request.target_cap || parsed.data.openings_cap < request.target_cap) {
            throw new Error('O recibo não confirmou este pedido. A compra permanece pendente para consulta.');
          }
          sessionStorage.removeItem(storageKey(userId));
          setPendingState(null);
          return parsed.data;
        };
        if (existing) {
          let lookup: RpcResult;
          try { lookup = await purchaseRpc('get_adventure_chest_opening_receipt', { p_request_id: request.request_id }); }
          catch {
            assertCurrent();
            throw new Error('Não foi possível consultar o recibo. O pedido permanece pendente.');
          }
          assertCurrent();
          if (lookup.error) throw new Error('Não foi possível consultar o recibo. O pedido permanece pendente.');
          const found = z.object({ found: z.boolean() }).safeParse(lookup.data);
          if (!found.success) throw new Error('O recibo não confirmou este pedido. A compra permanece pendente para consulta.');
          if (found.data.found) return confirm(lookup.data);
        }
        let result: RpcResult;
        try {
          result = await purchaseRpc('buy_adventure_chest_opening', {
            p_target_cap: request.target_cap, p_request_id: request.request_id,
          });
        } catch {
          assertCurrent();
          throw new Error('Resposta incerta. Consulte a compra pendente para retomar o mesmo pedido sem pagar duas vezes.');
        }
        assertCurrent();
        if (result.error) {
          if (confirmedRejection(result)) {
            sessionStorage.removeItem(storageKey(userId));
            setPendingState(null);
            const labels: Record<string, string> = {
              INSUFFICIENT_GOLD: 'O ouro disponível não é suficiente.',
              CHEST_OPENING_ORDER: 'Libere primeiro a abertura anterior.',
              CHEST_OPENING_CASH_REQUIRED: 'A quarta abertura exige uma compra avulsa com cash.',
            };
            throw new Error(labels[result.error.message ?? ''] ?? 'O servidor recusou a compra. Atualize seus baús e saldo.');
          }
          throw new Error('Resposta incerta. Consulte a compra pendente para retomar o mesmo pedido sem pagar duas vezes.');
        }
        return confirm(result.data);
      } finally { lock.current = false; }
    },
    onSettled: async () => {
      if (current.current.identity !== identity) return;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['adventure-chests', userId] }),
        queryClient.invalidateQueries({ queryKey: ['gold-balance', userId] }),
        queryClient.invalidateQueries({ queryKey: ['purchase-history', userId] }),
      ]);
    },
  });
  return { ...mutation, pending, buy: (cap: 2 | 3) => mutation.mutateAsync(cap),
    retryPending: () => pending ? mutation.mutateAsync(pending.target_cap)
      : Promise.reject(new Error('Não há compra pendente nesta conta.')) };
}
