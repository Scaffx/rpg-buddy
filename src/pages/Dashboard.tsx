import { useMemo } from "react";
import { ATTRIBUTE_COLORS } from "@/lib/attributes";
import { motion } from "framer-motion";
import { useProfile, useAttributes, useMissions, useClasses, useTodayXp, useTodayMissionsCount } from "@/hooks/useProfile";
import { useCompleteMission } from "@/hooks/useProfile";
import { useDailyBonus } from "@/hooks/useDailyBonus";
import { Trophy, Star, Zap, Target, TrendingUp, Loader2, Swords, Calendar, Check, Gift, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import AppLayout from "@/components/AppLayout";

const DAYS_MAP = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

// Importado de @/lib/attributes

function getRank(level: number) {
  if (level >= 50) return "Lendário";
  if (level >= 30) return "Mestre";
  if (level >= 20) return "Veterano";
  if (level >= 10) return "Guerreiro";
  if (level >= 5) return "Aprendiz";
  return "Novato";
}

export default function Dashboard() {
  const { data: profile, isLoading: profileLoading } = useProfile();
  const { data: attributes, isLoading: attrsLoading } = useAttributes();
  const { data: allMissions, isLoading: missionsLoading } = useMissions();
  const { data: classes } = useClasses();
  const { data: todayXp = 0 } = useTodayXp();
  const { data: todayMissionsCount = 0 } = useTodayMissionsCount();
  const dailyBonus = useDailyBonus();
  const completeMission = useCompleteMission();

  const currentClass = classes?.find((c: any) => c.id === profile?.current_class_id);

  const todayDay = useMemo(() => {
    const d = new Date().getDay();
    return DAYS_MAP[d];
  }, []);

  const todayDayLabel = useMemo(() => {
    const days = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
    return days[new Date().getDay()];
  }, []);

  // Filter today's daily missions
  const todayMissions = useMemo(() => {
    if (!allMissions) return [];
    const today = new Date().toISOString().split('T')[0];
    return allMissions
      .filter((m: any) => {
        if (m.completed) return false;
        const days: string[] = m.days_of_week || [];
        if (!(days.length > 0 && days.includes(todayDay))) return false;
        // Verificar se já foi concluída hoje
        const dailyStatus = (m.daily_status as { [key: string]: string }) || {};
        return dailyStatus[today] !== 'completed';
      })
      .sort((a: any, b: any) => {
        const order: Record<string, number> = { alta: 0, media: 1, baixa: 2 };
        return (order[a.priority || "media"] ?? 1) - (order[b.priority || "media"] ?? 1);
      });
  }, [allMissions, todayDay]);

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
    { key: "level", label: "Nível", icon: Star, value: profile?.level || 1 },
    { key: "rank", label: "Rank", icon: Trophy, value: getRank(profile?.level || 1) },
    {
      key: "class",
      label: "Classe",
      icon: Swords,
      value: currentClass ? `${currentClass.icon} ${currentClass.name}` : "📖 Aprendiz",
    },
    { key: "total_xp", label: "XP Total", icon: Zap, value: profile?.total_xp || 0 },
    {
      key: "missions_today",
      label: "Missões Hoje",
      icon: Calendar,
      value: todayMissionsCount || 0,
    },
    { key: "missions", label: "Missões Total", icon: Target, value: profile?.missions_completed || 0 },
    { key: "xp_today", label: "XP Hoje", icon: TrendingUp, value: todayXp || 0 },
  ];

  const handleComplete = async (mission: any) => {
    await completeMission.mutateAsync({
      missionId: mission.id,
      attributeId: mission.attribute_id,
      xpReward: mission.xp_reward,
      secondaryAttributeIds: mission.secondary_attribute_ids || [],
    });
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl font-display font-bold text-primary text-glow">
            Olá, {profile?.display_name || "Aventureiro"}!
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Sua jornada continua. Continue evoluindo!</p>
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
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="rpg-card"
          >
            <div className="flex justify-between text-sm mb-2">
              <span className="text-muted-foreground">Progresso para Nível {profile.level + 1}</span>
              <span className="text-primary font-semibold">{profile.total_xp % 200}/200 XP</span>
            </div>
            <div className="rpg-stat-bar">
              <div className="rpg-stat-fill" style={{ width: `${(profile.total_xp % 200) / 2}%` }} />
            </div>
          </motion.div>
        )}

        {/* Daily Bonus */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
          className="rpg-card bg-gradient-to-r from-purple-500/10 to-pink-500/10 border-purple-500/30"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Gift className="w-6 h-6 text-purple-400" />
              <div>
                <h3 className="font-bold text-foreground">Bônus Diário Disponível!</h3>
                <p className="text-xs text-muted-foreground">+15 XP e +5 🪙</p>
              </div>
            </div>
            <Button
              onClick={() => {
                dailyBonus.mutate(undefined, {
                  onSuccess: () => {
                    // Toast will be shown by mutation
                  },
                  onError: (err: Error) => {
                    // Error messages handled
                  },
                });
              }}
              disabled={dailyBonus.isPending}
              size="sm"
              className="bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 border border-purple-500/50"
            >
              {dailyBonus.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
              ) : (
                <Coins className="w-4 h-4 mr-1" />
              )}
              Coletar
            </Button>
          </div>
        </motion.div>

        {/* Today's Daily Missions */}
        <div>
          <h2 className="text-lg font-display font-semibold text-foreground mb-1">📅 Missões de Hoje</h2>
          <p className="text-xs text-muted-foreground mb-3">{todayDayLabel}</p>

          {missionsLoading ? (
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          ) : todayMissions.length > 0 ? (
            <div className="space-y-2">
              {todayMissions.map((m: any, idx: number) => {
                const allAttrs = [
                  m.attributes && { name: m.attributes.name, icon: m.attributes.icon },
                  ...(attributes || [])
                    .filter((a) => ((m as any).secondary_attribute_ids || []).includes(a.id))
                    .map((a) => ({ name: a.name, icon: a.icon })),
                ].filter(Boolean);

                return (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="rpg-card flex items-center justify-between gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{m.title}</p>
                      <div className="flex items-center gap-1 mt-1 flex-wrap">
                        {allAttrs.map((a: any, attrIdx: number) => (
                          <span
                            key={attrIdx}
                            className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium ${ATTRIBUTE_COLORS[a.name] || "bg-secondary text-muted-foreground"}`}
                          >
                            {a.icon} {a.name}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-primary font-bold">+{m.xp_reward} XP</span>
                      <Button
                        size="sm"
                        onClick={() => handleComplete(m)}
                        disabled={completeMission.isPending}
                        className="h-7 px-2 bg-green-500/20 text-green-400 hover:bg-green-500/30 border border-green-500/40 text-xs font-medium transition-all"
                      >
                        {completeMission.isPending ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <>
                            <Check className="w-3 h-3 mr-1" /> Ok
                          </>
                        )}
                      </Button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground rpg-card text-center py-4">
              Nenhuma missão para hoje. Crie uma! 🎯
            </p>
          )}
        </div>

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
      </div>
    </AppLayout>
  );
}
