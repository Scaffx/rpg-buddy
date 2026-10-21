import type { SkillAnimationDefinition, SkillEffectProps } from './types';
import './mago.css';

/** Visuals only: these definitions do not change combat or enable variants. */
// The registry and its component share this single class-owned module by contract.
// eslint-disable-next-line react-refresh/only-export-components
export const magoSkills: SkillAnimationDefinition[] = [
  { id: 'm_dardo', name: 'Dardo Arcano', nodeType: 'skill', element: 'arcane', motion: 'cast', target: 'enemy', description: 'Runa no cajado lança um dardo facetado até uma marca arcana.' },
  { id: 'm_bola_fogo', name: 'Bola de Fogo', nodeType: 'skill', element: 'fire', motion: 'cast', target: 'enemy', description: 'Esfera incandescente deixa uma cauda e se abre em brasas no impacto.' },
  { id: 'm_corrente_raio', name: 'Corrente de Raio', nodeType: 'skill', element: 'lightning', motion: 'cast', target: 'enemy', description: 'Descarga em ziguezague bifurca antes de atingir o alvo.' },
  { id: 'm_estouro', name: 'Estouro Arcano', nodeType: 'skill', element: 'arcane', motion: 'cast', target: 'enemy', description: 'Glifo geométrico concentra energia e expande um anel arcano.' },
  { id: 'm_lanca_gelo', name: 'Lança de Gelo', nodeType: 'skill', element: 'ice', motion: 'cast', target: 'enemy', description: 'Lança cristalina atravessa a cena e se parte em lascas.' },
  { id: 'm_arc_var', name: 'Singularidade Arcana', nodeType: 'variant', element: 'arcane', motion: 'cast', target: 'enemy', description: 'Duas órbitas espiralam para um vórtice arcano que colapsa.' },
  { id: 'm_fogo_var', name: 'Meteoro', nodeType: 'variant', element: 'fire', motion: 'cast', target: 'enemy', description: 'Rocha incandescente desce em diagonal e espalha fragmentos no impacto.' },
  { id: 'm_gelo_var', name: 'Nova Gélida', nodeType: 'variant', element: 'ice', motion: 'cast', target: 'enemy', description: 'Coroa de cristais brota radialmente ao redor de um núcleo gelado.' },
  { id: 'm_raio_var', name: 'Tornado', nodeType: 'variant', element: 'lightning', motion: 'cast', target: 'enemy', description: 'Fitas de vento e arcos elétricos formam uma espiral breve.' },
];

const six = [0, 1, 2, 3, 4, 5];

function renderMagoEffect(skillId: string) {
  switch (skillId) {
    case 'm_dardo':
      return <>
        <span className="vfx-mago__dardo-rune" />
        <span className="vfx-mago__dardo-shot"><i /><i /><i /></span>
        <span className="vfx-mago__dardo-mark" />
      </>;
    case 'm_bola_fogo':
      return <>
        <span className="vfx-mago__fire-orb"><i /><i /></span>
        <span className="vfx-mago__fire-impact"><i />{six.map((index) => <b key={index} />)}</span>
      </>;
    case 'm_corrente_raio':
      return <>
        <svg className="vfx-mago__lightning" viewBox="0 0 100 80" preserveAspectRatio="none" aria-hidden="true">
          <polyline className="vfx-mago__lightning-main" points="0,40 12,31 22,47 36,20 48,37 62,26 73,49 87,34 100,40" />
          <polyline className="vfx-mago__lightning-branch" points="36,20 45,6 57,14 63,2" />
          <polyline className="vfx-mago__lightning-branch" points="73,49 79,70 91,60 95,77" />
        </svg>
        <span className="vfx-mago__lightning-impact"><i /><i /><i /></span>
      </>;
    case 'm_estouro':
      return <>
        <span className="vfx-mago__burst-core"><i /></span>
        <span className="vfx-mago__burst-ring" />
        <span className="vfx-mago__burst-cross"><i /><i /><i /><i /></span>
      </>;
    case 'm_lanca_gelo':
      return <>
        <span className="vfx-mago__ice-lance"><i /></span>
        <span className="vfx-mago__ice-shatter">{six.map((index) => <i key={index} />)}</span>
      </>;
    case 'm_arc_var':
      return <>
        <span className="vfx-mago__singularity-orbit vfx-mago__singularity-orbit--outer" />
        <span className="vfx-mago__singularity-orbit vfx-mago__singularity-orbit--inner" />
        <span className="vfx-mago__singularity-core" />
        <span className="vfx-mago__singularity-collapse" />
      </>;
    case 'm_fogo_var':
      return <>
        <span className="vfx-mago__meteor-trail" />
        <span className="vfx-mago__meteor-rock"><i /></span>
        <span className="vfx-mago__meteor-impact">{six.map((index) => <i key={index} />)}</span>
      </>;
    case 'm_gelo_var':
      return <>
        <span className="vfx-mago__nova-center" />
        <span className="vfx-mago__nova-ring" />
        <span className="vfx-mago__nova-crystals">{six.map((index) => <i key={index} />)}</span>
      </>;
    case 'm_raio_var':
      return <>
        <span className="vfx-mago__tornado-column"><i /><i /><i /></span>
        <span className="vfx-mago__tornado-sparks"><i /><i /><i /></span>
      </>;
    default:
      return null;
  }
}

export function MagoSkillEffect({ skillId, target }: SkillEffectProps) {
  const effect = renderMagoEffect(skillId);
  if (effect === null) return null;

  return <div className={`vfx-mago vfx-mago--${skillId}`} data-skill-vfx="mago" data-skill-id={skillId} data-target={target} aria-hidden="true">
    {effect}
  </div>;
}
