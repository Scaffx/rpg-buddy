import type { AdventureBiome, AdventureHeroClass } from '@/lib/adventureVisuals';

type SpriteProps = { className?: string };

const HERO_PALETTE: Record<AdventureHeroClass, { coat: string; shadow: string; trim: string; weapon: string }> = {
  guerreiro: { coat: '#5b7fe0', shadow: '#3f59b5', trim: '#e8c66f', weapon: '#d6f1fc' },
  mago: { coat: '#885fbc', shadow: '#583c89', trim: '#b8eeff', weapon: '#a7ecff' },
  gatuno: { coat: '#5a6c7c', shadow: '#344453', trim: '#b8d5b0', weapon: '#d6e5ee' },
  arqueiro: { coat: '#558c66', shadow: '#326747', trim: '#dfba75', weapon: '#e8c58d' },
  clerico: { coat: '#e8e1c9', shadow: '#a99cb5', trim: '#edcb68', weapon: '#f6d978' },
  ferreiro: { coat: '#aa654f', shadow: '#72453c', trim: '#e9b96d', weapon: '#cfdae4' },
};

/** Original 24px SVG character, using the mascot's palette and pixel grid. */
export function AdventureHeroSprite({ heroClass, className }: SpriteProps & { heroClass: AdventureHeroClass }) {
  const p = HERO_PALETTE[heroClass];
  return <svg className={className} viewBox="0 0 32 32" shapeRendering="crispEdges" aria-hidden="true">
    <g className="adventure-hero-legs">
      <rect x="11" y="25" width="4" height="4" fill="#473d78" /><rect x="18" y="25" width="4" height="4" fill="#473d78" />
      <rect x="10" y="29" width="6" height="2" fill="#241f38" /><rect x="17" y="29" width="6" height="2" fill="#241f38" />
    </g>
    <g className="adventure-hero-body">
      <rect x="11" y="5" width="11" height="3" fill={heroClass === 'mago' ? p.shadow : '#e8c66f'} />
      <rect x="9" y="8" width="15" height="2" fill={heroClass === 'gatuno' ? p.shadow : p.trim} />
      <rect x="11" y="10" width="11" height="8" fill="#f4cfa2" /><rect x="19" y="12" width="2" height="2" fill="#2a2440" />
      <rect x="10" y="18" width="14" height="8" fill={p.coat} /><rect x="10" y="19" width="3" height="7" fill={p.shadow} />
      <rect x="16" y="18" width="2" height="7" fill={p.trim} /><rect x="8" y="20" width="3" height="5" fill={p.shadow} />
      <rect x="23" y="20" width="3" height="5" fill={p.shadow} /><rect x="9" y="25" width="15" height="2" fill="#473d78" />
      {heroClass === 'mago' && <><rect x="14" y="1" width="6" height="4" fill={p.shadow} /><rect x="11" y="5" width="12" height="2" fill={p.coat} /></>}
      {heroClass === 'gatuno' && <rect x="10" y="10" width="13" height="3" fill={p.shadow} />}
      {heroClass === 'arqueiro' && <><rect x="9" y="8" width="2" height="10" fill={p.shadow} /><rect x="8" y="12" width="3" height="3" fill={p.trim} /></>}
      {heroClass === 'clerico' && <><rect x="13" y="20" width="7" height="2" fill={p.trim} /><rect x="16" y="18" width="2" height="7" fill={p.trim} /></>}
      {heroClass === 'ferreiro' && <><rect x="15" y="19" width="7" height="6" fill="#695149" /><rect x="15" y="24" width="7" height="2" fill={p.trim} /></>}
    </g>
    <g className="adventure-hero-weapon">
      {heroClass === 'guerreiro' && <><rect x="25" y="5" width="2" height="17" fill={p.weapon} /><rect x="24" y="4" width="4" height="2" fill={p.weapon} /><rect x="22" y="20" width="8" height="2" fill={p.trim} /><rect x="25" y="22" width="2" height="5" fill="#795a43" /></>}
      {heroClass === 'mago' && <><rect x="26" y="7" width="2" height="21" fill="#a67b60" /><rect x="24" y="5" width="6" height="5" fill={p.weapon} /><rect x="26" y="3" width="2" height="2" fill="#e9f9ff" /></>}
      {heroClass === 'gatuno' && <><rect x="25" y="14" width="2" height="10" fill={p.weapon} /><rect x="23" y="13" width="5" height="2" fill={p.weapon} /><rect x="24" y="23" width="4" height="2" fill={p.trim} /></>}
      {heroClass === 'arqueiro' && <><path d="M27 7 Q32 16 27 27" fill="none" stroke={p.weapon} strokeWidth="2" /><path d="M27 7 L27 27" stroke="#ecede0" strokeWidth="1" /><rect x="22" y="16" width="8" height="2" fill={p.trim} /></>}
      {heroClass === 'clerico' && <><rect x="25" y="9" width="2" height="19" fill="#b59b77" /><rect x="23" y="8" width="6" height="6" fill={p.weapon} /><rect x="25" y="6" width="2" height="10" fill="#fff1ac" /></>}
      {heroClass === 'ferreiro' && <><rect x="25" y="16" width="2" height="12" fill="#916b4e" /><rect x="22" y="9" width="8" height="8" fill={p.weapon} /><rect x="21" y="10" width="2" height="6" fill="#aab8c4" /></>}
    </g>
  </svg>;
}

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
