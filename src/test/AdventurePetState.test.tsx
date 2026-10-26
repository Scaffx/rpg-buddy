import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { parseAdventurePetState, petErrorMessage, useActivePet } from '@/hooks/useActivePet';

const mock = vi.hoisted(() => ({ user: { id: 'user-a' } as { id: string } | null, rpc: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: mock.user }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mock.rpc } }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const id = '11111111-1111-1111-1111-111111111111';
const pet = { id, companion_type: 'mini_kraken', name: 'Kraken', bonus: { stat: 'hp', pct: 0.1 }, sustain: { kind: 'regen_hp', pct: 0.05 } };
const state = { enabled: true, active_companion_id: null, pets: [pet] };
let root: Root | null = null;
let container: HTMLDivElement | null = null;
let view: ReturnType<typeof useActivePet> | null = null;

function Probe() { view = useActivePet(); return null; }
async function mount(client: QueryClient) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root!.render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>));
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove(); root = null; container = null; view = null;
  mock.rpc.mockReset(); mock.user = { id: 'user-a' }; localStorage.clear();
});

describe('adventure pet RPC state', () => {
  it('accepts only a single owned active UUID and handles empty gated state', () => {
    expect(parseAdventurePetState({ enabled: false, active_companion_id: null, pets: [] })).toEqual({ enabled: false, active_companion_id: null, pets: [] });
    expect(parseAdventurePetState({ ...state, active_companion_id: id }).active_companion_id).toBe(id);
    expect(() => parseAdventurePetState({ ...state, active_companion_id: 'foreign' })).toThrow();
    expect(() => parseAdventurePetState({ ...state, pets: [pet, pet] })).toThrow();
    expect(petErrorMessage({ message: 'Acesso negado' })).toBe('Acesso negado');
    expect(petErrorMessage('Falha')).toBe('Falha');
  });

  it('queries by user and changes only after the RPC confirms the new selection', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let resolveSet: ((value: unknown) => void) | undefined;
    mock.rpc.mockImplementation((name: string) => name === 'get_adventure_pet_state'
      ? Promise.resolve({ data: state, error: null })
      : new Promise(resolve => { resolveSet = resolve; }));
    await mount(client);
    await vi.waitFor(() => expect(view!.state?.pets).toHaveLength(1));
    expect(view!.state?.pets).toHaveLength(1);
    await act(async () => { await expect(view!.setActive('foreign')).rejects.toThrow('não foi confirmado'); });
    expect(mock.rpc).not.toHaveBeenCalledWith('set_active_adventure_pet', expect.anything());

    let pending: Promise<unknown> | undefined;
    act(() => { pending = view!.setActive(id); });
    await vi.waitFor(() => expect(mock.rpc).toHaveBeenCalledWith('set_active_adventure_pet', { p_companion_id: id }));
    expect(mock.rpc).toHaveBeenCalledWith('set_active_adventure_pet', { p_companion_id: id });
    expect(view!.activeId).toBeNull();
    await act(async () => { resolveSet?.({ data: { ...state, active_companion_id: id }, error: null }); await pending; });
    await vi.waitFor(() => expect(view!.activeId).toBe(id));
    expect(view!.activeId).toBe(id);
    expect(localStorage.getItem('active_pet:user-a')).toBe('mini_kraken');
    await act(async () => { await view!.setActive(id); });
    expect(mock.rpc.mock.calls.filter(([name]) => name === 'set_active_adventure_pet')).toHaveLength(1);

    mock.user = { id: 'user-b' };
    await act(async () => root!.render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>));
    expect(view!.activeId).toBeNull();
    expect(client.getQueryData(['adventure-pet-state', 'user-a'])).toMatchObject({ active_companion_id: id });
    client.clear();
  });

  it('keeps selection unchanged on server rejection', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mock.rpc.mockImplementation((name: string) => name === 'get_adventure_pet_state'
      ? Promise.resolve({ data: state, error: null })
      : Promise.resolve({ data: null, error: { message: 'Pet sem posse' } }));
    await mount(client);
    await vi.waitFor(() => expect(view!.state).toBeDefined());
    await act(async () => { await expect(view!.setActive(id)).rejects.toMatchObject({ message: 'Pet sem posse' }); });
    expect(view!.activeId).toBeNull();
    expect(localStorage.getItem('active_pet:user-a')).toBeNull();
    client.clear();
  });

  it('does not send a selection while the rollout gate is off', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mock.rpc.mockResolvedValue({ data: { enabled: false, active_companion_id: null, pets: [] }, error: null });
    await mount(client);
    await vi.waitFor(() => expect(view!.state?.enabled).toBe(false));
    await act(async () => { await expect(view!.setActive(null)).rejects.toThrow('indisponível'); });
    expect(mock.rpc.mock.calls.map(([name]) => name)).toEqual(['get_adventure_pet_state']);
    client.clear();
  });
});
