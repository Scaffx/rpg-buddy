import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { Json } from '@/integrations/supabase/types';
import { parseAdventureSnapshot } from '@/lib/autoAdventurePayload';
import { adventureServerTime, anchorAdventureClock, hasAdventureClockAnchor } from '@/lib/adventureClock';
import { projectAdventureSceneFrame } from '@/lib/adventureSceneProjector';

const source = (name: 'horde' | 'boss') => JSON.parse(readFileSync(
  resolve(process.cwd(), 'docs', 'qa', 'hordes', `${name}.json`), 'utf8')) as Record<string, Json>;

function envelope(battle: Record<string, Json>): Json {
  const result = {
    stage: battle.stage, attempt: 0, fought_at: battle.ends_at,
    kind: battle.kind, won: false, hero_power: battle.hero_power, enemy_power: battle.enemy_power,
    gold: 0, item_id: null, boss_id: battle.boss_id, boss_name: null, boss_icon: null,
    status: 'draw', end_reason: 'event_limit',
  };
  return {
    stage: battle.stage, mode: 'progressing', advance_pending: false,
    next_at: battle.ends_at, server_now: battle.started_at,
    last_result: result, encounters: [result], boss: { stage: 10, id: 'boss', name: 'Chefe', icon: null },
    boss_wins_credited: 0, gold_today: 0, loot_today: 0, reward_day: '2026-10-28',
    battle, last_battle: battle,
    catchup: { battles: 0, from_stage: null, to_stage: null, wins: 0, defeats: 0,
      retreats: 0, gold: 0, items: [], defeated: false, pending: false },
    limits: { interval_minutes: 0.25, reward_interval_minutes: 30, offline_hours: 24,
      gold_per_day: 120, items_per_day: 2 },
  };
}

const invalid = (value: Json) => expect(() => parseAdventureSnapshot(value)).toThrow('AUTO_ADVENTURE_INVALID_RESPONSE');

describe('correções do contrato v4', () => {
  it('aceita event_limit em battle, last_battle, last_result e encounters; preserva turn_limit v3', () => {
    const battle = { ...source('horde'), status: 'draw', end_reason: 'event_limit' };
    const parsed = parseAdventureSnapshot(envelope(battle));
    expect([parsed.battle?.end_reason, parsed.last_battle?.end_reason,
      parsed.last_result?.end_reason, parsed.encounters[0].end_reason]).toEqual(Array(4).fill('event_limit'));
    const legacy = { ...battle, engine_version: 'v3', enemies: undefined, events: [], end_reason: 'turn_limit' };
    expect(parseAdventureSnapshot(envelope(legacy)).battle?.end_reason).toBe('turn_limit');
    invalid(envelope({ ...battle, end_reason: 'invented' }));
  });

  it('rejeita cardinalidade e identidade de chefe inválidas, sem impor topologia ao v3', () => {
    const normal = source('horde');
    const boss = source('boss');
    const enemies = normal.enemies as Record<string, Json>[];
    expect(parseAdventureSnapshot(envelope(normal)).battle?.enemies).toHaveLength(3);
    expect(parseAdventureSnapshot(envelope(boss)).battle?.enemies).toHaveLength(1);
    for (const count of [1, 2]) invalid(envelope({ ...normal, enemies: enemies.slice(0, count), events: [] }));
    invalid(envelope({ ...boss, enemies, events: [] }));
    invalid(envelope({ ...boss, boss_id: null }));
    invalid(envelope({ ...boss, enemies: [{ ...(boss.enemies as Record<string, Json>[])[0], boss_id: 'other' }] }));
    invalid(envelope({ ...normal, enemies: [{ ...enemies[0], boss_id: 'other' }, ...enemies.slice(1)] }));
    expect(parseAdventureSnapshot(envelope({ ...normal, engine_version: 'v3', enemies: undefined, events: [] })).battle?.enemies).toBeUndefined();
  });

  it('rejeita timestamps sem fuso, datas impossíveis e reward_day inválido; conserva microssegundos PostgreSQL', () => {
    const battle = source('horde');
    const parsed = parseAdventureSnapshot(envelope(battle));
    expect(parsed.battle?.events[0].at).toMatch(/\.\d{6}-03:00$/);
    expect(parsed.battle?.events[0].at).toBe((battle.events as Record<string, Json>[])[0].at);
    expect(parseAdventureSnapshot({ ...envelope(battle) as object,
      server_now: '2026-10-28T12:00:00.123456+00:00' }).server_now).toBe('2026-10-28T12:00:00.123456+00:00');
    invalid({ ...envelope(battle) as object, server_now: '2026-10-28T12:00:00' });
    invalid({ ...envelope(battle) as object, server_now: '2026-02-30T12:00:00Z' });
    invalid({ ...envelope(battle) as object, reward_day: '2026-02-30' });
    invalid({ ...envelope(battle) as object, battle: { ...battle,
      events: [{ ...(battle.events as Record<string, Json>[])[0], at: '2026-10-28T12:00:00' }] } });
    expect(parseAdventureSnapshot({ ...envelope(battle) as object, reward_day: '2024-02-29' }).reward_day).toBe('2024-02-29');
  });

  it('conserva âncora monotônica no mesmo snapshot e não inventa tempo para cache reidratado', () => {
    const clock = vi.spyOn(performance, 'now').mockReturnValue(100);
    const wall = vi.spyOn(Date, 'now').mockReturnValue(1_000);
    try {
      const parsed = anchorAdventureClock(parseAdventureSnapshot(envelope(source('horde'))));
      const confirmed = Date.parse(parsed.server_now);
      const future = parsed.battle!.events.find(event => Date.parse(event.at) > confirmed)!;
      expect(hasAdventureClockAnchor(parsed)).toBe(true);
      expect(projectAdventureSceneFrame(parsed.battle, adventureServerTime(parsed), 'fighting').actions).toEqual([]);
      wall.mockReturnValue(31_000);
      expect(adventureServerTime(parsed)).toBe(confirmed);
      expect(projectAdventureSceneFrame(parsed.battle, adventureServerTime(parsed), 'fighting').action).toBeNull();
      clock.mockReturnValue(100 + Date.parse(future.at) - confirmed);
      expect(adventureServerTime(parsed)).toBe(Date.parse(future.at));
      expect(projectAdventureSceneFrame(parsed.battle, adventureServerTime(parsed), 'fighting').action).not.toBeNull();
      const rehydrated = parseAdventureSnapshot(envelope(source('horde')));
      expect(hasAdventureClockAnchor(rehydrated)).toBe(false);
      expect(adventureServerTime(rehydrated)).toBe(confirmed);
    } finally { vi.restoreAllMocks(); }
  });
});
