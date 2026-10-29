import type { Json } from '@/integrations/supabase/types';
import type { PetBonus, SustainEffect } from '@/lib/pets';

export type AdventurePetStats = { atk: number; def: number; hp: number; mp: number };
export type AdventurePetSnapshot = {
  companion_id: string;
  companion_type: string;
  name: string;
  bonus: PetBonus;
  sustain: SustainEffect | null;
  base_stats: AdventurePetStats;
  effective_stats: AdventurePetStats;
};

export type AdventureEncounter = {
  stage: number;
  attempt: number;
  fought_at: string;
  kind: 'normal' | 'boss';
  won: boolean;
  hero_power: number;
  enemy_power: number;
  gold: number;
  item_id: string | null;
  boss_id: string | null;
  boss_name: string | null;
  boss_icon: string | null;
  status?: 'won' | 'defeated' | 'draw';
  end_reason?: 'turn_limit' | null;
};

export type AdventureAttack = {
  at: string;
  actor: 'hero' | 'enemy';
  kind: 'attack' | 'skill';
  damage: number;
  hero_hp: number;
  enemy_hp: number;
  skill_id: string | null;
  skill_name: string | null;
  effect: 'physical' | 'arcane' | 'fire' | 'ice' | 'lightning' | 'nature' | 'light';
  hero_mp?: number;
  enemy_mp?: number;
  mp_cost?: number;
  skill_type?: 'dano' | 'heal' | 'buff' | 'debuff' | 'cc' | null;
  healing?: number;
  raw_damage?: number;
  damage_multiplier?: number;
  effect_note?: string | null;
};

export type AdventureBattle = {
  id: string;
  stage: number;
  attempt: number;
  kind: 'normal' | 'boss';
  status: 'fighting' | 'won' | 'defeated' | 'draw';
  replay: boolean;
  biome: 'forest' | 'aquatic' | 'ruins' | 'volcanic' | 'desert' | 'ice';
  started_at: string;
  ends_at: string;
  hero_power: number;
  hero_class: string;
  enemy_power: number;
  hero_max_hp: number;
  enemy_max_hp: number;
  hero_hp: number;
  enemy_hp: number;
  enemy_name: string;
  enemy_icon: string | null;
  boss_id: string | null;
  events: AdventureAttack[];
  hero_max_mp?: number;
  enemy_max_mp?: number;
  enemy_mp?: number;
  hero_mp?: number;
  hero_attack?: number;
  hero_defense?: number;
  engine_version?: string;
  enemy_resistances?: Record<string, number>;
  end_reason?: 'turn_limit' | null;
  pet?: AdventurePetSnapshot | null;
};

export type AdventureSnapshot = {
  stage: number;
  mode: 'progressing' | 'holding';
  advance_pending: boolean;
  next_at: string;
  server_now: string;
  last_result: Omit<AdventureEncounter, 'attempt' | 'fought_at'> | null;
  encounters: AdventureEncounter[];
  boss: { stage: number; id: string; name: string; icon: string | null };
  boss_wins_credited: number;
  gold_today: number;
  loot_today: number;
  reward_day: string;
  battle: AdventureBattle | null;
  last_battle: AdventureBattle | null;
  catchup: { battles: number; from_stage: number | null; to_stage: number | null; wins: number; defeats: number; draws?: number; retreats: number; gold: number; items: string[]; defeated: boolean; pending: boolean };
  limits: { interval_minutes: number; reward_interval_minutes: number; offline_hours: number; gold_per_day: number; items_per_day: number };
};

export function nextAdventureRefetchDelay(
  snapshot: AdventureSnapshot | undefined,
  dataUpdatedAt: number,
  now = Date.now(),
): number | false {
  if (!snapshot || !dataUpdatedAt) return false;
  if (snapshot.catchup.pending) {
    const remaining = 2_000 - Math.max(0, now - dataUpdatedAt);
    return remaining > 0 ? remaining : 1_000;
  }
  const serverNow = Date.parse(snapshot.server_now) + Math.max(0, now - dataUpdatedAt);
  return Math.max(1_000, Math.min(2_147_483_647, Date.parse(snapshot.next_at) - serverNow + 1_000));
}

type ObjectValue = { [key: string]: Json | undefined };

function object(value: Json | undefined): ObjectValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('AUTO_ADVENTURE_INVALID_RESPONSE');
  return value;
}

function number(value: Json | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('AUTO_ADVENTURE_INVALID_RESPONSE');
  return value;
}

function string(value: Json | undefined): string {
  if (typeof value !== 'string') throw new Error('AUTO_ADVENTURE_INVALID_RESPONSE');
  return value;
}

function nullableString(value: Json | undefined): string | null {
  if (value === null) return null;
  return string(value);
}

function date(value: Json | undefined): string {
  const parsed = string(value);
  if (!Number.isFinite(Date.parse(parsed))) throw new Error('AUTO_ADVENTURE_INVALID_RESPONSE');
  return parsed;
}

function nullableNumber(value: Json | undefined): number | null {
  if (value === null) return null;
  return number(value);
}

function boolean(value: Json | undefined): boolean {
  if (typeof value !== 'boolean') throw new Error('AUTO_ADVENTURE_INVALID_RESPONSE');
  return value;
}

function optionalNumber(value: Json | undefined): number | undefined {
  return value === undefined ? undefined : number(value);
}

function optionalMana(value: Json | undefined): number | undefined {
  if (value == null) return undefined;
  const parsed = number(value);
  if (parsed < 0) throw new Error('AUTO_ADVENTURE_INVALID_RESPONSE');
  return parsed;
}

function optionalNullableString(value: Json | undefined): string | null | undefined {
  return value === undefined ? undefined : nullableString(value);
}

function optionalEndReason(value: Json | undefined): AdventureBattle['end_reason'] {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (value === 'turn_limit') return 'turn_limit';
  throw new Error('AUTO_ADVENTURE_INVALID_RESPONSE');
}

function optionalResultStatus(value: Json | undefined): AdventureEncounter['status'] {
  if (value === undefined) return undefined;
  if (value !== 'won' && value !== 'defeated' && value !== 'draw')
    throw new Error('AUTO_ADVENTURE_INVALID_RESPONSE');
  return value;
}

function optionalResistances(value: Json | undefined): Record<string, number> | undefined {
  if (value === undefined) return undefined;
  const row = object(value);
  return Object.fromEntries(Object.entries(row).map(([key, multiplier]) => [key, number(multiplier)]));
}

function petStats(value: Json | undefined): AdventurePetStats {
  const row = object(value);
  return { atk: number(row.atk), def: number(row.def), hp: number(row.hp), mp: number(row.mp) };
}

function optionalPet(value: Json | undefined): AdventurePetSnapshot | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const row = object(value);
  const bonus = object(row.bonus);
  if (!['atk', 'def', 'hp', 'mp'].includes(String(bonus.stat))) throw new Error('AUTO_ADVENTURE_INVALID_RESPONSE');
  const pct = number(bonus.pct);
  if (pct < 0 || pct > 1) throw new Error('AUTO_ADVENTURE_INVALID_RESPONSE');
  let sustain: SustainEffect | null = null;
  if (row.sustain !== null) {
    const effect = object(row.sustain);
    if (!['regen_hp', 'regen_mp', 'mp_cost'].includes(String(effect.kind))) throw new Error('AUTO_ADVENTURE_INVALID_RESPONSE');
    const sustainPct = number(effect.pct);
    if (sustainPct < 0 || sustainPct > 1) throw new Error('AUTO_ADVENTURE_INVALID_RESPONSE');
    sustain = { kind: effect.kind as SustainEffect['kind'], pct: sustainPct };
  }
  return {
    companion_id: string(row.companion_id), companion_type: string(row.companion_type),
    name: string(row.name), bonus: { stat: bonus.stat as PetBonus['stat'], pct }, sustain,
    base_stats: petStats(row.base_stats), effective_stats: petStats(row.effective_stats),
  };
}

function attack(value: Json): AdventureAttack {
  const row = object(value);
  if (row.actor !== 'hero' && row.actor !== 'enemy') throw new Error('AUTO_ADVENTURE_INVALID_RESPONSE');
  if (row.kind !== 'attack' && row.kind !== 'skill') throw new Error('AUTO_ADVENTURE_INVALID_RESPONSE');
  if (!['physical', 'arcane', 'fire', 'ice', 'lightning', 'nature', 'light'].includes(String(row.effect))) throw new Error('AUTO_ADVENTURE_INVALID_RESPONSE');
  return {
    at: date(row.at), actor: row.actor, kind: row.kind,
    damage: number(row.damage), hero_hp: number(row.hero_hp), enemy_hp: number(row.enemy_hp),
    skill_id: nullableString(row.skill_id), skill_name: nullableString(row.skill_name),
    effect: row.effect as AdventureAttack['effect'],
    hero_mp: optionalNumber(row.hero_mp), mp_cost: optionalNumber(row.mp_cost),
    enemy_mp: optionalMana(row.enemy_mp),
    skill_type: row.skill_type === undefined ? undefined
      : row.skill_type === null || ['dano', 'heal', 'buff', 'debuff', 'cc'].includes(String(row.skill_type))
        ? row.skill_type as AdventureAttack['skill_type']
        : (() => { throw new Error('AUTO_ADVENTURE_INVALID_RESPONSE'); })(),
    healing: optionalNumber(row.healing), raw_damage: optionalNumber(row.raw_damage),
    damage_multiplier: optionalNumber(row.damage_multiplier),
    effect_note: optionalNullableString(row.effect_note),
  };
}

function battle(value: Json): AdventureBattle {
  const row = object(value);
  if (row.kind !== 'normal' && row.kind !== 'boss') throw new Error('AUTO_ADVENTURE_INVALID_RESPONSE');
  if (row.status !== 'fighting' && row.status !== 'won' && row.status !== 'defeated' && row.status !== 'draw') throw new Error('AUTO_ADVENTURE_INVALID_RESPONSE');
  if (!['forest', 'aquatic', 'ruins', 'volcanic', 'desert', 'ice'].includes(String(row.biome))) throw new Error('AUTO_ADVENTURE_INVALID_RESPONSE');
  if (!Array.isArray(row.events)) throw new Error('AUTO_ADVENTURE_INVALID_RESPONSE');
  return {
    id: string(row.id), stage: number(row.stage), attempt: number(row.attempt),
    kind: row.kind, status: row.status, replay: boolean(row.replay),
    biome: row.biome as AdventureBattle['biome'],
    started_at: date(row.started_at), ends_at: date(row.ends_at),
    hero_power: number(row.hero_power), hero_class: string(row.hero_class), enemy_power: number(row.enemy_power),
    hero_max_hp: number(row.hero_max_hp), enemy_max_hp: number(row.enemy_max_hp),
    hero_hp: number(row.hero_hp), enemy_hp: number(row.enemy_hp),
    enemy_name: string(row.enemy_name), enemy_icon: nullableString(row.enemy_icon),
    boss_id: nullableString(row.boss_id), events: row.events.map(attack),
    hero_max_mp: optionalNumber(row.hero_max_mp), hero_mp: optionalNumber(row.hero_mp),
    enemy_max_mp: optionalMana(row.enemy_max_mp), enemy_mp: optionalMana(row.enemy_mp),
    hero_attack: optionalNumber(row.hero_attack), hero_defense: optionalNumber(row.hero_defense),
    engine_version: row.engine_version === undefined ? undefined : string(row.engine_version),
    enemy_resistances: optionalResistances(row.enemy_resistances),
    end_reason: optionalEndReason(row.end_reason),
    pet: optionalPet(row.pet),
  };
}

function encounter(value: Json, historical: false): AdventureEncounter;
function encounter(value: Json, historical: true): Omit<AdventureEncounter, 'attempt' | 'fought_at'>;
function encounter(value: Json, historical: boolean) {
  const row = object(value);
  const kind = row.kind;
  if (kind !== 'normal' && kind !== 'boss') throw new Error('AUTO_ADVENTURE_INVALID_RESPONSE');
  if (typeof row.won !== 'boolean') throw new Error('AUTO_ADVENTURE_INVALID_RESPONSE');
  const base: Omit<AdventureEncounter, 'attempt' | 'fought_at'> = {
    stage: number(row.stage), kind, won: row.won,
    hero_power: number(row.hero_power), enemy_power: number(row.enemy_power),
    gold: number(row.gold), item_id: nullableString(row.item_id),
    boss_id: nullableString(row.boss_id), boss_name: nullableString(row.boss_name),
    boss_icon: nullableString(row.boss_icon),
    status: optionalResultStatus(row.status), end_reason: optionalEndReason(row.end_reason),
  };
  return historical ? base : { ...base, attempt: number(row.attempt), fought_at: date(row.fought_at) };
}

export function parseAdventureSnapshot(payload: Json): AdventureSnapshot {
  const row = object(payload);
  if (row.mode !== 'progressing' && row.mode !== 'holding') throw new Error('AUTO_ADVENTURE_INVALID_RESPONSE');
  if (!Array.isArray(row.encounters)) throw new Error('AUTO_ADVENTURE_INVALID_RESPONSE');
  const boss = object(row.boss);
  const limits = object(row.limits);
  const catchup = object(row.catchup);
  if (!Array.isArray(catchup.items)) throw new Error('AUTO_ADVENTURE_INVALID_RESPONSE');
  return {
    stage: number(row.stage), mode: row.mode, advance_pending: boolean(row.advance_pending),
    next_at: date(row.next_at), server_now: date(row.server_now),
    last_result: row.last_result === null ? null : encounter(row.last_result, true),
    encounters: row.encounters.map(entry => encounter(entry, false)),
    boss: { stage: number(boss.stage), id: string(boss.id), name: string(boss.name), icon: nullableString(boss.icon) },
    boss_wins_credited: number(row.boss_wins_credited),
    gold_today: number(row.gold_today), loot_today: number(row.loot_today),
    reward_day: date(row.reward_day),
    battle: row.battle === null ? null : battle(row.battle),
    last_battle: row.last_battle === null ? null : battle(row.last_battle),
    catchup: {
      battles: number(catchup.battles), from_stage: nullableNumber(catchup.from_stage),
      to_stage: nullableNumber(catchup.to_stage), wins: number(catchup.wins),
      defeats: number(catchup.defeats), retreats: number(catchup.retreats), gold: number(catchup.gold),
      draws: optionalNumber(catchup.draws),
      items: catchup.items.map(string), defeated: boolean(catchup.defeated), pending: boolean(catchup.pending),
    },
    limits: {
      interval_minutes: number(limits.interval_minutes), offline_hours: number(limits.offline_hours),
      reward_interval_minutes: number(limits.reward_interval_minutes),
      gold_per_day: number(limits.gold_per_day), items_per_day: number(limits.items_per_day),
    },
  };
}
