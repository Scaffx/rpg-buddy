import type { EnemyEffectProps } from './types';
import './creatures.css';

const ATTACK_SHAPES: Record<string, string> = {
  'creature:0:0:attack': 'bite',
  'creature:0:1:attack': 'tusk',
  'creature:0:2:attack': 'leaf',
  'creature:1:0:attack': 'fin',
  'creature:1:1:attack': 'dive',
  'creature:1:2:attack': 'tail',
  'creature:2:0:attack': 'bone',
  'creature:2:1:attack': 'wing',
  'creature:2:2:attack': 'stone',
  'creature:3:0:attack': 'claw',
  'creature:3:1:attack': 'feather',
  'creature:3:2:attack': 'magma',
  'creature:4:0:attack': 'sting',
  'creature:4:1:attack': 'sand',
  'creature:4:2:attack': 'shell',
  'creature:5:0:attack': 'snow-bite',
  'creature:5:1:attack': 'snow-wing',
  'creature:5:2:attack': 'crystal',
};

export function CreaturesEffect({ animationId, target }: EnemyEffectProps) {
  const shape = ATTACK_SHAPES[animationId];
  if (!shape) return null;

  return <div className={`vfx-creatures vfx-creatures--${shape}`} data-enemy-vfx="creatures" data-enemy-animation={animationId} data-target={target} aria-hidden="true">
    <span className="vfx-creatures__trail" />
    <span className="vfx-creatures__strike" />
    <span className="vfx-creatures__impact" />
  </div>;
}
