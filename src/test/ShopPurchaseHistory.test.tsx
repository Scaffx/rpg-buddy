import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ShopPage from '@/pages/ShopPage';

const state = vi.hoisted(() => ({
  calls: [] as Array<[string, unknown]>,
  rows: [] as Array<{ id: string; type: string; amount: number; reason: string; created_at: string }>,
  error: null as unknown,
  timeItems: [] as Array<Record<string, unknown>>,
  equipItems: [] as Array<Record<string, unknown>>,
  buyEquip: vi.fn((..._args: unknown[]) => {}),
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
vi.mock('@/hooks/useGold', () => ({
  useGoldBalance: () => ({ data: { gold: 1000 } }),
  useAdventureIncome7d: () => ({ data: { dailyGold: 0 } }),
  useBuyItem: () => ({ mutate: vi.fn() }),
}));
vi.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ data: { level: 1 } }) }));
vi.mock('@/hooks/useInventory', () => ({
  useInventory: () => ({ data: [] }),
  useShopItems: () => ({ data: state.equipItems, isLoading: false, error: null }),
  useBuyEquipment: () => ({ mutate: state.buyEquip }),
}));
vi.mock('@/hooks/useCompanion', () => ({
  useShopPets: () => ({ data: [], isLoading: false, error: null }),
  useAllCompanions: () => ({ data: [] }),
  useBuyPet: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/components/AppLayout', () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/components/TranslatedGuidedTour', () => ({ default: () => null }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'shop_items') return { select: () => Promise.resolve({ data: state.timeItems, error: null }) };
      if (table !== 'gold_history') throw new Error(`Unexpected table: ${table}`);
      const query = {
        eq: (column: string, value: unknown) => { state.calls.push(['eq', [column, value]]); return query; },
        in: (column: string, value: unknown) => { state.calls.push(['in', [column, value]]); return query; },
        lt: (column: string, value: unknown) => { state.calls.push(['lt', [column, value]]); return query; },
        order: (column: string, value: unknown) => { state.calls.push(['order', [column, value]]); return query; },
        limit: (value: number) => {
          state.calls.push(['limit', value]);
          return Promise.resolve({ data: state.rows, error: state.error });
        },
      };
      return { select: (columns: string) => { state.calls.push(['select', columns]); return query; } };
    },
  },
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let container: HTMLDivElement;
let queryClient: QueryClient;

async function renderPage() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => root.render(<QueryClientProvider client={queryClient}><ShopPage /></QueryClientProvider>));
  await settleQueries();
}

async function settleQueries() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 25)); });
}

async function openHistory() {
  const button = [...container.querySelectorAll('button')]
    .find((candidate) => candidate.textContent?.includes('app.shop.link_purchase_history'))!;
  await act(async () => button.click());
  await settleQueries();
  return document.querySelector('[role="dialog"]')!;
}

beforeEach(() => {
  state.calls = [];
  state.rows = [];
  state.error = null;
  state.timeItems = [];
  state.equipItems = [];
  state.buyEquip.mockReset();
});

afterEach(async () => {
  if (root) await act(async () => root.unmount());
  container?.remove();
  queryClient?.clear();
  document.body.innerHTML = '';
});

describe('histórico de compras da loja', () => {
  it('abre pelo botão e consulta somente 20 compras próprias e tipos reais', async () => {
    state.rows = [{ id: 'purchase-1', type: 'compra_equipamento', amount: -120,
      reason: 'Comprou Poção de HP Menor', created_at: '2026-10-22T12:00:00Z' }];
    await renderPage();
    expect(state.calls).toEqual([]);
    const dialog = await openHistory();
    expect(dialog.textContent).toContain('Comprou Poção de HP Menor');
    expect(dialog.textContent).toContain('-120');
    expect(state.calls).toEqual([
      ['select', 'id, type, amount, reason, created_at'],
      ['eq', ['user_id', 'user-1']],
      ['in', ['type', ['compra_loja', 'compra_equipamento', 'compra_pet']]],
      ['lt', ['amount', 0]],
      ['order', ['created_at', { ascending: false }]],
      ['limit', 20],
    ]);
    await act(async () => {
      [...dialog.querySelectorAll('button')].find((button) => button.textContent === 'Fechar')!.click();
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await openHistory();
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('mostra estado vazio e erro de consulta persistente', async () => {
    await renderPage();
    let dialog = await openHistory();
    expect(dialog.textContent).toContain('Você ainda não fez compras');
    await act(async () => {
      [...dialog.querySelectorAll('button')].find((button) => button.textContent === 'Fechar')!.click();
    });
    state.error = { message: 'Consulta indisponível', code: '42501' };
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ['purchase-history', 'user-1'] }); });
    dialog = await openHistory();
    expect(dialog.querySelector('[role="alert"]')?.textContent).toContain('Consulta indisponível');
    expect(dialog.querySelector('[role="alert"]')?.textContent).toContain('Não foi possível carregar');
  });

  it.each([
    ['Error', new Error('Falha de rede'), 'Falha de rede'],
    ['string', 'Sessão expirada', 'Sessão expirada'],
  ])('mostra erro %s sem perder a mensagem', async (_kind, error, message) => {
    state.error = error;
    await renderPage();
    const dialog = await openHistory();
    expect(dialog.querySelector('[role="alert"]')?.textContent).toContain(message);
  });

  it('invalida o histórico após uma compra confirmada', async () => {
    state.equipItems = [{ id: 'item-1', name: 'Espada', description: 'Arma', category: 'weapon',
      rarity: 'comum', level_required: 1, shop_price: 10, stackable: false }];
    state.buyEquip.mockImplementation((_item, callbacks: { onSuccess: () => void }) => callbacks.onSuccess());
    await renderPage();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const buyButton = [...container.querySelectorAll('button')].find((button) => button.textContent === 'app.shop.button_buy')!;
    expect(buyButton, container.textContent || '').toBeDefined();
    await act(async () => buyButton.click());
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['purchase-history', 'user-1'] });
  });
});
