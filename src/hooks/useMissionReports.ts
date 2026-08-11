import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toDateString, today } from '@/lib/dateUtils';

const DAYS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

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
 * Snapshot dos últimos N dias para o Diário do Herói.
 *
 * Só lê mission_daily_completions. A versão anterior também lia
 * xp_transactions para contar fracassos, penalidades pagas e recuperações —
 * mas essa tabela está vazia desde sempre: quando a falha de missão deixou de
 * drenar XP (torneira única), a escrita sumiu e ninguém percebeu que os KPIs
 * tinham perdido a fonte. O resultado era um painel que mostrava 0 fracassos e
 * 100% de sucesso para qualquer usuário, inclusive quem perdia dias seguidos.
 */
export function useReportsData(days = 30) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['reports-data', user?.id, days],
    queryFn: async () => {
      if (!user) {
        return { missions: [] as MissionLite[], completions: [] as DailyCompletion[] };
      }

      const start = new Date();
      start.setDate(start.getDate() - (days - 1));
      const startStr = toDateString(start);

      const [missionsRes, completionsRes] = await Promise.all([
        supabase
          .from('missions')
          .select('id, title, xp_reward, days_of_week, created_at')
          .eq('user_id', user.id),
        supabase
          .from('mission_daily_completions')
          .select('mission_id, completion_date, xp_earned, gold_earned')
          .eq('user_id', user.id)
          .gte('completion_date', startStr),
      ]);

      return {
        missions: (missionsRes.data || []) as unknown as MissionLite[],
        completions: (completionsRes.data || []) as unknown as DailyCompletion[],
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
};

export type ReportKPIs = {
  totalCompleted: number;
  /** Dias consecutivos, contando hoje, com ao menos uma missão concluída. */
  currentStreak: number;
  /** Maior sequência de dias consecutivos dentro da janela analisada. */
  longestStreak: number;
  /** Dias com ao menos uma conclusão. */
  activeDays: number;
  /** Dias decorridos desde a primeira conclusão da janela (denominador honesto). */
  trackedDays: number;
  /** activeDays / trackedDays, 0..1. */
  resolutionRate: number;
  weeklyTrend: { day: string; date: string; completed: number }[];
  topMastered: MissionStat[];
};

/** Maior sequência de dias consecutivos dentro de um conjunto de datas. */
function maiorSequencia(datas: Set<string>): number {
  if (datas.size === 0) return 0;
  const ordenadas = Array.from(datas).sort();
  let maior = 1;
  let atual = 1;
  for (let i = 1; i < ordenadas.length; i++) {
    const anterior = new Date(`${ordenadas[i - 1]}T00:00:00`);
    const corrente = new Date(`${ordenadas[i]}T00:00:00`);
    const diff = Math.round((corrente.getTime() - anterior.getTime()) / 86_400_000);
    atual = diff === 1 ? atual + 1 : 1;
    if (atual > maior) maior = atual;
  }
  return maior;
}

/**
 * Computa os KPIs do Diário a partir do snapshot.
 *
 * Todas as métricas saem de conclusões reais. Não há mais nada aqui derivado de
 * fracasso: sem registro de falha, qualquer taxa construída sobre ela seria
 * inventada. A leitura passa a ser por constância — quanto tempo você
 * sustentou, e em que fração dos dias apareceu.
 */
export function useComputedReports(days = 30) {
  const { data, isLoading } = useReportsData(days);

  const computed = useMemo<ReportKPIs | null>(() => {
    if (!data) return null;
    const { missions, completions } = data;

    const missionById = new Map<string, MissionLite>();
    for (const m of missions) missionById.set(m.id, m);

    const porMissao = new Map<string, MissionStat>();
    for (const c of completions) {
      let s = porMissao.get(c.mission_id);
      if (!s) {
        s = {
          mission_id: c.mission_id,
          title: missionById.get(c.mission_id)?.title ?? '(missão removida)',
          completed: 0,
        };
        porMissao.set(c.mission_id, s);
      }
      s.completed += 1;
    }

    const totalCompleted = completions.length;
    const diasComConclusao = new Set(completions.map((c) => c.completion_date));
    const activeDays = diasComConclusao.size;
    const longestStreak = maiorSequencia(diasComConclusao);

    // Denominador: dias desde a primeira conclusão da janela, não a janela
    // inteira. Quem começou há três dias não merece 10% por ter 3 de 30.
    let trackedDays = 0;
    if (activeDays > 0) {
      const primeira = Array.from(diasComConclusao).sort()[0];
      const inicio = new Date(`${primeira}T00:00:00`);
      const hoje = new Date(`${today()}T00:00:00`);
      trackedDays = Math.max(
        1,
        Math.round((hoje.getTime() - inicio.getTime()) / 86_400_000) + 1,
      );
    }
    const resolutionRate = trackedDays > 0 ? activeDays / trackedDays : 0;

    // Streak atual: dias consecutivos até hoje. Se nada foi feito hoje, a
    // sequência ainda conta a partir de ontem — o dia não acabou.
    let currentStreak = 0;
    const cursor = new Date();
    if (!diasComConclusao.has(today())) cursor.setDate(cursor.getDate() - 1);
    while (diasComConclusao.has(toDateString(cursor))) {
      currentStreak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }

    const weeklyTrend: ReportKPIs['weeklyTrend'] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = toDateString(d);
      weeklyTrend.push({
        day: DAYS_PT[d.getDay()],
        date: dateStr,
        completed: completions.filter((c) => c.completion_date === dateStr).length,
      });
    }

    const topMastered = Array.from(porMissao.values())
      .sort((a, b) => b.completed - a.completed)
      .slice(0, 5);

    return {
      totalCompleted,
      currentStreak,
      longestStreak,
      activeDays,
      trackedDays,
      resolutionRate,
      weeklyTrend,
      topMastered,
    };
  }, [data]);

  return { kpis: computed, isLoading };
}
