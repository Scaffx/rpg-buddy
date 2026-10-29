import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AdventureAutoPotionsPanel } from '@/components/adventure/AdventureAutoPotionsPanel';
import { autoPotionsUnavailable, parseAdventureAutoPotionsState, useAdventureAutoPotions,
  type AutoPotionReservation } from '@/hooks/useAdventureAutoPotions';

const mock = vi.hoisted(() => ({ user: { id: 'user-a' } as { id: string } | null,
  epoch: 1, rpc: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: mock.user, continuity: { epoch: mock.epoch } }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mock.rpc } }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const itemId = '36aa16a5-153d-4c08-941e-ae3ee51d54d4';
const battleId = 'a0000000-0000-0000-0000-00000000b901';
const initial = { enabled: false, server_now: '2026-10-29T12:00:00Z', battle_id: battleId,
  stock: [{ type: 'hp', item_id: itemId, name: 'Poção de HP Menor', quantity: 2, amount: 30 }],
  reservations: [] };
let root: Root | null = null;
let container: HTMLDivElement | null = null;
let view: ReturnType<typeof useAdventureAutoPotions> | null = null;
function Probe() { view = useAdventureAutoPotions(); return null; }
async function waitFor(assertion: () => void) {
  let lastError: unknown;
  for (let i = 0; i < 50; i++) {
    try { assertion(); return; } catch (error) { lastError = error; }
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  }
  throw lastError;
}
async function mount(client: QueryClient) {
  container = document.createElement('div'); document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root!.render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>));
}
afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove(); root = null; container = null; view = null;
  mock.user = { id: 'user-a' }; mock.epoch = 1; mock.rpc.mockReset();
});

describe('authoritative adventure potions UI', () => {
  it('parses only the server contract and distinguishes a missing RPC', () => {
    expect(parseAdventureAutoPotionsState(initial).enabled).toBe(false);
    expect(() => parseAdventureAutoPotionsState({ ...initial, stock: [{ ...initial.stock[0], quantity: -1 }] })).toThrow();
    expect(() => parseAdventureAutoPotionsState({ ...initial, reservations: [
      { type: 'hp', item_id: itemId, name: 'A', amount: 30, recovered: 30, at: initial.server_now, status: 'used' },
      { type: 'hp', item_id: itemId, name: 'B', amount: 30, recovered: 30, at: initial.server_now, status: 'used' },
    ] })).toThrow();
    expect(autoPotionsUnavailable({ code: 'PGRST202' })).toBe(true);
    expect(autoPotionsUnavailable({ code: '42883' })).toBe(true);
    expect(autoPotionsUnavailable({ code: 'PGRST116' })).toBe(false);
  });

  it('shows exact limits, available stock, and reservation versus usage without writing in a demo', () => {
    const reserved: AutoPotionReservation = { type: 'hp', item_id: itemId, name: 'Poção de HP Menor', amount: 30,
      recovered: 23, at: '2026-10-29T12:00:05Z', status: 'reserved' };
    const state = parseAdventureAutoPotionsState({ ...initial, enabled: true, reservations: [reserved] });
    const html = renderToStaticMarkup(<AdventureAutoPotionsPanel state={state} battleId={battleId} />);
    expect(html).toContain('abaixo de 25%');
    expect(html).toContain('abaixo de 20%');
    expect(html).toContain('1 unidade reservada');
    expect(html).toContain('+23 HP efetivos');
    expect(html).toContain('2× Poção de HP Menor');
    expect(html).toContain('disabled');
    const used = renderToStaticMarkup(<AdventureAutoPotionsPanel state={{ ...state, reservations: [{ ...reserved, status: 'used' }] }} battleId={battleId} />);
    expect(used).toContain('1 unidade usada');
    const oldServer = renderToStaticMarkup(<AdventureAutoPotionsPanel unavailable onRetry={() => {}} />);
    expect(oldServer).toContain('indisponíveis neste servidor');
    expect(oldServer).toContain('Verificar novamente');
  });

  it('scopes query and setting to the confirmed user and waits for server confirmation', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let resolveSet: ((value: unknown) => void) | undefined;
    const signals: AbortSignal[] = [];
    mock.rpc.mockImplementation((name: string) => name === 'get_adventure_auto_potions_state'
      ? Object.assign(Promise.resolve({ data: initial, error: null }), { abortSignal: (signal: AbortSignal) => signals.push(signal) })
      : new Promise(resolve => { resolveSet = resolve; }));
    await mount(client);
    await waitFor(() => expect(view!.state?.enabled).toBe(false));
    expect(signals).toHaveLength(1);
    let pending: Promise<unknown> | undefined;
    act(() => { pending = view!.setEnabled(true); });
    await waitFor(() => expect(mock.rpc).toHaveBeenCalledWith('set_adventure_auto_potions_enabled', { p_enabled: true }));
    expect(view!.state?.enabled).toBe(false);
    const pendingQuery = client.getQueryCache().find({ queryKey: ['adventure-auto-potions', 'user-a', 1] });
    if (!pendingQuery) throw new Error('Query pendente ausente');
    const pendingInterval: unknown = Reflect.get(pendingQuery.options, 'refetchInterval');
    if (typeof pendingInterval !== 'function') throw new Error('Intervalo da query ausente');
    expect(pendingInterval(pendingQuery)).toBe(false);
    await act(async () => { resolveSet?.({ data: { ...initial, enabled: true }, error: null }); await pending; });
    await waitFor(() => expect(view!.state?.enabled).toBe(true));
    expect(client.getQueryData(['adventure-auto-potions', 'user-a', 1])).toMatchObject({ enabled: true });
    mock.user = { id: 'user-b' }; mock.epoch = 2;
    await act(async () => root!.render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>));
    expect(view!.state).toBeUndefined();
    act(() => client.clear());
  });

  it('retains a useful server rejection without changing the toggle', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mock.rpc.mockImplementation((name: string) => name === 'get_adventure_auto_potions_state'
      ? Object.assign(Promise.resolve({ data: initial, error: null }), { abortSignal: vi.fn() })
      : Promise.resolve({ data: null, error: { message: 'Configuração recusada' } }));
    await mount(client);
    await waitFor(() => expect(view!.state).toBeDefined());
    await act(async () => { await expect(view!.setEnabled(true)).rejects.toMatchObject({ message: 'Configuração recusada' }); });
    expect(view!.state?.enabled).toBe(false);
    await waitFor(() => expect(view!.setError).toMatchObject({ message: 'Configuração recusada' }));
    act(() => client.clear());
  });

  it('ignores a late mutation after account switch and stops polling for a missing RPC', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let resolveSet: ((value: unknown) => void) | undefined;
    mock.rpc.mockImplementation((name: string) => name === 'get_adventure_auto_potions_state'
      ? Object.assign(Promise.resolve({ data: initial, error: null }), { abortSignal: vi.fn() })
      : new Promise(resolve => { resolveSet = resolve; }));
    await mount(client);
    await waitFor(() => expect(view!.state).toBeDefined());
    let pending: Promise<unknown> | undefined;
    act(() => { pending = view!.setEnabled(true); });
    await waitFor(() => expect(resolveSet).toBeDefined());
    mock.user = { id: 'user-b' }; mock.epoch = 2;
    await act(async () => root!.render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>));
    await act(async () => { resolveSet?.({ data: { ...initial, enabled: true }, error: null }); await pending; });
    await waitFor(() => expect(view!.state?.enabled).toBe(false));
    expect(client.getQueryData(['adventure-auto-potions', 'user-b', 2])).toMatchObject({ enabled: false });
    expect(view!.setError).toBeNull();
    act(() => { root!.unmount(); client.clear(); });
    container?.remove(); root = null; container = null; view = null;

    const unavailableClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mock.rpc.mockReset(); mock.user = { id: 'user-a' }; mock.epoch = 1;
    mock.rpc.mockImplementation(() => Object.assign(Promise.resolve({ data: null, error: { code: 'PGRST202', message: 'RPC missing' } }), { abortSignal: vi.fn() }));
    await mount(unavailableClient);
    await waitFor(() => expect(autoPotionsUnavailable(view!.error)).toBe(true));
    const query = unavailableClient.getQueryCache().find({ queryKey: ['adventure-auto-potions', 'user-a', 1] });
    if (!query) throw new Error('Query indisponível ausente');
    const interval: unknown = Reflect.get(query.options, 'refetchInterval');
    const focus: unknown = Reflect.get(query.options, 'refetchOnWindowFocus');
    if (typeof interval !== 'function' || typeof focus !== 'function') throw new Error('Opções da query ausentes');
    expect(interval(query)).toBe(false);
    expect(focus(query)).toBe(false);
    act(() => unavailableClient.clear());
  });
});
