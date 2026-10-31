import { webcrypto } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { type CashConfig, type CashOrder, type PaddleTransaction,
  verifyPaddleSignature } from '../../supabase/functions/_shared/chestCash.ts';
import { handleCashCheckout, handleCashWebhook, type CheckoutDeps,
  type WebhookDeps } from '../../supabase/functions/_shared/chestCashHandlers.ts';

const userId = '123e4567-e89b-42d3-a456-426614174000';
Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
const otherUser = '123e4567-e89b-42d3-a456-426614174001';
const requestId = '123e4567-e89b-42d3-a456-426614174002';
const orderId = '123e4567-e89b-42d3-a456-426614174003';
const transactionId = `txn_${'a'.repeat(26)}`;
const eventId = `evt_${'b'.repeat(26)}`;
const priceId = `pri_${'c'.repeat(26)}`;
const config: CashConfig = { apiKey: 'test-key', webhookSecret: 'test-secret',
  priceId };
const price = { id: priceId, status: 'active', billing_cycle: null, tax_mode: 'internal',
  unit_price: { amount: '990', currency_code: 'BRL' }, unit_price_overrides: [] };

function transaction(overrides: Partial<PaddleTransaction> = {}): PaddleTransaction {
  return { id: transactionId, status: 'completed', currency_code: 'BRL',
    collection_mode: 'automatic', origin: 'api', subscription_id: null,
    items: [{ price: { id: priceId, billing_cycle: null }, quantity: 1 }],
    details: { totals: { total: '990', discount: '0', credit: '0' } },
    custom_data: { chest_cash_order_id: orderId, chest_cash_user_id: userId },
    ...overrides };
}
function checkoutDeps(): CheckoutDeps {
  return { config, getUser: vi.fn(async () => ({ id: userId })),
    state: vi.fn(async () => ({ ready: true, already_owned: false, price_id: priceId,
      amount_minor: 990, currency: 'BRL' })),
    prepare: vi.fn(async () => ({ order_id: orderId, request_id: requestId, status: 'creating' as const,
      price_id: priceId, replayed: false })),
    attach: vi.fn(async () => {}), getPrice: vi.fn(async () => price),
    createTransaction: vi.fn(async () => transaction({ status: 'draft' })),
  };
}
function checkoutRequest() {
  return new Request('https://edge.example.test/chest-cash-checkout', { method: 'POST',
    headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ request_id: requestId }) });
}
const knownOrder: CashOrder = { order_id: orderId, user_id: userId,
  transaction_id: transactionId, status: 'ready', price_id: priceId,
  amount_minor: 990, currency: 'BRL', environment: 'live' };
function webhookDeps(): WebhookDeps {
  return { config, nowMs: 1_800_000_000_000,
    lookup: vi.fn(async () => knownOrder), getPrice: vi.fn(async () => price),
    getTransaction: vi.fn(async () => transaction()), finalize: vi.fn(async () => ({ ok: true })),
  };
}
async function signedRequest(eventType = 'transaction.completed',
  event = eventId, tx = transactionId, timestamp = 1_800_000_000) {
  const raw = JSON.stringify({ event_type: eventType, event_id: event, data: { id: tx } });
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(config.webhookSecret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key,
    new TextEncoder().encode(`${timestamp}:${raw}`)));
  const h1 = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return new Request('https://edge.example.test/chest-cash-webhook', { method: 'POST',
    headers: { 'Paddle-Signature': `ts=${timestamp};h1=${h1}` }, body: raw });
}

describe('chest cash checkout', () => {
  it('serves CORS preflight without creating a request', async () => {
    const deps = checkoutDeps();
    const response = await handleCashCheckout(new Request('https://edge.example.test',
      { method: 'OPTIONS', headers: {
        Origin: 'https://app.example.test',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,apikey,x-client-info,content-type',
      } }), deps);
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    for (const name of ['authorization', 'apikey', 'x-client-info', 'content-type'])
      expect(response.headers.get('Access-Control-Allow-Headers')).toContain(name);
    expect(deps.getUser).not.toHaveBeenCalled();
  });

  it('rejects an expired token before any order or provider call', async () => {
    const deps = checkoutDeps();
    deps.getUser = vi.fn(async () => null);
    const response = await handleCashCheckout(checkoutRequest(), deps);
    expect(response.status).toBe(401);
    expect(deps.prepare).not.toHaveBeenCalled();
    expect(deps.createTransaction).not.toHaveBeenCalled();
  });

  it('fails closed without live configuration', async () => {
    const deps = checkoutDeps(); deps.config = null;
    const result = await (await handleCashCheckout(checkoutRequest(), deps)).json();
    expect(result).toMatchObject({ ready: false, reason: 'NOT_CONFIGURED' });
    expect(deps.prepare).not.toHaveBeenCalled();
  });

  it('refuses a recurring or tax-exclusive price before creating an order', async () => {
    for (const drift of [
      { ...price, billing_cycle: { interval: 'month' } },
      { ...price, tax_mode: 'external' },
    ]) {
      const deps = checkoutDeps(); deps.getPrice = vi.fn(async () => drift);
      const result = await (await handleCashCheckout(checkoutRequest(), deps)).json();
      expect(result).toMatchObject({ ready: false, reason: 'PRICE_MISMATCH' });
      expect(deps.prepare).not.toHaveBeenCalled();
    }
  });

  it('returns the immutable ready request ID for another browser to resume', async () => {
    const deps = checkoutDeps();
    deps.state = vi.fn(async () => ({ ready: true, already_owned: false, price_id: priceId,
      amount_minor: 990, currency: 'BRL', order_id: orderId,
      order_status: 'ready', request_id: requestId }));
    const response = await handleCashCheckout(new Request('https://edge.example.test', {
      method: 'GET', headers: { Authorization: 'Bearer token' },
    }), deps);
    expect(await response.json()).toMatchObject({ ready: true,
      order_id: orderId, order_status: 'ready', request_id: requestId });
    expect(deps.prepare).not.toHaveBeenCalled();
  });

  it('binds and returns only the attached transaction', async () => {
    const deps = checkoutDeps();
    const response = await handleCashCheckout(checkoutRequest(), deps);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ready: true, request_id: requestId,
      order_id: orderId, transaction_id: transactionId, replayed: false });
    expect(deps.attach).toHaveBeenCalledWith(orderId, userId, transactionId);
  });

  it('does not create again after a lost provider response', async () => {
    const deps = checkoutDeps();
    deps.createTransaction = vi.fn(async () => { throw new Error('network lost'); });
    expect((await handleCashCheckout(checkoutRequest(), deps)).status).toBe(202);
    deps.prepare = vi.fn(async () => ({ order_id: orderId, request_id: requestId,
      status: 'creating' as const, price_id: priceId, replayed: true }));
    expect((await handleCashCheckout(checkoutRequest(), deps)).status).toBe(202);
    expect(deps.createTransaction).toHaveBeenCalledTimes(1);
  });

  it('withholds a transaction whose server creation response changed owner', async () => {
    const deps = checkoutDeps();
    deps.createTransaction = vi.fn(async () => transaction({ status: 'draft',
      custom_data: { chest_cash_order_id: orderId, chest_cash_user_id: otherUser } }));
    expect((await handleCashCheckout(checkoutRequest(), deps)).status).toBe(202);
    expect(deps.attach).not.toHaveBeenCalled();
  });

  it('reuses a ready order without creating another transaction', async () => {
    const deps = checkoutDeps();
    deps.prepare = vi.fn(async () => ({ order_id: orderId, request_id: requestId,
      status: 'ready' as const, price_id: priceId, transaction_id: transactionId,
      replayed: true }));
    expect(await (await handleCashCheckout(checkoutRequest(), deps)).json())
      .toMatchObject({ ready: true, request_id: requestId, replayed: true });
    expect(deps.createTransaction).not.toHaveBeenCalled();
  });
});

describe('chest cash webhook', () => {
  it('rejects forged and stale signatures before lookup', async () => {
    const deps = webhookDeps();
    const forged = await signedRequest();
    forged.headers.set('Paddle-Signature', `ts=1800000000;h1=${'0'.repeat(64)}`);
    expect((await handleCashWebhook(forged, deps)).status).toBe(401);
    expect((await handleCashWebhook(await signedRequest('transaction.completed',
      eventId, transactionId, 1_799_999_990), deps)).status).toBe(401);
    expect(deps.lookup).not.toHaveBeenCalled();
  });

  it('ignores out-of-order paid events without granting', async () => {
    const deps = webhookDeps();
    expect((await handleCashWebhook(await signedRequest('transaction.paid'), deps)).status).toBe(200);
    expect(deps.finalize).not.toHaveBeenCalled();
  });

  it('rejects an unbound transaction and another user custom data', async () => {
    const deps = webhookDeps(); deps.lookup = vi.fn(async () => null);
    expect((await handleCashWebhook(await signedRequest(), deps)).status).toBe(409);
    deps.lookup = vi.fn(async () => knownOrder);
    deps.getTransaction = vi.fn(async () => transaction({
      custom_data: { chest_cash_order_id: orderId, chest_cash_user_id: otherUser } }));
    expect((await handleCashWebhook(await signedRequest(), deps)).status).toBe(409);
    expect(deps.finalize).not.toHaveBeenCalled();
  });

  it('rejects amount, currency, quantity, recurring price, and discount drift', async () => {
    const variants: Partial<PaddleTransaction>[] = [
      { details: { totals: { total: '991', discount: '0', credit: '0' } } },
      { currency_code: 'USD' },
      { items: [{ price: { id: priceId, billing_cycle: null }, quantity: 2 }] },
      { items: [{ price: { id: priceId, billing_cycle: { interval: 'month' } }, quantity: 1 }] },
      { details: { totals: { total: '990', discount: '10', credit: '0' } } },
    ];
    for (const variant of variants) {
      const deps = webhookDeps(); deps.getTransaction = vi.fn(async () => transaction(variant));
      expect((await handleCashWebhook(await signedRequest(), deps)).status).toBe(409);
      expect(deps.finalize).not.toHaveBeenCalled();
    }
  });

  it('finalizes a verified event and tolerates delivery replay', async () => {
    const deps = webhookDeps();
    let completed = false;
    deps.lookup = vi.fn(async () => completed
      ? { ...knownOrder, status: 'completed', event_id: eventId } : knownOrder);
    deps.finalize = vi.fn(async () => { completed = true; });
    expect((await handleCashWebhook(await signedRequest(), deps)).status).toBe(200);
    expect(await (await handleCashWebhook(await signedRequest(), deps)).json())
      .toMatchObject({ ok: true, replayed: true });
    expect(deps.finalize).toHaveBeenCalledTimes(1);
    expect(deps.finalize).toHaveBeenCalledWith(transactionId, eventId, priceId);
  });

  it('verifies the exact raw signed bytes', async () => {
    const request = await signedRequest();
    const raw = await request.text();
    expect(await verifyPaddleSignature(raw, request.headers.get('Paddle-Signature'),
      config.webhookSecret, 1_800_000_000_000)).toBe(true);
    expect(await verifyPaddleSignature(`${raw} `, request.headers.get('Paddle-Signature'),
      config.webhookSecret, 1_800_000_000_000)).toBe(false);
  });
});
