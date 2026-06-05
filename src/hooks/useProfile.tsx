import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { getAttributeLevels, getBossCombatBuffModifiers, getBossCombatStats, getPlayerCombatStats } from '@/lib/combat';
import { getEquipmentBonuses, type InventoryItem } from './useInventory';
import { getLevelFromXp } from '@/lib/progression';
import { deriveMissionCategory } from '@/lib/missionTalentRules';

function toDateString(d: Date): string {
  return d.toLocaleDateString('en-CA');
}

type ShortRestAvailability = {
  canRest: boolean;
  message: string;
  nextAvailableAt: string | null;
  lastRestAt: string | null;
};

const SHORT_REST_ACTION = 'short_rest_complete';
const SHORT_REST_STARTED_ACTION = 'short_rest_started';

function getStartOfLocalDay(base: Date = new Date()): Date {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate());
}

function getStartOfNextLocalDay(base: Date = new Date()): Date {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1);
}

function formatPtBrDateTime(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

function toFiniteNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

async function getShortRestUsageToday(userId: string): Promise<string | null> {
  const startOfDayLocal = getStartOfLocalDay();
  const { data, error } = await supabase
    .from('activity_log')
    .select('created_at')
    .eq('user_id', userId)
    .eq('action', SHORT_REST_ACTION)
    .gte('created_at', startOfDayLocal.toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as any)?.created_at ?? null;
}

export function useShortRestAvailability() {
  const { user } = useAuth();

  return useQuery<ShortRestAvailability>({
    queryKey: ['short_rest_status', user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) throw new Error('Não autenticado');

      // Só bloqueia quando o timer foi concluído completamente (short_rest_complete).
      // Iniciar e cancelar não conta — o usuário pode recomeçar quantas vezes quiser
      // até esgotar o tempo de uma vez só.
      const usedAt = await getShortRestUsageToday(user.id);
      if (!usedAt) {
        return {
          canRest: true,
          message: 'Descanso breve disponível. Você já pode descansar.',
          nextAvailableAt: null,
          lastRestAt: null,
        };
      }

      const nextAvailableDate = getStartOfNextLocalDay();
      return {
        canRest: false,
        message: `Descanso breve concluído hoje. Disponível novamente em ${formatPtBrDateTime(nextAvailableDate)}.`,
        nextAvailableAt: nextAvailableDate.toISOString(),
        lastRestAt: usedAt,
      };
    },
  });
}

export function useShortRestStart() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Não autenticado');

      // Só bloqueia se o descanso já foi concluído hoje (timer esgotado).
      // Iniciar e cancelar não bloqueia — o usuário pode tentar de novo.
      const completedAt = await getShortRestUsageToday(user.id);
      if (completedAt) {
        const nextAvailableDate = getStartOfNextLocalDay();
        throw new Error(`Você já concluiu seu descanso breve hoje. Disponível novamente em ${formatPtBrDateTime(nextAvailableDate)}.`);
      }

      // Log para analytics (não bloqueia disponibilidade).
      await supabase.from('activity_log').insert({
        user_id: user.id,
        action: SHORT_REST_STARTED_ACTION,
        description: 'Descanso curto iniciado',
        xp_gained: 0,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activity', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['short_rest_status', user?.id] });
    },
  });
}

// ── STREAK HELPERS ────────────────────────────────────────────────────
/** Calcula a streak de uma missão diária a partir do daily_status (sem query DB). */
export function computeStreakFromDailyStatus(
  dailyStatus: Record<string, string>,
): number {
  const completedDates = Object.entries(dailyStatus)
    .filter(([, v]) => v === 'completed')
    .map(([d]) => d)
    .sort((a, b) => (b > a ? 1 : -1)); // mais recente primeiro

  if (completedDates.length === 0) return 0;

  let streak = 1;
  for (let i = 0; i < completedDates.length - 1; i++) {
    const curr = new Date(completedDates[i] + 'T12:00:00');
    const next = new Date(completedDates[i + 1] + 'T12:00:00');
    const diffDays = Math.round((curr.getTime() - next.getTime()) / 86400000);
    if (diffDays <= 2) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

/** Multiplicador de XP por hábito (streak da missão). Teto em 21 dias (formação de hábito). */
export function getStreakXpMultiplier(streak: number): number {
  if (streak >= 21) return 1.75;  // +75% XP (hábito consolidado — teto)
  if (streak >= 14) return 1.5;   // +50%
  if (streak >= 7)  return 1.3;   // +30%
  if (streak >= 3)  return 1.1;   // +10%
  return 1.0;
}

/** Rótulo legível do bônus de streak para exibir na UI. */
export function getStreakXpBonusLabel(streak: number): string {
  if (streak >= 21) return '+75% XP';
  if (streak >= 14) return '+50% XP';
  if (streak >= 7)  return '+30% XP';
  if (streak >= 3)  return '+10% XP';
  return '';
}


export function useProfile() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("user_id", user!.id).maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
    enabled: !!user,
    retry: 1,
  });
}

export function useUpdateDisplayName() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (newName: string) => {
      if (!user) throw new Error("Não autenticado");
      const trimmed = newName.trim();
      if (!trimmed || trimmed.length < 2 || trimmed.length > 30) {
        throw new Error("O nome deve ter entre 2 e 30 caracteres.");
      }

      // Check last name change
      const { data: profile, error: fetchErr } = await supabase
        .from("profiles")
        .select("last_name_change")
        .eq("user_id", user.id)
        .single();
      if (fetchErr) throw fetchErr;

      const lastChange = profile?.last_name_change;
      if (lastChange) {
        const diff = Date.now() - new Date(lastChange).getTime();
        const sevenDays = 7 * 24 * 60 * 60 * 1000;
        if (diff < sevenDays) {
          const nextDate = new Date(new Date(lastChange).getTime() + sevenDays);
          throw new Error(`Você só pode trocar de nome 1x por semana. Próximo: ${nextDate.toLocaleDateString('pt-BR')}`);
        }
      }

      const { error } = await supabase
        .from("profiles")
        .update({
          display_name: trimmed,
          last_name_change: new Date().toISOString(),
        } as any)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });
}

export function useUpdateRegion() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (region: string | null) => {
      if (!user) throw new Error("Não autenticado");
      const { error } = await supabase
        .from("profiles")
        .update({ region } as any)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });
}

export function useAttributes() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["attributes", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("attributes").select("*").eq("user_id", user!.id).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });
}

// Hooks de missões extraídos para reduzir o tamanho deste arquivo (#30).
export { useMissions, useCompleteMission, useCreateMission } from './useMissionsHooks';

export function useActivityLog() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["activity", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activity_log")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });
}

// Hooks de boss/combate extraídos para reduzir o tamanho deste arquivo (#30).
export { useBosses, useBossBattles, useFightBoss, useStartActiveCombat, useWorldEventBosses } from './useBossCombat';

export function useClasses() {
  return useQuery({
    queryKey: ["classes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("classes").select("*").order("column_index").order("level_min");
      if (error) throw error;
      return data;
    },
  });
}

export function useSelectClass() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ classId, starterClass }: { classId: string; starterClass?: string }) => {
      const updates: Record<string, unknown> = { current_class_id: classId };
      if (starterClass) updates.starter_class = starterClass;
      const { error } = await supabase
        .from("profiles")
        .updateupdates
        .eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });
}

export function useChecklistItems(missionId: string) {
  return useQuery({
    queryKey: ["checklist", missionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checklist_items")
        .select("*")
        .eq("mission_id", missionId)
        .order("created_at");
      if (error) throw error;
      return data;
    },
    enabled: !!missionId,
  });
}

export function useAddChecklistItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ missionId, description }: { missionId: string; description: string }) => {
      const { error } = await supabase.from("checklist_items").insert({ mission_id: missionId, description });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["checklist", vars.missionId] });
    },
  });
}

export function useToggleChecklistItem() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId, completed, xpBonus }: { itemId: string; completed: boolean; xpBonus?: number }) => {
      const { error } = await supabase.from("checklist_items").update({ completed }).eq("id", itemId);
      if (error) throw error;

      if (completed && user) {
        const bonus = xpBonus || 2;
        await supabase.from("xp_history" as any).insert({
          user_id: user.id,
          xp_gained: bonus,
          type: "sub_mission",
        } as any);

        // 🔒 Server-side: bônus de XP do checklist via add_xp_to_user (auth.uid()+clamp).
        await supabase.rpc('add_xp_to_user', { p_user_id: user.id, p_xp: bonus });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["checklist"] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["xp_history"] });
    },
  });
}

export function useXpHistory(days: number = 7) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["xp_history", user?.id, days],
    queryFn: async () => {
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - days);
      const { data, error } = await supabase
        .from("xp_history" as any)
        .select("*")
        .eq("user_id", user!.id)
        .gte("date", fromDate.toISOString().split("T")[0])
        .order("date");
      if (error) throw error;
      return data as any[];
    },
    enabled: !!user,
  });
}

export function useTodayXp() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["xp_today", user?.id],
    queryFn: async () => {
      const now = new Date();
      const startOfDayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const { data, error } = await supabase
        .from("activity_log" as any)
        .select("xp_gained")
        .eq("user_id", user!.id)
        .gt("xp_gained", 0)
        .gte("created_at", startOfDayLocal.toISOString());
      if (error) throw error;
      return (data || []).reduce((sum: number, item: any) => sum + (item.xp_gained || 0), 0);
    },
    enabled: !!user,
    refetchInterval: 10000,
  });
}

export function useTodayMissionsCount() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["missions_today_count", user?.id],
    queryFn: async () => {
      const today = new Date().toLocaleDateString('en-CA');
      const { data, error } = await supabase
        .from("mission_daily_completions" as any)
        .select("id")
        .eq("user_id", user!.id)
        .eq("completion_date", today);
      if (error) throw error;
      return (data || []).length;
    },
    enabled: !!user,
    refetchInterval: 10000,
  });
}

export function useRankPosition() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['rank_position', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: me, error: meError } = await supabase
        .from('profiles')
        .select('level, total_xp')
        .eq('user_id', user!.id)
        .single();

      if (meError) throw meError;

      const myLevel = Number((me as any)?.level ?? 1);
      const myTotalXp = Number((me as any)?.total_xp ?? 0);

      const { count: higherLevelCount, error: higherLevelError } = await supabase
        .from('profiles')
        .select('user_id', { count: 'exact', head: true })
        .gt('level', myLevel);

      if (higherLevelError) throw higherLevelError;

      const { count: sameLevelHigherXpCount, error: sameLevelHigherXpError } = await supabase
        .from('profiles')
        .select('user_id', { count: 'exact', head: true })
        .eq('level', myLevel)
        .gt('total_xp', myTotalXp);

      if (sameLevelHigherXpError) throw sameLevelHigherXpError;

      return Number(higherLevelCount ?? 0) + Number(sameLevelHigherXpCount ?? 0) + 1;
    },
    refetchInterval: 15000,
  });
}

// ✅ Hook para conceder XP quando água + comida estão completas
export function useAwardHealthXP() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      // 🔒 Server-side: guard diário, +35 XP e restauração de HP no RPC
      // claim_health_challenge (XP é escrito pelo servidor, não pelo client).
      const { error } = await supabase.rpc('claim_health_challenge');
      if (error) throw error;
      return { success: true, xpAwarded: 35 };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['activity'] });
      queryClient.invalidateQueries({ queryKey: ['health_stats'] });
    },
  });
}

/** Retorna os valores atuais de HP/MP do banco (current_hp, current_mp, max_hp, max_mp). */
export function useHealthStats() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['health_stats', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_health_stats')
        .select('current_hp, current_mp, max_hp, max_mp, fatigue')
        .eq('user_id', user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as { current_hp: number; current_mp: number; max_hp: number; max_mp: number; fatigue: number } | null;
    },
  });
}

export function useShortRestRecovery() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params?: { computedMaxHp?: number; computedMaxMp?: number }) => {
      if (!user) throw new Error('Não autenticado');

      const usedAt = await getShortRestUsageToday(user.id);
      if (usedAt) {
        const nextAvailableDate = getStartOfNextLocalDay();
        throw new Error(`Você já realizou o descanso breve hoje. Disponível novamente em ${formatPtBrDateTime(nextAvailableDate)}.`);
      }

      const { data: healthStats, error: healthError } = await supabase
        .from('user_health_stats')
        .select('max_hp, current_hp, max_mp, current_mp, fatigue')
        .eq('user_id', user.id)
        .maybeSingle();

      if (healthError) throw healthError;

      // Use computed maxes (passed from UI) so recovery is meaningful even when
      // DB max_hp/max_mp lag behind level/attribute progression.
      const dbMaxHp = toFiniteNumber(healthStats?.max_hp, 100);
      const dbMaxMp = toFiniteNumber(healthStats?.max_mp, 10);
      const effectiveMaxHp = Math.max(dbMaxHp, toFiniteNumber(params?.computedMaxHp, 0));
      const effectiveMaxMp = Math.max(dbMaxMp, toFiniteNumber(params?.computedMaxMp, 0));

      const currentHp = toFiniteNumber(healthStats?.current_hp, effectiveMaxHp);
      // Em dados legados/corrompidos, current_mp pode vir null; nesse caso tratamos como 0
      // para garantir recuperação efetiva no short rest.
      const currentMp = toFiniteNumber(healthStats?.current_mp, 0);
      const fatigue = toFiniteNumber(healthStats?.fatigue, 0);

      const hpGain = Math.max(1, Math.ceil(effectiveMaxHp * 0.3));
      const mpGain = Math.max(1, Math.ceil(effectiveMaxMp * 0.3));
      const fatigueRelief = Math.max(0, Math.ceil(fatigue * 0.3));

      const newHp = Math.min(effectiveMaxHp, currentHp + hpGain);
      const newMp = Math.min(effectiveMaxMp, currentMp + mpGain);
      const newFatigue = Math.max(0, fatigue - fatigueRelief);

      const payload: Record<string, any> = {
        max_hp: effectiveMaxHp,
        current_hp: newHp,
        max_mp: effectiveMaxMp,
        current_mp: newMp,
        fatigue: newFatigue,
      };

      if (healthStats) {
        const { error: updateError } = await supabase
          .from('user_health_stats')
          .update(payload)
          .eq('user_id', user.id);

        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('user_health_stats')
          .insert({ user_id: user.id, ...payload });

        if (insertError) throw insertError;
      }

      const hpRecovered = newHp - currentHp;
      const mpRecovered = newMp - currentMp;
      const fatigueRecovered = fatigue - newFatigue;

      const { error: logError } = await supabase.from('activity_log').insert({
        user_id: user.id,
        action: SHORT_REST_ACTION,
        description: `Descanso curto concluído: +${hpRecovered} HP, +${mpRecovered} MP, -${fatigueRecovered} fadiga`,
        xp_gained: 0,
      });

      if (logError) throw logError;

      return {
        hpRecovered,
        mpRecovered,
        fatigueRecovered,
        currentHp: newHp,
        currentMp: newMp,
        fatigue: newFatigue,
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['health_stats', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['health_stats'] });
      queryClient.invalidateQueries({ queryKey: ['activity', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['short_rest_status', user?.id] });
    },
  });
}

/**
 * Sincroniza max_hp/max_mp no banco com os valores calculados a partir do nível
 * e atributos. Necessário porque potions, water rewards, short rest e long rest
 * leem max_* do banco — sem sync, o cap fica preso em valores antigos (10/100).
 */
export function useSyncHealthMaxes() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { computedMaxHp: number; computedMaxMp: number }) => {
      if (!user) return;
      const { computedMaxHp, computedMaxMp } = params;

      const { data: stats } = await supabase
        .from('user_health_stats')
        .select('max_hp, max_mp, current_hp, current_mp')
        .eq('user_id', user.id)
        .maybeSingle();

      const currentMaxHp = Number(stats?.max_hp ?? 0);
      const currentMaxMp = Number(stats?.max_mp ?? 0);

      // Só atualiza se o computado for maior (evita "downgrade" se algum buff temporário existir)
      const needsUpdate = computedMaxHp > currentMaxHp || computedMaxMp > currentMaxMp;
      if (!needsUpdate) return;

      const newMaxHp = Math.max(currentMaxHp, computedMaxHp);
      const newMaxMp = Math.max(currentMaxMp, computedMaxMp);

      // Se current_hp/mp ainda não foram registrados, inicializa cheio.
      const currentHp = stats?.current_hp ?? newMaxHp;
      const currentMp = stats?.current_mp ?? newMaxMp;

      if (stats) {
        await supabase
          .from('user_health_stats')
          .update({ max_hp: newMaxHp, max_mp: newMaxMp })
          .eq('user_id', user.id);
      } else {
        await supabase.from('user_health_stats').insert({
          user_id: user.id,
          max_hp: newMaxHp,
          max_mp: newMaxMp,
          current_hp: currentHp,
          current_mp: currentMp,
          fatigue: 0,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['health_stats', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['health_stats'] });
    },
  });
}
