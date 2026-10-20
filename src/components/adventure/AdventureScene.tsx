import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { AdventureEnemySprite, AdventureHeroSprite } from './AdventureSprites';
import { BIOME_LABELS, enemyVisualVariant, type AdventureBiome, type AdventureHeroClass } from '@/lib/adventureVisuals';
import './adventureScene.css';

export type AdventureSceneAction = {
  id: string;
  actor: 'hero' | 'enemy';
  skillName?: string | null;
  damage?: number | null;
  effect?: 'physical' | 'arcane' | 'fire' | 'ice' | 'lightning' | 'nature' | 'light' | null;
};

export type AdventureSceneFrame = {
  status: 'exploring' | 'fighting' | 'defeated' | 'victory' | 'transition';
  heroHp?: number | null;
  heroMaxHp?: number | null;
  enemyHp?: number | null;
  enemyMaxHp?: number | null;
  action?: AdventureSceneAction | null;
};

type Props = {
  stage: number;
  biome: AdventureBiome;
  heroClass: AdventureHeroClass;
  heroName: string;
  enemyName: string;
  isBoss: boolean;
  frame: AdventureSceneFrame;
  paused: boolean;
};

function HpBar({ label, hp, maxHp }: { label: string; hp?: number | null; maxHp?: number | null }) {
  const known = typeof hp === 'number' && Number.isFinite(hp) && typeof maxHp === 'number' && Number.isFinite(maxHp) && maxHp > 0;
  if (!known) return <div className="adventure-hp adventure-hp-unknown"><span>{label}</span><span>HP —</span></div>;
  const current = Math.max(0, Math.min(hp!, maxHp!));
  return <div className="adventure-hp" role="meter" aria-label={`${label}: ${current} de ${maxHp} HP`} aria-valuemin={0} aria-valuemax={maxHp!} aria-valuenow={current}>
    <span>{label}</span><span>{current}/{maxHp}</span>
    <div className="adventure-hp-track" aria-hidden="true"><div style={{ width: `${(current / maxHp!) * 100}%` }} /></div>
  </div>;
}

export function AdventureScene({ stage, biome, heroClass, heroName, enemyName, isBoss, frame, paused }: Props) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const [sceneWidth, setSceneWidth] = useState(320);
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const update = () => setSceneWidth(scene.getBoundingClientRect().width || 320);
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(scene);
    return () => observer.disconnect();
  }, []);
  const reducedMotion = useReducedMotion();
  const still = paused || reducedMotion;
  const action = frame.status === 'fighting' ? frame.action : null;
  const heroAttack = action?.actor === 'hero';
  const enemyAttack = action?.actor === 'enemy';
  const ranged = heroClass === 'mago' || heroClass === 'arqueiro' || heroClass === 'clerico';
  const gap = Math.max(90, sceneWidth * .5 - 42);
  const approach = gap * (ranged ? .16 : .68);
  const strike = gap * (ranged ? .23 : .98);
  const diagonal = ((stage % 3) - 1) * 9;
  const heroMotion = heroAttack ? { x: [approach, strike, approach], y: [diagonal, diagonal - 8, diagonal] }
    : frame.status === 'exploring' ? { x: [0, gap * .32, 0], y: [0, diagonal, 0] }
    : { x: approach, y: diagonal };
  const enemyMotion = enemyAttack ? { x: [0, -gap * .26, 0], y: [0, -5, 0] }
    : { x: 0, y: 0 };
  const motionClass = still ? 'adventure-still' : '';
  const actionEffect = action?.effect ?? 'physical';
  return <><div ref={sceneRef} role="group" aria-label={`Cena da etapa ${stage}: ${heroName} e ${enemyName}`} className={`adventure-scene adventure-biome-${biome} ${motionClass}`} data-biome={biome} data-hero-class={heroClass} data-status={frame.status} data-stage={stage}>
    <div className="adventure-scene-sky" aria-hidden="true"><span className="adventure-sun" /><span className="adventure-cloud cloud-one" /><span className="adventure-cloud cloud-two" /></div>
    <div className="adventure-scene-far" aria-hidden="true" /><div className="adventure-scene-middle" aria-hidden="true" />
    <div className="adventure-scene-ground" aria-hidden="true"><span className="adventure-path" /><span className="adventure-ground-detail detail-one" /><span className="adventure-ground-detail detail-two" /><span className="adventure-ground-detail detail-three" /></div>
    <div className="adventure-scene-top">
      <span className="adventure-stage-badge">Etapa {stage} · {BIOME_LABELS[biome]}</span>
      {isBoss && <span className="adventure-boss-badge">Chefe</span>}
    </div>
    <div className="adventure-scene-fighters">
      <div className="adventure-fighter adventure-fighter-hero">
        <HpBar label={heroName} hp={frame.heroHp} maxHp={frame.heroMaxHp} />
        <motion.div className={`adventure-sprite-track ${frame.status === 'exploring' ? 'adventure-exploring' : ''} ${frame.status === 'fighting' ? 'adventure-walking' : ''} ${heroAttack ? 'adventure-attacking' : ''} ${frame.status === 'defeated' ? 'adventure-defeated' : ''}`}
          animate={still ? undefined : heroMotion}
          transition={still ? { duration: 0 } : { duration: heroAttack ? 1.1 : frame.status === 'exploring' ? 4 : 1.5, ease: 'easeInOut', repeat: heroAttack || frame.status === 'exploring' ? Infinity : 0 }}>
          <AdventureHeroSprite heroClass={heroClass} className="adventure-hero-svg" />
        </motion.div>
      </div>
      <div className="adventure-impact-zone" aria-hidden="true">
        {action && <span key={action.id} className={`adventure-vfx adventure-vfx-${actionEffect} ${enemyAttack ? 'adventure-vfx-reverse' : ''}`} />}
      </div>
      <div className="adventure-fighter adventure-fighter-enemy">
        <HpBar label={enemyName} hp={frame.enemyHp} maxHp={frame.enemyMaxHp} />
        <motion.div className={`adventure-sprite-track ${enemyAttack ? 'adventure-attacking' : ''} ${frame.status === 'defeated' ? 'adventure-enemy-victory' : ''}`}
          animate={still ? undefined : enemyMotion}
          transition={still ? { duration: 0 } : { duration: 1.1, ease: 'easeInOut', repeat: enemyAttack ? Infinity : 0 }}>
          <AdventureEnemySprite biome={biome} variant={enemyVisualVariant(stage, isBoss)} className="adventure-enemy-svg" />
        </motion.div>
      </div>
    </div>
    {action && typeof action.damage === 'number' && action.damage > 0 && <span key={action.id} aria-hidden="true" className={`adventure-damage-float ${heroAttack ? 'target-enemy' : 'target-hero'}`}>−{action.damage}</span>}
    {frame.status === 'transition' && <div className="adventure-transition-banner">Nova etapa</div>}
    {frame.status === 'defeated' && <div className="adventure-transition-banner">Herói derrotado</div>}
    {frame.status === 'victory' && <div className="adventure-transition-banner">Vitória</div>}
  </div>
    {action && <div className="adventure-action-strip" key={action.id}>
      <strong>{action.skillName || (heroAttack ? 'Ataque do herói' : 'Ataque do inimigo')}</strong>
      {typeof action.damage === 'number' && <span>{action.damage} de dano</span>}
    </div>}
  </>;
}
