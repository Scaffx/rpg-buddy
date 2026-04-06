import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export function useCheckFailedMissions() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user) return;
    checkAndMarkFailed(user.id, queryClient);
  }, [user]);
}

async function checkAndMarkFailed(userId: string, queryClient: any) {
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const todayDayIndex = new Date().getDay();
  const yesterdayDayName = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][
    todayDayIndex === 0 ? 6 : todayDayIndex - 1
  ];
  // Actually we need yesterday's day name
  const yd = new Date(Date.now() - 86400000);
  const ydIndex = yd.getDay();
  const ydName = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][ydIndex === 0 ? 6 : ydIndex - 1];

  // Get daily missions that weren't completed yesterday
  const { data: missions } = await supabase
    .from('missions')
    .select('*')
    .eq('user_id', userId)
    .eq('completed', false)
    .eq('is_failed', false as any);

  if (!missions || missions.length === 0) return;

  let totalPenalty = 0;

  for (const m of missions) {
    const days = (m.days_of_week as string[]) || [];
    // Only penalize daily missions (missions with specific days that included yesterday)
    if (days.length === 0) continue;
    if (!days.includes(ydName)) continue;

    // Check if mission was created on or after yesterday (if so, don't mark as failed for yesterday)
    const createdAt = (m as any).created_at?.split('T')[0];
    if (createdAt && createdAt >= yesterday) continue;

    // Check if already failed for today
    if ((m as any).failed_date === today) continue;

    const xpPenalty = m.xp_reward;
    totalPenalty += xpPenalty;

    await supabase
      .from('missions')
      .update({
        is_failed: true,
        xp_penalized: xpPenalty,
        failed_date: today,
      } as any)
      .eq('id', m.id);
  }

  if (totalPenalty > 0) {
    // Deduct XP from profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('total_xp, level')
      .eq('user_id', userId)
      .single();

    if (profile) {
      const newXp = Math.max(0, profile.total_xp - totalPenalty);
      const newLevel = Math.floor(newXp / 200) + 1;
      await supabase.from('profiles').update({
        total_xp: newXp,
        level: newLevel,
      }).eq('user_id', userId);
    }

    await supabase.from('activity_log').insert({
      user_id: userId,
      action: 'mission_failed',
      description: `Missões fracassadas! -${totalPenalty} XP`,
      xp_gained: -totalPenalty,
    });

    toast.error(`Missões fracassadas! Você perdeu ${totalPenalty} XP.`);
    queryClient.invalidateQueries({ queryKey: ['missions'] });
    queryClient.invalidateQueries({ queryKey: ['profile'] });
  }
}

export function useFailedMissions() {
  const { user } = useAuth();
  const today = new Date().toISOString().split('T')[0];
  return useQuery({
    queryKey: ['failed-missions', user?.id, today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('missions')
        .select('*')
        .eq('user_id', user!.id)
        .eq('is_failed', true as any)
        .eq('failed_date', today as any);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });
}

export function usePayPenalty() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (mission: any) => {
      if (!user) throw new Error('Não autenticado');
      const goldCost = 10;

      const { data: bal } = await supabase
        .from('user_balance')
        .select('gold')
        .eq('user_id', user.id)
        .single();

      const currentGold = (bal as any)?.gold ?? 0;
      if (currentGold < goldCost) {
        throw new Error('Ouro insuficiente! Custa 10 🪙 para pagar a penalidade.');
      }

      // Deduct gold
      await supabase
        .from('user_balance')
        .update({ gold: currentGold - goldCost, updated_at: new Date().toISOString() } as any)
        .eq('user_id', user.id);

      // Restore XP
      const xpToRestore = (mission as any).xp_penalized || mission.xp_reward;
      const { data: profile } = await supabase
        .from('profiles')
        .select('total_xp, level')
        .eq('user_id', user.id)
        .single();

      if (profile) {
        const newXp = profile.total_xp + xpToRestore;
        const newLevel = Math.floor(newXp / 200) + 1;
        await supabase.from('profiles').update({
          total_xp: newXp,
          level: newLevel,
        }).eq('user_id', user.id);
      }

      // Clear failed status
      await supabase
        .from('missions')
        .update({ is_failed: false, xp_penalized: 0, failed_date: null } as any)
        .eq('id', mission.id);

      // Log
      await supabase.from('gold_history' as any).insert({
        user_id: user.id,
        type: 'penalidade',
        amount: -goldCost,
        reason: `Pagou penalidade: ${mission.title}`,
      } as any);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['failed-missions'] });
      queryClient.invalidateQueries({ queryKey: ['gold-balance'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['missions'] });
    },
  });
}

export function useAcceptPenalty() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (mission: any) => {
      if (!user) throw new Error('Não autenticado');

      // Just clear failed status without restoring XP (accept the loss)
      await supabase
        .from('missions')
        .update({ is_failed: false, failed_date: null } as any)
        .eq('id', mission.id);

      // Log acknowledgment
      await supabase.from('activity_log').insert({
        user_id: user.id,
        action: 'mission_penalty_accepted',
        description: `Aceitou penalidade de ${mission.xp_penalized || mission.xp_reward} XP: ${mission.title}`,
        xp_gained: -(mission.xp_penalized || mission.xp_reward),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['failed-missions'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['missions'] });
    },
  });
}
