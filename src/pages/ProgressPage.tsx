import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts';
import {
  useAttributes,
  useClasses,
  useProfile,
  useRankPosition,
  useTodayMissionsCount,
  useTodayXp,
  useXpHistory,
} from '@/hooks/useProfile';
import AppLayout from '@/components/AppLayout';
import TranslatedGuidedTour from '@/components/TranslatedGuidedTour';
import { starterClassDisplayName } from '@/hooks/useHeroClass';
import { Calendar, Hexagon, Loader2, Star, Swords, Target, TrendingUp, Trophy, Zap } from 'lucide-react';

export default function ProgressPage() {
  const { t, i18n } = useTranslation();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const { data: xpHistory, isLoading: xpLoading } = useXpHistory(7);
  const { data: attributes, isLoading: attrLoading } = useAttributes();
  const { data: classes } = useClasses();
  const { data: todayXp = 0 } = useTodayXp();
  const { data: todayMissionsCount = 0 } = useTodayMissionsCount();
  const { data: rankPosition } = useRankPosition();

  const currentClass = classes?.find((current) => current.id === profile?.current_class_id);

  const statCards = [
    { key: 'level', label: t('app.dashboard.stat_level'), icon: Star, value: profile?.level || 1 },
    { key: 'rank', label: t('app.dashboard.stat_rank'), icon: Trophy, value: rankPosition ? `#${rankPosition}` : '--' },
    {
      key: 'class',
      label: t('app.dashboard.stat_class'),
      icon: Swords,
      value: currentClass ? `${currentClass.icon} ${currentClass.name}` : `📖 ${starterClassDisplayName(profile?.starter_class)}`,
    },
    { key: 'total_xp', label: t('app.dashboard.stat_xp_total'), icon: Zap, value: profile?.total_xp || 0 },
    {
      key: 'missions_today',
      label: t('app.dashboard.stat_missions_today'),
      icon: Calendar,
      value: todayMissionsCount || 0,
    },
    { key: 'missions', label: t('app.dashboard.stat_missions_total'), icon: Target, value: profile?.missions_completed || 0 },
    { key: 'xp_today', label: t('app.dashboard.stat_xp_today'), icon: TrendingUp, value: todayXp || 0 },
  ];

  const lineData = useMemo(() => {
    const last7 = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const locale = i18n.resolvedLanguage === 'pt' ? 'pt-BR' : i18n.resolvedLanguage;
      const dayLabel = d.toLocaleDateString(locale, { weekday: 'short' });
      const dayXp = (xpHistory || [])
        .filter((h: any) => h.date === dateStr)
        .reduce((sum: number, h: any) => sum + (h.xp_gained || 0), 0);
      last7.push({ day: dayLabel, date: dateStr, xp: dayXp });
    }
    return last7;
  }, [i18n.resolvedLanguage, xpHistory]);

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
        {/* Hero stats */}
        <div data-tour="progress-summary" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {statCards.map((stat, index) => (
            <motion.div
              key={stat.key}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(index * 0.08, 0.4) }}
              className="rpg-card-glow text-center"
            >
              {profileLoading ? (
                <Loader2 className="w-5 h-5 text-primary mx-auto my-4 animate-spin" />
              ) : (
                <>
                  <stat.icon className="w-5 h-5 text-primary mx-auto mb-1" />
                  <div className="text-lg font-bold text-foreground">{stat.value}</div>
                  <div className="text-xs text-muted-foreground">{stat.label}</div>
                </>
              )}
            </motion.div>
          ))}
        </div>

        {/* XP Line Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          data-tour="progress-xp"
          className="rpg-card-glow"
        >
          <h2 className="text-lg font-display font-semibold text-foreground mb-4">
            ⚡ {t('app.progress.xp_last_7_days')}
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
                    formatter={(value: number) => [`${value} XP`, t('app.progress.xp_gained')]}
                    labelFormatter={(label) => `${t('app.progress.day')}: ${label}`}
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
          data-tour="progress-radar"
          className="rpg-card-glow"
        >
          <h2 className="text-lg font-display font-semibold text-foreground mb-2">
            <Hexagon className="w-5 h-5 inline mr-2" />
            {t('app.progress.attributes_evolution')}
          </h2>
          {maxAttr && (
            <p className="text-xs text-muted-foreground mb-4">
              {t('app.progress.highlight')}: <span className="text-primary font-semibold">{maxAttr.icon} {maxAttr.name}</span> ({maxAttr.xp} XP)
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
        <div data-tour="progress-attributes" className="grid grid-cols-2 sm:grid-cols-3 gap-3">
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
              <p className="text-[10px] text-muted-foreground">{t('app.progress.level_short')} {a.level}</p>
            </motion.div>
          ))}
        </div>
      </div>
      <TranslatedGuidedTour
        tourKey="progress"
        targets={[
          { target: 'progress-summary', key: 'summary' },
          { target: 'progress-xp', key: 'xp' },
          { target: 'progress-radar', key: 'radar' },
          { target: 'progress-attributes', key: 'attributes' },
        ]}
      />
    </AppLayout>
  );
}
