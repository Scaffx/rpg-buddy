import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

const DAYS_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

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

  // Check up to 30 days back for unchecked failures
  const { data: missions } = await supabase
    .from('missions')
    .select('*')
    .eq('user_id', userId)
    .eq('completed', false)
    .eq('is_failed', false as any);

  if (!missions || missions.length === 0) return;

  let totalPenalty = 0;
  const failedList: any[] = [];

  for (let daysBack = 1; daysBack <= 30; daysBack++) {
    const pastDate = new Date(Date.now() - daysBack * 86400000);
    const pastDateStr = pastDate.toISOString().split('T')[0];
    const pastDayIndex = pastDate.getDay();
    const pastDayName = DAYS_NAMES[pastDayIndex];

    for (const m of missions) {
      const days = (m.days_of_week as string[]) || [];
      if (days.length === 0) continue;
      if (!days.includes(pastDayName)) continue;

      // Don't penalize if mission was created after this date
      const createdAt = (m as any).created_at?.split('T')[0];
      if (createdAt && createdAt > pastDateStr) continue;

      // Check if already has a failure record for this date
      if ((m as any).failed_date === pastDateStr) continue;

      // Check daily_status for completion on that date
      const dailyStatus = (m as any).daily_status || {};
      if (dailyStatus[pastDateStr] === 'completed') continue;

      // Check mission_daily_completions
      const { data: completions } = await supabase
        .from('mission_daily_completions')
        .select('id')
        .eq('mission_id', m.id)
        .eq('completion_date', pastDateStr)
        .limit(1);

      if (completions && completions.length > 0) continue;

      // This mission failed on this date - mark it
      const xpPenalty = m.xp_reward;
      totalPenalty += xpPenalty;

      await supabase
        .from('missions')
        .update({
          is_failed: true,
          xp_penalized: xpPenalty,
          failed_date: pastDateStr,
        } as any)
        .eq('id', m.id);

      failedList.push({ ...m, failed_date: pastDateStr });
      break; // One failure per mission at a time
    }
  }

  if (totalPenalty > 0) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('total_xp, level')
      .eq('user_id', userId)
      .single();

    if (profile) {
      const newXp = Math.max(0, profile.total_xp - totalPenalty);
      const calculatedLevel = Math.floor(newXp / 200) + 1;
      const newLevel = Math.max(calculatedLevel, profile.level);
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
    queryClient.invalidateQueries({ queryKey: ['failed-missions'] });
  }
}

export function useFailedMissions() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['failed-missions', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('missions')
        .select('*')
        .eq('user_id', user!.id)
        .eq('is_failed', true as any)
        .order('failed_date' as any, { ascending: true });
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

      await supabase
        .from('user_balance')
        .update({ gold: currentGold - goldCost, updated_at: new Date().toISOString() } as any)
        .eq('user_id', user.id);

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

      await supabase
        .from('missions')
        .update({ is_failed: false, xp_penalized: 0, failed_date: null } as any)
        .eq('id', mission.id);

      await supabase.from('gold_history').insert({
        user_id: user.id,
        type: 'penalidade',
        amount: -goldCost,
        reason: `Pagou penalidade: ${mission.title}`,
      });
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
    mutationFn: async (missions: any | any[]) => {
      if (!user) throw new Error('Não autenticado');
      
      const missionList = Array.isArray(missions) ? missions : [missions];
      
      for (const mission of missionList) {
        await supabase
          .from('missions')
          .update({ is_failed: false, failed_date: null } as any)
          .eq('id', mission.id);

        await supabase.from('activity_log').insert({
          user_id: user.id,
          action: 'mission_penalty_accepted',
          description: `Aceitou penalidade de ${mission.xp_penalized || mission.xp_reward} XP: ${mission.title} (${mission.failed_date || 'hoje'})`,
          xp_gained: -(mission.xp_penalized || mission.xp_reward),
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['failed-missions'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['missions'] });
    },
  });
}

export function useWelcomeBackCheck() {
  const { user } = useAuth();
  const [showWelcomeBack, setShowWelcomeBack] = useState(false);
  const [daysAway, setDaysAway] = useState(0);

  useEffect(() => {
    if (!user) return;
    checkLastActivity(user.id);
  }, [user]);

  async function checkLastActivity(userId: string) {
    const { data } = await supabase
      .from('activity_log')
      .select('created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (data && data.length > 0) {
      const lastActivity = new Date(data[0].created_at);
      const now = new Date();
      const diffDays = Math.floor((now.getTime() - lastActivity.getTime()) / 86400000);
      
      if (diffDays >= 2) {
        const sessionKey = `welcome_back_${userId}_${now.toISOString().split('T')[0]}`;
        if (!sessionStorage.getItem(sessionKey)) {
          setDaysAway(diffDays);
          setShowWelcomeBack(true);
          sessionStorage.setItem(sessionKey, 'shown');
        }
      }
    }
  }

  return { showWelcomeBack, setShowWelcomeBack, daysAway };
}
