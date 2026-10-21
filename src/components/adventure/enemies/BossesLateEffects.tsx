import type { CSSProperties } from 'react';
import { bossesLateAnimations, bossesLateArtwork, type BossesLateMotif } from './bossesLate.data';
import type { EnemyEffectProps } from './types';
import './bossesLate.css';

function LateGlyph({ motif }: { motif: BossesLateMotif }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (motif) {
    case 'claw': return <g {...common}><path d="M9 35 25 10M18 38 33 13M28 40 40 18" /><path d="m21 12 4-5 2 7m4 1 5-4 1 8m1 0 4-1-1 7" /></g>;
    case 'fang': return <g {...common}><path d="M7 14q17-11 34 0l-5 21-8-14-5 17-7-17-6 12z" /><path d="M12 12q12 7 25 0" /></g>;
    case 'breath': return <g {...common}><path d="M5 14q12-8 18 3t20-1M5 24q14-8 22 1t16 0M5 34q12-8 20 1t18-1" /><path d="m30 10 12 6-9 3m-5 1 13 6-8 4m-4 1 12 5-9 3" /></g>;
    case 'cry': return <g {...common}><path d="M7 18q8 6 0 12M13 13q14 11 0 22M20 8q21 17 0 32" /><path d="m27 20 13-7v22l-13-7z" /></g>;
    case 'rune': return <g {...common}><circle cx="24" cy="24" r="19" /><circle cx="24" cy="24" r="13" /><path d="m24 10 7 14-7 14-7-14zM12 24h24M24 12v24" /></g>;
    case 'crystal': return <g {...common}><path d="M24 3 37 18 30 42 17 44 7 22zM24 3l-4 18 10 21M7 22l13-1 17-3M20 21l-3 23" /></g>;
    case 'spiral': return <g {...common}><path d="M25 24q-8-6-9 3-1 9 10 10 15 1 16-15Q43 2 22 4 3 6 4 25q0 18 18 19" /><path d="m7 34-3-9 9 2" /></g>;
    case 'mend': return <g {...common}><path d="M24 5v38M5 24h38M14 9l7 8-8 6-5-9zm19 3 8 8-8 7-7-9zM11 30l9 5-3 9-10-6zm22 0 9 6-9 8-7-9z" /></g>;
    case 'gravity': return <g {...common}><ellipse cx="24" cy="24" rx="19" ry="8" transform="rotate(-35 24 24)" /><ellipse cx="24" cy="24" rx="19" ry="8" transform="rotate(35 24 24)" /><path d="m24 5-5 8h10zm0 38-5-8h10z" /></g>;
    case 'flame': return <g {...common}><path d="M24 44C4 39 9 25 17 17q-1 11 5 11C19 17 27 13 28 4q19 15 11 31-3 7-15 9z" /><path d="M25 42q-8-4-3-13 5 5 7-2 6 10-4 15z" /></g>;
    case 'rebirth': return <g {...common}><path d="M24 41q-7-12-19-10l8-7-8-8q14 1 19 10 6-9 19-10l-8 8 8 7q-12-2-19 10z" /><path d="M24 8v29M18 13l6-8 6 8" /></g>;
    case 'eclipse': return <g {...common}><circle cx="24" cy="24" r="18" /><circle cx="27" cy="21" r="12" fill="var(--bossesLate-dark)" /><path d="M24 1v5M24 42v5M1 24h5m36 0h5M8 8l4 4m24 24 4 4M40 8l-4 4M12 36l-4 4" /></g>;
    case 'burst': return <g {...common}><path d="m24 2 3 15 12-10-6 14 14 3-14 4 6 13-13-9-2 15-4-15-12 9 6-13L1 24l14-3L8 7l12 10z" /></g>;
    case 'ward': return <g {...common}><path d="M24 3 42 11v13q0 14-18 21Q6 38 6 24V11z" /><path d="m24 9 12 6v10q0 8-12 14Q12 33 12 25V15zM12 24h24" /></g>;
    case 'summon': return <g {...common}><path d="M5 39q5-14 12-11t7 11M25 39q5-14 12-11t7 11" /><circle cx="15" cy="18" r="6" /><circle cx="35" cy="18" r="6" /><path d="M9 11 4 5m17 6 5-6m3 6-5-6m17 6 5-6" /></g>;
    case 'spear': return <g {...common}><path d="M4 33 35 16M8 39 39 22M32 15l13-12-5 17-8-5zM8 32l8 9" /></g>;
    case 'raven': return <g {...common}><path d="M3 23q10-15 18-2l4 7q4-17 20-12-10 2-15 18l-8-3Q11 31 3 23z" /><path d="M8 11q9-5 13 5m10-7q8-6 14 1" /><circle cx="24" cy="22" r="1" /></g>;
    case 'hammer': return <g {...common}><path d="m9 6 22-3 4 14-21 5zM25 20l8 24 5-2-9-24M7 27l-4 10 8-4-2 9 12-17" /></g>;
    case 'hex': return <g {...common}><path d="m24 3 5 11 13 1-10 9 4 14-12-7-12 7 4-14-10-9 13-1z" /><path d="M10 11q13 16 28 25M38 11Q24 29 10 36" /></g>;
    case 'tide': return <g {...common}><path d="M2 29q7-17 15 0 7-17 15 0 7-17 14 0M2 37q7-17 15 0 7-17 15 0 7-17 14 0M4 16q5-9 10 0m15-3q6-9 12 0" /></g>;
    case 'quake': return <g {...common}><path d="M2 30h10l5-7 5 8 7-10 6 9h11M19 31l-4 15m10-15 7 13M7 38l-5 7m38-8 6 8" /><path d="m8 20 4-8 4 7m18-5 4-9 4 9" /></g>;
    case 'beam': return <g {...common}><path d="M3 13h18l22 11-22 11H3l22-11z" /><path d="M5 19h19l16 5-16 5H5M6 24h33" /></g>;
    case 'scythe': return <g {...common}><path d="M18 45 33 4M33 4Q8 4 5 24q12-13 27-7M13 42l13 3" /></g>;
    case 'clock': return <g {...common}><circle cx="24" cy="24" r="19" /><path d="M24 7v5m0 24v5M7 24h5m24 0h5M24 13v12l9 6" /><circle cx="24" cy="24" r="2" /></g>;
    case 'shroud': return <g {...common}><path d="M9 42V19Q9 5 24 5t15 14v23l-7-7-8 7-8-7z" /><path d="M15 22q4-4 8 0m2 0q4-4 8 0M19 30h10" /></g>;
    case 'pillar': return <g {...common}><path d="M10 44q-5-8 3-17l3-18q8 10 6 18 10-8 7-23 14 15 5 31l5-6q2 10-4 15zM17 44q-5-10 4-17 1 6 5 8l4-7q5 8 0 16" /></g>;
    case 'duel': return <g {...common}><path d="M6 5 39 41M42 5 9 41M5 5l8 2-6 7m35-9-8 2 6 7M17 31l-7 12m21-12 7 12" /></g>;
    case 'devour': return <g {...common}><path d="M5 9q18-9 38 5L29 27 43 39Q18 51 5 37l18-11z" /><path d="m11 15 6 9 5-12m5 1 4 10 7-6M11 35l6-9 5 12m5-2 4-10 7 6" /></g>;
    case 'pressure': return <g {...common}><ellipse cx="24" cy="24" rx="21" ry="15" /><ellipse cx="24" cy="24" rx="15" ry="10" /><ellipse cx="24" cy="24" rx="8" ry="5" /><path d="m24 3-5 7 10 0zm0 42-5-7 10 0z" /></g>;
    case 'mind': return <g {...common}><path d="M3 24q20-27 42 0Q24 51 3 24z" /><circle cx="24" cy="24" r="9" /><path d="M24 19q-6 3 0 7 5 3 4-3" /></g>;
    case 'dive': return <g {...common}><path d="M24 44 15 23 2 18l17-2L24 3l5 13 17 2-13 5zM24 13v24M8 35l9-8m23 8-9-8" /></g>;
    case 'age': return <g {...common}><path d="M10 4h28M10 44h28M13 5q0 13 11 19Q13 30 13 43m22-38q0 13-11 19 11 6 11 19M17 11h14M19 37h10" /><circle cx="24" cy="29" r="2" /></g>;
    case 'erase': return <g {...common}><path d="M5 8h14v12H5zM27 6h16v13H27zM7 29h14v14H7zM29 28h12v13H29zM19 20l10 9M29 20l-10 9" /><path d="M3 3 45 45" /></g>;
    case 'drain': return <g {...common}><path d="M4 13q20-12 20 11T44 35M4 24q15-9 20 0t20 0M4 35q20 12 20-11T44 13" /><path d="m34 7 10 6-9 5m0 12 9 5-10 6" /></g>;
    case 'core': return <g {...common}><path d="M2 24 17 9l7 12 7-12 15 15-15 15-7-12-7 12z" /><circle cx="24" cy="24" r="7" /><path d="M24 17V3m0 42V31M17 24H4m40 0H31" /></g>;
    case 'reality': return <g {...common}><path d="M5 5h15v15H5zM27 5h16v16H27zM5 27h15v16H5zM28 28h15v15H28zM20 5l7 16m-7 6 8 1M5 20l15 7m7-6-7 6" /><path d="m32 3 11 10m-15 27 15-12" /></g>;
  }
}

export function BossesLateEffect({ animationId, target }: EnemyEffectProps) {
  const animation = bossesLateAnimations.find(({ id }) => id === animationId);
  if (!animation) return null;
  const art = animation.kind === 'attack'
    ? bossesLateArtwork.find(({ enemyKey }) => enemyKey === animation.enemyKey)
    : undefined;

  return (
    <div
      className={`bossesLate-vfx bossesLate-vfx--${animation.motif} bossesLate-vfx--${animation.element}`}
      data-enemy-vfx="late"
      data-enemy-animation={animationId}
      data-target={target}
      style={art ? { '--bossesLate-color': art.accent, '--bossesLate-glow': art.body } as CSSProperties : undefined}
      aria-hidden="true"
    >
      <span className="bossesLate-vfx__prepare"><span /></span>
      <span className="bossesLate-vfx__trail" />
      <span className="bossesLate-vfx__flight">
        <svg viewBox="0 0 48 48" focusable="false"><LateGlyph motif={animation.motif} /></svg>
      </span>
      <span className="bossesLate-vfx__impact">
        <span className="bossesLate-vfx__halo" />
        <svg viewBox="0 0 48 48" focusable="false"><LateGlyph motif={animation.motif} /></svg>
      </span>
    </div>
  );
}
