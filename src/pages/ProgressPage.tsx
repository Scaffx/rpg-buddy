import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts';
import { useAttributes, useXpHistory } from '@/hooks/useProfile';
import AppLayout from '@/components/AppLayout';
import ReportsPanel from '@/components/ReportsPanel';
import { BarChart3, Hexagon, Loader2 } from 'lucide-react';

const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export default function ProgressPage() {
  const { data: xpHistory, isLoading: xpLoading } = useXpHistory(7);
  const { data: attributes, isLoading: attrLoading } = useAttributes();

  const lineData = useMemo(() => {
    const last7 = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const dayLabel = DAY_LABELS[d.getDay()];
      const dayXp = (xpHistory || [])
        .filter((h: any) => h.date === dateStr)
        .reduce((sum: number, h: any) => sum + (h.xp_gained || 0), 0);
      last7.push({ day: dayLabel, date: dateStr, xp: dayXp });
    }
    return last7;
  }, [xpHistory]);

  const radarData = useMemo(() => {
    if (!attributes) return [];
    return attributes.map((a) => ({
      attribute: a.name,
      icon: a.icon,
      value: a.xp,
      fullMark: Math.max(100, ...attributes.map((x) => x.xp)),
    }));
  }, [attributes]);

  const maxAttr = useMemo(() => {
    if (!attributes || attributes.length === 0) return null;
    return attributes.reduce((max, a) => a.xp > max.xp ? a : max, attributes[0]);
  }, [attributes]);

  return (
    <AppLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-display font-bold text-primary text-glow">
          <BarChart3 className="w-6 h-6 inline mr-2" />
          Progresso
        </h1>

        {/* XP Line Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rpg-card-glow"
        >
          <h2 className="text-lg font-display font-semibold text-foreground mb-4">
            ⚡ XP Ganho nos Últimos 7 Dias
          </h2>
          {xpLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : (
            <div className="w-full h-[220px] sm:h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={lineData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(230 15% 20%)" />
                  <XAxis
                    dataKey="day"
                    stroke="hsl(230 10% 55%)"
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis
                    stroke="hsl(230 10% 55%)"
                    tick={{ fontSize: 12 }}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'hsl(230 20% 11%)',
                      border: '1px solid hsl(230 15% 20%)',
                      borderRadius: '8px',
                      color: 'hsl(45 20% 90%)',
                    }}
                    formatter={(value: number) => [`${value} XP`, 'XP Ganho']}
                    labelFormatter={(label) => `Dia: ${label}`}
                  />
                  <Line
                    type="monotone"
                    dataKey="xp"
                    stroke="hsl(190 90% 50%)"
                    strokeWidth={3}
                    dot={{ fill: 'hsl(190 90% 50%)', strokeWidth: 2, r: 5 }}
                    activeDot={{ r: 7, fill: 'hsl(43 96% 56%)' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </motion.div>

        {/* Radar Chart - Attributes */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rpg-card-glow"
        >
          <h2 className="text-lg font-display font-semibold text-foreground mb-2">
            <Hexagon className="w-5 h-5 inline mr-2" />
            Evolução de Atributos
          </h2>
          {maxAttr && (
            <p className="text-xs text-muted-foreground mb-4">
              Destaque: <span className="text-primary font-semibold">{maxAttr.icon} {maxAttr.name}</span> ({maxAttr.xp} XP)
            </p>
          )}
          {attrLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : (
            <div className="w-full h-[280px] sm:h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
                  <PolarGrid stroke="hsl(230 15% 25%)" />
                  <PolarAngleAxis
                    dataKey="attribute"
                    tick={{ fontSize: 11, fill: 'hsl(45 20% 85%)' }}
                  />
                  <PolarRadiusAxis
                    tick={{ fontSize: 10, fill: 'hsl(230 10% 55%)' }}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'hsl(230 20% 11%)',
                      border: '1px solid hsl(230 15% 20%)',
                      borderRadius: '8px',
                      color: 'hsl(45 20% 90%)',
                    }}
                    formatter={(value: number, name: string) => [`${value} XP`, name]}
                  />
                  <Radar
                    name="XP"
                    dataKey="value"
                    stroke="hsl(190 90% 50%)"
                    fill="url(#radarGradient)"
                    fillOpacity={0.5}
                    strokeWidth={2}
                  />
                  <defs>
                    <linearGradient id="radarGradient" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="hsl(190 90% 50%)" stopOpacity={0.8} />
                      <stop offset="100%" stopColor="hsl(142 70% 45%)" stopOpacity={0.8} />
                    </linearGradient>
                  </defs>
                </RadarChart>
              </ResponsiveContainer>
            </div>
          )}
        </motion.div>

        {/* Attribute cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {attributes?.map((a, i) => (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.04 }}
              className={`rpg-card text-center ${maxAttr?.id === a.id ? 'border-primary/50' : ''}`}
            >
              <div className="text-2xl mb-1">{a.icon}</div>
              <p className="text-xs font-medium text-foreground">{a.name}</p>
              <p className="text-primary font-bold text-sm">{a.xp} XP</p>
              <p className="text-[10px] text-muted-foreground">Nv. {a.level}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
