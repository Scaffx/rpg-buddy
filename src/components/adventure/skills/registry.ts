import type { ComponentType } from 'react';
import type { SkillAnimationClass, SkillAnimationDefinition, SkillEffectProps } from './types';
import { magoSkills, MagoSkillEffect } from './mago';
import { guerreiroSkills, GuerreiroSkillEffect } from './guerreiro';
import { arqueiroSkills, ArqueiroSkillEffect } from './arqueiro';
import { gatunoSkills, GatunoSkillEffect } from './gatuno';
import { ferreiroSkills, FerreiroSkillEffect } from './ferreiro';
import { clericoSkills, ClericoSkillEffect } from './clerico';
import { aprendizSkills, AprendizSkillEffect } from './aprendiz';

type AnimationEntry = { definition: SkillAnimationDefinition; heroClass: SkillAnimationClass; Effect: ComponentType<SkillEffectProps> };
export const CLASS_ANIMATIONS: Record<SkillAnimationClass, { label: string; skills: SkillAnimationDefinition[]; Effect: ComponentType<SkillEffectProps> }> = {
  mago: { label: 'Mago', skills: magoSkills, Effect: MagoSkillEffect },
  guerreiro: { label: 'Guerreiro', skills: guerreiroSkills, Effect: GuerreiroSkillEffect },
  arqueiro: { label: 'Arqueiro', skills: arqueiroSkills, Effect: ArqueiroSkillEffect },
  gatuno: { label: 'Gatuno', skills: gatunoSkills, Effect: GatunoSkillEffect },
  ferreiro: { label: 'Ferreiro', skills: ferreiroSkills, Effect: FerreiroSkillEffect },
  clerico: { label: 'Clérigo', skills: clericoSkills, Effect: ClericoSkillEffect },
  aprendiz: { label: 'Aprendiz e armas', skills: aprendizSkills, Effect: AprendizSkillEffect },
};
const byId = new Map<string, AnimationEntry>();
for (const [heroClass, group] of Object.entries(CLASS_ANIMATIONS)) {
  for (const definition of group.skills) byId.set(definition.id, { definition, heroClass: heroClass as SkillAnimationClass, Effect: group.Effect });
}

/** Presentation lookup, never a skill unlock or a combat calculation. */
export function findSkillAnimation(skillId: string | null | undefined, heroClass: SkillAnimationClass): AnimationEntry | null {
  if (!skillId) return null;
  const entry = byId.get(skillId);
  if (!entry) return null;
  const shared = entry.heroClass === 'aprendiz' && (skillId === 'a_golpe' || skillId.startsWith('cinza_') || skillId.startsWith('weapon_'));
  return entry.heroClass === heroClass || shared ? entry : null;
}
