import { motion } from 'framer-motion';
import { useProfile, useAttributes, useActivityLog, useClasses } from '@/hooks/useProfile';
import { Trophy, Star, Zap, Target, TrendingUp, Loader2, Swords, Calendar } from 'lucide-react';
import AppLayout from '@/components/AppLayout';

function getRank(level: number) {
  if (level >= 50) return 'Lendário';
  if (level >= 30) return 'Mestre';
  if (level >= 20) return 'Veterano';
  if (level >= 10) return 'Guerreiro';
  if (level >= 5) return 'Aprendiz';
  return 'Novato';
}

export default function Dashboard() {
  const { data: profile, isLoading: profileLoading } = useProfile();
  const { data: attributes, isLoading: attrsLoading } = useAttributes();
  const { data: activity, isLoading: activityLoading } = useActivityLog();
  const { data: classes } = useClasses();

  const currentClass = classes?.find((c: any) => c.id === profile?.current_class_id);

  if (profileLoading || attrsLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  const statCards = [
    { key: 'level', label: 'Nível', icon: Star, value: profile?.level || 1 },
    { key: 'rank', label: 'Rank', icon: Trophy, value: getRank(profile?.level || 1) },
    { key: 'class', label: 'Classe', icon: Swords, value: currentClass ? `${currentClass.icon} ${currentClass.name}` : '📖 Aprendiz' },
    { key: 'total_xp', label: 'XP Total', icon: Zap, value: profile?.total_xp || 0 },
    { key: 'missions_today', label: 'Missões Hoje', icon: Calendar, value: profile?.xp_today ? Math.floor(profile.xp_today / 25) : 0 },
    { key: 'missions', label: 'Missões Total', icon: Target, value: profile?.missions_completed || 0 },
    { key: 'xp_today', label: 'XP Hoje', icon: TrendingUp, value: profile?.xp_today || 0 },
  ];

  return (
    <AppLayout>
      <div className="space-y-6">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl font-display font-bold text-primary text-glow">
            Olá, {profile?.display_name || 'Aventureiro'}!
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Sua jornada continua. Continue evoluindo!
          </p>
        </motion.div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {statCards.map((stat, i) => (
            <motion.div
              key={stat.key}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className="rpg-card-glow text-center"
            >
              <stat.icon className="w-5 h-5 text-primary mx-auto mb-1" />
              <div className="text-lg font-bold text-foreground">{stat.value}</div>
              <div className="text-xs text-muted-foreground">{stat.label}</div>
            </motion.div>
          ))}
        </div>

        {/* XP Progress */}
        {profile && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="rpg-card">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-muted-foreground">Progresso para Nível {profile.level + 1}</span>
              <span className="text-primary font-semibold">{profile.total_xp % 200}/200 XP</span>
            </div>
            <div className="rpg-stat-bar">
              <div className="rpg-stat-fill" style={{ width: `${(profile.total_xp % 200) / 2}%` }} />
            </div>
          </motion.div>
        )}

        {/* Attributes */}
        <div>
          <h2 className="text-lg font-display font-semibold text-foreground mb-3">Atributos</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {attributes?.map((attr, i) => (
              <motion.div
                key={attr.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + i * 0.05 }}
                className="rpg-card flex items-center gap-3"
              >
                <span className="text-2xl">{attr.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-foreground">{attr.name}</span>
                    <span className="rpg-badge">Nv.{attr.level}</span>
                  </div>
                  <div className="rpg-stat-bar mt-1.5">
                    <div className="rpg-stat-fill" style={{ width: `${attr.xp % 100}%` }} />
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">{attr.xp % 100}/100 XP</div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Activity */}
        <div>
          <h2 className="text-lg font-display font-semibold text-foreground mb-3">Histórico Recente</h2>
          {activityLoading ? (
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          ) : activity && activity.length > 0 ? (
            <div className="space-y-2">
              {activity.map((item) => (
                <div key={item.id} className="rpg-card flex items-center justify-between">
                  <div>
                    <p className="text-sm text-foreground">{item.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(item.created_at).toLocaleString('pt-BR')}
                    </p>
                  </div>
                  {item.xp_gained ? (
                    <span className="text-primary font-bold text-sm">+{item.xp_gained} XP</span>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma atividade ainda. Complete missões para começar!</p>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
