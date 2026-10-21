import type { ComponentType } from 'react';
import type { AdventureBiome } from '@/lib/adventureVisuals';

/** Visual presentation only; no battle results, timers, XP or rewards. */
export type EnemyAnimationElement = 'physical' | 'arcane' | 'fire' | 'ice' | 'lightning' | 'nature' | 'light' | 'water' | 'earth' | 'shadow' | 'poison' | 'wind';
export type EnemyAnimationMotion = 'lunge' | 'slam' | 'cast' | 'roar' | 'guard' | 'flight';
export type EnemyAnimationDefinition = {
  id: string;
  enemyKey: string;
  name: string;
  kind: 'attack' | 'skill';
  element: EnemyAnimationElement;
  motion: EnemyAnimationMotion;
  target: 'hero' | 'self';
  description: string;
};
export type EnemyPresentation = {
  key: string;
  name: string;
  kind: 'boss' | 'creature';
  bossId?: string;
  biome: AdventureBiome;
  slot?: 0 | 1 | 2;
};
export type EnemyEffectProps = { animationId: string; target: 'hero' | 'self' };
export type EnemySpriteProps = { enemyKey: string; className?: string };
export type EnemyAnimationGroup = {
  label: string;
  enemies: EnemyPresentation[];
  animations: EnemyAnimationDefinition[];
  Effect: ComponentType<EnemyEffectProps>;
  Sprite: ComponentType<EnemySpriteProps>;
};

