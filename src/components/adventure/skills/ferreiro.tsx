import type { ReactNode } from 'react';
import type { SkillAnimationDefinition, SkillEffectProps } from './types';
import './ferreiro.css';

/** Catalog snapshot: public Primary 2026-10-21. These labels describe only the image. */
export const ferreiroSkills: SkillAnimationDefinition[] = [
  { id: 'f_martelada', name: 'Martelada', nodeType: 'skill', element: 'physical', motion: 'slam', target: 'enemy', description: 'Martelo de aço desce em arco curto; um anel de impacto e duas lascas se abrem no ponto de contato.' },
  { id: 'f_chama', name: 'Malho Flamejante', nodeType: 'skill', element: 'fire', motion: 'slam', target: 'enemy', description: 'Malho incandescente deixa um rastro de brasa e espalha pequenas línguas de fogo no impacto.' },
  { id: 'f_impacto', name: 'Impacto de Forja', nodeType: 'skill', element: 'physical', motion: 'slam', target: 'enemy', description: 'Cabeça quadrada de marreta comprime o chão e abre rachaduras metálicas em leque.' },
  { id: 'ferreiro_t1_pancada_atordoante', name: 'Pancada Atordoante', nodeType: 'skill', element: 'physical', motion: 'slam', target: 'enemy', description: 'Martelo vertical toca o alvo; três arcos dourados e estrelas giram brevemente ao redor da batida.' },
  { id: 'f_for_var', name: 'Bigorna', nodeType: 'variant', element: 'physical', motion: 'slam', target: 'enemy', description: 'Uma bigorna cai de cima, levanta poeira lateral e deixa uma marca larga no chão.' },
  { id: 'f_inf_var', name: 'Forja Vulcânica', nodeType: 'variant', element: 'fire', motion: 'slam', target: 'enemy', description: 'Uma forja acende sob o alvo e projeta três colunas de lava e fagulhas em alturas distintas.' },
];

export function FerreiroSkillEffect({ skillId, target }: SkillEffectProps) {
  let visual: ReactNode;

  switch (skillId) {
    case 'f_martelada':
      visual = <>
        <span className="vfx-ferreiro-rail vfx-ferreiro-rail-steel" />
        <svg className="vfx-ferreiro-mark vfx-ferreiro-martelada-hammer" viewBox="0 0 100 100" fill="none" aria-hidden="true">
          <path d="M45 46 26 79M32 82 20 76l7-9" stroke="#826751" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M22 31 34 14 77 31 65 49Z" fill="#d8e0dd" stroke="#485862" strokeWidth="5" strokeLinejoin="round" />
          <path d="m37 18 32 12M28 36l32 12" stroke="#fff8de" strokeWidth="3" opacity=".8" />
        </svg>
        <span className="vfx-ferreiro-ring vfx-ferreiro-ring-steel" />
        <span className="vfx-ferreiro-chip vfx-ferreiro-chip-one" /><span className="vfx-ferreiro-chip vfx-ferreiro-chip-two" />
      </>;
      break;
    case 'f_chama':
      visual = <>
        <span className="vfx-ferreiro-rail vfx-ferreiro-rail-ember" />
        <svg className="vfx-ferreiro-mark vfx-ferreiro-chama-hammer" viewBox="0 0 100 100" fill="none" aria-hidden="true">
          <path d="M43 48 24 83" stroke="#69544a" strokeWidth="11" strokeLinecap="round" />
          <path d="M19 31 33 16 75 31 63 50Z" fill="#a63d22" stroke="#f6a34a" strokeWidth="5" strokeLinejoin="round" />
          <path d="M34 16q-4-11 4-15 0 8 8 11 2-9 10-12-2 10 5 16" fill="#ffcf61" stroke="#e6662d" strokeWidth="2" />
          <path d="m28 34 37 12" stroke="#ffdf81" strokeWidth="4" />
        </svg>
        <svg className="vfx-ferreiro-mark vfx-ferreiro-chama-flame" viewBox="0 0 100 100" aria-hidden="true">
          <path d="M14 74Q12 51 30 41q-3 20 11 17Q39 28 58 17q-4 22 10 29 4-10 10-15 1 18 8 32Q82 84 51 87 20 87 14 74Z" fill="#fa7430" stroke="#ffc65e" strokeWidth="3" />
          <path d="M37 74q-2-12 10-19 0 10 8 9 2-8 8-11 4 13 0 21-8 9-26 0Z" fill="#ffe69d" />
        </svg>
        <span className="vfx-ferreiro-ember vfx-ferreiro-ember-one" /><span className="vfx-ferreiro-ember vfx-ferreiro-ember-two" /><span className="vfx-ferreiro-ember vfx-ferreiro-ember-three" />
      </>;
      break;
    case 'f_impacto':
      visual = <>
        <svg className="vfx-ferreiro-mark vfx-ferreiro-impacto-block" viewBox="0 0 100 100" fill="none" aria-hidden="true">
          <path d="M45 22V71" stroke="#6d5d51" strokeWidth="11" strokeLinecap="round" />
          <path d="M13 23h65v31H13z" fill="#aab7b6" stroke="#414c55" strokeWidth="5" />
          <path d="M16 52h59l-8 13H23z" fill="#5c6870" stroke="#333b44" strokeWidth="4" />
          <path d="M18 30h55" stroke="#ecf0df" strokeWidth="3" />
        </svg>
        <svg className="vfx-ferreiro-mark vfx-ferreiro-impacto-crack" viewBox="0 0 120 60" fill="none" aria-hidden="true">
          <path d="M60 10 51 28 31 34 21 52M56 25 39 16 22 18 8 8M64 23 80 31 91 27 110 48M72 34 83 48 105 51M46 34 34 47 13 44" stroke="#d5c4a3" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="vfx-ferreiro-dust vfx-ferreiro-dust-left" /><span className="vfx-ferreiro-dust vfx-ferreiro-dust-right" />
      </>;
      break;
    case 'ferreiro_t1_pancada_atordoante':
      visual = <>
        <svg className="vfx-ferreiro-mark vfx-ferreiro-pancada-hammer" viewBox="0 0 100 100" fill="none" aria-hidden="true">
          <path d="M51 13v65" stroke="#735647" strokeWidth="11" strokeLinecap="round" />
          <path d="M22 54h58v28H22z" fill="#dfc571" stroke="#64553e" strokeWidth="5" strokeLinejoin="round" />
          <path d="M27 61h48" stroke="#fff1b5" strokeWidth="3" />
        </svg>
        <span className="vfx-ferreiro-orbit vfx-ferreiro-orbit-outer" /><span className="vfx-ferreiro-orbit vfx-ferreiro-orbit-inner" />
        <svg className="vfx-ferreiro-mark vfx-ferreiro-pancada-stars" viewBox="0 0 120 100" fill="#ffe28a" stroke="#a67a31" strokeWidth="2" aria-hidden="true">
          <path d="m18 18 3 8 8 3-8 3-3 8-3-8-8-3 8-3zM91 7l3 7 7 3-7 3-3 7-3-7-7-3 7-3zM103 60l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" />
        </svg>
      </>;
      break;
    case 'f_for_var':
      visual = <>
        <svg className="vfx-ferreiro-mark vfx-ferreiro-bigorna" viewBox="0 0 140 100" fill="none" aria-hidden="true">
          <path d="M11 30h104q-16 17-43 19H21Z" fill="#c2c9c4" stroke="#394550" strokeWidth="5" strokeLinejoin="round" />
          <path d="M23 47h87L92 60H41Z" fill="#839299" stroke="#394550" strokeWidth="4" />
          <path d="M47 60h44l-5 21H51Z" fill="#657680" stroke="#394550" strokeWidth="4" />
          <path d="M39 81h62v9H39z" fill="#aab5b1" stroke="#394550" strokeWidth="4" />
          <path d="M28 36h67" stroke="#f6f0d3" strokeWidth="3" />
        </svg>
        <span className="vfx-ferreiro-bigorna-shadow" /><span className="vfx-ferreiro-bigorna-dust vfx-ferreiro-bigorna-dust-left" /><span className="vfx-ferreiro-bigorna-dust vfx-ferreiro-bigorna-dust-right" />
        <span className="vfx-ferreiro-bigorna-notch vfx-ferreiro-bigorna-notch-left" /><span className="vfx-ferreiro-bigorna-notch vfx-ferreiro-bigorna-notch-right" />
      </>;
      break;
    case 'f_inf_var':
      visual = <>
        <svg className="vfx-ferreiro-mark vfx-ferreiro-volcano-forge" viewBox="0 0 160 100" fill="none" aria-hidden="true">
          <path d="M12 86 53 49h55l40 37Z" fill="#5a3940" stroke="#e66f3f" strokeWidth="4" strokeLinejoin="round" />
          <path d="M46 52h67l-10 13H58Z" fill="#ffaf45" stroke="#ffdb77" strokeWidth="4" />
          <path d="M66 66 60 84M85 65l2 20M104 65l9 19" stroke="#fb7631" strokeWidth="5" strokeLinecap="round" />
        </svg>
        <span className="vfx-ferreiro-lava vfx-ferreiro-lava-left" /><span className="vfx-ferreiro-lava vfx-ferreiro-lava-center" /><span className="vfx-ferreiro-lava vfx-ferreiro-lava-right" />
        <span className="vfx-ferreiro-cinder vfx-ferreiro-cinder-one" /><span className="vfx-ferreiro-cinder vfx-ferreiro-cinder-two" /><span className="vfx-ferreiro-cinder vfx-ferreiro-cinder-three" />
      </>;
      break;
    default:
      return null;
  }

  return <div className="vfx-ferreiro" data-skill-vfx="ferreiro" data-skill-id={skillId} data-skill-target={target} aria-hidden="true">{visual}</div>;
}
