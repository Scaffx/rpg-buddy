export const CASH_AMOUNT_MINOR = 990;
export const CASH_CURRENCY = 'BRL';
export const CASH_ENVIRONMENT = 'live';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TXN = /^txn_[a-z0-9]{26}$/;
const EVENT = /^evt_[a-z0-9]{26}$/;

export interface CashConfig {
  apiKey: string;
  priceId: string;
  webhookSecret: string;
}

export function readCashConfig(get: (key: string) => string | undefined): CashConfig | null {
  const apiKey = get('PADDLE_LIVE_API_KEY');
  const priceId = get('CHEST_CASH_PADDLE_PRICE_ID');
  const webhookSecret = get('CHEST_CASH_PADDLE_WEBHOOK_SECRET');
  if (get('CHEST_CASH_LIVE_ENABLED') !== 'true' ||
    get('CHEST_CASH_WEBHOOK_READY') !== 'true' ||
    !apiKey || !priceId || !/^pri_[a-z0-9]{26}$/.test(priceId) ||
    !webhookSecret) return null;
  return { apiKey, priceId, webhookSecret };
}

export function validUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

export interface PaddlePrice {
  id?: unknown; status?: unknown; billing_cycle?: unknown; tax_mode?: unknown;
  unit_price?: { amount?: unknown; currency_code?: unknown } | null;
  unit_price_overrides?: unknown;
}

export function validCashPrice(price: PaddlePrice, priceId: string): boolean {
  return price.id === priceId && price.status === 'active' &&
    price.billing_cycle === null && price.tax_mode === 'internal' &&
    price.unit_price?.amount === String(CASH_AMOUNT_MINOR) &&
    price.unit_price?.currency_code === CASH_CURRENCY &&
    (price.unit_price_overrides == null ||
      (Array.isArray(price.unit_price_overrides) && price.unit_price_overrides.length === 0));
}

export function validCreatedTransaction(txn: PaddleTransaction, orderId: string,
  userId: string, priceId: string): txn is PaddleTransaction & { id: string } {
  return typeof txn.id === 'string' && TXN.test(txn.id) &&
    (txn.status === 'draft' || txn.status === 'ready') &&
    txn.collection_mode === 'automatic' && txn.origin === 'api' &&
    txn.currency_code === CASH_CURRENCY &&
    txn.subscription_id == null && Array.isArray(txn.items) && txn.items.length === 1 &&
    txn.items[0].price?.id === priceId && txn.items[0].price?.billing_cycle === null &&
    txn.items[0].quantity === 1 &&
    txn.custom_data?.chest_cash_order_id === orderId &&
    txn.custom_data?.chest_cash_user_id === userId;
}

export interface PaddleTransaction {
  id?: unknown; status?: unknown; currency_code?: unknown; collection_mode?: unknown;
  origin?: unknown; subscription_id?: unknown;
  items?: Array<{ price?: { id?: unknown; billing_cycle?: unknown }, quantity?: unknown }>;
  details?: { totals?: { total?: unknown; discount?: unknown; credit?: unknown } } | null;
  custom_data?: { chest_cash_order_id?: unknown; chest_cash_user_id?: unknown } | null;
  checkout?: { url?: unknown } | null;
}

export interface CashOrder {
  order_id: string; user_id: string; status: string; price_id: string;
  transaction_id: string; amount_minor: number; currency: string; environment: string; event_id?: string | null;
}

export function validCompletedTransaction(txn: PaddleTransaction, order: CashOrder, priceId: string): boolean {
  return typeof txn.id === 'string' && TXN.test(txn.id) && txn.id === order.transaction_id &&
    txn.status === 'completed' &&
    txn.collection_mode === 'automatic' && txn.origin === 'api' &&
    txn.subscription_id == null && txn.currency_code === CASH_CURRENCY &&
    Array.isArray(txn.items) && txn.items.length === 1 &&
    txn.items[0].quantity === 1 && txn.items[0].price?.id === priceId &&
    txn.items[0].price?.billing_cycle === null &&
    txn.details?.totals?.total === String(CASH_AMOUNT_MINOR) &&
    txn.details?.totals?.discount === '0' && txn.details?.totals?.credit === '0' &&
    txn.custom_data?.chest_cash_order_id === order.order_id &&
    txn.custom_data?.chest_cash_user_id === order.user_id &&
    order.price_id === priceId && order.amount_minor === CASH_AMOUNT_MINOR &&
    order.currency === CASH_CURRENCY && order.environment === CASH_ENVIRONMENT &&
    (order.status === 'ready' || order.status === 'completed');
}

function constantTimeEqual(expected: Uint8Array, actual: Uint8Array): boolean {
  let difference = expected.length ^ actual.length;
  const length = Math.max(expected.length, actual.length);
  for (let i = 0; i < length; i++) difference |= (expected[i] ?? 0) ^ (actual[i] ?? 0);
  return difference === 0;
}

export async function verifyPaddleSignature(
  rawBody: string, header: string | null, secret: string, nowMs = Date.now(),
): Promise<boolean> {
  if (!header || !secret) return false;
  const parts = header.split(';').map(part => part.trim().split('='));
  const timestamps = parts.filter(([key]) => key === 'ts').map(([, value]) => value);
  const signatures = parts.filter(([key]) => key === 'h1').map(([, value]) => value);
  if (timestamps.length !== 1 || !/^\d{10}$/.test(timestamps[0] ?? '') || !signatures.length) return false;
  const timestamp = Number(timestamps[0]);
  if (Math.abs(Math.floor(nowMs / 1000) - timestamp) > 5) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key,
    new TextEncoder().encode(`${timestamp}:${rawBody}`)));
  return signatures.some(hex => {
    if (!/^[0-9a-f]{64}$/i.test(hex ?? '')) return false;
    const actual = new Uint8Array((hex ?? '').match(/.{2}/g)?.map(byte => parseInt(byte, 16)) ?? []);
    return constantTimeEqual(digest, actual);
  });
}

export function parseCompletedEvent(value: unknown): { eventId: string; transactionId: string } | null {
  if (!value || typeof value !== 'object') return null;
  const event = value as { event_type?: unknown; event_id?: unknown; data?: { id?: unknown } };
  if (event.event_type !== 'transaction.completed' || typeof event.event_id !== 'string' ||
    !EVENT.test(event.event_id) || typeof event.data?.id !== 'string' || !TXN.test(event.data.id)) return null;
  return { eventId: event.event_id, transactionId: event.data.id };
}

export async function paddleApi<T>(apiKey: string, path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`https://api.paddle.com${path}`, {
      ...init, signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json',
        ...init?.headers },
    });
    if (!response.ok) throw new Error(`PADDLE_HTTP_${response.status}`);
    const body = await response.json() as { data?: T };
    if (!body.data) throw new Error('PADDLE_RESPONSE_INVALID');
    return body.data;
  } finally { clearTimeout(timeout); }
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response([204, 205, 304].includes(status) ? null : JSON.stringify(body), { status, headers: {
    'Content-Type': 'application/json', 'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,content-type,apikey,x-client-info',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  } });
}
