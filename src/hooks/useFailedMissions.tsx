import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';
import { getLevelFromXp } from '@/lib/progression';
import { getAttributeLevels, getPlayerCombatStats } from '@/lib/combat';

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

// "Nunca falhe duas vezes" (psicologia de hábito): determina se a ocorrência agendada
// ANTERIOR a `pastDate` foi uma falha. Se a anterior foi concluída/protegida (ou não existe
// dia anterior), a falha atual é a PRIMEIRA → perdoada (graça, só alerta, sem penalidade).
// Se a anterior também foi falha/graça, a atual é a 2ª consecutiva → penaliza.
async function previousScheduledWasMiss(
  missionId: string,
  days: string[],
  createdAtStr: string | undefined,
  pastDate: Date,
  effectiveStatus: Record<string, string>,
): Promise<boolean> {
  for (let back = 1; back <= 10; back++) {
    const d = new Date(pastDate);
    d.setDate(d.getDate() - back);
    const dName = DAYS_NAMES[d.getDay()];
    if (!days.includes(dName)) continue; // não era dia agendado
    const dStr = getLocalDateString(d);
    if (createdAtStr && createdAtStr > dStr) return false; // missão não existia → 1ª falha
    const st = effectiveStatus[dStr];
    if (st === 'completed' || st === 'protected') return false; // anterior OK → 1ª falha
    if (st === 'grace' || st === 'failed' || st === 'failed_accepted') return true; // anterior falhou → consecutiva
    // status desconhecido em memória → confere a tabela de conclusões
    const { data: comp } = await supabase
      .from('mission_daily_completions')
      .select('id')
      .eq('mission_id', missionId)
      .eq('completion_date', dStr)
      .limit(1);
    return !(comp && comp.length > 0);
  }
  return false; // nenhum dia agendado anterior → 1ª ocorrência → graça
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
  let totalSilentPenalty = 0; // D+2+: auto-penalizado sem diálogo
  let totalHpPenalty = 0;
  let totalMpPenalty = 0;
  let totalGrace = 0; // 1ª falha perdoada (nunca falhe 2x) — só alerta gentil
  const startOfToday = getStartOfLocalDay();
  const currentWeek = getWeekToken();

  // Cache in-memory de daily_status para acumular múltiplas datas na mesma execução
  // sem sobrescrever updates anteriores do mesmo run
  const dailyStatusCache: Record<string, Record<string, string>> = {};
  // Missões que já receberam is_failed=true nesta execução (D+1)
  const setFailedThisRun = new Set<string>();

  const { data: streakProfile } = await supabase
    .from('profiles')
    .select('streak_protector_charges, streak_protector_max, streak_protector_week')
    .eq('user_id', userId)
    .maybeSingle();

  const maxSlots = Math.min(3, Math.max(1, Number(streakProfile?.streak_protector_max ?? 3)));
  let availableProtectors =
    String(streakProfile?.streak_protector_week || '') === currentWeek
      ? Number(streakProfile?.streak_protector_charges ?? 2)
      : 2;

  await supabase
    .from('profiles')
    .update({
      streak_protector_week: currentWeek,
      streak_protector_max: maxSlots,
      streak_protector_charges: Math.min(maxSlots, Math.max(0, availableProtectors)),
    } as any)
    .eq('user_id', userId);

  // Processar do mais antigo (30) ao mais recente (1) para que D+2+ sejam
  // auto-penalizados antes de D+1 aparecer no diálogo
  for (let daysBack = 30; daysBack >= 1; daysBack--) {
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

      // Se D+1 e a missão já foi marcada como is_failed nesta execução, pular
      if (daysBack === 1 && setFailedThisRun.has(m.id)) continue;

      // Inicializar cache in-memory de daily_status para esta missão
      if (!dailyStatusCache[m.id]) {
        dailyStatusCache[m.id] = { ...((m as any).daily_status || {}) };
      }
      const effectiveStatus = dailyStatusCache[m.id];

      // Pular se já processado (qualquer estado final)
      if (effectiveStatus[pastDateStr] === 'completed') continue;
      if (effectiveStatus[pastDateStr] === 'failed_accepted') continue;
      if (effectiveStatus[pastDateStr] === 'protected') continue;
      if (effectiveStatus[pastDateStr] === 'grace') continue;

      // Pular se failed_date já aponta para esta data (segurança extra)
      if ((m as any).failed_date === pastDateStr) continue;

      // Check mission_daily_completions
      const { data: completions } = await supabase
        .from('mission_daily_completions')
        .select('id')
        .eq('mission_id', m.id)
        .eq('completion_date', pastDateStr)
        .limit(1);

      if (completions && completions.length > 0) continue;

      // "Nunca falhe duas vezes": a PRIMEIRA falha (dia agendado anterior não foi falha)
      // é perdoada — apenas um alerta gentil, sem penalidade e sem gastar protetor.
      // Só a 2ª falha consecutiva (e seguintes) entra na lógica de protetor/penalidade.
      const isConsecutiveMiss = await previousScheduledWasMiss(
        m.id, days, createdAt, pastDate, effectiveStatus,
      );
      if (!isConsecutiveMiss) {
        totalGrace += 1;
        effectiveStatus[pastDateStr] = 'grace';
        await supabase
          .from('missions')
          .update({ daily_status: effectiveStatus } as any)
          .eq('id', m.id);
        await supabase.from('activity_log').insert({
          user_id: userId,
          action: 'mission_grace',
          description: `Você pulou "${m.title}" em ${pastDateStr} — tudo bem, um dia não quebra nada. Só não deixe acumular: faltar dois dias seguidos te desconecta do hábito.`,
          xp_gained: 0,
        });
        continue;
      }

      if (availableProtectors > 0) {
        effectiveStatus[pastDateStr] = 'protected';
        availableProtectors = Math.max(0, availableProtectors - 1);

        await supabase
          .from('profiles')
          .update({ streak_protector_charges: availableProtectors, streak_protector_week: currentWeek } as any)
          .eq('user_id', userId);

        await supabase
          .from('missions')
          .update({ daily_status: effectiveStatus } as any)
          .eq('id', m.id);

        await supabase.from('activity_log').insert({
          user_id: userId,
          action: 'streak_protected',
          description: `Protetor de Streak usado em ${m.title} (${pastDateStr}). Cargas restantes: ${availableProtectors}/${maxSlots}`,
          xp_gained: 0,
        });

        continue;
      }

      // Esta missão falhou nesta data - calcular penalidade dinâmica
      const xpPenalty = m.xp_reward;
      let hpPenalty = 0;
      let mpPenalty = 0;
      const { data: profile } = await supabase
        .from('profiles')
        .select('level')
        .eq('user_id', userId)
        .single();
      let maxHp = 100;
      let maxMp = 40;
      if (profile && profile.level > 15) {
        const { data: attrs } = await supabase
          .from('attributes')
          .select('name, level')
          .eq('user_id', userId);
        if (attrs) {
          const attrLevels = getAttributeLevels(attrs);
          const stats = getPlayerCombatStats(profile.level, attrLevels);
          maxHp = stats.hp;
          maxMp = stats.mp;
        }
        hpPenalty = Math.round(0.05 * maxHp);
        mpPenalty = Math.round(0.10 * maxMp);
        totalHpPenalty += hpPenalty;
        totalMpPenalty += mpPenalty;
      }
      totalPenalty += xpPenalty;

      // Marcar data como aceita no cache in-memory
      effectiveStatus[pastDateStr] = 'failed_accepted';

      await supabase
        .from('profiles')
        .update({ streak_current_days: 0 } as any)
        .eq('user_id', userId);

      await supabase.from('xp_transactions' as any).insert({
        user_id: userId,
        mission_id: m.id,
        reason: 'mission_failed',
        xp_delta: -xpPenalty,
        gold_delta: 0,
        local_date: pastDateStr,
        description: `Missão fracassada (D+${daysBack} expirou): ${m.title}`,
      });

      if (daysBack === 1) {
        // D+1 (ontem): mostrar no diálogo para o jogador decidir
        setFailedThisRun.add(m.id);
        await supabase
          .from('missions')
          .update({
            is_failed: true,
            xp_penalized: xpPenalty,
            failed_date: pastDateStr,
            daily_status: effectiveStatus,
          } as any)
          .eq('id', m.id);
      } else {
        // D+2+ (2 ou mais dias atrás): penalizar silenciosamente, sem diálogo
        totalSilentPenalty += xpPenalty;
        await supabase
          .from('missions')
          .update({ daily_status: effectiveStatus } as any)
          .eq('id', m.id);
      }
    }
  }

  // Missões únicas (one-shot) com due_date vencido devem sair de "pendente"
  // e ser marcadas como fracassadas, igual ao fluxo recorrente.
  const todayStr = getLocalDateString();
  for (const m of missions) {
    const days = (m.days_of_week as string[]) || [];
    if (days.length > 0) continue; // recorrentes já tratadas acima
    const dueDate = (m as any).due_date as string | null | undefined;
    if (!dueDate) continue;
    if (dueDate >= todayStr) continue; // ainda no prazo

    // Quantos dias atrasada (1 = ontem)
    const dueAtMs = new Date(dueDate + 'T00:00:00').getTime();
    const daysLate = Math.max(1, Math.round((startOfToday.getTime() - dueAtMs) / 86400000));

    // Tenta usar protetor de streak (mesma lógica das recorrentes)
    if (availableProtectors > 0) {
      availableProtectors = Math.max(0, availableProtectors - 1);
      await supabase
        .from('profiles')
        .update({ streak_protector_charges: availableProtectors, streak_protector_week: currentWeek } as any)
        .eq('user_id', userId);
      const dailyStatus = { ...(((m as any).daily_status) || {}), [dueDate]: 'protected' };
      await supabase
        .from('missions')
        .update({ daily_status: dailyStatus } as any)
        .eq('id', m.id);
      await supabase.from('activity_log').insert({
        user_id: userId,
        action: 'streak_protected',
        description: `Protetor de Streak usado em ${m.title} (${dueDate}). Cargas restantes: ${availableProtectors}/${maxSlots}`,
        xp_gained: 0,
      });
      continue;
    }

    // Calcular penalidade dinâmica (mesma fórmula)
    const xpPenalty = m.xp_reward;
    let hpPenalty = 0;
    let mpPenalty = 0;
    const { data: profileLv } = await supabase
      .from('profiles')
      .select('level')
      .eq('user_id', userId)
      .single();
    let maxHp = 100;
    let maxMp = 40;
    if (profileLv && profileLv.level > 15) {
      const { data: attrs } = await supabase
        .from('attributes')
        .select('name, level')
        .eq('user_id', userId);
      if (attrs) {
        const attrLevels = getAttributeLevels(attrs);
        const stats = getPlayerCombatStats(profileLv.level, attrLevels);
        maxHp = stats.hp;
        maxMp = stats.mp;
      }
      hpPenalty = Math.round(0.05 * maxHp);
      mpPenalty = Math.round(0.10 * maxMp);
      totalHpPenalty += hpPenalty;
      totalMpPenalty += mpPenalty;
    }
    totalPenalty += xpPenalty;

    await supabase
      .from('profiles')
      .update({ streak_current_days: 0 } as any)
      .eq('user_id', userId);

    await supabase.from('xp_transactions' as any).insert({
      user_id: userId,
      mission_id: m.id,
      reason: 'mission_failed',
      xp_delta: -xpPenalty,
      gold_delta: 0,
      local_date: dueDate,
      description: `Missão única fracassada (D+${daysLate}): ${m.title}`,
    });

    if (daysLate === 1) {
      // Ontem: mostrar no diálogo
      await supabase
        .from('missions')
        .update({
          is_failed: true,
          xp_penalized: xpPenalty,
          failed_date: dueDate,
        } as any)
        .eq('id', m.id);
    } else {
      // Mais antiga: marcar como fracassada silenciosamente (sai de pendente)
      totalSilentPenalty += xpPenalty;
      await supabase
        .from('missions')
        .update({
          is_failed: true,
          xp_penalized: xpPenalty,
          failed_date: dueDate,
        } as any)
        .eq('id', m.id);
    }
  }

  if (totalPenalty > 0) {
    // 🔒 Server-side: dedução de XP da penalidade via RPC (nível nunca cai).
    await supabase.rpc('apply_xp_penalty', { p_amount: totalPenalty });

    let desc = `Missões fracassadas! -${totalPenalty} XP`;
    if (totalHpPenalty > 0) desc += `, -${totalHpPenalty} HP`;
    if (totalMpPenalty > 0) desc += `, -${totalMpPenalty} MP`;
    await supabase.from('activity_log').insert({
      user_id: userId,
      action: 'mission_failed',
      description: desc,
      xp_gained: -totalPenalty,
    });

    // Toast separado para D+2+ (auto-penalizados) e D+1 (mostrar no diálogo)
    if (totalSilentPenalty > 0) {
      toast.warning(`⚠️ Missões atrasadas (D+2+) auto-penalizadas: -${totalSilentPenalty} XP`);
    }
    const d1Penalty = totalPenalty - totalSilentPenalty;
    if (d1Penalty > 0) {
      let toastMsg = `Missões fracassadas! Você perdeu ${d1Penalty} XP.`;
      if (totalHpPenalty > 0) toastMsg += ` -${totalHpPenalty} HP`;
      if (totalMpPenalty > 0) toastMsg += ` -${totalMpPenalty} MP`;
      toast.error(toastMsg);
    }

    queryClient.invalidateQueries({ queryKey: ['missions'] });
    queryClient.invalidateQueries({ queryKey: ['profile'] });
    queryClient.invalidateQueries({ queryKey: ['failed-missions'] });
  }

  // Alerta gentil da 1ª falha perdoada (nunca falhe 2x) — sem penalidade.
  if (totalGrace > 0) {
    toast(
      totalGrace === 1
        ? '🌙 Você pulou uma missão — tudo bem, um dia não quebra nada. Só não deixe acumular dois dias seguidos. 💪'
        : `🌙 Você pulou ${totalGrace} missões — sem penalidade. Só evite faltar dois dias seguidos na mesma. 💪`,
      { duration: 6000 },
    );
    queryClient.invalidateQueries({ queryKey: ['missions'] });
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
      // 🔒 Server-side: o RPC pay_mission_penalty deduz o ouro, restaura o XP
      // (lido do banco) e marca a missão atomicamente. Cliente não mexe em
      // ouro/XP direto.
      const { error } = await supabase.rpc('pay_mission_penalty', { p_mission_id: mission.id });
      if (error) throw error;
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

      // Restaurar XP perdido com a penalidade (server-side via add_xp_to_user)
      const xpToRestore = mission.xp_penalized || mission.xp_reward;
      await supabase.rpc('add_xp_to_user', { p_user_id: user.id, p_xp: xpToRestore });

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
        local_date: mission.failed_date || new Date().toLocaleDateString('en-CA'),
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
