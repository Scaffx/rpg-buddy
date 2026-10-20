import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import AutoAdventure from '@/components/AutoAdventure';

const mocked = vi.hoisted(() => ({ value: null as unknown }));
vi.mock('@/hooks/useAutoAdventure', () => ({ useAutoAdventure: () => mocked.value }));
vi.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ data: { display_name: 'Murillo', avatar_url: null } }) }));
vi.mock('@/hooks/useHeroClass', () => ({
  useHeroClass: () => ({ currentClassName: 'Cavaleiro', starterClass: 'guerreiro' }),
  starterClassDisplayName: () => 'Espadachim',
}));
vi.mock('@/components/CharacterSprite', () => ({ CharacterSprite: () => <div data-testid="player-sprite" /> }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({
  t: (_key: string, values: { defaultValue: string; [key: string]: unknown }) =>
    values.defaultValue.replace(/{{(\w+)}}/g, (_, key: string) => String(values[key] ?? '')),
}) }));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
let container: HTMLDivElement | null = null;

function renderAdventure() {
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
});

describe('AutoAdventure', () => {
  it('keeps the page useful while the RPC is absent or loading', () => {
    mocked.value = { data: undefined, isLoading: true, error: null, isFetching: true, refetch: vi.fn() };
    expect(renderAdventure().querySelector('[role=status]')?.textContent).toContain('Preparando sua aventura');

    mocked.value = { data: undefined, isLoading: false, error: new Error('function not found'), isFetching: false, refetch: vi.fn() };
    expect(renderAdventure().querySelector('[role=alert]')?.textContent).toContain('A aventura está indisponível');
    expect(container!.querySelector('button')?.textContent).toContain('Tentar novamente');
  });

  it('shows automatic boss progress and rewards without a turn control', () => {
    mocked.value = {
      data: {
        stage: 10,
        boss: { stage: 10, id: 'boss-1', name: 'Goblin Feroz', icon: '👺' },
        next_at: new Date(Date.now() + 30_000).toISOString(),
        server_now: new Date().toISOString(),
        last_result: null,
        encounters: [{ stage: 9, attempt: 0, fought_at: new Date().toISOString(), kind: 'normal', won: true, hero_power: 73, enemy_power: 56, gold: 4, item_id: null }],
        gold_today: 4,
        loot_today: 0,
        limits: { interval_minutes: 30, offline_hours: 24, gold_per_day: 120, items_per_day: 2 },
      },
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    };
    const page = renderAdventure();
    expect(page.querySelector('h2')?.textContent).toBe('Etapa 10');
    expect(page.textContent).toContain('Chefe à frente');
    expect(page.textContent).toContain('Goblin Feroz');
    expect(page.textContent).toContain('Murillo');
    expect(page.textContent).toContain('Cavaleiro');
    expect(page.querySelector('[data-testid=player-sprite]')).not.toBeNull();
    expect(page.textContent).toContain('Nível, atributos treinados e equipamento influenciam o combate');
    expect(page.textContent).toContain('Com o app fechado, não há lutas em tempo real');
    expect(page.textContent).toContain('no máximo 24 horas');
    expect(page.textContent).toContain('Vitória · +4 ouro');
    expect([...page.querySelectorAll('button')].some(button => /atacar|poção|resgatar/i.test(button.textContent || ''))).toBe(false);
  });

  it('shows six server-named boss encounters with the player identity', () => {
    const names = ['Goblin Feroz', 'Lobo Cinzento', 'Orc Selvagem', 'Leviatã Primitivo', 'Wyvern Relâmpago', 'Demônio da Fome'];
    mocked.value = {
      data: {
        stage: 330,
        boss: { stage: 330, id: 'boss-33', name: 'Demônio da Fome', icon: '👹' },
        next_at: new Date(Date.now() + 30_000).toISOString(),
        server_now: new Date().toISOString(),
        last_result: null,
        encounters: names.map((name, index) => ({
          stage: (index + 1) * 10, attempt: 0, fought_at: new Date().toISOString(),
          kind: 'boss', won: true, hero_power: 990, enemy_power: 60 + index * 10,
          gold: 12, item_id: null, boss_id: `boss-${index + 1}`,
          boss_name: name, boss_icon: '⚔️',
        })),
        gold_today: 72, loot_today: 0,
        limits: { interval_minutes: 30, offline_hours: 24, gold_per_day: 120, items_per_day: 2 },
      },
      isLoading: false, isFetching: false, error: null, refetch: vi.fn(),
    };
    const page = renderAdventure();
    for (const name of names) expect(page.textContent).toContain(name);
    expect(page.textContent).toContain('Murillo');
    expect(page.textContent).toContain('Cavaleiro');
    expect(page.querySelectorAll('ol li')).toHaveLength(6);
    expect(page.querySelector('[data-testid=player-sprite]')).not.toBeNull();
  });
});
