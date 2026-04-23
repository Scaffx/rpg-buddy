import { useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import { useMissions } from '@/hooks/useProfile';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Circle, AlertTriangle, CheckCircle2, RotateCcw, TrendingDown, TrendingUp, Calendar } from 'lucide-react';

function toLocalDate(d: Date) {
  return d.toLocaleDateString('en-CA');
}

function getLast7Days(): string[] {
  const days: string[] = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    days.push(toLocalDate(d));
  }
  return days;
}

function useWeeklyActivity() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['virtues_weekly_activity', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const startOfWeek = new Date();
      startOfWeek.setDate(startOfWeek.getDate() - 7);
      startOfWeek.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from('activity_log')
        .select('action, description, created_at')
        .eq('user_id', user!.id)
        .gte('created_at', startOfWeek.toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as any[];
    },
  });
}

export default function VirtuesPage() {
  const { data: missions = [] } = useMissions();
  const { data: activity = [] } = useWeeklyActivity();

  const weekDays = useMemo(() => getLast7Days(), []);

  // Estatísticas por missão
  const missionStats = useMemo(() => {
    const stats = new Map<string, {
      title: string;
      completed: number;
      failed: number;
      recovered: number;
    }>();

    (missions as any[]).forEach((m) => {
      const dailyStatus = (m.daily_status || {}) as Record<string, string>;
      let completed = 0;
      let failed = 0;
      let recovered = 0;

      weekDays.forEach((day) => {
        const status = dailyStatus[day];
        if (status === 'completed') completed++;
        else if (status === 'failed') failed++;
        else if (status === 'failed_accepted') recovered++;
      });

      // Inclui apenas missões com algum movimento na semana
      if (completed + failed + recovered > 0) {
        stats.set(m.id, { title: m.title, completed, failed, recovered });
      }
    });

    return Array.from(stats.values());
  }, [missions, weekDays]);

  // Totais
  const totals = useMemo(() => {
    return missionStats.reduce(
      (acc, s) => ({
        completed: acc.completed + s.completed,
        failed: acc.failed + s.failed,
        recovered: acc.recovered + s.recovered,
      }),
      { completed: 0, failed: 0, recovered: 0 },
    );
  }, [missionStats]);

  // Top 5 mais cumpridas / mais falhadas
  const topCompleted = useMemo(
    () => [...missionStats].filter((s) => s.completed > 0).sort((a, b) => b.completed - a.completed).slice(0, 5),
    [missionStats],
  );
  const topFailed = useMemo(
    () => [...missionStats].filter((s) => s.failed > 0).sort((a, b) => b.failed - a.failed).slice(0, 5),
    [missionStats],
  );

  // Atividade por dia (concluídas vs falhadas)
  const dailyBreakdown = useMemo(() => {
    return weekDays.map((day) => {
      let c = 0, f = 0, r = 0;
      (missions as any[]).forEach((m) => {
        const s = (m.daily_status || {})[day];
        if (s === 'completed') c++;
        else if (s === 'failed') f++;
        else if (s === 'failed_accepted') r++;
      });
      const date = new Date(day + 'T12:00:00');
      const label = date.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' });
      return { day, label, completed: c, failed: f, recovered: r };
    });
  }, [missions, weekDays]);

  const totalActions = totals.completed + totals.failed + totals.recovered;
  const successRate = totalActions > 0 ? Math.round((totals.completed / totalActions) * 100) : 0;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Circle className="w-7 h-7 text-primary" />
          <div>
            <h1 className="text-2xl font-display font-bold text-primary">Virtudes</h1>
            <p className="text-xs text-muted-foreground">
              Relatório semanal das suas missões — últimos 7 dias
            </p>
          </div>
        </div>

        {/* Cards de resumo */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rpg-card p-4 space-y-1">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span className="text-xs text-muted-foreground">Concluídas</span>
            </div>
            <p className="text-2xl font-bold text-emerald-400">{totals.completed}</p>
          </div>

          <div className="rpg-card p-4 space-y-1">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <span className="text-xs text-muted-foreground">Falhadas</span>
            </div>
            <p className="text-2xl font-bold text-red-400">{totals.failed}</p>
          </div>

          <div className="rpg-card p-4 space-y-1">
            <div className="flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-amber-400" />
              <span className="text-xs text-muted-foreground">Recuperadas</span>
            </div>
            <p className="text-2xl font-bold text-amber-400">{totals.recovered}</p>
            <p className="text-[10px] text-muted-foreground">Marcadas como "fiz" depois de falhar</p>
          </div>

          <div className="rpg-card p-4 space-y-1">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              <span className="text-xs text-muted-foreground">Taxa de sucesso</span>
            </div>
            <p className="text-2xl font-bold text-primary">{successRate}%</p>
          </div>
        </div>

        {/* Breakdown diário */}
        <div className="rpg-card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            <h2 className="text-sm font-bold text-foreground">ATIVIDADE DIÁRIA (7 DIAS)</h2>
          </div>

          <div className="grid grid-cols-7 gap-2">
            {dailyBreakdown.map((d) => {
              const total = d.completed + d.failed + d.recovered;
              const pctC = total > 0 ? (d.completed / total) * 100 : 0;
              const pctF = total > 0 ? (d.failed / total) * 100 : 0;
              const pctR = total > 0 ? (d.recovered / total) * 100 : 0;

              return (
                <div key={d.day} className="space-y-1.5 text-center">
                  <p className="text-[10px] uppercase font-bold text-muted-foreground">{d.label}</p>
                  <div className="h-24 flex flex-col-reverse rounded-md overflow-hidden border border-border/50 bg-muted/20">
                    <div className="bg-emerald-500/70" style={{ height: `${pctC}%` }} title={`${d.completed} concluídas`} />
                    <div className="bg-amber-500/70" style={{ height: `${pctR}%` }} title={`${d.recovered} recuperadas`} />
                    <div className="bg-red-500/70" style={{ height: `${pctF}%` }} title={`${d.failed} falhadas`} />
                  </div>
                  <p className="text-[10px] font-semibold text-foreground">{total}</p>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/70" /> Concluídas</div>
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-500/70" /> Recuperadas</div>
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-red-500/70" /> Falhadas</div>
          </div>
        </div>

        {/* Mais cumpridas e mais falhadas */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rpg-card p-5 space-y-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
              <h2 className="text-sm font-bold text-foreground">SUAS VIRTUDES</h2>
            </div>
            <p className="text-xs text-muted-foreground">Missões que você mais cumpriu nesta semana</p>
            {topCompleted.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Nenhuma missão concluída esta semana ainda.</p>
            ) : (
              <ul className="space-y-2">
                {topCompleted.map((s, i) => (
                  <li key={s.title} className="flex items-center justify-between p-2 rounded-md bg-emerald-500/5 border border-emerald-500/20">
                    <span className="text-xs text-foreground truncate flex-1">
                      <span className="text-emerald-400 font-bold mr-2">#{i + 1}</span>
                      {s.title}
                    </span>
                    <span className="text-xs font-bold text-emerald-400 ml-2">{s.completed}x</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rpg-card p-5 space-y-3">
            <div className="flex items-center gap-2">
              <TrendingDown className="w-5 h-5 text-red-400" />
              <h2 className="text-sm font-bold text-foreground">PONTOS DE ATENÇÃO</h2>
            </div>
            <p className="text-xs text-muted-foreground">Missões em que você mais falhou nesta semana</p>
            {topFailed.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Nenhuma falha esta semana — excelente! 🎉</p>
            ) : (
              <ul className="space-y-2">
                {topFailed.map((s, i) => (
                  <li key={s.title} className="flex items-center justify-between p-2 rounded-md bg-red-500/5 border border-red-500/20">
                    <span className="text-xs text-foreground truncate flex-1">
                      <span className="text-red-400 font-bold mr-2">#{i + 1}</span>
                      {s.title}
                    </span>
                    <span className="text-xs font-bold text-red-400 ml-2">{s.failed}x</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Detalhamento por missão */}
        {missionStats.length > 0 && (
          <div className="rpg-card p-5 space-y-3">
            <h2 className="text-sm font-bold text-foreground">DETALHAMENTO POR MISSÃO</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left py-2 px-2 font-medium">Missão</th>
                    <th className="text-center py-2 px-2 font-medium text-emerald-400">✓</th>
                    <th className="text-center py-2 px-2 font-medium text-amber-400">↻</th>
                    <th className="text-center py-2 px-2 font-medium text-red-400">✗</th>
                    <th className="text-center py-2 px-2 font-medium">Taxa</th>
                  </tr>
                </thead>
                <tbody>
                  {missionStats
                    .sort((a, b) => (b.completed + b.failed + b.recovered) - (a.completed + a.failed + a.recovered))
                    .map((s) => {
                      const total = s.completed + s.failed + s.recovered;
                      const rate = total > 0 ? Math.round(((s.completed + s.recovered) / total) * 100) : 0;
                      const rateColor = rate >= 70 ? 'text-emerald-400' : rate >= 40 ? 'text-amber-400' : 'text-red-400';
                      return (
                        <tr key={s.title} className="border-b border-border/30 hover:bg-muted/20">
                          <td className="py-2 px-2 text-foreground truncate max-w-xs">{s.title}</td>
                          <td className="text-center py-2 px-2 text-emerald-400 font-semibold">{s.completed}</td>
                          <td className="text-center py-2 px-2 text-amber-400 font-semibold">{s.recovered}</td>
                          <td className="text-center py-2 px-2 text-red-400 font-semibold">{s.failed}</td>
                          <td className={`text-center py-2 px-2 font-bold ${rateColor}`}>{rate}%</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-muted-foreground italic">
              ✓ Concluídas no dia · ↻ Recuperadas (marcadas como feitas após falhar) · ✗ Falhadas
            </p>
          </div>
        )}

        {missionStats.length === 0 && (
          <div className="rpg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">
              Nenhuma atividade de missões nos últimos 7 dias. Comece a cumprir suas missões diárias para ver seu relatório aqui!
            </p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
