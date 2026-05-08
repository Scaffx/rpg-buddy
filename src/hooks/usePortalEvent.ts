import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type PortalColor = 'blue' | 'yellow' | 'red' | 'legendary';
export type FragmentTier = 'medium' | 'hard' | 'legendary' | 'ultra';

export type PortalRunRecord = {
  color: PortalColor;
  xp: number;
  fragment: boolean;
};

export type PortalEvent = {
  event_id: string;
  starts_at: string;
  ends_at: string;
  hours_left: number;
  runs_this_week: PortalRunRecord[];
};

export type PublicFragmentSession = {
  session_id: string;
  host_name: string;
  dungeon_tier: string;
  invite_code: string;
  player_count: number;
  max_players: number;
  created_at: string;
};

// ── Portal color metadata ─────────────────────────────────────────────────
export const PORTAL_COLORS: Record<PortalColor, {
  label: string; emoji: string; difficulty: string; levelRange: string;
  xp: number; gold: number; fragmentChance: number;
  colorClass: string; bg: string; btnClass: string; dungeonId: string;
}> = {
  blue: {
    label: 'Portal Azul',
    emoji: '🔵',
    difficulty: 'Fácil',
    levelRange: 'Lv. 1–15',
    xp: 350, gold: 140, fragmentChance: 10,
    colorClass: 'text-sky-400',
    bg: 'bg-sky-500/10 border-sky-500/30',
    btnClass: 'bg-sky-600 hover:bg-sky-700',
    dungeonId: 'portal_blue',
  },
  yellow: {
    label: 'Portal Amarelo',
    emoji: '🟡',
    difficulty: 'Médio',
    levelRange: 'Lv. 11–25',
    xp: 600, gold: 240, fragmentChance: 25,
    colorClass: 'text-yellow-400',
    bg: 'bg-yellow-500/10 border-yellow-500/30',
    btnClass: 'bg-yellow-600 hover:bg-yellow-700',
    dungeonId: 'portal_yellow',
  },
  red: {
    label: 'Portal Vermelho',
    emoji: '🔴',
    difficulty: 'Difícil',
    levelRange: 'Lv. 21–35',
    xp: 1000, gold: 400, fragmentChance: 40,
    colorClass: 'text-red-400',
    bg: 'bg-red-500/10 border-red-500/30',
    btnClass: 'bg-red-600 hover:bg-red-700',
    dungeonId: 'portal_red',
  },
  legendary: {
    label: 'Portal Lendário',
    emoji: '🟣',
    difficulty: 'Lendário',
    levelRange: 'Lv. 30+',
    xp: 1800, gold: 700, fragmentChance: 65,
    colorClass: 'text-purple-400',
    bg: 'bg-purple-500/10 border-purple-500/30',
    btnClass: 'bg-purple-600 hover:bg-purple-700',
    dungeonId: 'portal_legendary',
  },
};

// ── Fragment dungeon tier metadata ────────────────────────────────────────
export const FRAGMENT_TIERS: Record<FragmentTier, {
  label: string; emoji: string; description: string;
  colorClass: string; bg: string; btnClass: string;
  floors: number; roomsPerFloor: number; recommendedLevel: string;
}> = {
  medium: {
    label: 'Dungeon Mediana', emoji: '💠',
    description: '3 andares · inimigos poderosos · até 8 jogadores',
    colorClass: 'text-sky-400',
    bg: 'bg-sky-500/10 border-sky-500/40',
    btnClass: 'bg-sky-600 hover:bg-sky-700',
    floors: 3, roomsPerFloor: 6, recommendedLevel: 'Lv. 20+',
  },
  hard: {
    label: 'Dungeon Difícil', emoji: '🔷',
    description: '4 andares · inimigos avançados · até 8 jogadores',
    colorClass: 'text-blue-400',
    bg: 'bg-blue-500/10 border-blue-500/40',
    btnClass: 'bg-blue-600 hover:bg-blue-700',
    floors: 4, roomsPerFloor: 7, recommendedLevel: 'Lv. 30+',
  },
  legendary: {
    label: 'Dungeon Lendária', emoji: '🌟',
    description: '5 andares · boss épico · até 8 jogadores',
    colorClass: 'text-purple-400',
    bg: 'bg-purple-500/10 border-purple-500/40',
    btnClass: 'bg-purple-600 hover:bg-purple-700',
    floors: 5, roomsPerFloor: 7, recommendedLevel: 'Lv. 40+',
  },
  ultra: {
    label: 'Dungeon Ultra-Lendária', emoji: '👑',
    description: '6 andares · o maior desafio do jogo · até 8 jogadores',
    colorClass: 'text-amber-400',
    bg: 'bg-amber-500/10 border-amber-500/40',
    btnClass: 'bg-amber-600 hover:bg-amber-700',
    floors: 6, roomsPerFloor: 8, recommendedLevel: 'Lv. 50+',
  },
};

export const FRAGMENT_COST = 10;

// ── Hooks ─────────────────────────────────────────────────────────────────

export function usePortalEvent() {
  return useQuery({
    queryKey: ['portal-event'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_active_portal_event');
      if (error) throw error;
      if (!data || data.length === 0) return null;
      return data[0] as PortalEvent;
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}

export function useMyFragments() {
  return useQuery({
    queryKey: ['my-fragments'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_my_fragments');
      if (error) throw error;
      if (!data || data.length === 0) return { fragments: 0, lifetime_fragments: 0 };
      return data[0] as { fragments: number; lifetime_fragments: number };
    },
    staleTime: 30_000,
  });
}

export function useCompletePortalRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      eventId: string;
      color: PortalColor;
      xpEarned: number;
      goldEarned: number;
      fragmentEarned: boolean;
    }) => {
      const { data, error } = await (supabase as any).rpc('complete_portal_run', {
        p_event_id:        params.eventId,
        p_portal_color:    params.color,
        p_xp_earned:       params.xpEarned,
        p_gold_earned:     params.goldEarned,
        p_fragment_earned: params.fragmentEarned,
      });
      if (error) throw error;
      return data as { already_claimed: boolean; fragments: number };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portal-event'] });
      queryClient.invalidateQueries({ queryKey: ['my-fragments'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['gold-balance'] });
    },
  });
}

export function usePublicFragmentDungeons() {
  return useQuery({
    queryKey: ['public-fragment-dungeons'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_public_fragment_dungeons');
      if (error) throw error;
      return (data ?? []) as PublicFragmentSession[];
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

export function useCreateFragmentDungeon() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      tier: FragmentTier;
      isPublic: boolean;
      displayName: string;
      level: number;
      atk: number;
      def: number;
      hp: number;
      maxHp: number;
      playerClass: string;
    }) => {
      const { data, error } = await (supabase as any).rpc('create_fragment_dungeon', {
        p_tier:         params.tier,
        p_is_public:    params.isPublic,
        p_display_name: params.displayName,
        p_level:        params.level,
        p_atk:          params.atk,
        p_def:          params.def,
        p_hp:           params.hp,
        p_max_hp:       params.maxHp,
        p_class:        params.playerClass,
      });
      if (error) throw error;
      return data as { session_id: string; invite_code: string; tier: string; error?: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-fragments'] });
      queryClient.invalidateQueries({ queryKey: ['public-fragment-dungeons'] });
    },
  });
}

export function useJoinFragmentDungeon() {
  return useMutation({
    mutationFn: async (params: {
      inviteCode: string;
      displayName: string;
      level: number;
      atk: number;
      def: number;
      hp: number;
      maxHp: number;
      playerClass: string;
    }) => {
      const { data, error } = await (supabase as any).rpc('join_fragment_dungeon', {
        p_invite_code:  params.inviteCode,
        p_display_name: params.displayName,
        p_level:        params.level,
        p_atk:          params.atk,
        p_def:          params.def,
        p_hp:           params.hp,
        p_max_hp:       params.maxHp,
        p_class:        params.playerClass,
      });
      if (error) throw error;
      return data as { session_id: string; invite_code: string; tier: string; error?: string };
    },
  });
}
