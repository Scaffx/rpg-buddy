import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { deriveMissionCategory } from '@/lib/missionTalentRules';
import {
  getSaoPauloDateString,
  getSaoPauloWeekStart,
  isWeeklyMission,
} from '@/lib/weeklyMissions';

export const useMissions = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['missions', user?.id],
    queryFn: async () => {
      const weekStart = getSaoPauloWeekStart();
      const [missionsResult, progressResult] = await Promise.all([
        supabase
          .from('missions')
          .select('*')
          .eq('user_id', user!.id),
        supabase
          .from('mission_weekly_progress')
          .select('mission_id,current_count,last_completed_date,milestone_paid,week_start')
          .eq('user_id', user!.id)
          .eq('week_start', weekStart),
      ]);

      if (missionsResult.error) throw missionsResult.error;
      if (progressResult.error) throw progressResult.error;

      const progressByMission = new Map(
        (progressResult.data || []).map((progress) => [progress.mission_id, progress]),
      );

      return (missionsResult.data || []).map((mission) => {
        const progress = progressByMission.get(mission.id);
        return {
          ...mission,
          weekly_current_count: progress?.current_count ?? 0,
          weekly_last_completed_date: progress?.last_completed_date ?? null,
          weekly_milestone_paid: progress?.milestone_paid ?? false,
          weekly_week_start: progress?.week_start ?? weekStart,
        };
      }) as any[];
    },
    enabled: !!user,
  });
};

// Ao completar missão, use type casting:
export const useCompleteMission = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      missionId, 
      attributeId, 
      xpReward, 
      secondaryAttributeIds = [] 
    }: {
      missionId: string; 
      attributeId: string; 
      xpReward: number; 
      secondaryAttributeIds?: string[];
    }) => {
      // 🔒 Economia server-side: toda a lógica de recompensa (XP escalado,
      // ouro por streak/checklist/talento, level, chaves de boss, efeitos de
      // talento, inspiração) roda no RPC transacional `complete_mission`.
      // O RPC recebe somente mission_id — o servidor resolve data, hora,
      // contadores e multiplicadores, então
      // não é possível forjar XP/ouro/level pelo navegador.
      const { data, error } = await supabase.rpc('complete_mission', {
        p_mission_id: missionId,
      });
      if (error) throw error;

      const result = (data || {}) as {
        inspired_granted?: boolean;
        streak_days?: number;
        streak_multiplier?: number;
        xp_gained?: number;
        gold_gained?: number;
        gained_keys?: number;
        frequency_type?: 'daily' | 'weekly';
        weekly_count?: number;
        weekly_target?: number;
        weekly_max?: number;
        is_overflow?: boolean;
        milestone_reached?: boolean;
        execution_xp?: number;
        milestone_xp?: number;
      };
      return {
        success: true,
        inspiredGranted: !!result.inspired_granted,
        streakDays: result.streak_days ?? 0,
        streakMultiplier: result.streak_multiplier ?? 1,
        xpGained: result.xp_gained ?? 0,
        goldGained: result.gold_gained ?? 0,
        gainedKeys: result.gained_keys ?? 0,
        frequencyType: result.frequency_type ?? 'daily',
        weeklyCount: result.weekly_count ?? 0,
        weeklyTarget: result.weekly_target ?? 0,
        weeklyMax: result.weekly_max ?? 0,
        isOverflow: !!result.is_overflow,
        milestoneReached: !!result.milestone_reached,
        executionXp: result.execution_xp ?? result.xp_gained ?? 0,
        milestoneXp: result.milestone_xp ?? 0,
      };
    },

    // ⚡ OPTIMISTIC UPDATE: marca a missão como concluída na UI antes do servidor responder.
    onMutate: async ({ missionId, attributeId, xpReward, secondaryAttributeIds = [] }) => {
      const today = getSaoPauloDateString();
      await queryClient.cancelQueries({ queryKey: ['missions'] });

      const previousMissions = queryClient.getQueriesData({ queryKey: ['missions'] });
      const previousProfile = queryClient.getQueryData(['profile', user?.id]);
      const previousAttributes = queryClient.getQueryData(['attributes', user?.id]);
      const previousGold = queryClient.getQueryData(['gold-balance', user?.id]);

      // Atualiza otimisticamente as missões (marca daily_status do dia)
      queryClient.setQueriesData({ queryKey: ['missions'] }, (old: any) => {
        if (!Array.isArray(old)) return old;
        return old.map((m: any) => {
          if (m.id !== missionId) return m;
          if (isWeeklyMission(m)) {
            return {
              ...m,
              weekly_current_count: Number(m.weekly_current_count || 0) + 1,
              weekly_last_completed_date: today,
            };
          }
          const days: string[] = m.days_of_week || [];
          if (days.length > 0) {
            return { ...m, daily_status: { ...(m.daily_status || {}), [today]: 'completed' } };
          }
          return { ...m, completed: true, completed_at: new Date().toISOString() };
        });
      });

      // Atualiza otimisticamente o XP do perfil (estimativa)
      queryClient.setQueryData(['profile', user?.id], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          total_xp: (old.total_xp || 0) + xpReward,
          xp_today: (old.xp_today || 0) + xpReward,
          missions_completed: (old.missions_completed || 0) + 1,
        };
      });

      // Atualiza otimisticamente os atributos
      queryClient.setQueryData(['attributes', user?.id], (old: any) => {
        if (!Array.isArray(old)) return old;
        return old.map((a: any) => {
          if (a.id === attributeId) return { ...a, xp: (a.xp || 0) + xpReward };
          if (secondaryAttributeIds.includes(a.id)) return { ...a, xp: (a.xp || 0) + 12 };
          return a;
        });
      });

      // Atualiza otimisticamente o ouro (estimativa: +2)
      queryClient.setQueryData(['gold-balance', user?.id], (old: any) => {
        if (!old) return old;
        return { ...old, gold: (old.gold || 0) + 2 };
      });

      return { previousMissions, previousProfile, previousAttributes, previousGold };
    },

    // ✅ Reconcilia XP/ouro/XP-hoje/chaves com os valores EXATOS calculados pelo
    // servidor assim que o RPC responde — sem esperar o refetch. Isso elimina a
    // "demora pra contabilizar" e o salto de valor (estimativa → real).
    onSuccess: (data: any, _vars, context: any) => {
      const prevProfile = context?.previousProfile as any;
      if (prevProfile) {
        queryClient.setQueryData(['profile', user?.id], {
          ...prevProfile,
          total_xp: (prevProfile.total_xp || 0) + (data?.xpGained || 0),
          xp_today: (prevProfile.xp_today || 0) + (data?.xpGained || 0),
          missions_completed: (prevProfile.missions_completed || 0) + 1,
          boss_keys: (prevProfile.boss_keys || 0) + (data?.gainedKeys || 0),
        });
      }
      const prevGold = context?.previousGold as any;
      if (prevGold) {
        queryClient.setQueryData(['gold-balance', user?.id], {
          ...prevGold,
          gold: (prevGold.gold || 0) + (data?.goldGained || 0),
        });
      }
      // O card "XP hoje" usa a query própria useTodayXp (['xp_today']).
      queryClient.setQueryData(['xp_today', user?.id], (old: any) =>
        Number(old || 0) + (data?.xpGained || 0));

      if (data?.frequencyType === 'weekly') {
        queryClient.setQueriesData({ queryKey: ['missions'] }, (old: any) => {
          if (!Array.isArray(old)) return old;
          return old.map((mission: any) =>
            mission.id === _vars.missionId
              ? {
                  ...mission,
                  weekly_current_count: data.weeklyCount,
                  weekly_last_completed_date: getSaoPauloDateString(),
                  weekly_milestone_paid:
                    mission.weekly_milestone_paid || data.milestoneReached,
                }
              : mission,
          );
        });
      }
    },

    onError: (_err, _vars, context: any) => {
      // Reverte em caso de erro
      if (context?.previousMissions) {
        context.previousMissions.forEach(([key, value]: [any, any]) => {
          queryClient.setQueryData(key, value);
        });
      }
      if (context?.previousProfile) queryClient.setQueryData(['profile', user?.id], context.previousProfile);
      if (context?.previousAttributes) queryClient.setQueryData(['attributes', user?.id], context.previousAttributes);
      if (context?.previousGold) queryClient.setQueryData(['gold-balance', user?.id], context.previousGold);
    },

    onSettled: () => {
      // Re-sincroniza com o servidor após sucesso ou erro
      queryClient.invalidateQueries({ queryKey: ['missions'] });
      queryClient.invalidateQueries({ queryKey: ['attributes'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['activity'] });
      queryClient.invalidateQueries({ queryKey: ['xp_today'] });
      queryClient.invalidateQueries({ queryKey: ['xp_history'] });
      queryClient.invalidateQueries({ queryKey: ['missions_today_count'] });
      queryClient.invalidateQueries({ queryKey: ['rank_position'] });
      queryClient.invalidateQueries({ queryKey: ['gold-balance'] });
    },
  });
};

export function useCreateMission() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      title,
      attributeId,
      dueDate,
      daysOfWeek,
      horarioProvavel,
      priority,
      description,
      notes,
      secondaryAttributeIds,
      anchor,
      isAnchor,
      frequencyType,
      targetCount,
      maxCount,
    }: {
      title: string;
      attributeId: string;
      dueDate?: string;
      daysOfWeek?: string[];
      horarioProvavel?: string;
      priority?: string;
      description?: string;
      notes?: string;
      secondaryAttributeIds?: string[];
      anchor?: string;
      /** Missão-âncora (hábito vital): destrava Dia Perfeito + bônus diário. */
      isAnchor?: boolean;
      frequencyType?: 'daily' | 'weekly';
      targetCount?: number;
      maxCount?: number;
    }) => {
      const { data: primaryAttrMeta } = await supabase
        .from('attributes')
        .select('name')
        .eq('id', attributeId)
        .maybeSingle();

      const missionCategory = deriveMissionCategory({
        mission: { title, description },
        primaryAttributeName: String((primaryAttrMeta as any)?.name || ''),
      });

      const missionPayload = {
        user_id: user!.id,
        title,
        attribute_id: attributeId,
        mission_category: missionCategory,
        due_date: dueDate || null,
        days_of_week: daysOfWeek || [],
        horario_provavel: horarioProvavel || "flex",
        priority: priority || "media",
        description: description || null,
        notes: notes || null,
        secondary_attribute_ids: secondaryAttributeIds || [],
        anchor: anchor || null,
        is_anchor: Boolean(isAnchor),
        frequency_type: frequencyType || 'daily',
        target_count: frequencyType === 'weekly' ? targetCount : null,
        max_count: frequencyType === 'weekly' ? (maxCount || 7) : null,
      } as any;

      const { error } = await supabase.from("missions").insert(missionPayload);

      if (error) {
        const maybeMissingCategoryColumn = String(error.message || '').toLowerCase().includes('mission_category');
        if (!maybeMissingCategoryColumn) throw error;

        const { mission_category, ...fallbackPayload } = missionPayload;
        const { error: fallbackError } = await supabase.from('missions').insert(fallbackPayload as any);
        if (fallbackError) throw fallbackError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["missions"] });
    },
  });
}
