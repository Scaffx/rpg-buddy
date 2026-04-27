import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';
import { getLevelFromXp } from '@/lib/progression';

const DAYS_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function getLocalDateString(date: Date = new Date()): string {
  return date.toLocaleDateString('en-CA');
}

function getStartOfLocalDay(base: Date = new Date()): Date {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate());
}

function getWeekToken(date: Date = new Date()): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

export function useCheckFailedMissions() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user) return;
    void runFailedMissionCheck(user.id, queryClient);
  }, [user]);
}

export async function runFailedMissionCheck(userId: string, queryClient: any) {
  try {
    await checkAndMarkFailed(userId, queryClient);
  } catch (error) {
    console.error('[FailedMissions] erro ao validar missões fracassadas:', error);
  }
}

async function checkAndMarkFailed(userId: string, queryClient: any) {
  // Check up to 30 days back for unchecked failures
  const { data: missions } = await supabase
    .from('missions')
    .select('*')
    .eq('user_id', userId)
    .eq('completed', false)
    .eq('is_failed', false as any);

  if (!missions || missions.length === 0) return;

  let totalPenalty = 0;
  let totalHpPenalty = 0;
  let totalMpPenalty = 0;
  const failedList: any[] = [];
  const startOfToday = getStartOfLocalDay();
  const currentWeek = getWeekToken();

  const { data: streakProfile } = await supabase
    .from('profiles')
    .select('streak_protector_charges, streak_protector_max, streak_protector_week')
    .eq('user_id', userId)
    .maybeSingle();

  const maxSlots = Math.min(3, Math.max(1, Number((streakProfile as any)?.streak_protector_max ?? 3)));
  let availableProtectors =
    String((streakProfile as any)?.streak_protector_week || '') === currentWeek
      ? Number((streakProfile as any)?.streak_protector_charges ?? 2)
      : 2;

  await supabase
    .from('profiles')
    .update({
      streak_protector_week: currentWeek,
      streak_protector_max: maxSlots,
      streak_protector_charges: Math.min(maxSlots, Math.max(0, availableProtectors)),
    } as any)
    .eq('user_id', userId);

  for (let daysBack = 1; daysBack <= 30; daysBack++) {
    const pastDate = new Date(startOfToday);
    pastDate.setDate(pastDate.getDate() - daysBack);
    const pastDateStr = getLocalDateString(pastDate);
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

      // Check daily_status for completion or already-accepted failure on that date
      const dailyStatus = (m as any).daily_status || {};
      if (dailyStatus[pastDateStr] === 'completed') continue;
      if (dailyStatus[pastDateStr] === 'failed_accepted') continue;

      // Check mission_daily_completions
      const { data: completions } = await supabase
        .from('mission_daily_completions')
        .select('id')
        .eq('mission_id', m.id)
        .eq('completion_date', pastDateStr)
        .limit(1);

      if (completions && completions.length > 0) continue;

      if (availableProtectors > 0) {
        const { data: missionStatusRow } = await supabase
          .from('missions')
          .select('daily_status')
          .eq('id', m.id)
          .single();

        const protectedDailyStatus = (missionStatusRow as any)?.daily_status || {};
        protectedDailyStatus[pastDateStr] = 'protected';

        availableProtectors = Math.max(0, availableProtectors - 1);

        await supabase
          .from('profiles')
          .update({ streak_protector_charges: availableProtectors, streak_protector_week: currentWeek } as any)
          .eq('user_id', userId);

        await supabase
          .from('missions')
          .update({ daily_status: protectedDailyStatus } as any)
          .eq('id', m.id);

        await supabase.from('activity_log').insert({
          user_id: userId,
          action: 'streak_protected',
          description: `Protetor de Streak usado em ${m.title} (${pastDateStr}). Cargas restantes: ${availableProtectors}/${maxSlots}`,
          xp_gained: 0,
        });

        continue;
      }

      // Esta missão falhou nesta data - aplicar penalidade dinâmica
      const xpPenalty = m.xp_reward;
      let hpPenalty = 0;
      let mpPenalty = 0;
      // Buscar perfil e atributos para penalidade dinâmica
      const { data: profile } = await supabase
        .from('profiles')
        .select('level')
        .eq('user_id', userId)
        .single();
      let maxHp = 100;
      let maxMp = 40;
      if (profile && profile.level > 15) {
        // Buscar atributos
        const { data: attrs } = await supabase
          .from('attributes')
          .select('name, level')
          .eq('user_id', userId);
        if (attrs) {
          const attrLevels = require('@/lib/combat').getAttributeLevels(attrs);
          const stats = require('@/lib/combat').getPlayerCombatStats(profile.level, attrLevels);
          maxHp = stats.hp;
          maxMp = stats.mp;
        }
        // Penalidade: 5% do HP máximo e 10% do MP máximo por missão fracassada
        hpPenalty = Math.round(0.05 * maxHp);
        mpPenalty = Math.round(0.10 * maxMp);
        totalHpPenalty += hpPenalty;
        totalMpPenalty += mpPenalty;
      }
      totalPenalty += xpPenalty;

      await supabase
        .from('missions')
        .update({
          is_failed: true,
          xp_penalized: xpPenalty,
          failed_date: pastDateStr,
        } as any)
        .eq('id', m.id);

      await supabase
        .from('profiles')
        .update({ streak_current_days: 0 } as any)
        .eq('user_id', userId);

      // Log estruturado da transação de XP (penalidade)
      await supabase.from('xp_transactions' as any).insert({
        user_id: userId,
        mission_id: m.id,
        reason: 'mission_failed',
        xp_delta: -xpPenalty,
        gold_delta: 0,
        local_date: pastDateStr,
        description: `Missão fracassada (D+1 expirou): ${m.title}`,
      });

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

    let updates: any = {};
    if (profile) {
      const newXp = Math.max(0, (profile as any).total_xp - totalPenalty);
      const calculatedLevel = getLevelFromXp(newXp);
      const newLevel = Math.max(calculatedLevel, (profile as any).level);
      updates.total_xp = newXp;
      updates.level = newLevel;
      await supabase.from('profiles').update(updates).eq('user_id', userId);
    }

    let desc = `Missões fracassadas! -${totalPenalty} XP`;
    if (totalHpPenalty > 0) desc += `, -${totalHpPenalty} HP`;
    if (totalMpPenalty > 0) desc += `, -${totalMpPenalty} MP`;
    await supabase.from('activity_log').insert({
      user_id: userId,
      action: 'mission_failed',
      description: desc,
      xp_gained: -totalPenalty,
    });

    let toastMsg = `Missões fracassadas! Você perdeu ${totalPenalty} XP.`;
    if (totalHpPenalty > 0) toastMsg += ` -${totalHpPenalty} HP`;
    if (totalMpPenalty > 0) toastMsg += ` -${totalMpPenalty} MP`;
    toast.error(toastMsg);
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
        const newLevel = getLevelFromXp(newXp);
        await supabase.from('profiles').update({
          total_xp: newXp,
          level: newLevel,
        }).eq('user_id', user.id);
      }

      // Marca o dia do fracasso como aceito para evitar re-avaliação
      const { data: missionData } = await supabase
        .from('missions')
        .select('daily_status')
        .eq('id', mission.id)
        .single();
      const dailyStatus = (missionData as any)?.daily_status || {};
      if ((mission as any).failed_date) {
        dailyStatus[(mission as any).failed_date] = 'failed_accepted';
      }

      await supabase
        .from('missions')
        .update({ is_failed: false, xp_penalized: 0, failed_date: null, daily_status: dailyStatus } as any)
        .eq('id', mission.id);

      await supabase.from('gold_history').insert({
        user_id: user.id,
        type: 'penalidade',
        amount: -goldCost,
        reason: `Pagou penalidade: ${mission.title}`,
      });

      // Log estruturado: pagamento com ouro restaura XP perdido
      await supabase.from('xp_transactions' as any).insert({
        user_id: user.id,
        mission_id: mission.id,
        reason: 'penalty_paid_with_gold',
        xp_delta: xpToRestore,
        gold_delta: -goldCost,
        local_date: (mission as any).failed_date || new Date().toLocaleDateString('en-CA'),
        description: `Pagou penalidade com ${goldCost} 🪙: ${mission.title} (+${xpToRestore} XP)`,
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
        // Marca o dia do fracasso como aceito para evitar re-avaliação
        const { data: missionData } = await supabase
          .from('missions')
          .select('daily_status')
          .eq('id', mission.id)
          .single();
        const dailyStatus = (missionData as any)?.daily_status || {};
        if (mission.failed_date) {
          dailyStatus[mission.failed_date] = 'failed_accepted';
        }

        await supabase
          .from('missions')
          .update({ is_failed: false, failed_date: null, daily_status: dailyStatus } as any)
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

export function useMarkFailedAsDone() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (mission: any) => {
      if (!user) throw new Error('Não autenticado');

      const startOfDayLocalIso = getStartOfLocalDay().toISOString();

      // Verificar quantas recuperações já foram feitas hoje
      const { data: todayRecoveries } = await supabase
        .from('activity_log')
        .select('id')
        .eq('user_id', user.id)
        .eq('action', 'mission_failed_recovered')
        .gte('created_at', startOfDayLocalIso);

      const recoveryCount = todayRecoveries?.length ?? 0;
      if (recoveryCount >= 2) {
        throw new Error('Limite atingido! Você já recuperou 2 missões fracassadas hoje.');
      }

      // Atualizar daily_status para marcar o dia do fracasso como concluído
      const { data: missionData } = await supabase
        .from('missions')
        .select('daily_status')
        .eq('id', mission.id)
        .single();
      const dailyStatus = (missionData as any)?.daily_status || {};
      if (mission.failed_date) {
        dailyStatus[mission.failed_date] = 'completed';
      }

      // Limpar estado de falha
      await supabase
        .from('missions')
        .update({ is_failed: false, failed_date: null, xp_penalized: 0, daily_status: dailyStatus } as any)
        .eq('id', mission.id);

      // Restaurar XP perdido com a penalidade
      const xpToRestore = mission.xp_penalized || mission.xp_reward;
      const { data: profile } = await supabase
        .from('profiles')
        .select('total_xp, level')
        .eq('user_id', user.id)
        .single();

      if (profile) {
        const newXp = profile.total_xp + xpToRestore;
        const newLevel = getLevelFromXp(newXp);
        await supabase.from('profiles').update({ total_xp: newXp, level: newLevel }).eq('user_id', user.id);
      }

      // Registrar recuperação no log
      await supabase.from('activity_log').insert({
        user_id: user.id,
        action: 'mission_failed_recovered',
        description: `Recuperou missão fracassada: ${mission.title} (+${xpToRestore} XP)`,
        xp_gained: xpToRestore,
      });

      // Log estruturado: recuperação manual de missão fracassada
      await supabase.from('xp_transactions' as any).insert({
        user_id: user.id,
        mission_id: mission.id,
        reason: 'mission_recovered',
        xp_delta: xpToRestore,
        gold_delta: 0,
        local_date: (mission as any).failed_date || new Date().toLocaleDateString('en-CA'),
        description: `Recuperou missão fracassada: ${mission.title} (+${xpToRestore} XP)`,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['failed-missions'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['missions'] });
      queryClient.invalidateQueries({ queryKey: ['today-recoveries'] });
    },
  });
}

export function useTodayRecoveryCount() {
  const { user } = useAuth();
  const today = getLocalDateString();
  return useQuery({
    queryKey: ['today-recoveries', user?.id, today],
    queryFn: async () => {
      const startOfDayLocalIso = getStartOfLocalDay().toISOString();
      const { data } = await supabase
        .from('activity_log')
        .select('id')
        .eq('user_id', user!.id)
        .eq('action', 'mission_failed_recovered')
        .gte('created_at', startOfDayLocalIso);
      return data?.length ?? 0;
    },
    enabled: !!user,
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
        const sessionKey = `welcome_back_${userId}_${getLocalDateString(now)}`;
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
