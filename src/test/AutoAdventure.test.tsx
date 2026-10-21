import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import AutoAdventure from '@/components/AutoAdventure';

const mocked = vi.hoisted(() => ({ value: null as unknown }));
const mutation = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false, isError: false }));
vi.mock('@/hooks/useAutoAdventure', () => ({ useAutoAdventure: () => mocked.value, useAdvanceAutoAdventure: () => mutation }));
vi.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ data: { display_name: 'Murillo', avatar_url: null } }) }));
vi.mock('@/hooks/useHeroClass', () => ({
  useHeroClass: () => ({ currentClassName: 'Cavaleiro', starterClass: 'guerreiro' }),
  starterClassDisplayName: (starter: string) => starter === 'mago' ? 'Mago' : 'Espadachim',
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({
  t: (_key: string, values: { defaultValue: string; [key: string]: unknown }) =>
    values.defaultValue.replace(/{{(\w+)}}/g, (_, key: string) => String(values[key] ?? '')),
}) }));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
let container: HTMLDivElement | null = null;

function liveBattleTimes() {
  return { started_at: new Date().toISOString(), ends_at: new Date(Date.now() + 60_000).toISOString() };
}

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
  mutation.mutateAsync.mockReset();
  mutation.isPending = false;
  mutation.isError = false;
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
          id: 'battle-2', stage: 2, attempt: 0, kind: 'normal', status: 'fighting', hero_class: 'mago', biome: 'aquatic',
          enemy_name: 'Javali', enemy_icon: null, boss_id: null,
          hero_max_hp: 100, hero_max_mp: 30, hero_mp: 10, enemy_max_hp: 100, hero_hp: 100, enemy_hp: 88,
          events: [
            { at: new Date(now - 250).toISOString(), actor: 'hero', kind: 'skill', skill_id: 'skill-1', skill_name: 'Tiro Vetor', effect: 'ice', damage: 12, mp_cost: 8, hero_mp: 22, raw_damage: 16, damage_multiplier: .75, effect_note: 'Resistência ao gelo', hero_hp: 100, enemy_hp: 88 },
            { at: new Date(now + 8000).toISOString(), actor: 'enemy', kind: 'attack', skill_id: null, skill_name: null, damage: 40, hero_mp: 10, hero_hp: 60, enemy_hp: 88 },
          ],
        },
      },
      isLoading: false, isFetching: false, error: null, refetch: vi.fn(),
    };
    const page = renderAdventure();
    expect(page.textContent).toContain('Tiro Vetor');
    expect(page.textContent).toContain('12 de dano');
    expect(page.textContent).toContain('−8 MP');
    expect(page.textContent).toContain('Resistência ao gelo');
    expect(page.textContent).not.toContain('40 de dano');
    expect(page.querySelector('[aria-label="Mana: 22 de 30 MP"]')).not.toBeNull();
    expect(page.querySelector('[aria-label="Mana: 10 de 30 MP"]')).toBeNull();
    expect(page.querySelector('.adventure-vfx-ice')).not.toBeNull();
    expect(page.querySelector('[data-hero-class=mago]')).not.toBeNull();
    expect(page.querySelector('[data-biome=aquatico]')).not.toBeNull();
    expect(page.textContent).toContain('Em combate · Mago');
    expect(page.querySelector('[aria-label="Javali: 88 de 100 HP"]')).not.toBeNull();
    expect(page.querySelector('[aria-label="Murillo: 100 de 100 HP"]')).not.toBeNull();
  });

  it('após derrota na 10 permanece na 9 até solicitar avanço pela batalha atual', async () => {
    const refetch = vi.fn();
    mocked.value = {
      data: {
        stage: 9, mode: 'holding', advance_pending: false, server_now: new Date().toISOString(), next_at: new Date().toISOString(),
        boss: { stage: 10, id: 'boss', name: 'Chefe', icon: null },
        encounters: [{ stage: 9, attempt: 2, kind: 'normal', won: true, gold: 0, item_id: null }, { stage: 9, attempt: 1, kind: 'normal', won: true, gold: 0, item_id: null }, { stage: 10, attempt: 0, kind: 'boss', won: false, gold: 0, item_id: null }],
        gold_today: 0, loot_today: 0,
        limits: { gold_per_day: 120, items_per_day: 2 },
        battle: { ...liveBattleTimes(), id: 'battle-9', stage: 9, attempt: 3, kind: 'normal', status: 'fighting', enemy_name: 'Lobo', enemy_icon: null, boss_id: null, hero_max_hp: 100, enemy_max_hp: 100, hero_hp: 100, enemy_hp: 100, events: [] },
        last_battle: { id: 'battle-10-lost', stage: 10, attempt: 0, kind: 'boss', status: 'defeated', enemy_name: 'Chefe', enemy_icon: null, boss_id: 'boss', hero_max_hp: 100, enemy_max_hp: 100, hero_hp: 0, enemy_hp: 50, events: [] },
      },
      isLoading: false, isFetching: false, error: null, refetch,
    };
    mutation.mutateAsync.mockImplementation(async () => {
      const current = mocked.value as { data: Record<string, unknown> };
      mocked.value = {
        ...current,
        data: { ...current.data, advance_pending: true, catchup: { battles: 1, wins: 1, defeats: 0, retreats: 0, gold: 4, items: [], defeated: false, pending: false, from_stage: 9, to_stage: 9 } },
        summary: { battles: 1, wins: 1, defeats: 0, retreats: 0, gold: 4, items: [], defeated: false, pending: false, from_stage: 9, to_stage: 9 },
      };
      return (mocked.value as { data: unknown }).data;
    });
    const page = renderAdventure();
    expect(page.querySelector('h2')?.textContent).toBe('Etapa 9');
    expect(page.textContent).toContain('Permanecendo na etapa 9');
    expect(page.querySelector('[data-stage="10"][data-status="defeated"]')).not.toBeNull();
    expect(page.textContent).not.toContain('Tentar de novo');
    const advance = [...page.querySelectorAll('button')].find(button => button.textContent?.includes('Avançar para etapa 10'))!;
    await act(async () => { advance.click(); advance.click(); });
    expect(mutation.mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutation.mutateAsync).toHaveBeenCalledWith({ battleId: 'battle-9' });
    expect(refetch).not.toHaveBeenCalled();
    expect(page.textContent).toContain('Avanço confirmado');
    expect(page.textContent).toContain('1 combate · 1 vitória · +4 ouro');
    const afterAdvance = mocked.value as { data: Record<string, unknown> };
    mocked.value = { ...afterAdvance, data: { ...afterAdvance.data, last_battle: { ...(afterAdvance.data.last_battle as object) }, catchup: { battles: 0, wins: 0, defeats: 0, retreats: 0, gold: 0, items: [], defeated: false, pending: false, from_stage: null, to_stage: null } } };
    renderAdventure();
    expect(page.textContent).not.toContain('Avançar para etapa 10');
    expect(page.textContent).toContain('1 combate · 1 vitória · +4 ouro');
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 1500)); });
    expect(page.querySelector('[data-stage="9"][data-status="fighting"]')).not.toBeNull();
  });

  it('em erro de rede mantém a etapa e permite tentar avançar novamente', async () => {
    mutation.mutateAsync.mockImplementation(async () => { mutation.isError = true; throw new Error('offline'); });
    mocked.value = {
      data: {
        stage: 1, mode: 'holding', advance_pending: false, server_now: new Date().toISOString(), next_at: new Date().toISOString(),
        boss: { stage: 10, id: 'boss', name: 'Chefe', icon: null }, encounters: [], gold_today: 0, loot_today: 0,
        limits: { gold_per_day: 120, items_per_day: 2 },
        battle: { ...liveBattleTimes(), id: 'battle-1', stage: 1, attempt: 1, kind: 'normal', status: 'fighting', enemy_name: 'Lobo', enemy_icon: null, boss_id: null, hero_max_hp: 100, enemy_max_hp: 100, hero_hp: 100, enemy_hp: 100, events: [] },
      },
      isLoading: false, isFetching: false, error: null, refetch: vi.fn(),
    };
    const page = renderAdventure();
    expect(page.textContent).toContain('Permanecendo na etapa 1');
    expect(page.textContent).not.toContain('recuou após a derrota');
    const advance = [...page.querySelectorAll('button')].find(button => button.textContent?.includes('Avançar para etapa 2'))!;
    await act(async () => advance.click());
    renderAdventure();
    expect(page.textContent).toContain('Não foi possível avançar');
    expect(advance.disabled).toBe(false);
    expect(mutation.mutateAsync).toHaveBeenCalledWith({ battleId: 'battle-1' });
    const afterError = mocked.value as { data: { battle: Record<string, unknown> } };
    mocked.value = { ...afterError, data: { ...afterError.data, battle: { ...afterError.data.battle, id: 'next-battle-1' } } };
    renderAdventure();
    expect(page.textContent).not.toContain('Não foi possível avançar');
  });

  it('não oferece avanço com a batalha derrotada da etapa anterior', () => {
    mocked.value = {
      data: {
        stage: 9, mode: 'holding', advance_pending: false, server_now: new Date().toISOString(), next_at: new Date().toISOString(),
        boss: { stage: 10, id: 'boss', name: 'Chefe', icon: null }, encounters: [], gold_today: 0, loot_today: 0,
        limits: { gold_per_day: 120, items_per_day: 2 },
        battle: { id: 'old-battle-10', stage: 10, attempt: 0, kind: 'boss', status: 'defeated', enemy_name: 'Chefe', enemy_icon: null, boss_id: 'boss', hero_max_hp: 100, enemy_max_hp: 100, hero_hp: 0, enemy_hp: 50, events: [] },
      },
      isLoading: false, isFetching: false, error: null, refetch: vi.fn(),
    };
    const page = renderAdventure();
    expect(page.querySelector('h2')?.textContent).toBe('Etapa 9');
    expect(page.textContent).toContain('Permanecendo na etapa 9');
    expect(page.textContent).not.toContain('Avançar para etapa 10');
    expect(page.textContent).not.toContain('Tentar de novo');
  });

  it.each([true, false])('não avança uma batalha expirada enquanto pending=%s', pending => {
    const now = Date.now();
    mocked.value = {
      data: {
        stage: 9, mode: 'holding', advance_pending: false,
        server_now: new Date(now).toISOString(), next_at: new Date(now).toISOString(),
        boss: { stage: 10, id: 'boss', name: 'Chefe', icon: null },
        encounters: [], gold_today: 0, loot_today: 0,
        limits: { gold_per_day: 120, items_per_day: 2 },
        catchup: { battles: 24, wins: 24, gold: 0, items: [], pending },
        battle: { id: 'historical-battle', stage: 9, attempt: 4, kind: 'normal', status: 'fighting',
          started_at: new Date(now - 120_000).toISOString(), ends_at: new Date(now - 100_000).toISOString(),
          enemy_name: 'Lobo', hero_max_hp: 100, enemy_max_hp: 100, hero_hp: 100, enemy_hp: 100, events: [] },
      },
      dataUpdatedAt: now, isLoading: false, isFetching: false, error: null, refetch: vi.fn(),
    };
    const page = renderAdventure();
    expect(page.textContent).toContain('Permanecendo na etapa 9');
    expect(page.textContent).not.toContain('Avançar para etapa 10');
    expect(mutation.mutateAsync).not.toHaveBeenCalled();
  });

  it('reconhece avanço pendente confirmado pelo servidor após remontagem', () => {
    mocked.value = {
      data: {
        stage: 9, mode: 'holding', advance_pending: true, server_now: new Date().toISOString(), next_at: new Date().toISOString(),
        boss: { stage: 10, id: 'boss', name: 'Chefe', icon: null }, encounters: [], gold_today: 0, loot_today: 0,
        limits: { gold_per_day: 120, items_per_day: 2 },
        battle: { ...liveBattleTimes(), id: 'battle-9', stage: 9, attempt: 2, kind: 'normal', status: 'fighting', enemy_name: 'Lobo', enemy_icon: null, boss_id: null, hero_max_hp: 100, enemy_max_hp: 100, hero_hp: 100, enemy_hp: 100, events: [] },
      },
      isLoading: false, isFetching: false, error: null, refetch: vi.fn(),
    };
    const page = renderAdventure();
    expect(page.textContent).toContain('Avanço confirmado');
    expect([...page.querySelectorAll('button')].some(button => button.textContent?.includes('Avançar para etapa 10'))).toBe(false);
    expect(mutation.mutateAsync).not.toHaveBeenCalled();
  });

  it('usa o resumo guardado pelo hook mesmo após sync comum e oculta a ação fora da permanência', () => {
    const base = {
      stage: 10, mode: 'progressing', advance_pending: false,
      server_now: new Date().toISOString(), next_at: new Date().toISOString(),
      boss: { stage: 10, id: 'boss', name: 'Chefe', icon: null }, encounters: [], gold_today: 7, loot_today: 1,
      limits: { gold_per_day: 120, items_per_day: 2 },
      battle: { id: 'battle-10', stage: 10, attempt: 1, kind: 'boss', status: 'fighting', enemy_name: 'Guardião', enemy_icon: null, boss_id: 'boss', hero_max_hp: 100, enemy_max_hp: 100, hero_hp: 100, enemy_hp: 100, events: [] },
      catchup: { battles: 0, wins: 0, defeats: 0, retreats: 0, gold: 0, items: [], defeated: false, pending: false, from_stage: null, to_stage: null },
    };
    const summary = { battles: 5, wins: 4, defeats: 1, retreats: 1, gold: 7, items: ['item-a'], defeated: true, pending: false, from_stage: 10, to_stage: 9 };
    const acknowledgeSummary = vi.fn();
    mocked.value = { data: base, summary, acknowledgeSummary, dataUpdatedAt: 1, isLoading: false, isFetching: false, error: null, refetch: vi.fn() };
    const page = renderAdventure();
    expect(page.textContent).toContain('Da etapa 10 para a 9');
    expect(page.textContent).toContain('5 combates · 4 vitórias · +7 ouro · 1 item');
    expect(page.textContent).toContain('1 recuo');
    expect(page.textContent).not.toContain('Avançar para etapa 11');
    mocked.value = { ...mocked.value as object, data: { ...base, server_now: new Date(Date.now() + 1000).toISOString() }, dataUpdatedAt: 2 };
    renderAdventure();
    expect(page.textContent).toContain('5 combates · 4 vitórias · +7 ouro · 1 item');
    expect(acknowledgeSummary).not.toHaveBeenCalled();
    act(() => [...page.querySelectorAll('button')].find(button => button.textContent === 'Fechar resumo')!.click());
    expect(acknowledgeSummary).toHaveBeenCalledOnce();
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
    expect(page.textContent).toContain('Após a derrota, seu herói recuou e continuou explorando');
    mocked.value = { ...mocked.value as object, data: { ...base, server_now: '2026-10-20T04:00:30Z', catchup: { battles: 0, wins: 0, gold: 0, items: [], defeated: false, pending: false, from_stage: null, to_stage: null } }, dataUpdatedAt: 3 };
    renderAdventure();
    expect(page.textContent).toContain('3 combates · 2 vitórias · +4 ouro · 1 item');
  });
});
