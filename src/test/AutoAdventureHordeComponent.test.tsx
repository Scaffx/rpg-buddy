import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import AutoAdventure from '@/components/AutoAdventure';
import { anchorAdventureClock } from '@/lib/adventureClock';
import type { AdventureSnapshot } from '@/lib/autoAdventurePayload';

const state = vi.hoisted(() => ({ query: null as unknown }));
vi.mock('@/hooks/useAutoAdventure', () => ({
  useAutoAdventure: () => state.query,
  useAdvanceAutoAdventure: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false }),
}));
vi.mock('@/hooks/useActivePet', () => ({ useActivePet: () => ({ state: undefined, isLoading: false, error: null }) }));
vi.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ data: { display_name: 'Heroína' } }) }));
vi.mock('@/hooks/useHeroClass', () => ({
  useHeroClass: () => ({ currentClassName: 'Mago', starterClass: 'mago' }),
  starterClassDisplayName: () => 'Mago',
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (_key: string, values: { defaultValue: string }) => values.defaultValue }) }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
let container: HTMLDivElement | null = null;

function render() {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }
  act(() => root!.render(<AutoAdventure />));
  return container;
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function fixture(now = Date.now()) {
  const time = (offset: number) => new Date(now + offset).toISOString();
  const enemies = [
    { slot: 0, id: 'wolf', name: 'Lobo', icon: null, boss_id: null, max_hp: 100, hp: 70, max_mp: 20, mp: 15, resistances: {} },
    { slot: 1, id: 'boar', name: 'Javali', icon: null, boss_id: null, max_hp: 90, hp: 0, max_mp: 10, mp: 10, resistances: {} },
    { slot: 2, id: 'mage', name: 'Mago inimigo', icon: null, boss_id: null, max_hp: 75, hp: 75, max_mp: 30, mp: 20, resistances: {} },
  ];
  const attack = (at: string, actor: 'hero' | 'enemy', actor_slot: number | null, target_slot: number | null,
    hero_hp: number, enemies_hp: number[], enemies_mp: number[]) => ({
    at, actor, actor_slot, target_slot, kind: 'attack', damage: 10, hero_hp, hero_mp: 30,
    enemy_hp: enemies_hp[target_slot ?? actor_slot ?? 0], enemy_mp: enemies_mp[target_slot ?? actor_slot ?? 0],
    enemies_hp, enemies_mp, skill_id: null, skill_name: null, effect: 'physical',
  });
  const battle = {
    id: 'horde', stage: 2, attempt: 0, kind: 'normal', status: 'fighting', engine_version: 'v4_horde',
    started_at: time(-5000), ends_at: time(20000), biome: 'forest', hero_class: 'mago',
    hero_max_hp: 100, hero_hp: 65, hero_max_mp: 40, hero_mp: 30,
    enemy_name: 'Lobo', enemy_icon: null, boss_id: null, enemy_max_hp: 100, enemy_hp: 70,
    enemies, events: [
      attack(time(-700), 'hero', null, 1, 100, [100, 80, 75], [20, 10, 30]),
      attack(time(-600), 'enemy', 2, null, 90, [100, 80, 75], [20, 10, 20]),
      attack(time(-500), 'enemy', 0, null, 80, [100, 80, 75], [15, 10, 20]),
      attack(time(5000), 'hero', null, 1, 65, [70, 0, 75], [15, 10, 20]),
    ],
  };
  const data = {
    stage: 2, mode: 'progressing', server_now: time(0), next_at: time(20000),
    boss: { stage: 10, id: 'boss', name: 'Chefe', icon: null }, encounters: [], gold_today: 0, loot_today: 0,
    limits: { items_per_day: 2 }, catchup: { battles: 0, wins: 0, gold: 0, items: [], pending: false }, battle,
  };
  return { data, battle, time };
}

describe('integração AutoAdventure e cena de horda', () => {
  it('não revela morte futura ao remontar após salto do relógio de parede', () => {
    const clock = vi.spyOn(performance, 'now').mockReturnValue(100);
    const { data } = fixture();
    anchorAdventureClock(data as unknown as AdventureSnapshot);
    state.query = { accountId: 'clock-remount', data, dataUpdatedAt: Date.now(), isLoading: false,
      isFetching: false, error: null, refetch: vi.fn() };
    const page = render();
    expect(page.querySelector('[data-enemy-id="boar"]')?.getAttribute('data-dead')).toBe('false');
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 30_000);
    act(() => root!.unmount());
    root = createRoot(container!);
    render();
    expect(page.querySelector('[data-enemy-id="boar"]')?.getAttribute('data-dead')).toBe('false');
    clock.mockReturnValue(5_100);
    render();
    expect(page.querySelector('[data-enemy-id="boar"]')?.getAttribute('data-dead')).toBe('true');
    vi.restoreAllMocks();
  });

  it('exibe derrota v4 recente só uma vez por conta e batalha após remount', () => {
    const { data, battle, time } = fixture();
    state.query = { accountId: 'defeat-remount-account', data: { ...data,
      last_battle: { ...battle, id: 'defeat-remount-battle', status: 'defeated', ends_at: time(-100), events: [] } },
      dataUpdatedAt: Date.now(), isLoading: false, isFetching: false, error: null, refetch: vi.fn() };
    const page = render();
    expect(page.querySelector('[data-status="defeated"]')).not.toBeNull();
    act(() => root!.unmount());
    root = createRoot(container!);
    render();
    expect(page.querySelector('[data-status="defeated"]')).toBeNull();
    expect(page.querySelector('[data-status="fighting"]')).not.toBeNull();
  });

  it('oferece avanço em holding somente após started_at e antes de ends_at', () => {
    const { data, battle, time } = fixture();
    state.query = { accountId: 'holding-time', data: { ...data, mode: 'holding', advance_pending: false,
      battle: { ...battle, started_at: time(30_000), ends_at: time(60_000) } },
      dataUpdatedAt: Date.now(), isLoading: false, isFetching: false, error: null, refetch: vi.fn() };
    const page = render();
    expect(page.textContent).toContain('A próxima luta nesta etapa está sendo preparada.');
    expect([...page.querySelectorAll('button')].some(button => button.textContent?.includes('Avançar para etapa'))).toBe(false);
    state.query = { ...state.query as object, data: { ...data, mode: 'holding', advance_pending: false,
      battle: { ...battle, started_at: time(-1_000), ends_at: time(60_000) } } };
    render();
    expect([...page.querySelectorAll('button')].some(button => button.textContent?.includes('Avançar para etapa'))).toBe(true);
  });

  it('renderiza três inimigos, alvos e MP confirmados sem revelar a morte futura; pausa só o visual', () => {
    const { data } = fixture();
    state.query = { accountId: 'account-a', data, dataUpdatedAt: Date.now(), isLoading: false, isFetching: false, error: null, refetch: vi.fn() };
    const page = render();
    expect(page.querySelectorAll('[data-enemy-id]')).toHaveLength(3);
    expect(page.querySelector('[data-enemy-id="wolf"] [aria-label="Lobo: 100 de 100 HP"]')).not.toBeNull();
    expect(page.querySelector('[data-enemy-id="boar"] [aria-label="Javali: 80 de 90 HP"]')).not.toBeNull();
    expect(page.querySelector('[data-enemy-id="mage"] [aria-label="Mago inimigo: 75 de 75 HP"]')).not.toBeNull();
    expect(page.querySelector('[data-enemy-id="mage"] [aria-label="Mana de Mago inimigo: 20 de 30 MP"]')).not.toBeNull();
    expect(page.querySelector('[data-enemy-id="boar"]')?.getAttribute('data-dead')).toBe('false');
    expect(page.querySelector('[data-horde-action-id="horde-0"][data-target-slot="1"]')).not.toBeNull();
    expect(page.querySelector('[data-horde-action-id="horde-1"][data-actor-slot="2"]')).not.toBeNull();
    expect(page.querySelector('[data-horde-action-id="horde-2"][data-actor-slot="0"]')).not.toBeNull();
    const pause = [...page.querySelectorAll('button')].find(button => button.textContent === 'Pausar animação')!;
    act(() => pause.click());
    expect(page.querySelector('.adventure-still')).not.toBeNull();
    expect(page.querySelectorAll('[data-horde-action-id]')).toHaveLength(0);
    expect(page.querySelector('[data-enemy-id="boar"] [aria-label="Javali: 80 de 90 HP"]')).not.toBeNull();
  });

  it('mantém cena viva durante catchup, oculta histórico expirado e limpa derrota ao trocar conta', () => {
    const { data, battle, time } = fixture();
    state.query = { accountId: 'account-a', data: { ...data, catchup: { battles: 24, wins: 24, gold: 4, items: [], pending: true } },
      dataUpdatedAt: Date.now(), isLoading: false, isFetching: false, error: null, refetch: vi.fn() };
    const page = render();
    expect(page.querySelector('.adventure-horde')).not.toBeNull();
    expect(page.textContent).not.toContain('Sincronizando suas lutas anteriores');

    state.query = { ...state.query as object, data: { ...data, battle: { ...battle, ends_at: time(-1000) },
      catchup: { battles: 24, wins: 24, gold: 4, items: [], pending: true } } };
    render();
    expect(page.querySelector('.adventure-scene')).toBeNull();
    expect(page.textContent).toContain('Sincronizando suas lutas anteriores');

    state.query = { ...state.query as object, data: { ...data, catchup: { battles: 0, wins: 0, gold: 0, items: [], pending: false },
      last_battle: { ...battle, id: 'defeat-a', status: 'defeated', ends_at: time(-100), events: [] } } };
    render();
    expect(page.querySelector('[data-status="defeated"]')).not.toBeNull();
    state.query = { ...state.query as object, accountId: 'account-b', data: { ...data, battle: { ...battle, id: 'account-b-battle' }, last_battle: null } };
    render();
    expect(page.querySelector('[data-status="defeated"]')).toBeNull();
    expect(page.querySelector('[data-status="fighting"]')).not.toBeNull();
  });
});
