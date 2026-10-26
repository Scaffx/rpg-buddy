import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Session, User } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '@/App';

const fixture = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUser: vi.fn(),
  subscription: vi.fn(() => ({ isActive: false, isLoading: true })),
  profile: { onboarding_completed: true, starter_class: 'guerreiro' } as Record<string, unknown> | null,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: fixture.getSession,
      getUser: fixture.getUser,
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  },
}));
vi.mock('@/lib/nativeAuth', () => ({ initDeepLinkAuth: vi.fn() }));
vi.mock('@/hooks/useProfile', () => ({
  useProfile: () => ({ data: fixture.profile, isLoading: false }),
}));
vi.mock('@/hooks/useSubscription', () => ({ useSubscription: fixture.subscription }));
vi.mock('@/hooks/useClickSound', () => ({ useClickSound: vi.fn() }));
vi.mock('@/hooks/useShortRestStatus', () => ({ ShortRestStatusProvider: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('@/components/BedtimeGate', () => ({ default: () => null }));
vi.mock('@/components/branding/LifeonRPGSplash', () => ({ default: () => <div>Carregando</div> }));
vi.mock('@/components/ui/sonner', () => ({ Toaster: () => null }));
vi.mock('@/components/ui/toaster', () => ({ Toaster: () => null }));
vi.mock('@/components/ui/tooltip', () => ({ TooltipProvider: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('next-themes', () => ({ ThemeProvider: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('@/pages/Landing', () => ({ default: () => <main>Landing pública</main> }));
vi.mock('@/pages/Dashboard', () => ({ default: () => <main>Dashboard liberado</main> }));
vi.mock('@/pages/BossPage', () => ({ default: () => <main>Boss liberado</main> }));
vi.mock('@/pages/CompanionPage', () => ({ default: () => <main>Companheiro liberado</main> }));
vi.mock('@/pages/Onboarding', () => ({ default: () => <main>Onboarding obrigatório</main> }));
vi.mock('@/pages/admin/ReleasesAdminPage', () => ({ default: () => <main>Painel administrativo</main> }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const member = (id: string, role = 'user') => ({
  id,
  email: `${id}@example.com`,
  app_metadata: { role },
  user_metadata: {},
}) as unknown as User;

const session = (user: User) => ({ user, access_token: 'confirmed-token' }) as Session;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function mount(path: string, storedUser: User | null, confirmedUser = storedUser) {
  window.history.replaceState({}, '', path);
  fixture.getSession.mockResolvedValue({ data: { session: storedUser ? session(storedUser) : null }, error: null });
  fixture.getUser.mockResolvedValue({ data: { user: confirmedUser }, error: null });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root!.render(<App />); });
  for (let attempt = 0; attempt < 8; attempt++) {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  }
}

beforeEach(() => {
  fixture.getSession.mockReset();
  fixture.getUser.mockReset();
  fixture.subscription.mockClear();
  fixture.profile = { onboarding_completed: true, starter_class: 'guerreiro' };
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = null;
  container = null;
  window.history.replaceState({}, '', '/');
});

describe('acesso gratuito com identidade confirmada', () => {
  it.each([
    ['/companheiro', 'Companheiro liberado'],
    ['/boss', 'Boss liberado'],
    ['/landing', 'Dashboard liberado'],
  ])('permite conta sem assinatura em %s', async (path, expected) => {
    await mount(path, member('expired'));
    expect(container?.textContent).toContain(expected);
    expect(fixture.getUser).toHaveBeenCalledWith('confirmed-token');
    expect(fixture.subscription).not.toHaveBeenCalled();
  });

  it('mantém visitante fora da rota protegida e mostra a Landing pública', async () => {
    await mount('/boss', null);
    expect(window.location.pathname).toBe('/landing');
    expect(container?.textContent).toContain('Landing pública');
    expect(fixture.getUser).not.toHaveBeenCalled();
  });

  it('exige onboarding antes das rotas do jogo, inclusive sem assinatura', async () => {
    fixture.profile = { onboarding_completed: false, starter_class: null };
    await mount('/companheiro', member('newcomer'));
    expect(window.location.pathname).toBe('/onboarding');
    expect(container?.textContent).toContain('Onboarding obrigatório');
  });

  it('restringe admin pelo papel retornado por getUser, não pelo usuário armazenado', async () => {
    await mount('/admin/releases', member('hero', 'admin'), member('hero', 'user'));
    expect(window.location.pathname).toBe('/');
    expect(container?.textContent).toContain('Dashboard liberado');
    expect(container?.textContent).not.toContain('Painel administrativo');
  });

  it('permite admin confirmado mesmo com onboarding pendente', async () => {
    fixture.profile = null;
    await mount('/admin/releases', member('operator', 'user'), member('operator', 'admin'));
    expect(window.location.pathname).toBe('/admin/releases');
    expect(container?.textContent).toContain('Painel administrativo');
  });

  it('falha fechado quando a identidade do token não confere', async () => {
    await mount('/boss', member('stored'), member('someone-else'));
    expect(container?.textContent).toContain('Não foi possível confirmar sua sessão');
    expect(container?.textContent).not.toContain('Boss liberado');
  });
});
