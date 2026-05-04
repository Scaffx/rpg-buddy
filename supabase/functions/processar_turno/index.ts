// @ts-nocheck
// deno-lint-ignore-file
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
const SUBSCRIPTION_ENV = Deno.env.get('PADDLE_ENVIRONMENT') === 'sandbox' ? 'sandbox' : 'live';

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
  current_mp?: number;
};

// Custo de MP de uma habilidade do jogador, derivado do "power".
// Mantido em sincronia com src/components/CombatArena.tsx -> getSkillMpCost.
// Cada ~15 de poder custa 1 MP (mín. 2, máx. 16) — gestão de mana relevante.
const getSkillMpCost = (power: number): number => {
  if (!power || power <= 0) return 0;
  return Math.max(2, Math.min(16, Math.ceil(power / 15)));
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
  /** Element (fogo/gelo/sagrado/trevas/natureza/agua/neutro) inferred from name/id */
  element: SkillElement;
  /** Magical skills bypass physical mitigations like stone_skin */
  isMagical: boolean;
};

type BossSkillKind =
  | 'attack'
  | 'stone_skin'
  | 'damage_reduction'
  | 'regen'
  | 'dark_curse'
  | 'slow'
  | 'fire_aura';

type BossSkillResolution = {
  name: string;
  damageMultiplier: number;
  effects: string[];
  kind: BossSkillKind;
  /** % de dano físico do jogador a ser ignorado neste turno (0..1) */
  physicalResistPct: number;
  /** % de dano TOTAL do jogador a ser reduzido neste turno (0..1) */
  damageReductionPct: number;
  /** % de HP máximo do boss a ser regenerado neste turno (0..1) */
  selfHealPct: number;
  /** % do dano final do boss reduzido por confusão/maldição que ele aplicou em si — não, isso é debuff no PLAYER */
  /** % de redução do dano que o BOSS irá causar (boss enfraquece a si por focar em controle, 0..1) */
  bossDamageSelfPenaltyPct: number;
  /** % de redução de dano causado PELO PLAYER no próximo ataque (debuff persistente, 0..1) */
  playerDamageDebuffPct: number;
};

type SkillElement = 'fogo' | 'gelo' | 'sagrado' | 'trevas' | 'natureza' | 'agua' | 'arcano' | 'neutro';

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
const ensureActiveSubscriptionOrThrow = async (supabase: ReturnType<typeof createClient>, userId: string) => {
  const { data, error } = await supabase.rpc('has_active_subscription', {
    user_uuid: userId,
    check_env: SUBSCRIPTION_ENV,
  });

  if (error) {
    throw new Error(`Falha ao validar assinatura: ${error.message}`);
  }

  if (!data) {
    const err = new Error('Assinatura inativa. Assine para continuar.');
    (err as Error & { code?: string }).code = 'PAYWALL_LOCKED';
    throw err;
  }
};

const detectSkillElement = (text: string): SkillElement => {
  const t = text.toLowerCase();
  if (/fogo|chama|igni|brasa|inferno|piro|flamej|incendi/.test(t)) return 'fogo';
  if (/gelo|frio|neve|cristal|congel|crio|glaci/.test(t)) return 'gelo';
  if (/sagrad|santo|luz|raio sereno|divino|holy|cleric/.test(t)) return 'sagrado';
  if (/trevas|sombra|escurid|abismo|necro|amaldi/.test(t)) return 'trevas';
  if (/natur|raiz|seiva|verde|floresta|veneno|toxic/.test(t)) return 'natureza';
  if (/agua|onda|mare|tsun|aqu/.test(t)) return 'agua';
  if (/arcan|lucid|vetor|runa|magic|mistic/.test(t)) return 'arcano';
  return 'neutro';
};

const buildPlayerSkillResolution = (body: ProcessarTurnoBody): SkillResolution => {
  const idAndName = `${String(body.skill_id || '')} ${String(body.skill_name || '')}`.toLowerCase();
  const skillPower = Math.max(0, toNumber(body.skill_power, 0));
  const powerBonus = clamp(skillPower / 240, 0, 0.55);
  const isDefensive = /escudo|guarda|postura|oracao|amparo|voto/.test(idAndName);
  const isSlow = /lateral|passo|fantasma|vetor|cortina|selo|ritmo|finta/.test(idAndName);
  const isMagical = /lanca|raio|magia|arcan|igni|piro|crio|necro|trevas|sombra|sagrad|luz|runa|encant|magic|lucid|vetor/.test(idAndName);
  const element = detectSkillElement(idAndName);

  const effects: string[] = [];
  if (isDefensive) effects.push('damage_reduction');
  if (isSlow) effects.push('slow');
  if (element !== 'neutro') effects.push(`element:${element}`);

  return {
    name: String(body.skill_name || 'Ataque Basico'),
    damageMultiplier: 1 + powerBonus,
    reduceIncomingPct: isDefensive ? 0.18 : 0,
    slowBossPct: isSlow ? 0.15 : 0,
    effects,
    element,
    isMagical,
  };
};

/** Detect boss skill kind from explicit effect tags + name keywords. */
const resolveBossSkillKind = (name: string, explicitEffects: string[]): BossSkillKind => {
  // Explicit tags win
  if (explicitEffects.includes('stone_skin') || explicitEffects.includes('pele_de_pedra')) return 'stone_skin';
  if (explicitEffects.includes('regen') || explicitEffects.includes('heal') || explicitEffects.includes('cura')) return 'regen';
  if (explicitEffects.includes('dark_curse') || explicitEffects.includes('curse')) return 'dark_curse';
  if (explicitEffects.includes('fire_aura') || explicitEffects.includes('fire_immune') || explicitEffects.includes('imunidade_fogo')) return 'fire_aura';
  if (explicitEffects.includes('slow')) return 'slow';
  if (explicitEffects.includes('damage_reduction')) return 'damage_reduction';

  // Name heuristics
  const t = name.toLowerCase();
  if (/pele de pedra|pele.{0,3}pedra|granito|petrif|rocha viva/.test(t)) return 'stone_skin';
  if (/regener|cura|cicatriz|sangue vivo|drenar|absor.{0,4}vital|recuper/.test(t)) return 'regen';
  if (/maldi|curse|trevas|sombra|escurid|cegueira|cega|amaldi/.test(t)) return 'dark_curse';
  if (/imunidade.{0,8}fogo|aura.{0,6}flama|chama.{0,6}interna|inferno|cor.{0,3}o de fogo/.test(t)) return 'fire_aura';
  if (/lento|teia|gelo|torpor|congel|crio|paralis/.test(t)) return 'slow';
  if (/postura|barreira|escudo|guarda|defesa|reflex|muralha/.test(t)) return 'damage_reduction';
  return 'attack';
};

const parseBossSkills = (raw: unknown): BossSkillResolution[] => {
  const fallback: BossSkillResolution[] = [
    makeBossSkill('Golpe Selvagem',  1.10, [], 'attack'),
    makeBossSkill('Acoite Pesado',   1.20, [], 'attack'),
    makeBossSkill('Pressao Brutal',  0.90, ['damage_reduction'], 'damage_reduction'),
  ];

  if (!Array.isArray(raw) || raw.length === 0) return fallback;

  return raw.map((entry: any) => {
    const name = String(entry?.name || 'Golpe Selvagem');
    const multiplier = clamp(toNumber(entry?.damage_multiplier, 1.05), 0.6, 2.5);
    const explicitEffects = Array.isArray(entry?.effects)
      ? entry.effects.map((e: unknown) => String(e).toLowerCase())
      : [];
    const kind = resolveBossSkillKind(name, explicitEffects);
    return makeBossSkill(name, multiplier, explicitEffects, kind);
  });
};

/** Build a fully-resolved BossSkillResolution given a kind. */
const makeBossSkill = (
  name: string,
  damageMultiplier: number,
  explicitEffects: string[],
  kind: BossSkillKind,
): BossSkillResolution => {
  const effects = [...explicitEffects];
  let physicalResistPct      = 0;
  let damageReductionPct     = 0;
  let selfHealPct            = 0;
  let bossDamageSelfPenaltyPct = 0;
  let playerDamageDebuffPct  = 0;
  let mult = damageMultiplier;

  switch (kind) {
    case 'stone_skin':
      // Pele de Pedra: aguenta o golpe físico, mas ataque sai mais fraco
      physicalResistPct = 0.6;
      damageReductionPct = 0.15;
      bossDamageSelfPenaltyPct = 0.35; // boss focado em defender
      mult = Math.min(mult, 0.85);
      if (!effects.includes('stone_skin')) effects.push('stone_skin');
      break;
    case 'damage_reduction':
      // Postura/Barreira/Escudo: reduz dano genérico
      damageReductionPct = 0.4;
      bossDamageSelfPenaltyPct = 0.25;
      mult = Math.min(mult, 0.9);
      if (!effects.includes('damage_reduction')) effects.push('damage_reduction');
      break;
    case 'regen':
      // Boss se cura no turno em que usa
      selfHealPct = 0.08;
      bossDamageSelfPenaltyPct = 0.4; // gasto de turno
      mult = Math.min(mult, 0.8);
      if (!effects.includes('regen')) effects.push('regen');
      break;
    case 'dark_curse':
      // Maldição: enfraquece o próximo dano do jogador (debuff aplicado já neste turno)
      playerDamageDebuffPct = 0.35;
      bossDamageSelfPenaltyPct = 0.2;
      if (!effects.includes('dark_curse')) effects.push('dark_curse');
      break;
    case 'fire_aura':
      // Aura/imunidade ao fogo: se for atacado por fogo NEGA o dano e ganha cura
      // Esses efeitos são processados na execução, não aqui
      mult = Math.max(mult, 1.1); // ataque com fogo
      if (!effects.includes('fire_aura')) effects.push('fire_aura');
      break;
    case 'slow':
      // Lentidão: efeito mantido como antes
      bossDamageSelfPenaltyPct = 0.1;
      if (!effects.includes('slow')) effects.push('slow');
      break;
    case 'attack':
    default:
      break;
  }

  return {
    name,
    damageMultiplier: mult,
    effects,
    kind,
    physicalResistPct,
    damageReductionPct,
    selfHealPct,
    bossDamageSelfPenaltyPct,
    playerDamageDebuffPct,
  };
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

    await ensureActiveSubscriptionOrThrow(supabase, user.id);

    const body = (await req.json()) as ProcessarTurnoBody;
    const combateId = body.combate_id;
    const acaoEscolhida = body.acao_escolhida;

    if (!combateId || acaoEscolhida !== 'atacar') {
      return new Response(JSON.stringify({ error: 'Invalid payload: combate_id and acao_escolhida="atacar" are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Server-side validation: bloquear habilidades pagas com custo de MP maior que o MP atual.
    // O cliente envia current_mp; se ausente, assumimos custo 0 (Ataque Básico).
    const requestedSkillPower = Math.max(0, toNumber(body.skill_power, 0));
    const requestedSkillCost = getSkillMpCost(requestedSkillPower);
    const currentMp = Math.max(0, toNumber(body.current_mp, 0));

    if (requestedSkillCost > 0 && requestedSkillCost > currentMp) {
      return new Response(
        JSON.stringify({
          error: 'insufficient_mp',
          message: `MP insuficiente para "${body.skill_name || 'habilidade'}": custa ${requestedSkillCost} MP, jogador tem ${currentMp}.`,
          required_mp: requestedSkillCost,
          current_mp: currentMp,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
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

    let danoPlayer = calculateDamage(
      playerAttackBase,
      dadoPlayer,
      effectiveBossDefense,
      2 * playerSkill.damageMultiplier,
    );

    // ── Boss MECHANICS APPLIED TO PLAYER DAMAGE ──────────────────────────
    const bossEffectLog: string[] = [...bossSkill.effects];
    let bossSelfHeal = 0;
    let elementalReaction: 'immune' | 'absorb' | 'weak' | null = null;

    // 1) Pele de Pedra: bloqueia ~60% de dano FÍSICO (não-mágico)
    if (bossSkill.physicalResistPct > 0 && !playerSkill.isMagical) {
      const before = danoPlayer;
      danoPlayer = Math.max(1, Math.floor(danoPlayer * (1 - bossSkill.physicalResistPct)));
      bossEffectLog.push(`stone_skin_blocked:${before - danoPlayer}`);
    }

    // 2) Damage reduction genérica (Postura/Barreira/Escudo)
    if (bossSkill.damageReductionPct > 0) {
      const before = danoPlayer;
      danoPlayer = Math.max(1, Math.floor(danoPlayer * (1 - bossSkill.damageReductionPct)));
      bossEffectLog.push(`reduced:${before - danoPlayer}`);
    }

    // 3) Elemento: matchup de afinidade (boss.element vs playerSkill.element)
    const bossElement = String(combat.bosses?.element || '').toLowerCase();
    const playerElement = playerSkill.element;

    // Aura/Imunidade ao Fogo: nega dano se ataque é fogo + cura o boss
    if (bossSkill.kind === 'fire_aura' && playerElement === 'fogo') {
      bossSelfHeal += Math.floor(danoPlayer * 0.5);
      danoPlayer = 0;
      elementalReaction = 'absorb';
      bossEffectLog.push('fire_immune_absorbed');
    }
    // Boss elemental absorvendo seu próprio elemento (e.g. boss "Fogo" recebe ataque de "fogo")
    else if (bossElement && playerElement !== 'neutro' && bossElement.includes(playerElement)) {
      const before = danoPlayer;
      danoPlayer = Math.max(0, Math.floor(danoPlayer * 0.5));
      elementalReaction = 'immune';
      bossEffectLog.push(`element_resist:${playerElement}:${before - danoPlayer}`);
    }
    // Fraqueza elemental: trevas/morto-vivo -> sagrado, fogo -> gelo, gelo -> fogo
    else if (
      (bossElement.includes('trevas') || bossElement.includes('morto') || bossElement.includes('demonio')) && playerElement === 'sagrado' ||
      bossElement.includes('fogo')  && playerElement === 'gelo' ||
      bossElement.includes('gelo')  && playerElement === 'fogo' ||
      bossElement.includes('natur') && playerElement === 'fogo' ||
      bossElement.includes('agua')  && playerElement === 'natureza'
    ) {
      const before = danoPlayer;
      danoPlayer = Math.floor(danoPlayer * 1.5);
      elementalReaction = 'weak';
      bossEffectLog.push(`element_weak:${playerElement}:+${danoPlayer - before}`);
    }

    let hpBossRestante = Math.max(combat.hp_atual_boss - danoPlayer, 0);

    // 4) Boss Regen: cura uma fração do HP máximo
    if (bossSkill.selfHealPct > 0 && hpBossRestante > 0) {
      const maxBossHp = toNumber(combat.bosses?.hp, hpBossRestante);
      const healAmount = Math.max(1, Math.floor(maxBossHp * bossSkill.selfHealPct));
      bossSelfHeal += healAmount;
    }
    if (bossSelfHeal > 0 && hpBossRestante > 0) {
      const maxBossHp = toNumber(combat.bosses?.hp, hpBossRestante);
      const healed = Math.min(bossSelfHeal, Math.max(0, maxBossHp - hpBossRestante));
      hpBossRestante = Math.min(maxBossHp, hpBossRestante + bossSelfHeal);
      if (healed > 0) bossEffectLog.push(`heal:+${healed}`);
    }

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
      // Skill defensiva/regen reduz o ataque do boss neste turno
      let bossMultiplier = Math.max(0.4, 1.5 * bossSkill.damageMultiplier * (1 - playerSkill.slowBossPct));
      if (bossSkill.bossDamageSelfPenaltyPct > 0) {
        bossMultiplier = bossMultiplier * (1 - bossSkill.bossDamageSelfPenaltyPct);
      }

      danoBoss = calculateDamage(
        bossAttackBase,
        dadoBoss,
        combat.personagens.defesa_base,
        bossMultiplier,
      );
      // 5) Maldição da Escuridão: reduz o dano final do jogador no PRÓXIMO ataque (aplicado já neste turno via debuff de eficácia geral) — porém, como turn é atômico, aplicamos a redução AO DANO FINAL do boss para representar a aura debilitante? Não: a maldição reduz o dano que O JOGADOR causou neste turno. Aplicamos retroativamente.
      if (bossSkill.playerDamageDebuffPct > 0) {
        const before = danoPlayer;
        const newDano = Math.max(0, Math.floor(danoPlayer * (1 - bossSkill.playerDamageDebuffPct)));
        const blocked = before - newDano;
        if (blocked > 0) {
          bossEffectLog.push(`curse_debuff:${blocked}`);
          // re-ajusta hp do boss já calculado
          hpBossRestante = Math.min(toNumber(combat.bosses?.hp, hpBossRestante), hpBossRestante + blocked);
          danoPlayer = newDano;
        }
      }
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
    const bossEffects = bossEffectLog;
    if (elementalReaction) bossEffects.push(`reaction:${elementalReaction}`);
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
      .select('id, max_hp, fatigue')
      .eq('user_id', user.id)
      .maybeSingle();

    if (currentHealth) {
      const maxHp = Number(currentHealth.max_hp ?? hpPlayerRestante);
      const updatePayload: Record<string, unknown> = {
        current_hp: Math.max(0, Math.min(maxHp, hpPlayerRestante)),
      };

      // Apply fatigue only when combat ends (vitoria or derrota)
      if (status === 'vitoria' || status === 'derrota') {
        const bossLevel = toNumber(combat.bosses?.level, 1);
        const heroLevel = toNumber(combat.personagens?.nivel, 1);
        const levelDiff = bossLevel - heroLevel;

        // 1. Base by level difference — always guarantees some fatigue
        //    Boss harder than hero = more exhaustion; even an easy boss tires you
        const baseFatigue =
          levelDiff >= 4 ? 25 :
          levelDiff >= 2 ? 20 :
          levelDiff >= 1 ? 15 :
          levelDiff === 0 ? 12 :
          levelDiff === -1 ? 10 :
          8; // weaker boss still costs at least 8

        // 2. HP lost factor — how battered you are (0% to 18%)
        const hpLostFraction = maxHp > 0 ? Math.max(0, 1 - hpPlayerRestante / maxHp) : 1;
        const damageFatigue = Math.round(hpLostFraction * 18);

        // 3. Turn factor — every 2 turns beyond the first add +1 fatigue (cap +10)
        //    rodada already holds the current turn count (1-indexed)
        const turnFatigue = Math.min(10, Math.floor(Math.max(0, rodada - 1) / 2));

        // 4. Defeat penalty — being knocked out is especially exhausting
        const defeatPenalty = status === 'derrota' ? 12 : 0;

        const fatigueGain = baseFatigue + damageFatigue + turnFatigue + defeatPenalty;
        // Hard cap per fight: 50, so a single brutal fight can't max out fatigue alone
        const cappedGain = Math.min(50, fatigueGain);
        const currentFatigue = toNumber(currentHealth.fatigue, 0);
        updatePayload.fatigue = Math.min(100, currentFatigue + cappedGain);
      } else {
        // Mid-combat: accumulate small fatigue each turn (1 per turn, cap at current+5)
        const currentFatigue = toNumber(currentHealth.fatigue, 0);
        const midCombatGain = 1;
        updatePayload.fatigue = Math.min(100, currentFatigue + midCombatGain);
      }

      await supabase
        .from('user_health_stats')
        .update(updatePayload)
        .eq('user_id', user.id);
    } else {
      await supabase
        .from('user_health_stats')
        .insert({
          user_id: user.id,
          max_hp: Math.max(1, hpPlayerRestante),
          current_hp: Math.max(0, hpPlayerRestante),
          fatigue: 0,
        });
    }

    // On victory: register boss battle, grant rewards and loot
    // ⚠️ Guerreiro Imortal: when HP hits 0 he REBIRTHS — client handles the rebirth overlay.
    //    Do NOT register boss_battles or grant rewards here; the client does it only after
    //    the player uses the "Cabeça de Basilisco" to truly defeat him.
    const isImmortalBoss = /guerreiro\s+imortal/i.test(String(combat.bosses?.name || ''));

    if (status === 'vitoria' && combat.bosses && !isImmortalBoss) {
      const bossLevel = combat.bosses.level || 1;

      // Register victory in boss_battles (for "isDefeated" tracking on BossPage)
      const alreadyRegistered = await supabase
        .from('boss_battles')
        .select('id')
        .eq('user_id', user.id)
        .eq('boss_id', combat.bosses.id)
        .eq('won', true)
        .limit(1)
        .maybeSingle();

      if (!alreadyRegistered.data) {
        await supabase.from('boss_battles').insert({
          user_id: user.id,
          boss_id: combat.bosses.id,
          damage_dealt: danoPlayer,
          won: true,
        });

        // Grant XP and gold rewards on first victory
        const xpReward = Math.max(50, bossLevel * 30);
        const goldReward = Math.max(10, bossLevel * 5);

        const { data: profileRewards } = await supabase
          .from('profiles')
          .select('total_xp, level')
          .eq('user_id', user.id)
          .maybeSingle();

        if (profileRewards) {
          const newXp = toNumber(profileRewards.total_xp, 0) + xpReward;
          const newLevel = Math.max(toNumber(profileRewards.level, 1), Math.floor(newXp / 200) + 1);
          await supabase
            .from('profiles')
            .update({ total_xp: newXp, level: newLevel })
            .eq('user_id', user.id);
        }

        const { data: balanceRow } = await supabase
          .from('user_balance')
          .select('gold')
          .eq('user_id', user.id)
          .maybeSingle();

        if (balanceRow) {
          await supabase
            .from('user_balance')
            .update({ gold: toNumber(balanceRow.gold, 0) + goldReward, updated_at: new Date().toISOString() })
            .eq('user_id', user.id);
        }

        await supabase.from('activity_log').insert({
          user_id: user.id,
          action: 'boss_defeated',
          description: `Boss derrotado! +${xpReward} XP +${goldReward} 🪙`,
          xp_gained: xpReward,
        });
      }

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
    if (error instanceof Error && (error as Error & { code?: string }).code === 'PAYWALL_LOCKED') {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 402,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.error('processar_turno error:', error);
    const errMsg = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({
        error: 'Erro ao processar turno',
        message: errMsg,
        // contexto útil para o cliente diagnosticar; não vaza nada sensível.
        hint: 'Tente novamente. Se persistir, recarregue a arena.',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
