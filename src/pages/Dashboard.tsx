import { useMemo, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ATTRIBUTE_COLORS } from "@/lib/attributes";
import { motion } from "framer-motion";
import { useProfile, useAttributes, useMissions, useClasses, useTodayXp, useTodayMissionsCount, useRankPosition } from "@/hooks/useProfile";
import { useCompleteMission } from "@/hooks/useProfile";
import { useDailyBonus } from "@/hooks/useDailyBonus";
import { getLevelProgress } from "@/lib/progression";
import { Trophy, Star, Zap, Target, TrendingUp, Loader2, Swords, Calendar, Check, Gift, Coins, Clock, Flame, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { evaluateTodayStreakRisk } from "@/lib/streakUtils";
import RemindersCard from "@/components/RemindersCard";
import GuidedTour, { type TourStep } from '@/components/GuidedTour';

const DASHBOARD_TOUR_STEPS: TourStep[] = [
  {
    target: 'dash-greeting',
    title: 'Seu Painel de Controle ⚔️',
    description: 'Aqui você acompanha tudo em tempo real: status do herói, streak, XP e muito mais. Este é o coração do Life on RPG.',
  },
  {
    target: 'dash-stats',
    title: 'Seus Stats de Herói 📊',
    description: 'Esses cards mostram Nível, posição no Ranking global, sua Classe atual, XP total, missões do dia e XP ganho hoje.',
  },
  {
    target: 'dash-xp',
    title: 'Barra de Progresso de Nível ✨',
    description: 'Acompanhe quantos XP faltam para subir de nível. A cada subida você desbloqueia novas classes e habilidades únicas.',
  },
  {
    target: 'dash-bonus',
    title: 'Bônus Diário 🎁',
    description: 'Colete seu bônus diário de ouro e XP uma vez por dia. O cooldown reseta à meia-noite — nunca esqueça de coletar!',
  },
  {
    target: 'dash-missions',
    title: 'Missões de Hoje ✅',
    description: 'Estas são as missões programadas para hoje. Conclua-as para ganhar XP nos atributos e manter sua streak ativa. Cumprir 60% delas mantém o fogo aceso! 🔥',
  },
];

const DAYS_MAP = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

type DashboardMission = {
  completed?: boolean | null;
  completed_at?: string | null;
  created_at?: string | null;
  days_of_week?: string[] | null;
  daily_status?: Record<string, string> | null;
  failed_date?: string | null;
  is_failed?: boolean | null;
};

function getLocalDateString(date: Date = new Date()): string {
  return date.toLocaleDateString('en-CA');
}

function getDateDaysAgo(daysAgo: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d;
}

function getMissionStateForDate(mission: DashboardMission, dateStr: string): string | null {
  const dailyStatus = mission.daily_status || {};
  const state = dailyStatus[dateStr];

  if (state) {
    return state;
  }

  if (mission.is_failed && mission.failed_date === dateStr) {
    return 'failed';
  }

  if (mission.completed && String(mission.completed_at || '').startsWith(dateStr)) {
    return 'completed';
  }

  return null;
}

// Importado de @/lib/attributes

function BonusCountdown({ nextClaimAt }: { nextClaimAt: string | null }) {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    if (!nextClaimAt) return;
    const update = () => {
      const diff = new Date(nextClaimAt).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft('Disponível!');
        return;
      }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [nextClaimAt]);

  return <p className="text-xs text-muted-foreground">Próximo em: {timeLeft}</p>;
}

export default function Dashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const { data: attributes, isLoading: attrsLoading } = useAttributes();
  const { data: allMissions, isLoading: missionsLoading } = useMissions();
  const { data: classes } = useClasses();
  const { data: todayXp = 0 } = useTodayXp();
  const xpProgress = getLevelProgress(profile?.total_xp || 0);
  const { data: todayMissionsCount = 0 } = useTodayMissionsCount();
  const { data: rankPosition } = useRankPosition();
  const dailyBonus = useDailyBonus();
  const completeMission = useCompleteMission();
  const [showCoachPopup, setShowCoachPopup] = useState(false);
  const [coachQuote, setCoachQuote] = useState("");

  const currentClass = classes?.find((c: any) => c.id === profile?.current_class_id);

  const todayDay = (() => {
    const d = new Date().getDay();
    return DAYS_MAP[d];
  })();

  const todayDayLabel = (() => {
    const days = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
    return days[new Date().getDay()];
  })();

  // Filter today's daily missions
  const todayMissions = useMemo(() => {
    if (!allMissions) return [];
    const today = getLocalDateString();
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

  const todayDate = getLocalDateString();

  const todayMissionMetrics = useMemo(() => {
    const required = (allMissions || []).filter((m: any) => {
      const days: string[] = m.days_of_week || [];
      if (!(days.length > 0 && days.includes(todayDay))) return false;
      return !m.completed;
    });

    let completed = 0;
    let failed = 0;
    for (const mission of required) {
      const dailyStatus = (mission.daily_status as Record<string, string>) || {};
      const state = dailyStatus[todayDate];
      if (state === 'completed' || state === 'protected') completed += 1;
      if (state === 'failed' || state === 'failed_accepted') failed += 1;
      if ((mission as any).is_failed && (mission as any).failed_date === todayDate) failed += 1;
    }

    return {
      required: required.length,
      completed,
      failed,
      pending: Math.max(0, required.length - completed - failed),
    };
  }, [allMissions, todayDay, todayDate]);

  const missionStreak = useMemo(() => {
    if (!allMissions || allMissions.length === 0) {
      return {
        days: 0,
        lastCompletedDate: null as string | null,
        todayRequired: todayMissionMetrics.required,
        todayCompleted: todayMissionMetrics.completed,
        todayPending: todayMissionMetrics.pending,
      };
    }

    let consecutiveDays = 0;
    let lastCompletedDate: string | null = null;

    for (let daysBack = 0; daysBack < 365; daysBack++) {
      const date = getDateDaysAgo(daysBack);
      const dateStr = getLocalDateString(date);
      const dayName = DAYS_MAP[date.getDay()];

      const requiredMissions = allMissions.filter((mission: DashboardMission) => {
        const daysOfWeek: string[] = mission.days_of_week || [];
        if (!(daysOfWeek.length > 0 && daysOfWeek.includes(dayName))) return false;

        const createdAt = String(mission.created_at || '').slice(0, 10);
        if (createdAt && createdAt > dateStr) return false;

        return true;
      });

      if (requiredMissions.length === 0) {
        continue;
      }

      const completedAll = requiredMissions.every((mission: DashboardMission) => {
        const state = getMissionStateForDate(mission, dateStr);
        return state === 'completed' || state === 'protected';
      });

      if (!completedAll) {
        break;
      }

      consecutiveDays += 1;
      if (!lastCompletedDate) {
        lastCompletedDate = dateStr;
      }
    }

    return {
      days: consecutiveDays,
      lastCompletedDate,
      todayRequired: todayMissionMetrics.required,
      todayCompleted: todayMissionMetrics.completed,
      todayPending: todayMissionMetrics.pending,
    };
  }, [allMissions, todayMissionMetrics.required, todayMissionMetrics.completed, todayMissionMetrics.pending]);

  const streakActive = missionStreak.days > 0;
  const todayStreakRisk = useMemo(() => evaluateTodayStreakRisk(allMissions || []), [allMissions]);

  useEffect(() => {
    const tryWeeklyProtectorReset = async () => {
      if (!user || !profile) return;

      const now = new Date();
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const day = d.getUTCDay();
      const diff = day === 0 ? -6 : 1 - day;
      d.setUTCDate(d.getUTCDate() + diff);
      const weekToken = d.toISOString().slice(0, 10);

      const currentWeek = String((profile as any).streak_protector_week || '');
      const maxSlots = Math.min(3, Math.max(1, Number((profile as any).streak_protector_max ?? 3)));

      if (currentWeek !== weekToken) {
        await supabase
          .from('profiles')
          .update({
            streak_protector_week: weekToken,
            streak_protector_charges: Math.min(2, maxSlots),
            streak_protector_max: maxSlots,
          } as any)
          .eq('user_id', user.id);
      }
    };

    void tryWeeklyProtectorReset();
  }, [user, profile]);

  useEffect(() => {
    if (!user || !profile) return;

    const key = `streak_risk_alert_${user.id}_${todayDate}`;
    const maybeAlert = () => {
      const hour = new Date().getHours();
      const hasPending = todayMissionMetrics.pending > 0;
      const charges = Number((profile as any).streak_protector_charges ?? 0);
      if (hour >= 22 && hasPending && charges <= 0 && !sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, 'shown');
        toast.error(t('app.dashboard.streak_risk_toast'));
      }
    };

    maybeAlert();
    const interval = window.setInterval(maybeAlert, 60 * 1000);
    return () => {
      window.clearInterval(interval);
    };
  }, [user, profile, todayDate, todayMissionMetrics.pending]);

  useEffect(() => {
    if (!user || !allMissions || allMissions.length === 0) return;

    const philosopherQuotes = [
      '"Nao e porque as coisas sao dificeis que nao ousamos; e porque nao ousamos que elas sao dificeis." - Seneca',
      '"Somos o que repetidamente fazemos. A excelencia, portanto, nao e um ato, mas um habito." - Aristoteles',
      '"A disciplina e a ponte entre metas e realizacoes." - Jim Rohn',
    ];

    const isCriticalFailureDay = (date: Date): boolean => {
      const dateStr = getLocalDateString(date);
      const dayName = DAYS_MAP[date.getDay()];

      const required = (allMissions || []).filter((m: any) => {
        const days: string[] = m.days_of_week || [];
        return days.length > 0 && days.includes(dayName);
      });
      if (required.length === 0) return false;

      let failed = 0;
      for (const mission of required) {
        const dailyStatus = (mission.daily_status as Record<string, string>) || {};
        const state = dailyStatus[dateStr];
        if (state === 'failed' || state === 'failed_accepted') {
          failed += 1;
        } else if ((mission as any).failed_date === dateStr) {
          failed += 1;
        }
      }

      const rate = failed / required.length;
      return rate > 0.6;
    };

    const critical3Days = [0, 1, 2].every((offset) => isCriticalFailureDay(getDateDaysAgo(offset)));
    const popupKey = `mission_coach_popup_${user.id}_${todayDate}`;

    if (critical3Days && !sessionStorage.getItem(popupKey)) {
      sessionStorage.setItem(popupKey, 'shown');
      setCoachQuote(philosopherQuotes[Math.floor(Math.random() * philosopherQuotes.length)]);
      setShowCoachPopup(true);
    }
  }, [user, allMissions, todayDate]);

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
    { key: "level", label: t('app.dashboard.stat_level'), icon: Star, value: profile?.level || 1 },
    { key: "rank", label: t('app.dashboard.stat_rank'), icon: Trophy, value: rankPosition ? `#${rankPosition}` : "--" },
    {
      key: "class",
      label: t('app.dashboard.stat_class'),
      icon: Swords,
      value: currentClass ? `${currentClass.icon} ${currentClass.name}` : "📖 Aprendiz",
    },
    { key: "total_xp", label: t('app.dashboard.stat_xp_total'), icon: Zap, value: profile?.total_xp || 0 },
    {
      key: "missions_today",
      label: t('app.dashboard.stat_missions_today'),
      icon: Calendar,
      value: todayMissionsCount || 0,
    },
    { key: "missions", label: t('app.dashboard.stat_missions_total'), icon: Target, value: profile?.missions_completed || 0 },
    { key: "xp_today", label: t('app.dashboard.stat_xp_today'), icon: TrendingUp, value: todayXp || 0 },
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
        <motion.div data-tour="dash-greeting" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl font-display font-bold text-primary text-glow">
            Olá, {profile?.display_name || "Aventureiro"}!
          </h1>
          <p className="text-muted-foreground text-sm mt-1">{t('app.dashboard.greeting_subtitle')}</p>

          {streakActive && (
            <div className="mt-3 inline-flex items-center gap-2 rounded-xl border border-red-500/60 bg-red-500/15 px-3 py-1.5 text-red-200 streak-fire-aura">
              <Flame className="w-4 h-4 text-red-400" />
              <span className="text-sm font-bold">{t('app.dashboard.streak_badge')}</span>
              <span className="text-xs text-red-300">
                {t('app.dashboard.streak_days', { n: missionStreak.days, count: missionStreak.days, defaultValue: `${missionStreak.days} dias` })}
              </span>
            </div>
          )}

          {todayStreakRisk.required > 0 && todayStreakRisk.atRisk && !todayStreakRisk.alreadyHit && (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-500/60 bg-amber-500/15 px-3 py-2 text-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <div className="flex-1 text-xs">
                <p className="font-bold">{t('app.dashboard.streak_risk_title')}</p>
                <p className="text-amber-300/90">
                  {t('app.dashboard.streak_risk_body', { n: todayStreakRisk.missingForThreshold, done: todayStreakRisk.completed, threshold: todayStreakRisk.thresholdCount, pending: todayStreakRisk.pending })}
                </p>
              </div>
            </div>
          )}

          {todayStreakRisk.required > 0 && todayStreakRisk.alreadyHit && (
            <div className="mt-3 inline-flex items-center gap-2 rounded-xl border border-emerald-500/50 bg-emerald-500/10 px-3 py-1.5 text-emerald-200">
              <Check className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-semibold">{t('app.dashboard.streak_safe')}</span>
            </div>
          )}
        </motion.div>

        {/* Stat cards */}
        <div data-tour="dash-stats" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
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
            data-tour="dash-xp"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="rpg-card"
          >
            <div className="flex justify-between text-sm mb-2">
              <span className="text-muted-foreground">{t('app.dashboard.xp_progress_label', { n: xpProgress.isMaxLevel ? profile.level : profile.level + 1 })}</span>
              <span className="text-primary font-semibold">{xpProgress.currentLevelXp}/{xpProgress.xpForNextLevel} XP</span>
            </div>
            <div className="rpg-stat-bar">
              <div className="rpg-stat-fill" style={{ width: `${xpProgress.progressPercent}%` }} />
            </div>
          </motion.div>
        )}

        {/* Daily Bonus */}
        {!dailyBonus.isCheckingClaim && (
          <motion.div
            data-tour="dash-bonus"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45 }}
            className={`rpg-card bg-gradient-to-r ${dailyBonus.isClaimed ? 'from-gray-500/10 to-gray-500/10 border-gray-500/30' : 'from-purple-500/10 to-pink-500/10 border-purple-500/30'}`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {dailyBonus.isClaimed ? (
                  <Clock className="w-6 h-6 text-muted-foreground" />
                ) : (
                  <Gift className="w-6 h-6 text-purple-400" />
                )}
                <div>
                  {dailyBonus.isClaimed ? (
                    <>
                      <h3 className="font-bold text-muted-foreground">{t('app.dashboard.daily_bonus_claimed')}</h3>
                      <BonusCountdown nextClaimAt={dailyBonus.nextClaimAt} />
                    </>
                  ) : (
                    <>
                      <h3 className="font-bold text-foreground">{t('app.dashboard.daily_bonus_available')}</h3>
                      <p className="text-xs text-muted-foreground">{t('app.dashboard.daily_bonus_description')}</p>
                    </>
                  )}
                </div>
              </div>
              {!dailyBonus.isClaimed && (
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
                  {t('app.dashboard.daily_bonus_button')}
                </Button>
              )}
            </div>
          </motion.div>
        )}

        {/* Reminders — não-missões, sem XP */}
        <RemindersCard />

        {/* Today's Daily Missions */}
        <div data-tour="dash-missions">
          <h2 className="text-lg font-display font-semibold text-foreground mb-1">{t('app.dashboard.missions_today_header')}</h2>
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
              Nenhuma missão para hoje. {t('app.dashboard.missions_today_empty')}
            </p>
          )}
        </div>

      </div>

      <GuidedTour tourKey="dashboard" steps={DASHBOARD_TOUR_STEPS} />

      {showCoachPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-orange-500/40 bg-card p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 w-5 h-5 text-orange-400" />
              <div className="space-y-3">
                <h3 className="text-lg font-bold text-foreground">{t('app.dashboard.coach_title')}</h3>
                <p className="text-sm text-muted-foreground">
                  {t('app.dashboard.coach_body')}
                </p>
                <p className="text-sm italic text-orange-300">{coachQuote}</p>
                <div className="flex justify-end">
                  <Button
                    onClick={() => setShowCoachPopup(false)}
                    className="bg-orange-500/20 text-orange-300 border border-orange-500/40 hover:bg-orange-500/30"
                  >
                    {t('app.dashboard.coach_confirm_button')}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
