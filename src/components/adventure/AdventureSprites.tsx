import type { AdventureBiome } from '@/lib/adventureVisuals';
export { AdventureHeroSprite } from './heroes/AdventureHeroArtwork';

type SpriteProps = { className?: string };

type EnemyShape = { body: string; shadow: string; eye: string; kind: 'beast' | 'flying' | 'armored' | 'serpent' | 'boss' };
const ENEMIES: Record<AdventureBiome, [EnemyShape, EnemyShape, EnemyShape, EnemyShape]> = {
  floresta: [
    { body: '#78ad58', shadow: '#3e7042', eye: '#ffefb5', kind: 'beast' },
    { body: '#a57b58', shadow: '#654734', eye: '#ffe0a1', kind: 'beast' },
    { body: '#7eae91', shadow: '#416f68', eye: '#dbfff1', kind: 'flying' },
    { body: '#517b50', shadow: '#304a38', eye: '#f5d16b', kind: 'boss' },
  ],
  aquatico: [
    { body: '#4aa7b7', shadow: '#245f84', eye: '#f4f1cf', kind: 'serpent' },
    { body: '#7b8ec3', shadow: '#445890', eye: '#d9fffa', kind: 'flying' },
    { body: '#58bdb5', shadow: '#267e8f', eye: '#e5ffb5', kind: 'serpent' },
    { body: '#397b9d', shadow: '#244c7b', eye: '#c9ffec', kind: 'boss' },
  ],
  deserto: [
    { body: '#deb36d', shadow: '#956348', eye: '#fff0c8', kind: 'beast' },
    { body: '#deb36d', shadow: '#956348', eye: '#fff0c8', kind: 'flying' },
    { body: '#deb36d', shadow: '#956348', eye: '#fff0c8', kind: 'armored' },
    { body: '#deb36d', shadow: '#956348', eye: '#fff0c8', kind: 'boss' },
  ],
  gelo: [
    { body: '#b4e0ec', shadow: '#587fa3', eye: '#e3fdff', kind: 'beast' },
    { body: '#b4e0ec', shadow: '#587fa3', eye: '#e3fdff', kind: 'flying' },
    { body: '#b4e0ec', shadow: '#587fa3', eye: '#e3fdff', kind: 'armored' },
    { body: '#b4e0ec', shadow: '#587fa3', eye: '#e3fdff', kind: 'boss' },
  ],
  ruinas: [
    { body: '#afa895', shadow: '#666778', eye: '#dbf4ff', kind: 'armored' },
    { body: '#9f84a5', shadow: '#594d73', eye: '#eacfff', kind: 'flying' },
    { body: '#b9a98e', shadow: '#6c6475', eye: '#eacfff', kind: 'armored' },
    { body: '#847d91', shadow: '#3c3b62', eye: '#f3d5ff', kind: 'boss' },
  ],
  vulcanico: [
    { body: '#dd7851', shadow: '#822f39', eye: '#fff1a0', kind: 'beast' },
    { body: '#bf5860', shadow: '#683143', eye: '#fff0a1', kind: 'flying' },
    { body: '#c3825a', shadow: '#713940', eye: '#fff0a1', kind: 'armored' },
    { body: '#c65343', shadow: '#642333', eye: '#fff2a7', kind: 'boss' },
  ],
};

export function AdventureEnemySprite({ biome, variant, className }: SpriteProps & { biome: AdventureBiome; variant: 0 | 1 | 2 | 3 }) {
  const p = ENEMIES[biome][variant];
  return <svg className={className} viewBox="0 0 32 32" shapeRendering="crispEdges" aria-hidden="true" data-enemy-variant={`${biome}-${variant}`}>
    <g className="adventure-enemy-body">
      {p.kind === 'flying' ? <>
        <rect x="3" y="13" width="9" height="4" fill={p.shadow} /><rect x="5" y="9" width="6" height="4" fill={p.body} />
        <rect x="20" y="13" width="9" height="4" fill={p.shadow} /><rect x="21" y="9" width="6" height="4" fill={p.body} />
        <rect x="11" y="12" width="11" height="12" fill={p.body} /><rect x="13" y="24" width="3" height="4" fill={p.shadow} /><rect x="19" y="24" width="3" height="4" fill={p.shadow} />
      </> : p.kind === 'serpent' ? <>
        <rect x="5" y="21" width="20" height="6" fill={p.shadow} /><rect x="21" y="17" width="6" height="8" fill={p.body} />
        <rect x="9" y="14" width="13" height="10" fill={p.body} /><rect x="6" y="18" width="5" height="6" fill={p.shadow} />
        <rect x="13" y="10" width="8" height="5" fill={p.body} /><rect x="15" y="7" width="5" height="4" fill={p.shadow} />
      </> : <>
        <rect x="10" y="12" width="14" height="15" fill={p.body} /><rect x="10" y="16" width="3" height="11" fill={p.shadow} />
        <rect x="13" y="27" width="4" height="4" fill={p.shadow} /><rect x="20" y="27" width="4" height="4" fill={p.shadow} />
        <rect x="7" y="18" width="4" height="8" fill={p.shadow} /><rect x="24" y="18" width="4" height="8" fill={p.shadow} />
        <rect x="11" y="8" width="12" height="5" fill={p.body} />
        {p.kind === 'beast' && <><rect x="10" y="4" width="4" height="5" fill={p.shadow} /><rect x="21" y="4" width="4" height="5" fill={p.shadow} /></>}
        {p.kind === 'armored' && <><rect x="9" y="5" width="16" height="4" fill={p.shadow} /><rect x="15" y="17" width="6" height="7" fill={p.shadow} /></>}
      </>}
      {p.kind === 'boss' && <>
        <rect x="7" y="8" width="20" height="19" fill={p.body} /><rect x="7" y="8" width="3" height="18" fill={p.shadow} />
        <rect x="5" y="3" width="5" height="9" fill={p.shadow} /><rect x="24" y="3" width="5" height="9" fill={p.shadow} />
        <rect x="3" y="17" width="4" height="10" fill={p.shadow} /><rect x="27" y="17" width="4" height="10" fill={p.shadow} />
        <rect x="10" y="27" width="5" height="5" fill={p.shadow} /><rect x="21" y="27" width="5" height="5" fill={p.shadow} />
      </>}
      <rect x="15" y="14" width="2" height="2" fill={p.eye} /><rect x="21" y="14" width="2" height="2" fill={p.eye} />
      <rect x="17" y="21" width="5" height="2" fill={p.shadow} />
      {biome === 'floresta' && variant === 1 && <><rect x="12" y="21" width="3" height="2" fill="#f5e7c9" /><rect x="23" y="21" width="3" height="2" fill="#f5e7c9" /></>}
      {biome === 'floresta' && variant === 2 && <><rect x="12" y="7" width="2" height="4" fill="#c9f1cf" /><rect x="21" y="7" width="2" height="4" fill="#c9f1cf" /></>}
      {biome === 'aquatico' && variant === 2 && <path d="M12 15 L16 7 L20 15" fill={p.shadow} />}
      {biome === 'ruinas' && variant === 0 && <><rect x="15" y="19" width="2" height="4" fill="#33384e" /><rect x="20" y="19" width="2" height="4" fill="#33384e" /></>}
      {biome === 'ruinas' && variant === 2 && <rect x="14" y="19" width="9" height="4" fill="#777184" />}
      {biome === 'vulcanico' && variant === 2 && <><rect x="14" y="17" width="2" height="7" fill="#ffae58" /><rect x="21" y="20" width="2" height="5" fill="#ffae58" /></>}
    </g>
  </svg>;
}
