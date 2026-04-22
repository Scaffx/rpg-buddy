import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type Achievement = {
  id: string;
  slug: string;
  title: string;
  description: string;
  icon: string;
  xp_reward: number;
  gold_reward: number;
  condition_type: string;
  condition_value: number;
};

export type UserAchievement = {
  id: string;
  user_id: string;
  achievement_id: string;
  unlocked_at: string;
  achievement: Achievement;
};

/** Lista todas as conquistas do jogo. */
export function useAllAchievements() {
  return useQuery<Achievement[]>({
    queryKey: ['achievements_all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('achievements' as any)
        .select('*')
        .order('condition_type');
      if (error) throw error;
      return ((data || []) as unknown) as Achievement[];
    },
    staleTime: 5 * 60_000,
  });
}

/** Conquistas desbloqueadas pelo usuário atual. */
export function useUserAchievements() {
  const { user } = useAuth();
  return useQuery<UserAchievement[]>({
    queryKey: ['user_achievements', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_achievements' as any)
        .select('*, achievement:achievements(*)')
        .eq('user_id', user!.id)
        .order('unlocked_at', { ascending: false });
      if (error) throw error;
      return ((data || []) as unknown) as UserAchievement[];
    },
    staleTime: 30_000,
  });
}

/**
 * Tenta desbloquear conquistas com base nos dados atuais do usuário.
 * Deve ser chamado após events importantes (completar missão, subir nível, etc.)
 */
export function useCheckAchievements() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (context: {
      missionsTotal?: number;
      missionsStreak?: number;
      bossKills?: number;
      level?: number;
      journalEntries?: number;
      friendsTotal?: number;
      loadoutSize?: number;
    }) => {
      if (!user) return [];

      const { data: allAchievements } = await supabase
        .from('achievements' as any)
        .select('*');

      const { data: alreadyUnlocked } = await supabase
        .from('user_achievements' as any)
        .select('achievement_id')
        .eq('user_id', user.id);

      const unlockedIds = new Set((alreadyUnlocked || []).map((a: any) => a.achievement_id));

      const conditionMap: Record<string, number | undefined> = {
        missions_total:  context.missionsTotal,
        missions_streak: context.missionsStreak,
        boss_kills:      context.bossKills,
        level_reached:   context.level,
        journal_entries: context.journalEntries,
        friends_total:   context.friendsTotal,
        loadout_full:    context.loadoutSize,
      };

      const toUnlock = ((allAchievements || []).filter((a: any) => {
        if (unlockedIds.has(a.id)) return false;
        const current = conditionMap[a.condition_type];
        return current !== undefined && current >= a.condition_value;
      }) as unknown) as Achievement[];

      if (toUnlock.length === 0) return [];

      await supabase.from('user_achievements' as any).insert(
        toUnlock.map((a) => ({ user_id: user.id, achievement_id: a.id } as any)),
      );

      return toUnlock;
    },
    onSuccess: (unlocked) => {
      if (unlocked.length > 0) {
        qc.invalidateQueries({ queryKey: ['user_achievements', user?.id] });
      }
    },
  });
}
