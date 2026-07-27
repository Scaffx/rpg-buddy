import { AlertTriangle, Flame, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  useAcceptPenalty,
  useMarkFailedAsDone,
  useTodayRecoveryCount,
} from '@/hooks/useFailedMissions';
import { useToast } from '@/hooks/use-toast';
import { formatRelativeDay } from '@/lib/dateUtils';

type FailedMission = {
  id: string;
  title?: string | null;
  priority?: string | null;
  failed_date?: string | null;
};

type FailedMissionsSectionProps = {
  missions: FailedMission[];
  className?: string;
};

export function FailedMissionsSection({
  missions,
  className = '',
}: FailedMissionsSectionProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const acceptPenalty = useAcceptPenalty();
  const markFailedAsDone = useMarkFailedAsDone();
  const { data: todayRecoveryCount = 0 } = useTodayRecoveryCount();

  if (missions.length === 0) return null;

  return (
    <section
      className={`rounded-xl border border-destructive/30 bg-destructive/8 overflow-hidden ${className}`.trim()}
      aria-label={t('app.missions.failed_section_title', { n: missions.length })}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-destructive/20 bg-destructive/10">
        <h3 className="text-sm font-bold text-destructive flex items-center gap-2">
          <Flame className="w-4 h-4" />
          {t('app.missions.failed_section_title', { n: missions.length })}
        </h3>
        {missions.length > 1 && (
          <button
            onClick={() => {
              acceptPenalty.mutate(missions, {
                onSuccess: () => toast({ title: 'Dispensadas.' }),
                onError: (err: Error) => toast({ title: err.message, variant: 'destructive' }),
              });
            }}
            disabled={acceptPenalty.isPending}
            className="text-[11px] px-2.5 py-1 rounded-lg bg-secondary text-muted-foreground font-bold hover:bg-secondary/70 transition-colors disabled:opacity-50 flex items-center gap-1"
          >
            {acceptPenalty.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
            Dispensar todas
          </button>
        )}
      </div>

      {missions.some((mission) => mission.priority === 'alta') && (
        <div className="flex items-center gap-2 border-b border-orange-500/30 bg-orange-500/10 px-3 py-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-orange-400" />
          <p className="text-xs font-semibold text-orange-400">
            ⚠️ Há uma missão principal não concluída — resolva com prioridade.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3">
        {missions.map((mission) => {
          const failedDate = mission.failed_date
            ? formatRelativeDay(mission.failed_date)
            : 'Hoje';

          return (
            <div
              key={mission.id}
              className="bg-card border border-destructive/20 rounded-lg p-3 flex flex-col gap-2"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{mission.title}</p>
                <p className="text-xs text-muted-foreground">Não concluída · sequência reiniciada</p>
                <p className="text-xs text-muted-foreground">📅 {failedDate}</p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => {
                    markFailedAsDone.mutate(mission, {
                      onSuccess: () => toast({ title: '✅ Missão recuperada — sequência de volta.' }),
                      onError: (err: Error) => toast({ title: err.message, variant: 'destructive' }),
                    });
                  }}
                  disabled={markFailedAsDone.isPending || todayRecoveryCount >= 2}
                  className="flex-1 text-xs px-2 py-1.5 rounded-lg bg-green-500/20 text-green-400 font-bold hover:bg-green-500/30 transition-colors disabled:opacity-50"
                  title={
                    todayRecoveryCount >= 2
                      ? 'Limite de 2 recuperações por dia atingido'
                      : `Recuperar (${2 - todayRecoveryCount} restantes hoje)`
                  }
                >
                  {markFailedAsDone.isPending ? (
                    <Loader2 className="w-3 h-3 inline mr-1 animate-spin" />
                  ) : (
                    '✅'
                  )}
                  Fiz ({2 - todayRecoveryCount})
                </button>
                <button
                  onClick={() => {
                    acceptPenalty.mutate(mission, {
                      onSuccess: () => toast({ title: 'Dispensada.' }),
                      onError: (err: Error) => toast({ title: err.message, variant: 'destructive' }),
                    });
                  }}
                  disabled={acceptPenalty.isPending}
                  className="flex-1 text-xs px-2 py-1.5 rounded-lg bg-secondary text-muted-foreground font-bold hover:bg-secondary/70 transition-colors disabled:opacity-50"
                >
                  {acceptPenalty.isPending ? (
                    <Loader2 className="w-3 h-3 inline mr-1 animate-spin" />
                  ) : (
                    '✕'
                  )}
                  Dispensar
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
