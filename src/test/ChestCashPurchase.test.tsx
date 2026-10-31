import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChestCashPurchase } from '@/hooks/useChestCashPurchase';

const mocked = vi.hoisted(() => ({ userId: '11111111-1111-4111-8111-111111111111', epoch: 1,
  invoke: vi.fn(), open: vi.fn(), ready: true, owned: false }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: mocked.userId }, continuity: { epoch: mocked.epoch } }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: (...args: unknown[]) => mocked.invoke(...args) } } }));
vi.mock('@/lib/authDataGate', () => ({ authDataGate: { approvedToken: () => null } }));
vi.mock('@/lib/chestCashCheckout', () => ({ chestCashClientConfigured: () => true, openChestCashCheckout: (...args: unknown[]) => mocked.open(...args) }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null;
let container: HTMLDivElement;
let qc: QueryClient;
let current: ReturnType<typeof useChestCashPurchase>;
function Harness() { current = useChestCashPurchase(true); return null; }
async function renderHook() { await act(async () => root!.render(<QueryClientProvider client={qc}><Harness /></QueryClientProvider>)); }
async function settle() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); }); }
const order = (request: string) => ({ data: { ready: true, request_id: request,
  order_id: '33333333-3333-4333-8333-333333333333', transaction_id: 'txn_verifiedfixture', replayed: false }, error: null });
beforeEach(async () => {
  mocked.userId = '11111111-1111-4111-8111-111111111111'; mocked.epoch = 1;
  mocked.ready = true; mocked.owned = false; sessionStorage.clear();
  mocked.open.mockReset().mockResolvedValue(undefined);
  mocked.invoke.mockReset().mockImplementation(async (_name, args) => args.method === 'GET'
    ? { data: { ready: mocked.ready, price: { currency: 'BRL', amount_minor: 990 }, already_owned: mocked.owned }, error: null }
    : order(args.body.request_id));
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  await renderHook(); await settle();
});
afterEach(async () => { if (root) await act(async () => root!.unmount()); container.remove(); qc.clear(); sessionStorage.clear(); });

describe('cash avulso para a quarta abertura', () => {
  it('abre só a transação confirmada e não libera a abertura pelo retorno do SDK', async () => {
    qc.setQueryData(['adventure-chests', mocked.userId], { openings_cap: 3 });
    await act(async () => { await current.begin(); });
    expect(mocked.open).toHaveBeenCalledWith('txn_verifiedfixture', expect.any(Function));
    expect(qc.getQueryData(['adventure-chests', mocked.userId])).toEqual({ openings_cap: 3 });
    expect(current.requestId).not.toBe(null);
    mocked.owned = true;
    await act(async () => { await current.verify(); });
    expect(current.requestId).toBe(null);
  });

  it('mantém o mesmo pedido após resposta perdida', async () => {
    mocked.invoke.mockImplementationOnce(async () => { throw new TypeError('Failed to fetch'); });
    await act(async () => { await expect(current.begin()).rejects.toThrow('Resposta incerta'); });
    const request = current.requestId;
    await act(async () => { await current.begin(); });
    const posts = mocked.invoke.mock.calls.filter(([, args]) => args.method === 'POST');
    expect(posts).toHaveLength(2);
    expect(posts.map(([, args]) => args.body.request_id)).toEqual([request, request]);
  });

  it('retoma o pedido confirmado pelo servidor mesmo sem armazenamento neste navegador', async () => {
    const request = '44444444-4444-4444-8444-444444444444';
    mocked.invoke.mockImplementation(async (_name, args) => args.method === 'GET'
      ? { data: { ready: true, already_owned: false, price: { currency: 'BRL', amount_minor: 990 },
        order_status: 'ready', order_id: '33333333-3333-4333-8333-333333333333', request_id: request }, error: null }
      : order(args.body.request_id));
    await act(async () => { await current.verify(); }); await settle();
    expect(current.requestId).toBe(request);
    await act(async () => { await current.begin(); });
    expect(mocked.invoke.mock.calls.filter(([, args]) => args.method === 'POST')[0][1].body).toEqual({ request_id: request });
  });

  it('não repete uma criação de resultado incerto enquanto o pedido aguarda verificação', async () => {
    mocked.invoke.mockResolvedValue({ data: { ready: true, already_owned: false, price: { currency: 'BRL', amount_minor: 990 }, order_status: 'creating' }, error: null });
    await act(async () => { await current.verify(); }); await settle();
    await act(async () => { await expect(current.begin()).rejects.toThrow('aguarda verificação'); });
    expect(mocked.invoke.mock.calls.filter(([, args]) => args.method === 'POST')).toHaveLength(0);
  });

  it('recusa checkout quando o servidor informa configuração indisponível', async () => {
    mocked.ready = false;
    await act(async () => { await current.verify(); });
    await settle();
    await act(async () => { await expect(current.begin()).rejects.toThrow('ainda não está disponível'); });
    expect(mocked.invoke.mock.calls.filter(([, args]) => args.method === 'POST')).toHaveLength(0);
    expect(mocked.open).not.toHaveBeenCalled();
  });

  it('não abre o pagamento da conta anterior após trocar de conta', async () => {
    let resolve!: (value: ReturnType<typeof order>) => void;
    mocked.invoke.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    let result!: Promise<unknown>;
    let failure: unknown;
    await act(async () => { result = current.begin().catch(error => { failure = error; }); });
    const request = current.requestId!;
    mocked.userId = '22222222-2222-4222-8222-222222222222'; mocked.epoch++;
    await renderHook();
    await act(async () => { resolve(order(request)); await result; });
    expect((failure as Error).message).toContain('sessão mudou');
    expect(mocked.open).not.toHaveBeenCalled();
  });

  it('verifica a conta novamente depois de carregar o SDK e antes de abrir o pagamento', async () => {
    let finish!: () => void;
    let didOpen = false;
    mocked.open.mockImplementationOnce((_transaction: string, beforeOpen: () => void) => new Promise<void>((resolve, reject) => {
      finish = () => { try { beforeOpen(); didOpen = true; resolve(); } catch (error) { reject(error); } };
    }));
    let result!: Promise<unknown>;
    let failure: unknown;
    await act(async () => { result = current.begin().catch(error => { failure = error; }); });
    await act(async () => root!.unmount()); root = null;
    await act(async () => { finish(); await result; });
    expect(didOpen).toBe(false);
    expect((failure as Error).message).toContain('sessão mudou');
  });
});
