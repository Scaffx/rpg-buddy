import type { CSSProperties, ReactNode } from 'react';
import type { EnemySpriteProps } from './types';
import { bossesMiddleVisuals } from './bossesMiddle.data';
import './bossesMiddle.css';

function silhouette(family: string): ReactNode {
  switch (family) {
    case 'hydra': return <>
      <path className="shade" d="M3 27 Q8 21 13 24 L21 27 27 22 30 26 26 30H5Z" />
      <path d="M11 25 Q8 17 10 11 L7 6 12 7 14 12 13 20 M17 26 Q17 17 18 10 L16 5 21 7 22 13 20 24 M22 27 Q26 19 25 12 L24 6 29 8 30 13 26 24" />
      <path className="line" d="M7 12 L12 14 M16 11 L21 12 M25 13 L30 14 M9 23 Q16 21 22 25" />
      <circle className="glow" cx="11" cy="10" r="1" /><circle className="glow" cx="20" cy="10" r="1" /><circle className="glow" cx="28" cy="11" r="1" />
    </>;
    case 'knight': return <>
      <path className="shade" d="M8 29 L10 19 7 14 11 8 14 5 22 7 25 14 22 19 25 29Z" />
      <path d="M11 11 L15 5 22 7 25 12 23 19 19 22 12 18Z M10 20 L8 28 25 28 22 20 19 24 14 23Z" />
      <path className="line" d="M13 13 H23 M14 16 H22 M9 22 L5 27 M23 21 L28 26 M17 5 L19 2" />
      <circle className="glow" cx="20" cy="14" r="1.5" />
    </>;
    case 'wyvern': return <>
      <path className="shade" d="M4 6 L13 12 16 20 22 15 28 18 21 25 11 22Z" />
      <path d="M13 15 Q16 8 23 8 L29 5 26 10 31 13 26 16 22 16 19 22 12 25 7 22Z" />
      <path className="line" d="M12 16 L4 4 7 19 M18 20 L11 29 M24 20 L27 28 M28 13 L31 14" />
      <circle className="glow" cx="26" cy="12" r="1" />
    </>;
    case 'necromancer': return <>
      <path className="shade" d="M9 29 L11 13 7 10 13 5 22 6 26 11 23 15 25 29Z" />
      <path d="M13 7 Q19 3 24 10 L23 18 18 21 12 17Z M11 19 L8 30 H25 L23 19 18 24Z" />
      <path className="line" d="M8 15 L4 27 M4 27 L2 22 M6 24 L9 26 M15 15 H21 M14 28 H25" />
      <circle className="glow" cx="16" cy="14" r="1" /><circle className="glow" cx="21" cy="14" r="1" />
    </>;
    case 'chimera': return <>
      <path className="shade" d="M4 23 L9 17 20 18 26 23 28 29 H8Z" />
      <path d="M8 19 L7 10 11 7 15 10 16 19 M14 19 L15 7 19 5 22 11 21 20 M19 21 Q25 13 27 15 L30 12 29 21 25 24Z" />
      <path className="line" d="M8 10 L5 5 M15 9 L13 4 M21 10 L24 5 M10 25 L8 30 M23 25 L25 30 M27 22 Q31 23 30 29" />
      <circle className="glow" cx="12" cy="12" r="1" /><circle className="glow" cx="20" cy="11" r="1" /><circle className="glow" cx="27" cy="18" r="1" />
    </>;
    case 'elemental': return <>
      <path className="shade" d="M7 24 L5 17 12 13 14 5 20 9 25 4 27 15 30 22 23 29 10 29Z" />
      <path d="M14 9 L20 6 24 13 28 20 21 27 11 25 8 19Z" />
      <path className="line" d="M15 9 L18 17 11 23 M23 12 L19 18 24 26 M6 16 L3 11 M28 18 L31 13" />
      <circle className="glow" cx="19" cy="18" r="3" />
    </>;
    case 'dragon': return <>
      <path className="shade" d="M3 8 L12 12 17 20 22 18 28 22 25 28 13 28 8 21Z" />
      <path d="M11 17 Q13 11 19 12 L24 8 26 10 30 9 28 14 31 16 26 18 24 24 15 25 10 22Z" />
      <path className="line" d="M11 16 L3 5 6 17 M13 26 L10 30 M23 25 L25 30 M25 9 L23 5 M28 15 H31" />
      <circle className="glow" cx="26" cy="14" r="1" />
    </>;
    case 'angel': return <>
      <path className="shade" d="M14 14 Q7 7 2 13 L10 20 13 26 M21 14 Q27 7 31 13 L24 20 22 26" />
      <path d="M12 28 L14 18 13 11 17 8 21 11 22 18 24 28Z" />
      <path className="line" d="M12 6 Q18 3 23 6 M16 13 H20 M4 14 L12 20 M30 14 L23 20 M18 20 V28" />
      <circle className="glow" cx="18" cy="15" r="1.5" />
    </>;
    case 'kraken': return <>
      <path className="shade" d="M7 17 Q7 5 18 4 Q28 6 27 18 L24 22 H9Z" />
      <path d="M8 17 Q12 9 20 8 Q26 10 27 18 L23 24 H11Z" />
      <path className="line" d="M10 22 Q2 21 4 29 M13 23 Q8 26 10 31 M17 23 Q15 27 17 31 M21 23 Q20 27 23 31 M24 22 Q30 23 29 30" />
      <circle className="glow" cx="16" cy="16" r="1.5" /><circle className="glow" cx="23" cy="16" r="1.5" />
    </>;
    case 'emperor': return <>
      <path className="shade" d="M3 14 L14 17 18 22 27 20 29 28 H10Z" />
      <path d="M11 17 Q15 9 22 11 L26 8 30 12 28 17 31 19 27 21 22 27 13 26Z" />
      <path className="line" d="M14 13 L4 5 7 19 M20 11 L18 3 22 7 25 2 27 10 M14 26 L11 30 M24 26 L27 30" />
      <circle className="glow" cx="27" cy="16" r="1" />
    </>;
    case 'lich': return <>
      <path className="shade" d="M8 29 L10 14 7 7 14 3 23 6 26 13 23 17 26 29Z" />
      <path d="M13 7 Q19 2 24 9 L23 17 18 22 11 17Z M11 20 L8 30 H26 L23 20 18 25Z" />
      <path className="line" d="M8 8 L5 4 M24 7 L28 3 M5 15 L4 27 M3 27 L8 27 M17 18 V21 M13 28 H24" />
      <circle className="glow" cx="16" cy="14" r="1.5" /><circle className="glow" cx="22" cy="14" r="1.5" />
    </>;
    case 'wyrm': return <>
      <path className="shade" d="M4 27 Q4 16 11 20 Q12 12 19 17 Q21 8 27 8 L31 12 27 18 Q28 28 19 29Z" />
      <path d="M5 26 Q11 18 16 24 Q20 23 20 17 Q23 11 28 11 L31 14 28 17 25 17 Q25 27 16 27Z" />
      <path className="line" d="M9 18 L8 14 M17 16 L16 11 M24 9 L23 4 M27 8 L30 5 M9 27 L7 31 M26 17 L29 20" />
      <circle className="glow" cx="28" cy="13" r="1" />
    </>;
    case 'demon': return <>
      <path className="shade" d="M7 29 L10 19 7 13 11 8 14 13 20 12 24 7 28 15 25 22 28 29Z" />
      <path d="M11 17 Q15 9 22 13 L27 19 23 26 13 26Z" />
      <path className="line" d="M11 11 L8 3 6 9 M22 12 L27 3 29 9 M10 21 L4 27 M24 22 L30 27 M13 27 L11 31 M23 27 L26 31" />
      <circle className="glow" cx="17" cy="18" r="1.5" /><circle className="glow" cx="23" cy="18" r="1.5" />
    </>;
    case 'golem': return <>
      <path className="shade" d="M7 29 L6 16 11 13 11 7 22 7 24 13 29 16 28 29Z" />
      <path d="M10 15 L12 8 H22 L24 15 22 25 H12Z M5 16 L10 15 11 27 5 27Z M24 15 L29 16 V27 H23Z" />
      <path className="line" d="M12 9 L17 13 22 9 M14 25 L12 31 M21 25 L23 31 M14 17 H20" />
      <circle className="glow" cx="17" cy="19" r="2" />
    </>;
    case 'tree': return <>
      <path className="shade" d="M5 19 L7 9 13 11 15 4 21 8 26 4 27 15 31 21 23 25 20 30 H12 L9 24Z" />
      <path d="M14 27 L13 17 8 11 16 13 19 8 23 15 27 12 22 21 21 28Z" />
      <path className="line" d="M13 23 L5 28 M21 23 L29 29 M15 28 L12 31 M20 28 L23 31 M17 14 L18 25" />
      <circle className="glow" cx="16" cy="18" r="1" /><circle className="glow" cx="22" cy="18" r="1" />
    </>;
    case 'chrononaut': return <>
      <path className="shade" d="M9 29 L10 18 7 12 12 7 22 7 27 12 24 19 25 29Z" />
      <path d="M12 9 Q18 5 23 9 L25 15 22 21 13 21 10 15Z M11 22 L9 29 H25 L23 22Z" />
      <path className="line" d="M5 10 Q17 0 28 10 M5 10 L7 5 M5 10 L10 10 M16 12 V16 L20 18 M13 26 H23" />
      <circle className="glow" cx="18" cy="16" r="1" />
    </>;
    case 'basilisk': return <>
      <path className="shade" d="M3 27 Q7 17 15 20 L20 14 27 12 31 17 27 21 28 28Z" />
      <path d="M6 25 Q12 19 17 22 L21 16 27 14 31 18 28 21 22 21 19 27Z" />
      <path className="line" d="M6 25 L3 17 M13 19 L13 13 M20 15 L19 9 M26 13 L27 7 M10 26 L8 30 M23 23 L25 29" />
      <circle className="glow" cx="28" cy="18" r="1.5" />
    </>;
    case 'wolf': return <>
      <path className="shade" d="M5 26 L9 16 20 16 26 11 31 17 26 24 22 29 H8Z" />
      <path d="M7 24 Q11 18 20 19 L23 11 27 14 29 9 31 19 27 22 22 23 18 27 H8Z" />
      <path className="line" d="M11 25 L9 31 M20 24 L21 31 M8 20 L3 16 M26 21 L31 23 M23 13 L23 7" />
      <circle className="glow" cx="28" cy="18" r="1" />
    </>;
    case 'djinn': return <>
      <path className="shade" d="M12 25 Q6 21 12 18 L10 11 15 7 23 9 26 15 22 21 Q26 26 19 30 L13 28Z" />
      <path d="M13 12 Q18 6 24 12 L25 17 21 21 13 19Z M14 20 Q24 20 22 25 Q19 28 24 29 Q12 31 11 27Z" />
      <path className="line" d="M11 10 L9 5 16 8 M23 9 L27 5 M12 20 L5 17 M23 21 L30 18 M15 27 Q8 29 7 31" />
      <circle className="glow" cx="21" cy="15" r="1" />
    </>;
    case 'titan': return <>
      <path className="shade" d="M4 29 L5 15 10 13 10 6 23 5 26 13 30 15 29 29Z" />
      <path d="M10 15 L11 6 23 6 25 15 22 27 H12Z M4 15 L10 14 11 28 H4Z M25 14 L30 15 V28 H23Z" />
      <path className="line" d="M13 7 L17 13 22 6 M16 14 L13 24 M19 15 L22 24 M11 27 L9 31 M24 27 L26 31" />
      <circle className="glow" cx="18" cy="20" r="2.5" />
    </>;
    default: return null;
  }
}

export function BossesMiddleSprite({ enemyKey, className }: EnemySpriteProps) {
  const visual = bossesMiddleVisuals.get(enemyKey);
  if (!visual) return null;
  return <svg
    viewBox="0 0 32 32"
    className={`bosses-middle-sprite bosses-middle-sprite--${visual.sprite}${className ? ` ${className}` : ''}`}
    style={{ '--bosses-middle-color': visual.color } as CSSProperties}
    data-enemy-key={enemyKey}
    aria-hidden="true" focusable="false"
  ><g className="bosses-middle-sprite__body">{silhouette(visual.sprite)}</g></svg>;
}
