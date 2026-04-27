import { motion } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { AlertTriangle, Award, Coins, Flame, Loader2, Target, TrendingUp } from 'lucide-react';
import { useComputedReports, type MissionStat } from '@/hooks/useMissionReports';
import { Progress } from '@/components/ui/progress';

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  accent = 'primary',
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  hint?: string;
  accent?: 'primary' | 'success' | 'destructive' | 'gold';
}) {
  const accentClass =
    accent === 'success'
      ? 'text-emerald-400 border-emerald-400/30'
      : accent === 'destructive'
      ? 'text-destructive border-destructive/30'
      : accent === 'gold'
      ? 'text-amber-400 border-amber-400/30'
      : 'text-primary border-primary/30';

  return (
    <div className={`rpg-card border ${accentClass} bg-card/60`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`w-4 h-4 ${accentClass.split(' ')[0]}`} />
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <p className={`text-2xl font-display font-bold ${accentClass.split(' ')[0]}`}>{value}</p>
      {hint && <p className="text-[10px] text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

function MissionRow({ stat, mode }: { stat: MissionStat; mode: 'fail' | 'success' }) {
  const pct = Math.round((mode === 'fail' ? stat.failureRate : stat.successRate) * 100);
  const barClass = mode === 'fail' ? 'bg-destructive' : 'bg-emerald-400';
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground truncate">{stat.title}</p>
        <span className={`text-xs font-bold ${mode === 'fail' ? 'text-destructive' : 'text-emerald-400'}`}>
          {pct}%
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted/30 overflow-hidden">
        <div className={`h-full ${barClass}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[10px] text-muted-foreground">
        {stat.completed} feitas · {stat.failed} fracassos · {stat.paid} pagas · {stat.recovered} recuperadas
      </p>
    </div>
  );
}

export default function ReportsPanel() {
  const { kpis, isLoading } = useComputedReports(30);

  if (isLoading || !kpis) {
    return (
      <div className="rpg-card-glow flex justify-center py-10">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const conversionPct = Math.round(kpis.conversionRate * 100);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 }}
      className="space-y-4"
    >
      <h2 className="text-lg font-display font-semibold text-foreground">
        📊 Relatório de Missões (30 dias)
      </h2>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={Target}
          label="Taxa de Conversão"
          value={`${conversionPct}%`}
          hint={`${kpis.totalCompleted} feitas · ${kpis.totalFailed} fracassos`}
          accent="primary"
        />
        <StatCard
          icon={Flame}
          label="Streak Atual"
          value={`${kpis.currentStreak} ${kpis.currentStreak === 1 ? 'dia' : 'dias'}`}
          hint="Dias seguidos com ao menos 1 missão"
          accent="gold"
        />
        <StatCard
          icon={Coins}
          label="XP Salvo com 🪙"
          value={`+${kpis.xpSavedByGold} XP`}
          hint={`${kpis.totalPaid} penalidades pagas (${kpis.goldSpent} 🪙)`}
          accent="success"
        />
        <StatCard
          icon={Award}
          label="Recuperadas"
          value={`${kpis.totalRecovered}`}
          hint="Missões marcadas como feitas após fracassar"
          accent="success"
        />
      </div>

      <div className="rpg-card-glow">
        <p className="text-xs text-muted-foreground mb-2">Progresso geral do mês</p>
        <Progress value={conversionPct} className="h-3" />
      </div>

      {/* Tendência semanal */}
      <div className="rpg-card-glow">
        <h3 className="text-sm font-display font-semibold text-foreground mb-3 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          Tendência (últimos 7 dias)
        </h3>
        <div className="w-full h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={kpis.weeklyTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(230 15% 20%)" />
              <XAxis dataKey="day" stroke="hsl(230 10% 55%)" tick={{ fontSize: 12 }} />
              <YAxis stroke="hsl(230 10% 55%)" tick={{ fontSize: 12 }} allowDecimals={false} />
              <RTooltip
                contentStyle={{
                  background: 'hsl(230 20% 11%)',
                  border: '1px solid hsl(230 15% 20%)',
                  borderRadius: '8px',
                  color: 'hsl(45 20% 90%)',
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="completed" name="Feitas" fill="hsl(142 70% 45%)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="failed" name="Fracassadas" fill="hsl(0 75% 55%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Insights: top failing & mastered */}
      <div className="grid md:grid-cols-2 gap-3">
        <div className="rpg-card-glow space-y-3">
          <h3 className="text-sm font-display font-semibold text-destructive flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Calcanhar de Aquiles
          </h3>
          {kpis.topFailing.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma missão com fracassos no período. 🎉</p>
          ) : (
            kpis.topFailing.map((s) => <MissionRow key={s.mission_id} stat={s} mode="fail" />)
          )}
        </div>

        <div className="rpg-card-glow space-y-3">
          <h3 className="text-sm font-display font-semibold text-emerald-400 flex items-center gap-2">
            <Award className="w-4 h-4" />
            Mestre da Rotina
          </h3>
          {kpis.topMastered.length === 0 ? (
            <p className="text-xs text-muted-foreground">Comece a concluir missões para aparecer aqui.</p>
          ) : (
            kpis.topMastered.map((s) => <MissionRow key={s.mission_id} stat={s} mode="success" />)
          )}
        </div>
      </div>

      {/* Alertas de hábito (>70% fracasso) */}
      {kpis.alerts.length > 0 && (
        <div className="rpg-card border border-destructive/40 bg-destructive/5 space-y-2">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-4 h-4" />
            <h3 className="text-sm font-display font-semibold">Hora de rever esses hábitos</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Estas missões têm taxa de fracasso acima de 70%. Considere reformular, reduzir frequência ou trocar
            o horário.
          </p>
          <ul className="space-y-1">
            {kpis.alerts.map((a) => (
              <li key={a.mission_id} className="text-sm text-foreground flex items-center gap-2">
                <span className="text-destructive">●</span>
                <span className="truncate">{a.title}</span>
                <span className="ml-auto text-xs text-destructive font-bold">
                  {Math.round(a.failureRate * 100)}% fracasso
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </motion.div>
  );
}
