import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { AdventureEnemySprite, AdventureHeroSprite } from './AdventureSprites';
import { BIOME_LABELS, enemyVisualVariant, type AdventureBiome, type AdventureHeroClass } from '@/lib/adventureVisuals';
import './adventureScene.css';
import { findSkillAnimation } from './skills/registry';
import { AdventureSkillEffect } from './skills/AdventureSkillEffect';
import { findEnemyAnimation, resolveEnemyPresentation } from './enemies/registry';
import { AdventureEnemyEffect } from './enemies/AdventureEnemyEffect';
import { AdventureEnemyPortrait } from './enemies/AdventureEnemyPortrait';
import { enemyActionMotion } from './enemies/enemyMotion';

export type AdventureSceneAction = {
  id: string;
  actor: 'hero' | 'enemy';
  kind?: 'attack' | 'skill';
  skillName?: string | null;
  skillId?: string | null;
  damage?: number | null;
  effect?: 'physical' | 'arcane' | 'fire' | 'ice' | 'lightning' | 'nature' | 'light' | null;
  mpCost?: number | null;
  healing?: number | null;
  rawDamage?: number | null;
  damageMultiplier?: number | null;
  effectNote?: string | null;
  skillType?: string | null;
};

export type AdventureSceneFrame = {
  status: 'exploring' | 'fighting' | 'defeated' | 'victory' | 'transition' | 'draw';
  heroHp?: number | null;
  heroMaxHp?: number | null;
  heroMp?: number | null;
  heroMaxMp?: number | null;
  enemyHp?: number | null;
  enemyMaxHp?: number | null;
  action?: AdventureSceneAction | null;
  animateAction?: boolean;
};

type Props = {
  stage: number;
  biome: AdventureBiome;
  heroClass: AdventureHeroClass;
  heroName: string;
  enemyName: string;
  isBoss: boolean;
  bossId?: string | null;
  frame: AdventureSceneFrame;
  paused: boolean;
  announceActions?: boolean;
};

const ELEMENT_NAMES: Record<NonNullable<AdventureSceneAction['effect']>, string> = {
  physical: 'Físico', arcane: 'Arcano', fire: 'Fogo', ice: 'Gelo',
  lightning: 'Raio', nature: 'Natureza', light: 'Luz',
};

const SKILL_TYPE_NAMES: Record<string, string> = {
  dano: 'Dano', heal: 'Cura', buff: 'Proteção', debuff: 'Vulnerabilidade', cc: 'Controle',
};

function effectDescription(note: string, heroAttack: boolean) {
  if (note === 'heal') return 'Vida recuperada';
  if (note === 'guard') return 'Proteção aplicada ao próximo golpe recebido';
  if (note === 'vulnerable') return 'Alvo recebe mais dano por 2 turnos';
  if (note === 'stunned') return heroAttack ? 'Alvo impedido de atacar no próximo turno' : 'Inimigo impedido de atacar neste turno';
  return note;
}

function ResourceBar({ label, value, max, resource }: { label: string; value?: number | null; max?: number | null; resource: 'HP' | 'MP' }) {
  const known = typeof value === 'number' && Number.isFinite(value) && typeof max === 'number' && Number.isFinite(max) && max >= 0;
  if (!known) return <div className="adventure-resource adventure-resource-unknown"><span className="adventure-resource-name">{label}</span><span>{resource} —</span></div>;
  const width = max === 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  return <div className={`adventure-resource adventure-resource-${resource.toLowerCase()}`} role="meter" aria-label={`${label}: ${value} de ${max} ${resource}`} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
    <span className="adventure-resource-name">{label}</span><span>{value}/{max} {resource}</span>
    <div className="adventure-resource-track" aria-hidden="true"><div style={{ width: `${width}%` }} /></div>
  </div>;
}

function ActionReadout({ action, heroAttack, announce = true }: { action: AdventureSceneAction; heroAttack: boolean; announce?: boolean }) {
  const skill = action.kind === 'skill';
  return <div className="adventure-action-strip" key={action.id} role="status" aria-live={announce ? 'polite' : 'off'}>
    <strong>{skill ? action.skillName || 'Habilidade' : heroAttack ? 'Ataque básico do herói' : 'Ataque básico do inimigo'}</strong>
    <div className="adventure-action-details">
      {skill && action.effect && <span>{ELEMENT_NAMES[action.effect]}</span>}
      {skill && typeof action.mpCost === 'number' && <span>−{action.mpCost} MP</span>}
      {typeof action.damage === 'number' && (action.damage > 0 || !action.healing) && <span>{action.damage} de dano</span>}
      {typeof action.healing === 'number' && action.healing > 0 && <span>+{action.healing} HP curado</span>}
      {typeof action.rawDamage === 'number' && action.rawDamage > 0 && action.damageMultiplier !== 1 && <span>Antes dos efeitos: {action.rawDamage} de dano</span>}
      {typeof action.damageMultiplier === 'number' && action.damageMultiplier !== 1 && action.damageMultiplier > 0 && <span>Dano após efeitos: ×{action.damageMultiplier}</span>}
      {action.skillType && SKILL_TYPE_NAMES[action.skillType] && <span>{SKILL_TYPE_NAMES[action.skillType]}</span>}
      {action.effectNote && <span className="adventure-effect-note">{effectDescription(action.effectNote, heroAttack)}</span>}
    </div>
  </div>;
}

export function AdventureScene({ stage, biome, heroClass, heroName, enemyName, isBoss, bossId, frame, paused, announceActions = true }: Props) {
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
  const blockedEnemy = action?.actor === 'enemy' && (action.effectNote === 'stunned' || action.damageMultiplier === 0);
  const visualAction = frame.animateAction === false || blockedEnemy ? null : action;
  const heroAttack = visualAction?.actor === 'hero';
  const enemyAttack = visualAction?.actor === 'enemy';
  const specific = heroAttack && visualAction?.kind === 'skill' ? findSkillAnimation(visualAction.skillId, heroClass) : null;
  const enemy = resolveEnemyPresentation({ bossId, isBoss, enemyName, biome });
  const enemyAction = enemyAttack ? { kind: visualAction.kind ?? 'attack', skillId: visualAction.skillId, skillName: visualAction.skillName } : null;
  const enemySpecific = enemy && enemyAction ? findEnemyAnimation(enemy.key, enemyAction) : null;
  const defaultStyle = heroAttack ? visualAction?.kind === 'skill' && (heroClass === 'mago' || heroClass === 'clerico') ? 'cast' : heroClass === 'arqueiro' ? 'bow' : 'melee' : enemyAttack ? 'enemy' : 'idle';
  const actionStyle = enemySpecific ? `enemy-${enemySpecific.definition.motion}` : specific?.definition.motion ?? defaultStyle;
  const cast = actionStyle === 'cast' || actionStyle === 'support';
  const bow = actionStyle === 'bow';
  const melee = heroAttack && ['melee', 'slam', 'lunge'].includes(actionStyle);
  const gap = Math.max(80, sceneWidth * .54);
  const diagonal = ((stage % 3) - 1) * 7;
  const heroMotion = heroAttack ? { x: [0, gap * (melee ? .7 : actionStyle === 'support' ? 0 : .08), 0], y: [0, actionStyle === 'slam' ? -18 : actionStyle === 'lunge' ? diagonal - 9 : melee ? diagonal - 5 : -3, 0] }
    : frame.status === 'exploring' ? { x: [0, gap * .25, 0], y: [0, diagonal, 0] }
    : { x: 0, y: 0 };
  const enemyGesture = enemySpecific?.definition.motion;
  const enemyMotion = enemyAttack ? enemyActionMotion(enemyGesture, enemySpecific?.definition.target, gap) : { x: 0, y: 0 };
  const motionClass = still ? 'adventure-still' : '';
  const actionEffect = visualAction?.effect ?? 'physical';
  const projectile = heroAttack && (cast || bow);
  const selfSupport = heroAttack && !visualAction.damage && (
    (typeof visualAction.healing === 'number' && visualAction.healing > 0)
    || visualAction.skillType === 'heal' || visualAction.skillType === 'buff'
  );
  return <div className="adventure-scene-layout">
    <div className="adventure-combat-hud">
      <div className="adventure-combat-hud-hero">
        <ResourceBar label={heroName} value={frame.heroHp} max={frame.heroMaxHp} resource="HP" />
        {frame.heroMaxMp != null && <ResourceBar label="Mana" value={frame.heroMp} max={frame.heroMaxMp} resource="MP" />}
      </div>
      <ResourceBar label={enemyName} value={frame.enemyHp} max={frame.enemyMaxHp} resource="HP" />
    </div>
    <div ref={sceneRef} role="group" aria-label={`Cena da etapa ${stage}: ${heroName} e ${enemyName}`} className={`adventure-scene adventure-biome-${biome} ${motionClass}`} data-biome={biome} data-hero-class={heroClass} data-enemy-key={enemy?.key} data-status={frame.status} data-stage={stage} data-action-style={actionStyle}>
    <div className="adventure-scene-sky" aria-hidden="true"><span className="adventure-sun" /><span className="adventure-cloud cloud-one" /><span className="adventure-cloud cloud-two" /></div>
    <div className="adventure-scene-far" aria-hidden="true" /><div className="adventure-scene-middle" aria-hidden="true" />
    <div className="adventure-scene-ground" aria-hidden="true"><span className="adventure-path" /><span className="adventure-ground-detail detail-one" /><span className="adventure-ground-detail detail-two" /><span className="adventure-ground-detail detail-three" /></div>
    <div className="adventure-scene-top">
      <span className="adventure-stage-badge">Etapa {stage} · {BIOME_LABELS[biome]}</span>
      {isBoss && <span className="adventure-boss-badge">Chefe</span>}
    </div>
    <div className="adventure-scene-fighters">
      <div className="adventure-fighter adventure-fighter-hero">
        <motion.div key={heroAttack ? visualAction.id : 'hero-idle'} className={`adventure-sprite-track ${frame.status === 'exploring' ? 'adventure-exploring' : ''} ${frame.status === 'fighting' ? 'adventure-walking' : ''} ${heroAttack ? `adventure-${actionStyle}` : ''} ${frame.status === 'defeated' ? 'adventure-defeated' : ''}`}
            animate={still ? { x: 0, y: 0 } : heroMotion}
          transition={still ? { duration: 0 } : { duration: heroAttack ? 1.2 : frame.status === 'exploring' ? 4 : 1.5, ease: 'easeInOut', repeat: frame.status === 'exploring' ? Infinity : 0 }}>
          <AdventureHeroSprite heroClass={heroClass} className="adventure-hero-svg" />
        </motion.div>
      </div>
      <div className="adventure-fighter adventure-fighter-enemy">
        <motion.div key={enemyAttack ? visualAction.id : 'enemy-idle'} className={`adventure-sprite-track ${enemyAttack ? `adventure-enemy-attack adventure-${actionStyle}` : ''} ${frame.status === 'defeated' ? 'adventure-enemy-victory' : ''}`}
            animate={still ? { x: 0, y: 0 } : enemyMotion}
          transition={still ? { duration: 0 } : { duration: 1.1, ease: 'easeInOut', repeat: 0 }}>
          {enemy ? <AdventureEnemyPortrait enemyKey={enemy.key} className="adventure-enemy-svg" /> : <AdventureEnemySprite biome={biome} variant={enemyVisualVariant(stage, isBoss)} className="adventure-enemy-svg" />}
        </motion.div>
      </div>
    </div>
    {visualAction && enemySpecific && enemy && enemyAction ? <AdventureEnemyEffect key={visualAction.id} enemyKey={enemy.key} {...enemyAction} /> : visualAction && specific ? <AdventureSkillEffect key={visualAction.id} skillId={visualAction.skillId!} heroClass={heroClass} target={selfSupport ? 'self' : specific.definition.target} /> : visualAction && <div key={visualAction.id} className={`adventure-effect-sequence adventure-effect-${actionEffect} adventure-vfx-${actionEffect} adventure-effect-${actionStyle} ${selfSupport ? 'adventure-effect-self-support' : ''}`} aria-hidden="true">
      {cast && <><span className="adventure-cast-particles" /><span className="adventure-cast-orb" /></>}
      {projectile && !selfSupport && <span className="adventure-projectile" />}
      <span className="adventure-impact" />
    </div>}
    {frame.status === 'transition' && <div className="adventure-transition-banner">Nova etapa</div>}
    {frame.status === 'defeated' && <div className="adventure-transition-banner">Herói derrotado</div>}
    {frame.status === 'victory' && <div className="adventure-transition-banner">Vitória</div>}
    {frame.status === 'draw' && <div className="adventure-transition-banner">Sem vencedor · nova tentativa</div>}
    </div>
    {action && <ActionReadout action={action} heroAttack={action.actor === 'hero'} announce={announceActions} />}
  </div>;
}
