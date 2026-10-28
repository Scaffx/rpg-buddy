import { describe, expect, it } from 'vitest';
import type { Json } from '@/integrations/supabase/types';
import { parseAdventureSnapshot } from '@/lib/autoAdventurePayload';
import { projectAdventureSceneFrame } from '@/lib/adventureSceneProjector';

const at = (seconds: number) => new Date(Date.parse('2026-10-28T12:00:00Z') + seconds * 1000).toISOString();
const enemies = [
  { slot: 0, id: 'wolf', name: 'Lobo', icon: null, boss_id: null, max_hp: 100, hp: 100, max_mp: 20, mp: 16, resistances: {} },
  { slot: 1, id: 'boar', name: 'Javali', icon: null, boss_id: null, max_hp: 90, hp: 0, max_mp: 10, mp: 10, resistances: {} },
  { slot: 2, id: 'mage', name: 'Mago', icon: null, boss_id: null, max_hp: 75, hp: 75, max_mp: 30, mp: 15, resistances: {} },
];
const event = (seconds: number, actor: 'hero' | 'enemy', actorSlot: number | null, targetSlot: number | null,
  enemiesHp: number[], heroHp: number, enemyMp: number) => ({
  at: at(seconds), actor, actor_slot: actorSlot, target_slot: targetSlot,
  kind: 'attack', damage: 10, hero_hp: heroHp, hero_mp: 30, enemy_hp: enemiesHp[targetSlot ?? actorSlot ?? 0],
  enemy_mp: enemyMp, enemies_hp: enemiesHp,
  enemies_mp: seconds >= 1.3 ? [16, 10, 15] : seconds >= 1.2 ? [20, 10, 15] : [20, 10, 30],
  skill_id: null, skill_name: null, effect: 'physical',
});
const events = [
  event(1, 'hero', null, 1, [100, 80, 75], 100, 10),
  event(1.2, 'enemy', 2, null, [100, 80, 75], 90, 15),
  event(1.3, 'enemy', 0, null, [100, 80, 75], 80, 16),
  event(10, 'hero', null, 1, [100, 0, 75], 80, 10),
];
const battle = {
  id: 'battle-horde', stage: 2, attempt: 0, kind: 'normal', status: 'fighting', replay: false,
  biome: 'forest', started_at: at(0), ends_at: at(20), engine_version: 'v4_horde',
  hero_power: 50, hero_class: 'mago', enemy_power: 20,
  hero_max_hp: 100, hero_hp: 80, hero_max_mp: 40, hero_mp: 30,
  enemy_max_hp: 100, enemy_hp: 0, enemy_max_mp: 20, enemy_mp: 16,
  enemy_name: 'Lobo', enemy_icon: null, boss_id: null, enemies, events,
};
const payload = {
  stage: 2, mode: 'progressing', advance_pending: false, next_at: at(20), server_now: at(0),
  last_result: null, encounters: [], boss: { stage: 10, id: 'boss', name: 'Chefe', icon: null },
  boss_wins_credited: 0, gold_today: 0, loot_today: 0, reward_day: '2026-10-28',
  battle, last_battle: null,
  catchup: { battles: 0, from_stage: null, to_stage: null, wins: 0, defeats: 0, retreats: 0, gold: 0, items: [], defeated: false, pending: false },
  limits: { interval_minutes: 0.25, reward_interval_minutes: 30, offline_hours: 24, gold_per_day: 120, items_per_day: 2 },
};

const parse = (value: object = payload) => parseAdventureSnapshot(value as Json).battle!;

describe('projeção da timeline da horda', () => {
  it('mostra três HPs reais e IDs de alvo sem adiantar morte, recompensa ou MP final', () => {
    const parsed = parse();
    const initial = projectAdventureSceneFrame(parsed, Date.parse(at(0)), 'fighting');
    expect(initial.enemies?.map(enemy => [enemy.id, enemy.hp, enemy.mp])).toEqual([
      ['wolf', 100, 20], ['boar', 90, 10], ['mage', 75, 30],
    ]);
    expect(initial.heroHp).toBe(100);
    expect(initial.actions).toEqual([]);

    const concurrent = projectAdventureSceneFrame(parsed, Date.parse(at(1.5)), 'fighting');
    expect(concurrent.enemies?.map(enemy => enemy.hp)).toEqual([100, 80, 75]);
    expect(concurrent.enemies?.map(enemy => enemy.mp)).toEqual([16, 10, 15]);
    expect(concurrent.actions?.map(action => [action.actor, action.actorSlot, action.targetSlot])).toEqual([
      ['hero', null, 1], ['enemy', 2, null], ['enemy', 0, null],
    ]);
    expect(concurrent.enemies?.[concurrent.actions?.[0].targetSlot ?? -1].id).toBe('boar');
    expect(concurrent.actions?.map(action => action.id)).toEqual(['battle-horde-0', 'battle-horde-1', 'battle-horde-2']);

    const stale = projectAdventureSceneFrame(parsed, Date.parse(at(5)), 'fighting');
    expect(stale.actions).toEqual([]);
    expect(stale.action?.id).toBe('battle-horde-2');
    expect(stale.enemies?.[1].hp).toBe(80);
    expect(stale.animateAction).toBe(false);

    const dead = projectAdventureSceneFrame(parsed, Date.parse(at(10)), 'fighting');
    expect(dead.enemies?.[1].hp).toBe(0);
    expect(dead.enemies?.[0].hp).toBe(100);
  });

  it('ordena evento atrasado sem retroceder o HP e rejeita vetor/slot malformado', () => {
    const late = { ...battle, events: [...events, event(0.5, 'hero', null, 0, [90, 90, 75], 100, 20)] };
    const projected = projectAdventureSceneFrame(parse({ ...payload, battle: late }), Date.parse(at(5)), 'fighting');
    expect(projected.enemies?.map(enemy => enemy.hp)).toEqual([100, 80, 75]);
    expect(projected.action?.id).toBe('battle-horde-2');
    expect(() => parse({ ...payload, battle: { ...battle, events: [{ ...events[0], enemies_hp: [100, 80] }] } })).toThrow('AUTO_ADVENTURE_INVALID_RESPONSE');
    expect(() => parse({ ...payload, battle: { ...battle, events: [{ ...events[0], enemies_mp: [20, 10] }] } })).toThrow('AUTO_ADVENTURE_INVALID_RESPONSE');
    expect(() => parse({ ...payload, battle: { ...battle, events: [{ ...events[0], target_slot: 9 }] } })).toThrow('AUTO_ADVENTURE_INVALID_RESPONSE');
    expect(() => parse({ ...payload, battle: { ...battle, events: [{ ...events[0], actor: 'enemy', actor_slot: null }] } })).toThrow('AUTO_ADVENTURE_INVALID_RESPONSE');
    expect(() => parse({ ...payload, battle: { ...battle, enemies: [enemies[0], { ...enemies[1], id: 'wolf' }, enemies[2]] } })).toThrow('AUTO_ADVENTURE_INVALID_RESPONSE');
  });

  it('mantém batalha antiga 1v1 sem fabricar horda', () => {
    const old = parse({ ...payload, battle: { ...battle, engine_version: 'v3', enemies: undefined,
      events: [{ ...events[0], actor_slot: undefined, target_slot: undefined, enemies_hp: undefined, enemies_mp: undefined }] } });
    const projected = projectAdventureSceneFrame(old, Date.parse(at(1.5)), 'fighting');
    expect(projected.enemies).toBeUndefined();
    expect(projected.actions).toBeUndefined();
    expect(projected.enemyHp).toBe(80);
  });
});
