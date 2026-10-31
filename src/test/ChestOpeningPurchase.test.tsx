import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChestOpeningPurchase } from '@/hooks/useChestOpeningPurchase';

const mocked = vi.hoisted(() => ({
  userId: '11111111-1111-4111-8111-111111111111', epoch: 1,
  rpc: vi.fn(),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: mocked.userId }, continuity: { epoch: mocked.epoch } }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (...args: unknown[]) => mocked.rpc(...args) } }));
vi.mock('@/lib/authDataGate', () => ({ authDataGate: { approvedToken: () => null } }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let container: HTMLDivElement;
let client: QueryClient;
let current: ReturnType<typeof useChestOpeningPurchase>;
function Harness() { current = useChestOpeningPurchase(); return <span>{current.pending?.request_id ?? 'none'}</span>; }
async function renderHook() {
  await act(async () => root.render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>));
}
function receipt(args: Record<string, unknown>, overrides = {}) {
  return { data: { found: true, ok: true, replayed: false, request_id: args.p_request_id,
    target_cap: args.p_target_cap, openings_cap: args.p_target_cap, gold_spent: 6000, gold: 4000, ...overrides }, error: null, status: 200 };
}
beforeEach(async () => {
  sessionStorage.clear();
  mocked.userId = '11111111-1111-4111-8111-111111111111';
  mocked.epoch = 1;
  mocked.rpc.mockReset();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  await renderHook();
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); client.clear(); sessionStorage.clear(); });

describe('compra de aberturas de baú', () => {
  it('retoma o mesmo pedido após resposta perdida, sem criar outro débito', async () => {
    mocked.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Failed to fetch' }, status: 0 });
    await act(async () => { await expect(current.buy(2)).rejects.toThrow('Resposta incerta'); });
    const first = mocked.rpc.mock.calls[0][1];
    expect(current.pending?.request_id).toBe(first.p_request_id);
    mocked.rpc.mockImplementationOnce(async (_name, args) => receipt({ ...args, p_target_cap: 2 }, { replayed: true }));
    await act(async () => { expect((await current.retryPending()).replayed).toBe(true); });
    expect(mocked.rpc.mock.calls[1]).toEqual(['get_adventure_chest_opening_receipt', { p_request_id: first.p_request_id }]);
    expect(current.pending).toBe(null);
  });

  it('preserva pedido quando recibo não corresponde à compra', async () => {
    mocked.rpc.mockImplementationOnce(async (_name, args) => receipt(args, { target_cap: 3 }));
    await act(async () => { await expect(current.buy(2)).rejects.toThrow('não confirmou'); });
    expect(current.pending?.target_cap).toBe(2);
    const count = mocked.rpc.mock.calls.length;
    await act(async () => { await expect(current.buy(3)).rejects.toThrow('compra pendente'); });
    expect(mocked.rpc).toHaveBeenCalledTimes(count);
  });

  it('reenvia a mesma chave somente depois de o servidor confirmar que ainda não há recibo', async () => {
    mocked.rpc.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await act(async () => { await expect(current.buy(2)).rejects.toThrow('Resposta incerta'); });
    const first = mocked.rpc.mock.calls[0][1];
    mocked.rpc.mockResolvedValueOnce({ data: { found: false }, error: null, status: 200 });
    mocked.rpc.mockImplementationOnce(async (_name, args) => receipt(args));
    await act(async () => { await current.retryPending(); });
    expect(mocked.rpc.mock.calls[2]).toEqual(['buy_adventure_chest_opening', first]);
    expect(current.pending).toBe(null);
  });

  it('limpa somente uma rejeição transacional confirmada pelo servidor', async () => {
    mocked.rpc.mockResolvedValueOnce({ data: null, error: { code: '22023', message: 'INSUFFICIENT_GOLD' }, status: 400 });
    await act(async () => { await expect(current.buy(2)).rejects.toThrow('ouro disponível'); });
    expect(current.pending).toBe(null);
  });

  it('ignora resposta da conta anterior e mantém recibo pendente na origem', async () => {
    let resolve!: (value: ReturnType<typeof receipt>) => void;
    mocked.rpc.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    let promise!: Promise<unknown>;
    let failure: unknown;
    await act(async () => { promise = current.buy(2).catch(error => { failure = error; }); });
    const request = mocked.rpc.mock.calls[0][1];
    const originalUser = mocked.userId;
    mocked.userId = '22222222-2222-4222-8222-222222222222';
    mocked.epoch++;
    await renderHook();
    await act(async () => { resolve(receipt(request)); await promise; });
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toContain('sessão mudou');
    expect(current.pending).toBe(null);
    expect(sessionStorage.getItem(`chest-opening-pending:${originalUser}`)).toContain(request.p_request_id);
    expect(sessionStorage.getItem(`chest-opening-pending:${mocked.userId}`)).toBe(null);
  });
});
