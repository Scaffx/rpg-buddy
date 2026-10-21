import type { CSSProperties } from 'react';
import { bossesLateArtwork, type BossesLateForm } from './bossesLate.data';
import type { EnemySpriteProps } from './types';
import './bossesLate.css';

function Silhouette({ form }: { form: BossesLateForm }) {
  switch (form) {
    case 'sphinx': return <>
      <path className="bossesLate-sprite__body" d="M3 22q1-8 8-9l9 3 5 5-4 4H8zM6 22l-1 6h4l2-5m9 0 1 5h4l-1-8" />
      <path className="bossesLate-sprite__accent" d="M10 14 8 4l7 5 3 7m-6-4 5-9 3 12M19 14l3-8 5 3-2 9" />
      <path className="bossesLate-sprite__body" d="M23 13q3-6 7-3l-1 7 2 3-7 1-3-5z" />
      <path className="bossesLate-sprite__accent" d="M22 10q3-6 7-4l1 4-7 2M3 20q-5-1-1-9" /><circle cx="27" cy="14" r="1" />
    </>;
    case 'dragonGhost': return <>
      <path className="bossesLate-sprite__accent" d="M11 18 4 3l13 7 5-7-2 16M7 20 2 27l8-3" />
      <path className="bossesLate-sprite__body" d="M3 23q6-11 16-10l6 5-4 7H11l-6 4-3-3 5-5" />
      <path className="bossesLate-sprite__body" d="M21 15q3-8 7-5l-2 5 5 5-8 2z" />
      <path className="bossesLate-sprite__accent" d="m24 10 1-5 3 5m0 6 4 3-5 1m-14 5-2 6m8-5 1 5" /><circle cx="27" cy="15" r="1" />
    </>;
    case 'behemoth': return <>
      <path className="bossesLate-sprite__body" d="M2 17 8 12h13l7 6-3 8H5zM5 24l-1 6h5l2-5m10 0 2 5h5l-2-8" />
      <path className="bossesLate-sprite__accent" d="m5 15 3-11 6 10 4-12 5 13 5-7 1 12M9 10l4 4 4-5m5 6 5-4" />
      <path className="bossesLate-sprite__body" d="m24 14 6-2 2 7-6 3" /><circle cx="28" cy="16" r="1" />
    </>;
    case 'serpent': return <>
      <path className="bossesLate-sprite__body" d="M3 25q-1-8 6-8 6 0 5 5-1 4-5 2 1 8 10 4 7-4 2-11-6-7 1-12 5-4 9 2l-3 6-3-3q-3 2 1 7 5 9-3 13Q12 35 5 29z" />
      <path className="bossesLate-sprite__accent" d="M23 7q4-9 8-4m-6 7 5 3-4 1m-16 8 2-2m6 7 2-3" /><circle cx="28" cy="7" r="1" />
    </>;
    case 'phoenix': return <>
      <path className="bossesLate-sprite__accent" d="M15 19Q5 19 1 4l12 8-2-10 10 13Q26 4 32 4l-5 16-9 5M11 24 5 31l9-3 2 4 3-8" />
      <path className="bossesLate-sprite__body" d="M13 13q5-5 10 0l3 12-8 5-7-7z" />
      <path className="bossesLate-sprite__accent" d="m19 12 1-8 3 6 3-3-1 9 5 3-6 2" /><circle cx="23" cy="17" r="1" />
    </>;
    case 'tiamat': return <>
      <path className="bossesLate-sprite__accent" d="M7 23 1 8l10 7 6-10 4 10 8-8-3 17" />
      <path className="bossesLate-sprite__body" d="M3 24q7-10 18-9l6 10-7 3H7zM8 26l-1 5m14-5 2 5" />
      <path className="bossesLate-sprite__body" d="M17 14 13 5l3-3 5 12M21 14l-1-9 4-2 2 12M25 16l3-9 3 1-2 12M13 17 7 8 4 10l4 11M27 19l4-5 1 5" />
      <path className="bossesLate-sprite__accent" d="M14 6h3m5 1h3m4 3h2M6 11h3" />
    </>;
    case 'odin': return <>
      <path className="bossesLate-sprite__body" d="M11 12h10l5 17H6zM9 17 4 27l4 2 5-9m9-3 6 10-4 2-5-9" />
      <path className="bossesLate-sprite__accent" d="M10 12 8 4l8-3 8 3-3 8-5 3zM13 4l3 6 3-6M3 30 27 3l3 1L6 31M2 9l5 3 4-2m14-2 4-4 3 5" />
      <circle cx="18" cy="10" r="1" />
    </>;
    case 'anubis': return <>
      <path className="bossesLate-sprite__body" d="M10 15h12l5 15H6zM11 16 7 26m15-10 6 10" />
      <path className="bossesLate-sprite__body" d="M10 13 9 2l5 6 5-5 3 11-4 3-7-1z" />
      <path className="bossesLate-sprite__accent" d="M18 10q5-2 12 3l-7 3-5-1M3 30 26 5m-2-2 4 4M10 21h14" /><circle cx="19" cy="11" r="1" />
    </>;
    case 'poseidon': return <>
      <path className="bossesLate-sprite__body" d="M11 12h11l3 12-7 3-8-3zM14 25q-9 3-5 6 7 2 12-3l5 2-3-6M10 16 5 25m18-9 6 9" />
      <path className="bossesLate-sprite__accent" d="M11 10 9 5l4 2 3-5 3 5 4-2-2 5M28 30 27 3m-4 5 4-4 4 4M4 29q5-3 10 0m6-2q5-2 10 0" /><circle cx="19" cy="12" r="1" />
    </>;
    case 'bahamut': return <>
      <path className="bossesLate-sprite__accent" d="M13 18 2 2l13 7 8-8-2 18 9-11-3 19" />
      <path className="bossesLate-sprite__body" d="M2 24q9-11 20-9l5 8-8 4H7l-3 4-3-3" />
      <path className="bossesLate-sprite__body" d="M20 15q3-8 9-8l-3 6 6 7-9 2z" />
      <path className="bossesLate-sprite__accent" d="m24 10-1-6 4 4 3-4 1 7m-19 15-1 5m10-5 1 5M25 15h5" /><circle cx="27" cy="15" r="1" />
    </>;
    case 'shinigami': return <>
      <path className="bossesLate-sprite__body" d="M9 10Q8 2 17 2q10 0 9 10l4 18H4z" />
      <path className="bossesLate-sprite__accent" d="M12 11q4-8 10 0l-3 8h-5zM2 30 28 4m0 0q-11-4-18 5 10-4 19 4M13 19l-3 8m10-8 4 8" />
      <path d="M15 13h2m3 0h2" stroke="var(--bossesLate-accent)" strokeWidth="2" />
    </>;
    case 'ifrit': return <>
      <path className="bossesLate-sprite__accent" d="M6 20Q2 11 10 3q-1 9 5 9Q16 5 22 1q0 10 6 14 6 7-1 13l-8 3-10-4z" />
      <path className="bossesLate-sprite__body" d="M10 13h12l4 11-7 5-11-5zM9 17 2 25l4 3 7-6m9-5 8 8-4 3-7-6" />
      <path className="bossesLate-sprite__accent" d="m12 11 3-6 2 6 5-5 1 7M13 29q-7 3-2 3 9 0 9-4" /><circle cx="20" cy="16" r="1" />
    </>;
    case 'valkyrie': return <>
      <path className="bossesLate-sprite__accent" d="M13 19 2 7l10 3-5-8 11 12 10-12-3 10 7-4-7 13" />
      <path className="bossesLate-sprite__body" d="M12 12h12l3 17H8z" />
      <path className="bossesLate-sprite__accent" d="M12 12 10 5l6-3 6 3 3 7M12 7h13M5 30 27 3m-2 0 4 4M15 20l3 8 3-8" /><circle cx="20" cy="11" r="1" />
    </>;
    case 'leviathan': return <>
      <path className="bossesLate-sprite__body" d="M2 26q6-8 11-3 4 4 8 0 4-5-2-9-3-3 0-8 5-6 10-2l1 8 2 4-7 2q7 8-1 13-6 4-12-1-5-4-10 1z" />
      <path className="bossesLate-sprite__accent" d="M4 19q5-6 10 0m-2 7 4-5m5-13 3-8 3 6M28 10l4 3-4 2M3 30q5-5 9 0m8 0q5-5 10 0" /><circle cx="27" cy="9" r="1" />
    </>;
    case 'archlich': return <>
      <path className="bossesLate-sprite__body" d="M10 12h13l5 18H5z" />
      <path className="bossesLate-sprite__accent" d="M10 10 8 5l5 1 4-5 4 5 5-1-2 7M11 10q1-7 11-4l2 8-4 5h-7l-3-4zM15 22v6m4-6v6M4 29 27 4m-2-1 5 2-2 5" />
      <path d="M13 12h3m4 0h3" stroke="var(--bossesLate-accent)" strokeWidth="2" />
    </>;
    case 'lucifer': return <>
      <path className="bossesLate-sprite__accent" d="M13 21 1 5l11 4-5-7 12 13Q27 3 32 3l-5 10 5-1-10 13" />
      <path className="bossesLate-sprite__body" d="M12 13h11l4 17H7zM9 17 3 27m22-10 5 10" />
      <path className="bossesLate-sprite__accent" d="M13 12 12 4l5-3 5 3 2 8-5 3zM21 20l4 8M3 30 29 4" /><circle cx="20" cy="10" r="1" />
    </>;
    case 'chronos': return <>
      <circle className="bossesLate-sprite__accent" cx="17" cy="15" r="13" />
      <path className="bossesLate-sprite__body" d="M12 10h11l4 20H7zM8 17 3 26m21-9 5 9" />
      <path className="bossesLate-sprite__accent" d="M13 9 10 4l6-2 7 3-2 6M17 4v4M5 14h4m9 6 3 4m-6 0 5-5M29 30 28 3" /><circle cx="19" cy="12" r="1" />
    </>;
    case 'void': return <>
      <path className="bossesLate-sprite__accent" d="M15 2 4 8l4 8-6 7 11 7 8-4 7 5 3-11-4-6 2-9-10 3z" />
      <path className="bossesLate-sprite__body" d="M16 8q13-4 12 9 0 9-11 11Q6 25 7 17q0-7 9-9z" />
      <path className="bossesLate-sprite__accent" d="M13 14q5-6 11 0 4 6-4 9-7 2-7-5m-8-1 5 2m18-7-5 4" />
    </>;
    case 'gaia': return <>
      <path className="bossesLate-sprite__body" d="M12 13h11l5 16H6zM8 20 2 27m24-7 5 7" />
      <path className="bossesLate-sprite__accent" d="M15 16 8 11 4 2l10 5 3-6 3 7 10-6-5 10-6 5M16 18l-4 11m9-11 3 11M16 18l1 9 4-9" />
      <circle cx="20" cy="13" r="1" />
    </>;
    case 'ragnarok': return <>
      <path className="bossesLate-sprite__body" d="M8 11h16l6 18H2zM7 17 2 24m23-7 6 7" />
      <path className="bossesLate-sprite__accent" d="M9 10 6 3l8 3 4-5 4 5 8-3-4 9M10 13l5 8 4-8 5 8M3 31 30 3m-2 0 4 4M10 26l4 4m10-4-4 4" /><circle cx="21" cy="12" r="1" />
    </>;
  }
}

export function BossesLateSprite({ enemyKey, className }: EnemySpriteProps) {
  const art = bossesLateArtwork.find(({ enemyKey: key }) => key === enemyKey);
  if (!art) return null;

  return (
    <svg
      viewBox="0 0 32 32"
      className={['bossesLate-sprite', className].filter(Boolean).join(' ')}
      style={{ '--bossesLate-body': art.body, '--bossesLate-accent': art.accent } as CSSProperties}
      data-enemy-key={enemyKey}
      aria-hidden="true"
      focusable="false"
    >
      <g className="bossesLate-sprite__silhouette" stroke="#192332" strokeWidth="1.1" strokeLinejoin="round">
        <Silhouette form={art.form} />
      </g>
    </svg>
  );
}
