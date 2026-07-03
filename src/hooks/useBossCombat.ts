import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { getAttributeLevels, getBossCombatBuffModifiers, getBossCombatStats, getPlayerCombatStats, computeSoloCombatStats } from '@/lib/combat';
import { getEquipmentBonuses, type InventoryItem } from './useInventory';
import { getActivePetType, getPetBonus, applyPetBonus } from '@/lib/pets';

// Conjunto de efeitos de buff ativos (não expirados) do usuário.
async function getActiveBuffEffects(userId: string): Promise<Set<string>> {
  const { data: buffs } = await supabase
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

export function useBosses() {
  return useQuery({
    queryKey: ["bosses"],
    queryFn: async () => {
      // Escada normal: exclui os bosses de evento mundial (raides de 10),
      // que têm fluxo de entrada próprio (Fase 2).
      const { data, error } = await supabase
        .from("bosses")
        .select("*")
        .eq("is_world_event", false)
        .order("level");
      if (error) throw error;
      return data;
    },
  });
}

/** Bosses de evento mundial (raides de 10 jogadores) — usado na seção de Eventos. */
export function useWorldEventBosses() {
  return useQuery({
    queryKey: ["bosses_world_event"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bosses")
        .select("*")
        .eq("is_world_event", true)
        .order("level");
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

      const currentKeys = profile?.boss_keys || 0;
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

      const { data: inventoryData } = await supabase
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
      const hasInspiration = !!profile?.inspired_available;
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
      const { error: rpcError } = await supabase.rpc('resolve_boss_battle', {
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

      const { data: existingCombat, error: existingCombatError } = await supabase
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
        .select('level, total_xp, starter_class')
        .eq('user_id', user.id)
        .single();

      if (profileError) throw profileError;

      const level = Math.max(1, profile?.level || 1);
      const totalXp = Math.max(0, profile?.total_xp || 0);

      // Stats de combate por ATRIBUTO, CALIBRADOS (1.0). Antes: level-only (120+8L / 14+2L / 8+1.4L),
      // que tornava o combate on-level injogável após ~lvl13 (DPS do boss escalava ~3x o EHP do player).
      // Blend = base de nível (on-target p/ 4-10 turnos) + fração do bônus de atributo
      // (ATK 0.45 / DEF 0.35 / HP 0.80, calibrado no modelo determinístico). NÃO usa o stat cru de
      // getPlayerCombatStats (que estoura: boss morre em ~3 turnos e toma 1 de dano pelo penhasco da DEF).
      const { data: attrs, error: attrsError } = await supabase
        .from('attributes')
        .select('name, level')
        .eq('user_id', user.id);
      if (attrsError) throw attrsError;

      // Bônus de EQUIPAMENTO equipado (#3): agora ENTRAM no combate por turnos. Antes eram inertes —
      // o motor lê personagens.ataque_base/defesa_base/hp_max + user_health_stats.max_mp, que setamos
      // aqui no cliente; então somar os bônus aqui os torna efetivos sem mudar a edge.
      const { data: invForCombat } = await supabase
        .from('user_inventory')
        .select('equipped, sintonizado, game_items(rarity, requer_sintonizacao, atk_bonus, matk_bonus, def_bonus, hp_bonus, mp_bonus, agi_bonus, crit_bonus)')
        .eq('user_id', user.id);
      const equip = getEquipmentBonuses((invForCombat || []) as InventoryItem[]);

      // §1: stats por atributo, blend calibrado (1.0) + ofensivo mapeado por classe.
      // Lógica pura/testável em computeSoloCombatStats (src/lib/combat.ts). Boss intocado.
      const baseStats =
        computeSoloCombatStats(level, getAttributeLevels((attrs || []) as any[]), (profile as any)?.starter_class, equip);
      // Pet ATIVO (Fase 1): bônus passivo de stat (atk/def/hp/mp), aplicado no cliente
      // ANTES de persistir. Zero XP/ouro; não toca na edge (só ajusta os stats iniciais
      // do combate). 1 pet por vez (getActivePetType). Números calibráveis em lib/pets.
      const { ataqueBase: ataqueBaseCalc, defesaBase: defesaBaseCalc, hpMax: hpMaxCalc, mpMax: mpMaxCalc } =
        applyPetBonus(baseStats, getPetBonus(getActivePetType(user.id)));
      // (crit/agi de item seguem cosméticos no combate solo: o motor não tem esquiva/crit.)

      const personagemPayload = {
        id: user.id,
        hp_max: hpMaxCalc,
        ataque_base: ataqueBaseCalc,
        defesa_base: defesaBaseCalc,
        nivel: level,
        xp_atual: totalXp,
      };

      const { error: personagemUpsertError } = await supabase
        .from('personagens')
        .upsert(personagemPayload, { onConflict: 'id' });

      if (personagemUpsertError) throw personagemUpsertError;

      const { data: personagem, error: personagemFetchError } = await supabase
        .from('personagens')
        .select('id, hp_max')
        .eq('id', user.id)
        .single();

      if (personagemFetchError) throw personagemFetchError;

      const { data: boss, error: bossError } = await supabase
        .from('bosses')
        .select('id, hp, hp_max, level')
        .eq('id', bossId)
        .single();

      if (bossError) throw bossError;

      const hpInicialBoss = Number((boss as any).hp_max ?? (boss as any).hp ?? 100);
      const hpMaxPersonagem = Number((personagem as any).hp_max ?? 120);

      const { data: healthStats, error: healthStatsError } = await supabase
        .from('user_health_stats')
        .select('id, current_hp, max_hp, fatigue, water_target_ml, weight_kg, last_reset_date')
        .eq('user_id', user.id)
        .maybeSingle();

      if (healthStatsError) throw healthStatsError;

      let fatigue = Number(healthStats?.fatigue ?? 0);
      const today = new Date().toLocaleDateString('en-CA');
      const shouldApplyDailyHydrationCheck = Boolean(healthStats) && String(healthStats?.last_reset_date || '') !== today;

      if (shouldApplyDailyHydrationCheck) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toLocaleDateString('en-CA');

        const { data: yesterdayWater, error: waterError } = await supabase
          .from('water_log')
          .select('amount_ml')
          .eq('user_id', user.id)
          .eq('log_date', yesterdayStr);

        if (waterError) throw waterError;

        const waterTarget = Number(healthStats?.water_target_ml ?? Math.round(Number(healthStats?.weight_kg ?? 70) * 35));
        const halfTarget = waterTarget / 2;
        const yesterdayTotal = (yesterdayWater || []).reduce((sum: number, row: any) => sum + Number(row.amount_ml || 0), 0);
        const hydrationFailed = waterTarget > 0 && yesterdayTotal < halfTarget;

        if (hydrationFailed) {
          fatigue = Math.min(100, fatigue + 35);
        }

        const { error: daySyncError } = await supabase
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

      const hpAtualPersistido = Number(healthStats?.current_hp ?? hpMaxPersonagem);
      const hpInicialPersonagem = Math.max(1, Math.min(hpMaxPersonagem, hpAtualPersistido));

      // Mana é recurso POR COMBATE: reabastece ao máximo (por atributo) no início de cada luta.
      // Isso evita death-spiral (sem regen server-side) e skills incastáveis (custo > pool).
      if (healthStats) {
        const { error: updateHealthError } = await supabase
          .from('user_health_stats')
          .update({
            max_hp: hpMaxPersonagem,
            current_hp: hpInicialPersonagem,
            max_mp: mpMaxCalc,
            current_mp: mpMaxCalc,
          })
          .eq('user_id', user.id);

        if (updateHealthError) throw updateHealthError;
      } else {
        const { error: insertHealthError } = await supabase
          .from('user_health_stats')
          .insert({
            user_id: user.id,
            max_hp: hpMaxPersonagem,
            current_hp: hpInicialPersonagem,
            max_mp: mpMaxCalc,
            current_mp: mpMaxCalc,
            fatigue: 0,
          });

        if (insertHealthError) throw insertHealthError;
      }

      const { data: newCombat, error: combatInsertError } = await supabase
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
