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

export type AdventureSnapshot = {
  stage: number;
  next_at: string;
  server_now: string;
  last_result: Omit<AdventureEncounter, 'attempt' | 'fought_at'> | null;
  encounters: AdventureEncounter[];
  boss: { stage: number; id: string; name: string; icon: string | null };
  boss_wins_credited: number;
  gold_today: number;
  loot_today: number;
  limits: { interval_minutes: number; offline_hours: number; gold_per_day: number; items_per_day: number };
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
  if (!Array.isArray(row.encounters)) throw new Error('AUTO_ADVENTURE_INVALID_RESPONSE');
  const boss = object(row.boss);
  const limits = object(row.limits);
  return {
    stage: number(row.stage), next_at: date(row.next_at), server_now: date(row.server_now),
    last_result: row.last_result === null ? null : encounter(row.last_result, true),
    encounters: row.encounters.map(entry => encounter(entry, false)),
    boss: { stage: number(boss.stage), id: string(boss.id), name: string(boss.name), icon: nullableString(boss.icon) },
    boss_wins_credited: number(row.boss_wins_credited),
    gold_today: number(row.gold_today), loot_today: number(row.loot_today),
    limits: {
      interval_minutes: number(limits.interval_minutes), offline_hours: number(limits.offline_hours),
      gold_per_day: number(limits.gold_per_day), items_per_day: number(limits.items_per_day),
    },
  };
}
