import type { AdventureBiome } from '@/lib/adventureVisuals';
import type { EnemyAnimationDefinition, EnemyAnimationGroup } from './types';
import { bossesEarlyEnemies, bossesEarlyAnimations } from './bossesEarly.data';
import { BossesEarlyEffect } from './BossesEarlyEffects';
import { BossesEarlySprite } from './BossesEarlySprites';
import { bossesMiddleEnemies, bossesMiddleAnimations } from './bossesMiddle.data';
import { BossesMiddleEffect } from './BossesMiddleEffects';
import { BossesMiddleSprite } from './BossesMiddleSprites';
import { bossesLateEnemies, bossesLateAnimations } from './bossesLate.data';
import { BossesLateEffect } from './BossesLateEffects';
import { BossesLateSprite } from './BossesLateSprites';
import { creaturesEnemies, creaturesAnimations } from './creatures.data';
import { CreaturesEffect } from './CreaturesEffects';
import { CreaturesSprite } from './CreaturesSprites';

export const ENEMY_ANIMATION_GROUPS: Record<string, EnemyAnimationGroup> = {
  early: { label: 'Primeiros desafios', enemies: bossesEarlyEnemies, animations: bossesEarlyAnimations, Effect: BossesEarlyEffect, Sprite: BossesEarlySprite },
  middle: { label: 'Guardiões e monstros', enemies: bossesMiddleEnemies, animations: bossesMiddleAnimations, Effect: BossesMiddleEffect, Sprite: BossesMiddleSprite },
  late: { label: 'Lendas e eventos', enemies: bossesLateEnemies, animations: bossesLateAnimations, Effect: BossesLateEffect, Sprite: BossesLateSprite },
  creatures: { label: 'Pequenas criaturas', enemies: creaturesEnemies, animations: creaturesAnimations, Effect: CreaturesEffect, Sprite: CreaturesSprite },
};

export const ENEMY_PRESENTATIONS = Object.values(ENEMY_ANIMATION_GROUPS).flatMap(group => group.enemies);
export const ENEMY_ANIMATIONS = Object.values(ENEMY_ANIMATION_GROUPS).flatMap(group => group.animations);
const enemyGroups = new Map(Object.values(ENEMY_ANIMATION_GROUPS).flatMap(group => group.enemies.map(enemy => [enemy.key, group] as const)));

/** Exact server identity first. Stage, name fragments and biome alone never select a boss. */
export function resolveEnemyPresentation(input: { bossId?: string | null; isBoss: boolean; enemyName: string; biome: AdventureBiome }) {
  if (input.isBoss) return input.bossId ? ENEMY_PRESENTATIONS.find(enemy => enemy.kind === 'boss' && enemy.bossId === input.bossId) ?? null : null;
  return ENEMY_PRESENTATIONS.find(enemy => enemy.kind === 'creature' && enemy.biome === input.biome && enemy.name === input.enemyName) ?? null;
}

export function findEnemyGroup(enemyKey: string | null | undefined) {
  return enemyKey ? enemyGroups.get(enemyKey) ?? null : null;
}

/** A basic event can never select a named special or a different enemy's effect. */
export function findEnemyAnimation(enemyKey: string | null | undefined, action: { kind: 'attack' | 'skill'; skillId?: string | null; skillName?: string | null }) {
  const group = findEnemyGroup(enemyKey);
  if (!group) return null;
  const matches = group.animations.filter(definition => definition.enemyKey === enemyKey && definition.kind === action.kind);
  let definition: EnemyAnimationDefinition | undefined;
  if (action.kind === 'attack') definition = matches.find(item => item.id === `${enemyKey}:attack`);
  else definition = matches.find(item => action.skillId ? item.id === action.skillId && (!action.skillName || item.name === action.skillName) : !!action.skillName && item.name === action.skillName);
  return definition ? { definition, Effect: group.Effect } : null;
}
