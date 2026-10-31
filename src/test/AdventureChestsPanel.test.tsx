import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import AdventureChestsPanel from '@/components/adventure/AdventureChestsPanel';
import { adventureChestError } from '@/hooks/useAdventureChests';

const mocked = vi.hoisted(() => ({ value: null as unknown }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn() } }));
vi.mock('@/hooks/useAdventureChests', async importOriginal => {
  const actual = await importOriginal<typeof import('@/hooks/useAdventureChests')>();
  return { ...actual, useAdventureChests: () => mocked.value };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
let container: HTMLDivElement | null = null;

function renderPanel() {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }
  act(() => root!.render(<MemoryRouter><AdventureChestsPanel /></MemoryRouter>));
  return container;
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe('AdventureChestsPanel', () => {
  it('keeps server and action errors visible, including structured RPC errors', async () => {
    const start = vi.fn().mockRejectedValue({ message: 'CHEST_OPENING_ACTIVE' });
    mocked.value = {
      data: {
        server_now: new Date().toISOString(), slots_total: 4, occupied: 1,
        next_eligible_at: null,
        chests: [{ id: '11111111-1111-1111-1111-111111111111', rarity: 'raro',
          status: 'queued', acquired_at: new Date().toISOString(), started_at: null,
          ready_at: null, open_hours: 4,
          minimum: { gold: 120, scrap: 5, essence_material: 'normal', essence: 1, potions: 2 } }],
        overflow: { count: 1, gold: 40, scrap: 5 }, recent_overflow: [], recent_claims: [],
      },
      error: { message: 'Falha na consulta' }, isLoading: false, isFetching: false,
      refetch: vi.fn(), start: { isPending: false, mutateAsync: start },
      claim: { isPending: false, mutateAsync: vi.fn() },
    };
    const page = renderPanel();
    expect(page.textContent).toContain('4h para abrir');
    expect(page.textContent).toContain('120 ouro · 5 sucata · 1 essência de normal · 2 poções');
    expect(page.textContent).toContain('Espaço 4 livre');
    expect(page.querySelector('[role="alert"]')?.textContent).toContain('Falha na consulta');
    await act(async () => {
      [...page.querySelectorAll('button')].find(button => button.textContent?.includes('Iniciar abertura'))!.click();
    });
    expect(start).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111');
    expect([...page.querySelectorAll('[role="alert"]')].map(node => node.textContent).join(' '))
      .toContain('Há um baú em abertura');
    renderPanel();
    expect(page.textContent).toContain('Há um baú em abertura');
  });

  it('normalizes Error, string, and structured messages', () => {
    expect(adventureChestError(new Error('falha'))).toBe('falha');
    expect(adventureChestError('CHEST_NOT_READY')).toContain('relógio do servidor');
    expect(adventureChestError({ message: 'CHEST_NOT_FOUND', code: '22023' })).toContain('não pertence');
  });

  it('permite iniciar outro baú até o limite de aberturas confirmado pelo servidor', () => {
    const now = new Date().toISOString();
    const base = { rarity: 'raro', acquired_at: now, open_hours: 4,
      minimum: { gold: 120, scrap: 5, essence_material: 'normal', essence: 1, potions: 2 } };
    const data = { server_now: now, slots_total: 4, occupied: 2, openings_cap: 2, openings_active: 1,
      chests: [{ ...base, id: '11111111-1111-4111-8111-111111111111', status: 'opening', started_at: now, ready_at: new Date(Date.now() + 3600000).toISOString() },
        { ...base, id: '22222222-2222-4222-8222-222222222222', status: 'queued', started_at: null, ready_at: null }],
      overflow: { count: 0 }, recent_claims: [] };
    mocked.value = { data, isLoading: false, isFetching: false, refetch: vi.fn(),
      start: { isPending: false }, claim: { isPending: false } };
    const page = renderPanel();
    const start = () => [...page.querySelectorAll('button')].find(b => b.textContent === 'Iniciar abertura')!;
    expect(start().disabled).toBe(false);
    expect(page.textContent).toContain('1 de 2 aberturas simultâneas em uso');
    data.openings_active = 2;
    renderPanel();
    expect(start().disabled).toBe(true);
  });
});
