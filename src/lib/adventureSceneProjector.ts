import type { AdventureAttack, AdventureBattle } from '@/lib/autoAdventurePayload';
import type { HordeEnemy } from '@/lib/adventureHordeContract';
import type { AdventureSceneAction, AdventureSceneFrame } from '@/components/adventure/AdventureScene';

type ProjectedAction = AdventureSceneAction & {
  actorSlot?: number | null;
  targetSlot?: number | null;
  elapsedMs: number;
};

export type ProjectedAdventureFrame = AdventureSceneFrame & {
  enemies?: HordeEnemy[];
  actions?: ProjectedAction[];
};

type TimedEvent = { event: AdventureAttack; index: number; time: number };

function visualEffect(raw: string): AdventureSceneAction['effect'] {
  const effects = ['physical', 'arcane', 'fire', 'ice', 'lightning', 'nature', 'light'] as const;
  return effects.find(effect => effect === raw) ?? 'physical';
}

function toAction(battleId: string, { event, index, time }: TimedEvent, serverTime: number): ProjectedAction {
  return {
    id: `${battleId}-${index}`, actor: event.actor, kind: event.kind,
    actorSlot: event.actor_slot, targetSlot: event.target_slot,
    targetSlots: event.target_slots, hits: event.hits,
    skillName: event.kind === 'skill' ? event.skill_name : null,
    skillId: event.kind === 'skill' ? event.skill_id : null,
    damage: event.damage, effect: visualEffect(event.effect),
    mpCost: event.mp_cost, healing: event.healing, mpRestored: event.mp_restored,
    rawDamage: event.raw_damage, damageMultiplier: event.damage_multiplier,
    effectNote: event.effect_note, skillType: event.skill_type,
    elapsedMs: serverTime - time,
  };
}

/** Projects only confirmed events; terminal HP/MP snapshots may describe future actions. */
export function projectAdventureSceneFrame(
  battle: AdventureBattle | null,
  serverTime: number,
  status: AdventureSceneFrame['status'],
): ProjectedAdventureFrame {
  if (!battle) return { status, heroHp: null, enemyHp: null, heroMp: null, enemyMp: null, action: null, animateAction: false };

  const confirmed = battle.events.map((event, index) => ({ event, index, time: Date.parse(event.at) }))
    .filter(item => Number.isFinite(item.time) && item.time <= serverTime)
    .sort((a, b) => a.time - b.time || a.index - b.index);
  const last = confirmed.at(-1);
  const lastEvent = last?.event;
  const action = last ? toAction(battle.id, last, serverTime) : null;
  const active = confirmed.filter(item => serverTime - item.time >= 0 && serverTime - item.time < 1350);
  const horde = battle.engine_version === 'v4_horde' && battle.enemies?.length ? battle.enemies : undefined;
  const enemies = horde?.map(enemy => ({ ...enemy,
    hp: lastEvent?.enemies_hp?.[enemy.slot] ?? enemy.max_hp,
    mp: lastEvent?.enemies_mp?.[enemy.slot] ?? enemy.max_mp,
  }));
  const heroMp = battle.hero_max_mp == null ? null
    : [...confirmed].reverse().find(({ event }) => typeof event.hero_mp === 'number')?.event.hero_mp ?? battle.hero_max_mp;
  const enemyMp = enemies ? enemies[0].mp : [...confirmed].reverse().find(({ event }) => typeof event.enemy_mp === 'number')?.event.enemy_mp
    ?? (battle.events.length === 0 ? battle.enemy_mp : null);
  return {
    status, heroHp: lastEvent?.hero_hp ?? battle.hero_max_hp, heroMaxHp: battle.hero_max_hp,
    heroMp, heroMaxMp: battle.hero_max_mp,
    enemyHp: enemies ? enemies[0].hp : lastEvent?.enemy_hp ?? battle.enemy_max_hp,
    enemyMaxHp: enemies ? enemies[0].max_hp : battle.enemy_max_hp,
    enemyMp, enemyMaxMp: enemies ? enemies[0].max_mp : battle.enemy_max_mp,
    enemies, pet: battle.pet, action, animateAction: Boolean(action && action.elapsedMs < 1350),
    actionElapsedMs: action?.elapsedMs,
    actions: enemies ? active.map(item => toAction(battle.id, item, serverTime)) : undefined,
  };
}
