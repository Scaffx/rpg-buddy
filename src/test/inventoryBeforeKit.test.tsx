import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '@/i18n';
import type { InventoryItem } from '@/hooks/useInventory';

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

afterEach(() => {
  localStorage.clear();
});

function openInventory() {
  render(<MemoryRouter><ProfilePage /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: /Inventário/ }));
}

describe('Profile inventory before starter kit', () => {
  it('shows a purchased item and Equipar while the welcome-kit notice remains available', () => {
    fixture.inventory = [boughtStaff];
    openInventory();

    expect(screen.getByText('Cajado do Andarilho')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Equipar' })).toBeEnabled();
    expect(screen.getByText('Kit de Novato disponível!')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ir para as missões de boas-vindas' })).toBeEnabled();
    expect(fixture.equip).not.toHaveBeenCalled();
    expect(fixture.rpc).not.toHaveBeenCalled();
    expect(fixture.from).not.toHaveBeenCalled();
  });

  it('keeps the welcome-kit notice and an empty inventory message when no item exists', () => {
    openInventory();

    expect(screen.getByText('Kit de Novato disponível!')).toBeInTheDocument();
    expect(screen.getByText('Derrote bosses para conseguir novos itens!')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Equipar' })).not.toBeInTheDocument();
  });
});
