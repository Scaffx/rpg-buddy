import type { SkillAnimationDefinition, SkillEffectProps } from './types';
import './clerico.css';

/** Visual cues only; the battle event remains the source of combat results. */
export const clericoSkills: SkillAnimationDefinition[] = [
  {
    id: 'n_golpe', name: 'Golpe de Bastão', nodeType: 'skill', element: 'physical',
    motion: 'melee', target: 'enemy',
    description: 'O bastão descreve um arco curto e marca o contato com uma estrela de madeira.',
  },
  {
    id: 'n_cura', name: 'Cura Menor', nodeType: 'skill', element: 'light',
    motion: 'support', target: 'self',
    description: 'Um selo de luz se forma no herói e pequenas gotas luminosas sobem ao redor dele.',
  },
  {
    id: 'n_luz', name: 'Luz Purificadora', nodeType: 'skill', element: 'light',
    motion: 'cast', target: 'enemy',
    description: 'Um filete de luz sai do herói e abre uma estrela de quatro pontas no alvo.',
  },
  {
    id: 'n_escudo', name: 'Bênção Protetora', nodeType: 'skill', element: 'light',
    motion: 'support', target: 'self',
    description: 'Duas abas douradas se fecham em um contorno de escudo diante do herói.',
  },
  {
    id: 'n_sup_var', name: 'Aura Restauradora', nodeType: 'variant', element: 'light',
    motion: 'support', target: 'self',
    description: 'Três anéis suaves e pétalas de luz se expandem a partir do herói.',
  },
  {
    id: 'n_sag_var', name: 'Julgamento', nodeType: 'variant', element: 'light',
    motion: 'cast', target: 'enemy',
    description: 'Um sigilo se forma acima do alvo e desce como uma coluna estreita de luz.',
  },
];

export function ClericoSkillEffect({ skillId, target }: SkillEffectProps) {
  let effect;

  switch (skillId) {
    case 'n_golpe':
      effect = (
        <div className="vfx-clerico__target vfx-clerico__staff">
          <span className="vfx-clerico__staff-shaft" />
          <span className="vfx-clerico__staff-arc" />
          <span className="vfx-clerico__staff-hit" />
        </div>
      );
      break;
    case 'n_cura':
      effect = (
        <div className="vfx-clerico__target vfx-clerico__heal">
          <span className="vfx-clerico__heal-ring" />
          <svg className="vfx-clerico__heal-seal" viewBox="0 0 40 40" fill="none">
            <path d="M20 7v26M7 20h26M12 12l16 16M28 12 12 28" />
            <circle cx="20" cy="20" r="6" />
          </svg>
          <span className="vfx-clerico__heal-drop vfx-clerico__heal-drop--one" />
          <span className="vfx-clerico__heal-drop vfx-clerico__heal-drop--two" />
          <span className="vfx-clerico__heal-drop vfx-clerico__heal-drop--three" />
        </div>
      );
      break;
    case 'n_luz':
      effect = (
        <>
          <span className="vfx-clerico__source vfx-clerico__light-source" />
          <span className="vfx-clerico__light-route"><span className="vfx-clerico__light-ray" /></span>
          <div className="vfx-clerico__target vfx-clerico__light-hit">
            <span className="vfx-clerico__light-star" />
            <span className="vfx-clerico__light-circle" />
          </div>
        </>
      );
      break;
    case 'n_escudo':
      effect = (
        <div className="vfx-clerico__target vfx-clerico__shield">
          <span className="vfx-clerico__shield-wing vfx-clerico__shield-wing--left" />
          <span className="vfx-clerico__shield-wing vfx-clerico__shield-wing--right" />
          <svg className="vfx-clerico__shield-outline" viewBox="0 0 72 88" fill="none">
            <path d="M36 4 66 17v27c0 18-12 31-30 40C18 75 6 62 6 44V17L36 4Z" />
            <path d="M36 18v47M23 39h26" />
          </svg>
        </div>
      );
      break;
    case 'n_sup_var':
      effect = (
        <div className="vfx-clerico__target vfx-clerico__aura">
          <span className="vfx-clerico__aura-core" />
          <span className="vfx-clerico__aura-ring vfx-clerico__aura-ring--one" />
          <span className="vfx-clerico__aura-ring vfx-clerico__aura-ring--two" />
          <span className="vfx-clerico__aura-ring vfx-clerico__aura-ring--three" />
          <span className="vfx-clerico__aura-petal vfx-clerico__aura-petal--left" />
          <span className="vfx-clerico__aura-petal vfx-clerico__aura-petal--right" />
        </div>
      );
      break;
    case 'n_sag_var':
      effect = (
        <div className="vfx-clerico__target vfx-clerico__judgement">
          <span className="vfx-clerico__judgement-sigil" />
          <span className="vfx-clerico__judgement-column" />
          <span className="vfx-clerico__judgement-ground" />
          <span className="vfx-clerico__judgement-spark vfx-clerico__judgement-spark--left" />
          <span className="vfx-clerico__judgement-spark vfx-clerico__judgement-spark--right" />
        </div>
      );
      break;
    default:
      return null;
  }

  return (
    <div className="vfx-clerico" data-skill-vfx="clerico" data-skill-id={skillId} data-target={target} aria-hidden="true">
      {effect}
    </div>
  );
}
