import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CombatLoadout from '@/components/CombatLoadout';
import SkillTreePage from '@/pages/SkillTreePage';
import FeatsTree from '@/pages/FeatsTree';
import pt from '@/i18n/locales/pt.json';

const state = vi.hoisted(() => ({
  level: 10,
  treeKey: 'aprendiz',
  hasClass: false,
  profile: { level: 10, current_class_id: null as string | null, starter_class: 'mago',
    pontos_talento: 2, combat_skill_loadout: [{ id: 'skill_a' }, { id: 'skill_b' }] },
  saved: null as unknown,
  reset: vi.fn(),
}));
const nodes = [
  { id: 'skill_a', tree: 'aprendiz', branch: 'tronco', area: 'arcano', tier: 0, cost: 1, max_rank: 5,
    node_type: 'skill', name: 'A', description: 'A', effect: { power: 30, mpCost: 2, cooldown: 1, effectType: 'dano' },
    gate_points: 0, prereq_node_id: null, exclusive_group: null, sort: 0 },
  { id: 'skill_b', tree: 'aprendiz', branch: 'fogo', area: 'fogo', tier: 1, cost: 1, max_rank: 5,
    node_type: 'skill', name: 'B', description: 'B', effect: { power: 40, mpCost: 5, cooldown: 2, effectType: 'dano' },
    gate_points: 0, prereq_node_id: null, exclusive_group: null, sort: 1 },
  { id: 'skill_heal', tree: 'aprendiz', branch: 'suporte', area: 'suporte', tier: 1, cost: 1, max_rank: 1,
    node_type: 'skill', name: 'Heal', description: 'Heal', effect: { power: 20, mpCost: 4, cooldown: 3, effectType: 'heal' },
    gate_points: 0, prereq_node_id: null, exclusive_group: null, sort: 2 },
  { id: 'skill_utility', tree: 'aprendiz', branch: 'suporte', area: 'suporte', tier: 1, cost: 1, max_rank: 1,
    node_type: 'skill', name: 'Utility', description: 'Utility', effect: { power: 0, mpCost: 1, cooldown: 1, effectType: 'utility' },
    gate_points: 0, prereq_node_id: null, exclusive_group: null, sort: 3 },
];
const emptyNodes: typeof nodes = [];
const mageNodes = [{ ...nodes[0], id: 'm_dardo', tree: 'mago', name: 'Dardo Arcano' }];
const ranks = { skill_a: 1, skill_b: 1, skill_heal: 1, skill_utility: 1, m_dardo: 1 };
const inventory: unknown[] = [];

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'hero' } }) }));
vi.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ data: state.profile }) }));
vi.mock('@/hooks/useInventory', () => ({ useInventory: () => ({ data: inventory }) }));
vi.mock('@/hooks/useHeroClass', () => ({ useHeroClass: () => ({ treeKey: state.treeKey, hasClass: state.hasClass }) }));
vi.mock('@/hooks/useSkillTree', () => ({
  useSkillTreeNodes: (tree: string) => ({ data: tree === 'aprendiz' ? nodes : tree === 'mago' ? mageNodes : emptyNodes, isLoading: false }),
  useAllSkillTreeNodes: () => ({ data: nodes, isLoading: false }),
  usePlayerSkillNodes: () => ({ data: ranks }),
  useAllocateSkillNode: () => ({ mutate: vi.fn(), isPending: false }),
  useResetSkillTree: () => ({ mutate: state.reset, isPending: false }),
  computeSpentPoints: (all: typeof nodes, ranks: Record<string, number>) => all.reduce((n, node) => n + (ranks[node.id] || 0) * node.cost, 0),
}));
vi.mock('@/lib/combat', () => ({ buildTreeSkillEntry: (n: typeof nodes[number]) => ({
  id: n.id, name: n.name, power: n.effect.power, mpCost: n.effect.mpCost,
  cooldown: n.effect.cooldown, effectType: n.effect.effectType, element: 'arcano',
}) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => ({
  update: (payload: unknown) => { state.saved = payload; return { eq: async () => ({ error: null }) }; },
}) } }));
vi.mock('@/hooks/useTalents', () => ({
  MAX_EQUIPPED_TALENTS: 3,
  useAvailableTalents: () => ({ data: [{ id: 'talent', nome: 'Foco', descricao: 'Rotinas', efeito: 'foco_inabalavel' }] }),
  usePlayerTalents: () => ({ data: [] }),
  useBuyTalent: () => ({ mutate: vi.fn(), isPending: false }),
  useToggleEquipTalent: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('react-i18next', async (importOriginal) => ({
  ...await importOriginal<typeof import('react-i18next')>(),
  useTranslation: () => ({ t: (key: string, vars?: Record<string, unknown>) =>
    vars?.name ? `${key}:${vars.name}` : key === 'app.habhub.skill_cost_cooldown'
      ? `${vars?.mp} MP · ${vars?.turns} turns` : key,
  }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
let container: HTMLDivElement | null = null;
let client: QueryClient | null = null;
function render(ui: React.ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  act(() => root!.render(<QueryClientProvider client={client!}>{ui}</QueryClientProvider>));
  return container;
}
beforeEach(() => {
  state.saved = null;
  state.level = 10;
  state.profile.level = 10;
  state.profile.current_class_id = null;
  state.profile.combat_skill_loadout = [{ id: 'skill_a' }, { id: 'skill_b' }];
  state.treeKey = 'aprendiz';
  state.hasClass = false;
  state.reset.mockReset();
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  client?.clear();
  root = null; container = null; client = null;
  vi.unstubAllGlobals();
});

describe('Habilidades hub e reset', () => {
  it('moves skills accessibly and persists their new priority order', async () => {
    const page = render(<CombatLoadout />);
    expect(page.textContent).toContain('2 MP');
    expect(page.textContent).toContain('5 MP');
    expect(page.textContent).not.toContain('Frascos de combate');
    expect(page.textContent).toContain('app.habhub.not_in_auto_adventure');
    expect(page.textContent).toContain('app.habhub.direct_damage_only');
    const cards = [...page.querySelectorAll('.grid > div')];
    expect(cards.find((card) => card.textContent?.includes('Heal'))?.textContent)
      .not.toContain('app.habhub.not_in_auto_adventure');
    expect(cards.find((card) => card.textContent?.includes('Utility'))?.textContent)
      .toContain('app.habhub.not_in_auto_adventure');
    const down = page.querySelector<HTMLButtonElement>('[aria-label="app.habhub.move_down:A"]')!;
    expect(down.disabled).toBe(false);
    act(() => down.click());
    const ordered = page.querySelector('[aria-label="app.habhub.ordered_skills"]')!;
    expect(ordered.textContent).toMatch(/1\. .*B.*2\. .*A/s);
    await act(async () => page.querySelector<HTMLButtonElement>('button[class*="bg-primary/90"]')!.click());
    expect((state.saved as { combat_skill_loadout: { id: string }[] }).combat_skill_loadout.map((entry) => entry.id))
      .toEqual(['skill_b', 'skill_a']);
  });

  it('keeps real life talents without a duplicate combat skills panel', () => {
    const page = render(<FeatsTree embedded />);
    expect(pt.app.habhub.tab_talents).toBe('Talentos da vida real');
    expect(pt.app.feats.page_title).toBe('Talentos da vida real');
    expect(page.textContent).toContain('app.feats.page_title');
    expect(page.querySelector('[data-tour="feats-loadout"]')).toBeNull();
    expect(page.querySelector('[data-tour="feats-tree"]')).not.toBeNull();
  });

  it('keeps a mage skill allocated without claiming an unchosen class can cast it', async () => {
    state.treeKey = 'mago';
    state.hasClass = true;
    state.profile.combat_skill_loadout = [{ id: 'm_dardo' }];
    const page = render(<CombatLoadout />);
    expect(page.textContent).toContain('Dardo Arcano');
    expect(page.textContent).toContain('app.habhub.class_choice_required');
    await act(async () => page.querySelector<HTMLButtonElement>('button[class*="bg-primary/90"]')!.click());
    expect((state.saved as { combat_skill_loadout: { id: string }[] }).combat_skill_loadout[0].id).toBe('m_dardo');
  });

  it('treats level 10 as free and confirms the 150 gold cost at level 11', () => {
    const confirm = vi.fn(() => true);
    vi.stubGlobal('confirm', confirm);
    let page = render(<SkillTreePage embedded />);
    const resetButton = () => [...page.querySelectorAll('button')].find((button) => button.textContent?.includes('app.skilltree.respec'))!;
    act(() => resetButton().click());
    expect(confirm).not.toHaveBeenCalled();
    expect(state.reset).toHaveBeenCalledOnce();
    act(() => root!.unmount());
    container!.remove();
    root = null; container = null; client?.clear(); client = null;
    state.profile.level = 11;
    page = render(<SkillTreePage embedded />);
    act(() => resetButton().click());
    expect(confirm).toHaveBeenCalledOnce();
    expect(resetButton().textContent).toContain('150');
    expect(state.reset).toHaveBeenCalledTimes(2);
  });
});
