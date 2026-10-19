import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
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
  /**
   * Fragmentos de portal. Conquista que NÃO exige rotina cumprida paga por
   * aqui, com xp_reward e gold_reward zerados — combate, social e equipamento
   * são ralos e não podem alimentar a torneira.
   */
  fragment_reward: number;
  condition_type: string;
  condition_value: number;
};

/** Monta "+30 XP e +20 🪙" ou "+2 fragmentos de portal", omitindo o que vale zero. */
export function formatAchievementReward(a: {
  xp_reward?: number;
  gold_reward?: number;
  fragment_reward?: number;
}): string {
  const partes: string[] = [];
  if ((a.xp_reward ?? 0) > 0) partes.push(`+${a.xp_reward} XP`);
  if ((a.gold_reward ?? 0) > 0) partes.push(`+${a.gold_reward} 🪙`);
  if ((a.fragment_reward ?? 0) > 0) {
    partes.push(
      `+${a.fragment_reward} fragmento${a.fragment_reward > 1 ? 's' : ''} de portal`,
    );
  }
  return partes.join(' e ');
}

export type UserAchievement = {
  id: string;
  user_id: string;
  achievement_id: string;
  unlocked_at: string;
  claimed_at: string | null;
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
 * Verifica e desbloqueia conquistas automaticamente, buscando todos os dados
 * necessários do banco. Concede XP e ouro das conquistas desbloqueadas.
 */
export function useCheckAchievements() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!user) return [];

      const [
        { data: allAchievements },
        { data: alreadyUnlocked },
        { data: profileData },
        { count: journalCount },
        { count: bossKillCount },
        { count: friendsCount },
      ] = await Promise.all([
        supabase.from('achievements' as any).select('*'),
        supabase.from('user_achievements' as any).select('achievement_id').eq('user_id', user.id),
        supabase.from('profiles').select('missions_completed, level, current_streak, combat_skill_loadout').eq('user_id', user.id).single(),
        supabase.from('adventure_journal' as any).select('*', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('boss_battles' as any).select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('won', true),
        supabase.from('friend_requests' as any).select('*', { count: 'exact', head: true }).eq('status', 'accepted').or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`),
      ]);

      const unlockedIds = new Set((alreadyUnlocked || []).map((a: any) => a.achievement_id));
      const profile = profileData as any;
      const loadout = Array.isArray(profile?.combat_skill_loadout) ? profile.combat_skill_loadout : [];

      const conditionMap: Record<string, number> = {
        missions_total:  Number(profile?.missions_completed ?? 0),
        missions_streak: Number(profile?.current_streak ?? 0),
        boss_kills:      Number(bossKillCount ?? 0),
        level_reached:   Number(profile?.level ?? 1),
        journal_entries: Number(journalCount ?? 0),
        friends_total:   Number(friendsCount ?? 0),
        loadout_full:    loadout.length,
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
        unlocked.forEach((a) => {
          toast.success(`🏆 Conquista desbloqueada: ${a.title}!`, {
            description: `Vá em Conquistas para resgatar ${formatAchievementReward(a)}!`,
            duration: 6000,
          });
        });
      }
    },
  });
}

/** Resgata a recompensa de uma conquista desbloqueada (XP + ouro). */
export function useClaimAchievement() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (userAchievement: UserAchievement) => {
      if (!user) throw new Error('Não autenticado');
      if (userAchievement.claimed_at) throw new Error('Conquista já resgatada');

      // RPC atômica: lock da linha + verificação claimed_at + grant XP/ouro
      // Previne double-claim por race condition ou cache stale
      const { data, error } = await supabase.rpc('claim_achievement', {
        p_user_achievement_id: userAchievement.id,
      });
      if (error) throw new Error(error.message || 'Erro ao resgatar');

      // §2.5: o front é espelho, não fonte. Quem diz o que foi creditado é o
      // retorno da RPC — a linha em cache pode ser anterior à migration que
      // trocou XP/ouro por fragmento e faria o toast anunciar o que não caiu.
      const creditado = Array.isArray(data) ? data[0] : data;
      return creditado ?? userAchievement.achievement;
    },
    onMutate: async (userAchievement) => {
      // Optimistic update: marca como resgatada imediatamente na cache
      await qc.cancelQueries({ queryKey: ['user_achievements', user?.id] });
      const previous = qc.getQueryData(['user_achievements', user?.id]);
      qc.setQueryData(['user_achievements', user?.id], (old: any) => {
        if (!Array.isArray(old)) return old;
        return old.map((ua: UserAchievement) =>
          ua.id === userAchievement.id
            ? { ...ua, claimed_at: new Date().toISOString() }
            : ua,
        );
      });
      return { previous };
    },
    onError: (err: any, _vars, context: any) => {
      // Reverte optimistic update em caso de erro
      if (context?.previous) {
        qc.setQueryData(['user_achievements', user?.id], context.previous);
      }
      toast.error(err.message || 'Erro ao resgatar conquista.');
    },
    onSuccess: (ach) => {
      qc.invalidateQueries({ queryKey: ['user_achievements', user?.id] });
      qc.invalidateQueries({ queryKey: ['profile', user?.id] });
      qc.invalidateQueries({ queryKey: ['gold-balance', user?.id] });
      qc.invalidateQueries({ queryKey: ['my-fragments'] });
      toast.success(`🎁 Recompensa resgatada!`, {
        description: formatAchievementReward(ach),
        duration: 5000,
      });
    },
  });
}

/**
 * Verifica conquistas automaticamente ao montar e a cada 5 minutos.
 * Coloque este hook em AppLayout para cobertura global.
 */
export function useAutoCheckAchievements() {
  const checkAchievements = useCheckAchievements();

  useEffect(() => {
    checkAchievements.mutate();
    const interval = setInterval(() => checkAchievements.mutate(), 5 * 60_000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
