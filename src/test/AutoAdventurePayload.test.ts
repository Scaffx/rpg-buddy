import { describe, expect, it } from 'vitest';
import { nextAdventureRefetchDelay, parseAdventureSnapshot } from '@/lib/autoAdventurePayload';
import type { Json } from '@/integrations/supabase/types';

const encounter = {
  stage: 10, attempt: 0, fought_at: '2026-10-19T18:30:00Z', kind: 'boss', won: true,
  hero_power: 400, enemy_power: 45, gold: 12, item_id: null,
  boss_id: '00000000-0000-0000-0000-000000000001', boss_name: 'Goblin', boss_icon: '👺',
};

const snapshot: Json = {
  stage: 11, mode: 'progressing', advance_pending: false,
  next_at: '2026-10-19T19:00:00Z', server_now: '2026-10-19T18:30:00Z',
  last_result: { ...encounter }, encounters: [encounter],
  boss: { stage: 20, id: '00000000-0000-0000-0000-000000000002', name: 'Lobo', icon: '🐺' },
  boss_wins_credited: 1, gold_today: 12, loot_today: 0,
  reward_day: '2026-10-19',
  catchup: { battles: 1, from_stage: 10, to_stage: 10, wins: 1, defeats: 0, retreats: 0, gold: 12, items: [], defeated: false, pending: false },
  battle: {
    id: '11111111-1111-1111-1111-111111111111', stage: 10, attempt: 0, kind: 'boss',
    status: 'won', replay: false, biome: 'forest', started_at: '2026-10-19T18:29:45Z', ends_at: '2026-10-19T18:30:00Z',
    hero_power: 400, hero_class: 'guerreiro', enemy_power: 45, hero_max_hp: 100, enemy_max_hp: 150,
    hero_hp: 40, enemy_hp: 0, enemy_name: 'Goblin', enemy_icon: '👺',
    boss_id: '00000000-0000-0000-0000-000000000001',
    events: [{ at: '2026-10-19T18:30:00Z', actor: 'hero', kind: 'skill', damage: 30,
      hero_hp: 40, enemy_hp: 0, skill_id: 'learned', skill_name: 'Golpe', effect: 'fire' }],
  },
  last_battle: null,
  limits: { interval_minutes: 0.25, reward_interval_minutes: 30, offline_hours: 24, gold_per_day: 120, items_per_day: 2 },
};

describe('auto adventure RPC contract', () => {
  it('accepts optional enemy mana without inventing it for the current engine', () => {
    const base = (snapshot as Record<string, Json>).battle as Record<string, Json>;
    const event = (base.events as Json[])[0] as Record<string, Json>;
    expect(parseAdventureSnapshot(snapshot).battle?.enemy_max_mp).toBeUndefined();
    const battle = parseAdventureSnapshot({ ...snapshot, battle: { ...base,
      enemy_max_mp: 50, enemy_mp: 12, events: [{ ...event, enemy_mp: 12 }],
    } }).battle;
    expect(battle?.enemy_max_mp).toBe(50);
    expect(battle?.events[0].enemy_mp).toBe(12);
    expect(parseAdventureSnapshot({ ...snapshot, battle: { ...base, enemy_max_mp: null, enemy_mp: null } }).battle?.enemy_max_mp).toBeUndefined();
    expect(() => parseAdventureSnapshot({ ...snapshot, battle: { ...base, enemy_max_mp: -1 } })).toThrow('AUTO_ADVENTURE_INVALID_RESPONSE');
    expect(() => parseAdventureSnapshot({ ...snapshot, battle: { ...base, events: [{ ...event, enemy_mp: '12' }] } })).toThrow('AUTO_ADVENTURE_INVALID_RESPONSE');
  });
  it('accepts the five realm names and historical ruins without changing battle identity', () => {
    const base = (snapshot as Record<string, Json>).battle as Record<string, Json>;
    for (const biome of ['forest', 'desert', 'aquatic', 'ice', 'volcanic', 'ruins']) {
      const battle = parseAdventureSnapshot({ ...snapshot, battle: { ...base, biome } }).battle;
      expect(battle?.biome).toBe(biome);
      expect(battle?.id).toBe(base.id);
    }
    expect(() => parseAdventureSnapshot({ ...snapshot, battle: { ...base, biome: 'invented' } })).toThrow('AUTO_ADVENTURE_INVALID_RESPONSE');
  });
  it('accepts the boss identity and server clock from the composed RPC', () => {
    const parsed = parseAdventureSnapshot(snapshot);
    expect(parsed.encounters[0].boss_id).toBe(encounter.boss_id);
    expect(parsed.boss.name).toBe('Lobo');
    expect(parsed.boss_wins_credited).toBe(1);
    expect(parsed.server_now).toBe('2026-10-19T18:30:00Z');
    expect(parsed.battle?.events[0].skill_id).toBe('learned');
    expect(parsed.battle?.events[0].effect).toBe('fire');
    expect(parsed.catchup.gold).toBe(12);
  });

  it('rejects missing nested reward limits, malformed encounters and clock', () => {
    expect(() => parseAdventureSnapshot({ ...snapshot, limits: { interval_minutes: 30 } })).toThrow('AUTO_ADVENTURE_INVALID_RESPONSE');
    expect(() => parseAdventureSnapshot({ ...snapshot, encounters: [{ ...encounter, gold: '12' }] })).toThrow('AUTO_ADVENTURE_INVALID_RESPONSE');
    expect(() => parseAdventureSnapshot({ ...snapshot, server_now: 'not-a-date' })).toThrow('AUTO_ADVENTURE_INVALID_RESPONSE');
    expect(() => parseAdventureSnapshot({ ...snapshot, battle: { ...(snapshot as Record<string, Json>).battle as object, status: 'invented' } })).toThrow('AUTO_ADVENTURE_INVALID_RESPONSE');
  });

  it('preserves the defeated battle timeline when a new stage is already fighting', () => {
    const prior = { ...(snapshot as Record<string, Json>).battle as object, status: 'defeated' };
    const parsed = parseAdventureSnapshot({ ...snapshot, last_battle: prior });
    expect(parsed.last_battle?.status).toBe('defeated');
    expect(parsed.last_battle?.events[0].at).toBe('2026-10-19T18:30:00Z');
  });

  it('accepts v3 stats, mana and real skill effects without requiring them on legacy battles', () => {
    const legacy = parseAdventureSnapshot(snapshot).battle;
    expect(legacy?.hero_mp).toBeUndefined();
    const base = (snapshot as Record<string, Json>).battle as Record<string, Json>;
    const event = (base.events as Json[])[0] as Record<string, Json>;
    const v3Battle = {
      ...base, hero_max_mp: 80, hero_mp: 72, hero_attack: 41, hero_defense: 25,
      engine_version: 'v3', enemy_resistances: { fire: 0.5 },
      events: [{ ...event, hero_mp: 72, mp_cost: 8, skill_type: 'heal', healing: 18,
        raw_damage: 0, damage_multiplier: 1, effect_note: 'heal' }],
    };
    const parsed = parseAdventureSnapshot({ ...snapshot, battle: v3Battle });
    expect(parsed.battle?.hero_max_mp).toBe(80);
    expect(parsed.battle?.enemy_resistances?.fire).toBe(0.5);
    expect(parsed.battle?.events[0].mp_cost).toBe(8);
    expect(parsed.battle?.events[0].healing).toBe(18);
    expect(() => parseAdventureSnapshot({ ...snapshot, battle: {
      ...v3Battle, events: [{ ...event, skill_type: 'invented' }],
    } })).toThrow('AUTO_ADVENTURE_INVALID_RESPONSE');
  });

  it('keeps a turn-limit draw distinct from a death and accepts legacy results', () => {
    const base = (snapshot as Record<string, Json>).battle as Record<string, Json>;
    const parsed = parseAdventureSnapshot({ ...snapshot,
      last_result: { ...encounter, won: false, status: 'draw', end_reason: 'turn_limit' },
      last_battle: { ...base, status: 'draw', end_reason: 'turn_limit', hero_hp: 25, enemy_hp: 40 },
      catchup: { ...(snapshot as Record<string, Json>).catchup as object, draws: 1, defeated: false },
    });
    expect(parsed.last_battle?.status).toBe('draw');
    expect(parsed.last_battle?.end_reason).toBe('turn_limit');
    expect(parsed.last_result?.status).toBe('draw');
    expect(parsed.catchup.draws).toBe(1);
    expect(parsed.catchup.defeated).toBe(false);
  });

  it('keeps legacy pet absent/null and validates the protected pet snapshot', () => {
    const base = (snapshot as Record<string, Json>).battle as Record<string, Json>;
    expect(parseAdventureSnapshot(snapshot).battle?.pet).toBeUndefined();
    expect(parseAdventureSnapshot({ ...snapshot, battle: { ...base, pet: null } }).battle?.pet).toBeNull();
    const pet = {
      companion_id: '22222222-2222-2222-2222-222222222222', companion_type: 'mini_kraken', name: 'Krakenzinho',
      bonus: { stat: 'hp', pct: 0.1 }, sustain: { kind: 'regen_hp', pct: 0.05 },
      base_stats: { atk: 20, def: 10, hp: 100, mp: 30 },
      effective_stats: { atk: 20, def: 10, hp: 110, mp: 30 },
    };
    const parsed = parseAdventureSnapshot({ ...snapshot, battle: { ...base, pet } });
    expect(parsed.battle?.pet).toEqual(pet);
    expect(() => parseAdventureSnapshot({ ...snapshot, battle: { ...base, pet: { ...pet, bonus: { stat: 'gold', pct: 0.1 } } } })).toThrow('AUTO_ADVENTURE_INVALID_RESPONSE');
    expect(() => parseAdventureSnapshot({ ...snapshot, battle: { ...base, pet: { ...pet, effective_stats: { hp: '110' } } } })).toThrow('AUTO_ADVENTURE_INVALID_RESPONSE');
  });

  it('schedules from server time, including time elapsed while the panel stays open', () => {
    const parsed = parseAdventureSnapshot(snapshot);
    const updatedAt = Date.parse('2026-10-19T18:30:05Z');
    expect(nextAdventureRefetchDelay(parsed, updatedAt, updatedAt)).toBe(1_801_000);
    expect(nextAdventureRefetchDelay(parsed, updatedAt, updatedAt + 15 * 60_000)).toBe(901_000);
    expect(nextAdventureRefetchDelay(parsed, updatedAt, updatedAt + 31 * 60_000)).toBe(1_000);
    expect(nextAdventureRefetchDelay(undefined, 0, updatedAt)).toBe(false);
    expect(nextAdventureRefetchDelay({ ...parsed, catchup: { ...parsed.catchup, pending: true } }, updatedAt, updatedAt)).toBe(250);
  });
});
