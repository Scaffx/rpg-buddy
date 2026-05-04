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
  condition_type: string;
  condition_value: number;
};

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
            description: `Vá em Conquistas para resgatar +${a.xp_reward} XP e +${a.gold_reward} ouro!`,
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

      const ach = userAchievement.achievement;

      // Concede XP via RPC (com verificação de erro)
      if (ach.xp_reward > 0) {
        const { error: xpErr } = await (supabase.rpc as any)('add_xp_to_user', {
          p_user_id: user.id,
          p_xp: ach.xp_reward,
        });
        if (xpErr) {
          // Fallback: atualiza diretamente no perfil
          const { data: prof } = await supabase
            .from('profiles' as never)
            .select('total_xp, level' as never)
            .eq('user_id' as never, user.id as never)
            .single();
          if (prof) {
            const newXp = ((prof as any).total_xp || 0) + ach.xp_reward;
            const newLevel = Math.max((prof as any).level || 1, Math.floor(newXp / 200) + 1);
            const { error: upErr } = await supabase
              .from('profiles' as never)
              .update({ total_xp: newXp, level: newLevel } as never)
              .eq('user_id' as never, user.id as never);
            if (upErr) throw upErr;
          }
        }
      }

      // Concede ouro via RPC (com verificação de erro)
      if (ach.gold_reward > 0) {
        const { error: goldErr } = await (supabase.rpc as any)('add_gold_to_user', {
          p_user_id: user.id,
          p_gold: ach.gold_reward,
        });
        if (goldErr) {
          // Fallback: atualiza diretamente no saldo
          const { data: bal } = await supabase
            .from('user_balance' as never)
            .select('gold' as never)
            .eq('user_id' as never, user.id as never)
            .maybeSingle();
          if (bal) {
            const { error: upErr } = await supabase
              .from('user_balance' as never)
              .update({ gold: ((bal as any).gold || 0) + ach.gold_reward, updated_at: new Date().toISOString() } as never)
              .eq('user_id' as never, user.id as never);
            if (upErr) throw upErr;
          }
        }
      }

      // Marca como resgatada
      const { error } = await supabase
        .from('user_achievements' as any)
        .update({ claimed_at: new Date().toISOString() } as any)
        .eq('id', userAchievement.id);
      if (error) throw error;

      return ach;
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
      toast.success(`🎁 Recompensa resgatada!`, {
        description: `+${ach.xp_reward} XP  +${ach.gold_reward} 🪙`,
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
