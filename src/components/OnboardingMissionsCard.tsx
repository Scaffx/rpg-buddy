import { type ElementType } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  Droplets,
  Flag,
  Gift,
  Loader2,
  Lock,
  Ruler,
  Sparkles,
  Target,
  Utensils,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  type OnboardingMission,
  type OnboardingMissionCode,
  useClaimOnboardingMission,
  useOnboardingMissions,
} from '@/hooks/useOnboardingMissions';

const MISSION_META: Record<
  OnboardingMissionCode,
  { icon: ElementType; route: string | null }
> = {
  enter_system: { icon: Gift, route: null },
  create_mission: { icon: Target, route: '/missions' },
  create_goal: { icon: Flag, route: '/prioridade' },
  log_meal: { icon: Utensils, route: '/profile' },
  log_water: { icon: Droplets, route: '/profile' },
  record_measurement: { icon: Ruler, route: '/profile' },
};

function rewardLabel(mission: OnboardingMission, t: TFunction) {
  if (mission.reward_kind === 'starter_kit') {
    return t('app.onboardingMissions.starterKitReward');
  }
  return t('app.onboardingMissions.xpReward', { xp: mission.xp_reward });
}

export function OnboardingMissionsCard() {
  const { t } = useTranslation();
  const { data: missions = [], isLoading } = useOnboardingMissions();
  const claimMission = useClaimOnboardingMission();

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin text-primary" />
        {t('app.onboardingMissions.loading')}
      </div>
    );
  }

  if (missions.length === 0 || missions.every((mission) => mission.claimed)) {
    return null;
  }

  const claimedCount = missions.filter((mission) => mission.claimed).length;
  const firstClaimableCode = missions.find(
    (mission) => mission.unlocked && !mission.claimed,
  )?.code;

  const handleClaim = (mission: OnboardingMission) => {
    claimMission.mutate(mission.code, {
      onSuccess: (result) => {
        toast.success(t('app.onboardingMissions.claimedToast'), {
          description:
            result.reward_kind === 'starter_kit'
              ? t('app.onboardingMissions.starterKitClaimed')
              : t('app.onboardingMissions.xpClaimed', { xp: result.xp_reward }),
        });
      },
      onError: (error: Error) => {
        toast.error(t('app.onboardingMissions.claimError'), {
          description: error.message,
        });
      },
    });
  };

  return (
    <section className="rounded-2xl border border-primary/35 bg-gradient-to-br from-primary/12 via-card to-card p-4 shadow-[0_0_30px_hsl(var(--primary)/0.08)]">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <h2 className="font-display font-bold text-lg text-foreground">
              {t('app.onboardingMissions.title')}
            </h2>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {t('app.onboardingMissions.description')}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary">
          {t('app.onboardingMissions.progress', {
            claimed: claimedCount,
            total: missions.length,
          })}
        </span>
      </div>

      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {missions.map((mission) => {
          const meta = MISSION_META[mission.code];
          const Icon = meta.icon;
          const highlighted = mission.code === firstClaimableCode;

          return (
            <article
              key={mission.code}
              className={`rounded-xl border p-3 transition-all ${
                mission.claimed
                  ? 'border-emerald-500/25 bg-emerald-500/5 opacity-75'
                  : highlighted
                    ? 'border-primary/60 bg-primary/10 ring-2 ring-primary/20'
                    : mission.unlocked
                      ? 'border-amber-400/35 bg-amber-400/5'
                      : 'border-border/70 bg-background/30'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`rounded-lg p-2 ${mission.claimed ? 'bg-emerald-500/15 text-emerald-400' : 'bg-primary/10 text-primary'}`}>
                  {mission.claimed ? <CheckCircle2 className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-bold text-foreground">
                    {t(`app.onboardingMissions.missions.${mission.code}.title`)}
                  </h3>
                  <p className="text-[11px] leading-relaxed text-muted-foreground mt-1">
                    {t(`app.onboardingMissions.missions.${mission.code}.description`)}
                  </p>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-amber-300">
                  {rewardLabel(mission, t)}
                </span>

                {mission.claimed ? (
                  <span className="text-[11px] font-semibold text-emerald-400">
                    {t('app.onboardingMissions.claimed')}
                  </span>
                ) : mission.unlocked ? (
                  <Button
                    size="sm"
                    onClick={() => handleClaim(mission)}
                    disabled={claimMission.isPending}
                    className="h-7 px-2.5 text-xs"
                  >
                    {claimMission.isPending && claimMission.variables === mission.code ? (
                      <Loader2 className="w-3 h-3 animate-spin mr-1" />
                    ) : (
                      <Gift className="w-3 h-3 mr-1" />
                    )}
                    {t('app.onboardingMissions.claim')}
                  </Button>
                ) : meta.route ? (
                  <Button asChild variant="outline" size="sm" className="h-7 px-2.5 text-xs">
                    <Link to={meta.route}>
                      {t('app.onboardingMissions.goNow')}
                      <ArrowRight className="w-3 h-3 ml-1" />
                    </Link>
                  </Button>
                ) : (
                  <span className="inline-flex items-center text-[10px] text-muted-foreground">
                    <Lock className="w-3 h-3 mr-1" />
                    {t('app.onboardingMissions.locked')}
                  </span>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
