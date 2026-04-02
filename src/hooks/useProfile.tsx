import { Database } from '@/types/supabase';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export function useProfile() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("user_id", user!.id).single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });
}

export function useAttributes() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["attributes", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("attributes").select("*").eq("user_id", user!.id).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });
}

export const useMissions = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['missions', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('missions')
        .select('*')
        .eq('user_id', user!.id);

      if (error) throw error;

      return (data || []) as any[];
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
      const today = new Date().toISOString().split('T')[0];

      // Buscar missão
      const { data: mission, error: missionError } = await supabase
        .from('missions')
        .select('*')
        .eq('id', missionId)
        .single();

      if (missionError) throw missionError;

      const typedMission = mission as any;

      // Verificar se é diária
      const daysOfWeek = (typedMission.days_of_week as string[]) || [];
      
      if (daysOfWeek && Array.isArray(daysOfWeek) && daysOfWeek.length > 0) {
        // ✅ MISSÃO DIÁRIA
        const dailyStatus = (typedMission.daily_status as { [key: string]: string }) || {};
        dailyStatus[today] = 'completed';

        const { error: updateError } = await supabase
          .from('missions')
          .update({ 
            daily_status: dailyStatus
          } as any)
          .eq('id', missionId);

        if (updateError) throw updateError;

        // Registrar conclusão diária
        const { error: insertError } = await supabase
          .from('mission_daily_completions' as any)
          .insert({
            mission_id: missionId,
            completion_date: today,
            xp_earned: xpReward,
            gold_earned: 2,
          } as any);

        if (insertError) throw insertError;
      } else {
        // ✅ MISSÃO ÚNICA
        const { error: updateError } = await supabase
          .from('missions')
          .update({ 
            completed: true, 
            completed_at: new Date().toISOString() 
          })
          .eq('id', missionId);

        if (updateError) throw updateError;
      }

      // ... resto do código (XP, Ouro, etc.)
      
      // Calcular bônus do checklist
      const { data: checklistItems } = await supabase
        .from('checklist_items')
        .select('*')
        .eq('mission_id', missionId);

      const checklistBonus = (checklistItems || [])
        .filter((item: any) => item.completed)
        .reduce((sum: number, item: any) => sum + (item.xp_bonus || 2), 0);

      const totalXpReward = xpReward + checklistBonus;

      // Atualizar atributo primário
      const { data: attr } = await supabase
        .from('attributes')
        .select('xp, level')
        .eq('id', attributeId)
        .single();

      if (attr) {
        const newXp = attr.xp + totalXpReward;
        const newLevel = Math.floor(newXp / 100) + 1;

        await supabase
          .from('attributes')
          .update({ xp: newXp, level: newLevel })
          .eq('id', attributeId);
      }

      // Atualizar atributos secundários
      for (const secId of secondaryAttributeIds) {
        const { data: secAttr } = await supabase
          .from('attributes')
          .select('xp, level')
          .eq('id', secId)
          .single();

        if (secAttr) {
          const newXp = secAttr.xp + 1;
          const newLevel = Math.floor(newXp / 100) + 1;

          await supabase
            .from('attributes')
            .update({ xp: newXp, level: newLevel })
            .eq('id', secId);
        }
      }

      // Atualizar perfil
      const { data: profile } = await supabase
        .from('profiles')
        .select('total_xp, xp_today, missions_completed, level')
        .eq('user_id', user!.id)
        .single();

      if (profile) {
        const newTotalXp = profile.total_xp + totalXpReward;
        const newLevel = Math.floor(newTotalXp / 200) + 1;

        await supabase
          .from('profiles')
          .update({
            total_xp: newTotalXp,
            xp_today: profile.xp_today + totalXpReward,
            missions_completed: profile.missions_completed + 1,
            level: newLevel,
          })
          .eq('user_id', user!.id);
      }

      // Registrar atividade
      await supabase
        .from('activity_log')
        .insert({
          user_id: user!.id,
          action: 'mission_complete',
          description: `Missão concluída! +${totalXpReward} XP`,
          xp_gained: totalXpReward,
        });

      // Adicionar ouro
      const { data: bal } = await supabase
        .from('user_balance')
        .select('gold')
        .eq('user_id', user!.id)
        .maybeSingle();

      if (bal) {
        const currentGold = (bal as any).gold ?? 100;

        await supabase
          .from('user_balance')
          .update({ 
            gold: currentGold + 2, 
            updated_at: new Date().toISOString() 
          } as any)
          .eq('user_id', user!.id);
      } else {
        await supabase
          .from('user_balance')
          .insert({ 
            user_id: user!.id, 
            balance_percent: 100, 
            gold: 102 
          } as any);
      }

      return { success: true };
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['missions'] });
      queryClient.invalidateQueries({ queryKey: ['attributes'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['activity'] });
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
    }) => {
      const { error } = await supabase.from("missions").insert({
        user_id: user!.id,
        title,
        attribute_id: attributeId,
        due_date: dueDate || null,
        days_of_week: daysOfWeek || [],
        horario_provavel: horarioProvavel || "flex",
        priority: priority || "media",
        description: description || null,
        notes: notes || null,
        secondary_attribute_ids: secondaryAttributeIds || [],
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["missions"] });
    },
  });
}

export function useActivityLog() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["activity", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activity_log")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });
}

export function useBosses() {
  return useQuery({
    queryKey: ["bosses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("bosses").select("*").order("level");
      if (error) throw error;
      return data;
    },
  });
}

export function useBossBattles() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["boss_battles", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("boss_battles")
        .select("*, bosses(name, icon)")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
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
        .from("profiles")
        .select("level, total_xp")
        .eq("user_id", user!.id)
        .single();

      const playerPower = (profile?.level || 1) * 15 + Math.floor(Math.random() * 30);
      const won = playerPower >= bossHp;
      const damage = Math.min(playerPower, bossHp);

      await supabase.from("boss_battles").insert({
        user_id: user!.id,
        boss_id: bossId,
        damage_dealt: damage,
        won,
      });

      if (won && profile) {
        const newTotalXp = profile.total_xp + xpReward;
        const newLevel = Math.floor(newTotalXp / 200) + 1;
        await supabase
          .from("profiles")
          .update({
            total_xp: newTotalXp,
            level: newLevel,
          })
          .eq("user_id", user!.id);

        await supabase.from("activity_log").insert({
          user_id: user!.id,
          action: "boss_defeated",
          description: `Boss derrotado! +${xpReward} XP`,
          xp_gained: xpReward,
        });

        await supabase.from("xp_history" as any).insert({
          user_id: user!.id,
          xp_gained: xpReward,
          type: "boss",
        } as any);
      } else {
        await supabase.from("activity_log").insert({
          user_id: user!.id,
          action: "boss_failed",
          description: `Derrota contra o boss. Dano causado: ${damage}`,
          xp_gained: 0,
        });
      }

      return { won, damage, playerPower };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["boss_battles"] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["activity"] });
      queryClient.invalidateQueries({ queryKey: ["xp_history"] });
    },
  });
}

export function useClasses() {
  return useQuery({
    queryKey: ["classes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("classes").select("*").order("column_index").order("level_min");
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
        .from("profiles")
        .update({ current_class_id: classId } as any)
        .eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });
}

export function useChecklistItems(missionId: string) {
  return useQuery({
    queryKey: ["checklist", missionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checklist_items")
        .select("*")
        .eq("mission_id", missionId)
        .order("created_at");
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
      const { error } = await supabase.from("checklist_items").insert({ mission_id: missionId, description });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["checklist", vars.missionId] });
    },
  });
}

export function useToggleChecklistItem() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId, completed, xpBonus }: { itemId: string; completed: boolean; xpBonus?: number }) => {
      const { error } = await supabase.from("checklist_items").update({ completed }).eq("id", itemId);
      if (error) throw error;

      if (completed && user) {
        const bonus = xpBonus || 2;
        await supabase.from("xp_history" as any).insert({
          user_id: user.id,
          xp_gained: bonus,
          type: "sub_mission",
        } as any);

        const { data: profile } = await supabase
          .from("profiles")
          .select("total_xp, xp_today, level")
          .eq("user_id", user.id)
          .single();
        if (profile) {
          const newTotalXp = profile.total_xp + bonus;
          const newLevel = Math.floor(newTotalXp / 200) + 1;
          await supabase
            .from("profiles")
            .update({
              total_xp: newTotalXp,
              xp_today: profile.xp_today + bonus,
              level: newLevel,
            })
            .eq("user_id", user.id);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["checklist"] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["xp_history"] });
    },
  });
}

export function useXpHistory(days: number = 7) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["xp_history", user?.id, days],
    queryFn: async () => {
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - days);
      const { data, error } = await supabase
        .from("xp_history" as any)
        .select("*")
        .eq("user_id", user!.id)
        .gte("date", fromDate.toISOString().split("T")[0])
        .order("date");
      if (error) throw error;
      return data as any[];
    },
    enabled: !!user,
  });
}
