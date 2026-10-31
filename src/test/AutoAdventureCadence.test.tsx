import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { focusManager, onlineManager } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import App from '@/App';
import AppLayout from '@/components/AppLayout';
import AutoAdventure from '@/components/AutoAdventure';

const state = vi.hoisted(() => ({
  id: 'pressure-pending',
  mode: 'pending' as 'pending' | 'error',
  calls: [] as number[], active: 0, maxActive: 0,
}));

const snapshot = {
  stage: 2, mode: 'progressing', advance_pending: false,
  next_at: '2026-10-29T12:00:00Z', server_now: '2026-10-29T12:00:00Z',
  last_result: null, encounters: [],
  boss: { stage: 10, id: 'boss', name: 'Goblin', icon: null },
  boss_wins_credited: 0, gold_today: 0, loot_today: 0,
  reward_day: '2026-10-29', battle: null, last_battle: null,
  catchup: { battles: 0, from_stage: null, to_stage: null, wins: 0, defeats: 0,
    draws: 0, retreats: 0, gold: 0, items: [], defeated: false, pending: true },
  limits: { interval_minutes: 0.25, reward_interval_minutes: 30, offline_hours: 24,
    gold_per_day: 0, items_per_day: 2 },
};

vi.mock('@/hooks/useAuth', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({ user: { id: state.id }, loading: false, authError: false,
    continuity: { epoch: 0, promise: null, resumed: false, sequence: 0 }, retryAuth: vi.fn() }),
}));
vi.mock('@/hooks/usePresence', () => ({ usePresenceHeartbeat: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  rpc: (name: string) => {
    if (name !== 'sync_auto_adventure') throw new Error(`Unexpected RPC: ${name}`);
    state.calls.push(Date.now());
    state.active++;
    state.maxActive = Math.max(state.maxActive, state.active);
    const nth = state.calls.length;
    const promise = new Promise(resolve => setTimeout(() => {
      state.active--;
      resolve(state.mode === 'error' && nth > 1
        ? { data: null, error: { message: 'simulated 504' } }
        : { data: { ...snapshot, catchup: { ...snapshot.catchup,
          pending: state.mode === 'pending' } }, error: null });
    }, 1));
    return Object.assign(promise, { abortSignal: (_signal: AbortSignal) => promise });
  },
  from: () => ({
    select() { return this; }, eq() { return this; },
    maybeSingle: async () => ({ data: null, error: null }),
    then(resolve: (value: { data: unknown[]; error: null }) => unknown) {
      return Promise.resolve({ data: [], error: null }).then(resolve);
    },
  }),
} }));

vi.mock('@/hooks/useProfile', () => ({ useProfile: () => ({
  data: { onboarding_completed: true, starter_class: 'guerreiro', display_name: 'Hero' },
  isLoading: false,
}) }));
vi.mock('@/hooks/useIsAdmin', () => ({ useIsAdmin: () => ({ isAdmin: false, loading: false }) }));
vi.mock('@/hooks/useHeroClass', () => ({
  useHeroClass: () => ({ currentClassName: 'Guerreiro', starterClass: 'guerreiro' }),
  starterClassDisplayName: () => 'Guerreiro',
}));
vi.mock('@/hooks/useActivePet', () => ({ useActivePet: () => ({ state: null, isLoading: false, error: null }) }));
vi.mock('@/hooks/useAdventureAutoPotions', () => ({
  useAdventureAutoPotions: () => ({ state: null, isLoading: false, error: null,
    setError: null, isSetting: false, setEnabled: async () => {}, refetch: async () => {} }),
  autoPotionsUnavailable: () => false, autoPotionsErrorMessage: () => null,
}));
vi.mock('@/hooks/useClickSound', () => ({ useClickSound: vi.fn() }));
vi.mock('@/hooks/useShortRestStatus', () => ({ ShortRestStatusProvider: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('@/hooks/useMidnightReset', () => ({ useMidnightReset: vi.fn() }));
vi.mock('@/hooks/useFailedMissions', () => ({ useCheckFailedMissions: vi.fn() }));
vi.mock('@/hooks/useForrageio', () => ({ useForrageio: vi.fn() }));
vi.mock('@/hooks/useSleepWakeAlerts', () => ({ useSleepWakeAlerts: vi.fn() }));
vi.mock('@/hooks/useAchievements', () => ({ useAutoCheckAchievements: vi.fn() }));
vi.mock('@/hooks/useNotificationScheduler', () => ({ useNotificationScheduler: vi.fn() }));
vi.mock('@/hooks/useReminders', () => ({ useReminderNotifications: vi.fn() }));
vi.mock('@/components/auth/AuthContinuityBoundary', () => ({ AuthContinuityBoundary: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('@/components/BedtimeGate', () => ({ default: () => null }));
vi.mock('@/components/branding/LifeonRPGSplash', () => ({ default: () => <div>Loading</div> }));
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
vi.mock('@/components/adventure/AdventureScene', () => ({ AdventureScene: () => null }));
vi.mock('@/components/adventure/AdventureHoldNotice', () => ({ AdventureHoldNotice: () => null }));
vi.mock('@/components/AdventurePetPanel', () => ({ AdventurePetPanel: () => null }));
vi.mock('@/components/adventure/AdventureAutoPotionsPanel', () => ({ AdventureAutoPotionsPanel: () => null }));
function RoutePage({ next }: { next: string }) {
  return <AppLayout><Link to={next}>Navigate</Link><AutoAdventure /></AppLayout>;
}
vi.mock('@/pages/Dashboard', () => ({ default: () => <RoutePage next="/missions" /> }));
vi.mock('@/pages/Missions', () => ({ default: () => <RoutePage next="/" /> }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-29T12:00:00Z'));
  focusManager.setFocused(true);
  onlineManager.setOnline(true);
  state.calls = []; state.active = 0; state.maxActive = 0;
  window.history.replaceState({}, '', '/');
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove(); root = null; host = null;
  vi.useRealTimers();
});
async function mount(mode: 'pending' | 'error', id: string) {
  state.mode = mode; state.id = id;
  host = document.createElement('div'); document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root!.render(<App />); await vi.advanceTimersByTimeAsync(5); });
  expect(state.calls.length).toBeGreaterThanOrEqual(1);
}
async function advance(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}
async function navigate() {
  await act(async () => {
    host!.querySelector('a[href]')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

it('uses one 2 s catchup cadence with real App, shell and arena observers', async () => {
  await mount('pending', 'pressure-pending');
  await advance(10_000);
  const at10 = state.calls.length;
  await advance(50_000);
  const at60 = state.calls.length;
  expect(at10).toBe(5);
  expect(at60).toBe(30);
  expect(state.maxActive).toBe(1);
});

it('backs off cached failures by 30, 60 and 120 s, then resets after a confirmed success', async () => {
  await mount('error', 'pressure-error');
  await advance(1_100);
  expect(state.calls).toHaveLength(2);
  await advance(29_000);
  expect(state.calls).toHaveLength(2);
  await advance(1_100);
  expect(state.calls).toHaveLength(3);
  await advance(59_000);
  expect(state.calls).toHaveLength(3);
  await advance(1_100);
  expect(state.calls).toHaveLength(4);
  state.mode = 'pending';
  await advance(119_000);
  expect(state.calls).toHaveLength(4);
  await advance(1_100);
  expect(state.calls).toHaveLength(5);
  await advance(2_100);
  expect(state.calls).toHaveLength(6);
  expect(state.maxActive).toBe(1);
});

it('focus and reconnect respect backoff while an arena manual refresh remains immediate', async () => {
  await mount('error', 'pressure-manual');
  await advance(1_100);
  expect(state.calls).toHaveLength(2);
  await act(async () => {
    focusManager.setFocused(false);
    focusManager.setFocused(true);
    onlineManager.setOnline(false);
    onlineManager.setOnline(true);
  });
  expect(state.calls).toHaveLength(2);
  state.mode = 'pending';
  const refresh = [...host!.querySelectorAll('button')].find(button =>
    button.getAttribute('aria-label') === 'Atualizar aventura' || button.textContent?.includes('Tentar novamente'));
  expect(refresh).not.toBeNull();
  await act(async () => { refresh!.click(); await vi.advanceTimersByTimeAsync(5); });
  expect(state.calls).toHaveLength(3);
  await advance(2_100);
  expect(state.calls).toHaveLength(4);
  expect(state.maxActive).toBe(1);
});

it('keeps the original cached-error deadline through route remounts at 20 and 29 s', async () => {
  await mount('error', 'pressure-deadline');
  await advance(1_100);
  expect(state.calls).toHaveLength(2);
  const failedAt = state.calls[1] + 1;
  await advance(19_000);
  await navigate();
  await navigate();
  expect(state.calls).toHaveLength(2);
  await advance(9_000);
  await navigate();
  await navigate();
  expect(state.calls).toHaveLength(2);
  const beforeDue = failedAt + 30_000 - Date.now() - 1;
  await advance(beforeDue);
  expect(state.calls).toHaveLength(2);
  await advance(5);
  expect(state.calls).toHaveLength(3);
  expect(state.calls[2]).toBeGreaterThanOrEqual(failedAt + 30_000);
  expect(state.maxActive).toBe(1);
});

it('keeps the pending two-second floor through route remounts', async () => {
  await mount('pending', 'pressure-pending-deadline');
  expect(state.calls).toHaveLength(1);
  await advance(1_000);
  await navigate();
  await navigate();
  await advance(900);
  expect(state.calls).toHaveLength(1);
  await navigate();
  await navigate();
  await advance(110);
  expect(state.calls).toHaveLength(2);
  expect(state.calls[1] - state.calls[0]).toBeGreaterThanOrEqual(2_000);
  expect(state.maxActive).toBe(1);
});

it('resumes an overdue cached error on focus without a rapid retry loop', async () => {
  await mount('error', 'pressure-overdue');
  await advance(1_100);
  expect(state.calls).toHaveLength(2);
  focusManager.setFocused(false);
  await advance(40_000);
  expect(state.calls).toHaveLength(2);
  await advance(500);
  expect(state.calls).toHaveLength(2);
  await act(async () => focusManager.setFocused(true));
  expect(state.calls).toHaveLength(3);
  expect(state.maxActive).toBe(1);
});
