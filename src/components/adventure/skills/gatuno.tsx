import type { SkillAnimationDefinition, SkillEffectProps } from './types';
import './gatuno.css';

/** Presentation only: these entries never award damage, statuses, or resources. */
export const gatunoSkills: SkillAnimationDefinition[] = [
  { id: 'gt_punhal', name: 'Punhalada', nodeType: 'skill', element: 'physical', motion: 'melee', target: 'enemy', description: 'Punhal prateado avança em linha curta e deixa um corte fino no alvo.' },
  { id: 'gt_furtivo', name: 'Golpe Furtivo', nodeType: 'skill', element: 'physical', motion: 'lunge', target: 'enemy', description: 'Sombra baixa atravessa a linha e revela uma marca angular atrás do alvo.' },
  { id: 'gt_retalhar', name: 'Retalhar', nodeType: 'skill', element: 'physical', motion: 'melee', target: 'enemy', description: 'Lâmina vibra na origem e três cortes estreitos aparecem em sequência no alvo.' },
  { id: 'gt_veneno', name: 'Lâmina Envenenada', nodeType: 'skill', element: 'nature', motion: 'lunge', target: 'enemy', description: 'Gota verde percorre a lâmina e estoura em pequenos respingos no alvo.' },
  { id: 'gt_fur_var', name: 'Assassinato', nodeType: 'variant', element: 'physical', motion: 'lunge', target: 'enemy', description: 'Mira em losango se fecha antes de um traço escuro e um impacto em estrela.' },
  { id: 'gt_sang_var', name: 'Estripar', nodeType: 'variant', element: 'physical', motion: 'melee', target: 'enemy', description: 'Arco largo da lâmina se abre em cortes cruzados e fitas vermelhas.' },
  { id: 'gt_ven_var', name: 'Névoa Tóxica', nodeType: 'variant', element: 'nature', motion: 'cast', target: 'enemy', description: 'Frasco estilizado percorre a cena e se abre em névoa verde baixa.' },
];

function Dagger({ className = '' }: { className?: string }) {
  return (
    <svg className={`vfx-gatuno__dagger ${className}`} viewBox="0 0 88 28" fill="none" aria-hidden="true">
      <path d="M85 14 47 5 40 14l7 9 38-9Z" fill="currentColor" />
      <path d="M47 5 85 14H40" stroke="white" strokeOpacity=".75" strokeWidth="1.5" />
      <path d="M39 4 31 24M33 14H9" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <path d="M11 14 4 9v10l7-5Z" fill="currentColor" />
    </svg>
  );
}

export function GatunoSkillEffect({ skillId, target }: SkillEffectProps) {
  const visual = (() => {
    switch (skillId) {
      case 'gt_punhal':
        return <>
          <span className="vfx-gatuno__formation vfx-gatuno__glint" />
          <span className="vfx-gatuno__flight vfx-gatuno__punhal-flight"><Dagger /></span>
          <span className="vfx-gatuno__impact vfx-gatuno__punhal-cut" />
        </>;
      case 'gt_furtivo':
        return <>
          <span className="vfx-gatuno__formation vfx-gatuno__shadow-fold" />
          <span className="vfx-gatuno__flight vfx-gatuno__shadow-flight"><span className="vfx-gatuno__shadow-tip" /></span>
          <span className="vfx-gatuno__impact vfx-gatuno__furtivo-mark"><span /><span /></span>
        </>;
      case 'gt_retalhar':
        return <>
          <span className="vfx-gatuno__formation vfx-gatuno__blade-rattle"><Dagger /></span>
          <span className="vfx-gatuno__flight vfx-gatuno__retalhar-flight"><span /></span>
          <span className="vfx-gatuno__impact vfx-gatuno__retalhar-cuts"><span /><span /><span /></span>
        </>;
      case 'gt_veneno':
        return <>
          <span className="vfx-gatuno__formation vfx-gatuno__venom-charge"><Dagger /></span>
          <span className="vfx-gatuno__flight vfx-gatuno__venom-flight"><span className="vfx-gatuno__venom-drop" /></span>
          <span className="vfx-gatuno__impact vfx-gatuno__venom-splash"><span /><span /><span /><span /></span>
        </>;
      case 'gt_fur_var':
        return <>
          <span className="vfx-gatuno__formation vfx-gatuno__assassin-aim" />
          <span className="vfx-gatuno__flight vfx-gatuno__assassin-flight"><span /></span>
          <span className="vfx-gatuno__impact vfx-gatuno__assassin-star"><span /><span /></span>
        </>;
      case 'gt_sang_var':
        return <>
          <span className="vfx-gatuno__formation vfx-gatuno__estripar-windup" />
          <span className="vfx-gatuno__flight vfx-gatuno__estripar-flight"><span /></span>
          <span className="vfx-gatuno__impact vfx-gatuno__estripar-cross"><span /><span /><i /><i /></span>
        </>;
      case 'gt_ven_var':
        return <>
          <span className="vfx-gatuno__formation vfx-gatuno__mist-vial" />
          <span className="vfx-gatuno__flight vfx-gatuno__mist-flight"><span /></span>
          <span className="vfx-gatuno__impact vfx-gatuno__mist-cloud"><span /><span /><span /><i /><i /></span>
        </>;
      default:
        return null;
    }
  })();

  if (visual === null) return null;

  return (
    <div
      className={`vfx-gatuno vfx-gatuno--${skillId}${target === 'self' ? ' vfx-gatuno--self' : ''}`}
      data-skill-vfx="gatuno"
      data-skill-id={skillId}
      aria-hidden="true"
    >
      {visual}
    </div>
  );
}
