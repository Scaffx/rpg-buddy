import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import AppLayout from '@/components/AppLayout';
import { useMissions } from '@/hooks/useProfile';
import { AlertTriangle, BookOpen, CheckCircle2, RotateCcw, ScrollText, TrendingDown, TrendingUp, Calendar } from 'lucide-react';
import GuidedTour, { type TourStep } from '@/components/GuidedTour';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { JournalArchive } from '@/components/JournalArchive';

type VirtueMission = {
  id: string;
  title: string;
  daily_status?: unknown;
};

function getDailyStatus(mission: VirtueMission): Record<string, string> {
  if (!mission.daily_status || typeof mission.daily_status !== 'object' || Array.isArray(mission.daily_status)) {
    return {};
  }
  return mission.daily_status as Record<string, string>;
}

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

export default function VirtuesPage() {
  const { t, i18n } = useTranslation();
  const virtuesTourSteps: TourStep[] = [
    { target: 'virtues-header',   title: t('app.virtues.tour_1_title'), description: t('app.virtues.tour_1_desc') },
    { target: 'virtues-stats',    title: t('app.virtues.tour_2_title'), description: t('app.virtues.tour_2_desc') },
    { target: 'virtues-calendar', title: t('app.virtues.tour_3_title'), description: t('app.virtues.tour_3_desc') },
    { target: 'virtues-rankings', title: t('app.virtues.tour_4_title'), description: t('app.virtues.tour_4_desc') },
  ];
  const { data: missions = [] } = useMissions();
  const virtueMissions = missions as VirtueMission[];

  const weekDays = useMemo(() => getLast7Days(), []);

  // Estatisticas por missao
  const missionStats = useMemo(() => {
    const stats = new Map<string, {
      title: string;
      completed: number;
      failed: number;
      recovered: number;
    }>();

    virtueMissions.forEach((m) => {
      const dailyStatus = getDailyStatus(m);
      let completed = 0;
      let failed = 0;
      let recovered = 0;

      weekDays.forEach((day) => {
        const status = dailyStatus[day];
        if (status === 'completed') completed++;
        else if (status === 'failed') failed++;
        else if (status === 'failed_accepted') recovered++;
      });

      // Inclui apenas missoes com algum movimento na semana
      if (completed + failed + recovered > 0) {
        stats.set(m.id, { title: m.title, completed, failed, recovered });
      }
    });

    return Array.from(stats.values());
  }, [virtueMissions, weekDays]);

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

  // Atividade por dia (concluidas vs falhadas)
  const dailyBreakdown = useMemo(() => {
    return weekDays.map((day) => {
      let c = 0, f = 0, r = 0;
      virtueMissions.forEach((m) => {
        const s = getDailyStatus(m)[day];
        if (s === 'completed') c++;
        else if (s === 'failed') f++;
        else if (s === 'failed_accepted') r++;
      });
      const date = new Date(day + 'T12:00:00');
      const locale = i18n.resolvedLanguage === 'pt' ? 'pt-BR' : i18n.resolvedLanguage;
      const label = date.toLocaleDateString(locale, { weekday: 'short', day: '2-digit' });
      return { day, label, completed: c, failed: f, recovered: r };
    });
  }, [i18n.resolvedLanguage, virtueMissions, weekDays]);

  const totalActions = totals.completed + totals.failed + totals.recovered;
  const successRate = totalActions > 0 ? Math.round((totals.completed / totalActions) * 100) : 0;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div data-tour="virtues-header" className="flex items-center gap-3">
          <BookOpen className="w-7 h-7 text-primary" />
          <div>
            <h1 className="text-2xl font-display font-bold text-primary">{t('app.virtues.title')}</h1>
            <p className="text-xs text-muted-foreground">
              {t('app.virtues.subtitle')}
            </p>
          </div>
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="overview" className="gap-2">
              <Calendar className="w-4 h-4" /> {t('app.virtues.tab_overview')}
            </TabsTrigger>
            <TabsTrigger value="journals" className="gap-2">
              <ScrollText className="w-4 h-4" /> {t('app.virtues.tab_journals')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6 mt-6">

        {/* Cards de resumo */}
        <div data-tour="virtues-stats" className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rpg-card p-4 space-y-1">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span className="text-xs text-muted-foreground">{t('app.virtues.completed')}</span>
            </div>
            <p className="text-2xl font-bold text-emerald-400">{totals.completed}</p>
          </div>

          <div className="rpg-card p-4 space-y-1">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <span className="text-xs text-muted-foreground">{t('app.virtues.failed')}</span>
            </div>
            <p className="text-2xl font-bold text-red-400">{totals.failed}</p>
          </div>

          <div className="rpg-card p-4 space-y-1">
            <div className="flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-amber-400" />
              <span className="text-xs text-muted-foreground">{t('app.virtues.recovered')}</span>
            </div>
            <p className="text-2xl font-bold text-amber-400">{totals.recovered}</p>
            <p className="text-[10px] text-muted-foreground">{t('app.virtues.recovered_hint')}</p>
          </div>

          <div className="rpg-card p-4 space-y-1">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              <span className="text-xs text-muted-foreground">{t('app.virtues.success_rate')}</span>
            </div>
            <p className="text-2xl font-bold text-primary">{successRate}%</p>
          </div>
        </div>

        {/* Breakdown diario */}
        <div data-tour="virtues-calendar" className="rpg-card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            <h2 className="text-sm font-bold text-foreground">{t('app.virtues.daily_activity')}</h2>
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
                    <div className="bg-emerald-500/70" style={{ height: `${pctC}%` }} title={`${d.completed} ${t('app.virtues.completed').toLowerCase()}`} />
                    <div className="bg-amber-500/70" style={{ height: `${pctR}%` }} title={`${d.recovered} ${t('app.virtues.recovered').toLowerCase()}`} />
                    <div className="bg-red-500/70" style={{ height: `${pctF}%` }} title={`${d.failed} ${t('app.virtues.failed').toLowerCase()}`} />
                  </div>
                  <p className="text-[10px] font-semibold text-foreground">{total}</p>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/70" /> {t('app.virtues.completed')}</div>
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-500/70" /> {t('app.virtues.recovered')}</div>
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-red-500/70" /> {t('app.virtues.failed')}</div>
          </div>
        </div>

        {/* Mais cumpridas e mais falhadas */}
        <div data-tour="virtues-rankings" className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rpg-card p-5 space-y-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
              <h2 className="text-sm font-bold text-foreground">{t('app.virtues.your_virtues')}</h2>
            </div>
            <p className="text-xs text-muted-foreground">{t('app.virtues.your_virtues_hint')}</p>
            {topCompleted.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">{t('app.virtues.no_completed')}</p>
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
              <h2 className="text-sm font-bold text-foreground">{t('app.virtues.attention_points')}</h2>
            </div>
            <p className="text-xs text-muted-foreground">{t('app.virtues.attention_points_hint')}</p>
            {topFailed.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">{t('app.virtues.no_failed')}</p>
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

        {/* Detalhamento por missao */}
        {missionStats.length > 0 && (
          <div className="rpg-card p-5 space-y-3">
            <h2 className="text-sm font-bold text-foreground">{t('app.virtues.mission_breakdown')}</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left py-2 px-2 font-medium">{t('app.virtues.table_mission')}</th>
                    <th className="text-center py-2 px-2 font-medium text-emerald-400">{t('app.virtues.completed_short')}</th>
                    <th className="text-center py-2 px-2 font-medium text-amber-400">{t('app.virtues.recovered_short')}</th>
                    <th className="text-center py-2 px-2 font-medium text-red-400">{t('app.virtues.failed_short')}</th>
                    <th className="text-center py-2 px-2 font-medium">{t('app.virtues.table_rate')}</th>
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
              {t('app.virtues.table_legend')}
            </p>
          </div>
        )}

        {missionStats.length === 0 && (
          <div className="rpg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">
              {t('app.virtues.empty_state')}
            </p>
          </div>
        )}
          </TabsContent>

          <TabsContent value="journals" className="mt-6">
            <JournalArchive />
          </TabsContent>
        </Tabs>
      </div>
      <GuidedTour tourKey="virtues" steps={virtuesTourSteps} />
    </AppLayout>
  );
}
