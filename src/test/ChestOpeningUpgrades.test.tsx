import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChestOpeningUpgrades } from '@/components/adventure/ChestOpeningUpgrades';

const mocked = vi.hoisted(() => ({ cap: 1 as number | undefined, buy: vi.fn(), pending: null as { target_cap: 2 | 3 } | null }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'user' } }) }));
vi.mock('@/hooks/useAdventureChests', () => ({
  useAdventureChests: () => ({ data: { openings_cap: mocked.cap, prices_gold: mocked.cap === undefined ? undefined : { second: 6000, third: 18000 } }, isLoading: false }),
  adventureChestError: (error: unknown) => error instanceof Error ? error.message : String(error),
}));
vi.mock('@/hooks/useChestOpeningPurchase', () => ({ useChestOpeningPurchase: () => ({ buy: mocked.buy, pending: mocked.pending, isPending: false }) }));
vi.mock('@/hooks/useChestCashPurchase', () => ({ useChestCashPurchase: () => ({ status: { data: { ready: false }, isFetching: false }, checkout: { isPending: false }, clientReady: false }) }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let container: HTMLDivElement;
function render(gold: number | null = 30000) { act(() => root.render(<ChestOpeningUpgrades gold={gold} />)); }
function button(label: string) { return [...container.querySelectorAll('button')].find(b => b.textContent === label)!; }
beforeEach(() => {
  mocked.cap = 1; mocked.buy.mockReset(); mocked.pending = null;
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

describe('liberações permanentes de abertura', () => {
  it('oferece a segunda abertura e exige a anterior para a terceira', async () => {
    mocked.buy.mockResolvedValue({ target_cap: 2, gold_spent: 6000, replayed: false });
    render();
    expect(button('Liberar 2ª abertura').disabled).toBe(false);
    expect(button('Liberar 3ª abertura').disabled).toBe(true);
    await act(async () => button('Liberar 2ª abertura').click());
    expect(mocked.buy).toHaveBeenCalledWith(2);
    expect(container.querySelector('[role="status"]')?.textContent).toContain('permanentemente por 6.000 ouro');
  });

  it('não oferece compra sem saldo ou sem contrato confirmado do servidor', () => {
    render(null);
    expect(button('Liberar 2ª abertura').disabled).toBe(true);
    mocked.cap = undefined;
    render();
    expect(container.textContent).toContain('ainda não estão disponíveis neste servidor');
    expect(button('Liberar 2ª abertura').disabled).toBe(true);
  });

  it('mantém cash indisponível enquanto não há checkout avulso configurado', () => {
    mocked.cap = 3;
    render();
    const cashButton = [...container.querySelectorAll('button')].find(b => b.textContent?.includes('Em preparação'))!;
    expect(cashButton.disabled).toBe(true);
    expect(container.textContent).toContain('Doações não liberam esta abertura');
  });

  it('retoma o pedido pendente e bloqueia outra liberação', async () => {
    mocked.pending = { target_cap: 2 };
    mocked.buy.mockResolvedValue({ target_cap: 2, gold_spent: 6000, replayed: true });
    render();
    expect(button('Liberar 2ª abertura').disabled).toBe(true);
    await act(async () => button('Consultar compra pendente').click());
    expect(mocked.buy).toHaveBeenCalledWith(2);
    expect(container.textContent).toContain('Nenhum novo débito');
  });
});
