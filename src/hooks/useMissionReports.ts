import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toDateString, today } from '@/lib/dateUtils';

const DAYS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export type XpTransaction = {
  id: string;
  user_id: string;
  mission_id: string | null;
  reason: string;
  xp_delta: number;
  gold_delta: number;
  local_date: string;
  description: string | null;
  created_at: string;
};

export type MissionLite = {
  id: string;
  title: string;
  xp_reward: number;
  days_of_week?: string[] | null;
  created_at?: string | null;
};

export type DailyCompletion = {
  mission_id: string;
  completion_date: string;
  xp_earned: number;
  gold_earned: number | null;
};

/**
 * Pega últimos N dias de transações de XP, completions e missões
 * para calcular KPIs e insights do relatório.
 */
export function useReportsData(days = 30) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['reports-data', user?.id, days],
    queryFn: async () => {
      if (!user) {
        return {
          missions: [] as MissionLite[],
          completions: [] as DailyCompletion[],
          transactions: [] as XpTransaction[],
        };
      }

      const start = new Date();
      start.setDate(start.getDate() - (days - 1));
      const startStr = toDateString(start);

      const [missionsRes, completionsRes, txRes] = await Promise.all([
        supabase
          .from('missions')
          .select('id, title, xp_reward, days_of_week, created_at')
          .eq('user_id', user.id),
        supabase
          .from('mission_daily_completions')
          .select('mission_id, completion_date, xp_earned, gold_earned')
          .eq('user_id', user.id)
          .gte('completion_date', startStr),
        supabase
          .from('xp_transactions' as any)
          .select('*')
          .eq('user_id', user.id)
          .gte('local_date', startStr)
          .order('local_date', { ascending: false }),
      ]);

      return {
        missions: (missionsRes.data || []) as unknown as MissionLite[],
        completions: (completionsRes.data || []) as unknown as DailyCompletion[],
        transactions: (txRes.data || []) as unknown as XpTransaction[],
      };
    },
    enabled: !!user,
    staleTime: 60_000,
  });
}

export type MissionStat = {
  mission_id: string;
  title: string;
  completed: number;
  failed: number;
  paid: number;
  recovered: number;
  total: number;
  failureRate: number; // 0..1
  successRate: number;
};

export type ReportKPIs = {
  conversionRate: number; // 0..1
  totalCompleted: number;
  totalFailed: number;
  totalPaid: number;
  totalRecovered: number;
  xpSavedByGold: number; // XP restaurado via pagamento com ouro
  goldSpent: number;
  currentStreak: number;
  weeklyTrend: { day: string; date: string; completed: number; failed: number }[];
  topFailing: MissionStat[];
  topMastered: MissionStat[];
  alerts: MissionStat[]; // missões com >70% de fracasso
};

/**
 * Computa KPIs e insights a partir do snapshot retornado por useReportsData.
 */
export function useComputedReports(days = 30) {
  const { data, isLoading } = useReportsData(days);

  const computed = useMemo<ReportKPIs | null>(() => {
    if (!data) return null;
    const { missions, completions, transactions } = data;

    const missionById = new Map<string, MissionLite>();
    for (const m of missions) missionById.set(m.id, m);

    // Stats por missão
    const stats = new Map<string, MissionStat>();
    const ensure = (id: string): MissionStat => {
      let s = stats.get(id);
      if (!s) {
        const m = missionById.get(id);
        s = {
          mission_id: id,
          title: m?.title ?? '(missão removida)',
          completed: 0,
          failed: 0,
          paid: 0,
          recovered: 0,
          total: 0,
          failureRate: 0,
          successRate: 0,
        };
        stats.set(id, s);
      }
      return s;
    };

    for (const c of completions) ensure(c.mission_id).completed += 1;

    let xpSavedByGold = 0;
    let goldSpent = 0;
    let totalFailed = 0;
    let totalRecovered = 0;
    let totalPaid = 0;
    for (const t of transactions) {
      if (!t.mission_id) continue;
      const s = ensure(t.mission_id);
      switch (t.reason) {
        case 'mission_failed':
          s.failed += 1;
          totalFailed += 1;
          break;
        case 'penalty_paid_with_gold':
          s.paid += 1;
          totalPaid += 1;
          xpSavedByGold += t.xp_delta;
          goldSpent += Math.abs(t.gold_delta || 0);
          break;
        case 'mission_recovered':
          s.recovered += 1;
          totalRecovered += 1;
          break;
        default:
          break;
      }
    }

    // Total = tentativas (concluídas + fracassadas que não foram pagas/recuperadas)
    const allStats = Array.from(stats.values()).map((s) => {
      // Considera fracasso "líquido" o que não foi recuperado nem pago
      const netFailed = Math.max(0, s.failed - s.paid - s.recovered);
      const total = s.completed + netFailed;
      const failureRate = total > 0 ? netFailed / total : 0;
      const successRate = total > 0 ? s.completed / total : 0;
      return { ...s, failed: netFailed, total, failureRate, successRate };
    });

    const totalCompleted = allStats.reduce((acc, s) => acc + s.completed, 0);
    const totalNetFailed = allStats.reduce((acc, s) => acc + s.failed, 0);
    const conversionDen = totalCompleted + totalNetFailed;
    const conversionRate = conversionDen > 0 ? totalCompleted / conversionDen : 0;

    // Tendência semanal (últimos 7 dias)
    const weeklyTrend: ReportKPIs['weeklyTrend'] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = toDateString(d);
      const completed = completions.filter((c) => c.completion_date === dateStr).length;
      const failed = transactions.filter(
        (t) => t.local_date === dateStr && t.reason === 'mission_failed',
      ).length;
      weeklyTrend.push({ day: DAYS_PT[d.getDay()], date: dateStr, completed, failed });
    }

    // Streak atual: dias consecutivos (incluindo hoje) com pelo menos 1 conclusão
    let currentStreak = 0;
    const completionsByDate = new Set(completions.map((c) => c.completion_date));
    const todayStr = today();
    if (completionsByDate.has(todayStr)) {
      currentStreak = 1;
      const cursor = new Date();
      while (true) {
        cursor.setDate(cursor.getDate() - 1);
        const ds = toDateString(cursor);
        if (completionsByDate.has(ds)) currentStreak += 1;
        else break;
      }
    } else {
      // se não fez nada hoje, conta a partir de ontem (streak ainda viva mas pendente)
      const cursor = new Date();
      cursor.setDate(cursor.getDate() - 1);
      while (true) {
        const ds = toDateString(cursor);
        if (completionsByDate.has(ds)) {
          currentStreak += 1;
          cursor.setDate(cursor.getDate() - 1);
        } else break;
      }
    }

    const withActivity = allStats.filter((s) => s.total > 0);
    const topFailing = [...withActivity]
      .filter((s) => s.failed > 0)
      .sort((a, b) => b.failureRate - a.failureRate || b.failed - a.failed)
      .slice(0, 3);
    const topMastered = [...withActivity]
      .filter((s) => s.completed > 0)
      .sort((a, b) => b.successRate - a.successRate || b.completed - a.completed)
      .slice(0, 3);
    const alerts = withActivity.filter((s) => s.failureRate >= 0.7 && s.total >= 3);

    return {
      conversionRate,
      totalCompleted,
      totalFailed: totalNetFailed,
      totalPaid,
      totalRecovered,
      xpSavedByGold,
      goldSpent,
      currentStreak,
      weeklyTrend,
      topFailing,
      topMastered,
      alerts,
    };
  }, [data]);

  return { kpis: computed, isLoading };
}

/**
 * Datas (YYYY-MM-DD) com pelo menos 1 missão fracassada nos últimos N dias.
 * Usado para o calendário "Don't break the chain".
 */
export function useFailedDates(days = 60) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['failed-dates', user?.id, days],
    queryFn: async () => {
      if (!user) return [] as string[];
      const start = new Date();
      start.setDate(start.getDate() - (days - 1));
      const { data, error } = await supabase
        .from('xp_transactions' as any)
        .select('local_date, reason')
        .eq('user_id', user.id)
        .eq('reason', 'mission_failed')
        .gte('local_date', toDateString(start));
      if (error) throw error;
      const set = new Set<string>();
      for (const row of (data || []) as any[]) set.add(row.local_date);
      return Array.from(set);
    },
    enabled: !!user,
    staleTime: 60_000,
  });
}
