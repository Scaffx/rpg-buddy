import React, { useId, useMemo } from 'react';
import { cn } from '@/lib/utils';

/**
 * LifeonRPG — Mascote animado (pixel art 24x24).
 * Cavaleiro que respira (bob), balança a espada (sway), pisca (blink) e solta glint na lâmina.
 * Replicado fielmente de _design_mascote\project\LifeonRPG Mascote.html
 *
 * Props:
 *  - size: lado do sprite em px (default 32). Continua legível em 24px.
 *  - resting: pausa as animações (postura "descansando").
 *  - className: classes extras no wrapper.
 */

type Props = {
  size?: number;
  resting?: boolean;
  className?: string;
};

const BODY: string[] = [
  '........................',
  '........................',
  '..........HHHH..........',
  '.........HHHHHH.........',
  '........HHHHHHHH........',
  '........HHHHHHHH........',
  '........HSSSSSSH........',
  '........HSSSSSSH........',
  '........SSESSESS........',
  '........SSSSSSSS........',
  '.........SSSSSS.........',
  '..........BBBB..........',
  '........BBBBBBBB........',
  '.......bBBBBBBBBb.......',
  '.......bBBBBBBBBb.......',
  '.......bBBBBBBBBb.......',
  '........GGGGGGGG........',
  '........PPPPPPPP........',
  '........PPP..PPP........',
  '........PPP..PPP........',
  '........OOO..OOO........',
  '.......OOOO..OOOO.......',
  '........................',
  '........................',
];

const ARM: string[] = [
  '........................',
  '........................',
  '......CC................',
  '......Cc................',
  '......Cc................',
  '......Cc................',
  '......Cc................',
  '......Cc................',
  '......Cc................',
  '.....GGGG...............',
  '......GG................',
  '.....SSS................',
  '......SSS...............',
  '.......SS...............',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
];

const PAL: Record<string, string> = {
  H: '#e8c66f', // capacete dourado
  S: '#f4cfa2', // pele
  E: '#2a2440', // olhos
  B: '#5b7fe0', // armadura/tunica azul
  b: '#3f59b5', // sombra armadura
  G: '#e3c06a', // detalhe dourado
  P: '#473d78', // calça roxa
  O: '#241f38', // bota
  C: '#d6f1fc', // lâmina
  c: '#8fd6ee', // sombra lâmina
};

function renderLayer(map: string[], eyeClass: string) {
  const rects: React.ReactElement[] = [];
  for (let y = 0; y < map.length; y++) {
    const row = map[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      const fill = PAL[ch];
      if (!fill) continue;
      rects.push(
        <rect
          key={`${x}-${y}-${ch}`}
          x={x}
          y={y}
          width={1.04}
          height={1.04}
          fill={fill}
          className={ch === 'E' ? eyeClass : undefined}
        />,
      );
    }
  }
  return rects;
}

const MascotStyles: React.FC<{ uid: string; delay: number }> = ({ uid, delay }) => (
  <style>{`
    @keyframes lifeon-mascot-bob-${uid} {
      0%, 100% { transform: translateY(3%); }
      50%      { transform: translateY(-3%); }
    }
    @keyframes lifeon-mascot-sway-${uid} {
      0%   { transform: rotate(2deg); }
      18%  { transform: rotate(-2deg); }
      36%  { transform: rotate(2deg); }
      52%  { transform: rotate(-11deg); }
      60%  { transform: rotate(-13deg); }
      72%  { transform: rotate(1deg); }
      100% { transform: rotate(2deg); }
    }
    @keyframes lifeon-mascot-blink-${uid} {
      0%, 90%, 100% { transform: scaleY(1); }
      95%           { transform: scaleY(0.12); }
    }
    @keyframes lifeon-mascot-glint-${uid} {
      0%, 68%, 100% { opacity: 0; }
      80%           { opacity: 1; }
      92%           { opacity: 0.25; }
    }
    .lifeon-mascot-${uid} {
      display: inline-block;
      line-height: 0;
      animation: lifeon-mascot-bob-${uid} 1.9s ease-in-out infinite;
      animation-delay: ${delay}s;
    }
    .lifeon-mascot-${uid} svg {
      display: block;
      width: 100%;
      height: 100%;
      overflow: visible;
      image-rendering: pixelated;
      shape-rendering: crispEdges;
    }
    .lifeon-mascot-${uid} .arm {
      transform-box: fill-box;
      transform-origin: 92% 90%;
      animation: lifeon-mascot-sway-${uid} 4.6s ease-in-out infinite;
      animation-delay: ${delay}s;
    }
    .lifeon-mascot-${uid} .eye {
      transform-box: fill-box;
      transform-origin: center;
      animation: lifeon-mascot-blink-${uid} 4.2s ease-in-out infinite;
    }
    .lifeon-mascot-${uid} .glint {
      animation: lifeon-mascot-glint-${uid} 3.2s ease-in-out infinite;
    }
    .lifeon-mascot-${uid}.resting,
    .lifeon-mascot-${uid}.resting .arm,
    .lifeon-mascot-${uid}.resting .eye,
    .lifeon-mascot-${uid}.resting .glint {
      animation: none;
    }
    @media (prefers-reduced-motion: reduce) {
      .lifeon-mascot-${uid},
      .lifeon-mascot-${uid} .arm,
      .lifeon-mascot-${uid} .eye,
      .lifeon-mascot-${uid} .glint { animation: none !important; }
    }
  `}</style>
);

export const LifeonRPGMascot: React.FC<Props> = ({ size = 32, resting = false, className }) => {
  // useId garante CSS escopado por instância (sem colidir keyframes em múltiplos mascotes na mesma tela).
  const rawId = useId();
  const uid = useMemo(() => rawId.replace(/[^a-zA-Z0-9_-]/g, ''), [rawId]);
  // Pequeno offset aleatório (estável) para mascotes na mesma tela não respirarem em sincronia.
  const delay = useMemo(() => -(Math.random() * 1.2), []);

  const eyeClass = 'eye';

  return (
    <div
      className={cn(`lifeon-mascot-${uid}`, resting && 'resting', className)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <MascotStyles uid={uid} delay={delay} />
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <g className="body">{renderLayer(BODY, eyeClass)}</g>
        <g className="arm">{renderLayer(ARM, eyeClass)}</g>
        {/* sparkle de plus na ponta da espada */}
        <g className="glint" fill="#ffffff">
          <rect x={6} y={0} width={1} height={1} />
          <rect x={5} y={1} width={3} height={1} />
          <rect x={6} y={2} width={1} height={1} />
        </g>
      </svg>
    </div>
  );
};

export default LifeonRPGMascot;
