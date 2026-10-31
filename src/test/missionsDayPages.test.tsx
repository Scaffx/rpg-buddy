import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/i18n';
import Missions from '@/pages/Missions';

type MissionFixture = {
  id: string;
  title: string;
  created_at: string;
  days_of_week: string[];
  due_date: string | null;
  daily_status: Record<string, string>;
  completed: boolean;
  frequency_type: 'daily' | 'weekly';
  target_count?: number;
  weekly_current_count?: number;
  weekly_last_completed_date?: string | null;
  [key: string]: unknown;
};

const fixture = vi.hoisted(() => ({
  missions: [] as MissionFixture[],
  progress: [] as Array<{ mission_id: string; current_count: number; last_completed_date: string | null; milestone_paid: boolean; week_start: string }>,
  rpc: vi.fn(),
  reads: [] as Array<{ table: string; filters: Record<string, unknown> }>,
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
let host: HTMLDivElement | undefined;

function queries(scope: ParentNode) {
  const byText = (name: string | RegExp) => [...scope.querySelectorAll<HTMLElement>('*')]
    .filter((node) => {
      const content = node.textContent?.trim() || '';
      const matches = typeof name === 'string' ? content === name : name.test(content);
      return matches && ![...node.children].some((child) => child.textContent?.trim() === content);
    });
  const byButton = (name: string | RegExp) => [...scope.querySelectorAll<HTMLButtonElement>('button')]
    .filter((button) => {
      const label = button.getAttribute('aria-label') || button.textContent?.trim() || '';
      return typeof name === 'string' ? label === name : name.test(label);
    });
  return {
    getByText: (name: string | RegExp) => {
      const match = byText(name)[0];
      if (!match) throw new Error(`Text missing: ${String(name)}`);
      return match;
    },
    queryByText: (name: string | RegExp) => byText(name)[0] || null,
    getAllByText: (name: string | RegExp) => byText(name),
    getByRole: (_role: 'button', options: { name: string | RegExp }) => {
      const match = byButton(options.name)[0];
      if (!match) throw new Error(`Button missing: ${String(options.name)}`);
      return match;
    },
  };
}

const screen = queries(document.body);
const within = (element: HTMLElement) => queries(element);

// Keep the real page and mission hooks mounted. Only replace the Auth and
// Supabase boundaries so these cases exercise the page -> mutation -> RPC path.
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'day-page-hero' } }),
}));
vi.mock('@/components/AppLayout', () => ({ default: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      const result = () => {
        fixture.reads.push({ table, filters: { ...filters } });
        const data = table === 'missions'
          ? filters.is_failed === true ? [] : fixture.missions
          : table === 'mission_weekly_progress' ? fixture.progress
          : table === 'profiles' ? { health_anchors_enabled: true }
          : table === 'attributes' ? [{ id: 'strength', name: 'Força', icon: '💪' }]
          : [];
        return { data, error: null };
      };
      const builder: Record<string, unknown> = {};
      for (const method of ['select', 'order', 'limit', 'gte']) {
        builder[method] = () => builder;
      }
      builder.eq = (key: string, value: unknown) => { filters[key] = value; return builder; };
      builder.maybeSingle = async () => result();
      builder.then = (resolve: (value: ReturnType<typeof result>) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve(result()).then(resolve, reject);
      return builder;
    },
    rpc: fixture.rpc,
  },
}));

const THURSDAY = '2026-07-23';
const WEDNESDAY = '2026-07-22';
const MONDAY = '2026-07-20';
const SUNDAY = '2026-07-19';

function daily(id: string, title: string, days: string[], overrides: Partial<MissionFixture> = {}): MissionFixture {
  return {
    id, title, created_at: '2026-07-18T12:00:00Z', days_of_week: days,
    due_date: null, daily_status: {}, completed: false,
    frequency_type: 'daily', status: 'pendente', is_failed: false,
    attribute_id: 'strength', priority: 'media', horario_provavel: 'flex',
    xp_reward: 10, secondary_attribute_ids: [],
    ...overrides,
  };
}

function weekly(id: string, title: string, overrides: Partial<MissionFixture> = {}): MissionFixture {
  return daily(id, title, [], {
    frequency_type: 'weekly', target_count: 3, weekly_current_count: 1,
    weekly_last_completed_date: null, ...overrides,
  });
}

async function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root!.render(<QueryClientProvider client={client}><Missions /></QueryClientProvider>); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  return { client };
}

function card(title: string): HTMLElement {
  const heading = screen.getByText(title);
  const root = heading.closest('.rounded-xl');
  if (!root) throw new Error(`Card missing for ${title}`);
  return root as HTMLElement;
}

async function selectDay(label: 'Hoje' | 'Ontem') {
  await act(async () => { screen.getByRole('button', { name: new RegExp(`^${label}`) }).click(); });
  // AnimatePresence(mode="wait") keeps the old region in the DOM until its exit finishes.
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 350)); });
  expect(screen.getByRole('button', { name: new RegExp(`^${label}`) })).toHaveAttribute('aria-pressed', 'true');
}

async function selectTab(label: 'Pendentes' | 'Concluídas' | 'Foco') {
  await act(async () => { screen.getByRole('button', { name: new RegExp(label) }).click(); });
}

function completionButton(title: string): HTMLButtonElement {
  return within(card(title)).getByRole('button', { name: /Completar/i }) as HTMLButtonElement;
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-07-23T15:00:00.000Z'));
  fixture.missions = [];
  fixture.progress = [];
  fixture.reads = [];
  fixture.rpc.mockReset();
  fixture.rpc.mockResolvedValue({ data: { xp_gained: 10, gold_gained: 1, is_backfill: true, completed_date: WEDNESDAY }, error: null });
  localStorage.setItem('tour_done_missions', 'true');
  await i18n.changeLanguage('pt');
});

afterEach(async () => {
  if (root) await act(async () => { root!.unmount(); });
  host?.remove();
  root = undefined;
  host = undefined;
  vi.restoreAllMocks();
  vi.useRealTimers();
  localStorage.removeItem('tour_done_missions');
});

describe('Missions mounted day pages', () => {
  it('names the selected day and lists only occurrences eligible on yesterday', async () => {
    fixture.missions = [
      daily('wed', 'Treino de quarta', ['Qua']),
      daily('thu', 'Treino de quinta', ['Qui']),
      daily('new', 'Criada hoje para quarta', ['Qua'], { created_at: '2026-07-23T12:00:00Z' }),
      daily('future', 'Única de amanhã', [], { due_date: '2026-07-24' }),
      daily('old', 'Única de ontem', [], { due_date: WEDNESDAY }),
    ];
    await mount();
    expect(screen.getByText(/Missões de Hoje/)).toBeInTheDocument();
    await selectDay('Ontem');
    expect(screen.getByText('Treino de quarta')).toBeInTheDocument();
    expect(screen.getByText('Única de ontem')).toBeInTheDocument();
    expect(screen.queryByText('Criada hoje para quarta')).not.toBeInTheDocument();
    expect(screen.queryByText('Única de amanhã')).not.toBeInTheDocument();
    expect(screen.queryByText(/Missões de Hoje/)).not.toBeInTheDocument();
    expect(screen.getByText(/Missões de Ontem/i)).toBeInTheDocument();
    expect(screen.getByText(/Missões Únicas.*Ontem/i)).toBeInTheDocument();
    await selectTab('Foco');
    expect(screen.getByText('Treino de quarta')).toBeInTheDocument();
    expect(screen.queryByText('Criada hoje para quarta')).not.toBeInTheDocument();
  });

  it('shows completions once, only for the selected date', async () => {
    fixture.missions = [
      daily('both', 'Feita nos dois dias', ['Qua', 'Qui'], { daily_status: { [WEDNESDAY]: 'completed', [THURSDAY]: 'completed' } }),
      daily('today', 'Feita só hoje', ['Qui'], { daily_status: { [THURSDAY]: 'completed' } }),
      daily('yesterday', 'Feita só ontem', ['Qua'], { daily_status: { [WEDNESDAY]: 'completed' } }),
      daily('unique', 'Única concluída ontem', [], { due_date: WEDNESDAY, completed: true }),
    ];
    await mount();
    await selectTab('Concluídas');
    expect(screen.getByText('Feita só hoje')).toBeInTheDocument();
    expect(screen.queryByText('Feita só ontem')).not.toBeInTheDocument();
    await selectDay('Ontem');
    expect(screen.queryByText('Feita só hoje')).not.toBeInTheDocument();
    expect(screen.getByText('Feita só ontem')).toBeInTheDocument();
    expect(screen.getByText('Única concluída ontem')).toBeInTheDocument();
    expect(screen.getAllByText('Feita nos dois dias')).toHaveLength(1);
    expect(within(card('Feita nos dois dias')).getByRole('button', { name: /Desfazer conclusão.*2026-07-22/i })).toBeInTheDocument();
  });

  it('sends the explicit yesterday date without reward fields and blocks a duplicate while pending', async () => {
    fixture.missions = [daily('wed', 'Treino pendente', ['Qua'])];
    let finish!: (value: { data: object; error: null }) => void;
    fixture.rpc.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await mount();
    await selectDay('Ontem');
    await act(async () => { completionButton('Treino pendente').click(); await Promise.resolve(); });
    expect(fixture.rpc).toHaveBeenCalledExactlyOnceWith('complete_mission', { p_mission_id: 'wed', p_date: WEDNESDAY });
    await act(async () => { screen.getByRole('button', { name: /^Hoje/ }).click(); });
    expect(screen.getByRole('button', { name: /^Ontem/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText('Treino pendente')).not.toBeInTheDocument();
    expect(fixture.rpc).toHaveBeenCalledTimes(1);
    await act(async () => { finish({ data: { xp_gained: 10, gold_gained: 1, is_backfill: true, completed_date: WEDNESDAY }, error: null }); });
  });

  it('pins Today explicitly at click time without client reward fields', async () => {
    fixture.missions = [daily('thu', 'Treino de hoje', ['Qui'])];
    await mount();
    await act(async () => { completionButton('Treino de hoje').click(); });
    expect(fixture.rpc).toHaveBeenCalledExactlyOnceWith('complete_mission', { p_mission_id: 'thu', p_date: THURSDAY });
  });

  it('uses Sunday as yesterday on Monday and leaves current-week cap to the server', async () => {
    vi.setSystemTime(new Date('2026-07-20T15:00:00.000Z'));
    fixture.missions = [weekly('sun-week', 'Semanal de domingo', { target_count: 1, weekly_current_count: 1, daily_status: { [MONDAY]: 'completed' } })];
    fixture.progress = [{ mission_id: 'sun-week', current_count: 1, last_completed_date: MONDAY, milestone_paid: true, week_start: MONDAY }];
    await mount();
    await selectDay('Ontem');
    expect(screen.getByText('Semanal de domingo')).toBeInTheDocument();
    expect(completionButton('Semanal de domingo')).toBeEnabled();
    await act(async () => { completionButton('Semanal de domingo').click(); });
    expect(fixture.rpc).toHaveBeenCalledExactlyOnceWith('complete_mission', { p_mission_id: 'sun-week', p_date: SUNDAY });
  });

  it('does not offer Sunday to a weekly mission started on Monday', async () => {
    vi.setSystemTime(new Date('2026-07-20T15:00:00.000Z'));
    fixture.missions = [weekly('new-week', 'Semanal recém iniciada', { weekly_started_at: '2026-07-20T12:00:00Z' })];
    await mount();
    await selectDay('Ontem');
    expect(screen.queryByText('Semanal recém iniciada')).not.toBeInTheDocument();
  });

  it('refreshes Yesterday when São Paulo crosses midnight and the window gains focus', async () => {
    vi.setSystemTime(new Date('2026-07-23T02:59:50.000Z'));
    fixture.missions = [daily('roll', 'Missão da virada', ['Qua'])];
    await mount();
    await selectDay('Ontem');
    expect(screen.queryByText('Missão da virada')).not.toBeInTheDocument();
    vi.setSystemTime(new Date('2026-07-23T03:00:20.000Z'));
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 350)); });
    expect(screen.getByRole('button', { name: /^Ontem/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Missão da virada')).toBeInTheDocument();
    await act(async () => { completionButton('Missão da virada').click(); });
    expect(fixture.rpc).toHaveBeenCalledExactlyOnceWith('complete_mission', { p_mission_id: 'roll', p_date: WEDNESDAY });
  });

  it('refreshes the logical day and refetches weekly progress on the 30-second tick without focus', async () => {
    // Keep browser animations and React Query timers real. Accelerate only the
    // page's 30-second interval; it still fires on its own after the clock changes.
    const nativeSetInterval = window.setInterval.bind(window);
    const intervals = vi.spyOn(window, 'setInterval').mockImplementation((handler, timeout, ...args) =>
      nativeSetInterval(handler, timeout === 30_000 ? 50 : timeout, ...args));
    vi.setSystemTime(new Date('2026-07-20T02:59:50.000Z')); // Sunday 23:59 in São Paulo
    fixture.missions = [weekly('week-roll', 'Semanal na virada')];
    await mount();
    await selectDay('Ontem');
    expect(intervals).toHaveBeenCalledWith(expect.any(Function), 30_000);
    expect(screen.getByRole('button', { name: /^Ontem/ }).textContent).toContain('18/07/2026');
    expect(fixture.reads.some((read) => read.table === 'mission_weekly_progress' && read.filters.week_start === '2026-07-13')).toBe(true);

    vi.setSystemTime(new Date('2026-07-20T03:00:20.000Z')); // Monday 00:00 in São Paulo
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 150)); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 350)); });
    expect(screen.getByRole('button', { name: /^Ontem/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /^Hoje/ }).textContent).toContain('20/07/2026');
    expect(screen.getByRole('button', { name: /^Ontem/ }).textContent).toContain('19/07/2026');
    expect(fixture.reads.some((read) => read.table === 'mission_weekly_progress' && read.filters.week_start === MONDAY)).toBe(true);
  });

  it('rejects a stale click before the next clock tick and shows the new Yesterday for retry', async () => {
    vi.setSystemTime(new Date('2026-07-23T02:59:50.000Z')); // Wednesday 23:59 in São Paulo
    fixture.missions = [
      daily('tue', 'Missão de terça', ['Ter']),
      daily('wed', 'Missão de quarta', ['Qua']),
    ];
    await mount();
    await selectDay('Ontem');
    expect(screen.getByText('Missão de terça')).toBeInTheDocument();
    vi.setSystemTime(new Date('2026-07-23T03:00:20.000Z')); // Thursday 00:00
    await act(async () => { completionButton('Missão de terça').click(); });
    expect(fixture.rpc).not.toHaveBeenCalled();
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 350)); });
    expect(screen.getByRole('button', { name: /^Ontem/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /^Ontem/ }).textContent).toContain('22/07/2026');
    expect(screen.queryByText('Missão de terça')).not.toBeInTheDocument();
    expect(screen.getByText('Missão de quarta')).toBeInTheDocument();
    await act(async () => { completionButton('Missão de quarta').click(); });
    expect(fixture.rpc).toHaveBeenCalledExactlyOnceWith('complete_mission', { p_mission_id: 'wed', p_date: WEDNESDAY });
  });

});
