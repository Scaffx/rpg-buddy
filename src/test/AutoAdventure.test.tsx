import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import AutoAdventure from '@/components/AutoAdventure';

const mocked = vi.hoisted(() => ({ value: null as unknown }));
const rpcMock = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useAutoAdventure', () => ({ useAutoAdventure: () => mocked.value }));
vi.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ data: { display_name: 'Murillo', avatar_url: null } }) }));
vi.mock('@/hooks/useHeroClass', () => ({
  useHeroClass: () => ({ currentClassName: 'Cavaleiro', starterClass: 'guerreiro' }),
  starterClassDisplayName: () => 'Espadachim',
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: rpcMock } }));
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
  rpcMock.mockReset();
});

describe('AutoAdventure', () => {
  it('keeps the page useful while the RPC is absent or loading', () => {
    mocked.value = { data: undefined, isLoading: true, error: null, isFetching: true, refetch: vi.fn() };
    expect(renderAdventure().querySelector('[role=status]')?.textContent).toContain('Preparando sua aventura');

    const refetch = vi.fn();
    mocked.value = { data: undefined, isLoading: false, error: new Error('function not found'), isFetching: false, refetch };
    expect(renderAdventure().querySelector('[role=alert]')?.textContent).toContain('A aventura está indisponível');
    expect(container!.querySelector('button')?.textContent).toContain('Tentar novamente');
    act(() => container!.querySelector('button')!.click());
    expect(refetch).toHaveBeenCalledOnce();
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
    expect(page.textContent).toContain('Chefe da etapa 10');
    expect(page.textContent).toContain('Goblin Feroz');
    expect(page.textContent).toContain('Murillo');
    expect(page.textContent).toContain('Cavaleiro');
    expect(page.querySelector('.adventure-hero-svg')).not.toBeNull();
    expect(page.querySelector('[data-biome=floresta]')).not.toBeNull();
    expect(page.textContent).toContain('Combates podem dar ouro e itens; rotinas concluídas dão XP e atributos');
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
    expect(page.querySelector('.adventure-hero-svg')).not.toBeNull();
  });

  it('revela só o ataque já ocorrido e mantém o HP da timeline servidor', () => {
    const now = Date.now();
    mocked.value = {
      data: {
        stage: 2, server_now: new Date(now).toISOString(), next_at: new Date(now + 12000).toISOString(),
        boss: { stage: 10, id: 'boss', name: 'Chefe', icon: null }, encounters: [], gold_today: 0, loot_today: 0,
        limits: { gold_per_day: 120, items_per_day: 2 },
        battle: {
          id: 'battle-2', stage: 2, attempt: 0, kind: 'normal', status: 'fighting',
          enemy_name: 'Javali', enemy_icon: null, boss_id: null,
          hero_max_hp: 100, enemy_max_hp: 100, hero_hp: 100, enemy_hp: 88,
          events: [
            { at: new Date(now - 250).toISOString(), actor: 'hero', kind: 'skill', skill_id: 'skill-1', skill_name: 'Tiro Vetor', effect: 'gelo', damage: 12, hero_hp: 100, enemy_hp: 88 },
            { at: new Date(now + 8000).toISOString(), actor: 'enemy', kind: 'attack', skill_id: null, skill_name: null, damage: 40, hero_hp: 60, enemy_hp: 88 },
          ],
        },
      },
      isLoading: false, isFetching: false, error: null, refetch: vi.fn(),
    };
    const page = renderAdventure();
    expect(page.textContent).toContain('Tiro Vetor');
    expect(page.textContent).toContain('12 de dano');
    expect(page.textContent).not.toContain('40 de dano');
    expect(page.querySelector('.adventure-vfx-ice')).not.toBeNull();
    expect(page.querySelector('[aria-label="Javali: 88 de 100 HP"]')).not.toBeNull();
    expect(page.querySelector('[aria-label="Murillo: 100 de 100 HP"]')).not.toBeNull();
  });

  it('na derrota da primeira etapa impede recuo e envia retry com ID do combate', async () => {
    rpcMock.mockResolvedValue({ data: {}, error: null });
    const refetch = vi.fn().mockResolvedValue({});
    mocked.value = {
      data: {
        stage: 1, server_now: new Date().toISOString(), next_at: new Date().toISOString(),
        boss: { stage: 10, id: 'boss', name: 'Chefe', icon: null }, encounters: [], gold_today: 0, loot_today: 0,
        limits: { gold_per_day: 120, items_per_day: 2 },
        battle: { id: 'battle-1', stage: 1, attempt: 0, kind: 'normal', status: 'defeated', enemy_name: 'Lobo', enemy_icon: null, boss_id: null, hero_max_hp: 100, enemy_max_hp: 100, hero_hp: 0, enemy_hp: 50, events: [] },
      },
      isLoading: false, isFetching: false, error: null, refetch,
    };
    const page = renderAdventure();
    const retry = [...page.querySelectorAll('button')].find(button => button.textContent?.includes('Tentar de novo'))!;
    const previous = [...page.querySelectorAll('button')].find(button => button.textContent?.includes('Voltar uma etapa'))!;
    expect(previous.disabled).toBe(true);
    await act(async () => retry.click());
    expect(rpcMock).toHaveBeenCalledWith('choose_auto_adventure', { p_battle_id: 'battle-1', p_choice: 'retry' });
    expect(refetch).toHaveBeenCalled();
  });

  it('acumula resumo de retorno entre lotes e não descreve prêmio como garantido', () => {
    const base = {
      stage: 4, server_now: '2026-10-20T04:00:00Z', next_at: '2026-10-20T04:00:10Z',
      boss: { stage: 10, id: 'boss', name: 'Chefe', icon: null },
      encounters: [{ stage: 3, attempt: 0, kind: 'normal', won: true, gold: 0, item_id: null }],
      gold_today: 0, loot_today: 0, limits: { gold_per_day: 120, items_per_day: 2 },
    };
    mocked.value = { data: { ...base, catchup: { battles: 2, wins: 2, gold: 4, items: ['item-a'], defeated: false, pending: true, from_stage: 1, to_stage: 2 } }, dataUpdatedAt: 1, isLoading: false, isFetching: false, error: null, refetch: vi.fn() };
    const page = renderAdventure();
    expect(page.textContent).toContain('2 combates · 2 vitórias · +4 ouro · 1 item');
    expect(page.textContent).toContain('sem ouro nesta luta');
    mocked.value = { ...mocked.value as object, data: { ...base, server_now: '2026-10-20T04:00:11Z', catchup: { battles: 1, wins: 0, gold: 0, items: [], defeated: true, pending: false, from_stage: 3, to_stage: 3 } }, dataUpdatedAt: 2 };
    renderAdventure();
    expect(page.textContent).toContain('3 combates · 2 vitórias · +4 ouro · 1 item');
    expect(page.textContent).toContain('Etapas 1 a 3');
    expect(page.textContent).toContain('Seu herói foi derrotado');
  });
});
