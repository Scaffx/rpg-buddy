import { createClient } from 'npm:@supabase/supabase-js@2.100.1';
import { paddleApi, readCashConfig, type CashOrder, type PaddlePrice,
  type PaddleTransaction } from '../_shared/chestCash.ts';
import { grantArguments, handleCashWebhook } from '../_shared/chestCashHandlers.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const config = readCashConfig(key => Deno.env.get(key));
const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const result = await service.rpc(name, args);
  if (result.error) throw result.error;
  return result.data as T;
}

Deno.serve(request => handleCashWebhook(request, {
  config,
  lookup: transactionId => rpc<CashOrder | null>('lookup_adventure_chest_cash_order',
    { p_transaction_id: transactionId }),
  getPrice: priceId => paddleApi<PaddlePrice>(config!.apiKey, `/prices/${encodeURIComponent(priceId)}`),
  getTransaction: transactionId => paddleApi<PaddleTransaction>(config!.apiKey,
    `/transactions/${encodeURIComponent(transactionId)}`),
  finalize: async (transactionId, eventId, priceId) => {
    await rpc('finalize_adventure_chest_cash_order', grantArguments(transactionId, eventId, priceId));
  },
}));
