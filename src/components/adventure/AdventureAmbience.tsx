import type { ReactNode } from 'react';
import type { AdventureBiome } from '@/lib/adventureVisuals';

const MOTES = Array.from({ length: 12 }, (_, index) => ({
  x: 95 + index * 69,
  y: 68 + (index * 43) % 180,
  duration: `${8 + (index % 4) * 1.6}s`,
  delay: `${-index * 1.7}s`,
}));

function motes(kind: 'leaf' | 'snow' | 'ember' | 'dust') {
  return MOTES.slice(0, kind === 'snow' ? 12 : 8).map((mote, index) => <g key={index} transform={`translate(${mote.x} ${kind === 'ember' ? 275 + index % 3 * 12 : mote.y})`}>
    <g className={`realm-mote realm-mote-${kind}`} style={{ animationDuration: mote.duration, animationDelay: mote.delay }}>
      {kind === 'leaf' ? <path d="M-5 2Q-3-7 6-5Q7 4-5 2Z" fill={index % 2 ? '#b3c77b' : '#759b68'} />
        : kind === 'snow' && index % 3 === 0 ? <path d="M-4 0H4M0-4V4M-3-3L3 3M-3 3L3-3" stroke="#f5ffff" strokeWidth="1.5" strokeLinecap="round" />
        : <circle r={kind === 'ember' ? 2.3 : kind === 'snow' ? 2 : 1.7} fill={kind === 'ember' ? '#ffe2a0' : kind === 'snow' ? '#f4ffff' : '#eadcbd'} />}
    </g>
  </g>);
}

const AMBIENCE: Record<AdventureBiome, { kind: string; art: ReactNode }> = {
  floresta: { kind: 'leaves', art: <>{motes('leaf')}<g className="realm-fireflies" fill="#e6edb2"><circle cx="330" cy="247" r="2"/><circle cx="535" cy="219" r="1.8"/><circle cx="670" cy="260" r="2"/></g></> },
  deserto: { kind: 'sand', art: <g fill="none" strokeLinecap="round" stroke="#fff0c3" strokeWidth="2.4">
    {[0, 1, 2, 3].map(index => <g key={index} transform={`translate(${90 + index * 210} ${252 + index % 2 * 38})`}><path className="realm-sand-wisp" style={{ animationDelay: `${-index * 2.1}s` }} d="M0 7Q30-4 70 4T131 3M25 15Q60 7 92 14"/></g>)}
  </g> },
  aquatico: { kind: 'water', art: <g fill="none" stroke="#edf9e4" strokeLinecap="round">
    <path className="realm-wave realm-wave-back" strokeWidth="2.5" d="M95 257q35-5 72 0m156-12q40-4 80 0m149 15q45-5 92 0"/>
    <path className="realm-wave realm-wave-front" strokeWidth="4" d="M0 289Q242 324 449 293T960 302"/>
    <g className="realm-sea-sparkles" strokeWidth="2"><path d="M342 267h6m-3-3v6m223-15h6m-3-3v6m137 12h6"/></g>
  </g> },
  gelo: { kind: 'snow', art: <>{motes('snow')}<path className="realm-frost-wind" d="M178 205q65-12 109-3m246 42q70-15 133-4" fill="none" stroke="#eefbfb" strokeWidth="2" strokeLinecap="round"/></> },
  vulcanico: { kind: 'embers', art: <>
    <g className="realm-smoke" fill="none" stroke="#e7c3b5" strokeWidth="9" strokeLinecap="round"><path d="M391 59q-12-15 1-26t-2-23"/><path d="M411 52q11-12 2-26"/></g>
    <path className="realm-lava-glow" fill="none" stroke="#ffe0a0" strokeWidth="5" strokeLinecap="round" d="M394 103q-16 43 7 61t-8 51M0 361l155-16 123 25m682-35-146 14-44 51"/>
    {motes('ember')}
  </> },
  ruinas: { kind: 'dust', art: <>{motes('dust')}</> },
};

/** Decorative SVG layers only; no combat timers or random state. */
export function AdventureAmbience({ biome }: { biome: AdventureBiome }) {
  const ambience = AMBIENCE[biome];
  return <g className="realm-ambience" data-ambient-kind={ambience.kind}>{ambience.art}</g>;
}
