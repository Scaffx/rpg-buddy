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

/** Retorna o multiplicador de XP com base na streak de missão. */
export function getStreakXpMultiplier(streak: number): number {
  if (streak >= 30) return 2.0;   // +100% XP
  if (streak >= 14) return 1.5;   // +50%
  if (streak >= 7)  return 1.25;  // +25%
  if (streak >= 3)  return 1.10;  // +10%
  return 1.0;
}

/** Rótulo legível do bônus de streak para exibir na UI. */
export function getStreakXpBonusLabel(streak: number): string {
  if (streak >= 30) return '+100% XP';
  if (streak >= 14) return '+50% XP';
  if (streak >= 7)  return '+25% XP';
  if (streak >= 3)  return '+10% XP';
  return '';
}

async function getActiveBuffEffects(userId: string): Promise<Set<string>> {
  const { data: buffs } = await (supabase as any)
    .from('user_buffs')
    .select('id, expires_at, active, shop_items(effect)')
    .eq('user_id', userId)
    .eq('active', true);

  const now = Date.now();
  const effects = new Set<string>();

  for (const b of buffs || []) {
    const expiresAt = b.expires_at ? new Date(b.expires_at).getTime() : null;
    if (expiresAt && expiresAt < now) continue;
    const effect = b.shop_items?.effect as string | undefined;
    if (effect) effects.add(effect);
  }

  return effects;
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

      const lastChange = (profile as any)?.last_name_change;
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

export const useMissions = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['missions', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('missions')
        .select('*')
        .eq('user_id', user!.id);

      if (error) throw error;

      return (data || []) as any[];
    },
    enabled: !!user,
  });
};

// Ao completar missão, use type casting:
export const useCompleteMission = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      missionId, 
      attributeId, 
      xpReward, 
      secondaryAttributeIds = [] 
    }: {
      missionId: string; 
      attributeId: string; 
      xpReward: number; 
      secondaryAttributeIds?: string[];
    }) => {
      const today = toDateString(new Date());
      const hour = new Date().getHours();

      // 🔒 Economia server-side: toda a lógica de recompensa (XP escalado,
      // ouro por streak/checklist/talento, level, chaves de boss, efeitos de
      // talento, inspiração) roda no RPC transacional `complete_mission`.
      // O client não envia mais valores — o servidor lê tudo do banco, então
      // não é possível forjar XP/ouro/level pelo navegador.
      const { data, error } = await (supabase as any).rpc('complete_mission', {
        p_mission_id: missionId,
        p_today: today,
        p_hour: hour,
      });
      if (error) throw error;

      const result = (data || {}) as {
        inspired_granted?: boolean;
        streak_days?: number;
        streak_multiplier?: number;
        xp_gained?: number;
        gold_gained?: number;
        gained_keys?: number;
      };
      return {
        success: true,
        inspiredGranted: !!result.inspired_granted,
        streakDays: result.streak_days ?? 0,
        streakMultiplier: result.streak_multiplier ?? 1,
        xpGained: result.xp_gained ?? 0,
        goldGained: result.gold_gained ?? 0,
        gainedKeys: result.gained_keys ?? 0,
      };
    },

    // ⚡ OPTIMISTIC UPDATE: marca a missão como concluída na UI antes do servidor responder.
    onMutate: async ({ missionId, attributeId, xpReward, secondaryAttributeIds = [] }) => {
      const today = toDateString(new Date());
      await queryClient.cancelQueries({ queryKey: ['missions'] });

      const previousMissions = queryClient.getQueriesData({ queryKey: ['missions'] });
      const previousProfile = queryClient.getQueryData(['profile', user?.id]);
      const previousAttributes = queryClient.getQueryData(['attributes', user?.id]);
      const previousGold = queryClient.getQueryData(['gold-balance', user?.id]);

      // Atualiza otimisticamente as missões (marca daily_status do dia)
      queryClient.setQueriesData({ queryKey: ['missions'] }, (old: any) => {
        if (!Array.isArray(old)) return old;
        return old.map((m: any) => {
          if (m.id !== missionId) return m;
          const days: string[] = m.days_of_week || [];
          if (days.length > 0) {
            return { ...m, daily_status: { ...(m.daily_status || {}), [today]: 'completed' } };
          }
          return { ...m, completed: true, completed_at: new Date().toISOString() };
        });
      });

      // Atualiza otimisticamente o XP do perfil (estimativa)
      queryClient.setQueryData(['profile', user?.id], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          total_xp: (old.total_xp || 0) + xpReward,
          xp_today: (old.xp_today || 0) + xpReward,
          missions_completed: (old.missions_completed || 0) + 1,
        };
      });

      // Atualiza otimisticamente os atributos
      queryClient.setQueryData(['attributes', user?.id], (old: any) => {
        if (!Array.isArray(old)) return old;
        return old.map((a: any) => {
          if (a.id === attributeId) return { ...a, xp: (a.xp || 0) + xpReward };
          if (secondaryAttributeIds.includes(a.id)) return { ...a, xp: (a.xp || 0) + 12 };
          return a;
        });
      });

      // Atualiza otimisticamente o ouro (estimativa: +2)
      queryClient.setQueryData(['gold-balance', user?.id], (old: any) => {
        if (!old) return old;
        return { ...old, gold: (old.gold || 0) + 2 };
      });

      return { previousMissions, previousProfile, previousAttributes, previousGold };
    },

    // ✅ Reconcilia XP/ouro/XP-hoje/chaves com os valores EXATOS calculados pelo
    // servidor assim que o RPC responde — sem esperar o refetch. Isso elimina a
    // "demora pra contabilizar" e o salto de valor (estimativa → real).
    onSuccess: (data: any, _vars, context: any) => {
      const prevProfile = context?.previousProfile as any;
      if (prevProfile) {
        queryClient.setQueryData(['profile', user?.id], {
          ...prevProfile,
          total_xp: (prevProfile.total_xp || 0) + (data?.xpGained || 0),
          xp_today: (prevProfile.xp_today || 0) + (data?.xpGained || 0),
          missions_completed: (prevProfile.missions_completed || 0) + 1,
          boss_keys: (prevProfile.boss_keys || 0) + (data?.gainedKeys || 0),
        });
      }
      const prevGold = context?.previousGold as any;
      if (prevGold) {
        queryClient.setQueryData(['gold-balance', user?.id], {
          ...prevGold,
          gold: (prevGold.gold || 0) + (data?.goldGained || 0),
        });
      }
      // O card "XP hoje" usa a query própria useTodayXp (['xp_today']).
      queryClient.setQueryData(['xp_today', user?.id], (old: any) =>
        Number(old || 0) + (data?.xpGained || 0));
    },

    onError: (_err, _vars, context: any) => {
      // Reverte em caso de erro
      if (context?.previousMissions) {
        context.previousMissions.forEach(([key, value]: [any, any]) => {
          queryClient.setQueryData(key, value);
        });
      }
      if (context?.previousProfile) queryClient.setQueryData(['profile', user?.id], context.previousProfile);
      if (context?.previousAttributes) queryClient.setQueryData(['attributes', user?.id], context.previousAttributes);
      if (context?.previousGold) queryClient.setQueryData(['gold-balance', user?.id], context.previousGold);
    },

    onSettled: () => {
      // Re-sincroniza com o servidor após sucesso ou erro
      queryClient.invalidateQueries({ queryKey: ['missions'] });
      queryClient.invalidateQueries({ queryKey: ['attributes'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['activity'] });
      queryClient.invalidateQueries({ queryKey: ['xp_today'] });
      queryClient.invalidateQueries({ queryKey: ['xp_history'] });
      queryClient.invalidateQueries({ queryKey: ['missions_today_count'] });
      queryClient.invalidateQueries({ queryKey: ['rank_position'] });
      queryClient.invalidateQueries({ queryKey: ['gold-balance'] });
    },
  });
};

export function useCreateMission() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      title,
      attributeId,
      dueDate,
      daysOfWeek,
      horarioProvavel,
      priority,
      description,
      notes,
      secondaryAttributeIds,
    }: {
      title: string;
      attributeId: string;
      dueDate?: string;
      daysOfWeek?: string[];
      horarioProvavel?: string;
      priority?: string;
      description?: string;
      notes?: string;
      secondaryAttributeIds?: string[];
    }) => {
      const { data: primaryAttrMeta } = await supabase
        .from('attributes')
        .select('name')
        .eq('id', attributeId)
        .maybeSingle();

      const missionCategory = deriveMissionCategory({
        mission: { title, description },
        primaryAttributeName: String((primaryAttrMeta as any)?.name || ''),
      });

      const missionPayload = {
        user_id: user!.id,
        title,
        attribute_id: attributeId,
        mission_category: missionCategory,
        due_date: dueDate || null,
        days_of_week: daysOfWeek || [],
        horario_provavel: horarioProvavel || "flex",
        priority: priority || "media",
        description: description || null,
        notes: notes || null,
        secondary_attribute_ids: secondaryAttributeIds || [],
      } as any;

      const { error } = await supabase.from("missions").insert(missionPayload);

      if (error) {
        const maybeMissingCategoryColumn = String(error.message || '').toLowerCase().includes('mission_category');
        if (!maybeMissingCategoryColumn) throw error;

        const { mission_category, ...fallbackPayload } = missionPayload;
        const { error: fallbackError } = await supabase.from('missions').insert(fallbackPayload as any);
        if (fallbackError) throw fallbackError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["missions"] });
    },
  });
}

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

export function useBosses() {
  return useQuery({
    queryKey: ["bosses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("bosses").select("*").order("level");
      if (error) throw error;
      return data;
    },
  });
}

export function useBossBattles() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["boss_battles", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("boss_battles")
        .select("*, bosses(name, icon)")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });
}

export function useFightBoss() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ bossId, bossHp, xpReward, keysCost }: { bossId: string; bossHp: number; xpReward: number; keysCost: number }) => {
      // Check if boss was already defeated
      const { data: previousWin } = await supabase
        .from("boss_battles")
        .select("id")
        .eq("user_id", user!.id)
        .eq("boss_id", bossId)
        .eq("won", true)
        .limit(1);

      if (previousWin && previousWin.length > 0) {
        throw new Error("BOSS_ALREADY_DEFEATED");
      }

      // 🔑 Verificar chaves
      const { data: profile } = await supabase
        .from("profiles")
        .select("level, total_xp, boss_keys")
        .eq("user_id", user!.id)
        .single();

      const currentKeys = (profile as any)?.boss_keys || 0;
      if (currentKeys < keysCost) {
        throw new Error("INSUFFICIENT_KEYS");
      }
      // As chaves são consumidas pelo RPC resolve_boss_battle (server-side).

      const { data: attrs } = await supabase
        .from('attributes')
        .select('name, level')
        .eq('user_id', user!.id);

      const { data: boss } = await supabase
        .from('bosses')
        .select('id, level, hp, gold_reward')
        .eq('id', bossId)
        .single();

      const attrLevels = getAttributeLevels((attrs || []) as any[]);
      const playerStatsBase = getPlayerCombatStats(profile?.level || 1, attrLevels);

      const { data: inventoryData } = await (supabase as any)
        .from('user_inventory')
        .select('equipped, sintonizado, game_items(rarity, requer_sintonizacao, atk_bonus, matk_bonus, def_bonus, hp_bonus, mp_bonus, agi_bonus, crit_bonus)')
        .eq('user_id', user!.id);

      const equipBonuses = getEquipmentBonuses((inventoryData || []) as InventoryItem[]);
      const playerStats = {
        ...playerStatsBase,
        atk: playerStatsBase.atk + equipBonuses.atk,
        matk: playerStatsBase.matk + equipBonuses.matk,
        def: playerStatsBase.def + equipBonuses.def,
        agi: playerStatsBase.agi + equipBonuses.agi,
        crit: playerStatsBase.crit + equipBonuses.crit,
      };

      const activeBuffs = await getActiveBuffEffects(user!.id);
      const combatBuffs = getBossCombatBuffModifiers(activeBuffs);
      const bossStats = getBossCombatStats({ level: boss?.level || 1, hp: boss?.hp || bossHp });

      // Sistema de dano com base em atributos (balanceado no estilo d20)
      const firstRoll = Math.floor(Math.random() * 20) + 1;
      const secondRoll = Math.floor(Math.random() * 20) + 1;
      const hasInspiration = !!(profile as any)?.inspired_available;
      const attackRoll = (combatBuffs.hasAdrenaline || hasInspiration) ? Math.max(firstRoll, secondRoll) : firstRoll;
      const attackRollMultiplier = 3 + combatBuffs.attackRollMultiplierBonus;
      const critMultiplier = attackRoll === 20 ? 1.5 : 1;
      const physicalDamage = Math.max(0, playerStats.atk - Math.floor(bossStats.def * 0.65));
      const magicalDamage = Math.max(0, playerStats.matk - Math.floor(bossStats.matk * 0.35));
      const tacticalBonus = Math.floor((playerStats.agi + playerStats.crit) * 0.18);
      const playerPower = Math.floor((physicalDamage + magicalDamage + tacticalBonus + attackRoll * attackRollMultiplier) * critMultiplier);

      let bossPower = Math.floor(
        bossStats.atk * 0.75 +
        bossStats.matk * 0.45 +
        bossStats.agi * 0.2 +
        (Math.random() * 30),
      );

      bossPower = Math.floor(bossPower * combatBuffs.bossPowerMultiplier);

      const damage = Math.min(Math.max(1, playerPower), bossHp);
      const won = playerPower + Math.floor(playerStats.def * 0.4) >= bossPower;

      // 🔒 Recompensa server-side: o RPC valida chaves + "já derrotado",
      // consome chaves/buffs (adrenalina, boss_debuff, inspiração) e credita
      // XP/ouro lendo os valores do boss no banco — não confia em
      // xpReward/keysCost do client. O combate (won/damage) ainda é resolvido
      // aqui; o combate 100% autoritativo virá com a reformulação de combate.
      const { error: rpcError } = await (supabase as any).rpc('resolve_boss_battle', {
        p_boss_id: bossId,
        p_won: won,
        p_damage: damage,
      });
      if (rpcError) throw rpcError;

      return { won, damage, playerPower };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["boss_battles"] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["activity"] });
      queryClient.invalidateQueries({ queryKey: ["xp_history"] });
    },
  });
}

export function useStartActiveCombat() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ bossId }: { bossId: string }) => {
      if (!user) throw new Error('Não autenticado');

      const { data: existingCombat, error: existingCombatError } = await (supabase as any)
        .from('combates_ativos')
        .select('*')
        .eq('personagem_id', user.id)
        .eq('boss_id', bossId)
        .eq('status', 'em_andamento')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingCombatError) throw existingCombatError;
      if (existingCombat) return existingCombat;

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('level, total_xp')
        .eq('user_id', user.id)
        .single();

      if (profileError) throw profileError;

      const level = Math.max(1, profile?.level || 1);
      const totalXp = Math.max(0, profile?.total_xp || 0);

      const personagemPayload = {
        id: user.id,
        hp_max: 120 + level * 8,
        ataque_base: 14 + level * 2,
        defesa_base: 8 + Math.floor(level * 1.4),
        nivel: level,
        xp_atual: totalXp,
      };

      const { error: personagemUpsertError } = await (supabase as any)
        .from('personagens')
        .upsert(personagemPayload, { onConflict: 'id' });

      if (personagemUpsertError) throw personagemUpsertError;

      const { data: personagem, error: personagemFetchError } = await (supabase as any)
        .from('personagens')
        .select('id, hp_max')
        .eq('id', user.id)
        .single();

      if (personagemFetchError) throw personagemFetchError;

      const { data: boss, error: bossError } = await (supabase as any)
        .from('bosses')
        .select('id, hp, hp_max, level')
        .eq('id', bossId)
        .single();

      if (bossError) throw bossError;

      const hpInicialBoss = Number((boss as any).hp_max ?? (boss as any).hp ?? 100);
      const hpMaxPersonagem = Number((personagem as any).hp_max ?? 120);

      const { data: healthStats, error: healthStatsError } = await (supabase as any)
        .from('user_health_stats')
        .select('id, current_hp, max_hp, fatigue, water_target_ml, weight_kg, last_reset_date')
        .eq('user_id', user.id)
        .maybeSingle();

      if (healthStatsError) throw healthStatsError;

      let fatigue = Number((healthStats as any)?.fatigue ?? 0);
      const today = new Date().toLocaleDateString('en-CA');
      const shouldApplyDailyHydrationCheck = Boolean(healthStats) && String((healthStats as any)?.last_reset_date || '') !== today;

      if (shouldApplyDailyHydrationCheck) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toLocaleDateString('en-CA');

        const { data: yesterdayWater, error: waterError } = await (supabase as any)
          .from('water_log')
          .select('amount_ml')
          .eq('user_id', user.id)
          .eq('log_date', yesterdayStr);

        if (waterError) throw waterError;

        const waterTarget = Number((healthStats as any)?.water_target_ml ?? Math.round(Number((healthStats as any)?.weight_kg ?? 70) * 35));
        const halfTarget = waterTarget / 2;
        const yesterdayTotal = (yesterdayWater || []).reduce((sum: number, row: any) => sum + Number(row.amount_ml || 0), 0);
        const hydrationFailed = waterTarget > 0 && yesterdayTotal < halfTarget;

        if (hydrationFailed) {
          fatigue = Math.min(100, fatigue + 35);
        }

        const { error: daySyncError } = await (supabase as any)
          .from('user_health_stats')
          .update({ fatigue, last_reset_date: today })
          .eq('user_id', user.id);

        if (daySyncError) throw daySyncError;
      }

      const { data: fatigueLockState, error: fatigueLockError } = await supabase
        .from('activity_log')
        .select('action')
        .eq('user_id', user.id)
        .in('action', ['fatigue_lock_on', 'fatigue_lock_off'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (fatigueLockError) throw fatigueLockError;

      let fatigueLocked = String((fatigueLockState as any)?.action || '') === 'fatigue_lock_on';

      if (fatigue >= 100 && !fatigueLocked) {
        await supabase.from('activity_log').insert({
          user_id: user.id,
          action: 'fatigue_lock_on',
          description: 'Fadiga chegou a 100: bloqueio de boss ativado ate voltar para 50 ou menos.',
          xp_gained: 0,
        });
        fatigueLocked = true;
      }

      if (fatigueLocked && fatigue <= 50) {
        await supabase.from('activity_log').insert({
          user_id: user.id,
          action: 'fatigue_lock_off',
          description: 'Fadiga voltou para 50 ou menos: bloqueio de boss removido.',
          xp_gained: 0,
        });
        fatigueLocked = false;
      }

      if (fatigueLocked) {
        throw new Error(
          `Seu herói está exausto (fadiga ${Math.round(Number(fatigue) || 0)}%). ` +
          `Bosses ficam bloqueados quando a fadiga chega a 100% e só liberam quando ela volta a ≤50%. ` +
          `Use o Short Rest 🔥 (no topo da tela) para descansar.`
        );
      }

      const hpAtualPersistido = Number((healthStats as any)?.current_hp ?? hpMaxPersonagem);
      const hpInicialPersonagem = Math.max(1, Math.min(hpMaxPersonagem, hpAtualPersistido));

      if (healthStats) {
        const { error: updateHealthError } = await (supabase as any)
          .from('user_health_stats')
          .update({
            max_hp: hpMaxPersonagem,
            current_hp: hpInicialPersonagem,
          })
          .eq('user_id', user.id);

        if (updateHealthError) throw updateHealthError;
      } else {
        const { error: insertHealthError } = await (supabase as any)
          .from('user_health_stats')
          .insert({
            user_id: user.id,
            max_hp: hpMaxPersonagem,
            current_hp: hpInicialPersonagem,
            fatigue: 0,
          });

        if (insertHealthError) throw insertHealthError;
      }

      const { data: newCombat, error: combatInsertError } = await (supabase as any)
        .from('combates_ativos')
        .insert({
          personagem_id: user.id,
          boss_id: bossId,
          hp_atual_boss: hpInicialBoss,
          hp_atual_personagem: hpInicialPersonagem,
          turno_atual: 'player',
          status: 'em_andamento',
        })
        .select('*')
        .single();

      if (combatInsertError) throw combatInsertError;

      return newCombat;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['bosses'] });
      queryClient.invalidateQueries({ queryKey: ['combates_ativos'] });
      queryClient.invalidateQueries({ queryKey: ['health_stats'] });
    },
  });
}

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
        .update(updates as any)
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

        const { data: profile } = await supabase
          .from("profiles")
          .select("total_xp, xp_today, level")
          .eq("user_id", user.id)
          .single();
        if (profile) {
          const newTotalXp = profile.total_xp + bonus;
          const calculatedLevel = getLevelFromXp(newTotalXp);
          const newLevel = Math.max(calculatedLevel, profile.level);
          await supabase
            .from("profiles")
            .update({
              total_xp: newTotalXp,
              xp_today: profile.xp_today + bonus,
              level: newLevel,
            })
            .eq("user_id", user.id);
        }
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
      const { error } = await (supabase as any).rpc('claim_health_challenge');
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
      const { data, error } = await (supabase as any)
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

      const { data: healthStats, error: healthError } = await (supabase as any)
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
        const { error: updateError } = await (supabase as any)
          .from('user_health_stats')
          .update(payload)
          .eq('user_id', user.id);

        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await (supabase as any)
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

      const { data: stats } = await (supabase as any)
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
        await (supabase as any)
          .from('user_health_stats')
          .update({ max_hp: newMaxHp, max_mp: newMaxMp })
          .eq('user_id', user.id);
      } else {
        await (supabase as any).from('user_health_stats').insert({
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
