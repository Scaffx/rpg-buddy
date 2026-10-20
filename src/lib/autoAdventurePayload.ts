import type { Json } from '@/integrations/supabase/types';

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
};

export type AdventureBattle = {
  id: string;
  stage: number;
  attempt: number;
  kind: 'normal' | 'boss';
  status: 'fighting' | 'won' | 'defeated';
  replay: boolean;
  biome: 'forest' | 'aquatic' | 'ruins' | 'volcanic';
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
  catchup: { battles: number; from_stage: number | null; to_stage: number | null; wins: number; defeats: number; retreats: number; gold: number; items: string[]; defeated: boolean; pending: boolean };
  limits: { interval_minutes: number; reward_interval_minutes: number; offline_hours: number; gold_per_day: number; items_per_day: number };
};

export function nextAdventureRefetchDelay(
  snapshot: AdventureSnapshot | undefined,
  dataUpdatedAt: number,
  now = Date.now(),
): number | false {
  if (!snapshot || !dataUpdatedAt) return false;
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
  };
}

function battle(value: Json): AdventureBattle {
  const row = object(value);
  if (row.kind !== 'normal' && row.kind !== 'boss') throw new Error('AUTO_ADVENTURE_INVALID_RESPONSE');
  if (row.status !== 'fighting' && row.status !== 'won' && row.status !== 'defeated') throw new Error('AUTO_ADVENTURE_INVALID_RESPONSE');
  if (!['forest', 'aquatic', 'ruins', 'volcanic'].includes(String(row.biome))) throw new Error('AUTO_ADVENTURE_INVALID_RESPONSE');
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
  };
}

function encounter(value: Json, historical: false): AdventureEncounter;
function encounter(value: Json, historical: true): Omit<AdventureEncounter, 'attempt' | 'fought_at'>;
function encounter(value: Json, historical: boolean) {
  const row = object(value);
  const kind = row.kind;
  if (kind !== 'normal' && kind !== 'boss') throw new Error('AUTO_ADVENTURE_INVALID_RESPONSE');
  if (typeof row.won !== 'boolean') throw new Error('AUTO_ADVENTURE_INVALID_RESPONSE');
  const base = {
    stage: number(row.stage), kind, won: row.won,
    hero_power: number(row.hero_power), enemy_power: number(row.enemy_power),
    gold: number(row.gold), item_id: nullableString(row.item_id),
    boss_id: nullableString(row.boss_id), boss_name: nullableString(row.boss_name),
    boss_icon: nullableString(row.boss_icon),
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
      items: catchup.items.map(string), defeated: boolean(catchup.defeated), pending: boolean(catchup.pending),
    },
    limits: {
      interval_minutes: number(limits.interval_minutes), offline_hours: number(limits.offline_hours),
      reward_interval_minutes: number(limits.reward_interval_minutes),
      gold_per_day: number(limits.gold_per_day), items_per_day: number(limits.items_per_day),
    },
  };
}
