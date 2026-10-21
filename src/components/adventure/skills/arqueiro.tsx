import './arqueiro.css';
import type { ReactNode } from 'react';
import type { SkillAnimationDefinition, SkillEffectProps } from './types';

/** Catalog names and IDs; descriptions refer only to the animation. */
// The integration contract requires metadata and renderer to be exported together.
// eslint-disable-next-line react-refresh/only-export-components
export const arqueiroSkills: SkillAnimationDefinition[] = [
  { id: 'a_tiro', name: 'Tiro Certeiro', nodeType: 'skill', element: 'physical', motion: 'bow', target: 'enemy', description: 'Uma flecha fina cruza a cena e marca um pequeno alvo.' },
  { id: 'a_fogo', name: 'Flecha Flamejante', nodeType: 'skill', element: 'fire', motion: 'bow', target: 'enemy', description: 'Uma flecha com cauda de brasas abre uma coroa de chamas.' },
  { id: 'a_gelo', name: 'Flecha de Gelo', nodeType: 'skill', element: 'ice', motion: 'bow', target: 'enemy', description: 'Um dardo facetado deixa cristais e forma uma estrela de gelo.' },
  { id: 'a_vetor', name: 'Disparo Perfurante', nodeType: 'skill', element: 'physical', motion: 'bow', target: 'enemy', description: 'Uma mira se fecha antes de um traço estreito atravessar o alvo.' },
  { id: 'a_fogo_var', name: 'Chuva de Fogo', nodeType: 'variant', element: 'fire', motion: 'bow', target: 'enemy', description: 'Uma salva de flechas incandescentes cai em torno do alvo.' },
  { id: 'a_gelo_var', name: 'Tempestade de Gelo', nodeType: 'variant', element: 'ice', motion: 'bow', target: 'enemy', description: 'Cristais giram ao redor do alvo e convergem numa estrela gelada.' },
  { id: 'a_pre_var', name: 'Tiro do Vazio', nodeType: 'variant', element: 'arcane', motion: 'bow', target: 'enemy', description: 'Uma lança escura deixa ecos e abre uma íris violeta no alvo.' },
];

export function ArqueiroSkillEffect({ skillId, target }: SkillEffectProps) {
  let effect: ReactNode;

  switch (skillId) {
    case 'a_tiro':
      effect = <>
        <span className="vfx-arqueiro__draw vfx-arqueiro__draw--plain" />
        <span className="vfx-arqueiro__flight vfx-arqueiro__flight--plain">
          <span className="vfx-arqueiro__shaft" /><span className="vfx-arqueiro__head" /><span className="vfx-arqueiro__fletching" />
        </span>
        <span className="vfx-arqueiro__impact vfx-arqueiro__impact--plain"><span className="vfx-arqueiro__mark" /></span>
      </>;
      break;
    case 'a_fogo':
      effect = <>
        <span className="vfx-arqueiro__draw vfx-arqueiro__draw--fire" />
        <span className="vfx-arqueiro__flight vfx-arqueiro__flight--fire">
          <span className="vfx-arqueiro__flame-tail" /><span className="vfx-arqueiro__shaft" /><span className="vfx-arqueiro__head" />
        </span>
        <span className="vfx-arqueiro__impact vfx-arqueiro__impact--fire">
          <span /><span /><span /><span /><span />
        </span>
      </>;
      break;
    case 'a_gelo':
      effect = <>
        <span className="vfx-arqueiro__draw vfx-arqueiro__draw--ice" />
        <span className="vfx-arqueiro__flight vfx-arqueiro__flight--ice">
          <span className="vfx-arqueiro__ice-dust" /><span className="vfx-arqueiro__ice-shaft" /><span className="vfx-arqueiro__ice-tip" />
        </span>
        <span className="vfx-arqueiro__impact vfx-arqueiro__impact--ice"><span /><span /><span /></span>
      </>;
      break;
    case 'a_vetor':
      effect = <>
        <span className="vfx-arqueiro__sight"><span /><span /></span>
        <span className="vfx-arqueiro__flight vfx-arqueiro__flight--pierce"><span className="vfx-arqueiro__needle" /></span>
        <span className="vfx-arqueiro__impact vfx-arqueiro__impact--pierce"><span /><span /></span>
      </>;
      break;
    case 'a_fogo_var':
      effect = <>
        <span className="vfx-arqueiro__draw vfx-arqueiro__draw--volley" />
        <span className="vfx-arqueiro__rain"><span /><span /><span /><span /><span /></span>
        <span className="vfx-arqueiro__impact vfx-arqueiro__impact--rain"><span /><span /><span /></span>
      </>;
      break;
    case 'a_gelo_var':
      effect = <>
        <span className="vfx-arqueiro__draw vfx-arqueiro__draw--storm" />
        <span className="vfx-arqueiro__storm"><span /><span /><span /><span /><span /><span /></span>
        <span className="vfx-arqueiro__impact vfx-arqueiro__impact--storm"><span /><span /><span /></span>
      </>;
      break;
    case 'a_pre_var':
      effect = <>
        <span className="vfx-arqueiro__sight vfx-arqueiro__sight--void"><span /><span /></span>
        <span className="vfx-arqueiro__flight vfx-arqueiro__flight--void"><span className="vfx-arqueiro__void-core" /><span className="vfx-arqueiro__void-echo" /></span>
        <span className="vfx-arqueiro__impact vfx-arqueiro__impact--void"><span /><span /></span>
      </>;
      break;
    default:
      return null;
  }

  return <div
    className={`vfx-arqueiro vfx-arqueiro--${skillId}${target === 'self' ? ' vfx-arqueiro--self' : ''}`}
    data-skill-vfx={skillId}
    data-skill-id={skillId}
    aria-hidden="true"
  >{effect}</div>;
}
