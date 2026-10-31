import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Json } from '@/integrations/supabase/types';
import { parseAdventureSnapshot } from '@/lib/autoAdventurePayload';
import { projectAdventureSceneFrame } from '@/lib/adventureSceneProjector';

function loadBattle(name: 'horde' | 'boss') {
  const battle = JSON.parse(readFileSync(resolve(process.cwd(), 'docs', 'qa', 'hordes', `${name}.json`), 'utf8')) as Record<string, Json>;
  const envelope: Json = {
    stage: battle.stage, mode: 'progressing', advance_pending: false,
    next_at: battle.ends_at, server_now: battle.started_at,
    last_result: null, encounters: [], boss: { stage: 10, id: 'boss', name: 'Chefe', icon: null },
    boss_wins_credited: 0, gold_today: 0, loot_today: 0, reward_day: '2026-10-28',
    battle, last_battle: null,
    catchup: { battles: 0, from_stage: null, to_stage: null, wins: 0, defeats: 0, retreats: 0,
      gold: 0, items: [], defeated: false, pending: false },
    limits: { interval_minutes: 0.25, reward_interval_minutes: 30, offline_hours: 24, gold_per_day: 120, items_per_day: 2 },
  };
  return parseAdventureSnapshot(envelope).battle!;
}

describe('fixtures da função PG17 de hordas', () => {
  it('aceita os três inimigos e projeta os IDs e recursos apenas após eventos reais', () => {
    const battle = loadBattle('horde');
    expect(battle.engine_version).toBe('v4_horde');
    expect(battle.enemies).toHaveLength(3);
    const initial = projectAdventureSceneFrame(battle, Date.parse(battle.started_at), 'fighting');
    expect(initial.enemies?.map(enemy => enemy.hp)).toEqual(battle.enemies?.map(enemy => enemy.max_hp));
    expect(initial.enemies?.every(enemy => enemy.hp > 0)).toBe(true);
    expect(initial.actions).toEqual([]);

    const skillIndex = battle.events.findIndex(event => event.actor === 'hero' && event.kind === 'skill' && event.target_slot != null);
    expect(skillIndex).toBeGreaterThan(0);
    const skill = battle.events[skillIndex];
    const projected = projectAdventureSceneFrame(battle, Date.parse(skill.at), 'fighting');
    expect(projected.enemies?.map(enemy => enemy.hp)).toEqual(skill.enemies_hp);
    expect(projected.enemies?.map(enemy => enemy.mp)).toEqual(skill.enemies_mp);
    expect(projected.heroMp).toBe(skill.hero_mp);
    expect(projected.actions?.find(action => action.id === `${battle.id}-${skillIndex}`)?.targetSlot).toBe(skill.target_slot);
    expect(projected.enemies?.[skill.target_slot!].id).toBe(battle.enemies?.[skill.target_slot!].id);
    expect(projected.actions?.some(action => action.mpCost === skill.mp_cost && action.skillId === skill.skill_id)).toBe(true);
  });

  it('aceita o chefe singular v4 e preserva seu HP confirmado no projetor', () => {
    const battle = loadBattle('boss');
    expect(battle.stage).toBe(10);
    expect(battle.kind).toBe('boss');
    expect(battle.enemies).toHaveLength(1);
    const first = battle.events[0];
    const frame = projectAdventureSceneFrame(battle, Date.parse(first.at), 'fighting');
    expect(frame.enemies?.[0].boss_id).toBe(battle.boss_id);
    expect(frame.enemyHp).toBe(first.enemies_hp?.[0]);
    expect(frame.action?.actorSlot).toBe(0);
  });
});
