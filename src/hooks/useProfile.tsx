import { Database } from '@/types/supabase';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { getAttributeLevels, getBossCombatStats, getPlayerCombatStats } from '@/lib/combat';

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

export function useUpdateDisplayName() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (newName: string) => {
      if (!user) throw new Error("Não autenticado");
      const trimmed = newName.trim();
      if (!trimmed || trimmed.length < 2 || trimmed.length > 30) {
        throw new Error("O nome deve ter entre 2 e 30 caracteres.");
      }

      // Check last name change
      const { data: profile, error: fetchErr } = await supabase
        .from("profiles")
        .select("last_name_change")
        .eq("user_id", user.id)
        .single();
      if (fetchErr) throw fetchErr;

      const lastChange = (profile as any)?.last_name_change;
      if (lastChange) {
        const diff = Date.now() - new Date(lastChange).getTime();
        const sevenDays = 7 * 24 * 60 * 60 * 1000;
        if (diff < sevenDays) {
          const nextDate = new Date(new Date(lastChange).getTime() + sevenDays);
          throw new Error(`Você só pode trocar de nome 1x por semana. Próximo: ${nextDate.toLocaleDateString('pt-BR')}`);
        }
      }

      const { error } = await supabase
        .from("profiles")
        .update({
          display_name: trimmed,
          last_name_change: new Date().toISOString(),
        } as any)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
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

      // Buscar perfil para XP scaling baseado no nível
      const { data: currentProfile } = await supabase
        .from('profiles')
        .select('level')
        .eq('user_id', user!.id)
        .single();
      
      const playerLevel = currentProfile?.level || 1;
      // XP Dinâmico: escala com o nível do jogador
      const xpMultiplier = 1 + Math.floor((playerLevel - 1) / 5) * 0.5; // +50% a cada 5 níveis
      const scaledXpReward = Math.round(xpReward * xpMultiplier);

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
          .from('mission_daily_completions')
          .insert({
            mission_id: missionId,
            completion_date: today,
            xp_earned: scaledXpReward,
            gold_earned: 2,
            user_id: user!.id,
          });

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

      // 🔑 Gerar Chave de Boss (1 chave por missão concluída)
      await supabase
        .from('profiles')
        .update({ boss_keys: (currentProfile as any)?.boss_keys ? (currentProfile as any).boss_keys + 1 : 1 } as any)
        .eq('user_id', user!.id);

      // ... resto do código (XP, Ouro, etc.)
      
      // Calcular bônus do checklist
      const { data: checklistItems } = await supabase
        .from('checklist_items')
        .select('*')
        .eq('mission_id', missionId);

      const checklistBonus = (checklistItems || [])
        .filter((item: any) => item.completed)
        .reduce((sum: number, item: any) => sum + (item.xp_bonus || 2), 0);

      const totalXpReward = scaledXpReward + checklistBonus;

      // Atualizar atributo primário
      const { data: attr } = await supabase
        .from('attributes')
        .select('xp, level')
        .eq('id', attributeId)
        .single();

      const xpTable = [0, 200, 350, 500, 700, 950, 1250, 1600, 2000, 2450, 2950, 3500, 4100, 4750, 5450, 6200, 7000, 7850, 8750, 9700, 10700, 11750, 12850, 14000, 15200, 16450, 17750, 19100, 20500, 21950, 23450, 25000];

      if (attr) {
        const newXp = attr.xp + totalXpReward;
        let newLevel = 1;
        for (let i = xpTable.length - 1; i > 0; i--) {
          if (newXp >= xpTable[i]) {
            newLevel = i + 1;
            break;
          }
        }

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
          let newLevel = 1;
          for (let i = xpTable.length - 1; i > 0; i--) {
            if (newXp >= xpTable[i]) {
              newLevel = i + 1;
              break;
            }
          }

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
        let newLevel = 1;
        for (let i = xpTable.length - 1; i > 0; i--) {
          if (newTotalXp >= xpTable[i]) {
            newLevel = i + 1;
            break;
          }
        }
        newLevel = Math.max(newLevel, profile.level);

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

      // Atualizar progresso dos planos vinculados
      const { data: planLinks } = await supabase
        .from('plan_missions' as any)
        .select('id, plan_id, value_per_completion')
        .eq('mission_id', missionId);

      if (planLinks && (planLinks as any[]).length > 0) {
        for (const link of (planLinks as any[])) {
          const { data: plan } = await supabase
            .from('plans' as any)
            .select('current_value')
            .eq('id', link.plan_id)
            .single();
          if (plan) {
            await supabase
              .from('plans' as any)
              .update({ current_value: Number((plan as any).current_value) + Number(link.value_per_completion) } as any)
              .eq('id', link.plan_id);
          }
        }
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
    mutationFn: async ({ bossId, bossHp, xpReward, keysCost }: { bossId: string; bossHp: number; xpReward: number; keysCost: number }) => {
      // Check if boss was already defeated
      const { data: previousWin } = await supabase
        .from("boss_battles")
        .select("id")
        .eq("user_id", user!.id)
        .eq("boss_id", bossId)
        .eq("won", true)
        .limit(1);

      if (previousWin && previousWin.length > 0) {
        throw new Error("BOSS_ALREADY_DEFEATED");
      }

      // 🔑 Verificar chaves
      const { data: profile } = await supabase
        .from("profiles")
        .select("level, total_xp, boss_keys")
        .eq("user_id", user!.id)
        .single();

      const currentKeys = (profile as any)?.boss_keys || 0;
      if (currentKeys < keysCost) {
        throw new Error("INSUFFICIENT_KEYS");
      }

      // Consumir chaves
      await supabase
        .from("profiles")
        .update({ boss_keys: currentKeys - keysCost } as any)
        .eq("user_id", user!.id);

      const { data: attrs } = await supabase
        .from('attributes')
        .select('name, level')
        .eq('user_id', user!.id);

      const { data: boss } = await supabase
        .from('bosses')
        .select('id, level, hp, gold_reward')
        .eq('id', bossId)
        .single();

      const attrLevels = getAttributeLevels((attrs || []) as any[]);
      const playerStats = getPlayerCombatStats(profile?.level || 1, attrLevels);
      const bossStats = getBossCombatStats({ level: boss?.level || 1, hp: boss?.hp || bossHp });

      // Sistema de dano com base em atributos (balanceado no estilo d20)
      const attackRoll = Math.floor(Math.random() * 20) + 1;
      const critMultiplier = attackRoll === 20 ? 1.5 : 1;
      const physicalDamage = Math.max(0, playerStats.atk - Math.floor(bossStats.def * 0.65));
      const magicalDamage = Math.max(0, playerStats.matk - Math.floor(bossStats.matk * 0.35));
      const tacticalBonus = Math.floor((playerStats.agi + playerStats.crit) * 0.18);
      const playerPower = Math.floor((physicalDamage + magicalDamage + tacticalBonus + attackRoll * 3) * critMultiplier);

      const bossPower = Math.floor(
        bossStats.atk * 0.75 +
        bossStats.matk * 0.45 +
        bossStats.agi * 0.2 +
        (Math.random() * 30),
      );

      const damage = Math.min(Math.max(1, playerPower), bossHp);
      const won = playerPower + Math.floor(playerStats.def * 0.4) >= bossPower;

      await supabase.from("boss_battles").insert({
        user_id: user!.id,
        boss_id: bossId,
        damage_dealt: damage,
        won,
      });

      const goldReward = (boss as any)?.gold_reward || 10;

      if (won && profile) {
        // Boss dá XP reduzido + Ouro significativo
        const newTotalXp = profile.total_xp + xpReward;
        const calculatedLevel = Math.floor(newTotalXp / 200) + 1;
        const newLevel = Math.max(calculatedLevel, profile.level);
        await supabase
          .from("profiles")
          .update({
            total_xp: newTotalXp,
            level: newLevel,
          })
          .eq("user_id", user!.id);

        // Dar ouro ao jogador
        const { data: bal } = await supabase
          .from('user_balance')
          .select('gold')
          .eq('user_id', user!.id)
          .maybeSingle();

        if (bal) {
          await supabase
            .from('user_balance')
            .update({ gold: (bal as any).gold + goldReward, updated_at: new Date().toISOString() } as any)
            .eq('user_id', user!.id);
        }

        await supabase.from("activity_log").insert({
          user_id: user!.id,
          action: "boss_defeated",
          description: `Boss derrotado! +${xpReward} XP +${goldReward} 🪙`,
          xp_gained: xpReward,
        });

        await supabase.from("xp_history").insert({
          user_id: user!.id,
          xp_gained: xpReward,
          type: "boss",
        });
      } else {
        // Derrota: devolver metade das chaves
        const refundKeys = Math.floor(keysCost / 2);
        if (refundKeys > 0) {
          await supabase
            .from("profiles")
            .update({ boss_keys: currentKeys - keysCost + refundKeys } as any)
            .eq("user_id", user!.id);
        }

        await supabase.from("activity_log").insert({
          user_id: user!.id,
          action: "boss_failed",
          description: `Derrota contra o boss. Dano causado: ${damage}. ${refundKeys > 0 ? `${refundKeys} 🔑 devolvidas.` : ''}`,
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

export function useStartActiveCombat() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ bossId }: { bossId: string }) => {
      if (!user) throw new Error('Não autenticado');

      const { data: existingCombat, error: existingCombatError } = await (supabase as any)
        .from('combates_ativos')
        .select('*')
        .eq('personagem_id', user.id)
        .eq('boss_id', bossId)
        .eq('status', 'em_andamento')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingCombatError) throw existingCombatError;
      if (existingCombat) return existingCombat;

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('level, total_xp')
        .eq('user_id', user.id)
        .single();

      if (profileError) throw profileError;

      const level = Math.max(1, profile?.level || 1);
      const totalXp = Math.max(0, profile?.total_xp || 0);

      const personagemPayload = {
        id: user.id,
        hp_max: 120 + level * 8,
        ataque_base: 14 + level * 2,
        defesa_base: 8 + Math.floor(level * 1.4),
        nivel: level,
        xp_atual: totalXp,
      };

      const { error: personagemUpsertError } = await (supabase as any)
        .from('personagens')
        .upsert(personagemPayload, { onConflict: 'id' });

      if (personagemUpsertError) throw personagemUpsertError;

      const { data: personagem, error: personagemFetchError } = await (supabase as any)
        .from('personagens')
        .select('id, hp_max')
        .eq('id', user.id)
        .single();

      if (personagemFetchError) throw personagemFetchError;

      const { data: boss, error: bossError } = await (supabase as any)
        .from('bosses')
        .select('id, hp, hp_max, level')
        .eq('id', bossId)
        .single();

      if (bossError) throw bossError;

      const hpInicialBoss = Number((boss as any).hp_max ?? (boss as any).hp ?? 100);
      const hpMaxPersonagem = Number((personagem as any).hp_max ?? 120);

      const { data: healthStats, error: healthStatsError } = await (supabase as any)
        .from('user_health_stats')
        .select('id, current_hp, max_hp, fatigue')
        .eq('user_id', user.id)
        .maybeSingle();

      if (healthStatsError) throw healthStatsError;

      const hpAtualPersistido = Number((healthStats as any)?.current_hp ?? hpMaxPersonagem);
      const hpInicialPersonagem = Math.max(1, Math.min(hpMaxPersonagem, hpAtualPersistido));

      const bossLevel = Math.max(1, Number((boss as any).level ?? level));
      const levelDiff = bossLevel - level;
      const fatigueGain = levelDiff >= 2 ? 20 : levelDiff >= 1 ? 15 : levelDiff === 0 ? 10 : levelDiff <= -2 ? 4 : 6;
      const fatigueAtual = Number((healthStats as any)?.fatigue ?? 0);
      const fatigueFinal = Math.min(100, Math.max(0, fatigueAtual + fatigueGain));

      if (healthStats) {
        const { error: updateHealthError } = await (supabase as any)
          .from('user_health_stats')
          .update({
            max_hp: hpMaxPersonagem,
            current_hp: hpInicialPersonagem,
            fatigue: fatigueFinal,
          })
          .eq('user_id', user.id);

        if (updateHealthError) throw updateHealthError;
      } else {
        const { error: insertHealthError } = await (supabase as any)
          .from('user_health_stats')
          .insert({
            user_id: user.id,
            max_hp: hpMaxPersonagem,
            current_hp: hpInicialPersonagem,
            fatigue: fatigueFinal,
          });

        if (insertHealthError) throw insertHealthError;
      }

      const { data: newCombat, error: combatInsertError } = await (supabase as any)
        .from('combates_ativos')
        .insert({
          personagem_id: user.id,
          boss_id: bossId,
          hp_atual_boss: hpInicialBoss,
          hp_atual_personagem: hpInicialPersonagem,
          turno_atual: 'player',
          status: 'em_andamento',
        })
        .select('*')
        .single();

      if (combatInsertError) throw combatInsertError;

      return newCombat;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['bosses'] });
      queryClient.invalidateQueries({ queryKey: ['combates_ativos'] });
      queryClient.invalidateQueries({ queryKey: ['health_stats'] });
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
          const calculatedLevel = Math.floor(newTotalXp / 200) + 1;
          const newLevel = Math.max(calculatedLevel, profile.level);
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

export function useTodayXp() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["xp_today", user?.id],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      const { data, error } = await supabase
        .from("xp_history" as any)
        .select("xp_gained")
        .eq("user_id", user!.id)
        .eq("date", today);
      if (error) throw error;
      return (data || []).reduce((sum: number, item: any) => sum + (item.xp_gained || 0), 0);
    },
    enabled: !!user,
  });
}

export function useTodayMissionsCount() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["missions_today_count", user?.id],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      const { data, error } = await supabase
        .from("mission_daily_completions" as any)
        .select("id")
        .eq("mission_id", user!.id)
        .eq("completion_date", today);
      if (error) throw error;
      return (data || []).length;
    },
    enabled: !!user,
  });
}

// ✅ Hook para conceder XP quando água + comida estão completas
export function useAwardHealthXP() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const XP_REWARD = 50;
      const today = new Date().toISOString().split('T')[0];

      // Verificar se já ganhou o bônus hoje
      const { data: existingLog } = await supabase
        .from('activity_log')
        .select('id')
        .eq('user_id', user!.id)
        .eq('action', 'health_challenge_complete')
        .gte('created_at', today)
        .limit(1);

      if (existingLog && existingLog.length > 0) {
        throw new Error('Você já ganhou o bônus de saúde hoje!');
      }

      // Atualizar perfil
      const { data: profile } = await supabase
        .from('profiles')
        .select('total_xp, xp_today, level')
        .eq('user_id', user!.id)
        .single();

      if (profile) {
        const newTotalXp = profile.total_xp + XP_REWARD;
        const calculatedLevel = Math.floor(newTotalXp / 200) + 1;
        const newLevel = Math.max(calculatedLevel, profile.level);

        const { error: updateError } = await supabase
          .from('profiles')
          .update({
            total_xp: newTotalXp,
            xp_today: profile.xp_today + XP_REWARD,
            level: newLevel,
          })
          .eq('user_id', user!.id);

        if (updateError) throw updateError;
      }

      // Registrar atividade
      const { error: logError } = await supabase
        .from('activity_log')
        .insert({
          user_id: user!.id,
          action: 'health_challenge_complete',
          description: '✨ Desafio de saúde completado! +50 XP',
          xp_gained: XP_REWARD,
        });

      if (logError) throw logError;

      return { success: true, xpAwarded: XP_REWARD };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['activity'] });
    },
  });
}
