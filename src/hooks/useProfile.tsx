import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export function useProfile() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user!.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });
}

export function useAttributes() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['attributes', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attributes')
        .select('*')
        .eq('user_id', user!.id)
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });
}

export function useMissions(completed?: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['missions', user?.id, completed],
    queryFn: async () => {
      let query = supabase
        .from('missions')
        .select('*, attributes(name, icon)')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false });
      if (completed !== undefined) {
        query = query.eq('completed', completed);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });
}

export function useCompleteMission() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ missionId, attributeId, xpReward }: { missionId: string; attributeId: string; xpReward: number }) => {
      // Get checklist bonus
      const { data: checklistItems } = await supabase
        .from('checklist_items')
        .select('*')
        .eq('mission_id', missionId);
      
      const checklistBonus = (checklistItems || [])
        .filter((item: any) => item.completed)
        .reduce((sum: number, item: any) => sum + (item.xp_bonus || 2), 0);
      
      const totalXpReward = xpReward + checklistBonus;

      const { error: mErr } = await supabase
        .from('missions')
        .update({ completed: true, completed_at: new Date().toISOString() })
        .eq('id', missionId);
      if (mErr) throw mErr;

      const { data: attr } = await supabase
        .from('attributes')
        .select('xp, level')
        .eq('id', attributeId)
        .single();
      if (attr) {
        const newXp = attr.xp + totalXpReward;
        const newLevel = Math.floor(newXp / 100) + 1;
        await supabase.from('attributes').update({ xp: newXp, level: newLevel }).eq('id', attributeId);
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('total_xp, xp_today, missions_completed, level')
        .eq('user_id', user!.id)
        .single();
      if (profile) {
        const newTotalXp = profile.total_xp + totalXpReward;
        const newLevel = Math.floor(newTotalXp / 200) + 1;
        await supabase.from('profiles').update({
          total_xp: newTotalXp,
          xp_today: profile.xp_today + totalXpReward,
          missions_completed: profile.missions_completed + 1,
          level: newLevel,
        }).eq('user_id', user!.id);
      }

      await supabase.from('activity_log').insert({
        user_id: user!.id,
        action: 'mission_complete',
        description: `Missão concluída! +${totalXpReward} XP`,
        xp_gained: totalXpReward,
      });

      // Record in xp_history
      await supabase.from('xp_history' as any).insert({
        user_id: user!.id,
        xp_gained: totalXpReward,
        type: 'mission',
      } as any);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['missions'] });
      queryClient.invalidateQueries({ queryKey: ['attributes'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['activity'] });
      queryClient.invalidateQueries({ queryKey: ['xp_history'] });
    },
  });
}

export function useCreateMission() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ title, attributeId, dueDate, daysOfWeek, horarioProvavel, priority, description, notes }: {
      title: string; attributeId: string; dueDate?: string; daysOfWeek?: string[]; horarioProvavel?: string;
      priority?: string; description?: string; notes?: string;
    }) => {
      const { error } = await supabase.from('missions').insert({
        user_id: user!.id,
        title,
        attribute_id: attributeId,
        due_date: dueDate || null,
        days_of_week: daysOfWeek || [],
        horario_provavel: horarioProvavel || 'flex',
        priority: priority || 'media',
        description: description || null,
        notes: notes || null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['missions'] });
    },
  });
}

export function useActivityLog() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['activity', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_log')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });
}

export function useBosses() {
  return useQuery({
    queryKey: ['bosses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bosses')
        .select('*')
        .order('level');
      if (error) throw error;
      return data;
    },
  });
}

export function useBossBattles() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['boss_battles', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('boss_battles')
        .select('*, bosses(name, icon)')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });
}

export function useFightBoss() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ bossId, bossHp, xpReward }: { bossId: string; bossHp: number; xpReward: number }) => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('level, total_xp')
        .eq('user_id', user!.id)
        .single();

      const playerPower = (profile?.level || 1) * 15 + Math.floor(Math.random() * 30);
      const won = playerPower >= bossHp;
      const damage = Math.min(playerPower, bossHp);

      await supabase.from('boss_battles').insert({
        user_id: user!.id,
        boss_id: bossId,
        damage_dealt: damage,
        won,
      });

      if (won && profile) {
        const newTotalXp = profile.total_xp + xpReward;
        const newLevel = Math.floor(newTotalXp / 200) + 1;
        await supabase.from('profiles').update({
          total_xp: newTotalXp,
          level: newLevel,
        }).eq('user_id', user!.id);

        await supabase.from('activity_log').insert({
          user_id: user!.id,
          action: 'boss_defeated',
          description: `Boss derrotado! +${xpReward} XP`,
          xp_gained: xpReward,
        });

        await supabase.from('xp_history' as any).insert({
          user_id: user!.id,
          xp_gained: xpReward,
          type: 'boss',
        } as any);
      } else {
        await supabase.from('activity_log').insert({
          user_id: user!.id,
          action: 'boss_failed',
          description: `Derrota contra o boss. Dano causado: ${damage}`,
          xp_gained: 0,
        });
      }

      return { won, damage, playerPower };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boss_battles'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['activity'] });
      queryClient.invalidateQueries({ queryKey: ['xp_history'] });
    },
  });
}

// Classes
export function useClasses() {
  return useQuery({
    queryKey: ['classes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('classes')
        .select('*')
        .order('column_index')
        .order('level_min');
      if (error) throw error;
      return data;
    },
  });
}

export function useSelectClass() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (classId: string) => {
      const { error } = await supabase
        .from('profiles')
        .update({ current_class_id: classId } as any)
        .eq('user_id', user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}

// Checklist items
export function useChecklistItems(missionId: string) {
  return useQuery({
    queryKey: ['checklist', missionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('checklist_items')
        .select('*')
        .eq('mission_id', missionId)
        .order('created_at');
      if (error) throw error;
      return data;
    },
    enabled: !!missionId,
  });
}

export function useAddChecklistItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ missionId, description }: { missionId: string; description: string }) => {
      const { error } = await supabase
        .from('checklist_items')
        .insert({ mission_id: missionId, description });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['checklist', vars.missionId] });
    },
  });
}

export function useToggleChecklistItem() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId, completed, xpBonus }: { itemId: string; completed: boolean; xpBonus?: number }) => {
      const { error } = await supabase
        .from('checklist_items')
        .update({ completed })
        .eq('id', itemId);
      if (error) throw error;

      // If completing a sub-mission, record XP
      if (completed && user) {
        const bonus = xpBonus || 2;
        await supabase.from('xp_history' as any).insert({
          user_id: user.id,
          xp_gained: bonus,
          type: 'sub_mission',
        } as any);

        // Update profile xp
        const { data: profile } = await supabase
          .from('profiles')
          .select('total_xp, xp_today, level')
          .eq('user_id', user.id)
          .single();
        if (profile) {
          const newTotalXp = profile.total_xp + bonus;
          const newLevel = Math.floor(newTotalXp / 200) + 1;
          await supabase.from('profiles').update({
            total_xp: newTotalXp,
            xp_today: profile.xp_today + bonus,
            level: newLevel,
          }).eq('user_id', user.id);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checklist'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['xp_history'] });
    },
  });
}

// XP History for charts
export function useXpHistory(days: number = 7) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['xp_history', user?.id, days],
    queryFn: async () => {
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - days);
      const { data, error } = await supabase
        .from('xp_history' as any)
        .select('*')
        .eq('user_id', user!.id)
        .gte('date', fromDate.toISOString().split('T')[0])
        .order('date');
      if (error) throw error;
      return data as any[];
    },
    enabled: !!user,
  });
}
