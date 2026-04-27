import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { evaluateTodayStreakRisk } from '@/lib/streakUtils';

export type HeroNotificationSeverity = 'info' | 'warn' | 'danger' | 'success';

export type HeroNotification = {
  id: string;
  icon: 'water' | 'food' | 'sleep' | 'streak' | 'fatigue' | 'mp' | 'success';
  title: string;
  message: string;
  severity: HeroNotificationSeverity;
};

type HealthStats = {
  current_hp?: number | null;
  max_hp?: number | null;
  current_mp?: number | null;
  max_mp?: number | null;
  fatigue?: number | null;
  meals_completed?: number | null;
  meals_target?: number | null;
  water_completed_ml?: number | null;
  water_target_ml?: number | null;
  sleep_time?: string | null;
  wake_time?: string | null;
};

type Mission = {
  days_of_week?: string[] | null;
  daily_status?: Record<string, string> | null;
  created_at?: string | null;
  is_failed?: boolean | null;
  failed_date?: string | null;
  completed?: boolean | null;
  completed_at?: string | null;
};

function parseHHMM(time: string | null | undefined): { h: number; m: number } | null {
  if (!time) return null;
  const match = String(time).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return { h: Number(match[1]), m: Number(match[2]) };
}

function buildNotifications(
  health: HealthStats | null,
  missions: Mission[],
): HeroNotification[] {
  const notes: HeroNotification[] = [];
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();

  // ---- Hidratação ----
  const waterTarget = Math.max(1, Number(health?.water_target_ml || 2000));
  const waterDone = Math.max(0, Number(health?.water_completed_ml || 0));
  const waterPct = waterDone / waterTarget;
  if (waterPct < 0.5 && hour >= 11) {
    notes.push({
      id: 'water-low',
      icon: 'water',
      severity: hour >= 18 ? 'danger' : 'warn',
      title: 'O herói está com sede',
      message:
        hour >= 18
          ? `Você só bebeu ${Math.round(waterPct * 100)}% da meta de água. Hidrate-se antes de dormir!`
          : `Que tal beber água agora? Você está em ${Math.round(waterPct * 100)}% da meta diária.`,
    });
  }

  // ---- Refeições ----
  const mealsTarget = Math.max(1, Number(health?.meals_target || 3));
  const mealsDone = Math.max(0, Number(health?.meals_completed || 0));
  if (mealsDone < mealsTarget) {
    if (hour >= 14 && hour < 17 && mealsDone < 2) {
      notes.push({
        id: 'food-afternoon',
        icon: 'food',
        severity: 'warn',
        title: 'Estamos no final da tarde',
        message: `O herói ainda fez apenas ${mealsDone}/${mealsTarget} refeições. Coma algo!`,
      });
    } else if (hour >= 19 && mealsDone < mealsTarget) {
      notes.push({
        id: 'food-night',
        icon: 'food',
        severity: 'danger',
        title: 'Fome ao cair da noite',
        message: `Faltam ${mealsTarget - mealsDone} refeição(ões) para sua meta de hoje.`,
      });
    }
  }

  // ---- Streak / missões do dia ----
  const streak = evaluateTodayStreakRisk(missions);
  if (streak.required > 0) {
    if (!streak.alreadyHit) {
      if (streak.atRisk && hour >= 17) {
        notes.push({
          id: 'streak-risk',
          icon: 'streak',
          severity: 'danger',
          title: 'Sua streak está em risco!',
          message: `Faltam ${streak.missingForThreshold} missão(ões) para garantir 60% hoje. Conclua antes do fim do dia!`,
        });
      } else if (hour >= 21) {
        notes.push({
          id: 'streak-end-of-day',
          icon: 'streak',
          severity: 'warn',
          title: 'Estamos chegando no final do dia',
          message: `Conclua suas missões: ${streak.completed}/${streak.required} feitas até agora.`,
        });
      } else if (hour >= 14 && streak.completed === 0) {
        notes.push({
          id: 'streak-no-progress',
          icon: 'streak',
          severity: 'info',
          title: 'O dia está passando',
          message: `Você ainda não completou nenhuma missão hoje. Comece pela mais simples!`,
        });
      }
    } else {
      notes.push({
        id: 'streak-secured',
        icon: 'success',
        severity: 'success',
        title: 'Streak garantida hoje!',
        message: `${streak.completed}/${streak.required} missões — você superou os 60%. Bom trabalho!`,
      });
    }
  }

  // ---- Sono ----
  const sleep = parseHHMM(health?.sleep_time);
  if (sleep) {
    const minutesToSleep = (sleep.h * 60 + sleep.m) - (hour * 60 + minute);
    // Mostra entre 30min antes do horário de dormir e até 60min depois
    if (minutesToSleep <= 30 && minutesToSleep >= -60) {
      notes.push({
        id: 'sleep-soon',
        icon: 'sleep',
        severity: minutesToSleep < 0 ? 'danger' : 'warn',
        title: minutesToSleep < 0 ? 'Já passou da hora de dormir' : 'Hora de dormir se aproxima',
        message:
          minutesToSleep < 0
            ? `Você combinou dormir às ${health?.sleep_time}. Vá descansar para recuperar HP/MP amanhã.`
            : `Faltam ${minutesToSleep} minutos para o seu horário de dormir (${health?.sleep_time}).`,
      });
    }
  }

  // ---- Fadiga ----
  const fatigue = Number(health?.fatigue || 0);
  if (fatigue >= 70) {
    notes.push({
      id: 'fatigue-high',
      icon: 'fatigue',
      severity: fatigue >= 90 ? 'danger' : 'warn',
      title: 'Fadiga elevada',
      message: `Sua fadiga está em ${fatigue}%. Faça um Short Rest (fogueira) para recuperar.`,
    });
  }

  // ---- MP baixo ----
  const maxMp = Number(health?.max_mp || 0);
  const currentMp = Number(health?.current_mp || 0);
  if (maxMp > 0 && currentMp / maxMp < 0.25) {
    notes.push({
      id: 'mp-low',
      icon: 'mp',
      severity: 'warn',
      title: 'Mana criticamente baixa',
      message: `Você está com ${currentMp}/${maxMp} MP. Beba água, durma cedo ou use uma poção.`,
    });
  }

  return notes;
}

export function useHeroNotifications() {
  const { user } = useAuth();

  return useQuery<HeroNotification[]>({
    queryKey: ['hero-notifications', user?.id],
    enabled: !!user,
    refetchInterval: 60_000,
    queryFn: async () => {
      if (!user) return [];

      const [healthRes, missionsRes] = await Promise.all([
        supabase
          .from('user_health_stats')
          .select(
            'current_hp, max_hp, current_mp, max_mp, fatigue, meals_completed, meals_target, water_completed_ml, water_target_ml, sleep_time, wake_time',
          )
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('missions')
          .select(
            'days_of_week, daily_status, created_at, is_failed, failed_date, completed, completed_at',
          )
          .eq('user_id', user.id),
      ]);

      const health = (healthRes.data as HealthStats | null) || null;
      const missions = (missionsRes.data as Mission[] | null) || [];

      return buildNotifications(health, missions);
    },
  });
}
