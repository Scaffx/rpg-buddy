import { findEnemyGroup } from './registry';

export function AdventureEnemyPortrait({ enemyKey, className }: { enemyKey: string; className?: string }) {
  const group = findEnemyGroup(enemyKey);
  return group ? <group.Sprite enemyKey={enemyKey} className={className} /> : null;
}
