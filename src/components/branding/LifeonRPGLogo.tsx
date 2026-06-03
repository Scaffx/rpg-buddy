import React from 'react';
import { cn } from '@/lib/utils';

/**
 * LifeonRPG — emblema "Portal Arcano" (Conceito B).
 * Anel de runas douradas + portal ciano/azul + espada cravada.
 */

export const LIFEON_PALETTE = {
  ink:    'oklch(0.16 0.045 285)',
  ink2:   'oklch(0.21 0.055 287)',
  purple: 'oklch(0.55 0.19 295)',
  blue:   'oklch(0.58 0.16 262)',
  cyan:   'oklch(0.84 0.12 218)',
  gold:   'oklch(0.83 0.12 86)',
  goldD:  'oklch(0.68 0.13 74)',
  parch:  'oklch(0.94 0.018 92)',
} as const;

type Variant = 'full' | 'gold' | 'white';

type EmblemProps = {
  size?: number;
  variant?: Variant;
  uid?: string;
  className?: string;
  ariaLabel?: string;
};

export const LifeonRPGEmblem: React.FC<EmblemProps> = ({
  size = 64,
  variant = 'full',
  uid = 'b',
  className,
  ariaLabel = 'LifeonRPG portal',
}) => {
  const mono = variant !== 'full';
  const lineCol =
    variant === 'gold' ? LIFEON_PALETTE.gold
      : variant === 'white' ? LIFEON_PALETTE.parch
      : LIFEON_PALETTE.gold;
  const swordCol = mono ? lineCol : LIFEON_PALETTE.parch;

  const ticks = Array.from({ length: 24 }, (_, i) => {
    const a = (i / 24) * Math.PI * 2;
    const long = i % 3 === 0;
    const r1 = long ? 58 : 63;
    const r2 = 71;
    return (
      <line
        key={i}
        x1={(100 + r1 * Math.cos(a)).toFixed(2)}
        y1={(100 + r1 * Math.sin(a)).toFixed(2)}
        x2={(100 + r2 * Math.cos(a)).toFixed(2)}
        y2={(100 + r2 * Math.sin(a)).toFixed(2)}
        stroke={lineCol}
        strokeWidth={long ? 3 : 1.4}
        strokeLinecap="round"
        opacity={long ? 0.95 : 0.45}
      />
    );
  });

  const portalId = `${uid}Portal`;

  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      role="img"
      aria-label={ariaLabel}
      className={className}
    >
      <defs>
        <radialGradient id={portalId} cx="50%" cy="44%" r="56%">
          <stop offset="0" stopColor="#dff3fc" />
          <stop offset="0.38" stopColor="#5b7fe0" />
          <stop offset="0.82" stopColor="#2f2a63" />
          <stop offset="1" stopColor="#1d1b2e" />
        </radialGradient>
      </defs>
      {!mono && <circle cx="100" cy="100" r="58" fill={`url(#${portalId})`} />}
      {!mono && (
        <circle cx="100" cy="100" r="58" fill="none" stroke="#7fd6ee" strokeWidth="2" opacity="0.85" />
      )}
      <circle cx="100" cy="100" r="70" fill="none" stroke={lineCol} strokeWidth="3" />
      <circle
        cx="100"
        cy="100"
        r="46"
        fill="none"
        stroke={mono ? lineCol : '#cdeffa'}
        strokeWidth="1.2"
        opacity={mono ? 0.5 : 0.6}
        strokeDasharray="3 7"
      />
      {ticks}
      <g transform="translate(0 4)" stroke={swordCol} strokeLinecap="round" fill="none">
        <line x1="100" y1="29" x2="100" y2="129.5" strokeWidth="6" />
        <line x1="83.5" y1="129.5" x2="116.5" y2="129.5" strokeWidth="6" />
        <line x1="100" y1="129.5" x2="100" y2="173" strokeWidth="6.6" />
        <circle cx="100" cy="179" r="5.7" fill={swordCol} stroke="none" />
      </g>
    </svg>
  );
};

type TileProps = EmblemProps & { light?: boolean };

export const LifeonRPGTile: React.FC<TileProps> = ({ size = 64, light = false, className, ...rest }) => {
  const bg = light
    ? {
        background: 'oklch(0.97 0.008 90)',
        boxShadow:
          'inset 0 0 0 1px oklch(0.5 0.06 285 / 0.18), 0 14px 40px oklch(0.4 0.05 285 / 0.18)',
      }
    : {
        background:
          'radial-gradient(120% 120% at 50% 34%, oklch(0.30 0.12 250) 0%, oklch(0.16 0.045 285) 74%)',
        boxShadow:
          'inset 0 1px 0 oklch(0.6 0.12 290 / 0.4), 0 18px 50px oklch(0.08 0.05 285 / 0.6)',
      };
  return (
    <div
      className={cn('relative grid place-items-center overflow-hidden', className)}
      style={{ width: size, height: size, borderRadius: '22%', ...bg }}
    >
      <LifeonRPGEmblem size={size * 0.86} {...rest} />
      <span
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 'inherit',
          boxShadow: 'inset 0 0 0 1.5px oklch(0.75 0.1 235 / 0.4)',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
};

type WordmarkProps = {
  size?: number;
  light?: boolean;
  tagline?: boolean;
  className?: string;
};

export const LifeonRPGWordmark: React.FC<WordmarkProps> = ({
  size = 1,
  light = true,
  tagline = true,
  className,
}) => {
  const main = light ? LIFEON_PALETTE.parch : LIFEON_PALETTE.ink;
  return (
    <div className={cn('flex flex-col leading-none', className)} style={{ gap: 4 * size }}>
      <span
        style={{
          fontFamily: "'Cinzel', serif",
          fontWeight: 700,
          fontSize: `${22 * size}px`,
          letterSpacing: `${1.5 * size}px`,
          color: main,
          whiteSpace: 'nowrap',
        }}
      >
        Lifeon<span style={{ color: LIFEON_PALETTE.gold }}>RPG</span>
      </span>
      {tagline && (
        <span
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontWeight: 500,
            fontSize: `${8 * size}px`,
            letterSpacing: `${3 * size}px`,
            textTransform: 'uppercase',
            color: LIFEON_PALETTE.cyan,
            opacity: 0.92,
          }}
        >
          Sua rotina é a aventura
        </span>
      )}
    </div>
  );
};

export default LifeonRPGEmblem;
