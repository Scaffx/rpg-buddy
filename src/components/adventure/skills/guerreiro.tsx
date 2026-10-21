import type { ReactNode } from 'react';
import type { SkillAnimationDefinition, SkillEffectProps } from './types';
import './guerreiro.css';

/** Catalog names and IDs; descriptions describe only the visible animation. */
// The registry consumes metadata and the component from the same class module.
// eslint-disable-next-line react-refresh/only-export-components
export const guerreiroSkills: SkillAnimationDefinition[] = [
  { id: 'g_golpe', name: 'Golpe Marcial', nodeType: 'skill', element: 'physical', motion: 'melee', target: 'enemy', description: 'Arco curto de aço sai da guarda e fecha em um impacto compacto.' },
  { id: 'g_chama', name: 'Lâmina Flamejante', nodeType: 'skill', element: 'fire', motion: 'lunge', target: 'enemy', description: 'Lâmina acesa avança com cauda de brasas e abre um leque de chamas.' },
  { id: 'g_corte', name: 'Corte Sangrento', nodeType: 'skill', element: 'physical', motion: 'lunge', target: 'enemy', description: 'Duas linhas rubras e finas atravessam o alvo em tempos próximos.' },
  { id: 'g_ruptura', name: 'Ruptura Frontal', nodeType: 'skill', element: 'physical', motion: 'slam', target: 'enemy', description: 'Cunha pesada desce e desenha rachaduras curtas no chão.' },
  { id: 'g_for_var', name: 'Devastar', nodeType: 'variant', element: 'physical', motion: 'slam', target: 'enemy', description: 'Grande corte angular termina em anel de choque e lascas.' },
  { id: 'g_inf_var', name: 'Espada Vulcânica', nodeType: 'variant', element: 'fire', motion: 'slam', target: 'enemy', description: 'Fio incandescente chega ao alvo antes de uma coluna de lava estilizada.' },
  { id: 'g_sang_var', name: 'Dança das Lâminas', nodeType: 'variant', element: 'physical', motion: 'lunge', target: 'enemy', description: 'Três rastros curvos se cruzam em sequência ao redor do alvo.' },
];

type GuerreiroId = 'g_golpe' | 'g_chama' | 'g_corte' | 'g_ruptura' | 'g_for_var' | 'g_inf_var' | 'g_sang_var';
type WarriorArt = { source: ReactNode; travel: ReactNode; impact: ReactNode };

const artwork: Record<GuerreiroId, WarriorArt> = {
  g_golpe: {
    source: <svg viewBox="0 0 100 100"><path d="M33 73 69 25M26 75l15 5m25-61 9 15" /></svg>,
    travel: <svg viewBox="0 0 100 100"><path d="M14 78Q39 29 88 21" /><path className="vfx-guerreiro__echo" d="M24 84Q55 48 88 37" /></svg>,
    impact: <svg viewBox="0 0 100 100"><path d="M50 15v70M15 50h70M29 29l42 42M71 29 29 71" /><circle cx="50" cy="50" r="16" /></svg>,
  },
  g_chama: {
    source: <svg viewBox="0 0 100 100"><path d="M48 83C26 66 36 51 51 23c0 20 15 20 11 36 9-8 9-17 9-17 13 23-2 43-23 41Z" /><path d="M51 74c-8-8-2-17 3-25 1 10 9 15 3 25" /></svg>,
    travel: <svg viewBox="0 0 100 100"><path d="M18 79 73 22l6 7-54 56z" /><path d="M17 70C8 53 23 50 22 38c9 9 7 17 12 20M39 55c-4-16 8-20 8-30 8 11 7 17 8 19" /><path className="vfx-guerreiro__echo" d="M13 88 36 77" /></svg>,
    impact: <svg viewBox="0 0 100 100"><path d="M50 84C15 80 20 59 30 45c4 14 10 17 13 17-6-27 11-33 13-51 6 20 15 28 10 48 8-4 10-14 11-20 16 26 4 45-27 45Z" /><path className="vfx-guerreiro__echo" d="M50 77c-11-13-3-26 3-34 0 12 11 16 7 28" /></svg>,
  },
  g_corte: {
    source: <svg viewBox="0 0 100 100"><path d="M24 68 67 26M33 80 79 38" /><path className="vfx-guerreiro__echo" d="M22 50h16M65 74h16" /></svg>,
    travel: <svg viewBox="0 0 100 100"><path d="M13 75 84 23M20 86 91 34" /><path className="vfx-guerreiro__echo" d="M39 74 75 48" /></svg>,
    impact: <svg viewBox="0 0 100 100"><path className="vfx-guerreiro__cut-one" d="M15 73 81 21" /><path className="vfx-guerreiro__cut-two" d="M23 87 91 35" /><circle cx="31" cy="36" r="3" /><circle cx="74" cy="77" r="3" /></svg>,
  },
  g_ruptura: {
    source: <svg viewBox="0 0 100 100"><path d="M28 61 57 18l16 10-26 43-20 4zM21 78h57" /></svg>,
    travel: <svg viewBox="0 0 100 100"><path d="M28 23 74 37 61 84 39 75z" /><path d="M31 29 60 70M19 85h18" /></svg>,
    impact: <svg viewBox="0 0 100 100"><path d="M49 13 57 48 46 57 51 85M45 56 22 71 12 84M54 62 76 72 89 85M12 84h76" /><path className="vfx-guerreiro__echo" d="M31 91 41 77M72 91 61 77" /></svg>,
  },
  g_for_var: {
    source: <svg viewBox="0 0 100 100"><path d="M18 25 77 80M77 20 22 81M42 52h17" /></svg>,
    travel: <svg viewBox="0 0 100 100"><path d="M13 20 75 28 88 46 47 86 33 72 68 40z" /><path d="M14 20 33 72M47 86 88 46" /></svg>,
    impact: <svg viewBox="0 0 100 100"><circle cx="50" cy="54" r="30" /><path d="M50 8v25M13 28l20 15M87 28 67 43M7 76l27-11M93 76 66 65M41 52 52 43l10 12-11 12z" /><path className="vfx-guerreiro__echo" d="M17 91 29 79M82 91 70 79" /></svg>,
  },
  g_inf_var: {
    source: <svg viewBox="0 0 100 100"><path d="M24 77 51 18l24 59M35 61h32M22 83h56" /><path className="vfx-guerreiro__echo" d="M51 66V37" /></svg>,
    travel: <svg viewBox="0 0 100 100"><path d="M9 70Q47 52 91 70M15 80q16-13 25 0t25 0 24 0" /><circle cx="28" cy="56" r="4" /><circle cx="66" cy="49" r="3" /></svg>,
    impact: <svg viewBox="0 0 100 100"><path d="M14 86 29 57 37 72 48 18 61 65 71 48 88 86z" /><path d="M20 90h64M48 18l4 37" /><circle cx="25" cy="24" r="4" /><circle cx="78" cy="27" r="3" /><circle cx="66" cy="12" r="2" /></svg>,
  },
  g_sang_var: {
    source: <svg viewBox="0 0 100 100"><path d="M50 12 63 44 88 50 61 61 50 88 38 61 12 50 38 40z" /><circle cx="50" cy="50" r="13" /></svg>,
    travel: <svg viewBox="0 0 100 100"><path d="M13 69Q38 16 88 30M16 82Q62 27 91 50M33 88Q74 48 82 13" /></svg>,
    impact: <svg viewBox="0 0 100 100"><path className="vfx-guerreiro__cut-one" d="M13 69Q41 14 87 29" /><path className="vfx-guerreiro__cut-two" d="M15 84Q60 27 91 51" /><path className="vfx-guerreiro__cut-three" d="M33 91Q76 52 82 11" /><circle cx="52" cy="53" r="21" /></svg>,
  },
};

function isGuerreiroId(skillId: string): skillId is GuerreiroId {
  return Object.prototype.hasOwnProperty.call(artwork, skillId);
}

export function GuerreiroSkillEffect({ skillId, target }: SkillEffectProps) {
  if (!isGuerreiroId(skillId)) return null;
  const art = artwork[skillId];
  return (
    <div className={`vfx-guerreiro vfx-guerreiro--${skillId}`} data-skill-vfx="guerreiro" data-skill-id={skillId} data-target={target} aria-hidden="true">
      <span className="vfx-guerreiro__source">{art.source}</span>
      <span className="vfx-guerreiro__mover"><span className="vfx-guerreiro__traveler">{art.travel}</span></span>
      <span className="vfx-guerreiro__impact">{art.impact}</span>
    </div>
  );
}
