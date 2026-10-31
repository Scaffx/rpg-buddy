import type { Json } from '@/integrations/supabase/types';
import type { PetBonus, SustainEffect } from '@/lib/pets';
import type { HordeEnemy, HordeHit } from '@/lib/adventureHordeContract';
import { adventureServerTime } from '@/lib/adventureClock';

export type AdventurePetStats = { atk: number; def: number; hp: number; mp: number };
export type AdventurePetSnapshot = {
  companion_id: string;
  companion_type: string;
  name: string;
  bonus: PetBonus;
  sustain: SustainEffect | null;
  participation?: number;
  care_as_of?: string;
  effective_bonus?: PetBonus;
  effective_sustain?: SustainEffect | null;
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
  end_reason?: 'turn_limit' | 'event_limit' | null;
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
  mp_restored?: number;
  raw_damage?: number;
  damage_multiplier?: number;
  effect_note?: string | null;
  actor_slot?: number | null;
  target_slot?: number | null;
  target_slots?: number[];
  hits?: HordeHit[];
  enemies_hp?: number[];
  enemies_mp?: number[];
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
  end_reason?: 'turn_limit' | 'event_limit' | null;
  pet?: AdventurePetSnapshot | null;
  enemies?: HordeEnemy[];
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
): number | false {
  if (!snapshot || !dataUpdatedAt) return false;
  if (snapshot.catchup.pending) {
    const remaining = 2_000 - Math.max(0, Date.now() - dataUpdatedAt);
    return remaining > 0 ? remaining : 1_000;
  }
  const serverNow = adventureServerTime(snapshot);
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

function validCivilDate(year: number, month: number, day: number): boolean {
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1];
}

function date(value: Json | undefined): string {
  const parsed = string(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/.exec(parsed);
  if (!match) throw new Error('AUTO_ADVENTURE_INVALID_RESPONSE');
  const [, year, month, day, hour, minute, second, offset] = match;
  const offsetDigits = offset === 'Z' ? null : offset.slice(1).replace(':', '');
  const offsetHour = offsetDigits ? Number(offsetDigits.slice(0, 2)) : 0;
  const offsetMinute = offsetDigits ? Number(offsetDigits.slice(2)) : 0;
  if (!validCivilDate(Number(year), Number(month), Number(day)) || Number(hour) > 23 ||
      Number(minute) > 59 || Number(second) > 59 || offsetHour > 23 || offsetMinute > 59 ||
      !Number.isFinite(Date.parse(parsed))) throw new Error('AUTO_ADVENTURE_INVALID_RESPONSE');
  return parsed;
}

function civilDate(value: Json | undefined): string {
  const parsed = string(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(parsed);
  if (!match || !validCivilDate(Number(match[1]), Number(match[2]), Number(match[3])))
    throw new Error('AUTO_ADVENTURE_INVALID_RESPONSE');
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

function optionalPositiveInteger(value: Json | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error('AUTO_ADVENTURE_INVALID_RESPONSE');
  return parsed;
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
  if (value === 'turn_limit' || value === 'event_limit') return value;
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

function slot(value: Json | undefined): number | null {
  if (value === null) return null;
  const parsed = number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error('AUTO_ADVENTURE_INVALID_RESPONSE');
  return parsed;
}

function hordeEnemy(value: Json): HordeEnemy {
  const row = object(value);
  const enemySlot = slot(row.slot);
  if (enemySlot === null) throw new Error('AUTO_ADVENTURE_INVALID_RESPONSE');
  const parsed: HordeEnemy = {
    slot: enemySlot, id: string(row.id), name: string(row.name),
    icon: nullableString(row.icon), boss_id: nullableString(row.boss_id),
    max_hp: number(row.max_hp), hp: number(row.hp),
    max_mp: number(row.max_mp), mp: number(row.mp),
    resistances: optionalResistances(row.resistances) ?? (() => { throw new Error('AUTO_ADVENTURE_INVALID_RESPONSE'); })(),
  };
  if (!parsed.id || !parsed.name || parsed.max_hp <= 0 || parsed.hp < 0 || parsed.hp > parsed.max_hp ||
      parsed.max_mp < 0 || parsed.mp < 0 || parsed.mp > parsed.max_mp) throw new Error('AUTO_ADVENTURE_INVALID_RESPONSE');
  return parsed;
}

function hordeHit(value: Json): HordeHit {
  const row = object(value);
  const targetSlot = slot(row.target_slot);
  if (targetSlot === null) throw new Error('AUTO_ADVENTURE_INVALID_RESPONSE');
  const hit = { target_slot: targetSlot, damage: number(row.damage),
    raw_damage: number(row.raw_damage), damage_multiplier: number(row.damage_multiplier) };
  if (hit.damage < 0 || hit.raw_damage < 0 || hit.damage_multiplier < 0)
    throw new Error('AUTO_ADVENTURE_INVALID_RESPONSE');
  return hit;
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
  const careKeys = ['participation', 'care_as_of', 'effective_bonus', 'effective_sustain'] as const;
  const careFields = careKeys.filter((key) => row[key] !== undefined);
  if (careFields.length !== 0 && careFields.length !== careKeys.length)
    throw new Error('AUTO_ADVENTURE_INVALID_RESPONSE');
  let care: Pick<AdventurePetSnapshot, 'participation' | 'care_as_of' | 'effective_bonus' | 'effective_sustain'> = {};
  if (careFields.length) {
    const participation = number(row.participation);
    if (participation < 0 || participation > 1) throw new Error('AUTO_ADVENTURE_INVALID_RESPONSE');
    const effectiveBonus = object(row.effective_bonus);
    const effectiveBonusPct = number(effectiveBonus.pct);
    if (effectiveBonus.stat !== bonus.stat || effectiveBonusPct < 0 || effectiveBonusPct > pct)
      throw new Error('AUTO_ADVENTURE_INVALID_RESPONSE');
    let effectiveSustain: SustainEffect | null = null;
    if (sustain === null) {
      if (row.effective_sustain !== null) throw new Error('AUTO_ADVENTURE_INVALID_RESPONSE');
    } else {
      const effect = object(row.effective_sustain);
      const effectPct = number(effect.pct);
      if (effect.kind !== sustain.kind || effectPct < 0 || effectPct > sustain.pct)
        throw new Error('AUTO_ADVENTURE_INVALID_RESPONSE');
      effectiveSustain = { kind: sustain.kind, pct: effectPct } as SustainEffect;
    }
    care = { participation, care_as_of: date(row.care_as_of),
      effective_bonus: { stat: bonus.stat as PetBonus['stat'], pct: effectiveBonusPct },
      effective_sustain: effectiveSustain };
  }
  return {
    companion_id: string(row.companion_id), companion_type: string(row.companion_type),
    name: string(row.name), bonus: { stat: bonus.stat as PetBonus['stat'], pct }, sustain, ...care,
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
    healing: optionalNumber(row.healing), mp_restored: optionalPositiveInteger(row.mp_restored),
    raw_damage: optionalNumber(row.raw_damage),
    damage_multiplier: optionalNumber(row.damage_multiplier),
    effect_note: optionalNullableString(row.effect_note),
    actor_slot: row.actor_slot === undefined ? undefined : slot(row.actor_slot),
    target_slot: row.target_slot === undefined ? undefined : slot(row.target_slot),
    target_slots: row.target_slots === undefined ? undefined : Array.isArray(row.target_slots)
      ? row.target_slots.map(value => { const parsed = slot(value); if (parsed === null) throw new Error('AUTO_ADVENTURE_INVALID_RESPONSE'); return parsed; })
      : (() => { throw new Error('AUTO_ADVENTURE_INVALID_RESPONSE'); })(),
    hits: row.hits === undefined ? undefined : Array.isArray(row.hits)
      ? row.hits.map(hordeHit) : (() => { throw new Error('AUTO_ADVENTURE_INVALID_RESPONSE'); })(),
    enemies_hp: row.enemies_hp === undefined ? undefined : Array.isArray(row.enemies_hp) ? row.enemies_hp.map(number) : (() => { throw new Error('AUTO_ADVENTURE_INVALID_RESPONSE'); })(),
    enemies_mp: row.enemies_mp === undefined ? undefined : Array.isArray(row.enemies_mp) ? row.enemies_mp.map(number) : (() => { throw new Error('AUTO_ADVENTURE_INVALID_RESPONSE'); })(),
  };
}

function battle(value: Json): AdventureBattle {
  const row = object(value);
  if (row.kind !== 'normal' && row.kind !== 'boss') throw new Error('AUTO_ADVENTURE_INVALID_RESPONSE');
  if (row.status !== 'fighting' && row.status !== 'won' && row.status !== 'defeated' && row.status !== 'draw') throw new Error('AUTO_ADVENTURE_INVALID_RESPONSE');
  if (!['forest', 'aquatic', 'ruins', 'volcanic', 'desert', 'ice'].includes(String(row.biome))) throw new Error('AUTO_ADVENTURE_INVALID_RESPONSE');
  if (!Array.isArray(row.events)) throw new Error('AUTO_ADVENTURE_INVALID_RESPONSE');
  const enemies = row.engine_version === 'v4_horde'
    ? Array.isArray(row.enemies) ? row.enemies.map(hordeEnemy) : (() => { throw new Error('AUTO_ADVENTURE_INVALID_RESPONSE'); })()
    : undefined;
  if (enemies && (enemies.length !== (row.kind === 'boss' ? 1 : 3) ||
    enemies.some((enemy, index) => enemy.slot !== index) ||
    new Set(enemies.map(enemy => enemy.id)).size !== enemies.length)) throw new Error('AUTO_ADVENTURE_INVALID_RESPONSE');
  if (enemies && (row.kind === 'boss'
    ? row.boss_id === null || enemies[0].boss_id !== row.boss_id
    : row.boss_id !== null || enemies.some(enemy => enemy.boss_id !== null)))
    throw new Error('AUTO_ADVENTURE_INVALID_RESPONSE');
  const events = row.events.map(attack);
  if (enemies && events.some(event => {
    const slots = event.target_slots;
    const hits = event.hits;
    if (slots === undefined && hits === undefined) return false; // Older v4 snapshots remain valid.
    if (!slots || !hits || slots.length !== hits.length ||
        slots.length > enemies.length ||
        new Set(slots).size !== slots.length || slots.some((target, index) =>
          target >= enemies.length || hits[index].target_slot !== target || hits[index].damage > enemies[target].max_hp) ||
        event.actor !== 'hero' ||
        (slots.length > 0 && event.target_slot !== slots[0]) ||
        (slots.length === 0 && (event.damage !== 0 || event.target_slot !== null)) ||
        Math.abs(hits.reduce((sum, hit) => sum + hit.damage, 0) - event.damage) > 1e-6) return true;
    return false;
  })) throw new Error('AUTO_ADVENTURE_INVALID_RESPONSE');
  if (enemies && events.some(event => event.damage < 0 || event.hero_hp < 0 || event.hero_hp > number(row.hero_max_hp) ||
    (event.hero_mp !== undefined && (event.hero_mp < 0 ||
      (row.hero_max_mp !== undefined && event.hero_mp > number(row.hero_max_mp)))) ||
    (event.mp_restored !== undefined && ((row.hero_max_mp !== undefined && event.mp_restored > number(row.hero_max_mp)) ||
      (event.hero_mp !== undefined && event.mp_restored > event.hero_mp))) ||
    event.enemy_hp < 0 || event.enemy_hp > enemies.reduce((sum, enemy) => sum + enemy.max_hp, 0) ||
    Date.parse(event.at) < Date.parse(date(row.started_at)) || Date.parse(event.at) > Date.parse(date(row.ends_at))))
    throw new Error('AUTO_ADVENTURE_INVALID_RESPONSE');
  if (enemies && events.some(event => event.actor_slot === undefined || event.target_slot === undefined ||
    event.enemies_hp?.length !== enemies.length || event.enemies_hp.some((hp, index) => hp < 0 || hp > enemies[index].max_hp) ||
    event.enemies_mp?.length !== enemies.length || event.enemies_mp.some((mp, index) => mp < 0 || mp > enemies[index].max_mp) ||
    (event.actor === 'hero' && event.actor_slot !== null) ||
    (event.actor === 'enemy' && (event.actor_slot === null || event.target_slot !== null)) ||
    (event.actor_slot !== null && event.actor_slot >= enemies.length) ||
    (event.target_slot !== null && event.target_slot >= enemies.length))) throw new Error('AUTO_ADVENTURE_INVALID_RESPONSE');
  return {
    id: string(row.id), stage: number(row.stage), attempt: number(row.attempt),
    kind: row.kind, status: row.status, replay: boolean(row.replay),
    biome: row.biome as AdventureBattle['biome'],
    started_at: date(row.started_at), ends_at: date(row.ends_at),
    hero_power: number(row.hero_power), hero_class: string(row.hero_class), enemy_power: number(row.enemy_power),
    hero_max_hp: number(row.hero_max_hp), enemy_max_hp: number(row.enemy_max_hp),
    hero_hp: number(row.hero_hp), enemy_hp: number(row.enemy_hp),
    enemy_name: string(row.enemy_name), enemy_icon: nullableString(row.enemy_icon),
    boss_id: nullableString(row.boss_id), events, enemies,
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
    reward_day: civilDate(row.reward_day),
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
