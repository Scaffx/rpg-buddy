import { createClient } from 'npm:@supabase/supabase-js@2.100.1';
import { paddleApi, readCashConfig, type PaddlePrice, type PaddleTransaction } from '../_shared/chestCash.ts';
import { handleCashCheckout, type CheckoutState, type PreparedOrder } from '../_shared/chestCashHandlers.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const config = readCashConfig(key => Deno.env.get(key));
const auth = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  // These service-only RPCs are added by the checkout-order migration.
  const result = await service.rpc(name, args);
  if (result.error) throw result.error;
  return result.data as T;
}

Deno.serve(request => handleCashCheckout(request, {
  config,
  getUser: async token => {
    const { data, error } = await auth.auth.getUser(token);
    return error || !data.user ? null : { id: data.user.id };
  },
  state: userId => rpc<CheckoutState>('get_adventure_chest_cash_checkout_state', { p_user_id: userId }),
  prepare: (userId, requestId) => rpc<PreparedOrder>('prepare_adventure_chest_cash_order',
    { p_user_id: userId, p_request_id: requestId }),
  attach: async (orderId, userId, transactionId) => {
    await rpc('attach_adventure_chest_cash_transaction', {
      p_order_id: orderId, p_user_id: userId,
      p_transaction_id: transactionId,
    });
  },
  getPrice: priceId => paddleApi<PaddlePrice>(config!.apiKey, `/prices/${encodeURIComponent(priceId)}`),
  createTransaction: (order, userId) => paddleApi<PaddleTransaction>(config!.apiKey, '/transactions', {
    method: 'POST',
    body: JSON.stringify({
      items: [{ price_id: order.price_id, quantity: 1 }],
      currency_code: 'BRL', collection_mode: 'automatic',
      custom_data: {
        chest_cash_order_id: order.order_id,
        chest_cash_user_id: userId,
        chest_cash_request_id: order.request_id,
      },
    }),
  }),
}));
