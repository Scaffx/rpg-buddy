/** Visual presentation only. Combat results and resources always come from server events. */
export type SkillAnimationClass = 'mago' | 'guerreiro' | 'arqueiro' | 'gatuno' | 'ferreiro' | 'clerico' | 'aprendiz';
export type SkillAnimationElement = 'physical' | 'arcane' | 'fire' | 'ice' | 'lightning' | 'nature' | 'light';
export type SkillAnimationMotion = 'cast' | 'bow' | 'melee' | 'support' | 'slam' | 'lunge';
export type SkillAnimationDefinition = {
  id: string;
  name: string;
  nodeType: 'skill' | 'variant';
  element: SkillAnimationElement;
  motion: SkillAnimationMotion;
  target: 'enemy' | 'self';
  /** Short description of the visible gesture/effect, not a promise of gameplay mechanics. */
  description: string;
};
export type SkillEffectProps = { skillId: string; target: 'enemy' | 'self' };
