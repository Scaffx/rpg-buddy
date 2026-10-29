import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DungeonArena, { type DungeonArenaProps } from '@/components/DungeonArena';

const mock = vi.hoisted(() => ({
  user: { id: 'user-a' } as { id: string } | null,
  rpc: vi.fn(),
  from: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: mock.user }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mock.toast }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mock.rpc, from: mock.from } }));
vi.mock('@/hooks/useDungeonPartnerships', () => ({
  useRecordPartnership: () => ({ mutate: vi.fn() }),
  useDungeonPartnerships: () => ({ data: [] }),
  getBondTier: () => 0,
  BOND_TIERS: [],
  runsToNextTier: () => ({ runsNeeded: 0, next: 0 }),
}));
vi.mock('@/components/branding/LifeonRPGSplash', () => ({ default: () => <div>Entrando</div> }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const itemId = '36aa16a5-153d-4c08-941e-ae3ee51d54d4';
const hpId = '11111111-1111-4111-8111-111111111111';
const mpId = '22222222-2222-4222-8222-222222222222';
const potionProps: DungeonArenaProps = {
  dungeonId: '1', dungeonName: 'Caverna', initialPlayerHp: 40, initialPlayerMaxHp: 100,
  initialPlayerMp: 5, initialPlayerMaxMp: 40, playerLevel: 1, playerAtk: 10, playerDef: 0,
  potions: [
    { invId: hpId, name: 'Poção de HP', effect: 'heal_30', icon: '🧪', qty: 1 },
    { invId: mpId, name: 'Poção de MP', effect: 'mana_20', icon: '💧', qty: 1 },
  ],
  friendCount: 0, onVictory: vi.fn(), onDefeat: vi.fn(), onFlee: vi.fn(),
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;
function queryButton(name: RegExp): HTMLButtonElement | null {
  return Array.from(container?.querySelectorAll('button') ?? []).find(button => name.test(button.textContent ?? '')) ?? null;
}
function getButton(name: RegExp): HTMLButtonElement {
  const button = queryButton(name);
  if (!button) throw new Error(`Button not found: ${name}`);
  return button;
}
function pageText() { return container?.textContent ?? ''; }

type RpcResult = { data: Record<string, unknown> | null; error: { message: string; code?: string } | null; status?: number };
const rpcReply = (value: Promise<RpcResult>) => ({ abortSignal: (_signal: AbortSignal) => value });
const receipt = (effect = 'heal_30', preserved = false): RpcResult => ({
  data: { ok: true, item_id: itemId, effect, preserved }, error: null,
});
function inventoryQuery(data: { item_id: string } | { quantity: number }) {
  return {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), abortSignal: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(async () => ({ data, error: null })),
  };
}

function mount(props: DungeonArenaProps = potionProps) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(<QueryClientProvider client={client}><DungeonArena {...props} /></QueryClientProvider>));
  act(() => { vi.advanceTimersByTime(1700); });
  vi.useRealTimers();
  act(() => getButton(/Entrar na Dungeon/).click());
  return { rerenderArena: (next: DungeonArenaProps) => act(() => root!.render(
    <QueryClientProvider client={client}><DungeonArena {...next} /></QueryClientProvider>)),
    unmount: () => { act(() => root!.unmount()); root = null; container?.remove(); container = null; },
  };
}

async function clickPotion(type: 'HP' | 'MP') {
  await act(async () => {
    getButton(new RegExp(`${type} Poção`)).click();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
  mock.from.mockImplementation(() => inventoryQuery({ item_id: itemId }));
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove(); root = null; container = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
  mock.user = { id: 'user-a' };
  mock.rpc.mockReset(); mock.from.mockReset(); mock.toast.mockReset();
});

describe('DungeonArena potion confirmation', () => {
  it('waits for a valid receipt, heals once, and decrements only a consumed charge', async () => {
    const pending = deferred<RpcResult>();
    mock.rpc.mockReturnValueOnce(rpcReply(pending.promise));
    mount();
    await clickPotion('HP');
    expect(mock.rpc).toHaveBeenCalledWith('consume_inventory_item', { p_inventory_id: hpId });
    expect(pageText()).toContain('40/100');
    expect(pageText()).not.toContain('Poção de HP usada!');
    expect(getButton(/Aguardando consumo/)).toBeDisabled();

    await act(async () => { pending.resolve(receipt()); await pending.promise; });
    expect(pageText()).toContain('60/100');
    expect(pageText().match(/Poção de HP usada!/g)).toHaveLength(1);
    expect(queryButton(/HP Poção/)).toBeNull();
    expect(mock.toast).not.toHaveBeenCalled();
  });

  it('keeps stock and HP on RPC failure, then allows a retry', async () => {
    const pending = deferred<RpcResult>();
    mock.rpc.mockReturnValueOnce(rpcReply(pending.promise)).mockReturnValueOnce(rpcReply(Promise.resolve(receipt())));
    mount();
    await clickPotion('HP');
    await act(async () => { pending.resolve({ data: null, error: { message: 'ITEM_NOT_OWNED', code: 'P0001' }, status: 400 }); await pending.promise; });
    expect(pageText()).toContain('40/100');
    expect(pageText()).not.toContain('Poção de HP usada!');
    expect(getButton(/HP Poção ×1/)).toBeEnabled();
    expect(pageText()).toContain('Auto ON');
    expect(mock.from).toHaveBeenCalledTimes(1);
    expect(mock.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Poção não consumida', variant: 'destructive' }));
    await clickPotion('HP');
    expect(pageText()).toContain('60/100');
    expect(mock.rpc).toHaveBeenCalledTimes(2);
  });

  it.each([
    { failure: 'SDK fetch failure', error: { message: 'TypeError: Failed to fetch', code: '' }, status: 0 },
    { failure: 'transport code', error: { message: 'socket closed', code: 'ECONNRESET' }, status: 0 },
    { failure: 'gateway 504', error: { message: 'Gateway Timeout', code: '' }, status: 504 },
  ])('treats $failure as uncertain and stops the next automatic attempt after stock refresh', async ({ error, status }) => {
    mock.from.mockImplementationOnce(() => inventoryQuery({ item_id: itemId }))
      .mockImplementationOnce(() => inventoryQuery({ quantity: 1 }));
    mock.rpc.mockReturnValueOnce(rpcReply(Promise.resolve({ data: null, error, status })));
    mount({ ...potionProps, initialPlayerHp: 20, playerAtk: 1 });
    await clickPotion('HP');
    expect(pageText()).toContain('20/100');
    expect(pageText()).not.toContain('Poção de HP usada!');
    expect(pageText()).toContain('Consumo não confirmado');
    expect(getButton(/HP Poção ×1/)).toBeEnabled();
    expect(pageText()).toContain('Auto OFF');
    expect(mock.from).toHaveBeenCalledTimes(2);
    expect(mock.rpc).toHaveBeenCalledTimes(1);
    act(() => getButton(/Atacar/).click());
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 150)); });
    expect(mock.rpc).toHaveBeenCalledTimes(1);
  });

  it('rejects a mismatched item receipt and honors preserved=true', async () => {
    mock.from.mockImplementationOnce(() => inventoryQuery({ item_id: itemId }))
      .mockImplementationOnce(() => inventoryQuery({ quantity: 1 }));
    mock.rpc.mockReturnValueOnce(rpcReply(Promise.resolve({ data: { ...receipt().data, item_id: 'other-item' }, error: null })))
      .mockReturnValueOnce(rpcReply(Promise.resolve(receipt('heal_30', true))));
    mount();
    await clickPotion('HP');
    expect(pageText()).toContain('40/100');
    expect(getButton(/HP Poção ×1/)).toBeEnabled();
    await clickPotion('HP');
    expect(pageText()).toContain('60/100');
    expect(getButton(/HP Poção ×1/)).toBeEnabled();
  });

  it('blocks repeated clicks and an automatic HP attempt while MP is pending', async () => {
    const pending = deferred<RpcResult>();
    mock.rpc.mockReturnValueOnce(rpcReply(pending.promise));
    mount({ ...potionProps, initialPlayerHp: 20, playerAtk: 1 });
    await clickPotion('MP');
    expect(getButton(/Aguardando consumo/)).toBeDisabled();
    act(() => { getButton(/Aguardando consumo/).click(); getButton(/Atacar/).click(); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 150)); });
    expect(mock.rpc).toHaveBeenCalledTimes(1);
    expect(pageText()).not.toContain('Sem poções de HP');
    await act(async () => { pending.resolve(receipt('mana_20')); await pending.promise; });
    expect(pageText()).toContain('13/40');
  });

  it('does not credit a completed debit to a different identity or dungeon', async () => {
    const pending = deferred<RpcResult>();
    mock.rpc.mockReturnValueOnce(rpcReply(pending.promise));
    const view = mount();
    await clickPotion('HP');
    mock.user = { id: 'user-b' };
    view.rerenderArena({ ...potionProps, dungeonId: '2' });
    mock.user = { id: 'user-a' };
    view.rerenderArena(potionProps);
    await act(async () => { pending.resolve(receipt()); await pending.promise; });
    expect(pageText()).toContain('40/100');
    expect(pageText()).not.toContain('Poção de HP usada!');
    expect(mock.toast).not.toHaveBeenCalled();
  });

  it('does not heal or log success after advancing to another room', async () => {
    const pending = deferred<RpcResult>();
    mock.rpc.mockReturnValueOnce(rpcReply(pending.promise));
    mount({ ...potionProps, playerAtk: 1000 });
    await clickPotion('HP');
    act(() => getButton(/Atacar/).click());
    act(() => getButton(/Continuar/).click());
    expect(pageText()).toContain('Sala 2/7');
    await act(async () => { pending.resolve(receipt()); await pending.promise; });
    expect(pageText()).toContain('40/100');
    expect(pageText()).not.toContain('Poção de HP usada!');
  });

  it('does not resurrect a hero killed during the pending RPC', async () => {
    const pending = deferred<RpcResult>();
    mock.rpc.mockReturnValueOnce(rpcReply(pending.promise));
    mount({ ...potionProps, initialPlayerHp: 1, playerAtk: 1 });
    await clickPotion('HP');
    act(() => getButton(/Atacar/).click());
    expect(pageText()).toContain('HP0/100');
    await act(async () => { pending.resolve(receipt()); await pending.promise; });
    expect(pageText()).toContain('HP0/100');
    expect(pageText()).not.toContain('Poção de HP usada!');
  });

  it('does not apply a late receipt after unmount and rejects use without a user', async () => {
    mock.user = null;
    const view = mount();
    expect(getButton(/HP Poção/)).toBeDisabled();
    expect(mock.rpc).not.toHaveBeenCalled();
    mock.user = { id: 'user-a' };
    view.rerenderArena(potionProps);
    const pending = deferred<RpcResult>();
    mock.rpc.mockReturnValueOnce(rpcReply(pending.promise));
    await clickPotion('HP');
    view.unmount();
    await act(async () => { pending.resolve(receipt()); await pending.promise; });
    expect(mock.toast).not.toHaveBeenCalled();
  });

  it('times out an uncertain RPC, refreshes stock, and never applies a late cure', async () => {
    mock.from.mockImplementationOnce(() => inventoryQuery({ item_id: itemId }))
      .mockImplementationOnce(() => inventoryQuery({ quantity: 1 }));
    mock.rpc.mockReturnValueOnce({
      abortSignal: (signal: AbortSignal) => new Promise<RpcResult>(resolve => {
        signal.addEventListener('abort', () => resolve({ data: null, error: { message: 'aborted' } }), { once: true });
      }),
    });
    mount({ ...potionProps, initialPlayerHp: 20, playerAtk: 1 });
    vi.useFakeTimers();
    await clickPotion('HP');
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    vi.useRealTimers();
    expect(pageText()).toContain('20/100');
    expect(pageText()).not.toContain('Poção de HP usada!');
    expect(pageText()).toContain('Consumo não confirmado');
    expect(getButton(/HP Poção ×1/)).toBeEnabled();
    expect(pageText()).toContain('Auto OFF');
    expect(mock.from).toHaveBeenCalledTimes(2);
    expect(mock.rpc).toHaveBeenCalledTimes(1);
    act(() => getButton(/Atacar/).click());
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 150)); });
    expect(mock.rpc).toHaveBeenCalledTimes(1);
  });

  it('leaves a bounded refresh action when the stock query also times out', async () => {
    let refreshSignal: AbortSignal | null = null;
    mock.from.mockImplementationOnce(() => inventoryQuery({ item_id: itemId }))
      .mockImplementationOnce(() => ({
        select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
        abortSignal: (signal: AbortSignal) => { refreshSignal = signal; return {
          maybeSingle: () => new Promise(resolve => signal.addEventListener('abort',
            () => resolve({ data: null, error: { message: 'aborted' } }), { once: true })),
        }; },
      }));
    mock.rpc.mockReturnValueOnce({
      abortSignal: (signal: AbortSignal) => new Promise<RpcResult>(resolve => {
        signal.addEventListener('abort', () => resolve({ data: null, error: { message: 'aborted' } }), { once: true });
      }),
    });
    mount();
    vi.useFakeTimers();
    await clickPotion('HP');
    await act(async () => { await vi.advanceTimersByTimeAsync(25_000); });
    vi.useRealTimers();
    expect(refreshSignal?.aborted).toBe(true);
    expect(getButton(/HP Poção/)).toBeDisabled();
    expect(getButton(/Atualizar inventário/)).toBeEnabled();
    expect(pageText()).toContain('40/100');

    mock.from.mockImplementationOnce(() => inventoryQuery({ quantity: 1 }));
    await act(async () => { getButton(/Atualizar inventário/).click(); await Promise.resolve(); });
    expect(getButton(/HP Poção ×1/)).toBeEnabled();
    expect(queryButton(/Atualizar inventário/)).toBeNull();
  });
});
