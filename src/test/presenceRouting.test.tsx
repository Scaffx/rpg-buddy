import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Link } from 'react-router-dom';
import type { Session, User } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '@/App';
import AppLayout from '@/components/AppLayout';
import { authJwt } from '@/test/authSessionFixtures';

type RpcResponse = { data: null; error: null };
type PendingRpc = { signals: AbortSignal[]; resolve: () => void };

const fixture = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUser: vi.fn(),
  rpc: vi.fn(),
  listener: null as ((event: string, session: Session | null) => void) | null,
  requests: [] as PendingRpc[],
  active: 0,
  maxActive: 0,
  layoutMounts: 0,
  layoutUnmounts: 0,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: fixture.getSession,
      getUser: fixture.getUser,
      onAuthStateChange: (listener: (event: string, session: Session | null) => void) => {
        fixture.listener = listener;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    },
    rpc: fixture.rpc,
  },
}));
vi.mock('@/lib/nativeAuth', () => ({ initDeepLinkAuth: vi.fn() }));
vi.mock('@/hooks/useProfile', () => ({
  useProfile: () => ({ data: { onboarding_completed: true, starter_class: 'guerreiro' }, isLoading: false }),
}));
vi.mock('@/hooks/useIsAdmin', () => ({ useIsAdmin: () => ({ isAdmin: false, loading: false }) }));
vi.mock('@/hooks/useClickSound', () => ({ useClickSound: vi.fn() }));
vi.mock('@/hooks/useShortRestStatus', () => ({ ShortRestStatusProvider: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('@/components/auth/AuthContinuityBoundary', () => ({ AuthContinuityBoundary: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('@/components/BedtimeGate', () => ({ default: () => null }));
vi.mock('@/components/branding/LifeonRPGSplash', () => ({ default: () => <div>Carregando</div> }));
vi.mock('@/components/ui/sonner', () => ({ Toaster: () => null }));
vi.mock('@/components/ui/toaster', () => ({ Toaster: () => null }));
vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => children,
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => children,
  TooltipContent: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('next-themes', () => ({ ThemeProvider: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('@/components/ui/sidebar', () => ({
  SidebarProvider: ({ children }: { children: React.ReactNode }) => children,
  SidebarTrigger: () => null,
}));
vi.mock('@tanstack/react-query', async importOriginal => ({
  ...await importOriginal<typeof import('@tanstack/react-query')>(),
  useQuery: () => ({ data: undefined }),
}));

vi.mock('@/hooks/useAutoAdventure', () => ({ useAutoAdventure: vi.fn() }));
vi.mock('@/hooks/useMidnightReset', () => ({ useMidnightReset: vi.fn() }));
vi.mock('@/hooks/useFailedMissions', () => ({ useCheckFailedMissions: vi.fn() }));
vi.mock('@/hooks/useForrageio', () => ({ useForrageio: vi.fn() }));
vi.mock('@/hooks/useSleepWakeAlerts', () => ({ useSleepWakeAlerts: vi.fn() }));
vi.mock('@/hooks/useAchievements', () => ({ useAutoCheckAchievements: vi.fn() }));
vi.mock('@/hooks/useNotificationScheduler', () => ({ useNotificationScheduler: vi.fn() }));
vi.mock('@/hooks/useReminders', () => ({ useReminderNotifications: vi.fn() }));

vi.mock('@/components/AppSidebar', () => ({ AppSidebar: () => null }));
vi.mock('@/components/ShortRestTimer', () => ({ default: () => null }));
vi.mock('@/components/SoundToggleButton', () => ({ default: () => null }));
vi.mock('@/components/HeroNotificationBell', () => ({ default: () => null }));
vi.mock('@/components/LevelUpCinematic', () => ({ default: () => null }));
vi.mock('@/components/CharacterSprite', () => ({ CharacterSprite: () => null }));
vi.mock('@/components/AppUpdateModal', () => ({ AppUpdateModal: () => null }));
vi.mock('@/components/FloatingAiChat', () => ({ default: () => null }));
vi.mock('@/components/CombatPiP', () => ({ default: () => null }));
vi.mock('@/components/PermissionsGate', () => ({ default: () => null }));
vi.mock('@/components/LanguageSwitcher', () => ({ LanguageSwitcher: () => null }));

function RoutePage({ name, next }: { name: string; next: string }) {
  useEffect(() => {
    fixture.layoutMounts++;
    return () => { fixture.layoutUnmounts++; };
  }, []);
  return <AppLayout><div data-testid="route">{name}</div><Link to={next}>Outra rota</Link></AppLayout>;
}

vi.mock('@/pages/Dashboard', () => ({ default: () => <RoutePage name="Dashboard" next="/missions" /> }));
vi.mock('@/pages/Missions', () => ({ default: () => <RoutePage name="Missions" next="/" /> }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const member = (id: string) => ({ id, app_metadata: { role: 'user' }, user_metadata: {} }) as unknown as User;
const session = (user: User, token: string) => ({ user, access_token: token }) as Session;
const token = (id: string) => authJwt(id, { exp: Math.floor(Date.now() / 1000) + 3600 });

let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function mount() {
  const user = member('hero-a');
  const initial = session(user, token(user.id));
  fixture.getSession.mockResolvedValue({ data: { session: initial }, error: null });
  fixture.getUser.mockResolvedValue({ data: { user }, error: null });
  window.history.replaceState({}, '', '/');
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root!.render(<App />); });
  expect(host.textContent).toContain('Dashboard');
  expect(fixture.getUser).toHaveBeenCalledWith(initial.access_token);
  expect(fixture.rpc).toHaveBeenCalledTimes(1);
  return user;
}

async function navigate(expectedPath: string, expectedPage: string) {
  const link = host!.querySelector('a[href]');
  expect(link).not.toBeNull();
  await act(async () => { link!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
  expect(window.location.pathname).toBe(expectedPath);
  expect(host!.textContent).toContain(expectedPage);
}

async function advance(milliseconds: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(milliseconds); });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-28T12:00:00.000Z'));
  fixture.getSession.mockReset();
  fixture.getUser.mockReset();
  fixture.rpc.mockReset();
  fixture.listener = null;
  fixture.requests = [];
  fixture.active = 0;
  fixture.maxActive = 0;
  fixture.layoutMounts = 0;
  fixture.layoutUnmounts = 0;
  fixture.rpc.mockImplementation(() => {
    let settle!: (value: RpcResponse) => void;
    let pending = true;
    const signals: AbortSignal[] = [];
    const promise = new Promise<RpcResponse>(resolve => { settle = resolve; });
    const builder = Object.assign(promise, { abortSignal: (signal: AbortSignal) => {
      signals.push(signal);
      return builder;
    } });
    fixture.active++;
    fixture.maxActive = Math.max(fixture.maxActive, fixture.active);
    fixture.requests.push({ signals, resolve: () => {
      if (!pending) return;
      pending = false;
      fixture.active--;
      settle({ data: null, error: null });
    } });
    return builder;
  });
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  root = null;
  host = null;
  window.history.replaceState({}, '', '/');
  vi.useRealTimers();
});

describe('presença ao navegar pelo App real', () => {
  it('preserva uma RPC pendente entre layouts e conta 30 s desde o settle', async () => {
    await mount();
    const first = fixture.requests[0];
    expect(first.signals).toHaveLength(1);

    await advance(5_000);
    await navigate('/missions', 'Missions');
    await advance(3_000);
    await navigate('/', 'Dashboard');
    expect(fixture.layoutMounts).toBe(3);
    expect(fixture.layoutUnmounts).toBe(2);
    expect(first.signals[0].aborted).toBe(false);
    expect(fixture.rpc).toHaveBeenCalledTimes(1);
    expect(fixture.maxActive).toBe(1);

    await act(async () => { first.resolve(); await Promise.resolve(); });
    await advance(10_000);
    await navigate('/missions', 'Missions');
    await advance(10_000);
    await navigate('/', 'Dashboard');
    await advance(9_999);
    expect(fixture.rpc).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(fixture.rpc).toHaveBeenCalledTimes(2);
    expect(fixture.maxActive).toBe(1);
    expect(fixture.rpc).toHaveBeenNthCalledWith(2, 'update_my_last_seen');
  });

  it('mantém a RPC no refresh confirmado do mesmo UID e encerra o ciclo no logout', async () => {
    const user = await mount();
    const first = fixture.requests[0];
    const refreshed = session({ ...user }, authJwt(user.id, { exp: Math.floor(Date.now() / 1000) + 7200 }));
    await act(async () => { fixture.listener!('TOKEN_REFRESHED', refreshed); });
    expect(fixture.getUser).toHaveBeenCalledTimes(2);
    expect(fixture.getUser).toHaveBeenCalledWith(refreshed.access_token);
    expect(fixture.rpc).toHaveBeenCalledTimes(1);
    expect(first.signals[0].aborted).toBe(false);

    await act(async () => { fixture.listener!('SIGNED_OUT', null); });
    expect(first.signals[0].aborted).toBe(true);
    await act(async () => { first.resolve(); await Promise.resolve(); });
    await advance(90_000);
    expect(fixture.rpc).toHaveBeenCalledTimes(1);
    expect(fixture.maxActive).toBe(1);
  });
});
