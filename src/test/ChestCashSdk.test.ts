import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
const script = () => document.querySelector<HTMLScriptElement>('script[src="https://cdn.paddle.com/paddle/v2/paddle.js"]')!;
function paddle() {
  const sdk = { Environment: { set: vi.fn() }, Initialize: vi.fn(), Checkout: { open: vi.fn() } };
  Object.defineProperty(window, 'Paddle', { value: sdk, writable: true, configurable: true });
  return sdk;
}
beforeEach(() => { vi.resetModules(); vi.stubEnv('VITE_PAYMENTS_CLIENT_TOKEN', 'live_fixturepublictoken'); });
afterEach(() => { document.querySelectorAll('script[src*="cdn.paddle.com"]').forEach(node => node.remove()); vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('carregamento do pagamento avulso', () => {
  it('compartilha um único carregamento entre pedidos simultâneos', async () => {
    const sdk = paddle();
    const { initializePaddle } = await import('@/lib/paddle');
    const first = initializePaddle(); const second = initializePaddle();
    expect(document.querySelectorAll('script[src*="cdn.paddle.com"]')).toHaveLength(1);
    script().dispatchEvent(new Event('load'));
    await Promise.all([first, second]);
    expect(sdk.Initialize).toHaveBeenCalledTimes(1);
  });

  it('encerra a espera em 15 segundos e permite retomar sem inicialização tardia', async () => {
    vi.useFakeTimers(); const sdk = paddle();
    const { initializePaddle } = await import('@/lib/paddle');
    const first = initializePaddle();
    const lateLoad = script().onload!;
    const rejected = expect(first).rejects.toThrow('demorou demais');
    await vi.advanceTimersByTimeAsync(15000); await rejected;
    expect(script()).toBeNull();
    lateLoad.call(document.createElement('script'), new Event('load'));
    expect(sdk.Initialize).not.toHaveBeenCalled();
    const retry = initializePaddle(); script().dispatchEvent(new Event('load')); await retry;
    expect(sdk.Initialize).toHaveBeenCalledTimes(1);
  });

  it('recusa abrir o checkout se a conta mudar enquanto o SDK carrega', async () => {
    const sdk = paddle();
    const { openChestCashCheckout } = await import('@/lib/chestCashCheckout');
    const result = openChestCashCheckout('txn_verifiedfixture', () => { throw new Error('Conta mudou'); });
    const rejected = expect(result).rejects.toThrow('Conta mudou');
    script().dispatchEvent(new Event('load')); await rejected;
    expect(sdk.Checkout.open).not.toHaveBeenCalled();
  });

  it('não registra dados completos dos eventos de pagamento', async () => {
    const sdk = paddle(); const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { initializePaddle } = await import('@/lib/paddle');
    const result = initializePaddle(); script().dispatchEvent(new Event('load')); await result;
    const config = sdk.Initialize.mock.calls[0][0] as { eventCallback: (event: Record<string, string>) => void };
    config.eventCallback({ name: 'checkout.error', customer: 'private-fixture-value' });
    expect(error).toHaveBeenCalledWith('[Paddle] Falha no checkout.');
    expect(JSON.stringify(error.mock.calls)).not.toContain('private-fixture-value');
    expect(log).not.toHaveBeenCalled();
  });

  it('abre a transação do servidor sem entrada de descontos nem criação de outro carrinho', async () => {
    const sdk = paddle();
    const { openChestCashCheckout } = await import('@/lib/chestCashCheckout');
    const check = vi.fn();
    const result = openChestCashCheckout('txn_verifiedfixture', check);
    script().dispatchEvent(new Event('load')); await result;
    expect(check).toHaveBeenCalledTimes(1);
    expect(sdk.Checkout.open).toHaveBeenCalledWith({ transactionId: 'txn_verifiedfixture',
      settings: { displayMode: 'overlay', allowLogout: false, showAddDiscounts: false, theme: 'dark' } });
  });
});
