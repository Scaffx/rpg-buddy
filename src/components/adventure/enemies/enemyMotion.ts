import type { EnemyAnimationMotion } from './types';

/** Choreography only: self-target actions stay with their own effect anchor. */
export function enemyActionMotion(gesture: EnemyAnimationMotion | undefined, target: 'hero' | 'self' | undefined, gap: number) {
  const stationary = gesture === 'cast' || gesture === 'roar' || gesture === 'guard';
  const approach = stationary ? .04 : gesture === 'flight' ? .35 : .6;
  return { x: [0, target === 'self' ? 0 : -gap * approach, 0], y: [0, gesture === 'flight' ? -28 : gesture === 'slam' ? -15 : -5, 0] };
}
