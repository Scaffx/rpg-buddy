import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  join: vi.fn(),
  start: vi.fn(),
  attack: vi.fn(),
  scan: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('@/components/AppLayout', () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/components/DungeonRevealCard', () => ({ default: () => null }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'player-1' } }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/hooks/useCompanion', () => ({ useAllCompanions: () => ({ data: [] }), isCombatCompanion: () => false }));
vi.mock('@/hooks/useInventory', () => ({ useInventory: () => ({ data: [] }) }));
vi.mock('@/hooks/useGold', () => ({ useGoldBalance: () => ({ data: { gold: 0 } }) }));
vi.mock('@/hooks/usePortalEvent', () => ({
  usePortalEvent: () => ({ data: {
    event_id: 'daily-red', portal_color: 'red', color_revealed: true, already_completed: false,
  } }),
  useMyFragments: () => ({ data: { fragments: 0, pending_dungeon: null } }),
  useScanPortal: () => ({ mutateAsync: mocks.scan, isPending: false }),
}));
vi.mock('@/hooks/useCoopPortal', () => ({
  useCoopSessions: () => ({ data: [] }),
  useCoopState: () => ({ data: null }),
  useCoopActions: () => ({
    create: { mutateAsync: mocks.create, isPending: false },
    join: { mutateAsync: mocks.join, isPending: false },
    start: { mutateAsync: mocks.start, isPending: false },
    attack: { mutateAsync: mocks.attack, isPending: false },
  }),
}));

import PortalEventPage from '@/pages/PortalEventPage';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
let container: HTMLDivElement | null = null;

function renderPage() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(<PortalEventPage />));
}

async function createDaily() {
  const button = [...container!.querySelectorAll('button')].find(item => item.textContent === 'Criar sala diária');
  expect(button).toBeDefined();
  await act(async () => { button!.click(); });
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe('feedback de recusa do portal', () => {
  it('exibe a mensagem estruturada de nível do RPC na página', async () => {
    mocks.create.mockRejectedValueOnce({
      code: 'P0001', details: '', hint: '', message: 'Nível mínimo não atendido',
    });
    renderPage();
    await createDaily();
    expect(container!.querySelector('[role="alert"]')?.textContent).toContain('Nível mínimo não atendido');
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ source: 'daily', difficulty: null }));
  });

  it.each([{}, { message: '' }, { message: '   ' }, '', new Error('')])('usa fallback seguro para erro desconhecido %#', async error => {
    mocks.create.mockRejectedValueOnce(error);
    renderPage();
    await createDaily();
    expect(container!.querySelector('[role="alert"]')?.textContent).toContain('Ação recusada pelo servidor.');
  });

  it('limpa feedback antigo após uma criação bem-sucedida', async () => {
    mocks.create.mockRejectedValueOnce({ message: 'Nível mínimo não atendido', code: 'P0001' })
      .mockResolvedValueOnce({ session_id: 'room-1' });
    renderPage();
    await createDaily();
    expect(container!.querySelector('[role="alert"]')?.textContent).toContain('Nível mínimo não atendido');
    await createDaily();
    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(container!.querySelector('[role="alert"]')).toBeNull();
  });
});
