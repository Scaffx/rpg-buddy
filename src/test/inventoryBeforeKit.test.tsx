import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import i18n from '@/i18n';
import type { InventoryItem } from '@/hooks/useInventory';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;
let container: HTMLDivElement | undefined;

const fixture = vi.hoisted(() => ({
  inventory: [] as InventoryItem[],
  profile: {
    display_name: 'Aventureiro',
    level: 1,
    total_xp: 0,
    starter_class: 'novato',
    starter_kit_claimed: false,
    class_kit_claimed: false,
  },
  equip: vi.fn(),
  attune: vi.fn(),
  consume: vi.fn(),
  useScroll: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
}));
const stable = vi.hoisted(() => ({
  list: [] as unknown[],
  ranks: {},
  levels: {},
  loadout: { noviceSkills: [], classSkills: [], specialtySkills: [] },
}));

const mutation = vi.hoisted(() => () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }));

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: () => ({ data: null, isLoading: false }),
  useMutation: mutation,
  useQueryClient: () => ({ invalidateQueries: vi.fn(), refetchQueries: vi.fn() }),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'test-user', email: 'hero@example.com' } }) }));
vi.mock('@/hooks/useProfile', () => ({
  useProfile: () => ({ data: fixture.profile }),
  useAttributes: () => ({ data: stable.list }),
  useClasses: () => ({ data: stable.list }),
  useBosses: () => ({ data: stable.list }),
  useRestoreHealthAfterGoals: mutation,
  useUpdateDisplayName: mutation,
  useUpdateRegion: mutation,
  useSyncHealthMaxes: mutation,
  useUpdateAvatar: mutation,
}));
vi.mock('@/hooks/useGold', () => ({ useGoldBalance: () => ({ data: { gold: 81 } }) }));
vi.mock('@/hooks/useInventory', () => ({
  useInventory: () => ({ data: fixture.inventory }),
  useToggleEquip: () => ({ mutate: fixture.equip }),
  useToggleAttunement: () => ({ mutate: fixture.attune }),
  useConsumeItem: () => ({ mutate: fixture.consume }),
  useUseScroll: () => ({ mutate: fixture.useScroll, isPending: false }),
  getEquipmentBonuses: () => ({ atk: 0, matk: 0, def: 0, hp: 0, mp: 0, agi: 0, crit: 0 }),
  compareItems: () => 0,
}));
vi.mock('@/hooks/useAchievements', () => ({
  useUserAchievements: () => ({ data: stable.list }),
  useAllAchievements: () => ({ data: stable.list }),
  useClaimAchievement: mutation,
}));
vi.mock('@/hooks/useSkillTree', () => ({
  useSkillTreeNodes: () => ({ data: stable.list }),
  usePlayerSkillNodes: () => ({ data: stable.ranks }),
}));
vi.mock('@/hooks/useDungeonPartnerships', () => ({
  useDungeonPartnerships: () => ({ data: stable.list, isLoading: false }),
  BOND_TIERS: [],
  runsToNextTier: () => 0,
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: fixture.rpc, from: fixture.from },
}));
vi.mock('@/lib/combat', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/combat')>()),
  getAttributeLevels: () => stable.levels,
  getPlayerCombatStats: () => ({ hp: 100, mp: 20 }),
  getSkillLoadout: () => stable.loadout,
}));
vi.mock('@/lib/onboarding', () => ({ hasCompletedOnboarding: () => true }));
vi.mock('@/lib/sfx', () => ({ setVolume: vi.fn() }));
vi.mock('@/components/AppLayout', () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/components/HeroStatusBar', () => ({ default: () => null }));
vi.mock('@/components/ActiveTalentsBadge', () => ({ default: () => null }));
vi.mock('@/components/GuidedTour', () => ({ default: () => null }));
vi.mock('@/components/NotificationSettings', () => ({ default: () => null }));

import ProfilePage from '@/pages/ProfilePage';

const boughtStaff: InventoryItem = {
  id: 'inventory-staff',
  user_id: 'test-user',
  item_id: 'staff',
  quantity: 1,
  equipped: false,
  sintonizado: false,
  obtained_at: '2026-10-19T00:00:00Z',
  game_items: {
    id: 'staff',
    name: 'Cajado do Andarilho',
    description: null,
    icon: '🪄',
    category: 'weapon',
    rarity: 'comum',
    stat_label: null,
    atk_bonus: 0,
    matk_bonus: 1,
    def_bonus: 0,
    hp_bonus: 0,
    mp_bonus: 0,
    agi_bonus: 0,
    crit_bonus: 0,
    shop_price: 28,
    stackable: false,
    is_consumable: false,
    effect: null,
    level_required: 1,
    is_starter: false,
    starter_class: null,
    boss_drop_level: null,
  },
};

beforeEach(async () => {
  await i18n.changeLanguage('pt');
  fixture.inventory = [];
  fixture.profile.starter_kit_claimed = false;
  fixture.profile.class_kit_claimed = false;
  vi.clearAllMocks();
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  localStorage.clear();
});

async function openInventory() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root?.render(<MemoryRouter><ProfilePage /></MemoryRouter>));
  const tab = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('Inventário'));
  expect(tab).toBeDefined();
  await act(async () => tab?.click());
  return container;
}

function findButton(container: HTMLElement, label: string) {
  return [...container.querySelectorAll('button')].find((button) => button.textContent?.trim() === label);
}

describe('Profile inventory before starter kit', () => {
  it('shows reserved food stock without Usar while ordinary consumables keep the action', async () => {
    const food: InventoryItem = { ...boughtStaff, id: 'inventory-food',
      item_id: 'b45e1000-0000-4000-8000-000000000008', quantity: 4,
      game_items: { ...boughtStaff.game_items, id: 'b45e1000-0000-4000-8000-000000000008',
        name: 'Snack localizado', category: 'consumable', is_consumable: true } };
    const potion: InventoryItem = { ...boughtStaff, id: 'inventory-potion', item_id: 'potion-1',
      quantity: 2, game_items: { ...boughtStaff.game_items, id: 'potion-1',
        name: 'Poção de cura', category: 'consumable', is_consumable: true } };
    fixture.inventory = [food, potion, boughtStaff];
    const page = await openInventory();
    const foodCard = [...page.querySelectorAll('div')].find((element) =>
      element.classList.contains('space-y-2') && element.textContent?.includes('Snack localizado'));
    expect(foodCard?.textContent).toContain('x4');
    expect(foodCard?.textContent).toContain('Estoque de alimentação automática do pet');
    expect(foodCard?.querySelector('button')).toBeNull();
    const potionCard = [...page.querySelectorAll('div')].find((element) =>
      element.classList.contains('space-y-2') && element.textContent?.includes('Poção de cura'));
    const useButton = potionCard?.querySelector('button');
    expect(useButton?.textContent).toContain('Usar');
    await act(async () => useButton?.click());
    expect(fixture.consume).toHaveBeenCalledWith({ inventoryId: 'inventory-potion', quantity: 2 });
    expect(page.textContent).toContain('Cajado do Andarilho');
  });

  it('shows a purchased item and Equipar while the welcome-kit notice remains available', async () => {
    fixture.inventory = [boughtStaff];
    const page = await openInventory();

    expect(page.textContent).toContain('Cajado do Andarilho');
    expect(findButton(page, 'Equipar')?.disabled).toBe(false);
    expect(page.textContent).toContain('Kit de Novato disponível!');
    expect(findButton(page, 'Ir para as missões de boas-vindas')?.disabled).toBe(false);
    expect(fixture.equip).not.toHaveBeenCalled();
    expect(fixture.rpc).not.toHaveBeenCalled();
    expect(fixture.from).not.toHaveBeenCalled();
  });

  it('keeps the welcome-kit notice and an empty inventory message when no item exists', async () => {
    const page = await openInventory();

    expect(page.textContent).toContain('Kit de Novato disponível!');
    expect(page.textContent).toContain('Derrote bosses para conseguir novos itens!');
    expect(findButton(page, 'Equipar')).toBeUndefined();
  });
});
