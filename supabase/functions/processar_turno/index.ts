// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type ProcessarTurnoBody = {
  combate_id?: string;
  acao_escolhida?: 'atacar' | string;
  skill_id?: string;
  skill_name?: string;
  skill_power?: number;
};

type CombatRow = {
  id: string;
  personagem_id: string;
  hp_atual_boss: number;
  hp_atual_personagem: number;
  turno_atual: 'player' | 'boss';
  status: 'em_andamento' | 'vitoria' | 'derrota';
  personagens: {
    id: string;
    ataque_base: number;
    defesa_base: number;
    nivel: number;
  } | null;
  bosses: {
    id: string;
    name: string;
    ataque_base: number;
    defesa_base: number;
    level: number;
    hp: number;
    element?: string | null;
    skills?: any;
    signature_item_name?: string | null;
  } | null;
};

type SkillResolution = {
  name: string;
  damageMultiplier: number;
  reduceIncomingPct: number;
  slowBossPct: number;
  effects: string[];
};

type BossSkillResolution = {
  name: string;
  damageMultiplier: number;
  effects: string[];
};

type BossItem = {
  id: string;
  name: string;
  atk_bonus?: number;
  matk_bonus?: number;
  def_bonus?: number;
  required_attribute?: string | null;
  required_attribute_level?: number | null;
};

const rollD20 = () => Math.floor(Math.random() * 20) + 1;

const getWeekStart = (date: Date): string => {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day; // monday start
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().split('T')[0];
};

const calculateDamage = (baseAttack: number, d20: number, defenderDefense: number, multiplier: number) => {
  const raw = baseAttack + Math.floor(d20 * multiplier) - Math.floor(defenderDefense * 0.5);
  return Math.max(1, raw);
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const toNumber = (value: unknown, fallback = 0): number => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const buildPlayerSkillResolution = (body: ProcessarTurnoBody): SkillResolution => {
  const idAndName = `${String(body.skill_id || '')} ${String(body.skill_name || '')}`.toLowerCase();
  const skillPower = Math.max(0, toNumber(body.skill_power, 0));
  const powerBonus = clamp(skillPower / 240, 0, 0.55);
  const isDefensive = /escudo|guarda|postura|oracao|amparo|voto/.test(idAndName);
  const isSlow = /lateral|passo|fantasma|vetor|cortina|selo|ritmo|finta/.test(idAndName);

  const effects: string[] = [];
  if (isDefensive) effects.push('damage_reduction');
  if (isSlow) effects.push('slow');

  return {
    name: String(body.skill_name || 'Ataque Basico'),
    damageMultiplier: 1 + powerBonus,
    reduceIncomingPct: isDefensive ? 0.18 : 0,
    slowBossPct: isSlow ? 0.15 : 0,
    effects,
  };
};

const parseBossSkills = (raw: unknown): BossSkillResolution[] => {
  const fallback: BossSkillResolution[] = [
    { name: 'Golpe Selvagem', damageMultiplier: 1.1, effects: [] },
    { name: 'Acoite Pesado', damageMultiplier: 1.2, effects: [] },
    { name: 'Pressao Brutal', damageMultiplier: 0.95, effects: ['damage_reduction'] },
  ];

  if (!Array.isArray(raw) || raw.length === 0) return fallback;

  return raw.map((entry: any) => {
    const name = String(entry?.name || 'Golpe Selvagem');
    const multiplier = clamp(toNumber(entry?.damage_multiplier, 1.05), 0.75, 2.5);
    const explicitEffects = Array.isArray(entry?.effects)
      ? entry.effects.map((e: unknown) => String(e).toLowerCase())
      : [];

    const derivedEffects = [...explicitEffects];
    const normalizedName = name.toLowerCase();
    if (derivedEffects.length === 0 && /lento|teia|gel|torpor/.test(normalizedName)) derivedEffects.push('slow');
    if (derivedEffects.length === 0 && /postura|barreira|pedra|escudo/.test(normalizedName)) derivedEffects.push('damage_reduction');

    return {
      name,
      damageMultiplier: multiplier,
      effects: derivedEffects,
    };
  });
};

const canBossUseItem = (boss: CombatRow['bosses'], item: BossItem | null): boolean => {
  if (!boss || !item) return false;

  const requiredAttr = String(item.required_attribute || '').toLowerCase().trim();
  const requiredLevel = Math.max(1, toNumber(item.required_attribute_level, 1));

  if (!requiredAttr) {
    return boss.level >= requiredLevel;
  }

  if (requiredAttr === 'forca') {
    return toNumber(boss.ataque_base, 0) >= requiredLevel * 2;
  }
  if (requiredAttr === 'resiliencia') {
    return toNumber(boss.defesa_base, 0) >= requiredLevel * 2;
  }
  if (requiredAttr === 'agilidade') {
    return toNumber(boss.level, 1) + Math.floor(toNumber(boss.ataque_base, 0) / 12) >= requiredLevel;
  }
  if (requiredAttr === 'inteligencia') {
    const elementBonus = String(boss.element || '').toLowerCase().includes('arc') ? 3 : 0;
    return toNumber(boss.level, 1) + elementBonus >= requiredLevel;
  }

  return toNumber(boss.level, 1) >= requiredLevel;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured');
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = (await req.json()) as ProcessarTurnoBody;
    const combateId = body.combate_id;
    const acaoEscolhida = body.acao_escolhida;

    if (!combateId || acaoEscolhida !== 'atacar') {
      return new Response(JSON.stringify({ error: 'Invalid payload: combate_id and acao_escolhida="atacar" are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: combat, error: combatError } = await supabase
      .from('combates_ativos')
      .select(
        `
          id,
          personagem_id,
          hp_atual_boss,
          hp_atual_personagem,
          turno_atual,
          status,
          boss_id,
          personagens!combates_ativos_personagem_id_fkey(id, ataque_base, defesa_base, nivel),
          bosses!combates_ativos_boss_id_fkey(id, name, ataque_base, defesa_base, level, hp, element, skills, signature_item_name)
        `,
      )
      .eq('id', combateId)
      .single();

    if (combatError || !combat) {
      return new Response(JSON.stringify({ error: 'Combat not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (combat.personagem_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden: combat does not belong to authenticated user' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (combat.status !== 'em_andamento' || combat.turno_atual !== 'player') {
      return new Response(JSON.stringify({ error: 'Combat is not ready for player action' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!combat.personagens || !combat.bosses) {
      return new Response(JSON.stringify({ error: 'Combat relationships are invalid' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('inspired_available')
      .eq('user_id', user.id)
      .maybeSingle();

    let bossItem: BossItem | null = null;
    if (combat.bosses) {
      const signatureItemName = String(combat.bosses.signature_item_name || '').trim();
      if (signatureItemName) {
        const { data: signatureItem } = await supabase
          .from('game_items')
          .select('id, name, atk_bonus, matk_bonus, def_bonus, required_attribute, required_attribute_level')
          .eq('name', signatureItemName)
          .limit(1)
          .maybeSingle();
        if (signatureItem) {
          bossItem = signatureItem as BossItem;
        }
      }

      if (!bossItem) {
        const { data: fallbackDropItem } = await supabase
          .from('game_items')
          .select('id, name, atk_bonus, matk_bonus, def_bonus, required_attribute, required_attribute_level')
          .eq('boss_drop_level', combat.bosses.level || 1)
          .eq('category', 'weapon')
          .order('atk_bonus', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (fallbackDropItem) {
          bossItem = fallbackDropItem as BossItem;
        }
      }
    }

    const playerSkill = buildPlayerSkillResolution(body);
    const bossSkillPool = parseBossSkills(combat.bosses?.skills);
    const bossSkill = bossSkillPool[Math.floor(Math.random() * bossSkillPool.length)];
    const bossItemEnabled = canBossUseItem(combat.bosses, bossItem);

    const isFirstPlayerAttack = Number(combat.hp_atual_boss) >= Number(combat.bosses.hp || combat.hp_atual_boss);
    const hasInspiration = Boolean((profile as any)?.inspired_available) && isFirstPlayerAttack;
    const dadoPlayer = hasInspiration ? Math.max(rollD20(), rollD20()) : rollD20();

    if (hasInspiration) {
      await supabase
        .from('profiles')
        .update({ inspired_available: false, inspired_earned_at: null })
        .eq('user_id', user.id);
    }
    const playerAttackBase =
      combat.personagens.ataque_base + Math.floor(Math.max(0, toNumber(body.skill_power, 0)) * 0.22);
    const effectiveBossDefense =
      combat.bosses.defesa_base + (bossItemEnabled ? Math.floor(toNumber(bossItem?.def_bonus, 0) * 0.5) : 0);

    const danoPlayer = calculateDamage(
      playerAttackBase,
      dadoPlayer,
      effectiveBossDefense,
      2 * playerSkill.damageMultiplier,
    );

    let hpBossRestante = Math.max(combat.hp_atual_boss - danoPlayer, 0);
    let dadoBoss = 0;
    let danoBoss = 0;
    let hpPlayerRestante = combat.hp_atual_personagem;
    let status: 'em_andamento' | 'vitoria' | 'derrota' = 'em_andamento';
    let turnoAtual: 'player' | 'boss' = 'boss';
    let lootDrop: any = null;

    if (hpBossRestante <= 0) {
      status = 'vitoria';
      turnoAtual = 'player';
    } else {
      dadoBoss = rollD20();
      const bossAttackBase =
        combat.bosses.ataque_base +
        (bossItemEnabled ? toNumber(bossItem?.atk_bonus, 0) + Math.floor(toNumber(bossItem?.matk_bonus, 0) * 0.5) : 0);
      const bossMultiplier = Math.max(0.6, 1.5 * bossSkill.damageMultiplier * (1 - playerSkill.slowBossPct));

      danoBoss = calculateDamage(
        bossAttackBase,
        dadoBoss,
        combat.personagens.defesa_base,
        bossMultiplier,
      );
      if (playerSkill.reduceIncomingPct > 0) {
        danoBoss = Math.max(1, Math.floor(danoBoss * (1 - playerSkill.reduceIncomingPct)));
      }
      hpPlayerRestante = Math.max(combat.hp_atual_personagem - danoBoss, 0);

      if (hpPlayerRestante <= 0) {
        status = 'derrota';
      } else {
        status = 'em_andamento';
      }

      turnoAtual = 'player';
    }

    const playerEffects = [...playerSkill.effects];
    const bossEffects = [...bossSkill.effects];
    if (bossItemEnabled && bossItem?.name) {
      bossEffects.push(`item:${bossItem.name}`);
    }

    const { error: updateError } = await supabase
      .from('combates_ativos')
      .update({
        hp_atual_boss: hpBossRestante,
        hp_atual_personagem: hpPlayerRestante,
        turno_atual: turnoAtual,
        status,
      })
      .eq('id', combat.id)
      .eq('personagem_id', user.id);

    if (updateError) {
      throw updateError;
    }

    let turnLogId: string | null = null;
    const { data: latestRound } = await supabase
      .from('combat_turn_logs')
      .select('rodada')
      .eq('combate_id', combat.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const rodada = Math.max(1, Number((latestRound as any)?.rodada || 0) + 1);

    const { data: insertedLog } = await supabase
      .from('combat_turn_logs')
      .insert({
        combate_id: combat.id,
        user_id: user.id,
        rodada,
        habilidade_player: playerSkill.name,
        habilidade_boss: bossSkill.name,
        dado_player: dadoPlayer,
        dado_boss: dadoBoss,
        dano_player: danoPlayer,
        dano_boss: danoBoss,
        efeitos_player: playerEffects,
        efeitos_boss: bossEffects,
        hp_boss_apos: hpBossRestante,
        hp_player_apos: hpPlayerRestante,
        status,
      })
      .select('id')
      .maybeSingle();

    turnLogId = (insertedLog as any)?.id || null;

    await supabase.from('activity_log').insert({
      user_id: user.id,
      action: 'combat_turn',
      description: `[Rodada ${rodada}] Player ${playerSkill.name} (${danoPlayer}) vs Boss ${bossSkill.name} (${danoBoss})`,
      xp_gained: 0,
    });

    // Update health stats
    const { data: currentHealth } = await supabase
      .from('user_health_stats')
      .select('id, max_hp')
      .eq('user_id', user.id)
      .maybeSingle();

    if (currentHealth) {
      const maxHp = Number(currentHealth.max_hp ?? hpPlayerRestante);
      await supabase
        .from('user_health_stats')
        .update({
          current_hp: Math.max(0, Math.min(maxHp, hpPlayerRestante)),
        })
        .eq('user_id', user.id);
    } else {
      await supabase
        .from('user_health_stats')
        .insert({
          user_id: user.id,
          max_hp: Math.max(1, hpPlayerRestante),
          current_hp: Math.max(0, hpPlayerRestante),
        });
    }

    // On victory: grant loot drop
    if (status === 'vitoria' && combat.bosses) {
      const bossLevel = combat.bosses.level || 1;
      const weekStart = getWeekStart(new Date());

      const { data: weeklyClaim } = await supabase
        .from('boss_weekly_loot_claims')
        .select('id')
        .eq('user_id', user.id)
        .eq('boss_level', bossLevel)
        .eq('week_start', weekStart)
        .maybeSingle();

      if (weeklyClaim) {
        const bonusGold = 5;
        const materialGain = 3;

        const { data: balance } = await supabase
          .from('user_balance')
          .select('gold')
          .eq('user_id', user.id)
          .maybeSingle();

        if (balance) {
          await supabase
            .from('user_balance')
            .update({ gold: Number((balance as any).gold || 0) + bonusGold, updated_at: new Date().toISOString() })
            .eq('user_id', user.id);
        }

        const { data: mats } = await supabase
          .from('user_crafting_materials')
          .select('quantity')
          .eq('user_id', user.id)
          .maybeSingle();

        if (mats) {
          await supabase
            .from('user_crafting_materials')
            .update({ quantity: Number((mats as any).quantity || 0) + materialGain, updated_at: new Date().toISOString() })
            .eq('user_id', user.id);
        } else {
          await supabase
            .from('user_crafting_materials')
            .insert({ user_id: user.id, quantity: materialGain });
        }

        await supabase.from('activity_log').insert({
          user_id: user.id,
          action: 'boss_repeat_reward',
          description: `Boss repetido na semana (Lv ${bossLevel}): +${bonusGold} Ouro e +${materialGain} Materiais`,
          xp_gained: 0,
        });
      } else {
        await supabase
          .from('boss_weekly_loot_claims')
          .insert({ user_id: user.id, boss_level: bossLevel, week_start: weekStart });

        // Find drop item for this boss level
        const { data: dropItem } = await supabase
          .from('game_items')
          .select('id, name, icon, rarity')
          .eq('boss_drop_level', bossLevel)
          .order('atk_bonus', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (dropItem) {
          // Check if player already has it
          const { data: existing } = await supabase
            .from('user_inventory')
            .select('id')
            .eq('user_id', user.id)
            .eq('item_id', dropItem.id)
            .maybeSingle();

          if (!existing) {
            await supabase.from('user_inventory').insert({
              user_id: user.id,
              item_id: dropItem.id,
              quantity: 1,
              equipped: false,
            });
            lootDrop = dropItem;
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        dado_player: dadoPlayer,
        dano_player: danoPlayer,
        dado_boss: dadoBoss,
        dano_boss: danoBoss,
        hp_boss_restante: hpBossRestante,
        hp_player_restante: hpPlayerRestante,
        status,
        loot_drop: lootDrop,
        habilidade_player: playerSkill.name,
        habilidade_boss: bossSkill.name,
        efeitos_player: playerEffects,
        efeitos_boss: bossEffects,
        log_id: turnLogId,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
