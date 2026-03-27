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
        const newXp = attr.xp + xpReward;
        const newLevel = Math.floor(newXp / 100) + 1;
        await supabase.from('attributes').update({ xp: newXp, level: newLevel }).eq('id', attributeId);
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('total_xp, xp_today, missions_completed, level')
        .eq('user_id', user!.id)
        .single();
      if (profile) {
        const newTotalXp = profile.total_xp + xpReward;
        const newLevel = Math.floor(newTotalXp / 200) + 1;
        await supabase.from('profiles').update({
          total_xp: newTotalXp,
          xp_today: profile.xp_today + xpReward,
          missions_completed: profile.missions_completed + 1,
          level: newLevel,
        }).eq('user_id', user!.id);
      }

      await supabase.from('activity_log').insert({
        user_id: user!.id,
        action: 'mission_complete',
        description: `Missão concluída! +${xpReward} XP`,
        xp_gained: xpReward,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['missions'] });
      queryClient.invalidateQueries({ queryKey: ['attributes'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['activity'] });
    },
  });
}

export function useCreateMission() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ title, attributeId, dueDate, daysOfWeek, horarioProvavel }: {
      title: string; attributeId: string; dueDate?: string; daysOfWeek?: string[]; horarioProvavel?: string;
    }) => {
      const { error } = await supabase.from('missions').insert({
        user_id: user!.id,
        title,
        attribute_id: attributeId,
        due_date: dueDate || null,
        days_of_week: daysOfWeek || [],
        horario_provavel: horarioProvavel || 'flex',
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
    },
  });
}

// Classes
export function useClasses() {
  return useQuery({
    queryKey: ['classes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('classes' as any)
        .select('*')
        .order('column_index')
        .order('level_min');
      if (error) throw error;
      return data as any[];
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
        .from('checklist_items' as any)
        .select('*')
        .eq('mission_id', missionId)
        .order('created_at');
      if (error) throw error;
      return data as any[];
    },
    enabled: !!missionId,
  });
}

export function useAddChecklistItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ missionId, description }: { missionId: string; description: string }) => {
      const { error } = await supabase
        .from('checklist_items' as any)
        .insert({ mission_id: missionId, description } as any);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['checklist', vars.missionId] });
    },
  });
}

export function useToggleChecklistItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId, completed }: { itemId: string; completed: boolean }) => {
      const { error } = await supabase
        .from('checklist_items' as any)
        .update({ completed } as any)
        .eq('id', itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checklist'] });
    },
  });
}
