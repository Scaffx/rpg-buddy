import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database, Json } from '@/integrations/supabase/types';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

const DAYS_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

type WeeklyClosureResult = {
  evaluated: number;
  met: number;
  exempt: number;
  grace: number;
  protected: number;
  failed: number;
  protector_charges: number;
  week_start: string;
};

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
  }, [user, queryClient]);
}

export async function runFailedMissionCheck(userId: string, queryClient: any) {
  try {
    await checkAndMarkFailed(userId, queryClient);
  } catch (error) {
    console.error('[FailedMissions] erro ao validar missões fracassadas:', error);
  }
}

async function checkAndMarkFailed(userId: string, queryClient: any) {
  let weeklyClosure: WeeklyClosureResult | null = null;

  // Missões por frequência só são avaliadas depois do domingo. A RPC usa a
  // data de São Paulo no servidor e persiste graça/protetor/falha de forma
  // idempotente antes de o fluxo diário consultar as missões falhadas.
  const { data: weeklyData, error: weeklyError } = await supabase.rpc(
    'check_weekly_mission_failures',
  );
  if (weeklyError) {
    console.error('[FailedMissions] erro no fechamento semanal:', weeklyError);
  } else {
    weeklyClosure = weeklyData as unknown as WeeklyClosureResult;
  }

  // Check up to 30 days back for unchecked failures
  const { data: missions } = await supabase
    .from('missions')
    .select('*')
    .eq('user_id', userId)
    .eq('completed', false)
    .eq('is_failed', false as any);

  if (!missions || missions.length === 0) return;

  // §4/§5 + torneira única (#22): a FALHA não toca XP/ouro/HP/MP. Consequência =
  // só sequência reiniciada + missão marcada não-concluída (visível e recuperável).
  let totalFailed = 0; // falhas reais (sem penalidade de recurso)
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

  // Ontem ainda é registrável (janela D-1, §1.3): adjudicar o dia enquanto ele
  // cabe na janela transforma falha de REGISTRO em falha de HÁBITO — queima
  // graça/protetor e reinicia a sequência de alguém que só não marcou ainda.
  // Por isso a varredura para em anteontem; o dia mais recente adjudicável é o
  // que aparece no diálogo, e os mais antigos são fechados em silêncio.
  const PRIMEIRO_DIA_ADJUDICAVEL = 2;
  for (let daysBack = 30; daysBack >= PRIMEIRO_DIA_ADJUDICAVEL; daysBack--) {
    const pastDate = new Date(startOfToday);
    pastDate.setDate(pastDate.getDate() - daysBack);
    const pastDateStr = getLocalDateString(pastDate);
    const pastDayIndex = pastDate.getDay();
    const pastDayName = DAYS_NAMES[pastDayIndex];

    for (const m of missions) {
      // Missões flexíveis são avaliadas somente no fechamento semanal. Mesmo
      // dados legados com days_of_week preenchido nunca viram falha diária.
      if (m.frequency_type === 'weekly') continue;
      const days = (m.days_of_week as string[]) || [];
      if (days.length === 0) continue;
      if (!days.includes(pastDayName)) continue;

      // Don't penalize if mission was created after this date
      const createdAt = (m as any).created_at?.split('T')[0];
      if (createdAt && createdAt > pastDateStr) continue;

      // Se já marcada como is_failed nesta execução, pular
      if (daysBack === PRIMEIRO_DIA_ADJUDICAVEL && setFailedThisRun.has(m.id)) continue;

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

      // Falha real (graça + protetor esgotados): SEM penalidade de XP/HP/MP.
      // Só reinicia a sequência e marca a missão como não-concluída (recuperável).
      totalFailed += 1;
      effectiveStatus[pastDateStr] = 'failed_accepted';

      await supabase
        .from('profiles')
        .update({ streak_current_days: 0 } as any)
        .eq('user_id', userId);

      if (daysBack === PRIMEIRO_DIA_ADJUDICAVEL) {
        // Dia mais recente já fora da janela: aparece no diálogo, pra a falta
        // ficar visível e recuperável.
        setFailedThisRun.add(m.id);
        await supabase
          .from('missions')
          .update({
            is_failed: true,
            failed_date: pastDateStr,
            daily_status: effectiveStatus,
          } as any)
          .eq('id', m.id);
      } else {
        // Mais antigos: marca silenciosamente como não-concluída (sai de pendente).
        await supabase
          .from('missions')
          .update({ daily_status: effectiveStatus } as any)
          .eq('id', m.id);
      }
    }
  }

  // Missões únicas (one-shot) com due_date vencido devem sair de "pendente"
  // e ser marcadas como fracassadas, igual ao fluxo recorrente — inclusive na
  // janela D-1 (§1.3): ontem ainda é registrável, então ainda não é julgado.
  // Adjudicar a avulsa de ontem a esconde da aba "Ontem" (Missions.tsx filtra
  // is_failed) e mata a marcação retroativa que o servidor aceitaria, sobrando
  // só "Fiz", que por §1.6 não paga XP nem ouro.
  const primeiroDiaAdjudicavel = new Date(startOfToday);
  primeiroDiaAdjudicavel.setDate(primeiroDiaAdjudicavel.getDate() - PRIMEIRO_DIA_ADJUDICAVEL);
  const primeiroDiaAdjudicavelStr = getLocalDateString(primeiroDiaAdjudicavel);
  for (const m of missions) {
    if (m.frequency_type === 'weekly') continue;
    const days = (m.days_of_week as string[]) || [];
    if (days.length > 0) continue; // recorrentes já tratadas acima
    const dueDate = (m as any).due_date as string | null | undefined;
    if (!dueDate) continue;
    if (dueDate > primeiroDiaAdjudicavelStr) continue; // no prazo ou ainda na janela D-1

    // Estado final do dia já resolvido (mesmas guardas do laço recorrente):
    // "Dispensar" grava failed_accepted, "Fiz" grava completed e o protetor grava
    // protected. Sem ler isso, a varredura re-julgava a mesma data a cada
    // carregamento — o card voltava, o protetor queimava de novo e a sequência
    // zerava de novo, e nada do que o usuário decidiu grudava.
    const dailyStatus: Record<string, string> = { ...(((m as any).daily_status) || {}) };
    const statusDoDia = dailyStatus[dueDate];
    if (statusDoDia === 'completed') continue;
    if (statusDoDia === 'failed_accepted') continue;
    if (statusDoDia === 'protected') continue;
    if (statusDoDia === 'grace') continue;

    // Tenta usar protetor de streak (mesma lógica das recorrentes)
    if (availableProtectors > 0) {
      availableProtectors = Math.max(0, availableProtectors - 1);
      await supabase
        .from('profiles')
        .update({ streak_protector_charges: availableProtectors, streak_protector_week: currentWeek } as any)
        .eq('user_id', userId);
      dailyStatus[dueDate] = 'protected';
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

    // Falha de missão única (prazo vencido): SEM penalidade de XP/HP/MP.
    totalFailed += 1;

    await supabase
      .from('profiles')
      .update({ streak_current_days: 0 } as any)
      .eq('user_id', userId);

    await supabase
      .from('missions')
      .update({ is_failed: true, failed_date: dueDate } as any)
      .eq('id', m.id);
  }

  if (totalFailed > 0) {
    // Sem penalidade de recurso (§4/§5): só registra de forma neutra. A sequência
    // já foi reiniciada acima; nada de XP/HP/MP. Copy gentil, focada em retomar.
    await supabase.from('activity_log').insert({
      user_id: userId,
      action: 'mission_failed',
      description: `${totalFailed} missão(ões) não concluída(s) — sequência reiniciada.`,
      xp_gained: 0,
    });

    toast(
      totalFailed === 1
        ? '🌙 Missão não concluída — sequência reiniciada. Recomeçar faz parte. Bora retomar. 💪'
        : `🌙 ${totalFailed} missões não concluídas — sequência reiniciada. Bora retomar. 💪`,
      { duration: 6000 },
    );

    queryClient.invalidateQueries({ queryKey: ['missions'] });
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

  if (weeklyClosure && weeklyClosure.evaluated > 0) {
    if (weeklyClosure.failed > 0) {
      toast(
        weeklyClosure.failed === 1
          ? '🌙 Uma meta semanal ficou abaixo do alvo — sequência reiniciada. Bora retomar nesta semana. 💪'
          : `🌙 ${weeklyClosure.failed} metas semanais ficaram abaixo do alvo — sequência reiniciada. Bora retomar. 💪`,
        { duration: 6500 },
      );
    }

    if (weeklyClosure.protected > 0) {
      toast(
        weeklyClosure.protected === 1
          ? `🛡️ Um protetor salvou sua meta semanal. Restam ${weeklyClosure.protector_charges} carga(s).`
          : `🛡️ ${weeklyClosure.protected} protetores salvaram metas semanais. Restam ${weeklyClosure.protector_charges} carga(s).`,
        { duration: 6000 },
      );
    }

    if (weeklyClosure.grace > 0) {
      toast(
        weeklyClosure.grace === 1
          ? '🌱 Primeira semana abaixo da meta: graça aplicada. Uma semana não quebra o hábito — só não deixe virar duas.'
          : `🌱 Graça aplicada em ${weeklyClosure.grace} metas semanais. Só não deixe virar duas semanas seguidas.`,
        { duration: 6000 },
      );
    }

    queryClient.invalidateQueries({ queryKey: ['missions'] });
    queryClient.invalidateQueries({ queryKey: ['failed-missions'] });
    queryClient.invalidateQueries({ queryKey: ['profile'] });
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

async function clearFailedMissionState(
  userId: string,
  mission: Pick<Database['public']['Tables']['missions']['Row'], 'id' | 'failed_date'>,
  dayStatus: 'failed_accepted' | 'completed',
) {
  const { data: missionData, error: readError } = await supabase
    .from('missions')
    .select('status,daily_status')
    .eq('id', mission.id)
    .eq('user_id', userId)
    .single();
  if (readError) throw readError;
  if (!missionData) throw new Error('MISSION_NOT_FOUND');

  const currentStatus = missionData.status;
  const storedDailyStatus = missionData.daily_status;
  const dailyStatus: Record<string, Json | undefined> =
    storedDailyStatus && typeof storedDailyStatus === 'object' && !Array.isArray(storedDailyStatus)
      ? { ...storedDailyStatus }
      : {};
  if (mission.failed_date) dailyStatus[mission.failed_date] = dayStatus;

  // Only a legacy NULL receives an explicit active status. Archive/pause stay
  // as stored, and the status predicate prevents overwriting a concurrent edit.
  const update = supabase
    .from('missions')
    .update({
      is_failed: false,
      failed_date: null,
      daily_status: dailyStatus,
      ...(currentStatus === null ? { status: 'pendente' } : {}),
    })
    .eq('id', mission.id)
    .eq('user_id', userId)
    .eq('is_failed', true);
  const guardedUpdate = currentStatus === null
    ? update.is('status', null)
    : update.eq('status', currentStatus);
  const { data: updatedMission, error: updateError } = await guardedUpdate
    .select('id')
    .maybeSingle();
  if (updateError) throw updateError;
  if (!updatedMission) throw new Error('MISSION_RESOLUTION_NOT_APPLIED');
}

// usePayPenalty REMOVIDO (§4/§5 + torneira única): chamava pay_mission_penalty,
// que restaura XP (gold→XP) — um escritor de XP fora do complete_mission. A RPC
// segue definida no banco (sem migration), mas não é mais chamada em lugar nenhum.

/**
 * Dispensa uma ou várias missões fracassadas.
 *
 * "Dispensar todas" precisa dispensar **todas**. Antes, um erro em qualquer
 * missão abortava o laço com `throw`: as anteriores já tinham sido gravadas, as
 * seguintes nem eram tentadas, e o usuário via um erro genérico sem saber quais
 * das duas coisas aconteceu. Agora cada missão é tentada de forma independente e
 * os erros são acumulados — só no fim, se sobrou alguma, o erro é levantado
 * dizendo quantas passaram e quantas não.
 */
export async function dismissFailedMissions(
  userId: string,
  missions: any | any[],
): Promise<{ dispensadas: number; falharam: string[] }> {
  const missionList = Array.isArray(missions) ? missions : [missions];
  const falharam: string[] = [];
  let dispensadas = 0;

  for (const mission of missionList) {
    try {
      if (mission.frequency_type === 'weekly') {
        const { error } = await supabase.rpc('resolve_weekly_mission_failure', {
          p_mission_id: mission.id,
          p_resolution: 'dismissed',
        });
        if (error) throw error;
        dispensadas += 1;
        continue;
      }

      // Marca o fracasso como aceito sem pagar XP ou reabrir arquivadas/pausadas.
      await clearFailedMissionState(userId, mission, 'failed_accepted');

      await supabase.from('activity_log').insert({
        user_id: userId,
        action: 'mission_dismissed',
        description: `Dispensou a missão não concluída: ${mission.title} (${mission.failed_date || 'hoje'})`,
        xp_gained: 0,
      });
      dispensadas += 1;
    } catch {
      falharam.push(String(mission.title || mission.id));
    }
  }

  if (falharam.length > 0) {
    throw new Error(
      dispensadas > 0
        ? `Dispensei ${dispensadas}, mas ${falharam.length} não deu: ${falharam.join(', ')}. Tente de novo nessas.`
        : `Não consegui dispensar: ${falharam.join(', ')}.`,
    );
  }

  return { dispensadas, falharam };
}

export function useAcceptPenalty() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (missions: any | any[]) => {
      if (!user) throw new Error('Não autenticado');
      return dismissFailedMissions(user.id, missions);
    },
    // Roda no sucesso E no erro: numa dispensa parcial, as que passaram já estão
    // gravadas e a lista precisa refletir isso.
    onSettled: () => {
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

      if (mission.frequency_type === 'weekly') {
        const { error } = await supabase.rpc('resolve_weekly_mission_failure', {
          p_mission_id: mission.id,
          p_resolution: 'recovered',
        });
        if (error) throw error;
        return;
      }

      // Limpar a falha + marcar o dia, com status explicito apenas no legado NULL.
      await clearFailedMissionState(user.id, mission, 'completed');

      // SUB-DECISÃO (flag no PR p/ Murillo): recuperar NÃO concede XP. A torneira
      // única é só o complete_mission — aqui não há restore bespoke. Apenas reabilita
      // a contagem da sequência. (Se a decisão for que recuperar concede XP, tem que
      // ser via complete_mission, mas o clamp de data dele quebra recuperação antiga.)
      await supabase.from('activity_log').insert({
        user_id: user.id,
        action: 'mission_failed_recovered',
        description: `Recuperou missão: ${mission.title}`,
        xp_gained: 0,
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
