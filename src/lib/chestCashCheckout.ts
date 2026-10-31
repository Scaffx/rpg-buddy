import { getPaddleEnvironment, initializePaddle } from '@/lib/paddle';

export function chestCashClientConfigured() {
  return Boolean(import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN) && getPaddleEnvironment() === 'live';
}

export async function openChestCashCheckout(transactionId: string, beforeOpen: () => void) {
  if (!/^txn_[a-z0-9]+$/.test(transactionId) || !chestCashClientConfigured()) {
    throw new Error('O pagamento avulso ainda não está disponível neste ambiente.');
  }
  await initializePaddle();
  beforeOpen();
  if (typeof window.Paddle?.Checkout?.open !== 'function') throw new Error('Não foi possível abrir o pagamento seguro.');
  window.Paddle.Checkout.open({
    transactionId,
    settings: { displayMode: 'overlay', allowLogout: false, showAddDiscounts: false, theme: 'dark' },
  });
}
