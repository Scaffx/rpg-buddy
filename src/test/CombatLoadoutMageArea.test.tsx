import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CombatLoadout from '@/components/CombatLoadout';

const state = vi.hoisted(() => ({
  ranks: { m_bola_fogo: 1, m_fogo_var: 1 },
  profile: { combat_skill_loadout: [{ id: 'm_bola_fogo' }] },
  saved: null as unknown,
}));
const nodes = [
  { id: 'm_bola_fogo', name: 'Bola de Fogo', node_type: 'skill', effect: { power: 40, mpCost: 8, cooldown: 2, effectType: 'dano' } },
  { id: 'm_fogo_var', name: 'Meteoro', node_type: 'variant', effect: { aoe: true } },
];
const emptyNodes: typeof nodes = [];
const emptyInventory: unknown[] = [];
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'hero' } }) }));
vi.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ data: state.profile }) }));
vi.mock('@/hooks/useInventory', () => ({ useInventory: () => ({ data: emptyInventory }) }));
vi.mock('@/hooks/useHeroClass', () => ({ useHeroClass: () => ({ treeKey: 'mago', hasClass: true }) }));
vi.mock('@/hooks/useSkillTree', () => ({
  useSkillTreeNodes: (tree: string) => ({ data: tree === 'mago' ? nodes : emptyNodes }),
  usePlayerSkillNodes: () => ({ data: state.ranks }),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => ({
  update: (payload: unknown) => { state.saved = payload; return { eq: async () => ({ error: null }) }; },
}) } }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({
  t: (key: string) => key, i18n: { language: 'pt-BR' },
}) }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
let container: HTMLDivElement | null = null;
let client: QueryClient | null = null;
function render() {
  container = document.createElement('div'); document.body.appendChild(container);
  root = createRoot(container);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  act(() => root!.render(<QueryClientProvider client={client!}><CombatLoadout /></QueryClientProvider>));
  return container;
}
afterEach(() => { if (root) act(() => root!.unmount()); container?.remove(); client?.clear(); root = null; container = null; client = null; state.saved = null; });

describe('variante de área no loadout do mago', () => {
  it('explica a transformação sem equipar ou salvar o ID da variante', async () => {
    const page = render();
    expect(page.querySelector('[aria-label="app.habhub.ordered_skills"]')?.textContent).toContain('Meteoro atinge o grupo');
    expect(page.textContent).toContain('Variante aprendida: Meteoro atinge o grupo');
    expect(page.querySelectorAll('.grid > div')).toHaveLength(1);
    await act(async () => page.querySelector<HTMLButtonElement>('button[class*="bg-primary/90"]')!.click());
    const saved = state.saved as { combat_skill_loadout: { id: string }[] };
    expect(saved.combat_skill_loadout.map(item => item.id)).toEqual(['m_bola_fogo']);
  });
});
