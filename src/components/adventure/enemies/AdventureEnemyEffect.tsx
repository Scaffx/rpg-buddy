import { findEnemyAnimation } from './registry';
import './enemyPresentation.css';

export function AdventureEnemyEffect({ enemyKey, kind, skillId, skillName }: { enemyKey: string; kind: 'attack' | 'skill'; skillId?: string | null; skillName?: string | null }) {
  const entry = findEnemyAnimation(enemyKey, { kind, skillId, skillName });
  if (!entry) return null;
  return <div className="adventure-enemy-skill-layer" data-enemy-effect={entry.definition.id} data-enemy-target={entry.definition.target} aria-hidden="true">
    <entry.Effect animationId={entry.definition.id} target={entry.definition.target} />
  </div>;
}
