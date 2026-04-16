import { Database } from '@/types/supabase';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { getAttributeLevels, getBossCombatBuffModifiers, getBossCombatStats, getPlayerCombatStats, getRoutineXpBuffBonus } from '@/lib/combat';
import { getEquipmentBonuses, type InventoryItem } from './useInventory';
import { getLevelFromXp } from '@/lib/progression';
import { deriveMissionCategory, resolveMissionTalentEffects, type MissionTalentResolution } from '@/lib/missionTalentRules';

const DAYS_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];

function toDateString(d: Date): string {
  return d.toISOString().split('T')[0];
}

function subtractDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() - days);
  return toDateString(d);
}

type ShortRestAvailability = {
  canRest: boolean;
  message: string;
  nextAvailableAt: string | null;
  lastRestAt: string | null;
};

const SHORT_REST_ACTION = 'short_rest_complete';

function getStartOfLocalDay(base: Date = new Date()): Date {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate());
}

function getStartOfNextLocalDay(base: Date = new Date()): Date {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1);
}

function formatPtBrDateTime(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

async function getShortRestUsageToday(userId: string): Promise<string | null> {
  const startOfDayLocal = getStartOfLocalDay();
  const { data, error } = await supabase
    .from('activity_log')
    .select('created_at')
    .eq('user_id', userId)
    .eq('action', SHORT_REST_ACTION)
    .gte('created_at', startOfDayLocal.toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as any)?.created_at ?? null;
}

export function useShortRestAvailability() {
  const { user } = useAuth();

  return useQuery<ShortRestAvailability>({
    queryKey: ['short_rest_status', user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) throw new Error('Não autenticado');

      const usedAt = await getShortRestUsageToday(user.id);
      if (!usedAt) {
        return {
          canRest: true,
          message: 'Descanso breve disponível. Você já pode descansar.',
          nextAvailableAt: null,
          lastRestAt: null,
        };
      }

      const nextAvailableDate = getStartOfNextLocalDay();
      return {
        canRest: false,
        message: `Descanso breve em recarga. Disponível novamente em ${formatPtBrDateTime(nextAvailableDate)}.`,
        nextAvailableAt: nextAvailableDate.toISOString(),
        lastRestAt: usedAt,
      };
    },
  });
}

async function getPlayerTalentEffects(userId: string): Promise<Set<string>> {
  const { data } = await (supabase as any)
    .from('talentos_jogador')
    .select('talentos_disponiveis(efeito)')
    .eq('personagem_id', userId);

  const effects = new Set<string>();
  for (const row of data || []) {
    const effect = String((row as any)?.talentos_disponiveis?.efeito || '');
    if (effect) effects.add(effect);
  }
  return effects;
}

async function getMissionGoldRewardFromStreakWithTalent(
  missionId: string,
  today: string,
  hasExtendedCombo: boolean,
): Promise<number> {
  const { data: completions } = await (supabase as any)
    .from('mission_daily_completions')
    .select('completion_date')
    .eq('mission_id', missionId)
    .order('completion_date', { ascending: false })
    .limit(60);

  const uniqueDates = Array.from(new Set((completions || []).map((c: any) => String(c.completion_date || ''))))
    .filter(Boolean)
    .sort((a, b) => (a > b ? -1 : 1));

  const maxGap = hasExtendedCombo ? 2 : 1;
  let streak = 1;
  let previous = new Date(`${today}T12:00:00`);

  for (const dateStr of uniqueDates) {
    const current = new Date(`${dateStr}T12:00:00`);
    const diffMs = previous.getTime() - current.getTime();
    const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));

    if (diffDays <= 0) continue;
    if (diffDays <= maxGap) {
      streak += 1;
      previous = current;
      continue;
    }
    break;
  }

  const bonusGold = Math.min(2, Math.floor(streak / 3));
  return 2 + bonusGold;
}

async function grantInspirationIfPerfectDay(userId: string, today: string): Promise<boolean> {
  const dayIndex = new Date(today + 'T12:00:00').getDay();
  const todayShort = DAYS_NAMES[dayIndex];

  const { data: missions } = await supabase
    .from('missions')
    .select('id, title, days_of_week, due_date, daily_status, completed, completed_at, is_failed')
    .eq('user_id', userId)
    .neq('status', 'arquivada');

  const requiredToday = (missions || []).filter((m: any) => {
    if (m.is_failed) return false;
    const days = (m.days_of_week as string[]) || [];
    const isDailyToday = days.length > 0 && days.includes(todayShort);
    const isUniqueToday = days.length === 0 && m.due_date === today;
    return isDailyToday || isUniqueToday;
  });

  if (requiredToday.length === 0) return false;

  const allMissionsDone = requiredToday.every((m: any) => {
    const days = (m.days_of_week as string[]) || [];
    if (days.length > 0) {
      return (m.daily_status || {})[today] === 'completed';
    }
    return !!m.completed;
  });

  if (!allMissionsDone) return false;

  const missionIds = requiredToday.map((m: any) => m.id);
  const { data: checklist } = await supabase
    .from('checklist_items')
    .select('mission_id, completed')
    .in('mission_id', missionIds);

  const checklistByMission = new Map<string, { total: number; completed: number }>();
  for (const id of missionIds) checklistByMission.set(id, { total: 0, completed: 0 });
  for (const item of checklist || []) {
    const current = checklistByMission.get((item as any).mission_id);
    if (!current) continue;
    current.total += 1;
    if ((item as any).completed) current.completed += 1;
  }

  const checklistPerfect = Array.from(checklistByMission.values()).every((m) => m.total === 0 || m.total === m.completed);
  if (!checklistPerfect) return false;

  const { data: profile } = await supabase
    .from('profiles')
    .select('inspired_available')
    .eq('user_id', userId)
    .single();

  if ((profile as any)?.inspired_available) return false;

  await supabase
    .from('profiles')
    .update({ inspired_available: true, inspired_earned_at: new Date().toISOString() } as any)
    .eq('user_id', userId);

  await supabase.from('activity_log').insert({
    user_id: userId,
    action: 'day_perfect_inspiration',
    description: 'Dia Perfeito concluido! Voce ganhou Inspiracao para o proximo boss.',
    xp_gained: 0,
  });

  return true;
}

async function getActiveBuffEffects(userId: string): Promise<Set<string>> {
  const { data: buffs } = await (supabase as any)
    .from('user_buffs')
    .select('id, expires_at, active, shop_items(effect)')
    .eq('user_id', userId)
    .eq('active', true);

  const now = Date.now();
  const effects = new Set<string>();

  for (const b of buffs || []) {
    const expiresAt = b.expires_at ? new Date(b.expires_at).getTime() : null;
    if (expiresAt && expiresAt < now) continue;
    const effect = b.shop_items?.effect as string | undefined;
    if (effect) effects.add(effect);
  }

  return effects;
}

async function consumeOneShotBuff(userId: string, effectNames: string[]): Promise<void> {
  const { data: buffs } = await (supabase as any)
    .from('user_buffs')
    .select('id, expires_at, active, purchased_at, shop_items(effect)')
    .eq('user_id', userId)
    .eq('active', true)
    .order('purchased_at', { ascending: true });

  const now = Date.now();
  const match = (buffs || []).find((b: any) => {
    const expiresAt = b.expires_at ? new Date(b.expires_at).getTime() : null;
    if (expiresAt && expiresAt < now) return false;
    return effectNames.includes(String(b.shop_items?.effect || ''));
  });

  if (!match) return;

  await (supabase as any)
    .from('user_buffs')
    .update({ active: false })
    .eq('id', match.id)
    .eq('user_id', userId);
}

async function grantFlowXpOneShotBuff(userId: string): Promise<void> {
  const { data: flowItem } = await (supabase as any)
    .from('shop_items')
    .select('id')
    .eq('effect', 'estado_fluxo_xp')
    .maybeSingle();

  if (!flowItem?.id) return;

  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  await (supabase as any).from('user_buffs').insert({
    user_id: userId,
    item_id: flowItem.id,
    active: true,
    expires_at: expiresAt,
  });
}

async function applyMissionTalentPostEffects(params: {
  userId: string;
  missionTitle: string;
  effects: MissionTalentResolution;
}): Promise<void> {
  const { userId, missionTitle, effects } = params;

  const shouldTouchHealth = effects.recoverLostHpPct > 0 || effects.addMaxHp > 0 || effects.addMaxMp > 0;

  if (shouldTouchHealth) {
    let healthStats: any = null;
    let hasTalentBonusColumns = true;

    const withBonusColumns = await (supabase as any)
      .from('user_health_stats')
      .select('max_hp, current_hp, max_mp, current_mp, fatigue, talent_bonus_hp, talent_bonus_mp')
      .eq('user_id', userId)
      .maybeSingle();

    if (withBonusColumns.error) {
      hasTalentBonusColumns = false;
      const fallback = await (supabase as any)
        .from('user_health_stats')
        .select('max_hp, current_hp, max_mp, current_mp, fatigue')
        .eq('user_id', userId)
        .maybeSingle();
      healthStats = fallback.data;
    } else {
      healthStats = withBonusColumns.data;
    }

    const baseMaxHp = Number(healthStats?.max_hp ?? 100);
    const baseCurrentHp = Number(healthStats?.current_hp ?? baseMaxHp);
    const baseMaxMp = Number(healthStats?.max_mp ?? 10);
    const baseCurrentMp = Number(healthStats?.current_mp ?? baseMaxMp);
    const fatigue = Number(healthStats?.fatigue ?? 0);
    const bonusHp = Number(healthStats?.talent_bonus_hp ?? 0);
    const bonusMp = Number(healthStats?.talent_bonus_mp ?? 0);

    const hpCapRemaining = hasTalentBonusColumns ? (100 - bonusHp) : Math.max(0, 200 - baseMaxHp);
    const mpCapRemaining = hasTalentBonusColumns ? (50 - bonusMp) : Math.max(0, 60 - baseMaxMp);

    const hpGainAllowed = Math.max(0, Math.min(effects.addMaxHp, hpCapRemaining));
    const mpGainAllowed = Math.max(0, Math.min(effects.addMaxMp, mpCapRemaining));

    const maxHpAfter = baseMaxHp + hpGainAllowed;
    const maxMpAfter = baseMaxMp + mpGainAllowed;

    const lostHp = Math.max(0, maxHpAfter - (baseCurrentHp + hpGainAllowed));
    const recovered = effects.recoverLostHpPct > 0 ? Math.max(0, Math.ceil(lostHp * effects.recoverLostHpPct)) : 0;
    const currentHpAfter = Math.min(maxHpAfter, baseCurrentHp + hpGainAllowed + recovered);
    const currentMpAfter = Math.min(maxMpAfter, baseCurrentMp + mpGainAllowed);

    if (healthStats) {
      const payload: Record<string, any> = {
        max_hp: maxHpAfter,
        current_hp: currentHpAfter,
        max_mp: maxMpAfter,
        current_mp: currentMpAfter,
      };

      if (hasTalentBonusColumns) {
        payload.talent_bonus_hp = bonusHp + hpGainAllowed;
        payload.talent_bonus_mp = bonusMp + mpGainAllowed;
      }

      await (supabase as any)
        .from('user_health_stats')
        .update(payload)
        .eq('user_id', userId);
    } else {
      const payload: Record<string, any> = {
        user_id: userId,
        max_hp: maxHpAfter,
        current_hp: currentHpAfter,
        max_mp: maxMpAfter,
        current_mp: currentMpAfter,
        fatigue,
      };

      if (hasTalentBonusColumns) {
        payload.talent_bonus_hp = bonusHp + hpGainAllowed;
        payload.talent_bonus_mp = bonusMp + mpGainAllowed;
      }

      await (supabase as any).from('user_health_stats').insert({
        ...payload,
      });
    }
  }

  if (effects.grantInspired) {
    await (supabase as any)
      .from('profiles')
      .update({ inspired_available: true, inspired_earned_at: new Date().toISOString() })
      .eq('user_id', userId);
  }

  if (effects.grantFlowXpBuff) {
    await grantFlowXpOneShotBuff(userId);
  }

  const logParts: string[] = [];
  if (effects.doubledByOrderNoCaos) logParts.push('Ordem no Caos dobrou o ouro da missao');
  if (effects.grantFlowXpBuff) logParts.push('Estado de Fluxo ativado (+20% XP na proxima missao)');
  if (effects.grantInspired) logParts.push('Presenca Inspiradora concedeu buff Inspirado');
  if (effects.addMaxMp > 0) logParts.push('Rato de Biblioteca aumentou MP maximo');
  if (effects.addMaxHp > 0) logParts.push('Corpo de Ferro aumentou HP maximo');
  if (effects.recoverLostHpPct > 0) logParts.push('Pulmoes de Aco recuperou parte do HP perdido');

  if (logParts.length > 0) {
    await (supabase as any).from('activity_log').insert({
      user_id: userId,
      action: 'mission_talent_bonus',
      description: `[${missionTitle}] ${logParts.join(' | ')}`,
      xp_gained: 0,
    });
  }
}

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
        .select('level, boss_keys')
        .eq('user_id', user!.id)
        .single();
      
      const playerLevel = currentProfile?.level || 1;
      const activeBuffs = await getActiveBuffEffects(user!.id);
      const talentEffects = await getPlayerTalentEffects(user!.id);
      const hadFlowXpBuff = activeBuffs.has('estado_fluxo_xp');

      // XP Dinâmico: escala com o nível do jogador
      let xpMultiplier = 1 + Math.floor((playerLevel - 1) / 5) * 0.5; // +50% a cada 5 níveis
      // Loja do Tempo: bônus de XP aplicados via regras de combate/economia centralizadas
      xpMultiplier += getRoutineXpBuffBonus(activeBuffs);
      if (hadFlowXpBuff) {
        xpMultiplier *= 1.2;
      }
      const currentHour = new Date().getHours();
      if (talentEffects.has('madrugador') && currentHour < 8) {
        xpMultiplier *= 1.15;
      }
      const scaledXpReward = Math.round(xpReward * xpMultiplier);

      // Buscar missão
      const { data: mission, error: missionError } = await supabase
        .from('missions')
        .select('*')
        .eq('id', missionId)
        .single();

      if (missionError) throw missionError;

      const typedMission = mission as any;

      const { data: primaryAttrMeta } = await supabase
        .from('attributes')
        .select('name')
        .eq('id', attributeId)
        .maybeSingle();

      const missionCategory = deriveMissionCategory({
        mission: typedMission,
        primaryAttributeName: String((primaryAttrMeta as any)?.name || ''),
      });

      const missionTalentEffects = resolveMissionTalentEffects(missionCategory, talentEffects);

      // Verificar se é diária
      const daysOfWeek = (typedMission.days_of_week as string[]) || [];
      
      let goldReward = 2;

      if (daysOfWeek && Array.isArray(daysOfWeek) && daysOfWeek.length > 0) {
        goldReward = await getMissionGoldRewardFromStreakWithTalent(
          missionId,
          today,
          talentEffects.has('foco_inabalavel'),
        );

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
            gold_earned: goldReward,
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

      goldReward = Math.max(0, Math.round(goldReward * missionTalentEffects.goldMultiplier));

      // 🔑 Gerar Chave de Boss (1 chave por missão concluída)
      const currentKeys = (currentProfile as any)?.boss_keys ?? 0;
      await supabase
        .from('profiles')
        .update({ boss_keys: currentKeys + 1 } as any)
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

      if (attr) {
        const newXp = attr.xp + totalXpReward;
        const newLevel = getLevelFromXp(newXp);

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
          const newLevel = getLevelFromXp(newXp);

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
        let newLevel = getLevelFromXp(newTotalXp);
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
          description: `Missao concluida! +${totalXpReward} XP +${goldReward} Ouro`,
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
            gold: currentGold + goldReward,
            updated_at: new Date().toISOString() 
          } as any)
          .eq('user_id', user!.id);
      } else {
        await supabase
          .from('user_balance')
          .insert({ 
            user_id: user!.id, 
            balance_percent: 100, 
            gold: 100 + goldReward
          } as any);
      }

      await supabase.from('gold_history').insert({
        user_id: user!.id,
        type: 'missao',
        amount: goldReward,
        reason: `Recompensa de missao: ${typedMission.title}`,
      } as any);

      await applyMissionTalentPostEffects({
        userId: user!.id,
        missionTitle: String(typedMission.title || 'Missao'),
        effects: missionTalentEffects,
      });

      if (hadFlowXpBuff) {
        await consumeOneShotBuff(user!.id, ['estado_fluxo_xp']);
      }

      const inspiredGranted = await grantInspirationIfPerfectDay(user!.id, today);

      return { success: true, inspiredGranted };
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['missions'] });
      queryClient.invalidateQueries({ queryKey: ['attributes'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['activity'] });
      queryClient.invalidateQueries({ queryKey: ['xp_today'] });
      queryClient.invalidateQueries({ queryKey: ['missions_today_count'] });
      queryClient.invalidateQueries({ queryKey: ['rank_position'] });
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
      const playerStatsBase = getPlayerCombatStats(profile?.level || 1, attrLevels);

      const { data: inventoryData } = await (supabase as any)
        .from('user_inventory')
        .select('equipped, sintonizado, game_items(rarity, requer_sintonizacao, atk_bonus, matk_bonus, def_bonus, hp_bonus, mp_bonus, agi_bonus, crit_bonus)')
        .eq('user_id', user!.id);

      const equipBonuses = getEquipmentBonuses((inventoryData || []) as InventoryItem[]);
      const playerStats = {
        ...playerStatsBase,
        atk: playerStatsBase.atk + equipBonuses.atk,
        matk: playerStatsBase.matk + equipBonuses.matk,
        def: playerStatsBase.def + equipBonuses.def,
        agi: playerStatsBase.agi + equipBonuses.agi,
        crit: playerStatsBase.crit + equipBonuses.crit,
      };

      const activeBuffs = await getActiveBuffEffects(user!.id);
      const combatBuffs = getBossCombatBuffModifiers(activeBuffs);
      const bossStats = getBossCombatStats({ level: boss?.level || 1, hp: boss?.hp || bossHp });

      // Sistema de dano com base em atributos (balanceado no estilo d20)
      const firstRoll = Math.floor(Math.random() * 20) + 1;
      const secondRoll = Math.floor(Math.random() * 20) + 1;
      const hasInspiration = !!(profile as any)?.inspired_available;
      const attackRoll = (combatBuffs.hasAdrenaline || hasInspiration) ? Math.max(firstRoll, secondRoll) : firstRoll;
      const attackRollMultiplier = 3 + combatBuffs.attackRollMultiplierBonus;
      const critMultiplier = attackRoll === 20 ? 1.5 : 1;
      const physicalDamage = Math.max(0, playerStats.atk - Math.floor(bossStats.def * 0.65));
      const magicalDamage = Math.max(0, playerStats.matk - Math.floor(bossStats.matk * 0.35));
      const tacticalBonus = Math.floor((playerStats.agi + playerStats.crit) * 0.18);
      const playerPower = Math.floor((physicalDamage + magicalDamage + tacticalBonus + attackRoll * attackRollMultiplier) * critMultiplier);

      let bossPower = Math.floor(
        bossStats.atk * 0.75 +
        bossStats.matk * 0.45 +
        bossStats.agi * 0.2 +
        (Math.random() * 30),
      );

      bossPower = Math.floor(bossPower * combatBuffs.bossPowerMultiplier);

      const damage = Math.min(Math.max(1, playerPower), bossHp);
      const won = playerPower + Math.floor(playerStats.def * 0.4) >= bossPower;

      await supabase.from("boss_battles").insert({
        user_id: user!.id,
        boss_id: bossId,
        damage_dealt: damage,
        won,
      });

      const goldReward = (boss as any)?.gold_reward || 10;

      // Consome buffs de uso único após entrar em combate
      if (combatBuffs.hasAdrenaline) {
        await consumeOneShotBuff(user!.id, ['adrenalina', 'adrenaline_boost']);
      }
      if (activeBuffs.has('boss_debuff')) {
        await consumeOneShotBuff(user!.id, ['boss_debuff']);
      }
      if (hasInspiration) {
        await supabase
          .from('profiles')
          .update({ inspired_available: false, inspired_earned_at: null } as any)
          .eq('user_id', user!.id);
      }

      if (won && profile) {
        // Boss dá XP reduzido + Ouro significativo
        const newTotalXp = profile.total_xp + xpReward;
        const calculatedLevel = getLevelFromXp(newTotalXp);
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
          const calculatedLevel = getLevelFromXp(newTotalXp);
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
      const now = new Date();
      const startOfDayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const { data, error } = await supabase
        .from("activity_log" as any)
        .select("xp_gained")
        .eq("user_id", user!.id)
        .gt("xp_gained", 0)
        .gte("created_at", startOfDayLocal.toISOString());
      if (error) throw error;
      return (data || []).reduce((sum: number, item: any) => sum + (item.xp_gained || 0), 0);
    },
    enabled: !!user,
    refetchInterval: 10000,
  });
}

export function useTodayMissionsCount() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["missions_today_count", user?.id],
    queryFn: async () => {
      const today = new Date().toLocaleDateString('en-CA');
      const { data, error } = await supabase
        .from("mission_daily_completions" as any)
        .select("id")
        .eq("user_id", user!.id)
        .eq("completion_date", today);
      if (error) throw error;
      return (data || []).length;
    },
    enabled: !!user,
    refetchInterval: 10000,
  });
}

export function useRankPosition() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['rank_position', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: me, error: meError } = await supabase
        .from('profiles')
        .select('level, total_xp')
        .eq('user_id', user!.id)
        .single();

      if (meError) throw meError;

      const myLevel = Number((me as any)?.level ?? 1);
      const myTotalXp = Number((me as any)?.total_xp ?? 0);

      const { count: higherLevelCount, error: higherLevelError } = await supabase
        .from('profiles')
        .select('user_id', { count: 'exact', head: true })
        .gt('level', myLevel);

      if (higherLevelError) throw higherLevelError;

      const { count: sameLevelHigherXpCount, error: sameLevelHigherXpError } = await supabase
        .from('profiles')
        .select('user_id', { count: 'exact', head: true })
        .eq('level', myLevel)
        .gt('total_xp', myTotalXp);

      if (sameLevelHigherXpError) throw sameLevelHigherXpError;

      return Number(higherLevelCount ?? 0) + Number(sameLevelHigherXpCount ?? 0) + 1;
    },
    refetchInterval: 15000,
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
        const calculatedLevel = getLevelFromXp(newTotalXp);
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

      // Descanso Longo: cumprir desafio de saúde restaura HP/MP totalmente
      const { data: healthStats } = await (supabase as any)
        .from('user_health_stats')
        .select('id, max_hp, max_mp')
        .eq('user_id', user!.id)
        .maybeSingle();

      if (healthStats) {
        await (supabase as any)
          .from('user_health_stats')
          .update({
            current_hp: Number(healthStats.max_hp ?? 100),
            current_mp: Number(healthStats.max_mp ?? 40),
            fatigue: 0,
          })
          .eq('user_id', user!.id);
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
      queryClient.invalidateQueries({ queryKey: ['health_stats'] });
    },
  });
}

export function useShortRestRecovery() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Não autenticado');

      const usedAt = await getShortRestUsageToday(user.id);
      if (usedAt) {
        const nextAvailableDate = getStartOfNextLocalDay();
        throw new Error(`Você já realizou o descanso breve hoje. Disponível novamente em ${formatPtBrDateTime(nextAvailableDate)}.`);
      }

      const { data: healthStats, error: healthError } = await (supabase as any)
        .from('user_health_stats')
        .select('max_hp, current_hp, max_mp, current_mp')
        .eq('user_id', user.id)
        .maybeSingle();

      if (healthError) throw healthError;

      const maxHp = Number(healthStats?.max_hp ?? 100);
      const currentHp = Number(healthStats?.current_hp ?? maxHp);
      const maxMp = Number(healthStats?.max_mp ?? 10);
      const currentMp = Number(healthStats?.current_mp ?? maxMp);

      const hpGain = Math.max(1, Math.ceil(maxHp * 0.3));
      const mpGain = Math.max(1, Math.ceil(maxMp * 0.3));

      const newHp = Math.min(maxHp, currentHp + hpGain);
      const newMp = Math.min(maxMp, currentMp + mpGain);

      if (healthStats) {
        const { error: updateError } = await (supabase as any)
          .from('user_health_stats')
          .update({
            current_hp: newHp,
            current_mp: newMp,
          })
          .eq('user_id', user.id);

        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await (supabase as any)
          .from('user_health_stats')
          .insert({
            user_id: user.id,
            max_hp: maxHp,
            current_hp: newHp,
            max_mp: maxMp,
            current_mp: newMp,
            fatigue: 0,
          });

        if (insertError) throw insertError;
      }

      const { error: logError } = await supabase.from('activity_log').insert({
        user_id: user.id,
        action: SHORT_REST_ACTION,
        description: `Descanso curto concluído: +${newHp - currentHp} HP e +${newMp - currentMp} MP`,
        xp_gained: 0,
      });

      if (logError) throw logError;

      return {
        hpRecovered: newHp - currentHp,
        mpRecovered: newMp - currentMp,
        currentHp: newHp,
        currentMp: newMp,
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['health_stats'] });
      queryClient.invalidateQueries({ queryKey: ['activity'] });
      queryClient.invalidateQueries({ queryKey: ['short_rest_status'] });
    },
  });
}
