import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { authDataGate } from '@/lib/authDataGate';
import { chestCashClientConfigured, openChestCashCheckout } from '@/lib/chestCashCheckout';

const readiness = z.object({ ready: z.boolean(), reason: z.string().optional(),
  price: z.object({ currency: z.literal('BRL'), amount_minor: z.literal(990) }), already_owned: z.boolean(),
  order_id: z.string().uuid().nullable().optional(), request_id: z.string().uuid().nullable().optional(),
  order_status: z.enum(['creating', 'ready', 'completed']).nullable().optional() });
const order = z.object({ ready: z.literal(true), request_id: z.string().uuid(), order_id: z.string().uuid(),
  transaction_id: z.string().regex(/^txn_[a-z0-9]+$/), replayed: z.boolean() });
const keyFor = (userId: string) => `chest-cash-request:${userId}`;
function savedRequest(userId?: string) {
  if (!userId) return null;
  try { const id = sessionStorage.getItem(keyFor(userId)); return z.string().uuid().safeParse(id).success ? id : null; }
  catch { return null; }
}

export function useChestCashPurchase(enabled: boolean) {
  const { user, session, continuity } = useAuth();
  const userId = user?.id;
  const scope = `${userId ?? ''}:${continuity?.epoch ?? 0}`;
  const current = useRef({ scope, token: session?.access_token ?? null });
  current.current = { scope, token: session?.access_token ?? null };
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const clientReady = chestCashClientConfigured();
  const qc = useQueryClient();
  const lock = useRef(false);
  const [requestState, setRequestState] = useState<{ userId: string; id: string } | null>(null);
  const requestId = requestState?.userId === userId ? requestState.id : savedRequest(userId);
  const assertCurrent = () => {
    if (!mounted.current || current.current.scope !== scope || (current.current.token && current.current.token !== authDataGate.approvedToken()))
      throw new Error('A sessão mudou. Retome o pagamento na conta de origem.');
  };
  const status = useQuery({
    queryKey: ['chest-cash-status', userId, continuity?.epoch ?? 0],
    enabled: Boolean(enabled && userId), retry: false, staleTime: 60_000, refetchOnWindowFocus: false,
    queryFn: async () => {
      assertCurrent();
      const { data, error } = await supabase.functions.invoke('chest-cash-checkout', { method: 'GET' });
      assertCurrent();
      if (error) throw new Error('A compra avulsa ainda está indisponível. Tente verificar novamente mais tarde.');
      return readiness.parse(data);
    },
  });
  const confirmedStatus = status.data;
  const checkout = useMutation({
    mutationFn: async () => {
      if (!userId || !clientReady || !confirmedStatus?.ready || confirmedStatus.already_owned)
        throw new Error('O pagamento avulso ainda não está disponível nesta conta.');
      assertCurrent();
      if (confirmedStatus.order_status === 'creating')
        throw new Error('O pedido anterior aguarda verificação. Nenhum novo pagamento será criado.');
      if (lock.current) throw new Error('Um pagamento está sendo preparado.');
      lock.current = true;
      try {
        const request = (confirmedStatus.order_status === 'ready' ? confirmedStatus.request_id : null)
          ?? savedRequest(userId) ?? crypto.randomUUID();
        try { sessionStorage.setItem(keyFor(userId), request); }
        catch { throw new Error('Não foi possível guardar este pedido. Nenhuma compra foi enviada.'); }
        setRequestState({ userId, id: request });
        let result: Awaited<ReturnType<typeof supabase.functions.invoke>>;
        try { result = await supabase.functions.invoke('chest-cash-checkout', { method: 'POST', body: { request_id: request } }); }
        catch {
          assertCurrent();
          throw new Error('Resposta incerta. Retome o mesmo pagamento; não crie outro pedido.');
        }
        assertCurrent();
        if (result.error) throw new Error('Não foi possível confirmar o pedido. Retome o mesmo pagamento mais tarde.');
        const pending = z.object({ ready: z.literal(false), reason: z.literal('ORDER_PENDING_RECONCILIATION') }).safeParse(result.data);
        if (pending.success) throw new Error('O pedido anterior aguarda verificação. Nenhum novo pagamento será criado.');
        const parsed = order.safeParse(result.data);
        if (!parsed.success || parsed.data.request_id !== request ||
          (confirmedStatus.order_status === 'ready' && confirmedStatus.order_id && confirmedStatus.order_id !== parsed.data.order_id))
          throw new Error('O servidor ainda não confirmou este pedido. O pagamento não será aberto.');
        await openChestCashCheckout(parsed.data.transaction_id, assertCurrent);
        assertCurrent();
        return parsed.data;
      } finally { lock.current = false; }
    },
  });
  const verify = async () => {
    const result = await status.refetch();
    assertCurrent();
    if (result.data?.already_owned && userId) {
      sessionStorage.removeItem(keyFor(userId));
      setRequestState(null);
    }
    await qc.invalidateQueries({ queryKey: ['adventure-chests', userId] });
    return result;
  };
  return { status, checkout, clientReady,
    requestId: confirmedStatus?.order_status === 'ready' ? confirmedStatus.request_id ?? requestId : requestId,
    verify, begin: () => checkout.mutateAsync() };
}
