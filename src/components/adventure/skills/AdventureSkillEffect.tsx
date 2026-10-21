import { findSkillAnimation } from './registry';
import type { SkillAnimationClass, SkillEffectProps } from './types';

export function AdventureSkillEffect({ skillId, heroClass, target }: SkillEffectProps & { heroClass: SkillAnimationClass }) {
  const animation = findSkillAnimation(skillId, heroClass);
  if (!animation) return null;
  return <div className="adventure-skill-layer" data-animation-skill={skillId} data-animation-target={target} aria-hidden="true">
    <animation.Effect skillId={skillId} target={target} />
  </div>;
}
