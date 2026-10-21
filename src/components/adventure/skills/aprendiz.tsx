import type { ReactNode } from 'react';
import type { SkillAnimationDefinition, SkillEffectProps } from './types';
import './aprendiz.css';

/** Visual metadata only. Weapon skills and ashes can be shown for any class. */
export const aprendizSkills: SkillAnimationDefinition[] = [
  { id: 'a_golpe', name: 'Golpe Improvisado', nodeType: 'skill', element: 'physical', motion: 'melee', target: 'enemy', description: 'Punho curto, rastro irregular e pequeno estalo no alvo.' },
  { id: 'cinza_corte_flamejante', name: 'Corte Flamejante', nodeType: 'skill', element: 'fire', motion: 'melee', target: 'enemy', description: 'Arco de lâmina cor de brasa com três fagulhas ascendentes.' },
  { id: 'cinza_lamina_glacial', name: 'Lâmina Glacial', nodeType: 'skill', element: 'ice', motion: 'melee', target: 'enemy', description: 'Corte cristalino estreito que se abre em lascas de gelo.' },
  { id: 'weapon_98bc20de-6d2f-44fd-8c8c-725dc9d3f004', name: 'Corte Veloz', nodeType: 'skill', element: 'physical', motion: 'lunge', target: 'enemy', description: 'Dois riscos diagonais finos em sequência rápida.' },
  { id: 'weapon_3eff6bd5-bdef-496f-91b8-de248c6acf9f', name: 'Estocada', nodeType: 'skill', element: 'physical', motion: 'lunge', target: 'enemy', description: 'Linha reta comprimida que termina numa ponta de lança.' },
  { id: 'weapon_c432ec67-be07-4c4b-b618-fd2b0fd189b3', name: 'Flecha Perfurante', nodeType: 'skill', element: 'physical', motion: 'bow', target: 'enemy', description: 'Flecha longa com penas e anel de perfuração no alvo.' },
  { id: 'weapon_72bd4265-a0ba-430e-a4d9-054a3d5b0e33', name: 'Raio Sereno', nodeType: 'skill', element: 'light', motion: 'cast', target: 'enemy', description: 'Feixe dourado fino que converge num halo de luz.' },
  { id: 'weapon_6806d958-c6b8-4f82-9373-8b26954ccaed', name: 'Corte Brutal', nodeType: 'skill', element: 'physical', motion: 'melee', target: 'enemy', description: 'Talho largo e pesado com fragmentos no impacto.' },
  { id: 'weapon_a08f4e9c-004f-4975-8e9f-ef499f1c3909', name: 'Dardo Arcano', nodeType: 'skill', element: 'arcane', motion: 'cast', target: 'enemy', description: 'Losango violeta que cruza a cena com três pontos de energia.' },
  { id: 'weapon_db3d7bca-7d31-4445-aeb6-aa415758be1e', name: 'Pancada', nodeType: 'skill', element: 'physical', motion: 'slam', target: 'enemy', description: 'Cabeça de martelo desce sobre o alvo e abre uma onda baixa.' },
];

export function AprendizSkillEffect({ skillId, target }: SkillEffectProps) {
  let variant: string;
  let visual: ReactNode;

  switch (skillId) {
    case 'a_golpe':
      variant = 'golpe';
      visual = <><span className="vfx-aprendiz__punch" /><span className="vfx-aprendiz__impact vfx-aprendiz__impact--small" /></>;
      break;
    case 'cinza_corte_flamejante':
      variant = 'flamejante';
      visual = <><span className="vfx-aprendiz__flame-arc" /><span className="vfx-aprendiz__ember vfx-aprendiz__ember--one" /><span className="vfx-aprendiz__ember vfx-aprendiz__ember--two" /><span className="vfx-aprendiz__ember vfx-aprendiz__ember--three" /></>;
      break;
    case 'cinza_lamina_glacial':
      variant = 'glacial';
      visual = <><span className="vfx-aprendiz__ice-blade" /><span className="vfx-aprendiz__shard vfx-aprendiz__shard--one" /><span className="vfx-aprendiz__shard vfx-aprendiz__shard--two" /><span className="vfx-aprendiz__shard vfx-aprendiz__shard--three" /></>;
      break;
    case 'weapon_98bc20de-6d2f-44fd-8c8c-725dc9d3f004':
      variant = 'veloz';
      visual = <><span className="vfx-aprendiz__swift vfx-aprendiz__swift--one" /><span className="vfx-aprendiz__swift vfx-aprendiz__swift--two" /><span className="vfx-aprendiz__impact vfx-aprendiz__impact--swift" /></>;
      break;
    case 'weapon_3eff6bd5-bdef-496f-91b8-de248c6acf9f':
      variant = 'estocada';
      visual = <><span className="vfx-aprendiz__thrust-line" /><span className="vfx-aprendiz__thrust-tip" /><span className="vfx-aprendiz__impact vfx-aprendiz__impact--thrust" /></>;
      break;
    case 'weapon_c432ec67-be07-4c4b-b618-fd2b0fd189b3':
      variant = 'flecha';
      visual = <><span className="vfx-aprendiz__arrow-line" /><span className="vfx-aprendiz__arrow-tip" /><span className="vfx-aprendiz__arrow-feather" /><span className="vfx-aprendiz__impact vfx-aprendiz__impact--arrow" /></>;
      break;
    case 'weapon_72bd4265-a0ba-430e-a4d9-054a3d5b0e33':
      variant = 'sereno';
      visual = <><span className="vfx-aprendiz__ray vfx-aprendiz__ray--upper" /><span className="vfx-aprendiz__ray vfx-aprendiz__ray--lower" /><span className="vfx-aprendiz__halo" /></>;
      break;
    case 'weapon_6806d958-c6b8-4f82-9373-8b26954ccaed':
      variant = 'brutal';
      visual = <><span className="vfx-aprendiz__brutal-cut" /><span className="vfx-aprendiz__chip vfx-aprendiz__chip--one" /><span className="vfx-aprendiz__chip vfx-aprendiz__chip--two" /></>;
      break;
    case 'weapon_a08f4e9c-004f-4975-8e9f-ef499f1c3909':
      variant = 'arcano';
      visual = <><span className="vfx-aprendiz__arcane-path" /><span className="vfx-aprendiz__arcane-dart" /><span className="vfx-aprendiz__arcane-dot vfx-aprendiz__arcane-dot--one" /><span className="vfx-aprendiz__arcane-dot vfx-aprendiz__arcane-dot--two" /><span className="vfx-aprendiz__arcane-dot vfx-aprendiz__arcane-dot--three" /></>;
      break;
    case 'weapon_db3d7bca-7d31-4445-aeb6-aa415758be1e':
      variant = 'pancada';
      visual = <><span className="vfx-aprendiz__hammer" /><span className="vfx-aprendiz__shockwave" /><span className="vfx-aprendiz__dust vfx-aprendiz__dust--one" /><span className="vfx-aprendiz__dust vfx-aprendiz__dust--two" /></>;
      break;
    default:
      return null;
  }

  return <div className={`vfx-aprendiz vfx-aprendiz--${variant}`} data-skill-vfx={variant} data-skill-id={skillId} data-target={target} aria-hidden="true">{visual}</div>;
}
