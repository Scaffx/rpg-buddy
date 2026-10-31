import {
  CASH_AMOUNT_MINOR, CASH_CURRENCY, CASH_ENVIRONMENT, type CashConfig, type CashOrder,
  type PaddlePrice, type PaddleTransaction, jsonResponse, parseCompletedEvent,
  validCashPrice, validCompletedTransaction, validCreatedTransaction,
  validUuid, verifyPaddleSignature,
} from './chestCash.ts';

export interface CheckoutState {
  ready: boolean; reason?: string | null; already_owned: boolean;
  price_id?: string | null; amount_minor: number; currency: string;
  order_id?: string | null; order_status?: string | null; request_id?: string | null;
}
export interface PreparedOrder {
  order_id: string; request_id: string; status: 'creating' | 'ready' | 'completed';
  price_id: string; transaction_id?: string | null;
  replayed: boolean;
}
export interface CheckoutDeps {
  config: CashConfig | null;
  getUser(token: string): Promise<{ id: string } | null>;
  state(userId: string): Promise<CheckoutState>;
  prepare(userId: string, requestId: string): Promise<PreparedOrder>;
  attach(orderId: string, userId: string, transactionId: string): Promise<void>;
  getPrice(priceId: string): Promise<PaddlePrice>;
  createTransaction(order: PreparedOrder, userId: string): Promise<PaddleTransaction>;
}

function bearer(request: Request): string | null {
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.get('Authorization') ?? '');
  return match?.[1] ?? null;
}

export async function handleCashCheckout(request: Request, deps: CheckoutDeps): Promise<Response> {
  if (request.method === 'OPTIONS') return jsonResponse({}, 204);
  if (request.method !== 'GET' && request.method !== 'POST') return jsonResponse({ ready: false, reason: 'METHOD_NOT_ALLOWED' }, 405);
  const token = bearer(request);
  if (!token) return jsonResponse({ ready: false, reason: 'AUTH_REQUIRED' }, 401);
  let user: { id: string } | null;
  try { user = await deps.getUser(token); } catch { user = null; }
  if (!user || !validUuid(user.id)) return jsonResponse({ ready: false, reason: 'AUTH_REQUIRED' }, 401);

  let state: CheckoutState;
  try { state = await deps.state(user.id); }
  catch { return jsonResponse({ ready: false, reason: 'SERVER_UNAVAILABLE' }, 503); }
  const price = { currency: CASH_CURRENCY, amount_minor: CASH_AMOUNT_MINOR };
  if (state.already_owned) return jsonResponse({ ready: false, reason: 'ALREADY_OWNED', already_owned: true, price }, 200);
  if (!deps.config || !state.ready || state.price_id !== deps.config.priceId) {
    return jsonResponse({ ready: false, reason: state.ready ? 'NOT_CONFIGURED' :
      (state.reason ?? 'NOT_CONFIGURED'), already_owned: false, price }, 200);
  }
  try {
    if (!validCashPrice(await deps.getPrice(deps.config.priceId), deps.config.priceId))
      return jsonResponse({ ready: false, reason: 'PRICE_MISMATCH', already_owned: false, price }, 200);
  } catch { return jsonResponse({ ready: false, reason: 'PROVIDER_UNAVAILABLE', already_owned: false, price }, 503); }

  if (request.method === 'GET') return jsonResponse({ ready: true, already_owned: false, price,
    order_id: state.order_id ?? null, order_status: state.order_status ?? null,
    request_id: state.request_id ?? null });

  let requestId: unknown;
  try { requestId = (await request.json() as { request_id?: unknown }).request_id; }
  catch { return jsonResponse({ ready: false, reason: 'INVALID_REQUEST' }, 400); }
  if (!validUuid(requestId)) return jsonResponse({ ready: false, reason: 'INVALID_REQUEST' }, 400);
  let order: PreparedOrder;
  try { order = await deps.prepare(user.id, requestId); }
  catch { return jsonResponse({ ready: false, reason: 'ORDER_UNAVAILABLE' }, 409); }
  if (!validUuid(order.order_id) || !validUuid(order.request_id) || order.price_id !== deps.config.priceId)
    return jsonResponse({ ready: false, reason: 'ORDER_MISMATCH' }, 503);
  if (order.status === 'ready' && typeof order.transaction_id === 'string' &&
    /^txn_[a-z0-9]{26}$/.test(order.transaction_id))
    return jsonResponse({ ready: true, order_id: order.order_id, request_id: order.request_id,
      transaction_id: order.transaction_id, replayed: true });
  if (order.status !== 'creating' || order.replayed)
    return jsonResponse({ ready: false, reason: 'ORDER_PENDING_RECONCILIATION', order_id: order.order_id }, 202);

  try {
    const transaction = await deps.createTransaction(order, user.id);
    if (!validCreatedTransaction(transaction, order.order_id, user.id, deps.config.priceId))
      return jsonResponse({ ready: false, reason: 'ORDER_PENDING_RECONCILIATION', order_id: order.order_id }, 202);
    await deps.attach(order.order_id, user.id, transaction.id);
    return jsonResponse({ ready: true, order_id: order.order_id, request_id: order.request_id,
      transaction_id: transaction.id, replayed: false });
  } catch {
    // The provider may have created the transaction before the response failed.
    return jsonResponse({ ready: false, reason: 'ORDER_PENDING_RECONCILIATION', order_id: order.order_id }, 202);
  }
}

export interface WebhookDeps {
  config: CashConfig | null;
  nowMs?: number;
  lookup(transactionId: string): Promise<CashOrder | null>;
  getPrice(priceId: string): Promise<PaddlePrice>;
  getTransaction(transactionId: string): Promise<PaddleTransaction>;
  finalize(transactionId: string, eventId: string, priceId: string): Promise<unknown>;
}

export async function handleCashWebhook(request: Request, deps: WebhookDeps): Promise<Response> {
  if (request.method !== 'POST') return jsonResponse({ ok: false }, 405);
  if (!deps.config) return jsonResponse({ ok: false }, 503);
  const raw = await request.text();
  if (raw.length > 1_000_000) return jsonResponse({ ok: false }, 413);
  if (!await verifyPaddleSignature(raw, request.headers.get('Paddle-Signature'),
    deps.config.webhookSecret, deps.nowMs)) return jsonResponse({ ok: false }, 401);
  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { return jsonResponse({ ok: false }, 400); }
  const event = parseCompletedEvent(payload);
  if (!event) return jsonResponse({ ok: true, ignored: true });
  let order: CashOrder | null;
  try { order = await deps.lookup(event.transactionId); }
  catch { return jsonResponse({ ok: false }, 503); }
  if (!order || order.transaction_id !== event.transactionId ||
    (order.status === 'completed' && order.event_id !== event.eventId))
    return jsonResponse({ ok: false, reason: 'ORDER_MISMATCH' }, 409);
  if (order.status === 'completed') return jsonResponse({ ok: true, replayed: true });
  if (order.price_id !== deps.config.priceId)
    return jsonResponse({ ok: false, reason: 'ORDER_MISMATCH' }, 409);
  try {
    const [price, transaction] = await Promise.all([
      deps.getPrice(deps.config.priceId), deps.getTransaction(event.transactionId),
    ]);
    if (!validCashPrice(price, deps.config.priceId) ||
      !validCompletedTransaction(transaction, order, deps.config.priceId))
      return jsonResponse({ ok: false, reason: 'PAYMENT_MISMATCH' }, 409);
    await deps.finalize(event.transactionId, event.eventId, deps.config.priceId);
    return jsonResponse({ ok: true });
  } catch { return jsonResponse({ ok: false, reason: 'VERIFY_UNAVAILABLE' }, 503); }
}

export const grantArguments = (transactionId: string, eventId: string, priceId: string) => ({
  p_transaction_id: transactionId, p_event_id: eventId, p_price_id: priceId,
  p_amount_minor: CASH_AMOUNT_MINOR, p_currency: CASH_CURRENCY,
  p_environment: CASH_ENVIRONMENT,
});
