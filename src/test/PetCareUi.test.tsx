import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const state = vi.hoisted(() => ({ userId: 'account-a', rpc: vi.fn(), from: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: state.userId } }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: state.rpc, from: state.from } }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, options?: { defaultValue?: string; quantity?: number; total?: number; stock?: number }) => {
  let value = options?.defaultValue ?? key;
  for (const [name, replacement] of Object.entries(options ?? {})) value = value.replace(`{{${name}}}`, String(replacement));
  return value;
} }) }));
vi.mock('@/components/AppLayout', () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/components/TranslatedGuidedTour', () => ({ default: () => null }));
vi.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ data: { level: 5 }, isLoading: false }) }));
vi.mock('@/hooks/useActivePet', () => ({ useActivePet: () => ({ state: { enabled: false, pets: [] }, activeId: null, isSetting: false, isLoading: false, error: null, setError: null, setActive: vi.fn(), resetSetError: vi.fn(), refetch: vi.fn() }) }));
vi.mock('@/hooks/useCompanion', async importOriginal => {
  const actual = await importOriginal<typeof import('@/hooks/useCompanion')>();
  return { ...actual, useAllCompanions: () => ({ data: [{ id: 'pet-1', user_id: state.userId, companion_type: 'dog', origin: 'lvl3_choice', name: 'Rex', level: 3, xp: 0, mood: 100, equipped_item_id: null, last_fed_at: null, last_played_at: null, created_at: '', updated_at: '', max_hp: 0, current_hp: 0, atk: 0, def: 0, max_mp: 0, current_mp: 0, companion_role: 'none' }], isLoading: false }), useCreateCompanion: () => ({ mutate: vi.fn(), isPending: false }) };
});

import { PetFoodSection } from '@/pages/ShopPage';
import CompanionPage from '@/pages/CompanionPage';

let root: Root;
let container: HTMLDivElement;
let client: QueryClient;
async function mount(ui: React.ReactNode) {
  await act(async () => { root.render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>); });
  await settle();
}
async function settle() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); }); }
function click(label: string) {
  const button = [...container.querySelectorAll('button')].find(el => el.textContent?.includes(label));
  expect(button, `button ${label}`).toBeTruthy();
  button!.click();
}
const dogFood = { pet_type: 'dog', item_id: 'food-dog', name: 'Ração de cachorro', unit_price: 25, owned: true, quantity: 2 };
const catFood = { pet_type: 'cat', item_id: 'food-cat', name: 'Ração de gato', unit_price: 25, owned: true, quantity: 0 };
const careState = (participation: number, nextCare: string) => ({ server_now: '2026-10-29T12:00:00Z', pets: [{ companion_id: 'pet-1', pet_type: 'dog', name: 'Rex', stock: 2, last_feed_at: '2026-10-29T00:00:00Z', next_feed_at: '2026-10-30T00:00:00Z', last_care_at: '2026-10-28T00:00:00Z', next_care_at: nextCare, participation }] });

beforeEach(() => {
  state.userId = 'account-a'; state.rpc.mockReset(); state.from.mockReset(); sessionStorage.clear();
  container = document.createElement('div'); document.body.append(container);
  root = createRoot(container);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); client.clear(); });

describe('pet food and care mounted UI', () => {
  it('shows empty food catalog, then only server-owned species after account change', async () => {
    state.rpc.mockImplementation(async (name: string) => ({ data: name === 'get_pet_food_catalog' ? (state.userId === 'account-a' ? [] : [catFood]) : null, error: null }));
    await mount(<PetFoodSection key={state.userId} gold={1000} />);
    expect(container.textContent).toContain('Adquira um pet');
    expect(container.textContent).not.toContain('Ração de cachorro');
    state.userId = 'account-b';
    await mount(<PetFoodSection key={state.userId} gold={1000} />);
    expect(container.textContent).toContain('Ração de gato');
    expect(container.textContent).not.toContain('Ração de cachorro');
  });

  it('keeps food unavailable when its RPC is missing', async () => {
    state.rpc.mockResolvedValue({ data: null, error: { status: 404, code: 'PGRST202', message: 'function missing' }, status: 404 });
    await mount(<PetFoodSection gold={1000} />);
    expect(container.textContent).toContain('Alimentos indisponíveis');
    expect(container.textContent).not.toContain('Comprar ração');
  });

  it('bounds quantity at 30 and accepts one debit despite double click', async () => {
    let debits = 0;
    state.rpc.mockImplementation(async (name: string, args?: Record<string, unknown>) => {
      if (name === 'get_pet_food_catalog') return { data: [dogFood], error: null };
      if (name === 'buy_pet_food') { debits++; return { data: { ok: true, replayed: false, request_id: args?.p_request_id, pet_type: 'dog', quantity: args?.p_quantity, unit_price: 25, total: 750, gold: 250, stock: 32 }, error: null }; }
      return { data: null, error: null };
    });
    await mount(<PetFoodSection gold={1000} />);
    const select = container.querySelector('select')!;
    expect(select.options.length).toBe(30);
    await act(async () => { select.value = '30'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(container.textContent).toContain('750');
    await act(async () => { click('Comprar ração'); click('Comprar ração'); await Promise.resolve(); });
    await settle();
    expect(debits).toBe(1);
    expect(container.textContent).toContain('Compra confirmada');
  });

  it('keeps the request UUID after uncertain transport and resolves its receipt without a new debit', async () => {
    const seen: string[] = [];
    let receiptFound = false;
    state.rpc.mockImplementation(async (name: string, args?: Record<string, unknown>) => {
      if (name === 'get_pet_food_catalog') return { data: [dogFood], error: null };
      if (name === 'buy_pet_food') { seen.push(String(args?.p_request_id)); return { data: null, error: { status: 0, message: 'network' }, status: 0 }; }
      if (name === 'get_pet_food_purchase_receipt') return { data: receiptFound ? { found: true, ok: true, replayed: true, request_id: args?.p_request_id, pet_type: 'dog', quantity: 1, unit_price: 25, total: 25, gold: 975, stock: 3 } : { found: false, request_id: args?.p_request_id }, error: null };
      return { data: null, error: null };
    });
    await mount(<PetFoodSection gold={1000} />);
    await act(async () => { click('Comprar ração'); await Promise.resolve(); });
    await settle();
    expect(container.textContent).toContain('Uma compra ainda não foi confirmada');
    expect(seen).toHaveLength(1);
    const pending = JSON.parse(sessionStorage.getItem('pet-food-pending:account-a')!);
    expect(pending.request_id).toBe(seen[0]);
    receiptFound = true;
    await act(async () => { click('Consultar recibo'); await Promise.resolve(); });
    await settle();
    expect(seen).toHaveLength(1);
    expect(container.textContent).toContain('Compra confirmada');
    expect(sessionStorage.getItem('pet-food-pending:account-a')).toBeNull();
  });

  it('does not resend account A pending purchase after switching to account B during receipt lookup', async () => {
    const requestId = '11111111-1111-4111-8111-111111111111';
    sessionStorage.setItem('pet-food-pending:account-a', JSON.stringify({ userId: 'account-a', pet_type: 'dog', quantity: 1, request_id: requestId }));
    let releaseReceipt!: (value: unknown) => void;
    const receipt = new Promise(resolve => { releaseReceipt = resolve; });
    state.rpc.mockImplementation(async (name: string) => {
      if (name === 'get_pet_food_catalog') return { data: state.userId === 'account-a' ? [dogFood] : [catFood], error: null };
      if (name === 'get_pet_food_purchase_receipt') return receipt;
      if (name === 'buy_pet_food') throw new Error('Second debit must not start');
      return { data: null, error: null };
    });
    await mount(<PetFoodSection key={state.userId} gold={1000} />);
    await act(async () => { click('Consultar recibo'); });
    state.userId = 'account-b';
    await mount(<PetFoodSection key={state.userId} gold={1000} />);
    releaseReceipt({ data: { found: false, request_id: requestId }, error: null });
    await settle();
    expect(state.rpc.mock.calls.filter(([name]) => name === 'buy_pet_food')).toHaveLength(0);
    expect(sessionStorage.getItem('pet-food-pending:account-a')).toContain(requestId);
    expect(container.textContent).toContain('Ração de gato');
    expect(container.textContent).not.toContain(requestId);
  });

  it('shows confirmed participation/cooldown and never offers free feed', async () => {
    state.rpc.mockImplementation(async (name: string) => ({ data: name === 'get_pet_care_state' ? careState(0.75, '2026-10-30T00:00:00Z') : null, error: null }));
    await mount(<CompanionPage />);
    expect(container.textContent).toContain('Rex');
    expect(container.textContent).toContain('75%');
    expect(container.textContent).toContain('Próxima refeição automática');
    expect(container.textContent).not.toContain('Alimentar');
    expect([...container.querySelectorAll('button')].find(el => el.textContent?.includes('Fazer carinho'))?.disabled).toBe(true);
    expect(state.from).not.toHaveBeenCalled();
  });

  it('keeps companions visible but disables care when state RPC is unavailable', async () => {
    state.rpc.mockResolvedValue({ data: null, error: { status: 404, code: 'PGRST202', message: 'function missing' }, status: 404 });
    await mount(<CompanionPage />);
    expect(container.textContent).toContain('Rex');
    expect(container.textContent).toContain('Cuidado indisponível');
    expect([...container.querySelectorAll('button')].find(el => el.textContent?.includes('Fazer carinho'))?.disabled).toBe(true);
    expect(container.textContent).not.toContain('Alimentar');
  });

  it('sends manual care to RPC and uses its effective receipt', async () => {
    state.rpc.mockImplementation(async (name: string, args?: Record<string, unknown>) => {
      if (name === 'get_pet_care_state') return { data: careState(0.5, '2026-10-28T00:00:00Z'), error: null };
      if (name === 'interact_pet_care') return { data: { ok: true, effective: true, replayed: false, request_id: args?.p_request_id, companion_id: args?.p_companion_id, action: args?.p_action, next_care_at: '2026-10-30T00:00:00Z', participation: 1 }, error: null };
      return { data: null, error: null };
    });
    await mount(<CompanionPage />);
    await act(async () => { click('Fazer carinho'); await Promise.resolve(); });
    await settle();
    expect(state.rpc).toHaveBeenCalledWith('interact_pet_care', expect.objectContaining({ p_companion_id: 'pet-1', p_action: 'care' }));
    expect(state.from).not.toHaveBeenCalled();
  });
});
